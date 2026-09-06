"use client";

/**
 * Trang chat — vào từ nút "Chat" ở 1 rule cụ thể trong "/" (link kèm
 * ?accountId=<rule.account_id>&threadId=<rule.master_thread_id>) để xem/nhắn
 * tin trực tiếp trong đúng nhóm chính của rule đó, không cần chuyển sang
 * zalo-account-module. accountId cũng đọc được độc lập (fallback
 * DEFAULT_ACCOUNT_ID) nếu ai đó mở /chat trực tiếp không qua nút rule. Điều
 * hướng quay lại "/" giờ nằm ở Sidebar, không cần link riêng trong trang.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ZaloPageContent } from "@/components/chat/ZaloPageContent";

const DEFAULT_ACCOUNT_ID = "shop-owner";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-8rem)] min-h-[600px] items-center justify-center text-sm text-slate-400">Đang tải...</div>}>
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
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] flex-col gap-2">
      {threadName ? (
        <div className="flex items-center justify-end">
          <span className="text-xs text-slate-400">Nhóm: {threadName}</span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ZaloPageContent accountId={accountId} initialThreadId={threadId} />
      </div>
    </div>
  );
}
