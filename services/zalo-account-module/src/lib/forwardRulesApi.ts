import { apiUrl } from "./basePath";
import type { ZaloForwardRule, ZaloForwardLog } from "./types";

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`);
  return data as T;
}

export const forwardRulesApi = {
  async list(accountId: string): Promise<{ rules: ZaloForwardRule[] }> {
    const res = await fetch(apiUrl(`/api/forward-rules?account_id=${encodeURIComponent(accountId)}`), {
      cache: "no-store"
    });
    return readJson(res);
  },
  async create(payload: {
    account_id: string;
    name?: string;
    master_thread_id: string;
    master_thread_name?: string;
    targets: Array<{ target_thread_id: string; target_thread_name?: string }>;
    is_enabled?: boolean;
  }): Promise<{ rule: ZaloForwardRule }> {
    const res = await fetch(apiUrl("/api/forward-rules"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return readJson(res);
  },
  async update(
    ruleId: number,
    payload: {
      name?: string | null;
      is_enabled?: boolean;
      master_thread_id?: string;
      master_thread_name?: string | null;
      targets?: Array<{ target_thread_id: string; target_thread_name?: string }>;
    }
  ): Promise<{ ok: true }> {
    const res = await fetch(apiUrl(`/api/forward-rules/${ruleId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return readJson(res);
  },
  async remove(ruleId: number): Promise<{ ok: true }> {
    const res = await fetch(apiUrl(`/api/forward-rules/${ruleId}`), { method: "DELETE" });
    return readJson(res);
  },
  async logs(ruleId: number, limit = 30): Promise<{ logs: ZaloForwardLog[] }> {
    const res = await fetch(apiUrl(`/api/forward-rules/${ruleId}/logs?limit=${limit}`), { cache: "no-store" });
    return readJson(res);
  }
};
