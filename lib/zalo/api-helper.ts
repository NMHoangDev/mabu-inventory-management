import crypto from 'node:crypto';
import { getPool, isDatabaseConfigured } from '../db/connection';
import { ensureDatabase } from '../db/migration';

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = process.env.COOKIE_ENCRYPTION_KEY || 'zalo-cookie-mabu-inv-secret-key-32b!'; // 32-byte fallback
const IV_LENGTH = 16;

/**
 * Encrypt a plaintext cookie string using AES-256-CBC
 */
export function encryptCookie(text: string): string {
  if (!text || text.trim() === '') return '';
  try {
    const key = crypto.createHash('sha256').update(SECRET_KEY).digest();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Cookie encryption failed:', error);
    return text;
  }
}

/**
 * Decrypt an encrypted cookie string. Falls back to plaintext if parsing fails or invalid format.
 */
export function decryptCookie(text: string): string {
  if (!text || text.trim() === '') return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return text; // Plaintext format fallback
    
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const key = crypto.createHash('sha256').update(SECRET_KEY).digest();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    // Fail-safe: if decryption fails, return original text
    return text;
  }
}

/**
 * Helper to proxy control commands to the Python Zalo Backend
 * 
 * @param path - Backend path (e.g. /api/all-platform/zalo/...)
 * @param options - Fetch options
 * @param streaming - If true, disables AbortController timeout (for SSE streams)
 */
export async function proxyToBackend(
  path: string,
  options: RequestInit = {},
  streaming = false
): Promise<Response> {
  const backendUrl = process.env.ZALO_BACKEND_URL || 'http://127.0.0.1:8000';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${backendUrl}${cleanPath}`;
  
  // Forward custom headers if present
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Set Uvicorn Zalo API key header
  const apiKey = process.env.ZALO_API_KEY || 'secret_api_key';
  headers.set('X-API-Key', apiKey);
  
  try {
    if (streaming) {
      // SSE mode: no timeout, no AbortController — connection must stay alive indefinitely
      const res = await fetch(url, {
        ...options,
        headers,
        // No signal — allow SSE to run forever until client disconnects
      });
      return res;
    }

    // Normal mode: 60s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return res;
  } catch (error) {
    console.error(`Proxy to Zalo backend (${url}) failed:`, error);
    throw new Error('Zalo Python Service is offline or unreachable.');
  }
}

/**
 * Helper for running queries against the Postgres database pool
 */
export async function queryDb(text: string, params: any[] = []) {
  if (!isDatabaseConfigured) {
    throw new Error('Database is not configured (missing DATABASE_URL)');
  }
  await ensureDatabase();
  const pool = getPool();
  return await pool.query(text, params);
}
