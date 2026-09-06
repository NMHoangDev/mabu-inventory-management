"use client";

/**
 * Trang nhắn tin/nhận tin — mới thêm (2026-09-06). Chọn account qua dropdown
 * cục bộ + localStorage (module này không có AppProvider multi-account như
 * app chính), giống pattern AccountPicker của zalo-forward-module. KHÔNG có
 * broadcast/chuyển tiếp — 2 tính năng đó không thuộc module này.
 *
 * ?accountId=<id> trên URL (từ nút "Chat" ở từng dòng tài khoản trong bảng ở
 * "/") CHỌN ĐÚNG tài khoản đó ngay khi vào trang — ưu tiên cao nhất, cao hơn
 * cả localStorage — để phân biệt rõ ràng đang chat với tài khoản nào, không
 * lẫn với tài khoản trước đó đang mở trên máy này. useZalo() tự reset toàn bộ
 * state (conversations/messages/SSE) khi accountId đổi, và SSE mở kết nối
 * RIÊNG theo account_id (bridge route theo header X-User-ID) nên xem/chat 1
 * tài khoản không ảnh hưởng tới WS session của các tài khoản khác đang login.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiUrl } from "@/lib/basePath";
import type { ZaloAccountSummary } from "@/lib/types";
import { ZaloPageContent } from "@/components/chat/ZaloPageContent";

const DEFAULT_ACCOUNT_ID = "shop-owner";
const LAST_ACCOUNT_KEY = "zalo-account-module:chat:last-account-id";

function AccountPicker({ accountId, onChange }: { accountId: string; onChange: (id: string) => void }) {
  const [accounts, setAccounts] = useState<ZaloAccountSummary[]>([]);

  useEffect(() => {
    fetch(apiUrl("/api/accounts"), { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setAccounts(Array.isArray(data?.accounts) ? data.accounts : []))
      .catch(() => setAccounts([]));
  }, []);

  if (accounts.length === 0) {
    return <span className="text-xs text-slate-400">Tài khoản: {accountId}</span>;
  }

  return (
    <select value={accountId} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700">
      {accounts.map((a) => (
        <option key={a.account_id} value={a.account_id}>
          {a.display_name || a.account_id}
        </option>
      ))}
    </select>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-8rem)] min-h-[600px] items-center justify-center text-sm text-slate-400">Đang tải...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const urlAccountId = searchParams.get("accountId");
  const [accountId, setAccountId] = useState(() => urlAccountId || DEFAULT_ACCOUNT_ID);

  useEffect(() => {
    if (urlAccountId) {
      // Đến từ nút "Chat" ở 1 dòng tài khoản cụ thể — ưu tiên tuyệt đối, ghi
      // đè luôn localStorage để lần sau vào /chat (không kèm query) vẫn nhớ
      // đúng tài khoản này.
      setAccountId(urlAccountId);
      if (typeof window !== "undefined") window.localStorage.setItem(LAST_ACCOUNT_KEY, urlAccountId);
      return;
    }
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LAST_ACCOUNT_KEY) : null;
    if (saved) setAccountId(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlAccountId]);

  function handleAccountChange(id: string) {
    setAccountId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(LAST_ACCOUNT_KEY, id);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] flex-col gap-2">
      <div className="flex items-center justify-end">
        <AccountPicker accountId={accountId} onChange={handleAccountChange} />
      </div>
      <div className="min-h-0 flex-1">
        <ZaloPageContent accountId={accountId} />
      </div>
    </div>
  );
}
