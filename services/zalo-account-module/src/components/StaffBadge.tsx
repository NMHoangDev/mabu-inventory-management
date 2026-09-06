"use client";

/**
 * Hiển thị nhân viên đang đăng nhập + nút đăng xuất — mount ở layout.tsx nên
 * xuất hiện trên mọi trang. Ẩn hoàn toàn khi chưa có session (middleware đã
 * chặn truy cập trang khi chưa đăng nhập, nên component này chỉ cần lo phần
 * hiển thị + đăng xuất, không cần tự redirect).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";

type Staff = { id: string | null; email: string; full_name: string; role: string } | null;

export default function StaffBadge() {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/login", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setStaff(data?.has_session ? data.staff : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setBusy(true);
    try {
      await fetch("/api/auth/login", { method: "DELETE", credentials: "include" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !staff) return null;

  const displayName = staff.full_name || staff.email;
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-900">{displayName}</div>
          <div className="truncate text-[11px] text-slate-500">
            {staff.role === "admin" ? "Quản trị viên" : "Nhân viên"}
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          title="Đăng xuất"
          aria-label="Đăng xuất"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-white hover:text-red-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
