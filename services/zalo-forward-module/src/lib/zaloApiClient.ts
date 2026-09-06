/**
 * Ported từ lib/zalo-api.ts của app chính — client gọi THẲNG zalo-bridge từ
 * browser (không qua Next.js server), dùng cho phần chat (nhắn tin/nhận tin)
 * mới thêm vào module này. KHÔNG port phần broadcast (ngoài scope module này).
 *
 * BRIDGE_URL đọc từ NEXT_PUBLIC_ZALO_BRIDGE_URL — phải là URL bridge mà TRÌNH
 * DUYỆT gọi thẳng được (khác ZALO_BRIDGE_URL server-side dùng cho các route
 * proxy /api/accounts). Local: http://localhost:3001. Production: qua nginx
 * (vd https://timetech.markeeai.com/zalo-bridge) vì bridge không publish port
 * ra ngoài — xem ALLOWED_ORIGINS ở services/zalo-bridge phải whitelist origin
 * của module này.
 */

const BRIDGE_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ZALO_BRIDGE_URL) ||
  "http://localhost:3001";

export class ZaloApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ZaloApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  formData?: FormData;
  timeoutMs?: number;
  accountId?: string;
};

async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, timeoutMs = 60_000, accountId } = opts;

  const finalHeaders: Record<string, string> = {
    "X-User-ID": accountId || "shop-owner",
  };
  if (!formData && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: formData ? formData : body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const msg =
        (isJson && (payload?.detail || payload?.message || payload?.error)) ||
        (typeof payload === "string" ? payload : `HTTP ${res.status}`);
      throw new ZaloApiError(String(msg), res.status, isJson ? payload?.code : undefined, isJson ? payload : undefined);
    }
    return payload as T;
  } finally {
    clearTimeout(timer);
  }
}

export type ZaloLoginStatus = {
  user_id: string;
  session_id: string | null;
  status: "not_logged_in" | "waiting_scan" | "confirmed" | "session_expired";
  is_logged_in: boolean;
  session_expired: boolean;
  qr_base64?: string | null;
  zalo_id?: string;
  display_name?: string;
  inbox_id?: number | string | null;
};

export type ZaloConversation = {
  conversation_id: string;
  conversation_name: string;
  account_id: string;
  thread_id: string;
  thread_type: "user" | "group";
  message_count: number;
  latest_message_at?: string | null;
  latest_content?: string | null;
  latest_sender_name?: string | null;
  latest_is_self?: boolean;
  has_messages: boolean;
  avatar_url?: string | null;
  unread_count: number;
  last_message_ts?: string | number | null;
};

export type ZaloMessage = {
  message_id: string;
  sender_id?: string | null;
  sender_name?: string | null;
  timestamp?: string | null;
  time_text?: string | null;
  type: string;
  content?: string | null;
  image_urls?: string[];
  is_sent: boolean;
  is_deleted: boolean;
  group_id?: string | null;
};

export const zaloApi = {
  async getLoginStatus(accountId: string): Promise<ZaloLoginStatus> {
    return request<ZaloLoginStatus>(`/api/all-platform/zalo/auth/status?account_id=${encodeURIComponent(accountId)}`, {
      accountId,
    });
  },

  async logout(accountId: string): Promise<{ success: boolean }> {
    return request(`/auth/logout/${encodeURIComponent(accountId)}`, { method: "DELETE", accountId });
  },

  async reconnect(accountId: string): Promise<{
    ok: boolean;
    before: string | null;
    after: string | null;
    is_logged_in: boolean;
    is_ws_connected: boolean;
    error?: string;
  }> {
    return request("/api/all-platform/zalo/auth/reconnect", { method: "POST", body: { account_id: accountId }, accountId });
  },

  async getConversations(limit: number, accountId: string): Promise<{ account_id: string; conversations: ZaloConversation[]; total: number }> {
    return request(`/api/all-platform/zalo/conversations?account_id=${encodeURIComponent(accountId)}&limit=${limit}`, { accountId });
  },

  async syncConversations(accountId: string): Promise<{ account_id: string; groups_count: number; friends_count: number; total: number }> {
    return request(`/api/all-platform/zalo/conversations/sync?account_id=${encodeURIComponent(accountId)}`, {
      method: "POST",
      accountId,
    });
  },

  async getGroupInfo(groupId: string, accountId: string): Promise<{ ok: boolean; thread_id: string; thread_type: "group"; group_name: string; avatar_url: string | null } | null> {
    if (!groupId) return null;
    try {
      const data = await request<{ ok: boolean; thread_id: string; thread_type: "group"; group_name: string; avatar_url: string | null }>(
        `/api/all-platform/zalo/group-info?account_id=${encodeURIComponent(accountId)}&group_id=${encodeURIComponent(groupId)}`,
        { timeoutMs: 10_000, accountId }
      );
      return data && data.ok ? data : null;
    } catch {
      return null;
    }
  },

  async getUserInfo(userId: string, accountId: string): Promise<{ ok: boolean; thread_id: string; thread_type: "user"; user_name: string; avatar_url: string | null } | null> {
    if (!userId) return null;
    try {
      const data = await request<{ ok: boolean; thread_id: string; thread_type: "user"; user_name: string; avatar_url: string | null }>(
        `/api/all-platform/zalo/user-info?account_id=${encodeURIComponent(accountId)}&user_id=${encodeURIComponent(userId)}`,
        { timeoutMs: 10_000, accountId }
      );
      return data && data.ok ? data : null;
    } catch {
      return null;
    }
  },

  async syncMessages(): Promise<{ synced: number }> {
    // Bridge không có route /sync-messages riêng — no-op, giữ để giữ đúng
    // signature gọi từ hook (matching hành vi bản gốc).
    return { synced: 0 };
  },

  async sendMessage(conversationId: string, text: string, threadType: "user" | "group", accountId: string): Promise<{ ok: boolean; conversation_id: string; message: string }> {
    return request(
      `/api/all-platform/zalo/conversations/${encodeURIComponent(conversationId)}/send?account_id=${encodeURIComponent(accountId)}`,
      { method: "POST", body: { text, thread_type: threadType }, accountId }
    );
  },

  async sendMedia(conversationId: string, files: File[], text: string | undefined, threadType: "user" | "group", accountId: string): Promise<{ ok: boolean; files_sent: number; message: string }> {
    const fd = new FormData();
    if (text) fd.append("text", text);
    fd.append("thread_type", threadType);
    files.forEach((f) => fd.append("files", f, f.name));
    return request(
      `/api/all-platform/zalo/conversations/${encodeURIComponent(conversationId)}/send-media?account_id=${encodeURIComponent(accountId)}`,
      { method: "POST", formData: fd, timeoutMs: 120_000, accountId }
    );
  },

  async markRead(conversationId: string, accountId: string): Promise<{ ok: boolean }> {
    return request(
      `/api/all-platform/zalo/conversations/${encodeURIComponent(conversationId)}/read?account_id=${encodeURIComponent(accountId)}`,
      { method: "POST", accountId }
    );
  },

  openEventSource(accountId: string): EventSource {
    const url = `${BRIDGE_URL}/api/all-platform/zalo/events?account_id=${encodeURIComponent(accountId)}`;
    return new EventSource(url, { withCredentials: false });
  },
};
