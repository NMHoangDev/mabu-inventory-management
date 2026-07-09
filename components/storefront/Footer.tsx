"use client";

import { useEffect, useState } from "react";

export function Footer() {
  const [settings, setSettings] = useState<{ store_name: string; contact_phone: string; contact_address: string }>({
    store_name: "Cửa hàng",
    contact_phone: "",
    contact_address: "",
  });

  useEffect(() => {
    fetch("/api/storefront/settings")
      .then((r) => r.json())
      .then((d) => d?.settings && setSettings(d.settings))
      .catch(() => undefined);
  }, []);

  return (
    <footer className="mt-12 border-t bg-[var(--card)]">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-[var(--muted-foreground)]">
        <div className="font-semibold text-[var(--foreground)]">{settings.store_name}</div>
        {settings.contact_address && <div className="mt-1">{settings.contact_address}</div>}
        {settings.contact_phone && <div className="mt-1">Hotline: {settings.contact_phone}</div>}
        <div className="mt-4 text-xs">© {new Date().getFullYear()} {settings.store_name}. Mọi quyền được bảo lưu.</div>
      </div>
    </footer>
  );
}
