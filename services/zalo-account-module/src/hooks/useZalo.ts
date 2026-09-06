/**
 * useZalo — ported từ components/zalo/chat/useZalo.ts (app chính). Cùng logic
 * polling login/conversations/messages + SSE realtime + dedupe. Khác bản gốc:
 *
 *   - accountId là THAM SỐ truyền vào (không đọc từ AppProvider — module này
 *     không có context multi-account, chọn account qua dropdown cục bộ +
 *     localStorage ở page.tsx, giống pattern AccountPicker của
 *     zalo-forward-module).
 *   - KHÔNG có broadcast (ngoài scope module này — xem forward-rules ở
 *     zalo-forward-module cho gửi hàng loạt/tự động).
 *   - KHÔNG có fallback "requestExtensionDomSync" (scrape DOM qua extension
 *     khi bridge /group-info, /user-info không trả data) — đơn giản hoá,
 *     chấp nhận tên hiển thị tạm "Group <id>"/"Zalo <id>" cho trường hợp hiếm
 *     bridge không resolve được tên thật.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { zaloApi, absoluteBridgeUrl, ZaloApiError, ZaloConversation, ZaloLoginStatus, ZaloMessage } from "@/lib/zaloApiClient";

const POLL_INTERVAL_MS = 5_000;

function dedupeMessages(list: ZaloMessage[]): ZaloMessage[] {
  if (!Array.isArray(list) || list.length <= 1) return list;
  const seenById = new Map<string, ZaloMessage>();
  const seenByContent = new Set<string>();
  const out: ZaloMessage[] = [];
  for (const m of list) {
    const id = m.message_id ? String(m.message_id).trim() : "";
    if (id && id.length > 0 && !id.startsWith("sse_") && !id.startsWith("local_")) {
      const existing = seenById.get(id);
      if (existing) {
        const curContent = (existing.content ?? "").length;
        const newContent = (m.content ?? "").length;
        const winner = newContent >= curContent ? m : existing;
        const idx = out.indexOf(existing);
        if (idx >= 0) out[idx] = winner;
        seenById.set(id, winner);
        continue;
      }
      seenById.set(id, m);
      out.push(m);
      continue;
    }
    const tsRaw = m.timestamp ? new Date(m.timestamp).getTime() : 0;
    const ts = Number.isFinite(tsRaw) ? tsRaw : 0;
    const sender = String(m.sender_id ?? "");
    const content = String(m.content ?? "").trim();
    const key = `${ts}|${sender}|${content}`;
    if (seenByContent.has(key)) continue;
    seenByContent.add(key);
    out.push(m);
  }
  return out;
}

function sortConversationsByLatestMessage(list: ZaloConversation[]): ZaloConversation[] {
  if (!Array.isArray(list) || list.length <= 1) return list;
  const tsOf = (c: ZaloConversation): number => {
    const iso = c.latest_message_at;
    if (iso) {
      const t = new Date(iso).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
    const raw = c.last_message_ts;
    if (raw !== undefined && raw !== null && raw !== "") {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };
  return [...list].sort((a, b) => tsOf(b) - tsOf(a));
}

async function saveConversationsToSupabase(list: ZaloConversation[], accountId: string) {
  if (typeof window === "undefined" || !Array.isArray(list) || list.length === 0) return;
  try {
    await fetch("/api/zalo/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: list, account_id: accountId }),
      keepalive: true,
    });
  } catch {
    // cache fallback — bỏ qua lỗi mạng
  }
}

const FALLBACK_NAME_RE = /^(Group|Zalo)\s+\d+$/;

/**
 * `known` = danh tính ĐÃ BIẾT CHẮC của thread (tên + avatar), dùng cho luồng
 * tìm người lạ theo số điện thoại: lúc đó ta đã có tên thật từ kết quả tra số,
 * trong khi getUserInfo() KHÔNG resolve được người chưa kết bạn nên nếu để tự
 * tra lại thì tên hội thoại rơi về fallback "Zalo <uid>" dù tìm kiếm đúng.
 */
async function ensureConversationInSupabase(
  threadId: string,
  threadType: "user" | "group",
  accountId: string,
  fallbackName?: string,
  latest?: { ts?: number | null; content?: string | null; senderId?: string | null; isSelf?: boolean },
  known?: { name?: string | null; avatar?: string | null },
  /**
   * Tên CHỦ TÀI KHOẢN đang đăng nhập. Dùng để tự chữa các bản ghi đã bị bug cũ
   * đặt tên hội thoại = tên của chính mình (tin tự gửi quay về qua selfListen
   * mang sender_name là tên mình). Tên đó không khớp mẫu fallback nên nếu không
   * xét riêng thì hàm sẽ thoát sớm và không bao giờ sửa lại được.
   */
  ownName?: string | null
): Promise<void> {
  if (typeof window === "undefined" || !threadId) return;
  try {
    const check = await fetch(`/api/zalo/conversations?account_id=${encodeURIComponent(accountId)}&limit=1000`, { cache: "no-store" });
    let existing: { conversation_id?: string; thread_id?: string; conversation_name?: string | null; avatar_url?: string | null; thread_type?: string | null } | null = null;
    if (check.ok) {
      const data = await check.json();
      existing =
        (data?.conversations || []).find((c: { conversation_id?: string; thread_id?: string }) => c.conversation_id === threadId || c.thread_id === threadId) || null;
    }
    const isFallbackName =
      !existing?.conversation_name ||
      FALLBACK_NAME_RE.test(existing.conversation_name.trim()) ||
      (!!fallbackName && existing.conversation_name.trim() === fallbackName.trim()) ||
      // Bản ghi bị bug cũ đặt thành tên của chính mình → coi như cần resolve lại.
      (!!ownName && threadType === "user" && existing.conversation_name.trim() === ownName.trim());
    const hasWrongType = threadType === "group" && !!existing?.thread_type && existing.thread_type !== "group";
    const needsResolve = isFallbackName || hasWrongType;
    const effectiveThreadType: "user" | "group" = existing?.thread_type === "group" ? "group" : threadType;
    if (existing && !needsResolve) return;

    let resolvedName: string | undefined = known?.name || fallbackName;
    let resolvedAvatar: string | null = known?.avatar ?? existing?.avatar_url ?? null;
    if (known?.name) {
      // Đã biết chắc tên → bỏ qua toàn bộ bước tra lại bên dưới.
    } else if (effectiveThreadType === "group") {
      const info = await zaloApi.getGroupInfo(threadId, accountId).catch(() => null);
      if (info?.ok) {
        resolvedName = info.group_name;
        resolvedAvatar = info.avatar_url;
      }
    } else if (!resolvedName || FALLBACK_NAME_RE.test(resolvedName.trim())) {
      const info = await zaloApi.getUserInfo(threadId, accountId).catch(() => null);
      if (info?.ok) {
        resolvedName = info.user_name;
        resolvedAvatar = info.avatar_url;
      }
    }
    const finalName = resolvedName || (effectiveThreadType === "group" ? `Group ${threadId}` : `Zalo ${threadId}`);
    const conv = {
      conversation_id: threadId,
      thread_id: threadId,
      thread_type: effectiveThreadType,
      conversation_name: finalName,
      account_id: accountId,
      avatar_url: resolvedAvatar,
      last_message_ts: latest?.ts || Date.now(),
      latest_message_at: new Date(latest?.ts || Date.now()).toISOString(),
      latest_content: latest?.content || null,
      latest_sender_id: latest?.senderId || null,
      latest_is_self: !!latest?.isSelf,
      unread_count: latest?.isSelf ? 0 : 1,
      has_messages: true,
    };
    await fetch("/api/zalo/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversations: [conv], account_id: accountId }),
      keepalive: true,
    });
  } catch {
    // best-effort — không crash UI nếu ensure thất bại
  }
}

async function saveMessagesToSupabase(threadId: string, list: unknown[], accountId: string, opts: { insertOnly?: boolean; threadType?: "user" | "group" } = {}) {
  if (typeof window === "undefined" || !threadId || !Array.isArray(list) || list.length === 0) return;
  try {
    await fetch("/api/zalo/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId,
        thread_id: threadId,
        thread_type: opts.threadType || "user",
        messages: list,
        insert_only: !!opts.insertOnly,
      }),
      keepalive: true,
    });
  } catch {
    // cache fallback — bỏ qua lỗi mạng
  }
}

export function useZalo(accountId: string) {
  const [loginStatus, setLoginStatus] = useState<ZaloLoginStatus | null>(null);
  // Ten chu tai khoan — dung de tu chua hoi thoai bi bug cu dat thanh ten minh.
  const ownNameRef = useRef<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ZaloConversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  const [openConvId, setOpenConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ZaloMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sending, setSending] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const accountIdRef = useRef(accountId);
  useEffect(() => {
    accountIdRef.current = accountId;
  }, [accountId]);

  const openConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    openConvIdRef.current = openConvId;
  }, [openConvId]);

  const conversationsRef = useRef<ZaloConversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const pollAuth = useCallback(async () => {
    try {
      const status = await zaloApi.getLoginStatus(accountIdRef.current);
      setLoginStatus(status);
      ownNameRef.current = status?.display_name ? String(status.display_name) : null;
      setAuthError(null);
    } catch (e) {
      if (e instanceof ZaloApiError) setAuthError(e.message);
    }
  }, []);

  useEffect(() => {
    pollAuth();
    const id = setInterval(pollAuth, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollAuth]);

  // Đổi account (dropdown ở page.tsx) → reset state + refetch.
  const prevAccountIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevAccountIdRef.current === accountId) return;
    const isFirstMount = prevAccountIdRef.current === null;
    prevAccountIdRef.current = accountId;
    if (isFirstMount) return;
    setConversations([]);
    setMessages([]);
    setOpenConvId(null);
    setLoginStatus(null);
    setAuthError(null);
    void pollAuth();
  }, [accountId, pollAuth]);

  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      const res = await zaloApi.getConversations(200, accountIdRef.current);
      const list = res.conversations || [];
      setConversations(sortConversationsByLatestMessage(list));
      void saveConversationsToSupabase(list, accountIdRef.current);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lỗi tải hội thoại", false);
    } finally {
      setLoadingConvs(false);
    }
  }, [showToast]);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/zalo/conversations?account_id=${encodeURIComponent(accountIdRef.current)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const list: ZaloConversation[] = Array.isArray(data?.conversations) ? data.conversations : [];
      setConversations(sortConversationsByLatestMessage(list));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (loginStatus?.is_logged_in) {
      void refreshConversations();
      void fetchConversations().then(() => refreshConversations());
    } else {
      setConversations([]);
      setOpenConvId(null);
    }
  }, [loginStatus?.is_logged_in, fetchConversations, refreshConversations]);

  const syncConversations = useCallback(async () => {
    setLoadingConvs(true);
    try {
      await zaloApi.syncConversations(accountIdRef.current);
      await fetchConversations();
      showToast("Đồng bộ conversations thành công!", true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lỗi đồng bộ Zalo", false);
    } finally {
      setLoadingConvs(false);
    }
  }, [fetchConversations, showToast]);

  const openConversation = useCallback(
    async (convId: string, known?: { name?: string | null; avatar?: string | null }) => {
      setOpenConvId(convId);
      setMessages([]);
      const threadId = convId.includes(":") ? convId.split(":").slice(1).join(":") : convId;

      const existing = conversations.find((c) => c.conversation_id === threadId || c.thread_id === threadId);
      if (!existing) {
        void ensureConversationInSupabase(
          threadId,
          "user",
          accountIdRef.current,
          `Zalo ${threadId}`,
          { ts: Date.now(), content: null, isSelf: false },
          known,
          ownNameRef.current
        );
        // Hiện ngay trong danh sách với tên thật (nếu đã biết) thay vì chờ sync
        // — sync từ bridge có thể vẫn trả fallback cho người chưa kết bạn.
        if (known?.name) {
          setConversations((prev) =>
            prev.some((c) => c.thread_id === threadId)
              ? prev
              : [
                  {
                    conversation_id: threadId,
                    thread_id: threadId,
                    thread_type: "user",
                    conversation_name: known.name as string,
                    account_id: accountIdRef.current,
                    avatar_url: known.avatar ?? null,
                    unread_count: 0,
                    message_count: 0,
                    has_messages: true,
                    last_message_ts: Date.now(),
                    latest_message_at: new Date().toISOString()
                  } as ZaloConversation,
                  ...prev
                ]
          );
        }
      }

      setLoadingChat(true);
      try {
        const res = await fetch(`/api/zalo/messages?account_id=${encodeURIComponent(accountIdRef.current)}&thread_id=${encodeURIComponent(threadId)}&limit=200`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const list: ZaloMessage[] = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(dedupeMessages(list));

        await fetch(`/api/zalo/threads/${encodeURIComponent(threadId)}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountIdRef.current }),
          keepalive: true,
        }).catch(() => undefined);

        setConversations((prev) => prev.map((c) => (c.conversation_id === convId ? { ...c, unread_count: 0 } : c)));
        await zaloApi.markRead(convId, accountIdRef.current).catch(() => undefined);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Lỗi tải tin nhắn", false);
      } finally {
        setLoadingChat(false);
      }
    },
    [conversations, showToast]
  );

  const refreshCurrentThread = useCallback(async () => {
    const convId = openConvIdRef.current;
    if (!convId) return;
    const threadId = convId.includes(":") ? convId.split(":").slice(1).join(":") : convId;
    try {
      const res = await fetch(`/api/zalo/messages?account_id=${encodeURIComponent(accountIdRef.current)}&thread_id=${encodeURIComponent(threadId)}&limit=200`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      const list: ZaloMessage[] = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(dedupeMessages(list));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!loginStatus?.is_logged_in) return;
    const onVisibleOrFocus = () => {
      const isVisible = typeof document === "undefined" || document.visibilityState === "visible";
      const isFocused = typeof document === "undefined" || document.hasFocus();
      if (!isVisible && !isFocused) return;
      void refreshConversations();
      void refreshCurrentThread();
    };
    document.addEventListener("visibilitychange", onVisibleOrFocus);
    window.addEventListener("focus", onVisibleOrFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibleOrFocus);
      window.removeEventListener("focus", onVisibleOrFocus);
    };
  }, [loginStatus?.is_logged_in, refreshConversations, refreshCurrentThread]);

  const syncCurrentChat = useCallback(async () => {
    if (!openConvId) return;
    try {
      await zaloApi.syncMessages().catch(() => undefined);
      await refreshCurrentThread();
      await refreshConversations();
      showToast("Đã đồng bộ tin nhắn mới!", true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lỗi đồng bộ tin nhắn", false);
    }
  }, [openConvId, refreshCurrentThread, refreshConversations, showToast]);

  const sendCurrentMessage = useCallback(async () => {
    if (!openConvId) return;
    const text = replyText.trim();
    if (!text && pendingFiles.length === 0) return;

    const openConv = conversations.find((c) => c.conversation_id === openConvId || c.thread_id === openConvId);
    const sendThreadType: "user" | "group" = (openConv?.thread_type as "user" | "group" | undefined) || (openConvId.startsWith("g:") ? "group" : "user");

    setSending(true);
    try {
      if (pendingFiles.length > 0) {
        await zaloApi.sendMedia(openConvId, pendingFiles, text, sendThreadType, accountIdRef.current);
      } else {
        await zaloApi.sendMessage(openConvId, text, sendThreadType, accountIdRef.current);
      }
      setReplyText("");
      setPendingFiles([]);

      await new Promise((r) => setTimeout(r, 300));
      await refreshCurrentThread();
      setTimeout(() => {
        void refreshCurrentThread();
      }, 2500);

      const nowIso = new Date().toISOString();
      setConversations((prev) =>
        sortConversationsByLatestMessage(
          prev.map((c) => (c.conversation_id === openConvId || c.thread_id === openConvId ? { ...c, latest_message_at: nowIso, last_message_ts: Date.now(), has_messages: true } : c))
        )
      );
      showToast("Đã gửi!", true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lỗi gửi tin nhắn", false);
    } finally {
      setSending(false);
    }
  }, [openConvId, replyText, pendingFiles, conversations, refreshCurrentThread, showToast]);

  const logout = useCallback(async () => {
    if (!window.confirm("Đăng xuất Zalo? Bạn sẽ cần quét QR lại.")) return;
    try {
      await zaloApi.logout(accountIdRef.current);
      setLoginStatus(null);
      setConversations([]);
      setMessages([]);
      setOpenConvId(null);
      showToast("Đã đăng xuất Zalo", true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lỗi đăng xuất", false);
    }
  }, [showToast]);

  const [reconnecting, setReconnecting] = useState(false);
  const reconnectBridge = useCallback(async () => {
    setReconnecting(true);
    try {
      const result = await zaloApi.reconnect(accountIdRef.current);
      if (result?.ok) {
        showToast(`Đã reconnect Zalo (${result.before || "?"} → ${result.after || "?"}, WS: ${result.is_ws_connected ? "online" : "offline"})`, true);
        await pollAuth();
        await fetchConversations();
      } else {
        showToast(result?.error || "Reconnect thất bại", false);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lỗi khi reconnect", false);
    } finally {
      setReconnecting(false);
    }
  }, [showToast, pollAuth, fetchConversations]);

  const SSE_RETRY_DELAYS_MS = [3_000, 6_000, 12_000, 24_000, 30_000];
  const [sseState, setSseState] = useState<"connecting" | "open" | "closed" | "reconnecting">("closed");
  const sseRef = useRef<{ close: () => void } | null>(null);

  useEffect(() => {
    if (!loginStatus?.is_logged_in) {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setSseState("closed");
      return;
    }

    let cancelled = false;
    let retryAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let currentSource: EventSource | null = null;

    function cleanup() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (currentSource) {
        currentSource.close();
        currentSource = null;
      }
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const delay = SSE_RETRY_DELAYS_MS[Math.min(retryAttempt, SSE_RETRY_DELAYS_MS.length - 1)];
      retryAttempt += 1;
      setSseState("reconnecting");
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    function attach(source: EventSource) {
      source.addEventListener("open", () => {
        if (cancelled) return;
        retryAttempt = 0;
        setSseState("open");
      });

      const dispatch = (type: string, rawData: string | null) => {
        if (cancelled || !rawData) return;
        try {
          const data = JSON.parse(rawData);
          if (type === "new_message") {
            const target = (data && (data.group_id ?? data.threadId ?? data.idTo)) ?? null;
            const targetThread = target ? String(target) : null;
            if (!targetThread) {
              void refreshConversations();
              return;
            }

            const messageIdFromSse = (() => {
              const candidates = [data?.message_id, data?.id, data?.msg_id, data?.msgId];
              for (const c of candidates) {
                if (c == null) continue;
                const s = String(c).trim();
                if (s.length === 0) continue;
                if (s.startsWith("sse_") || s.startsWith("local_")) continue;
                return s;
              }
              return null;
            })();

            const sseThreadType = data?.thread_type === "group" || data?.isGroup ? "group" : "user";
            const tsFromSse = data?.ts ? Number(data.ts) : Date.now();
            const isoNow = Number.isFinite(tsFromSse) && tsFromSse > 0 ? new Date(tsFromSse).toISOString() : new Date().toISOString();
            const isOwn = data?.is_self === true || data?.isSelf === true || data?.is_self === 1;
            const latestContent = typeof data?.content === "string" ? data.content : null;

            /**
             * Tên để ĐẶT/SỬA tên hội thoại — chỉ lấy từ sender_name khi tin do
             * NGƯỜI KHÁC gửi. Bridge chạy với selfListen: true nên tin mình vừa
             * gửi cũng quay về qua listener; lúc đó sender_name chính là tên
             * CHỦ TÀI KHOẢN, dùng nó sẽ đổi tên hội thoại thành tên của mình.
             * (Khác với latest_sender_name bên dưới — đó là "ai gửi tin cuối",
             * hiện tên mình ở đó là đúng.)
             */
            const nameFromSender = !isOwn && data?.sender_name ? String(data.sender_name) : undefined;

            const applyLocalState = () => {
              setConversations((prev) => {
                const exists = prev.some((c) => c.conversation_id === targetThread);
                let next: ZaloConversation[];
                if (exists) {
                  next = prev.map((c) =>
                    c.conversation_id !== targetThread
                      ? c
                      : {
                          ...c,
                          latest_message_at: isoNow,
                          last_message_ts: tsFromSse,
                          latest_content: latestContent ?? c.latest_content,
                          latest_sender_name: data?.sender_name ?? c.latest_sender_name,
                          latest_is_self: isOwn,
                          unread_count: isOwn ? 0 : Math.max(0, Number(c.unread_count || 0) + (targetThread === openConvIdRef.current ? 0 : 1)),
                          has_messages: true,
                        }
                  );
                } else {
                  next = [
                    ...prev,
                    {
                      conversation_id: targetThread,
                      thread_id: targetThread,
                      thread_type: sseThreadType,
                      conversation_name: sseThreadType === "group" ? `Group ${targetThread}` : nameFromSender || `Zalo ${targetThread}`,
                      account_id: accountIdRef.current,
                      latest_message_at: isoNow,
                      last_message_ts: tsFromSse,
                      latest_content: latestContent,
                      latest_sender_name: data?.sender_name ?? null,
                      latest_is_self: isOwn,
                      message_count: 1,
                      has_messages: true,
                      unread_count: isOwn ? 0 : 1,
                      avatar_url: null,
                    } as ZaloConversation,
                  ];
                }
                return sortConversationsByLatestMessage(next);
              });
              if (targetThread && openConvIdRef.current && String(openConvIdRef.current) === targetThread) {
                void refreshCurrentThread();
                setTimeout(() => void refreshCurrentThread(), 2500);
              }
            };

            if (!messageIdFromSse) {
              // Bridge đã tự persist theo msgId — chỉ ensure conversation row + refetch.
              void ensureConversationInSupabase(targetThread, sseThreadType, accountIdRef.current, nameFromSender, {
                ts: tsFromSse,
                content: data?.content || null,
                senderId: data?.sender_id || null,
                isSelf: isOwn,
              }, undefined, ownNameRef.current).finally(() => {
                applyLocalState();
                void refreshConversations();
              });
              return;
            }

            const messageRow = {
              message_id: messageIdFromSse,
              thread_id: targetThread,
              thread_type: sseThreadType,
              sender_id: data?.sender_id || null,
              sender_name: data?.sender_name || null,
              content: data?.content ?? "",
              ts: tsFromSse,
              type: data?.type || "webchat",
              is_self: isOwn,
              attachments: data?.attachments ?? null,
              image_urls: Array.isArray(data?.image_urls) ? data.image_urls : [],
              reply_to_id: data?.reply_to_id ?? null,
              time_text: data?.time_text || null,
            };

            const savePromise = saveMessagesToSupabase(targetThread, [messageRow], accountIdRef.current, { insertOnly: true, threadType: sseThreadType });
            const ensurePromise = ensureConversationInSupabase(targetThread, sseThreadType, accountIdRef.current, nameFromSender, {
              ts: tsFromSse,
              content: data?.content || null,
              senderId: data?.sender_id || null,
              isSelf: isOwn,
            }, undefined, ownNameRef.current);

            Promise.all([savePromise, ensurePromise]).finally(() => {
              applyLocalState();
              const exists = conversationsRef.current.some((c) => c.conversation_id === targetThread);
              if (!exists) {
                void fetchConversations().then(() => refreshConversations());
              } else {
                void refreshConversations();
              }
            });
          } else if (type === "session_expired") {
            showToast("Phiên Zalo đã hết hạn. Vui lòng đăng nhập lại.", false);
            void pollAuth();
          }
        } catch {
          // payload không hợp lệ — bỏ qua, không crash subscription.
        }
      };

      source.addEventListener("new_message", (e) => dispatch("new_message", (e as MessageEvent).data));
      source.addEventListener("session_expired", (e) => dispatch("session_expired", (e as MessageEvent).data));
      source.addEventListener("error", () => {
        if (cancelled) return;
        try {
          source.close();
        } catch {
          /* noop */
        }
        currentSource = null;
        scheduleReconnect();
      });
    }

    function connect() {
      if (cancelled) return;
      setSseState("connecting");
      try {
        const source = zaloApi.openEventSource(accountIdRef.current);
        currentSource = source;
        attach(source);
      } catch {
        scheduleReconnect();
      }
    }

    connect();
    sseRef.current = {
      close: () => {
        cancelled = true;
        cleanup();
        setSseState("closed");
      },
    };

    return () => {
      cancelled = true;
      cleanup();
      setSseState("closed");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginStatus?.is_logged_in, accountId]);

  const importFromExtension = useCallback(async () => {
    const extApi = window as unknown as {
      __zaloExtension?: {
        isAvailable: () => boolean;
        ping: () => Promise<{ installed: boolean; version: string }>;
        importSession: (opts?: Record<string, unknown>) => Promise<{ success: boolean; data?: unknown; error?: string }>;
      };
      zaloExtension?: { importSession: (opts?: unknown) => Promise<{ success: boolean; data?: unknown; error?: string }> };
    };

    const ext =
      extApi.__zaloExtension ??
      (extApi.zaloExtension
        ? {
            isAvailable: () => true,
            ping: () => Promise.resolve({ installed: true, version: "legacy" }),
            importSession: extApi.zaloExtension.importSession.bind(extApi.zaloExtension),
          }
        : null);

    if (!ext) {
      showToast("Chưa cài extension Zalo. Cài extension từ thư mục extensions/extension-login-zalo (Chrome → Load unpacked).", false);
      return;
    }

    setAuthLoading(true);
    try {
      await ext.ping().catch(() => undefined);
      const bridgeUrl = absoluteBridgeUrl();
      const result = await ext.importSession({
        account_id: accountIdRef.current,
        owner_id: accountIdRef.current,
        backend_url: bridgeUrl,
        login_timeout_ms: 90_000,
      });
      if (result.success) {
        showToast("Đăng nhập Zalo thành công! Đang đồng bộ...", true);
        await pollAuth();
      } else {
        showToast(result.error || "Đăng nhập thất bại", false);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Lỗi kết nối extension", false);
    } finally {
      setAuthLoading(false);
    }
  }, [pollAuth, showToast]);

  return {
    loginStatus,
    authLoading,
    authError,
    isLoggedIn: !!loginStatus?.is_logged_in,
    importFromExtension,
    logout,
    refreshAuth: pollAuth,

    conversations,
    loadingConvs,
    syncConversations,

    openConvId,
    openConversation,
    messages,
    loadingChat,
    sending,
    replyText,
    setReplyText,
    pendingFiles,
    setPendingFiles,
    sendCurrentMessage,
    syncCurrentChat,

    sseState,
    reconnecting,
    reconnectBridge,

    toast,
    showToast,
  };
}
