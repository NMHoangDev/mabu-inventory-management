"use client";

import { useEffect } from "react";

/**
 * Browser-side bootstrapper that polls the server scheduler endpoint.
 * The server handles the heavy DB work, the client just pings periodically.
 * This keeps pg/node-only modules out of the client bundle.
 */
export function AutomationBootstrap() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (cancelled) return;
      try {
        await fetch("/api/automations/tick", { method: "POST", cache: "no-store" });
      } catch {
        /* network errors are non-fatal */
      }
      if (cancelled) return;
      timer = setTimeout(tick, 5 * 60 * 1000); // 5 min
    };
    // First tick after a small delay
    timer = setTimeout(tick, 8_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
  return null;
}
