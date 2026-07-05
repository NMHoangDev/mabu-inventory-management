/**
 * API client cho InvoiceFlow Frontend.
 *
 * - Mọi request trỏ sang backend Python (NEXT_PUBLIC_API_BASE_URL).
 * - Tự wrap fetch: thêm JWT header (nếu có), parse JSON, throw nếu !ok.
 * - Khi AUTH_REQUIRED=false ở BE thì không cần token.
 */

const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL) ||
  "http://localhost:8765";

const TOKEN_KEY = "invoiceflow_access_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Cho multipart uploads — trả về FormData, KHÔNG set Content-Type. */
  formData?: FormData;
  /** Timeout (ms). Mặc định 60s; OCR scan 180s. */
  timeoutMs?: number;
};

async function request<T = unknown>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    signal,
    formData,
    timeoutMs = 60_000,
  } = opts;

  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

  const finalHeaders: Record<string, string> = { ...headers };
  if (!formData && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }
  const token = getAccessToken();
  if (token) finalHeaders["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const finalSignal = signal ?? controller.signal;
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener("abort", onCallerAbort);

  try {
    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: formData
        ? formData
        : body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
      signal: finalSignal,
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const msg =
        (isJson && (payload?.error || payload?.message)) ||
        (typeof payload === "string" ? payload : `HTTP ${res.status}`);
      throw new ApiError(
        String(msg),
        res.status,
        isJson ? payload?.code : undefined,
        isJson ? payload : undefined
      );
    }
    return payload as T;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onCallerAbort);
  }
}

// ─── shortcuts ─────────────────────────────────────────────────────────
export const apiClient = {
  baseURL: API_BASE,
  get: <T = unknown>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  patch: <T = unknown>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  del: <T = unknown>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
  upload: <T = unknown>(path: string, formData: FormData, opts?: Omit<RequestOptions, "method" | "body" | "formData">) =>
    request<T>(path, { ...opts, method: "POST", formData }),
};

export default apiClient;
