"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useZaloAdminInbox, type ZaloConv } from "@/hooks/useZaloAdminInbox";
import { useZaloCrawlerFlow, type ZaloGroupInputRow, type ZaloTrackedJobState } from "@/hooks/useZaloCrawlerFlow";
import {
  createZaloAccount,
  deleteZaloAccount,
  restartZaloAccountListener,
  syncZaloRecentConversations,
  createZaloBroadcast,
} from "@/services/zaloCrawlerService";
import {
  importZaloSessionViaExtension,
  isZaloExtensionAvailable,
  ZaloExtensionError,
} from "@/services/zaloExtension";
import type { ZaloAccountInfo, ZaloLibraryMessage, ZaloLiveGroup, ZaloBroadcastRequest } from "@/types/zalo-api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(value: string | null | undefined): string {
  if (!value) return "";
  const num = Number(String(value).trim());
  const ms = !isNaN(num) && /^\d+$/.test(String(value).trim())
    ? (num < 1e11 ? num * 1000 : num)
    : Date.parse(String(value).trim());
  if (!ms || isNaN(ms)) return String(value);
  const diff = Date.now() - ms;
  if (diff < 60_000) return "vừa xong";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}p`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}g`;
  return new Date(ms).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

function formatMsgTime(value: string | null | undefined): string {
  if (!value) return "";
  const num = Number(String(value).trim());
  const ms = !isNaN(num) && /^\d+$/.test(String(value).trim())
    ? (num < 1e11 ? num * 1000 : num)
    : Date.parse(String(value).trim());
  if (!ms || isNaN(ms)) return String(value);
  return new Date(ms).toLocaleTimeString("vi-VN", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh",
  });
}

function StatusDot({ online, expired }: { online: boolean; expired: boolean }) {
  const cls = expired
    ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] animate-pulse"
    : online
    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
    : "bg-zinc-600";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${cls}`} />;
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const letter = (name || "?")[0].toUpperCase();
  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444"];
  const bg = colors[letter.charCodeAt(0) % colors.length];
  return (
    <div
      style={{ width: size, height: size, background: bg, fontSize: size * 0.42 }}
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 select-none shadow-sm"
    >
      {letter}
    </div>
  );
}

const QUICK_REPLIES = [
  { label: "Chào hỏi", text: "Chào bạn, bên mình có thể hỗ trợ bạn phần nào ạ?" },
  { label: "Báo giá", text: "Dạ để báo giá chính xác, bạn cho mình xin số lượng và khu vực cần triển khai nhé." },
  { label: "Cầm chân", text: "Mình đã ghi nhận nhu cầu của bạn, bên mình sẽ liên hệ lại để tư vấn chi tiết hơn nhé." },
  { label: "Xin SĐT", text: "Bạn cho mình xin số điện thoại/Zalo để bộ phận tư vấn gửi thông tin nhanh hơn ạ." }
];

// ─── Login Modal ───────────────────────────────────────────────────────────────

function LoginModal({ accountId, onClose, onSuccess }: { accountId: string; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [extAvailable, setExtAvailable] = useState<boolean | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => { isZaloExtensionAvailable().then(setExtAvailable); }, []);

  const doLogin = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setStep("loading");
    setMessage("Đang mở Zalo Web, vui lòng đăng nhập...");
    try {
      await importZaloSessionViaExtension({ account_id: accountId });
      setStep("done");
      setMessage("Đăng nhập thành công! Cookie đã được import.");
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (e) {
      loadingRef.current = false;
      setStep("error");
      setMessage(e instanceof ZaloExtensionError ? e.message : String(e));
    }
  }, [accountId, onSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Đăng nhập Zalo</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {extAvailable === false && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs">
            <p className="font-semibold mb-1">⚠️ Chưa cài Chrome Extension</p>
            <p className="opacity-80 leading-relaxed">
              1. Vào <code className="bg-white/10 px-1 rounded">chrome://extensions</code><br />
              2. Bật Developer mode → Load unpacked<br />
              3. Chọn thư mục <code className="bg-white/10 px-1 rounded">extension-login-zalo</code> trong project<br />
              4. Reload trang này
            </p>
          </div>
        )}

        {extAvailable === true && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Extension đã sẵn sàng
          </div>
        )}

        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
          Extension sẽ tự mở Zalo Web. Hãy đăng nhập Zalo trong tab đó. Hệ thống tự capture cookie và import session.
        </p>

        {step === "idle" && (
          <button
            onClick={doLogin}
            disabled={extAvailable === false}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Đăng nhập bằng Extension
          </button>
        )}

        {step === "loading" && (
          <div className="text-center py-6">
            <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-zinc-300 text-sm">{message}</p>
            <p className="text-zinc-500 text-xs mt-2">Tối đa 60 giây...</p>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-6">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-emerald-400 font-medium">{message}</p>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-3">
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs leading-relaxed whitespace-pre-wrap">
              {message}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { loadingRef.current = false; setStep("idle"); }} className="flex-1 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-xl text-sm font-medium transition-all">
                Thử lại
              </button>
              <button onClick={onClose} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl text-sm transition-all">
                Đóng
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create Account Modal ──────────────────────────────────────────────────────

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const trimLabel = label.trim();
    if (!trimLabel) { setErr("Nhập tên tài khoản"); return; }
    setLoading(true); setErr("");
    try {
      const accountId = trimLabel.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
      await createZaloAccount({ account_id: accountId, owner_id: "default", label: trimLabel, phone: phone.trim() || undefined });
      onCreated(accountId);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-base font-semibold text-white mb-4">Thêm tài khoản Zalo</h2>
        <div className="space-y-3 mb-4">
          <input
            value={label} onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void submit()}
            placeholder="Tên tài khoản (vd: Zalo Bán Hàng)"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            autoFocus
          />
          <input
            value={phone} onChange={e => setPhone(e.target.value)}
            onKeyDown={e => e.key === "Enter" && void submit()}
            placeholder="Số điện thoại (tuỳ chọn)"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {err && <p className="text-red-400 text-xs px-1">{err}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all">
            {loading ? "Đang tạo..." : "Tạo tài khoản"}
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl text-sm transition-all">
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ZaloShell() {
  const [activeTab, setActiveTab] = useState<"chat" | "crawl" | "accounts">("chat");
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  
  const inbox = useZaloAdminInbox();
  const crawlFlow = useZaloCrawlerFlow();

  const {
    sessions, loadingAccounts, selectedAccountId,
    onSelectAccount, getAccountStatus, expiredAccounts,
    activeConvs, filtered, loadingConvs,
    openConv, openChat,
    messages, loadingMessages,
    reply, setReply, sendReply, isSending, sendError,
    refreshConversations, refreshAccounts,
    toast, filter, setFilter, searchQuery, setSearchQuery,
    sendMessage,
  } = inbox;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Auto Send / Campaign Redesign States
  const [isAutoSendOpen, setIsAutoSendOpen] = useState(false);
  const [isBulkSelectMode, setIsBulkSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [manualRecipients, setManualRecipients] = useState("");
  const [campaignMode, setCampaignMode] = useState<"both" | "text" | "image">("both");
  const [autoSendTargetIds, setAutoSendTargetIds] = useState<string[]>([]);
  const [autoSendSearchQuery, setAutoSendSearchQuery] = useState("");
  const [campaignLogs, setCampaignLogs] = useState<{ name: string; status: "sending" | "success" | "failed" }[]>([]);
  const [campaignStatus, setCampaignStatus] = useState<string | null>(null);
  const [autoSendError, setAutoSendError] = useState<string | null>(null);
  const [autoSendSuccess, setAutoSendSuccess] = useState<string | null>(null);
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);

  // Clear states when context changes
  useEffect(() => {
    setSelectedMessageIds([]);
    setAutoSendTargetIds([]);
    setAutoSendError(null);
    setAutoSendSuccess(null);
    setCampaignLogs([]);
    setCampaignStatus(null);
    setIsBulkSelectMode(false);
    setSelectedFiles([]);
  }, [openConv, selectedAccountId]);

  // Derive targets
  const targets = useMemo(() => {
    const list: { group_id?: string; group_name: string }[] = [];
    // 1. Manual recipients
    manualRecipients.split("\n").forEach(line => {
      const name = line.trim();
      if (name) {
        list.push({ group_name: name });
      }
    });
    // 2. Selected system targets
    autoSendTargetIds.forEach(id => {
      const conv = activeConvs.find(c => c.conv_id === id);
      if (conv) {
        list.push({ group_id: id, group_name: conv.name || id });
      }
    });
    return list;
  }, [manualRecipients, autoSendTargetIds, activeConvs]);

  // Handle Send Campaign
  const handleSendCampaign = async () => {
    if (!selectedAccountId) return;
    if (selectedMessageIds.length === 0) {
      setAutoSendError("Vui lòng chọn ít nhất một tin nhắn trong chat (bằng cách tích chọn ở ô vuông cạnh tin nhắn).");
      return;
    }
    if (targets.length === 0) {
      setAutoSendError("Vui lòng nhập người nhận thủ công hoặc chọn từ danh sách hệ thống.");
      return;
    }

    setIsSendingCampaign(true);
    setAutoSendError(null);
    setAutoSendSuccess(null);
    setCampaignStatus("sending");
    setCampaignLogs([]);

    try {
      await createZaloBroadcast(selectedAccountId, {
        user_id: selectedAccountId,
        message_ids: selectedMessageIds,
        targets: targets.map(t => ({
          group_id: t.group_id || null,
          group_name: t.group_name
        })),
        content_mode: campaignMode,
      });

      // Simulate log stream for interactive view
      let currentIdx = 0;
      const logNext = () => {
        if (currentIdx >= targets.length) {
          setCampaignStatus("success");
          setAutoSendSuccess(`Đã hoàn thành gửi đến ${targets.length} người nhận!`);
          setIsSendingCampaign(false);
          setAutoSendTargetIds([]);
          setSelectedMessageIds([]);
          setManualRecipients("");
        } else {
          const target = targets[currentIdx];
          setCampaignLogs(prev => [...prev, { name: target.group_name, status: "sending" }]);
          
          setTimeout(() => {
            setCampaignLogs(prev => 
              prev.map((log, idx) => 
                idx === currentIdx ? { ...log, status: "success" as const } : log
              )
            );
            currentIdx++;
            logNext();
          }, 800);
        }
      };

      logNext();
    } catch (err) {
      setAutoSendError(err instanceof Error ? err.message : "Lỗi gửi tin.");
      setCampaignStatus("failed");
      setIsSendingCampaign(false);
    }
  };

  // Direct connection health check
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/zalo/health");
      if (res.ok) {
        const data = await res.json();
        if (data.status === "online") {
          setBackendStatus("online");
          return;
        }
      }
      setBackendStatus("offline");
    } catch {
      setBackendStatus("offline");
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loginAccountId, setLoginAccountId] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openLogin = (accountId: string) => {
    setLoginAccountId(accountId);
    setShowLoginModal(true);
  };

  const handleSync = async () => {
    if (!selectedAccountId) return;
    setIsSyncing(true);
    try {
      await syncZaloRecentConversations(selectedAccountId, 50, 50);
      await refreshConversations();
    } catch { /* no-op */ } finally {
      setIsSyncing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const removeSelectedFile = (idx: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!reply.trim() && selectedFiles.length === 0) || isSending) return;
    await sendMessage(reply, selectedFiles);
    setReply("");
    setSelectedFiles([]);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(e as any);
    }
  };

  const baseConvs: ZaloConv[] = (filtered ?? activeConvs ?? []) as ZaloConv[];
  const displayConvs = baseConvs.filter((c) => {
    if (filter === "unread") return c.unread;
    return true;
  });

  const selectedStatus = selectedAccountId ? getAccountStatus(selectedAccountId) : "offline";
  const selectedConvInfo = baseConvs.find((c) => c.conv_id === openConv);

  // ─── Render Backend Offline UI ────────────────────────────────────────────────
  if (backendStatus === "offline") {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-[#0b0c16] rounded-2xl border border-white/[0.06] shadow-2xl h-[calc(100vh-9.5rem)] lg:h-[calc(100vh-8.5rem)] w-full text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Không thể kết nối với Zalo Python Backend</h2>
        <p className="text-zinc-400 text-sm max-w-md mb-6 leading-relaxed">
          Next.js dashboard không kết nối được dịch vụ Python Crawler tại <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-400 font-mono text-xs">http://127.0.0.1:8000</code>. Vui lòng kiểm tra và khởi động backend.
        </p>
        
        <div className="bg-[#121324] border border-white/[0.05] rounded-xl p-4 text-left max-w-lg mb-6 w-full font-mono text-xs text-zinc-300">
          <p className="text-zinc-500 mb-1"># Cách khởi động dịch vụ Zalo Crawler:</p>
          <p className="text-zinc-400 mb-2">cd F:\Nam_3\work-security-zone\seedingTeam\scraper-linkedin\linkedin_group_crawler</p>
          <p className="text-indigo-400 font-semibold">python -m uvicorn app.main:app --host 0.0.0.0 --port 8000</p>
        </div>

        <button
          onClick={() => { setBackendStatus("checking"); checkHealth(); }}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 font-medium rounded-xl transition-all flex items-center gap-2 text-sm text-white"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Thử kết nối lại
        </button>
      </div>
    );
  }

  // ─── Render Main Layout UI ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-[#0b0c16] text-white rounded-2xl border border-white/[0.06] shadow-2xl h-[calc(100vh-9.5rem)] lg:h-[calc(100vh-8.5rem)] w-full overflow-hidden font-sans">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-in slide-in-from-top-2 ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {showLoginModal && (
        <LoginModal
          accountId={loginAccountId}
          onClose={() => setShowLoginModal(false)}
          onSuccess={() => { refreshAccounts(); refreshConversations(); }}
        />
      )}
      {showCreateModal && (
        <CreateAccountModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => { refreshAccounts(); onSelectAccount(id); }}
        />
      )}

      {/* ── Top Header and Tabs ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-[#101124] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Zalo Social Agent</h2>
            <p className="text-[10px] text-zinc-500">Realtime chat & scraper dashboard</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl">
          {[
            { key: "chat", label: "💬 Trò chuyện" },
            { key: "crawl", label: "🕸️ Scraper & Quét" },
            { key: "accounts", label: "⚙️ Tài khoản" }
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === t.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg text-emerald-400 text-[11px] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          Backend Online
        </div>
      </header>

      {/* ── Main Panel Area ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* ── Left Profile Sidebar (Shared across tabs) ── */}
        <aside className="w-[180px] flex-shrink-0 bg-[#0c0d18] border-r border-white/[0.05] flex flex-col justify-between p-3 shrink-0">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Tài khoản</span>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-5 h-5 rounded bg-indigo-600/10 hover:bg-indigo-600/30 text-indigo-400 flex items-center justify-center transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {loadingAccounts ? (
                <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-9 bg-white/5 rounded-xl animate-pulse" />)}</div>
              ) : sessions.length === 0 ? (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full py-4 border border-dashed border-white/10 rounded-xl text-zinc-500 text-xs hover:border-white/20 hover:text-zinc-400 transition-all"
                >
                  + Thêm tài khoản
                </button>
              ) : (
                <div className="space-y-1">
                  {(sessions as ZaloAccountInfo[]).map(acc => {
                    const status = getAccountStatus(acc.account_id);
                    const isSelected = acc.account_id === selectedAccountId;
                    return (
                      <button
                        key={acc.account_id}
                        onClick={() => onSelectAccount(acc.account_id)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left transition-all ${
                          isSelected ? "bg-indigo-600/20 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                        }`}
                      >
                        <div className="relative">
                          <Avatar name={acc.label || acc.account_id} size={26} />
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c0d18] ${
                            status === "online" ? "bg-emerald-400" :
                            status === "connecting" ? "bg-sky-400 animate-pulse" :
                            status === "expired" ? "bg-amber-400" : "bg-zinc-600"
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold truncate">{acc.label || acc.account_id}</p>
                          <p className="text-[9px] text-zinc-500 truncate">{acc.phone || "Chưa có SĐT"}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedAccountId && (
              <div className="space-y-1.5">
                {(selectedStatus === "offline" || selectedStatus === "expired") && (
                  <button
                    onClick={() => openLogin(selectedAccountId)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 text-xs font-semibold transition-all shadow-sm shadow-indigo-600/25"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Đăng nhập
                  </button>
                )}
                <button
                  onClick={() => restartZaloAccountListener(selectedAccountId).then(refreshAccounts)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Khởi động listener
                </button>
              </div>
            )}
          </div>

          {selectedAccountId && (
            <button
              onClick={() => confirm("Bạn muốn xoá tài khoản này khỏi hệ thống?") && deleteZaloAccount(selectedAccountId, true).then(() => { refreshAccounts(); onSelectAccount(""); })}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-red-400/50 hover:text-red-400 hover:bg-red-500/10 text-xs transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Xoá tài khoản
            </button>
          )}
        </aside>

        {/* ─── TAB 1: Chat Section ─── */}
        {activeTab === "chat" && (
          <div className="flex-1 flex overflow-hidden min-h-0 relative">
            {/* Column 2: Conversational list */}
            <div className="w-[260px] bg-[#111222] border-r border-white/[0.05] flex flex-col shrink-0">
              <div className="p-3 border-b border-white/[0.05] space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Tìm hội thoại..."
                      className="w-full pl-8 pr-2 py-1.5 bg-white/5 border border-transparent rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>
                  <button
                    onClick={handleSync}
                    disabled={!selectedAccountId || isSyncing}
                    title="Đồng bộ ngay"
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white disabled:opacity-30 transition-all"
                  >
                    <svg className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <div className="flex gap-1 bg-white/5 p-0.5 rounded-lg">
                  {(["all", "unread"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`flex-1 py-1 rounded-md text-[10px] font-semibold transition-all ${
                        filter === f ? "bg-indigo-600/30 text-indigo-300" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {f === "all" ? "Tất cả" : "Chưa đọc"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/5">
                {!selectedAccountId ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4 py-12">
                    <p className="text-zinc-500 text-xs">Chọn tài khoản Zalo để xem</p>
                  </div>
                ) : loadingConvs ? (
                  <div className="p-2 space-y-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex gap-2.5 p-2.5 rounded-xl animate-pulse">
                        <div className="w-8 h-8 bg-white/5 rounded-full" />
                        <div className="flex-1 space-y-1.5 py-0.5">
                          <div className="h-2.5 bg-white/5 rounded w-3/4" />
                          <div className="h-2 bg-white/5 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : displayConvs.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <p className="text-zinc-500 text-xs mb-2">Chưa có hội thoại nào</p>
                    <button
                      onClick={handleSync}
                      className="px-3 py-1 bg-white/5 hover:bg-white/10 text-zinc-400 text-xs rounded-lg transition-all"
                    >
                      Đồng bộ danh sách
                    </button>
                  </div>
                ) : (
                  <div className="p-1.5 space-y-0.5">
                    {displayConvs.map(conv => {
                      const convId = conv.conv_id;
                      const isOpen = openConv === convId;
                      const hasUnread = conv.unread;
                      return (
                        <button
                          key={convId}
                          onClick={() => openChat(convId)}
                          className={`w-full flex items-start gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-all ${
                            isOpen ? "bg-indigo-600/20 text-white" : "hover:bg-white/[0.04] text-zinc-300"
                          }`}
                        >
                          <Avatar name={conv.name || "?"} size={32} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <p className={`text-[11px] truncate ${hasUnread ? "font-bold text-white" : "font-semibold"}`}>
                                {conv.name || convId}
                              </p>
                              <span className="text-[9px] text-zinc-500 flex-shrink-0">
                                {conv.time || ""}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <p className={`text-[10px] truncate ${hasUnread ? "text-zinc-300 font-medium" : "text-zinc-500"}`}>
                                {conv.preview || ""}
                              </p>
                              {hasUnread && (
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Message conversation details */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0d0d16] justify-between">
              {!openConv ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-indigo-600/5 rounded-3xl flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-indigo-500/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-zinc-500 font-medium text-xs mb-1">Chọn cuộc trò chuyện</p>
                  <p className="text-zinc-600 text-[11px]">Tin nhắn Zalo sẽ xuất hiện tại đây</p>
                </div>
              ) : (
                <>
                  {/* Chat profile header */}
                  <div className="px-4 py-3 bg-[#111222] border-b border-white/[0.05] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <Avatar name={selectedConvInfo?.name || "?"} size={34} />
                      <div>
                        <h3 className="text-xs font-bold text-white">{selectedConvInfo?.name || openConv}</h3>
                        <p className="text-[9px] text-zinc-500">ID: {openConv}</p>
                      </div>
                    </div>
                    {/* Auto Send Toggle Button */}
                    <button
                      onClick={() => setIsAutoSendOpen(!isAutoSendOpen)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        isAutoSendOpen
                          ? "bg-red-600 text-white shadow-lg shadow-red-650/20"
                          : "bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                      </svg>
                      {isAutoSendOpen ? "Đóng Auto Send" : "Gửi hàng loạt (Auto)"}
                    </button>
                  </div>

                  {/* Message bubbles container */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scrollbar-thin scrollbar-thumb-white/5">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (messages as ZaloLibraryMessage[]).length === 0 ? (
                      <div className="text-center py-12 text-zinc-600 text-xs">Chưa có tin nhắn nào trong hộp thư này</div>
                    ) : (
                      (messages as ZaloLibraryMessage[]).map((msg, idx) => {
                        const isMine = msg.is_sent;
                        const prev = (messages as ZaloLibraryMessage[])[idx - 1];
                        const sameGroup = prev && prev.sender_id === msg.sender_id && prev.is_sent === msg.is_sent;
                        const isSelected = selectedMessageIds.includes(msg.id || "");
                        return (
                          <div key={msg.id || idx} className={`flex items-center gap-2 group ${isMine ? "justify-end" : "justify-start"} ${sameGroup ? "mt-0.5" : "mt-3"}`}>
                            {isAutoSendOpen && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (!msg.id) return;
                                  setSelectedMessageIds(prev =>
                                    prev.includes(msg.id)
                                      ? prev.filter(id => id !== msg.id)
                                      : [...prev, msg.id]
                                  );
                                }}
                                className="rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer w-3.5 h-3.5 shrink-0"
                              />
                            )}
                            <div className="flex items-start">
                              {!isMine && (
                                <div className="w-7 mr-2 flex items-end flex-shrink-0">
                                  {!sameGroup && <Avatar name={msg.sender_name || "?"} size={26} />}
                                </div>
                              )}
                              <div className="max-w-[70%]">
                                {!isMine && !sameGroup && (
                                  <p className="text-[9px] text-zinc-600 mb-0.5 ml-0.5 font-semibold">{msg.sender_name}</p>
                                )}
                                <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                                  isMine
                                    ? "bg-indigo-600 text-white rounded-tr-sm"
                                    : "bg-white/[0.07] text-zinc-200 rounded-tl-sm"
                                }`}>
                                  {msg.content || <span className="text-zinc-600 italic text-[11px]">[không có nội dung]</span>}
                                </div>
                                <p className={`text-[8px] text-zinc-600 mt-0.5 ${isMine ? "text-right" : "text-left ml-0.5"}`}>
                                  {formatMsgTime(msg.timestamp_text || msg.time_text)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Send and Quick Replies Footer */}
                  <div className="p-3 bg-[#111222] border-t border-white/[0.05] shrink-0 space-y-2">
                    {/* Quick templates replies bar */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {QUICK_REPLIES.map(q => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => setReply(q.text)}
                          className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/[0.04] text-[10px] font-semibold text-zinc-300 hover:text-white rounded-lg transition-all flex-shrink-0"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>

                    {sendError && <p className="text-red-400 text-[10px] px-1">{sendError}</p>}
                    <form onSubmit={handleSend} className="flex items-end gap-2">
                      <textarea
                        ref={textareaRef}
                        value={reply}
                        onChange={e => setReply(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Nhập tin nhắn..."
                        rows={1}
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/[0.05] rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 resize-none max-h-24 transition-colors"
                        style={{ minHeight: "36px" }}
                      />
                      <button
                        type="submit"
                        disabled={!reply.trim() || isSending}
                        className="w-9 h-9 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-xl text-white transition-all flex-shrink-0"
                      >
                        {isSending ? (
                          <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                          </svg>
                        )}
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>

            {/* Auto-Send Campaign Drawer (Slide-out panel) */}
            <section
              className={`absolute right-0 top-0 h-full w-[380px] max-w-[90vw] border-l border-white/[0.08] flex flex-col bg-[#0b0c16] overflow-hidden shadow-2xl z-40 transition-transform duration-300 ease-in-out ${
                isAutoSendOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              {/* Header */}
              <div className="p-4 border-b border-white/[0.06] flex items-center justify-between bg-[#101124] shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                    <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-white uppercase tracking-wide">Chiến dịch gửi hàng loạt</h2>
                    <p className="text-[9px] text-zinc-500">Tự động gửi tin nhắn mẫu đến nhiều người nhận</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAutoSendOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 transition-colors"
                  title="Đóng Auto Send"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {autoSendError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-xl">
                    {autoSendError}
                  </div>
                )}
                {autoSendSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-xl">
                    {autoSendSuccess}
                  </div>
                )}

                {/* Content Mode Selection */}
                <div className="border border-white/[0.05] rounded-xl p-3 bg-white/[0.02] space-y-2">
                  <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Chế độ nội dung</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["both", "text", "image"] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setCampaignMode(mode)}
                        className={`py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                          campaignMode === mode
                            ? "border-indigo-500 bg-indigo-600/20 text-white"
                            : "border-white/10 text-zinc-400 hover:border-white/20"
                        }`}
                      >
                        {mode === "both" ? "Text + Ảnh" : mode === "text" ? "Chỉ Text" : "Chỉ Ảnh"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 font-medium leading-relaxed">
                    Đã chọn <span className="font-bold text-indigo-400">{selectedMessageIds.length}</span> tin nhắn từ chat. Tích chọn các ô vuông bên cạnh tin nhắn để gửi.
                  </p>
                </div>

                {/* Manual Recipients Input */}
                <div className="border border-white/[0.05] rounded-xl p-3 bg-white/[0.02] space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Nhập người nhận thủ công</label>
                    <span className="text-[9px] text-zinc-500">Mỗi dòng một tên</span>
                  </div>
                  <textarea
                    value={manualRecipients}
                    onChange={e => setManualRecipients(e.target.value)}
                    rows={3}
                    placeholder="Nhập chính xác tên group hoặc cá nhân..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 resize-none transition-all"
                  />
                </div>

                {/* System Targets Checklist */}
                <div className="border border-white/[0.05] rounded-xl p-3 bg-white/[0.02] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Chọn từ hội thoại</label>
                    <button
                      type="button"
                      onClick={() => {
                        const filteredIds = activeConvs
                          .filter(c => c.name.toLowerCase().includes(autoSendSearchQuery.toLowerCase()))
                          .map(c => c.conv_id);
                        const allSelected = filteredIds.every(id => autoSendTargetIds.includes(id));
                        setAutoSendTargetIds(prev =>
                          allSelected
                            ? prev.filter(id => !filteredIds.includes(id))
                            : Array.from(new Set([...prev, ...filteredIds]))
                        );
                      }}
                      className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300"
                    >
                      Chọn/Bỏ tất cả
                    </button>
                  </div>

                  {/* Filter Search */}
                  <div className="relative flex items-center">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-650" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Tìm trong danh sách..."
                      value={autoSendSearchQuery}
                      onChange={e => setAutoSendSearchQuery(e.target.value)}
                      className="w-full bg-white/5 pl-8 pr-3 py-1 border border-white/10 rounded-lg text-[10px] text-white placeholder:text-zinc-600 outline-none focus:border-indigo-500/50"
                    />
                  </div>

                  {/* List */}
                  <div className="max-h-40 overflow-y-auto border border-white/5 rounded-lg p-1.5 space-y-1 bg-black/10 scrollbar-thin scrollbar-thumb-white/5">
                    {activeConvs.filter(c => c.name.toLowerCase().includes(autoSendSearchQuery.toLowerCase())).length === 0 ? (
                      <p className="text-center py-6 text-zinc-600 text-[10px]">Không tìm thấy hội thoại nào</p>
                    ) : (
                      activeConvs
                        .filter(c => c.name.toLowerCase().includes(autoSendSearchQuery.toLowerCase()))
                        .map(c => {
                          const checked = autoSendTargetIds.includes(c.conv_id);
                          return (
                            <label
                              key={c.conv_id}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                                checked
                                  ? "bg-indigo-600/10 border-indigo-500/30 text-white font-semibold"
                                  : "bg-transparent border-transparent text-zinc-400 hover:bg-white/5"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setAutoSendTargetIds(prev =>
                                    prev.includes(c.conv_id)
                                      ? prev.filter(id => id !== c.conv_id)
                                      : [...prev, c.conv_id]
                                  );
                                }}
                                className="rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer w-3 h-3"
                              />
                              <span className="truncate flex-1 text-[11px]">{c.name || c.conv_id}</span>
                            </label>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* Campaign progress logs */}
                {campaignStatus && (
                  <div className="border border-white/[0.05] rounded-xl p-3 bg-[#080911] space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                      <span className="text-zinc-500">Tiến trình</span>
                      <span
                        className={
                          campaignStatus === "success"
                            ? "text-emerald-400"
                            : campaignStatus === "sending"
                            ? "text-blue-400"
                            : "text-red-400"
                        }
                      >
                        {campaignStatus === "sending" ? "Đang chạy" : campaignStatus === "success" ? "Hoàn thành" : "Thất bại"}
                      </span>
                    </div>

                    <div className="max-h-28 overflow-y-auto space-y-1 divide-y divide-white/[0.03] text-[10px] font-mono scrollbar-thin scrollbar-thumb-white/5">
                      {campaignLogs.map((log, idx) => (
                        <div key={idx} className="flex justify-between py-1 first:pt-0">
                          <span className="text-zinc-400 truncate max-w-[200px]">{log.name}</span>
                          <span
                            className={
                              log.status === "success"
                                ? "text-emerald-400"
                                : log.status === "failed"
                                ? "text-red-400"
                                : "text-blue-400 animate-pulse"
                            }
                          >
                            {log.status === "success" ? "✓ Thành công" : log.status === "failed" ? "✗ Lỗi" : "⌛ Đang gửi..."}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer action button */}
              <div className="p-4 border-t border-white/[0.06] bg-[#101124] shrink-0">
                <button
                  onClick={handleSendCampaign}
                  disabled={isSendingCampaign || targets.length === 0}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {isSendingCampaign ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Đang gửi hàng loạt...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      <span>Bắt đầu gửi ({targets.length} người nhận)</span>
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ─── TAB 2: Crawl / Scraper Setup Section ─── */}
        {activeTab === "crawl" && (
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-[#0c0d18] p-4 gap-4">
            
            {/* Left: Input setup list */}
            <div className="flex-1 bg-[#111222] border border-white/[0.05] rounded-2xl p-4 flex flex-col min-h-0 justify-between">
              <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                <div>
                  <h3 className="text-sm font-bold text-white">🕷️ Quét nhóm Zalo</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-relaxed">
                    Nhập tên nhóm Zalo cần crawl tin nhắn và tên Tab Google Sheet tương ứng. Bấm "Kiểm tra nhóm" để xác minh.
                  </p>
                </div>

                {/* Group input list */}
                <div className="space-y-2">
                  {crawlFlow.groupRows.map((row: ZaloGroupInputRow, index: number) => {
                    const isVerified = row.verifyStatus === "verified";
                    return (
                      <div key={row.id} className="bg-white/5 border border-white/[0.04] p-3 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400">Dòng {index + 1}</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-semibold ${
                            isVerified ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {row.verifyStatus === "verified" ? "Đã xác minh" : row.verifyStatus === "unchecked" ? "Chưa kiểm tra" : "Lỗi/Sai tên"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={row.groupName}
                            onChange={e => crawlFlow.updateGroupRow(row.id, "groupName", e.target.value)}
                            placeholder="Tên nhóm Zalo chính xác"
                            className="px-2.5 py-1.5 bg-white/5 border border-transparent rounded-lg text-xs placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
                          />
                          <input
                            value={row.sheetTab}
                            onChange={e => crawlFlow.updateGroupRow(row.id, "sheetTab", e.target.value)}
                            placeholder="Tên Tab Sheet (vd: Zalo-1)"
                            className="px-2.5 py-1.5 bg-white/5 border border-transparent rounded-lg text-xs placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
                          />
                        </div>
                        {row.verifyMessage && (
                          <p className="text-[9px] text-amber-400 leading-normal">{row.verifyMessage}</p>
                        )}
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => crawlFlow.removeGroupRow(row.id)}
                            className="text-[9px] font-semibold text-red-400 hover:text-red-300"
                          >
                            Xoá dòng
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={crawlFlow.addGroupRow}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-semibold rounded-xl transition-all"
                  >
                    + Thêm dòng quét
                  </button>
                  <button
                    onClick={crawlFlow.verifyGroupRows}
                    disabled={crawlFlow.isVerifyingGroups || crawlFlow.groupRows.length === 0}
                    className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold rounded-xl transition-all disabled:opacity-40"
                  >
                    {crawlFlow.isVerifyingGroups ? "Đang kiểm tra..." : "🔍 Kiểm tra nhóm"}
                  </button>
                </div>
              </div>

              {/* Start Crawl configuration footer */}
              <div className="mt-4 pt-4 border-t border-white/[0.05] space-y-3 shrink-0">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Giới hạn tin nhắn/nhóm:</span>
                  <span className="font-mono font-bold text-white">{crawlFlow.maxMessagesPerGroup} tin</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="10"
                  value={crawlFlow.maxMessagesPerGroup}
                  onChange={e => crawlFlow.setMaxMessagesPerGroup(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />

                <button
                  onClick={crawlFlow.startCrawlForGroups}
                  disabled={crawlFlow.isSubmittingGroups}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
                >
                  {crawlFlow.isSubmittingGroups ? "Đang khởi động tiến trình..." : "🚀 BẮT ĐẦU QUÉT GROUP (CRAWL)"}
                </button>
              </div>
            </div>

            {/* Right: Crawl Progress and Jobs Tracker */}
            <div className="w-full lg:w-[320px] bg-[#111222] border border-white/[0.05] rounded-2xl p-4 flex flex-col min-h-0 shrink-0">
              <h3 className="text-sm font-bold text-white mb-1">⏱️ Trạng thái & Tiến độ</h3>
              <p className="text-[10px] text-zinc-500 mb-4 leading-normal">
                Xem thống kê crawl và danh sách các Job hiện tại được gửi sang Python Backend.
              </p>

              {/* Progress Summary Cards */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-white/5 border border-white/[0.03] p-2.5 rounded-xl text-center">
                  <p className="text-[9px] text-zinc-500 uppercase font-semibold">Tổng group</p>
                  <p className="text-lg font-bold text-white mt-0.5">{crawlFlow.summary.total}</p>
                </div>
                <div className="bg-white/5 border border-white/[0.03] p-2.5 rounded-xl text-center">
                  <p className="text-[9px] text-zinc-500 uppercase font-semibold">Đã hoàn thành</p>
                  <p className="text-lg font-bold text-emerald-400 mt-0.5">{crawlFlow.summary.completed}</p>
                </div>
                <div className="bg-white/5 border border-white/[0.03] p-2.5 rounded-xl text-center">
                  <p className="text-[9px] text-zinc-500 uppercase font-semibold">Thu thập được</p>
                  <p className="text-lg font-bold text-indigo-400 mt-0.5">{crawlFlow.summary.totalMessages} tin</p>
                </div>
                <div className="bg-white/5 border border-white/[0.03] p-2.5 rounded-xl text-center">
                  <p className="text-[9px] text-zinc-500 uppercase font-semibold">Tiến độ chung</p>
                  <p className="text-lg font-bold text-white mt-0.5">{crawlFlow.summary.overallProgressPercent}%</p>
                </div>
              </div>

              {/* Scrollable Jobs list */}
              <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-white/5">
                <p className="text-[10px] font-bold text-zinc-400 mb-1">Danh sách Job đang chạy</p>
                {crawlFlow.jobs.length === 0 ? (
                  <div className="text-center py-8 text-zinc-600 text-xs">Chưa có job cào dữ liệu nào chạy.</div>
                ) : (
                  (crawlFlow.jobs as ZaloTrackedJobState[]).map(job => (
                    <div key={job.jobId} className="bg-white/5 border border-white/[0.04] p-2.5 rounded-xl text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white truncate max-w-[150px]">{job.groupName}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                          job.status === "completed" ? "bg-emerald-500/10 text-emerald-400" :
                          job.status === "failed" ? "bg-red-500/10 text-red-400" :
                          "bg-indigo-500/10 text-indigo-400 animate-pulse"
                        }`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span>Đã lấy: {job.progress.messages_collected} tin</span>
                        <span>Ảnh: {job.progress.images_found}</span>
                      </div>
                      {job.error && (
                        <p className="text-[9px] text-red-400 leading-normal">{job.error}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: Accounts Setup & Instructions ─── */}
        {activeTab === "accounts" && (
          <div className="flex-1 overflow-y-auto bg-[#0c0d18] p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/5">
            <div>
              <h3 className="text-sm font-bold text-white">⚙️ Quản lý tài khoản & Thiết lập</h3>
              <p className="text-xs text-zinc-500 mt-1">Cấu hình kết nối extension tự động hoặc khởi động lại worker cho Zalo.</p>
            </div>

            {/* Extension Guide card */}
            <div className="bg-[#111222] border border-white/[0.05] rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Chrome Extension Login</h4>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Để lấy cookies Zalo tự động và đồng bộ, bạn cần load extension trong trình duyệt của mình:
              </p>
              
              <ul className="text-xs text-zinc-400 space-y-2 list-disc pl-5">
                <li>Mở trình duyệt Chrome hoặc Edge và vào đường dẫn: <code className="bg-white/5 px-1 py-0.5 rounded text-white text-[11px]">chrome://extensions/</code></li>
                <li>Bật chế độ **Developer mode** ở góc trên cùng bên phải.</li>
                <li>Bấm nút **Load unpacked** ở góc trên cùng bên trái.</li>
                <li>Chọn thư mục <code className="bg-white/5 px-1 py-0.5 rounded text-white text-[11px]">extension-login-zalo</code> nằm ngay tại thư mục gốc của dự án này.</li>
                <li>Quay lại tab này, chọn tài khoản bên trái và bấm **Đăng nhập** để mở Zalo và capture cookie.</li>
              </ul>
            </div>

            {/* Listener worker details */}
            <div className="bg-[#111222] border border-white/[0.05] rounded-2xl p-4 space-y-4">
              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Trạng thái tiến trình (Workers)</h4>
              
              <div className="space-y-2">
                {sessions.map((acc: ZaloAccountInfo) => {
                  const status = getAccountStatus(acc.account_id);
                  return (
                    <div key={acc.account_id} className="bg-white/5 p-3 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-white">{acc.label || acc.account_id}</p>
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">ID: {acc.account_id}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            status === "online" ? "bg-emerald-500/10 text-emerald-400" :
                            status === "connecting" ? "bg-sky-500/10 text-sky-400 animate-pulse" :
                            status === "expired" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-800 text-zinc-400"
                          }`}>
                            {status === "online" ? "Đang chạy" :
                             status === "connecting" ? "Đang kết nối..." :
                             status === "expired" ? "Hết hạn" : "Ngoại tuyến"}
                          </span>
                          {acc.listener?.last_event_at && (
                            <p className="text-[8px] text-zinc-600 mt-1">Sự kiện cuối: {timeAgo(acc.listener.last_event_at)}</p>
                          )}
                        </div>
                        <button
                          onClick={() => restartZaloAccountListener(acc.account_id).then(refreshAccounts)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-[10px] text-white font-bold rounded-lg transition-all"
                        >
                          Restart
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
