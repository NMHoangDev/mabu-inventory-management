"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  getZaloAccounts,
  getZaloConversations,
  getZaloConversationMessages,
  sendZaloMessage,
  sendZaloMessageWithFiles,
  buildZaloRealtimeStreamUrl,
  markZaloConversationAsRead,
  syncZaloRecentConversations,
  syncZaloConversationMessages,
  type BuildZaloRealtimeStreamOptions,
} from "@/services/zaloCrawlerService";
import type {
  ZaloAccountInfo,
  ZaloConversationSummary,
  ZaloLibraryMessage,
} from "@/types/zalo-api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserRow {
  id?: string;
  email?: string;
  name?: string;
}

export interface TeamRow {
  id?: string;
  name_team?: string;
  id_leader?: string;
  leader_name?: string;
  leader_email?: string;
  members?: UserRow[];
}

export interface ZaloMemberAccount {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  accounts: ZaloAccountInfo[];
}

export type ZaloAccountOnlineStatus = "online" | "connecting" | "expired" | "offline";

export type ZaloInboxFilter = "all" | "unread" | "customer" | "need_reply" | "need_verify";
export type ZaloInboxViewMode = "inbox" | "archive";

export interface ZaloAdminConvFilter {
  tab: "all" | "unread" | "shared";
  query: string;
}

export interface ZaloConv {
  conv_id: string;
  name: string;
  preview: string;
  unread: boolean;
  time: string;
  is_customer: boolean;
  pushed_to_zalo: boolean;
  deleted: boolean;
  archived?: boolean;
  archived_at?: string;
}

export interface ZaloArchiveConv {
  conv_id: string;
  name: string;
  preview?: string;
  time?: string;
  archived_at?: string;
  last_saved_at?: string;
  note?: string;
  is_customer?: boolean;
  pushed_to_zalo?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNTS_POLL_MS = 10_000;
const CONVERSATIONS_POLL_MS = 2_000;
const MESSAGES_POLL_MS = 1_500;

// Mock user since Mabu runs as single-user without AppAuthContext
const user = { id: "default", email: "admin@localhost", role: "admin", name: "Admin" };
const role = "admin";
const leaderEmail = "admin@localhost";

export function useZaloAdminInbox() {
  // ── Teams & Members (stubbed) ────────────────────────────────────────────────
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({ default: "Admin" });
  const [ownerEmails, setOwnerEmails] = useState<Record<string, string>>({ default: "admin@localhost" });
  const [loadingTeams, setLoadingTeams] = useState(false);

  // ── Zalo Accounts (grouped by owner) ────────────────────────────────────────
  const [memberAccounts, setMemberAccounts] = useState<ZaloMemberAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // ── Selected state ───────────────────────────────────────────────────────────
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("default");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // ── Conversations ────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ZaloConversationSummary[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);

  // ── Modern View Mode & Filters ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ZaloInboxViewMode>("inbox");
  const [filter, setFilter] = useState<ZaloInboxFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Share & KPI metadata (stubbed / local simulated) ───────────────────────
  const [verifiedConvIds, setVerifiedConvIds] = useState<Set<string>>(new Set());
  const [isSyncingMessages, setIsSyncingMessages] = useState<Record<string, boolean>>({});
  const [suggestedConvIds, setSuggestedConvIds] = useState<Set<string>>(new Set());
  const [customerNotes, setCustomerNotes] = useState<Record<string, string>>({});
  const [isCustomerSet, setIsCustomerSet] = useState<Set<string>>(new Set());
  const [shareIdsMap, setShareIdsMap] = useState<Record<string, number>>({});

  // ── Local hidden list for Archiving ──────────────────────────────────────────
  const [hiddenConvIds, setHiddenConvIds] = useState<Set<string>>(new Set());

  // ── Messages ────────────────────────────────────────────────────────────────
  const [selectedConvId, setSelectedConvId] = useState<string>("");
  const [messages, setMessages] = useState<ZaloLibraryMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageTotal, setMessageTotal] = useState(0);

  // ── Send Reply ──────────────────────────────────────────────────────────────
  const [reply, setReply] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // ── Online status ───────────────────────────────────────────────────────────
  const [onlineAccounts, setOnlineAccounts] = useState<Set<string>>(new Set());
  const [expiredAccounts, setExpiredAccounts] = useState<Set<string>>(new Set());
  const [sseConnected, setSseConnected] = useState(false);

  // ── KPI stats & weekly progress (stubbed) ───────────────────────────────────
  const [kpiByOwner, setKpiByOwner] = useState<Record<string, number>>({});
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [isBulkVerifying, setIsBulkVerifying] = useState(false);
  const [isBulkSuggesting, setIsBulkSuggesting] = useState(false);

  // ── Scanning ────────────────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false);

  // ── Error & Toast ───────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [savingNoteConv, setSavingNoteConv] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const sseRef = useRef<EventSource | null>(null);
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accountPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedAccountIdRef = useRef(selectedAccountId);
  const selectedConvIdRef = useRef(selectedConvId);

  useEffect(() => { selectedAccountIdRef.current = selectedAccountId; }, [selectedAccountId]);
  useEffect(() => { selectedConvIdRef.current = selectedConvId; }, [selectedConvId]);

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Load hidden list from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zalo_hidden_convs");
      if (saved) {
        try {
          setHiddenConvIds(new Set(JSON.parse(saved)));
        } catch { /* no-op */ }
      }
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Load share status (simulated locally in localStorage for single user)
  // ─────────────────────────────────────────────────────────────────────────────
  const fetchShareStatus = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      const localDataStr = localStorage.getItem("zalo_local_share_status");
      const localData = localDataStr ? JSON.parse(localDataStr) : {};
      
      const verified = new Set<string>(localData.verified || []);
      const suggested = new Set<string>(localData.suggested || []);
      const notes = localData.notes || {};
      const customers = new Set<string>(localData.customers || []);
      const idsMap = localData.idsMap || {};

      setVerifiedConvIds(verified);
      setSuggestedConvIds(suggested);
      setCustomerNotes(notes);
      setIsCustomerSet(customers);
      setShareIdsMap(idsMap);
    } catch (e) {
      console.warn("Failed to fetch share status:", e);
    }
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      void fetchShareStatus();
    }
  }, [selectedAccountId, fetchShareStatus]);

  // Save local share status helper
  const saveLocalShareStatus = useCallback((updates: {
    verified?: string[];
    suggested?: string[];
    notes?: Record<string, string>;
    customers?: string[];
    idsMap?: Record<string, number>;
  }) => {
    if (typeof window === "undefined") return;
    try {
      const current = JSON.parse(localStorage.getItem("zalo_local_share_status") || "{}");
      const updated = {
        verified: updates.verified ?? current.verified ?? [],
        suggested: updates.suggested ?? current.suggested ?? [],
        notes: updates.notes ?? current.notes ?? {},
        customers: updates.customers ?? current.customers ?? [],
        idsMap: updates.idsMap ?? current.idsMap ?? {},
      };
      localStorage.setItem("zalo_local_share_status", JSON.stringify(updated));
      void fetchShareStatus();
    } catch (e) {
      console.error("Failed to save local share status:", e);
    }
  }, [fetchShareStatus]);

  // Load team dropdown structure for UI compatibility (single member)
  useEffect(() => {
    const mainTeam: TeamRow = {
      id: "admin-team",
      name_team: "Workspace của tôi",
      members: [{ id: "default", name: "Admin", email: "admin@localhost" }],
    };
    setTeams([mainTeam]);
    setOwnerNames({ default: "Admin" });
    setOwnerEmails({ default: "admin@localhost" });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Load Zalo accounts
  // ─────────────────────────────────────────────────────────────────────────────
  const loadMemberAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await getZaloAccounts("default");
      const accounts = res?.accounts ?? [];
      
      const onlineSet = new Set<string>();
      const expiredSet = new Set<string>();

      for (const acc of accounts) {
        if (acc.listener?.connected) onlineSet.add(acc.account_id);
        if (acc.listener?.auth_expired) expiredSet.add(acc.account_id);
      }

      setMemberAccounts([
        {
          ownerId: "default",
          ownerName: "Admin",
          ownerEmail: "admin@localhost",
          accounts: accounts as ZaloAccountInfo[],
        }
      ]);
      setOnlineAccounts(onlineSet);
      setExpiredAccounts(expiredSet);
    } catch (e) {
      console.error("loadMemberAccounts error", e);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    void loadMemberAccounts();
    if (accountPollRef.current) clearInterval(accountPollRef.current);
    accountPollRef.current = setInterval(() => void loadMemberAccounts(), ACCOUNTS_POLL_MS);
    return () => {
      if (accountPollRef.current) clearInterval(accountPollRef.current);
    };
  }, [loadMemberAccounts]);

  const allSessions = useMemo<ZaloAccountInfo[]>(() => {
    return memberAccounts.flatMap(g => g.accounts);
  }, [memberAccounts]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Select account → load conversations
  // ─────────────────────────────────────────────────────────────────────────────
  const onSelectAccount = useCallback((accountId: string) => {
    setSelectedOwnerId("default");
    setSelectedAccountId(accountId);
    setSelectedConvId("");
    setMessages([]);
    setConversations([]);
  }, []);

  const loadConversations = useCallback(async (accountId: string) => {
    if (!accountId) return;
    setLoadingConvs(true);
    try {
      const res = await getZaloConversations(accountId);
      if (res) {
        const list = Array.isArray(res.conversations) ? res.conversations : [];
        setConversations(list);
      }
    } catch (e) {
      console.error("loadConversations error", e);
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  useEffect(() => {
    if (convPollRef.current) clearInterval(convPollRef.current);
    if (!selectedAccountId) return;

    void loadConversations(selectedAccountId);
    const interval = sseConnected ? 30_000 : CONVERSATIONS_POLL_MS;
    convPollRef.current = setInterval(() => {
      void loadConversations(selectedAccountIdRef.current);
    }, interval);

    return () => {
      if (convPollRef.current) clearInterval(convPollRef.current);
    };
  }, [selectedAccountId, loadConversations, sseConnected]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Select conversation → load messages
  // ─────────────────────────────────────────────────────────────────────────────
  const onSelectConv = useCallback((convId: string) => {
    setSelectedConvId(convId);
    setMessages([]);
  }, []);

  const loadMessages = useCallback(async (accountId: string, convId: string, append = false) => {
    if (!accountId || !convId) return;
    if (!append) setLoadingMessages(true);
    try {
      const res = await getZaloConversationMessages(accountId, convId, 50, 0);
      if (res?.messages) {
        setMessages(res.messages);
        setMessageTotal(res.total ?? res.messages.length);
      }
    } catch (e) {
      console.error("loadMessages error", e);
    } finally {
      setLoadingMessages(false);
    }
    try { await markZaloConversationAsRead(accountId, convId); } catch { /* no-op */ }
  }, []);

  useEffect(() => {
    if (msgPollRef.current) clearInterval(msgPollRef.current);
    if (!selectedAccountId || !selectedConvId) return;

    void loadMessages(selectedAccountId, selectedConvId);
    const interval = sseConnected ? 30_000 : MESSAGES_POLL_MS;
    msgPollRef.current = setInterval(() => {
      void loadMessages(selectedAccountIdRef.current, selectedConvIdRef.current, true);
    }, interval);

    return () => {
      if (msgPollRef.current) clearInterval(msgPollRef.current);
    };
  }, [selectedAccountId, selectedConvId, loadMessages, sseConnected]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SSE realtime connection for selected account
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    if (!selectedAccountId) return;

    try {
      const streamOptions: BuildZaloRealtimeStreamOptions = { userId: selectedAccountId };
      const url = buildZaloRealtimeStreamUrl(streamOptions);
      const es = new EventSource(url);
      sseRef.current = es;

      es.onopen = () => setSseConnected(true);
      es.onerror = () => setSseConnected(false);

      es.addEventListener("zalo-message", () => {
        void loadMessages(selectedAccountIdRef.current, selectedConvIdRef.current, true);
        void loadConversations(selectedAccountIdRef.current);
      });

      es.addEventListener("auth_expired", () => {
        setExpiredAccounts((prev) => new Set([...prev, selectedAccountId]));
        setOnlineAccounts((prev) => {
          const next = new Set(prev);
          next.delete(selectedAccountId);
          return next;
        });
      });
    } catch {
      setSseConnected(false);
    }

    return () => {
      sseRef.current?.close();
      sseRef.current = null;
      setSseConnected(false);
    };
  }, [selectedAccountId, loadMessages, loadConversations]);


  // ─────────────────────────────────────────────────────────────────────────────
  // Scan deep (Quét ngay)
  // ─────────────────────────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    if (!selectedAccountId) return showToast("Chưa chọn tài khoản Zalo", false);
    setScanning(true);
    try {
      await syncZaloRecentConversations(selectedAccountId, 50, 50);
      showToast("Đang đồng bộ tin nhắn Zalo gần đây...", true);
      void loadConversations(selectedAccountId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Đồng bộ thất bại", false);
    } finally {
      setScanning(false);
    }
  }, [selectedAccountId, loadConversations, showToast]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Mark is_customer / hide / notes (simulated locally)
  // ─────────────────────────────────────────────────────────────────────────────
  const mark = useCallback(async (convId: string, field: string, value: boolean) => {
    if (!selectedAccountId) return;
    try {
      if (field === "is_customer") {
        const nextCustomers = Array.from(isCustomerSet);
        if (value) {
          if (!nextCustomers.includes(convId)) nextCustomers.push(convId);
        } else {
          const idx = nextCustomers.indexOf(convId);
          if (idx >= 0) nextCustomers.splice(idx, 1);
        }
        saveLocalShareStatus({ customers: nextCustomers });
        showToast(value ? "Đã đánh dấu khách hàng" : "Đã bỏ đánh dấu khách hàng", true);
      }
    } catch {
      showToast("Lỗi khi cập nhật trạng thái", false);
    }
  }, [selectedAccountId, isCustomerSet, saveLocalShareStatus, showToast]);

  const saveArchive = useCallback(async (convId: string, hide = false) => {
    if (!convId) return;
    if (hide) {
      setHiddenConvIds(prev => {
        const next = new Set(prev);
        next.add(convId);
        if (typeof window !== "undefined") {
          localStorage.setItem("zalo_hidden_convs", JSON.stringify(Array.from(next)));
        }
        return next;
      });
      showToast("Đã ẩn hội thoại khỏi hộp thư", true);
      if (selectedConvIdRef.current === convId) {
        setSelectedConvId("");
      }
    } else {
      await mark(convId, "is_customer", true);
    }
  }, [mark, showToast]);

  const saveCustomerNote = useCallback(async (convId: string, note: string) => {
    if (!selectedAccountId) return;
    setSavingNoteConv(convId);
    try {
      const nextNotes = { ...customerNotes, [convId]: note };
      saveLocalShareStatus({ notes: nextNotes });
      showToast("Đã lưu ghi chú khách hàng", true);
    } catch {
      showToast("Lỗi khi lưu ghi chú", false);
    } finally {
      setSavingNoteConv("");
    }
  }, [selectedAccountId, customerNotes, saveLocalShareStatus, showToast]);

  // ─────────────────────────────────────────────────────────────────────────────
  // KPI verification stubbing
  // ─────────────────────────────────────────────────────────────────────────────
  const suggestKpi = useCallback(async (payload: { member_email: string; conv_ids: string[]; user_id: string }) => {
    const nextSuggested = Array.from(new Set([...Array.from(suggestedConvIds), ...payload.conv_ids]));
    saveLocalShareStatus({ suggested: nextSuggested });
    showToast(`Đã đề xuất ${payload.conv_ids.length} inbox để tính KPI`, true);
  }, [suggestedConvIds, saveLocalShareStatus, showToast]);

  const toggleShare = useCallback(async (convId: string) => {
    if (!selectedAccountId) return;
    const currentlyShared = suggestedConvIds.has(convId) || verifiedConvIds.has(convId);
    const newActiveState = !currentlyShared;

    const nextSuggested = Array.from(suggestedConvIds);
    if (newActiveState) {
      if (!nextSuggested.includes(convId)) nextSuggested.push(convId);
    } else {
      const idx = nextSuggested.indexOf(convId);
      if (idx >= 0) nextSuggested.splice(idx, 1);
    }
    saveLocalShareStatus({ suggested: nextSuggested });
    showToast(newActiveState ? "Đã đề xuất hội thoại KPI" : "Đã hủy đề xuất hội thoại", true);
  }, [selectedAccountId, suggestedConvIds, verifiedConvIds, saveLocalShareStatus, showToast]);

  const revokeAllShares = useCallback(async () => {
    if (!selectedAccountId) return;
    if (!window.confirm("Bạn có chắc chắn muốn HỦY ĐỀ XUẤT tất cả các hội thoại chưa được duyệt KPI của tài khoản này?")) {
      return;
    }
    saveLocalShareStatus({ suggested: [] });
    showToast(`Đã thu hồi tất cả các đề xuất chia sẻ`, true);
  }, [selectedAccountId, saveLocalShareStatus, showToast]);

  const syncConversationMessagesHandler = useCallback(async (convId: string) => {
    if (!selectedAccountId || !convId) return;
    setIsSyncingMessages(prev => ({ ...prev, [convId]: true }));
    try {
      const res = await syncZaloConversationMessages(selectedAccountId, convId);
      if (res?.ok) {
        showToast("Đã bắt đầu đồng bộ tin nhắn cũ. Lịch sử sẽ cập nhật sau giây lát.", true);
        await loadMessages(selectedAccountId, convId);
      } else {
        showToast(res?.message || "Lỗi đồng bộ lịch sử tin nhắn", false);
      }
    } catch {
      showToast("Lỗi đồng bộ lịch sử tin nhắn", false);
    } finally {
      setIsSyncingMessages(prev => ({ ...prev, [convId]: false }));
    }
  }, [selectedAccountId, loadMessages, showToast]);

  const verifyKpi = useCallback(async (payload: { leader_email: string; conv_ids: string[] }) => {
    const nextVerified = Array.from(new Set([...Array.from(verifiedConvIds), ...payload.conv_ids]));
    const nextSuggested = Array.from(suggestedConvIds).filter(id => !payload.conv_ids.includes(id));
    saveLocalShareStatus({ verified: nextVerified, suggested: nextSuggested });
    showToast("Đã xác minh KPI thành công!", true);
  }, [verifiedConvIds, suggestedConvIds, saveLocalShareStatus, showToast]);

  const bulkVerifyKpi = useCallback(async (payload: { leader_email: string; target_date: string }) => {
    setIsBulkVerifying(true);
    const toVerify = Array.from(suggestedConvIds);
    if (toVerify.length === 0) {
      showToast("Không có đề xuất KPI nào cần duyệt", false);
      setIsBulkVerifying(false);
      return;
    }
    try {
      await verifyKpi({ leader_email: payload.leader_email, conv_ids: toVerify });
    } finally {
      setIsBulkVerifying(false);
    }
  }, [suggestedConvIds, verifyKpi, showToast]);

  const bulkSuggestKpi = useCallback(async () => {
    if (!selectedAccountId) return;
    const toSuggest = conversations
      .map(c => c.conversation_id)
      .filter(id => !verifiedConvIds.has(id) && !suggestedConvIds.has(id));

    if (toSuggest.length === 0) {
      showToast("Không có hội thoại nào cần đề xuất tính KPI", false);
      return;
    }
    setIsBulkSuggesting(true);
    try {
      await suggestKpi({ member_email: "admin@localhost", conv_ids: toSuggest, user_id: selectedAccountId });
    } finally {
      setIsBulkSuggesting(false);
    }
  }, [conversations, selectedAccountId, verifiedConvIds, suggestedConvIds, suggestKpi, showToast]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Send reply message
  // ─────────────────────────────────────────────────────────────────────────────
  const sendReply = useCallback(async () => {
    const text = reply.trim();
    if (!text) return;
    setReply("");
    setIsSending(true);
    setSendError(null);
    const accId = selectedAccountIdRef.current;
    const convId = selectedConvIdRef.current;
    try {
      await sendZaloMessage(accId, convId, { text });
      await loadMessages(accId, convId, true);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Gửi tin nhắn thất bại");
      setReply(text);
    } finally {
      setIsSending(false);
    }
  }, [reply, loadMessages]);

  const sendMessage = useCallback(async (text: string, files?: File[]) => {
    const accId = selectedAccountIdRef.current;
    const convId = selectedConvIdRef.current;
    if (!accId || !convId) return;
    setIsSending(true);
    setSendError(null);
    try {
      if (files && files.length > 0) {
        await sendZaloMessageWithFiles(accId, convId, text, files);
      } else {
        await sendZaloMessage(accId, convId, { text });
      }
      await loadMessages(accId, convId, true);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Gửi tin nhắn thất bại");
    } finally {
      setIsSending(false);
    }
  }, [loadMessages]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Zalo Conv translation
  // ─────────────────────────────────────────────────────────────────────────────
  const activeConvs = useMemo<ZaloConv[]>(() => {
    return conversations.map((c) => {
      const isCust = isCustomerSet.has(c.conversation_id);
      const isHidden = hiddenConvIds.has(c.conversation_id);
      const hasUnread = (c.unread_count ?? 0) > 0;

      let timeStr = "";
      if (c.latest_message_at) {
        const num = Number(c.latest_message_at);
        const ms = !Number.isNaN(num) ? (num < 1e11 ? num * 1000 : num) : Date.parse(c.latest_message_at);
        if (ms && !Number.isNaN(ms)) {
          timeStr = new Date(ms).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        }
      }

      let previewStr = c.latest_content || "";
      if (previewStr) {
        const cleanSenderName = c.latest_sender_name?.trim();
        if (cleanSenderName) {
          const lowerName = cleanSenderName.toLowerCase();
          const isSelf = lowerName === "__me__" || lowerName === "me" || lowerName === "bạn" || lowerName === "ban";
          if (isSelf) {
            previewStr = `Bạn: ${previewStr}`;
          } else {
            const isGroup = !c.conversation_id.startsWith("fb_") && c.conversation_id.startsWith("g");
            if (isGroup) {
              previewStr = `${cleanSenderName}: ${previewStr}`;
            }
          }
        }
      } else {
        previewStr = c.has_messages === false || c.sync_status === "no_messages" 
          ? "Chưa có tin nhắn" 
          : "Chưa đồng bộ";
      }

      return {
        conv_id: c.conversation_id,
        name: c.conversation_name || "Người dùng Zalo",
        preview: previewStr,
        unread: hasUnread,
        time: timeStr,
        is_customer: isCust,
        pushed_to_zalo: true,
        deleted: isHidden,
        archived: isHidden,
      };
    });
  }, [conversations, isCustomerSet, hiddenConvIds]);

  const filtered = useMemo<ZaloConv[]>(() => {
    let list = activeConvs.filter(c => !c.archived);

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.conv_id.toLowerCase().includes(q));
    }

    if (filter === "unread") {
      list = list.filter(c => c.unread);
    } else if (filter === "customer") {
      list = list.filter(c => c.is_customer);
    } else if (filter === "need_reply") {
      list = list.filter(c => c.unread || c.preview !== "");
    } else if (filter === "need_verify") {
      list = list.filter(c => suggestedConvIds.has(c.conv_id));
    }

    return list;
  }, [activeConvs, filter, searchQuery, suggestedConvIds]);

  const archives = useMemo<ZaloArchiveConv[]>(() => {
    return activeConvs
      .filter(c => c.archived)
      .map(c => ({
        conv_id: c.conv_id,
        name: c.name,
        preview: c.preview,
        time: c.time,
        note: customerNotes[c.conv_id] || "",
        is_customer: c.is_customer,
        pushed_to_zalo: c.pushed_to_zalo,
      }));
  }, [activeConvs, customerNotes]);

  const getAccountStatus = useCallback(
    (accountId: string): ZaloAccountOnlineStatus => {
      if (expiredAccounts.has(accountId)) return "expired";
      if (onlineAccounts.has(accountId)) return "online";
      for (const group of memberAccounts) {
        const accInfo = group.accounts.find((a) => a.account_id === accountId);
        if (accInfo?.listener?.running) return "connecting";
      }
      return "offline";
    },
    [expiredAccounts, onlineAccounts, memberAccounts]
  );

  const selectedAccountInfo = useMemo<ZaloAccountInfo | undefined>(() => {
    return allSessions.find((a) => a.account_id === selectedAccountId);
  }, [allSessions, selectedAccountId]);

  const selectedOwnerInfo = useMemo<ZaloMemberAccount | undefined>(() => {
    return memberAccounts.find((g) => g.ownerId === selectedOwnerId);
  }, [memberAccounts, selectedOwnerId]);

  return {
    role,
    leaderEmail,

    // Teams
    teams,
    selectedTeamId,
    setSelectedTeamId,
    loadingTeams,
    ownerNames,
    ownerEmails,

    // Sessions & Accounts
    sessions: allSessions,
    loadingAccounts,
    memberAccounts,
    acc: selectedAccountId,
    accOnline: onlineAccounts.has(selectedAccountId),
    accPaused: false,
    needRelogin: expiredAccounts.has(selectedAccountId),
    connErr: false,
    extInstalled: true,

    // Modern filters
    viewMode,
    setViewMode,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,

    // Conversations lists
    activeConvs,
    filtered,
    archives,
    loadingConvs,
    loadingArchives: false,

    // KPI verification states
    verifiedConvIds,
    suggestedConvIds,
    customerNotes,
    savingNoteConv,
    isCustomerSet,

    // Messages
    openConv: selectedConvId,
    openChat: onSelectConv,
    openArchive: onSelectConv,
    messages,
    loadingMessages,
    loadingChat: loadingMessages,
    loadingFresh: false,
    messageTotal,

    // Actions
    scan,
    scanning,
    mark,
    saveArchive,
    saveCustomerNote,
    onSuggestKpi: suggestKpi,
    onToggleShare: toggleShare,
    onRevokeAllShares: revokeAllShares,
    onSyncConversationMessages: syncConversationMessagesHandler,
    isSyncingMessages,
    onBulkVerifyKpi: bulkVerifyKpi,
    bulkSuggestKpi,
    sendMessage,
    reply,
    setReply,
    sendReply,
    isSending,
    sendError,

    // Account stats
    selectedOwnerId,
    selectedAccountId,
    selectedAccountInfo,
    selectedOwnerInfo,
    onSelectAccount,
    getAccountStatus,
    onlineAccounts,
    expiredAccounts,
    kpiByOwner,
    targetDate,
    setTargetDate,
    isBulkVerifying,
    isBulkSuggesting,

    // Toast
    toast,
    showToast,
    error,
    setError,
    archiveReading: viewMode === "archive",
    setArchiveReading: (val: boolean) => setViewMode(val ? "archive" : "inbox"),
    refreshConversations: () => loadConversations(selectedAccountId),
    refreshAccounts: loadMemberAccounts,
  };
}
export default useZaloAdminInbox;
