"use client";

/**
 * Modal tạo/sửa 1 "Chiến dịch tự động" — đối chiếu hợp đồng dữ liệu ở
 * app/api/campaigns/route.ts, app/api/campaigns/[id]/route.ts,
 * app/api/campaigns/[id]/recipients/route.ts (route [id] và recipients do
 * agent khác viết song song, cùng lúc với file này — KHÔNG sửa các route đó).
 *
 * Ghi chú `url` vs `previewUrl` ảnh đính kèm (xem app/api/uploads/route.ts):
 * `url` là hostname NỘI BỘ Docker (vd http://zalo-account-module:3002/...) —
 * đây là giá trị lưu vào `message_templates[].image_urls`, KHÔNG render được
 * trong <img> ở trình duyệt người dùng. Lúc mới upload ta có sẵn `previewUrl`
 * (đường dẫn tương đối) từ response để hiển thị ngay. Khi MỞ LẠI 1 chiến dịch
 * đã lưu, ta chỉ còn `url` — suy ra lại đường dẫn hiển thị bằng cách lấy phần
 * pathname của `url` (`/api/uploads/<filename>`), vì route GET
 * /api/uploads/[filename] serve công khai theo path này bất kể ai đã upload.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { apiUrl } from "@/lib/basePath";
import type { MessageTemplate, ZaloAccountSummary, ZaloCampaign, ZaloCampaignLog } from "@/lib/types";
import { alert, btn, btnSize, input, label, modal, pill, select, table, textarea } from "@/lib/ui";
import { EditableTemplate, TemplateEditor, TemplateImage } from "./TemplateEditor";

const DAY_CHIPS: Array<{ value: number; label: string }> = [
  { value: 1, label: "T2" },
  { value: 2, label: "T3" },
  { value: 3, label: "T4" },
  { value: 4, label: "T5" },
  { value: 5, label: "T6" },
  { value: 6, label: "T7" },
  { value: 7, label: "CN" },
];

type CampaignStats = { total: number; pending: number; sent: number; failed: number; not_found: number };

type Props = {
  mode: "create" | "edit";
  campaign: ZaloCampaign | null;
  accounts: ZaloAccountSummary[];
  defaultAccountId: string;
  onClose: () => void;
  onSaved: () => void;
};

function deriveDisplayUrl(internalUrl: string): string {
  try {
    return new URL(internalUrl).pathname;
  } catch {
    return internalUrl; // đã là đường dẫn tương đối (hoặc giá trị lạ) — dùng nguyên trạng
  }
}

function toEditableTemplates(templates?: MessageTemplate[] | null): EditableTemplate[] {
  if (!templates || templates.length === 0) return [{ text: "", images: [] }];
  return templates.map((t) => ({
    text: t.text || "",
    images: (t.image_urls || []).map((url): TemplateImage => ({ url, previewUrl: deriveDisplayUrl(url) })),
  }));
}

/** Đếm số điện thoại hợp lệ trong text người dùng dán vào — chỉ để hiển thị trực quan, server tự chuẩn hoá lại. */
function countPhones(text: string): number {
  const seen = new Set<string>();
  for (const token of text.split(/[\s,;]+/)) {
    const digits = token.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 12) continue;
    seen.add(digits.startsWith("0") ? `84${digits.slice(1)}` : digits);
  }
  return seen.size;
}

/** Tách theo đúng quy tắc server dùng để chuẩn hoá (xem normalizePhones ở app/api/campaigns/route.ts) — khoảng trắng/dấu phẩy/chấm phẩy/xuống dòng đều là dấu phân tách, để không lệch với countPhones() ở trên. */
function parsePhones(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function statusPill(status: string) {
  switch (status) {
    case "success":
    case "sent":
      return pill.success;
    case "failed":
    case "not_found":
      return pill.danger;
    case "pending":
      return pill.info;
    default:
      return pill.neutral;
  }
}

export function CampaignFormModal({ mode, campaign, accounts, defaultAccountId, onClose, onSaved }: Props) {
  const [accountId, setAccountId] = useState(campaign?.account_id || defaultAccountId || accounts[0]?.account_id || "");
  const [name, setName] = useState(campaign?.name || "");
  const [startTime, setStartTime] = useState(campaign?.start_time || "09:00");
  const [endTime, setEndTime] = useState(campaign?.end_time || "17:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    campaign?.days_of_week && campaign.days_of_week.length > 0 ? campaign.days_of_week : [1, 2, 3, 4, 5, 6, 7]
  );
  const [intervalMin, setIntervalMin] = useState(campaign?.interval_seconds_min ?? 2);
  const [intervalMax, setIntervalMax] = useState(campaign?.interval_seconds_max ?? 10);
  const [dailyLimit, setDailyLimit] = useState(campaign?.daily_limit ?? 50);
  const [templates, setTemplates] = useState<EditableTemplate[]>(() => toEditableTemplates(campaign?.message_templates));
  const [phonesText, setPhonesText] = useState("");

  const [addPhonesText, setAddPhonesText] = useState("");
  const [addingRecipients, setAddingRecipients] = useState(false);

  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<ZaloCampaignLog[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(mode === "edit");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const phoneCount = useMemo(() => countPhones(phonesText), [phonesText]);
  const addPhoneCount = useMemo(() => countPhones(addPhonesText), [addPhonesText]);

  // Nạp lại chi tiết + thống kê + nhật ký gần nhất từ endpoint GET /api/campaigns/[id]
  // (khác GET /api/campaigns danh sách — chỉ endpoint chi tiết mới trả stats/recent_logs).
  useEffect(() => {
    if (mode !== "edit" || !campaign) return;
    let cancelled = false;
    setLoadingDetail(true);
    fetch(apiUrl(`/api/campaigns/${campaign.id}`), { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.campaign) {
          const c: ZaloCampaign = data.campaign;
          setAccountId(c.account_id);
          setName(c.name);
          setStartTime(c.start_time);
          setEndTime(c.end_time);
          setDaysOfWeek(c.days_of_week && c.days_of_week.length > 0 ? c.days_of_week : [1, 2, 3, 4, 5, 6, 7]);
          setIntervalMin(c.interval_seconds_min);
          setIntervalMax(c.interval_seconds_max);
          setDailyLimit(c.daily_limit);
          setTemplates(toEditableTemplates(c.message_templates));
        }
        if (data?.stats) setStats(data.stats);
        if (Array.isArray(data?.recent_logs)) setRecentLogs(data.recent_logs);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, campaign?.id]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  function toggleDay(d: number) {
    setDaysOfWeek((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  }

  function updateTemplate(idx: number, next: EditableTemplate) {
    setTemplates((prev) => prev.map((t, i) => (i === idx ? next : t)));
  }
  function addTemplate() {
    setTemplates((prev) => [...prev, { text: "", images: [] }]);
  }
  function removeTemplate(idx: number) {
    setTemplates((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function handleSave() {
    setError(null);
    if (!accountId) {
      setError("Vui lòng chọn tài khoản nhắn.");
      return;
    }
    if (!name.trim()) {
      setError("Vui lòng nhập tên chiến dịch.");
      return;
    }
    if (daysOfWeek.length === 0) {
      setError("Chọn ít nhất 1 ngày trong tuần để chiến dịch chạy.");
      return;
    }
    if (intervalMax < intervalMin) {
      setError("Giãn cách tối đa phải lớn hơn hoặc bằng giãn cách tối thiểu.");
      return;
    }
    const cleanTemplates: MessageTemplate[] = templates
      .map((t) => ({ text: t.text.trim(), image_urls: t.images.map((im) => im.url) }))
      .filter((t) => t.text.length > 0 || t.image_urls.length > 0);
    if (cleanTemplates.length === 0) {
      setError("Cần ít nhất 1 nội dung tin nhắn (chữ hoặc ảnh).");
      return;
    }
    if (mode === "create" && phoneCount === 0) {
      setError("Vui lòng dán ít nhất 1 số điện thoại người nhận.");
      return;
    }

    const payload = {
      account_id: accountId,
      name: name.trim(),
      start_time: startTime,
      end_time: endTime,
      days_of_week: daysOfWeek,
      interval_seconds_min: intervalMin,
      interval_seconds_max: intervalMax,
      daily_limit: dailyLimit,
      message_templates: cleanTemplates,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        const res = await fetch(apiUrl("/api/campaigns"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, phones: parsePhones(phonesText) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      } else if (campaign) {
        const res = await fetch(apiUrl(`/api/campaigns/${campaign.id}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được chiến dịch.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRecipients() {
    if (!campaign) return;
    const phones = parsePhones(addPhonesText);
    if (phones.length === 0) {
      setError("Nhập ít nhất 1 số điện thoại để thêm.");
      return;
    }
    setAddingRecipients(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/campaigns/${campaign.id}/recipients`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice(`Đã thêm ${data?.added ?? phones.length} số điện thoại vào chiến dịch.`);
      setAddPhonesText("");
      const detailRes = await fetch(apiUrl(`/api/campaigns/${campaign.id}`), { cache: "no-store" });
      const detailData = await detailRes.json().catch(() => ({}));
      if (detailData?.stats) setStats(detailData.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thêm được số điện thoại.");
    } finally {
      setAddingRecipients(false);
    }
  }

  return (
    <div className={`${modal.overlay} flex items-center justify-center`}>
      <div className={`${modal.panel} flex max-h-[90vh] w-full max-w-3xl flex-col p-0`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {mode === "create" ? "Tạo chiến dịch tự động" : `Sửa chiến dịch "${campaign?.name}"`}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error ? (
            <div className={`${alert.error} justify-between`}>
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </span>
              <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className={`${alert.success} justify-between`}>
              <span className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {notice}
              </span>
              <button type="button" onClick={() => setNotice(null)} className="text-emerald-400 hover:text-emerald-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {/* Tài khoản + tên chiến dịch */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Tài khoản nhắn</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${select} w-full`}>
                <option value="">— Chọn tài khoản —</option>
                {accounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>
                    {a.display_name || a.account_id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Tên chiến dịch</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="vd: Chăm sóc khách cũ hàng ngày"
                className={input}
              />
            </div>
          </div>

          {/* Lịch chạy */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              Lịch chạy
            </div>
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <div>
                <label className={label}>Giờ bắt đầu</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Giờ kết thúc</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={input} />
              </div>
            </div>
            <div className="mt-3">
              <label className={label}>
                <Calendar className="mr-1 inline h-3 w-3" />
                Ngày hoạt động trong tuần
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DAY_CHIPS.map((d) => {
                  const active = daysOfWeek.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`h-8 w-12 rounded-md border text-xs font-semibold transition-colors ${
                        active
                          ? "border-brand bg-brand text-white shadow-sm"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Giãn cách + giới hạn */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <ShieldAlert className="h-3.5 w-3.5" />
              Giãn cách &amp; giới hạn
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={label}>Giãn cách tối thiểu (giây)</label>
                <input
                  type="number"
                  min={1}
                  value={intervalMin}
                  onChange={(e) => setIntervalMin(Math.max(1, Number(e.target.value) || 0))}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Giãn cách tối đa (giây)</label>
                <input
                  type="number"
                  min={1}
                  value={intervalMax}
                  onChange={(e) => setIntervalMax(Math.max(1, Number(e.target.value) || 0))}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Giới hạn tin/ngày</label>
                <input
                  type="number"
                  min={1}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Math.max(1, Number(e.target.value) || 0))}
                  className={input}
                />
              </div>
            </div>
            <div className={`${alert.info} mt-2.5`}>
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Giãn cách quá ngắn hoặc giới hạn/ngày quá cao dễ khiến tài khoản Zalo bị đánh dấu spam hoặc khoá.
                Mặc định 2–10 giây/tin là mức tối thiểu khuyến nghị — không nên đặt thấp hơn, và nên giữ giới hạn/ngày
                ở mức vừa phải.
              </span>
            </div>
          </div>

          {/* Nội dung xoay vòng */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nội dung tin nhắn (xoay vòng)</span>
              <button type="button" onClick={addTemplate} className={`${btn.outline} ${btnSize.sm}`}>
                <Plus className="h-3.5 w-3.5" />
                Thêm nội dung
              </button>
            </div>
            <div className="space-y-3">
              {templates.map((t, i) => (
                <TemplateEditor
                  key={i}
                  index={i}
                  template={t}
                  canRemove={templates.length > 1}
                  onChange={(next) => updateTemplate(i, next)}
                  onRemove={() => removeTemplate(i)}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Mỗi lần gửi, chiến dịch tự lấy lần lượt từng nội dung ở trên theo vòng tròn (round-robin).
            </p>
          </div>

          {/* Người nhận */}
          {mode === "create" ? (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Users className="h-3.5 w-3.5" />
                Người nhận
              </div>
              <textarea
                value={phonesText}
                onChange={(e) => setPhonesText(e.target.value)}
                rows={5}
                placeholder={"Dán danh sách số điện thoại, mỗi số 1 dòng (hoặc cách nhau bởi dấu phẩy)\nvd: 0912345678\n0987654321"}
                className={`${textarea} font-mono placeholder:font-sans`}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Nhận diện được <strong className="text-slate-700">{phoneCount}</strong> số điện thoại hợp lệ.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <UserPlus className="h-3.5 w-3.5" />
                Thêm số điện thoại vào chiến dịch
              </div>
              <textarea
                value={addPhonesText}
                onChange={(e) => setAddPhonesText(e.target.value)}
                rows={3}
                placeholder={"Dán thêm số điện thoại mới, mỗi số 1 dòng"}
                className={`${textarea} font-mono placeholder:font-sans`}
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  Nhận diện được <strong className="text-slate-700">{addPhoneCount}</strong> số điện thoại hợp lệ.
                </p>
                <button
                  type="button"
                  onClick={() => void handleAddRecipients()}
                  disabled={addingRecipients || addPhoneCount === 0}
                  className={`${btn.outline} ${btnSize.sm}`}
                >
                  {addingRecipients ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  Thêm vào chiến dịch
                </button>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Thống kê người nhận</div>
                {loadingDetail ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Đang tải...
                  </div>
                ) : stats ? (
                  <div className="flex flex-wrap gap-2">
                    <span className={pill.neutral}>Tổng {stats.total}</span>
                    <span className={pill.info}>Chờ gửi {stats.pending}</span>
                    <span className={pill.success}>Đã gửi {stats.sent}</span>
                    <span className={pill.danger}>Lỗi {stats.failed}</span>
                    <span className={pill.danger}>Không tìm thấy {stats.not_found}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Chưa có dữ liệu.</span>
                )}
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nhật ký gửi gần đây
                </div>
                {loadingDetail ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Đang tải...
                  </div>
                ) : recentLogs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                    Chưa có tin nào được gửi.
                  </div>
                ) : (
                  <div className={`${table.wrapper} max-h-64 overflow-y-auto rounded-lg border border-slate-200`}>
                    <table className={table.root}>
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className={table.head}>SĐT</th>
                          <th className={table.head}>Trạng thái</th>
                          <th className={table.head}>Nội dung đã gửi</th>
                          <th className={table.head}>Thời gian</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentLogs.slice(0, 20).map((log) => (
                          <tr key={log.id} className={table.row}>
                            <td className={`${table.cell} font-mono text-xs`}>{log.phone || "—"}</td>
                            <td className={table.cell}>
                              <span className={statusPill(log.status)}>{log.status === "success" ? "Thành công" : "Thất bại"}</span>
                              {log.error ? <div className="mt-1 max-w-[16rem] truncate text-[11px] text-red-500" title={log.error}>{log.error}</div> : null}
                            </td>
                            <td className={`${table.cell} max-w-[18rem]`}>
                              <span className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-slate-600">
                                {log.message_sent || "—"}
                              </span>
                            </td>
                            <td className={`${table.cell} whitespace-nowrap text-xs text-slate-500`}>
                              {log.created_at ? new Date(log.created_at).toLocaleString("vi-VN") : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className={`${btn.outline} ${btnSize.sm}`}>
            Hủy
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} className={`${btn.primary} ${btnSize.sm}`}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {mode === "create" ? "Tạo chiến dịch" : "Lưu thay đổi"}
          </button>
        </div>
      </div>
    </div>
  );
}
