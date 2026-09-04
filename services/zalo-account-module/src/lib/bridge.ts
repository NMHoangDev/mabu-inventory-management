/**
 * Helper gọi services/zalo-bridge. Module này KHÔNG đụng vào live Zalo
 * WebSocket session — chỉ gọi các endpoint quản lý metadata account của
 * bridge (`/auth/accounts*`, `/auth/reconnect`).
 */

export const BRIDGE_URL = (process.env.ZALO_BRIDGE_URL || "http://localhost:3001").replace(
  /\/+$/,
  ""
);

/**
 * fetch wrapper thêm header `x-api-key` khi có BRIDGE_API_KEY, giống cách
 * app/api/zalo/accounts/route.ts của app chính làm.
 */
export async function bridgeFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${BRIDGE_URL}${path}`;
  const apiKey = process.env.BRIDGE_API_KEY || "";
  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...(init?.headers ?? {})
    }
  });
}
