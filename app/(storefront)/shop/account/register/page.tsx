"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCustomer } from "@/components/storefront/CustomerContext";

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/shop/account";
  const { refresh } = useCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/storefront/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Đăng ký thất bại.");
      await refresh();
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng ký thất bại.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <div className="panel space-y-4 p-6">
        <h1 className="text-xl font-semibold">Đăng ký tài khoản</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Họ và tên</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="field" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Số điện thoại</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email (không bắt buộc)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="Ít nhất 6 ký tự"
            />
          </div>
          {error && <div className="rounded-md bg-[var(--destructive)]/10 px-3 py-2 text-sm text-[var(--destructive)]">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[var(--primary)] py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Đang đăng ký..." : "Đăng ký"}
          </button>
        </form>
        <p className="text-center text-sm text-[var(--muted-foreground)]">
          Đã có tài khoản?{" "}
          <Link href={`/shop/account/login?next=${encodeURIComponent(next)}`} className="font-medium text-[var(--primary)] hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  );
}
