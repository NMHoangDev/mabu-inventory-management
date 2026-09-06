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

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">
        {staff.full_name || staff.email}
        {staff.role === "admin" ? " · Quản trị viên" : ""}
      </span>
      <button
        type="button"
        onClick={handleLogout}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
        Đăng xuất
      </button>
    </div>
  );
}
