"use client";

/**
 * Nút "Đăng nhập bằng Google" — dùng Google Identity Services (script phía
 * trình duyệt, https://accounts.google.com/gsi/client), KHÔNG cần redirect
 * OAuth phức tạp. Trả về 1 credential (id_token) qua callback, POST lên
 * /api/auth/google để verify + set cookie session (route đó check email có
 * trong bảng `staff` chưa — admin phải thêm trước, xem tab "Nhân viên &
 * Phân quyền").
 *
 * Cần NEXT_PUBLIC_GOOGLE_CLIENT_ID — nếu chưa cấu hình thì ẩn nút luôn (thay
 * vì hiện nút hỏng), để không gây nhầm lẫn khi biến môi trường còn thiếu.
 */

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme?: string; size?: string; width?: number; text?: string; shape?: string }
          ) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (!clientId) return;
    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }
    const existing = document.getElementById("google-identity-services");
    if (existing) {
      existing.addEventListener("load", () => setScriptLoaded(true));
      return;
    }
    const script = document.createElement("script");
    script.id = "google-identity-services";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, [clientId]);

  useEffect(() => {
    if (!scriptLoaded || !clientId || !buttonRef.current || !window.google) return;

    async function handleCredential(response: { credential: string }) {
      try {
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        onSuccess();
      } catch (e) {
        onError(e instanceof Error ? e.message : "Đăng nhập Google thất bại");
      }
    }

    window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      width: 320,
      text: "signin_with",
      shape: "rectangular",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, clientId]);

  if (!clientId) return null;

  return <div ref={buttonRef} className="flex justify-center" />;
}
