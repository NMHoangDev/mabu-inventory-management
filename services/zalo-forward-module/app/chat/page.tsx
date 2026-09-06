"use client";

/**
 * Trang chat — mới thêm (2026-09-06), vào từ nút "Chat" ở 1 rule cụ thể trong
 * "/" (link kèm ?accountId=<rule.account_id>&threadId=<rule.master_thread_id>)
 * để xem/nhắn tin trực tiếp trong đúng nhóm chính của rule đó, không cần
 * chuyển sang zalo-account-module. accountId cũng đọc được độc lập (fallback
 * DEFAULT_ACCOUNT_ID) nếu ai đó mở /chat trực tiếp không qua nút rule.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ZaloPageContent } from "@/components/chat/ZaloPageContent";

const DEFAULT_ACCOUNT_ID = "shop-owner";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-4rem)] items-center justify-center text-sm text-slate-400">Đang tải...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId") || DEFAULT_ACCOUNT_ID;
  const threadId = searchParams.get("threadId") || undefined;
  const [threadName, setThreadName] = useState<string | null>(searchParams.get("threadName"));

  useEffect(() => {
    setThreadName(searchParams.get("threadName"));
  }, [searchParams]);

  return (
    <div className="flex h-screen min-h-0 flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600">
          <ArrowLeft className="h-4 w-4" /> Chuyển tiếp tin nhắn
        </Link>
        {threadName ? <span className="text-xs text-slate-400">Nhóm: {threadName}</span> : null}
      </div>
      <div className="min-h-0 flex-1">
        <ZaloPageContent accountId={accountId} initialThreadId={threadId} />
      </div>
    </div>
  );
}
