import { NextRequest, NextResponse } from 'next/server';
import { queryDb, proxyToBackend } from '@/lib/zalo/api-helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// SSE paths that must be streamed directly without buffering
const SSE_SUBPATHS = ['events/stream', 'auth/events', 'job-events', 'realtime'];

function isSSERequest(request: NextRequest, targetSubPath: string): boolean {
  // Check Accept header sent by EventSource browser API
  if (request.headers.get('accept')?.includes('text/event-stream')) return true;
  // Check known SSE endpoint paths
  return SSE_SUBPATHS.some(p => targetSubPath.includes(p));
}

// Helper to extract body from incoming request
async function getRequestBody(request: NextRequest): Promise<any> {
  const contentType = request.headers.get('content-type') || '';
  if (!request.body) return undefined;
  
  try {
    if (contentType.includes('application/json')) {
      const data = await request.json();
      return JSON.stringify(data);
    } else if (contentType.includes('multipart/form-data')) {
      return await request.formData();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      return await request.text();
    }
    return await request.text();
  } catch (error) {
    console.error('Failed to parse request body:', error);
    return undefined;
  }
}

// Forward response from python backend
async function handleProxy(request: NextRequest, targetSubPath: string, method: string) {
  const streaming = isSSERequest(request, targetSubPath);

  try {
    const url = new URL(request.url);
    const backendPath = `/api/all-platform/zalo/${targetSubPath}${url.search}`;
    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? await getRequestBody(request) : undefined;
    
    // Copy headers from original request
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      // Don't copy host/content-length to prevent connection issues
      if (!['host', 'content-length', 'connection'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    const backendRes = await proxyToBackend(backendPath, { method, headers, body }, streaming);

    // ── SSE path: stream body directly without buffering ──────────────────────
    if (streaming && backendRes.body) {
      return new NextResponse(backendRes.body, {
        status: backendRes.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',  // Disable nginx / proxy buffering
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // ── Normal path: buffer and return JSON or text ───────────────────────────
    if (backendRes.headers.get('content-type')?.includes('application/json')) {
      const data = await backendRes.json();
      return NextResponse.json(data, { status: backendRes.status });
    } else {
      const text = await backendRes.text();
      return new NextResponse(text, {
        status: backendRes.status,
        headers: {
          'Content-Type': backendRes.headers.get('content-type') || 'text/plain'
        }
      });
    }
  } catch (error) {
    if (streaming) {
      // For SSE errors, return a properly formatted SSE error event
      const errMsg = error instanceof Error ? error.message : 'Zalo Python Service is offline.';
      return new NextResponse(
        `event: error\ndata: ${JSON.stringify({ detail: errMsg })}\n\n`,
        {
          status: 200, // Keep 200 so EventSource doesn't immediately retry
          headers: { 'Content-Type': 'text/event-stream' }
        }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Zalo Python Service is offline or returned an error.' },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  // Safe resolution of params.path
  const resolvedParams = await params;
  const path = resolvedParams.path;
  const fullPath = path.join('/');

  try {
    // 1. Intercept GET conversations (Database query directly)
    if (fullPath === 'conversations') {
      const url = new URL(request.url);
      const accountId = url.searchParams.get('account_id') || 'default';
      const callerEmail = url.searchParams.get('email') || '';
      
      const res = await queryDb('SELECT * FROM public.fn_get_zalo_conversations($1, $2)', [accountId, callerEmail]);
      return NextResponse.json({ conversations: res.rows });
    }

    // 2. Intercept GET messages (Database query directly)
    // path pattern: conversations/[conversationId]/messages
    if (path[0] === 'conversations' && path[2] === 'messages' && path.length === 3) {
      const conversationId = path[1];
      const url = new URL(request.url);
      const accountId = url.searchParams.get('account_id') || 'default';
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      
      const res = await queryDb('SELECT * FROM public.fn_get_zalo_conversation_messages($1, $2, $3, $4)', [
        accountId,
        conversationId,
        limit,
        offset
      ]);
      
      const row = res.rows[0] || { messages_json: [], total_count: 0, has_more: false };
      return NextResponse.json({
        messages: row.messages_json || [],
        total: row.total_count || 0,
        has_more: Boolean(row.has_more)
      });
    }

    // 3. Health check route
    if (fullPath === 'health') {
      try {
        const backendRes = await proxyToBackend('/api/all-platform/zalo/auth/current-status', { method: 'GET' });
        if (backendRes.ok) {
          const details = await backendRes.json();
          return NextResponse.json({ status: 'online', details });
        }
        return NextResponse.json({ status: 'error', message: `Backend returned ${backendRes.status}` }, { status: 502 });
      } catch (error) {
        return NextResponse.json({ 
          status: 'offline', 
          error: error instanceof Error ? error.message : String(error),
          message: 'Dịch vụ Zalo Python Crawler chưa hoạt động hoặc cổng cấu hình không chính xác.' 
        });
      }
    }

    // 4. Default: Proxy GET request (auto-detects SSE via isSSERequest)
    return await handleProxy(request, fullPath, 'GET');
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Zalo API Route Handler GET error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const fullPath = resolvedParams.path.join('/');
  return await handleProxy(request, fullPath, 'POST');
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const fullPath = resolvedParams.path.join('/');
  return await handleProxy(request, fullPath, 'PATCH');
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const fullPath = resolvedParams.path.join('/');
  return await handleProxy(request, fullPath, 'DELETE');
}
