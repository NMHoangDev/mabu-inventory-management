"use client";

/**
 * Ported từ components/zalo/chat/ZaloConversationList.tsx (app chính) — bỏ
 * nút "Broadcast" (ngoài scope module này) và nút "Chuyển tiếp" (thuộc
 * zalo-forward-module riêng, module này không có trang /forward-rules).
 */

import { AlertTriangle, Loader2, MessageSquare, RefreshCcw, Search, Send, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ZaloConversation, ZaloStrangerUser, zaloApi } from "@/lib/zaloApiClient";
import { Avatar } from "./Avatar";

interface Props {
  conversations: ZaloConversation[];
  loading: boolean;
  openConvId: string | null;
  onOpen: (id: string) => void;
  onSync: () => void;
  accountId: string;
  /**
   * Gọi sau khi đã gửi "Hi" thành công cho người lạ — parent mở hội thoại đó.
   * Truyền kèm tên + avatar đã tra được: getUserInfo() KHÔNG resolve được người
   * chưa kết bạn, thiếu 2 giá trị này thì tên hội thoại rơi về "Zalo <uid>".
   */
  onStrangerMessaged: (conversationId: string, known: { name: string; avatar: string | null }) => void;
}

/**
 * Chuỗi nhập có "trông giống" số điện thoại VN không. Chỉ khi giống mới đi tra
 * server, để gõ tên hội thoại bình thường không tạo request rác.
 */
function asPhoneNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 12) return null;
  // Loại chuỗi có ký tự chữ (đang tìm theo tên, không phải số).
  if (/[a-zA-ZÀ-ỹ]/.test(raw)) return null;
  return digits;
}

function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return "";
  const now = Date.now();
  const diff = (now - t) / 1000;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày`;
  return new Date(dateStr).toLocaleDateString("vi-VN");
}

export function ZaloConversationList({
  conversations,
  loading,
  openConvId,
  onOpen,
  onSync,
  accountId,
  onStrangerMessaged
}: Props) {
  const [query, setQuery] = useState("");
  const [stranger, setStranger] = useState<ZaloStrangerUser | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "not_found" | "error">("idle");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.conversation_name || "").toLowerCase().includes(q));
  }, [conversations, query]);

  // Gõ/paste số điện thoại → tra người dùng Zalo (kể cả chưa kết bạn).
  // Debounce 500ms để paste xong mới gọi, không gọi theo từng ký tự.
  const phone = asPhoneNumber(query);
  useEffect(() => {
    if (!phone) {
      setStranger(null);
      setLookupState("idle");
      setLookupError(null);
      return;
    }
    let cancelled = false;
    setLookupState("loading");
    setLookupError(null);
    const timer = setTimeout(async () => {
      try {
        const user = await zaloApi.findUserByPhone(phone, accountId);
        if (cancelled) return;
        setStranger(user);
        setLookupState(user ? "idle" : "not_found");
      } catch (e) {
        if (cancelled) return;
        setStranger(null);
        setLookupState("error");
        setLookupError(e instanceof Error ? e.message : "Không tra được số này");
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, accountId]);

  async function handleSendHi(user: ZaloStrangerUser) {
    setSendingTo(user.uid);
    setLookupError(null);
    try {
      await zaloApi.sendMessage(user.conversation_id, "Hi", "user", accountId);
      setQuery("");
      setStranger(null);
      onStrangerMessaged(user.conversation_id, { name: user.display_name, avatar: user.avatar });
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Gửi tin thất bại");
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800">
            Hội thoại
            <span className="ml-1 text-[11px] font-normal text-slate-400">({filtered.length})</span>
          </h3>
          <button
            onClick={onSync}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-500 hover:text-blue-600 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm hội thoại hoặc dán số điện thoại..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {lookupState === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
        </div>

        {/* Kết quả tra số điện thoại — bấm vào sẽ gửi "Hi" cho người đó. */}
        {phone && lookupState === "not_found" ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Không tìm thấy tài khoản Zalo cho số này.
          </div>
        ) : null}

        {lookupError ? (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{lookupError}</span>
          </div>
        ) : null}

        {stranger ? (
          <button
            type="button"
            onClick={() => void handleSendHi(stranger)}
            disabled={sendingTo === stranger.uid}
            title={`Gửi "Hi" cho ${stranger.display_name}`}
            className="mt-2 flex w-full items-center gap-2.5 rounded-lg border border-brand-border bg-brand-subtle px-3 py-2.5 text-left transition hover:bg-blue-100 disabled:opacity-60"
          >
            <Avatar
              src={stranger.avatar}
              name={stranger.display_name}
              className="h-9 w-9 shrink-0 text-sm"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">{stranger.display_name}</div>
              <div className="truncate text-xs text-slate-500">
                {stranger.phone}
                {stranger.is_friend === false ? " · chưa kết bạn" : stranger.is_friend ? " · bạn bè" : ""}
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand px-2 py-1 text-xs font-semibold text-white">
              {sendingTo === stranger.uid ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : stranger.is_friend === false ? (
                <UserPlus className="h-3.5 w-3.5" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Gửi Hi
            </span>
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-xs text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Đang tải...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-slate-500">
            <MessageSquare className="h-8 w-8 text-slate-300" />
            <p>{conversations.length === 0 ? "Chưa có hội thoại nào" : "Không tìm thấy"}</p>
            {conversations.length === 0 && (
              <button onClick={onSync} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                <RefreshCcw className="h-3 w-3" />
                Sync ngay
              </button>
            )}
          </div>
        ) : (
          filtered.map((c) => {
            const active = c.conversation_id === openConvId;
            return (
              <button
                key={c.conversation_id}
                onClick={() => onOpen(c.conversation_id)}
                className={`flex w-full items-start gap-3 border-b border-slate-100 px-3.5 py-3.5 text-left transition hover:bg-slate-50 ${active ? "bg-blue-50" : ""}`}
              >
                <Avatar src={c.avatar_url} name={c.conversation_name} className="h-12 w-12 text-base" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="truncate text-sm font-bold text-slate-800">{c.conversation_name || "Không tên"}</div>
                    <div className="shrink-0 text-[11px] text-slate-400">{formatRelativeTime(c.latest_message_at)}</div>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{c.latest_content || (c.has_messages ? "..." : "Chưa có tin nhắn")}</div>
                  {c.unread_count > 0 && (
                    <span className="mt-1 inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{c.unread_count}</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
