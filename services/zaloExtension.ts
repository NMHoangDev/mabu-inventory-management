/**
 * Helper gọi Chrome Extension để lấy Zalo cookies + import session.
 *
 * Cách hoạt động (qua Content Script Bridge):
 *   1. Web page gọi: window.postMessage({ __zaloExt: true, type, requestId, data }, "*")
 *   2. content-script-bridge.js (inject trên localhost:3000) nhận,
 *      forward tới background: chrome.runtime.sendMessage(...)
 *   3. Background respond → Bridge postMessage về web với cùng requestId.
 *
 * Extension ID: cách detect tự động qua window.__zaloExtensionAvailable (set bởi bridge).
 */

declare const window: any;

// Extension background service worker needs ABSOLUTE URLs (no concept of "current page").
// For IMPORT_ZALO_SESSION and SYNC_ZALO_DOM_MESSAGES:
//   Extension calls Python backend directly (no Next.js proxy needed).
// NEXT_PUBLIC_ prefix makes this available in both SSR and client bundles.
const BACKEND_URL =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ZALO_BACKEND_URL
    ? process.env.NEXT_PUBLIC_ZALO_BACKEND_URL
    : "http://localhost:8000";
const API_KEY =
  typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ZALO_API_KEY
    ? process.env.NEXT_PUBLIC_ZALO_API_KEY
    : "";

export interface ZaloCookie {
  key: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

export interface ZaloCookiesFromExtension {
  cookies: ZaloCookie[];
  keys: string[];
  user_agent: string;
  imei: string;
  missing: string[];
  is_logged_in: boolean;
}

export interface ImportZaloSessionParams {
  account_id: string;
  user_id?: string;
  owner_id?: string;
  backend_url?: string;
  api_key?: string;
}

export interface ImportZaloSessionResult {
  status: number;
  backend: any;
  cookies_count: number;
  keys: string[];
}

export interface SyncZaloDomMessagesParams {
  account_id: string;
  conversation_id?: string;
  limit?: number;
  conversation_limit?: number;
}

export interface SyncZaloDomMessagesResult {
  status: number;
  backend: {
    ok?: boolean;
    account_id?: string;
    scanned?: number;
    groups_with_messages?: number;
    messages_saved?: number;
    errors?: number;
    results?: Array<{
      group_id: string;
      group_name: string;
      messages_saved: number;
      status: string;
      error?: string | null;
    }>;
    [key: string]: unknown;
  };
  scraped?: {
    conversations_count?: number;
    messages_count?: number;
    active_group_id?: string | null;
    active_group_name?: string | null;
  };
}

export class ZaloExtensionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ZaloExtensionError";
  }
}

function makeExtensionMissingError(): ZaloExtensionError {
  return new ZaloExtensionError(
    "extension_missing",
    "Chưa cài Chrome Extension lấy Zalo cookies. Hãy:\n" +
      "  1. Mở chrome://extensions/\n" +
      "  2. Bật Developer mode\n" +
      "  3. Bấm 'Load unpacked' → chọn thư mục extension-login-zalo\n" +
      "  4. Reload lại trang web này.\n" +
      "Sau đó bấm 'Đăng nhập lại' lần nữa.",
  );
}

/**
 * Ping extension bridge để xác nhận đã cài.
 * Bridge tự set window.__zaloExtensionAvailable = true khi inject xong.
 */
export async function isZaloExtensionAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.__zaloExtensionAvailable === true) {
    return true;
  }
  return new Promise<boolean>((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    const requestId = `ping-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.__zaloExt !== true) return;
      const isPong = data.type === "PONG" && data.requestId === requestId;
      const isBridgeResponse = data.type === "RESPONSE" && data.requestId === requestId;
      if (isPong || isBridgeResponse) {
        window.removeEventListener("message", onMessage);
        window.__zaloExtensionAvailable = true;
        resolve(data.installed === true || data.data?.installed === true || data.success === true);
      }
    };
    window.addEventListener("message", onMessage);
    try {
      window.postMessage(
        { __zaloExt: true, type: "PING", requestId },
        "*",
      );
    } catch (e) {
      window.removeEventListener("message", onMessage);
      resolve(false);
      return;
    }
    setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(false);
    }, 1000);
  });
}

/**
 * Gửi message tới extension qua postMessage bridge, đợi response.
 */
async function sendViaBridge<T = any>(type: string, data?: any, timeoutMs = 30000): Promise<T> {
  if (typeof window === "undefined") {
    throw makeExtensionMissingError();
  }
  if (window.__zaloExtensionAvailable !== true) {
    const ok = await isZaloExtensionAvailable();
    if (!ok) throw makeExtensionMissingError();
  }
  const requestId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<T>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const payload = event.data;
      if (!payload || payload.__zaloExt !== true) return;
      if (payload.type !== "RESPONSE") return;
      if (payload.requestId !== requestId) return;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      if (payload.success) {
        resolve(payload.data as T);
      } else {
        reject(new ZaloExtensionError("extension_error", payload.error || "Extension error"));
      }
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(
        new ZaloExtensionError(
          "timeout",
          `Extension không phản hồi sau ${Math.round(timeoutMs / 1000)}s. Bridge có thể chưa sẵn sàng. Reload trang và thử lại.`,
        ),
      );
    }, timeoutMs);
    try {
      window.postMessage(
        { __zaloExt: true, type, requestId, data: data || {} },
        "*",
      );
    } catch (e) {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      reject(makeExtensionMissingError());
    }
  });
}

/**
 * Lấy cookies Zalo từ extension.
 */
export async function getZaloCookiesFromExtension(): Promise<ZaloCookiesFromExtension> {
  return await sendViaBridge<ZaloCookiesFromExtension>("GET_ZALO_COOKIES", undefined, 20000);
}

/**
 * Kiểm tra user đã login Zalo chưa.
 */
export async function checkZaloLoginViaExtension(): Promise<{
  is_logged_in: boolean;
  cookies_count: number;
  missing: string[];
  keys: string[];
}> {
  return await sendViaBridge("CHECK_ZALO_LOGIN", undefined, 15000);
}

/**
 * Gọi extension import session.
 */
export async function importZaloSessionViaExtension(
  params: ImportZaloSessionParams,
): Promise<ImportZaloSessionResult> {
  return await sendViaBridge<ImportZaloSessionResult>(
    "IMPORT_ZALO_SESSION",
    {
      ...params,
      login_timeout_ms: 120000, // 2 minutes to scan QR code
      // Extension BG worker calls Python backend directly — must be absolute URL
      backend_url: params.backend_url || BACKEND_URL,
      api_key: params.api_key ?? API_KEY,
    },
    130000,
  );
}

/**
 * Đồng bộ tin nhắn đang hiển thị trong Zalo Web DOM qua extension.
 */
export async function syncZaloDomMessagesViaExtension(
  params: SyncZaloDomMessagesParams,
): Promise<SyncZaloDomMessagesResult> {
  return await sendViaBridge<SyncZaloDomMessagesResult>(
    "SYNC_ZALO_DOM_MESSAGES",
    {
      ...params,
      // Extension BG worker calls Python backend directly — must be absolute URL
      backend_url: BACKEND_URL,
      api_key: API_KEY,
    },
    600000,
  );
}
