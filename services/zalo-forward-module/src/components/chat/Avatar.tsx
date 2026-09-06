"use client";

/**
 * Avatar dùng chung cho ZaloConversationList (hàng hội thoại) và ZaloChatPanel
 * (header hội thoại đang mở) — hiển thị ảnh thật (`avatar_url`) khi có, fallback
 * về vòng tròn chữ cái đầu khi thiếu URL hoặc ảnh load lỗi.
 *
 * `failed` là state cục bộ của từng instance component (mỗi hàng hội thoại tự
 * có 1 Avatar riêng, React key theo conversation_id) nên lỗi load ảnh của 1
 * hội thoại không ảnh hưởng tới các hội thoại khác. Reset khi `src` đổi để
 * header của ZaloChatPanel (1 instance dùng lại cho nhiều hội thoại được mở
 * lần lượt) không bị "kẹt" ở trạng thái lỗi của hội thoại trước đó.
 */

import { useEffect, useState } from "react";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  /** Class kích thước + cỡ chữ, vd "h-12 w-12 text-base" — giữ đúng layout gốc. */
  className: string;
}

export function Avatar({ src, name, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || "avatar"}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full bg-slate-100 object-cover ${className}`}
      />
    );
  }

  return (
    <div className={`grid shrink-0 place-items-center rounded-full bg-brand font-bold text-white ${className}`}>
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}
