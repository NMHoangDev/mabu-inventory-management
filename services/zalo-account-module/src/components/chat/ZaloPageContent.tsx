"use client";

/**
 * Ported từ components/zalo/chat/ZaloPageContent.tsx (app chính) — bỏ toàn bộ
 * broadcast (banner progress + modal + nút "Broadcast" ở ZaloConversationList)
 * vì ngoài scope module này (chỉ nhắn tin/nhận tin 1:1).
 */

import { Loader2, Radio, X } from "lucide-react";
import { useZalo } from "@/hooks/useZalo";
import { ZaloAuthCard } from "./ZaloAuthCard";
import { ZaloChatPanel } from "./ZaloChatPanel";
import { ZaloConversationList } from "./ZaloConversationList";

export function ZaloPageContent({ accountId }: { accountId: string }) {
  const z = useZalo(accountId);

  const currentConv = z.conversations.find((c) => c.conversation_id === z.openConvId) || null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ZaloAuthCard
        status={z.loginStatus}
        loading={z.authLoading}
        error={z.authError}
        onImport={z.importFromExtension}
        onLogout={z.logout}
        onRefresh={z.refreshAuth}
        onReconnect={z.reconnectBridge}
        reconnecting={z.reconnecting}
      />

      {z.sseState !== "closed" && z.sseState !== "open" ? (
        <div className="mb-1.5 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-amber-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            {z.sseState === "connecting" ? "Đang kết nối realtime..." : "Realtime đang reconnect..."}
          </span>
        </div>
      ) : z.sseState === "open" ? (
        <div className="mb-1.5 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm">
          <span className="inline-flex items-center gap-1.5 text-emerald-600">
            <Radio className="h-3 w-3 animate-pulse" />
            Realtime đang bật — sẽ tự đồng bộ khi có tin nhắn mới
          </span>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-3">
        <div className="hidden min-h-0 lg:block">
          <ZaloConversationList conversations={z.conversations} loading={z.loadingConvs} openConvId={z.openConvId} onOpen={z.openConversation} onSync={z.syncConversations} />
        </div>

        <div className="min-h-0">
          <ZaloChatPanel
            conv={currentConv}
            messages={z.messages}
            loading={z.loadingChat}
            sending={z.sending}
            replyText={z.replyText}
            setReplyText={z.setReplyText}
            pendingFiles={z.pendingFiles}
            setPendingFiles={z.setPendingFiles}
            onSend={z.sendCurrentMessage}
            onSync={z.syncCurrentChat}
          />
        </div>
      </div>

      <div className="block min-h-[300px] lg:hidden">
        <ZaloConversationList conversations={z.conversations} loading={z.loadingConvs} openConvId={z.openConvId} onOpen={z.openConversation} onSync={z.syncConversations} />
      </div>

      {z.toast && (
        <div className={`fixed bottom-4 right-4 z-[60] flex max-w-sm items-start gap-2 rounded-lg px-4 py-3 text-xs font-semibold text-white shadow-lg ${z.toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
          <span className="flex-1">{z.toast.msg}</span>
          <button onClick={() => z.showToast("", true)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
