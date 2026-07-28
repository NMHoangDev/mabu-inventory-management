"use client";

import { ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { usePermissions } from "@/components/providers/PermissionsProvider";

interface PageGuardProps {
  /** Yêu cầu đúng 1 quyền. */
  permission?: string;
  /** Yêu cầu ít nhất 1 trong nhiều quyền (dùng cho trang tổng hợp nhiều module, ví dụ sổ quỹ). */
  anyOf?: string[];
  children: ReactNode;
}

export function PageGuard({ permission, anyOf, children }: PageGuardProps) {
  const { hasPermission, loading } = usePermissions();

  if (loading) return null;

  const allowed = permission ? hasPermission(permission) : anyOf ? anyOf.some((key) => hasPermission(key)) : true;

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card py-24 text-center">
        <ShieldOff className="h-10 w-10 text-muted-foreground" />
        <div className="text-lg font-semibold">Không có quyền truy cập</div>
        <div className="max-w-sm text-sm text-muted-foreground">
          Bạn không có quyền xem trang này. Liên hệ quản trị viên nếu cần được cấp quyền.
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
