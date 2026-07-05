"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Loader2,
  Lock,
  LogIn,
  MessageCircle,
  ShieldCheck,
  UserCog,
  Users
} from "lucide-react";
import {
  zaloAuthApi,
  zaloStaffApi,
  type CurrentStaff,
  type StaffRecord
} from "@/lib/zalo-api";

/**
 * Trang đăng nhập nhân viên (staff login).
 * ──────────────────────────────────────────────────────────────────────────
 * Phase 3 multi-account Zalo yêu cầu phân biệt rõ:
 *   - Nhân viên nào đang dùng app
 *   - Họ được phép thao tác với những tài khoản Zalo nào
 *
 * Trang này cho phép:
 *   1) Admin/staff chọn 1 nhân viên có sẵn trong bảng `staff` Supabase
 *   2) Cookie `current_staff_id` được set bởi POST /api/auth/zalo/me
 *   3) Sau khi login, redirect về `?next=<path>` (mặc định /thong-bao-zalo)
 *
 * Lưu ý:
 *   - Đây là login rút gọn (chỉ chọn user, không password) phục vụ nội bộ
 *     công ty. Sau này có thể thay bằng OAuth Google Workspace hoặc email
 *     magic link.
 *   - Cookie không HttpOnly (client đọc được) để UI biết user hiện tại.
 */
export default function ZaloLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/thong-bao-zalo";

  const [staffList, setStaffList] = useState<StaffRecord[]>([]);
  const [current, setCurrent] = useState<CurrentStaff | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load staff list + current session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, list] = await Promise.all([
          zaloAuthApi.me(),
          zaloStaffApi.list().catch(() => ({ staff: [], assignments: [] }))
        ]);
        if (cancelled) return;
        setCurrent(me.staff);
        setStaffList((list.staff || []).filter((s) => s.is_active !== false));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Không tải được danh sách nhân viên.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePick(staff: StaffRecord) {
    setSubmitting(staff.id);
    setError(null);
    setSuccess(null);
    try {
      await zaloAuthApi.login(staff.id);
      setSuccess(`Đã đăng nhập với tài khoản "${staff.full_name}".`);
      // Reload current session
      const me = await zaloAuthApi.me();
      setCurrent(me.staff);
      // Redirect sau 600ms để user thấy thông báo.
      setTimeout(() => {
        router.push(nextPath);
        router.refresh();
      }, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng nhập thất bại.");
    } finally {
      setSubmitting(null);
    }
  }

  async function handleLogout() {
    setSubmitting("__logout__");
    setError(null);
    try {
      await zaloAuthApi.logout();
      const me = await zaloAuthApi.me();
      setCurrent(me.staff);
      setSuccess("Đã đăng xuất.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Đăng xuất thất bại.");
    } finally {
      setSubmitting(null);
    }
  }

  const admins = staffList.filter((s) => s.role === "admin");
  const staffs = staffList.filter((s) => s.role !== "admin");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 sm:p-8">
      <div className="mx-auto w-full max-w-3xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg">
            <MessageCircle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Đăng nhập nhân viên
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Chọn tài khoản nhân viên của bạn để dùng InvoiceFlow + Zalo multi-account.
          </p>
        </div>

        {/* Current session */}
        {!loading && current && current.role !== "system" && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm shadow-sm">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="font-semibold text-emerald-800">
                  Đang đăng nhập: {current.full_name || current.email}
                </div>
                <div className="text-xs text-emerald-700">
                  Role: <span className="font-semibold">{current.role}</span>
                  {current.assignments?.length > 0
                    ? ` · ${current.assignments.length} tài khoản Zalo được phép`
                    : ""}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={submitting === "__logout__"}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {submitting === "__logout__" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogIn className="h-3.5 w-3.5 rotate-180" />
              )}
              Đăng xuất
            </button>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin" />
            Đang tải danh sách nhân viên…
          </div>
        ) : staffList.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800 shadow-sm">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
            <div className="font-semibold">Chưa có nhân viên nào trong hệ thống.</div>
            <div className="mt-1 text-xs text-amber-700">
              Vào Supabase → bảng <code className="font-mono">staff</code> → thêm row với{" "}
              <code className="font-mono">email</code>, <code className="font-mono">full_name</code>,{" "}
              <code className="font-mono">role</code>.
              <br />
              Hoặc vào <a className="underline" href="/zalo/accounts">/zalo/accounts</a> để tạo.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Admins */}
            {admins.length > 0 && (
              <StaffSection
                title="Quản trị viên"
                icon={UserCog}
                list={admins}
                currentId={current?.id ?? null}
                submitting={submitting}
                onPick={handlePick}
              />
            )}

            {/* Staffs */}
            {staffs.length > 0 && (
              <StaffSection
                title="Nhân viên"
                icon={Users}
                list={staffs}
                currentId={current?.id ?? null}
                submitting={submitting}
                onPick={handlePick}
              />
            )}
          </div>
        )}

        {/* Footer hint */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm">
          <div className="mb-1 font-semibold text-slate-700">
            <Lock className="mr-1 inline h-3.5 w-3.5" />
            Sau khi đăng nhập:
          </div>
          <ul className="ml-5 list-disc space-y-0.5">
            <li>Mỗi nhân viên chỉ thấy conversations / tin nhắn của các tài khoản Zalo được phân quyền.</li>
            <li>SSE realtime vẫn chạy nền — tin nhắn mới được tự động lưu vào Supabase.</li>
            <li>Cookie <code className="font-mono">current_staff_id</code> có hiệu lực 30 ngày.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function StaffSection({
  title,
  icon: Icon,
  list,
  currentId,
  submitting,
  onPick
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  list: StaffRecord[];
  currentId: string | null;
  submitting: string | null;
  onPick: (s: StaffRecord) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
        <Icon className="h-3.5 w-3.5" />
        {title}
        <span className="text-slate-400">({list.length})</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {list.map((s) => {
          const isCurrent = currentId === s.id;
          const isSubmitting = submitting === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              disabled={!!submitting}
              className={`group flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition disabled:opacity-50 ${
                isCurrent
                  ? "border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-200"
                  : "border-slate-200 hover:border-blue-400 hover:bg-blue-50/40"
              }`}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
                {(s.full_name || s.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-900">
                  {s.full_name || "(chưa có tên)"}
                </div>
                <div className="truncate text-xs text-slate-500" title={s.email}>
                  {s.email}
                </div>
                {isCurrent ? (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <ShieldCheck className="h-3 w-3" />
                    Đang đăng nhập
                  </div>
                ) : null}
              </div>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              ) : (
                <LogIn className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-600" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}