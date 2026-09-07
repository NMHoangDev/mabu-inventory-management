"use client";

/**
 * Trang "Gửi hàng loạt" — nhắn tin / gửi lời mời kết bạn / mời vào nhóm hàng
 * loạt theo danh sách số điện thoại dán vào. Đây CHỈ là UI tạo job + theo dõi
 * tiến độ — việc xử lý thật (tra số điện thoại ra uid, gọi bridge, giãn cách
 * an toàn giữa mỗi số) nằm hết ở worker/automationWorker.js (KHÔNG đụng vào
 * file đó hay app/api/bulk-jobs/** — trang này chỉ gọi đúng hợp đồng có sẵn).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { apiUrl } from "@/lib/basePath";
import type { BulkJob, BulkJobItem, BulkJobType, ZaloAccountSummary } from "@/lib/types";
import { alert, btn, btnSize, card, input, label, pageStack, pill, select, table } from "@/lib/ui";

type GroupOption = { id: string; name: string };
type UploadedImage = { url: string; previewUrl: string; filename: string };

/** Cùng công thức với `input` ở src/lib/ui.ts nhưng bỏ chiều cao cố định h-9 —
 * không ghép `${input} h-auto` vì thứ tự CSS Tailwind sinh ra không đảm bảo
 * class viết sau trong chuỗi sẽ thắng class viết trước, dễ vỡ layout. */
const TEXTAREA_BASE =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-[color,box-shadow] placeholder:text-slate-400 disabled:opacity-50 outline-none focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/40";

const JOB_TYPE_OPTIONS: { value: BulkJobType; label: string; icon: typeof MessageCircle }[] = [
  { value: "send_message", label: "Gửi tin nhắn", icon: MessageCircle },
  { value: "add_friend", label: "Gửi lời mời kết bạn", icon: UserPlus },
  { value: "invite_group", label: "Mời vào nhóm", icon: Users },
];

function jobTypeMeta(type: BulkJobType) {
  return JOB_TYPE_OPTIONS.find((o) => o.value === type) || JOB_TYPE_OPTIONS[0];
}

function statusMeta(status: BulkJob["status"]) {
  switch (status) {
    case "pending":
      return { label: "Chờ xử lý", cls: pill.info };
    case "running":
      return { label: "Đang chạy", cls: pill.info };
    case "paused":
      return { label: "Tạm dừng", cls: pill.warning };
    case "completed":
      return { label: "Hoàn tất", cls: pill.success };
    case "cancelled":
      return { label: "Đã hủy", cls: pill.neutral };
    default:
      return { label: status, cls: pill.neutral };
  }
}

function itemStatusMeta(status: BulkJobItem["status"]) {
  switch (status) {
    case "sent":
      return { label: "Thành công", cls: pill.success };
    case "failed":
      return { label: "Thất bại", cls: pill.danger };
    case "not_found":
      return { label: "Không tìm thấy", cls: pill.warning };
    case "skipped":
      return { label: "Bỏ qua", cls: pill.neutral };
    default:
      return { label: "Đang chờ", cls: pill.info };
  }
}

/** Đếm nhanh số điện thoại hợp lệ ở client — chỉ để hiển thị ngay khi gõ,
 * server (`normalizePhones` trong app/api/bulk-jobs/route.ts) mới là nguồn
 * xác thực/chuẩn hoá cuối cùng, không cần khớp tuyệt đối với hàm đó. */
function parsePhonesPreview(text: string): string[] {
  const seen = new Set<string>();
  for (const token of text.split(/[\s,;]+/)) {
    const digits = token.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 12) continue;
    seen.add(digits);
  }
  return Array.from(seen);
}

export default function BulkSendPage() {
  const [accounts, setAccounts] = useState<ZaloAccountSummary[]>([]);
  const [jobs, setJobs] = useState<BulkJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Form tạo job ──
  const [accountId, setAccountId] = useState("");
  const [jobType, setJobType] = useState<BulkJobType>("send_message");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [phonesText, setPhonesText] = useState("");
  const [delayMin, setDelayMin] = useState(2);
  const [delayMax, setDelayMax] = useState(10);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [targetGroupId, setTargetGroupId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Danh sách job + chi tiết item ──
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [itemsByJob, setItemsByJob] = useState<Record<number, BulkJobItem[]>>({});
  const [loadingItemsFor, setLoadingItemsFor] = useState<number | null>(null);
  const [pendingActionId, setPendingActionId] = useState<number | null>(null);

  const parsedPhones = useMemo(() => parsePhonesPreview(phonesText), [phonesText]);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/accounts"), { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const accs: ZaloAccountSummary[] = Array.isArray(data?.accounts) ? data.accounts : [];
      setAccounts(accs);
      setAccountId((prev) => prev || accs[0]?.account_id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách tài khoản.");
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/bulk-jobs"), { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data?.error) throw new Error(data.error);
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách chiến dịch.");
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadJobs();
  }, [loadAccounts, loadJobs]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  // Nhóm của tài khoản đang chọn — chỉ cần tải khi đang chọn "Mời vào nhóm".
  useEffect(() => {
    if (jobType !== "invite_group" || !accountId) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    setLoadingGroups(true);
    setTargetGroupId("");
    (async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/zalo/conversations?account_id=${encodeURIComponent(accountId)}&limit=500`),
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        type ConvRow = { thread_id: string; thread_type: string; conversation_name: string | null };
        const convs: ConvRow[] = Array.isArray(data?.conversations) ? data.conversations : [];
        setGroups(
          convs
            .filter((c) => c.thread_type === "group")
            .map((c) => ({ id: c.thread_id, name: c.conversation_name || `Nhóm ${c.thread_id}` }))
        );
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, jobType]);

  // Auto-refresh danh sách job trong khi còn job pending/running — tự dừng khi hết,
  // không poll vô thời hạn khi mọi job đã xong/tạm dừng/hủy.
  const hasActiveJobs = useMemo(() => jobs.some((j) => j.status === "pending" || j.status === "running"), [jobs]);
  useEffect(() => {
    if (!hasActiveJobs) return;
    const id = window.setInterval(() => void loadJobs(), 3500);
    return () => window.clearInterval(id);
  }, [hasActiveJobs, loadJobs]);

  const loadJobItems = useCallback(async (jobId: number) => {
    setLoadingItemsFor(jobId);
    try {
      const res = await fetch(apiUrl(`/api/bulk-jobs/${jobId}`), { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (data?.error) throw new Error(data.error);
      setItemsByJob((prev) => ({ ...prev, [jobId]: Array.isArray(data?.items) ? data.items : [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách số điện thoại của chiến dịch.");
    } finally {
      setLoadingItemsFor((prev) => (prev === jobId ? null : prev));
    }
  }, []);

  function toggleExpand(job: BulkJob) {
    if (expandedJobId === job.id) {
      setExpandedJobId(null);
      return;
    }
    setExpandedJobId(job.id);
    void loadJobItems(job.id);
  }

  // Auto-refresh chi tiết item của job đang mở — cùng nhịp job list, chỉ khi job đó còn hoạt động.
  const expandedJob = jobs.find((j) => j.id === expandedJobId) || null;
  const expandedActive = Boolean(expandedJob && (expandedJob.status === "pending" || expandedJob.status === "running"));
  useEffect(() => {
    if (!expandedJobId || !expandedActive) return;
    const id = window.setInterval(() => void loadJobItems(expandedJobId), 3500);
    return () => window.clearInterval(id);
  }, [expandedJobId, expandedActive, loadJobItems]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploading(true);
    setError(null);
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(apiUrl("/api/uploads"), { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setImages((prev) => [...prev, { url: data.url, previewUrl: data.previewUrl, filename: data.filename }]);
      } catch (e) {
        setError(`Tải ảnh "${file.name}" thất bại: ${e instanceof Error ? e.message : "lỗi không xác định"}`);
      }
    }
    setUploading(false);
  }

  function removeImage(filename: string) {
    setImages((prev) => prev.filter((img) => img.filename !== filename));
  }

  const canSubmit =
    !submitting &&
    !uploading &&
    Boolean(accountId) &&
    parsedPhones.length > 0 &&
    (jobType !== "send_message" || message.trim().length > 0) &&
    (jobType !== "invite_group" || Boolean(targetGroupId));

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const group = groups.find((g) => g.id === targetGroupId);
      const body: Record<string, unknown> = {
        account_id: accountId,
        job_type: jobType,
        phones: parsedPhones,
        delay_seconds_min: delayMin,
        delay_seconds_max: delayMax,
      };
      if (jobType !== "invite_group" && message.trim()) body.message = message.trim();
      if (jobType === "send_message") body.image_urls = images.map((img) => img.url);
      if (jobType === "invite_group") {
        body.target_group_id = targetGroupId;
        body.target_group_name = group?.name || targetGroupId;
      }

      const res = await fetch(apiUrl("/api/bulk-jobs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setNotice(`Đã tạo chiến dịch — ${parsedPhones.length} số điện thoại sẽ được xử lý dần.`);
      setMessage("");
      setImages([]);
      setPhonesText("");
      setTargetGroupId("");
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được chiến dịch.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePatchStatus(job: BulkJob, status: "paused" | "running" | "cancelled") {
    setPendingActionId(job.id);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/bulk-jobs/${job.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không cập nhật được trạng thái chiến dịch.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDelete(job: BulkJob) {
    const meta = jobTypeMeta(job.job_type);
    if (!window.confirm(`Xoá chiến dịch "${meta.label}" (${job.total_count} số)? Không thể hoàn tác.`)) return;
    setPendingActionId(job.id);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/bulk-jobs/${job.id}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNotice("Đã xoá chiến dịch.");
      if (expandedJobId === job.id) setExpandedJobId(null);
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xoá được chiến dịch.");
    } finally {
      setPendingActionId(null);
    }
  }

  function accountLabel(id: string) {
    const acc = accounts.find((a) => a.account_id === id);
    return acc?.display_name || id;
  }

  return (
    <div className={pageStack}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-subtle text-brand">
          <Send className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Gửi hàng loạt</h1>
          <p className="text-sm text-slate-500">
            Nhắn tin, gửi lời mời kết bạn hoặc mời vào nhóm theo danh sách số điện thoại — xử lý dần ở nền.
          </p>
        </div>
      </div>

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

      {/* ── Form tạo job ── */}
      <section className={card}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Tạo chiến dịch mới</h2>
          <p className="text-xs text-slate-500">Chọn hành động, dán danh sách số điện thoại, hệ thống tự xử lý dần.</p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Tài khoản Zalo *</label>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`${select} w-full`}>
                <option value="">— Chọn tài khoản —</option>
                {accounts.map((acc) => (
                  <option key={acc.account_id} value={acc.account_id}>
                    {acc.display_name} ({acc.account_id})
                  </option>
                ))}
              </select>
            </div>

            {jobType === "invite_group" ? (
              <div>
                <label className={label}>Nhóm sẽ mời vào *</label>
                <select
                  value={targetGroupId}
                  onChange={(e) => setTargetGroupId(e.target.value)}
                  disabled={loadingGroups || groups.length === 0}
                  className={`${select} w-full`}
                >
                  <option value="">{loadingGroups ? "Đang tải nhóm..." : "— Chọn nhóm —"}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                {!loadingGroups && groups.length === 0 && accountId ? (
                  <p className="mt-1 text-xs text-slate-400">Tài khoản này chưa có nhóm nào để mời vào.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <label className={label}>Hành động *</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {JOB_TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = jobType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setJobType(opt.value)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "border-brand bg-brand-subtle text-brand"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {jobType !== "invite_group" ? (
            <div>
              <label className={label}>
                {jobType === "send_message" ? "Nội dung tin nhắn *" : "Lời nhắn kèm lời mời kết bạn (tuỳ chọn)"}
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder={
                  jobType === "send_message"
                    ? "Nhập nội dung sẽ gửi cho từng số điện thoại..."
                    : "Để trống sẽ dùng lời nhắn kết bạn mặc định của hệ thống."
                }
                className={TEXTAREA_BASE}
              />
            </div>
          ) : null}

          {jobType === "send_message" ? (
            <div>
              <label className={label}>Ảnh đính kèm (tuỳ chọn)</label>
              <div className="flex flex-wrap items-center gap-2">
                {images.map((img) => (
                  <div
                    key={img.filename}
                    className="group relative h-16 w-16 overflow-hidden rounded-md border border-slate-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt={img.filename} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(img.filename)}
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                      title="Gỡ ảnh"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-brand hover:text-brand">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="text-[10px]">Thêm ảnh</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleFilesSelected(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div>
            <label className={label}>Danh sách số điện thoại *</label>
            <textarea
              value={phonesText}
              onChange={(e) => setPhonesText(e.target.value)}
              rows={6}
              placeholder={"Mỗi số 1 dòng, hoặc phân cách bằng dấu phẩy/chấm phẩy.\nVD:\n0912345678\n0987654321, 0901234567"}
              className={`${TEXTAREA_BASE} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Nhận diện được <strong className="text-slate-700">{parsedPhones.length}</strong> số điện thoại hợp lệ.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Giãn cách tối thiểu (giây)</label>
              <input
                type="number"
                min={3}
                value={delayMin}
                onChange={(e) => setDelayMin(Math.max(3, Number(e.target.value) || 3))}
                className={input}
              />
            </div>
            <div>
              <label className={label}>Giãn cách tối đa (giây)</label>
              <input
                type="number"
                min={delayMin}
                value={delayMax}
                onChange={(e) => setDelayMax(Math.max(delayMin, Number(e.target.value) || delayMin))}
                className={input}
              />
            </div>
          </div>

          <div className={alert.info}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Zalo có thể <strong>khoá tài khoản cá nhân</strong> nếu nhắn tin/kết bạn/mời nhóm quá nhanh hoặc quá
              nhiều trong thời gian ngắn. Khoảng giãn cách ngẫu nhiên giữa mỗi số (mặc định 2–10 giây, tối thiểu
              cho phép là 2 giây) giúp hành vi giống thao tác tay hơn — danh sách càng dài càng nên đặt cao hơn mức
              tối thiểu, và hạn chế nhắn cho số lạ chưa từng tương tác.
            </span>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className={`${btn.primary} ${btnSize.md}`}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Bắt đầu chiến dịch
            </button>
          </div>
        </div>
      </section>

      {/* ── Danh sách job ── */}
      <section className={card}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Chiến dịch đã tạo</h2>
            <p className="text-xs text-slate-500">Tối đa 50 chiến dịch gần nhất.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadJobs()}
            className={`${btn.ghost} ${btnSize.icon}`}
            title="Làm mới"
          >
            <RefreshCw className={`h-4 w-4 ${loadingJobs ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className={table.wrapper}>
          <table className={table.root}>
            <thead>
              <tr className="border-b border-slate-100">
                <th className={table.head}>Hành động</th>
                <th className={table.head}>Tài khoản</th>
                <th className={table.head}>Trạng thái</th>
                <th className={table.head}>Tiến độ</th>
                <th className={table.head}>Kết quả</th>
                <th className={table.head}>Tạo lúc</th>
                <th className={`${table.head} text-right`}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const meta = jobTypeMeta(job.job_type);
                const Icon = meta.icon;
                const badge = statusMeta(job.status);
                const pct =
                  job.total_count > 0 ? Math.min(100, Math.round((job.sent_count / job.total_count) * 100)) : 0;
                const canPauseResume = job.status === "pending" || job.status === "running" || job.status === "paused";
                const canCancel = job.status === "pending" || job.status === "running" || job.status === "paused";
                const busy = pendingActionId === job.id;
                const isExpanded = expandedJobId === job.id;
                return (
                  <Fragment key={job.id}>
                    <tr className={table.row}>
                      <td className={`${table.cell} font-medium text-slate-900`}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 shrink-0 text-brand" />
                          {meta.label}
                          {job.job_type === "invite_group" && job.target_group_name ? (
                            <span className="truncate text-xs font-normal text-slate-400">
                              → {job.target_group_name}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className={`${table.cell} text-xs text-slate-600`}>{accountLabel(job.account_id)}</td>
                      <td className={table.cell}>
                        <span className={badge.cls}>{badge.label}</span>
                      </td>
                      <td className={`${table.cell} w-40`}>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="shrink-0 text-xs text-slate-500">
                            {job.sent_count}/{job.total_count}
                          </span>
                        </div>
                      </td>
                      <td className={`${table.cell} text-xs text-slate-500`}>
                        <span className="text-emerald-600">{job.success_count} thành công</span>
                        {job.failed_count > 0 ? (
                          <span className="text-red-500"> · {job.failed_count} thất bại</span>
                        ) : null}
                      </td>
                      <td className={`${table.cell} text-xs text-slate-500`}>
                        {new Date(job.created_at).toLocaleString("vi-VN")}
                      </td>
                      <td className={table.cell}>
                        <div className="flex items-center justify-end gap-1.5">
                          {canPauseResume ? (
                            job.status === "paused" ? (
                              <button
                                type="button"
                                onClick={() => void handlePatchStatus(job, "running")}
                                disabled={busy}
                                className={`${btn.outline} ${btnSize.icon}`}
                                title="Tiếp tục"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handlePatchStatus(job, "paused")}
                                disabled={busy}
                                className={`${btn.outline} ${btnSize.icon}`}
                                title="Tạm dừng"
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                              </button>
                            )
                          ) : null}
                          {canCancel ? (
                            <button
                              type="button"
                              onClick={() => void handlePatchStatus(job, "cancelled")}
                              disabled={busy}
                              className={`${btn.warning} ${btnSize.icon}`}
                              title="Hủy chiến dịch"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => toggleExpand(job)}
                            className={`${btn.outline} ${btnSize.icon}`}
                            title={isExpanded ? "Thu gọn" : "Xem chi tiết"}
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(job)}
                            disabled={busy}
                            className={`${btn.danger} ${btnSize.icon}`}
                            title="Xoá"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={7} className="px-4 py-3">
                          {loadingItemsFor === job.id && !itemsByJob[job.id] ? (
                            <div className="flex items-center gap-1.5 py-2 text-xs text-slate-500">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải danh sách...
                            </div>
                          ) : (itemsByJob[job.id] || []).length === 0 ? (
                            <div className="py-2 text-xs text-slate-500">Chưa có dữ liệu.</div>
                          ) : (
                            <div className="max-h-72 overflow-auto rounded-md border border-slate-200 bg-white">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-100 text-slate-500">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left font-semibold">Số điện thoại</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">Tên hiển thị</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">Trạng thái</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">Lỗi</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">Xử lý lúc</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(itemsByJob[job.id] || []).map((it) => {
                                    const im = itemStatusMeta(it.status);
                                    return (
                                      <tr key={it.id} className="border-t border-slate-100">
                                        <td className="px-3 py-1.5 font-mono">{it.phone}</td>
                                        <td className="px-3 py-1.5">{it.display_name || "—"}</td>
                                        <td className="px-3 py-1.5">
                                          <span className={im.cls}>{im.label}</span>
                                        </td>
                                        <td
                                          className="max-w-[240px] truncate px-3 py-1.5 text-red-600"
                                          title={it.error || ""}
                                        >
                                          {it.error || ""}
                                        </td>
                                        <td className="px-3 py-1.5 text-slate-500">
                                          {it.processed_at ? new Date(it.processed_at).toLocaleString("vi-VN") : "—"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-500">
                    {loadingJobs ? "Đang tải..." : "Chưa có chiến dịch nào."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
