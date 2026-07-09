"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Package, LogOut } from "lucide-react";
import { useCustomer } from "@/components/storefront/CustomerContext";

export default function AccountPage() {
  const router = useRouter();
  const { customer, loading, logout } = useCustomer();

  useEffect(() => {
    if (!loading && !customer) router.replace("/shop/account/login?next=/shop/account");
  }, [loading, customer, router]);

  if (loading || !customer) {
    return (
      <div className="flex justify-center py-20 text-[var(--muted-foreground)]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Tài khoản của tôi</h1>
      <div className="panel space-y-2 p-5">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Họ và tên</span>
          <span className="font-medium">{customer.name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Số điện thoại</span>
          <span className="font-medium">{customer.phone}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Email</span>
          <span className="font-medium">{customer.email || "—"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--muted-foreground)]">Mã khách hàng</span>
          <span className="font-medium">{customer.code}</span>
        </div>
      </div>
      <Link href="/shop/account/orders" className="panel flex items-center gap-3 p-4 hover:shadow-elegant">
        <Package className="h-5 w-5 text-[var(--primary)]" />
        <span className="font-medium">Đơn hàng của tôi</span>
      </Link>
      <button
        onClick={() => void logout().then(() => router.push("/shop"))}
        className="flex w-full items-center justify-center gap-2 rounded-md border py-2.5 text-sm font-medium text-[var(--destructive)] hover:bg-[var(--accent)]"
      >
        <LogOut className="h-4 w-4" /> Đăng xuất
      </button>
    </div>
  );
}
