"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";
import { MaterialIcon } from "@/components/ui";
import { useAppAuth } from "@/contexts/AppAuthContext";
import type { ZaloCrawlerFlowValue } from "@/hooks/useZaloCrawlerFlow";
import { getZaloInboxReport } from "@/services/zaloCrawlerService";
import type { ZaloInboxReportResponse } from "@/types/zalo-api";

const ACCOUNT_OWNER_ID = "default";

interface ZaloAccountManagerPanelProps {
  flow: ZaloCrawlerFlowValue;
}

function formatTime(value?: string | null) {
  if (!value) return "Chưa có";
  const num = Number(value);
  const date = !Number.isNaN(num) && String(num) === String(value).trim() ? new Date(num) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function ZaloAccountManagerPanel({ flow }: ZaloAccountManagerPanelProps) {
  const router = useRouter();
  const { user } = useAppAuth();
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [report, setReport] = useState<ZaloInboxReportResponse | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  const selectedAccount = useMemo(
    () => flow.accounts.find((account) => account.account_id === flow.userId),
    [flow.accounts, flow.userId],
  );

  const loadReport = useCallback(async () => {
    setIsLoadingReport(true);
    setReportError(null);
    try {
      const response = await getZaloInboxReport(ACCOUNT_OWNER_ID, flow.accounts.map((account) => account.account_id));
      setReport(response);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Khong the tai bao cao inbox.");
    } finally {
      setIsLoadingReport(false);
    }
  }, [flow.accounts, flow.userId]);

  useEffect(() => {
    void loadReport();
    const timer = window.setInterval(() => {
      void loadReport();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadReport]);

  async function handleCreateAccount() {
    await flow.createAccount(label, phone);
    setLabel("");
    setPhone("");
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col h-full">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800">Tài khoản Zalo</h2>
          <p className="text-sm text-slate-500 mt-1">
            Mỗi account slot có session, listener và dữ liệu Supabase riêng. Một bạn MKT có thể quản lý nhiều Zalo cá nhân tại đây.
          </p>
        </div>

        <div className="mb-6 grid gap-4">
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Tên account, ví dụ: MKT 01"
            className="border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:border-[#E3000F] focus:ring-2 focus:ring-[#E3000F]/20 focus:outline-none transition-all"
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Số điện thoại nếu cần"
            className="border border-slate-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:border-[#E3000F] focus:ring-2 focus:ring-[#E3000F]/20 focus:outline-none transition-all"
          />
          <button
            type="button"
            onClick={() => void handleCreateAccount()}
            className="bg-[#E3000F] text-white inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold hover:bg-red-700 transition shadow-sm"
          >
            <MaterialIcon name="add" className="text-[18px]" />
            Thêm account
          </button>
        </div>

        {flow.accountsError ? (
          <div className="bg-red-50 text-red-600 mb-6 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium">
            {flow.accountsError}
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {flow.accounts.map((account) => {
            const active = account.account_id === flow.userId;
            const listener = account.listener;
            return (
              <article
                key={account.account_id}
                className={`rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:shadow-md ${
                  active
                    ? "border-[#E3000F] bg-red-50"
                    : "border-slate-200 bg-white hover:border-[#E3000F]/30"
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-red-100 to-red-200/50 flex items-center justify-center text-xl font-bold text-[#E3000F] shadow-inner border border-red-200 shrink-0">
                      {account.label?.[0]?.toUpperCase() || "Z"}
                    </div>
                    <div className="min-w-0">
                      <div className={`font-bold text-lg truncate ${active ? 'text-red-900' : 'text-slate-800'}`}>
                        {account.label || "Tài khoản"}
                      </div>
                      <div className={`text-sm font-mono truncate ${active ? 'text-red-700/80' : 'text-slate-500'}`}>
                        {account.account_id}
                      </div>
                    </div>
                  </div>
                  {active ? (
                    <span className="rounded-full bg-[#E3000F] px-3 py-1 text-[11px] font-bold text-white uppercase tracking-wider shadow-sm shrink-0">
                      Đang chọn
                    </span>
                  ) : null}
                </div>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                   <div className="bg-white/60 rounded-xl p-3 border border-slate-100/50">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Trạng thái Auth</div>
                      <div className={`text-sm font-bold flex items-center gap-1.5 ${account.has_auth ? 'text-green-600' : 'text-slate-600'}`}>
                         <span className={`h-2.5 w-2.5 rounded-full ${account.has_auth ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                         {account.has_auth ? "Đã login" : "Chưa login"}
                      </div>
                   </div>
                   <div className="bg-white/60 rounded-xl p-3 border border-slate-100/50">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Listener</div>
                      <div className={`text-sm font-bold flex items-center gap-1.5 ${listener?.connected ? 'text-green-600' : listener?.running ? 'text-amber-500' : 'text-slate-600'}`}>
                         <span className={`h-2.5 w-2.5 rounded-full ${listener?.connected ? 'bg-green-500' : listener?.running ? 'bg-amber-500' : 'bg-slate-400'}`}></span>
                         {listener?.connected ? "Online" : listener?.running ? "Đang chạy" : "Tắt"}
                      </div>
                   </div>
                </div>
                <div className="text-sm font-medium text-slate-600 mb-4 px-1">
                  Tin nhắn đã thấy: <span className="font-bold text-slate-800">{listener?.messages_seen ?? 0}</span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => flow.switchAccount(account.account_id)}
                    className="flex-1 bg-white border border-slate-200 hover:border-[#E3000F] hover:text-[#E3000F] rounded-xl px-4 py-2.5 text-sm font-bold transition-all shadow-sm active:scale-95 text-slate-700 flex justify-center"
                  >
                    Chọn tài khoản
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (account.account_id !== flow.userId) {
                        flow.switchAccount(account.account_id);
                      }
                      if (user?.role === "leader" || user?.role === "admin") {
                        router.push(`/all-platform/zalo-inbox`);
                      } else {
                        router.push("/zalo-chat");
                      }
                    }}
                    disabled={!account.has_auth}
                    className="flex-1 bg-[#E3000F] hover:bg-[#C40009] disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 text-sm font-bold transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5"
                    title={account.has_auth ? "Mở Zalo Chat" : "Cần đăng nhập tài khoản trước"}
                  >
                    <MaterialIcon name="open_in_new" className="text-[18px]" />
                    Mở chat
                  </button>
                  <button
                    type="button"
                    onClick={() => void flow.deleteAccount(account.account_id, false)}
                    className="bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <MaterialIcon name="visibility_off" className="text-[18px]" />
                    Ẩn
                  </button>
                </div>
              </article>
            );
          })}
          {flow.accounts.length === 0 && !flow.isLoadingAccounts ? (
            <div className="bg-slate-50 rounded-2xl border border-slate-200 px-6 py-10 text-center flex flex-col items-center justify-center">
              <MaterialIcon name="account_circle" className="text-4xl text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 font-medium">Chưa có account nào. Hãy tạo account mới.</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Báo cáo Inbox MKT</h2>
            <p className="text-sm text-slate-500 mt-1">
              Tổng hợp từ tin nhắn listener/crawl theo từng account Zalo.
              {selectedAccount ? ` Đang xem: ${selectedAccount.label}.` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/zalo-chat")}
              disabled={!flow.isLoggedIn}
              className="bg-[#E3000F] hover:bg-[#C40009] disabled:bg-slate-300 disabled:cursor-not-allowed text-white inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition shadow-sm"
              title="Mở trang Zalo Chat full-screen"
            >
              <MaterialIcon name="open_in_new" className="text-[18px]" />
              Mở chat Full Screen
            </button>
            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={isLoadingReport}
              className="bg-white border border-slate-200 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm disabled:opacity-60"
            >
              <MaterialIcon name="refresh" className="text-[18px]" />
              Tải lại
            </button>
          </div>
        </div>

        {reportError ? (
          <div className="bg-red-50 text-red-600 mb-6 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium">
            {reportError}
          </div>
        ) : null}

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Tin nhắn</div>
            <div className="text-3xl font-black text-slate-800 mt-1">{report?.total_messages ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Khách hàng</div>
            <div className="text-3xl font-black text-slate-800 mt-1">{report?.total_customers ?? 0}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-red-50 p-5 shadow-sm">
            <div className="text-sm font-semibold text-red-700/80 uppercase tracking-wide">Account đang chọn</div>
            <div className="text-xl font-bold text-red-900 mt-2 truncate">{selectedAccount?.label ?? flow.userId}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-4">Khách hàng / Hội thoại</th>
                <th className="py-3 px-4 text-center">Tổng Tin</th>
                <th className="py-3 px-4 text-center">Gửi</th>
                <th className="py-3 px-4 text-center">Nhận</th>
                <th className="py-3 px-4">Gần nhất</th>
                <th className="py-3 px-4 w-full">Nội dung mới</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(report?.customers ?? []).map((row) => (
                <tr key={`${row.account_id}-${row.customer_id}`} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-4 font-bold text-slate-800">{row.account_label}</td>
                  <td className="py-3 px-4 font-medium text-slate-700">{row.conversation_name || row.customer_name}</td>
                  <td className="py-3 px-4 text-center font-semibold bg-slate-50/50">{row.message_count}</td>
                  <td className="py-3 px-4 text-center font-medium text-blue-600">{row.sent_count}</td>
                  <td className="py-3 px-4 text-center font-medium text-green-600">{row.received_count}</td>
                  <td className="py-3 px-4 text-slate-500">{formatTime(row.latest_message_at)}</td>
                  <td className="py-3 px-4 text-slate-600 truncate max-w-[300px]">{row.latest_content || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report && report.customers.length === 0 ? (
            <div className="py-10 text-center text-slate-500 font-medium">
              Chưa có dữ liệu inbox cho các account này.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
