"use client";

/**
 * Empty states cho Zalo Chat View — 3 trạng thái rõ ràng:
 *
 * 1. NOT_LOGGED_IN    → Hướng dẫn đăng nhập QR
 * 2. NO_CONVERSATIONS → Hướng dẫn đồng bộ
 * 3. PICK_CONVERSATION → Hướng dẫn chọn từ sidebar
 *
 * Mỗi state đều có:
 *   - Illustration (icon tròn to + màu nền nhẹ)
 *   - Tiêu đề rõ ràng
 *   - Mô tả ngắn giải thích
 *   - CTA button (call-to-action) để user biết bước tiếp theo
 *
 * Component pure presentational, không state, không effect.
 * Nhận props optional cho CTA để không bắt buộc parent phải truyền.
 */

import { MaterialIcon } from "@/components/ui";

interface ZaloEmptyChatProps {
  hasConversations: boolean;
  isLoggedIn: boolean;
  isLoading?: boolean;
  onSync?: () => void;
  onSelectFirst?: () => void;
  onLogin?: () => void;
}

export function ZaloEmptyChat({
  hasConversations,
  isLoggedIn,
  isLoading = false,
  onSync,
  onSelectFirst,
  onLogin,
}: ZaloEmptyChatProps) {
  // 1. Chưa đăng nhập Zalo
  if (!isLoggedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-white to-zinc-50">
        <div className="h-24 w-24 rounded-full bg-blue-50 flex items-center justify-center mb-4">
          <MaterialIcon
            name="qr_code_scanner"
            className="text-5xl text-blue-500"
          />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 mb-2 text-center">
          Đăng nhập Zalo để bắt đầu
        </h3>
        <p className="text-sm text-zinc-500 mb-6 text-center max-w-[360px] leading-relaxed">
          Bấm nút bên dưới để mở Zalo Web và tiến hành đăng nhập.
          Tin nhắn sẽ được đồng bộ tự động ngay sau khi đăng nhập thành công.
        </p>
        {onLogin && (
          <button
            onClick={onLogin}
            className="bg-[#E3000F] hover:bg-red-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2"
          >
            <MaterialIcon name="open_in_new" className="text-base" />
            Tiến hành đăng nhập
          </button>
        )}
      </div>
    );
  }

  // 2. Đã đăng nhập nhưng chưa có cuộc hội thoại nào
  if (!hasConversations) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-white to-zinc-50">
        <div className="h-24 w-24 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
          <MaterialIcon name="chat" className="text-5xl text-zinc-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 mb-2 text-center">
          Chưa có cuộc hội thoại
        </h3>
        <p className="text-sm text-zinc-500 mb-6 text-center max-w-[360px] leading-relaxed">
          Bấm nút bên dưới để đồng bộ tin nhắn từ Zalo. Lần đầu có thể mất
          1-2 phút tùy số lượng nhóm.
        </p>
        {onSync && (
          <button
            onClick={onSync}
            disabled={isLoading}
            className="bg-[#0068FF] hover:bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <MaterialIcon name="sync" className={`text-base ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Đang đồng bộ..." : "Đồng bộ ngay"}
          </button>
        )}
      </div>
    );
  }

  // 3. Đã có hội thoại nhưng chưa chọn
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-white to-zinc-50">
      <div className="h-24 w-24 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <MaterialIcon name="search" className="text-5xl text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2 text-center">
        Chọn một cuộc hội thoại
      </h3>
      <p className="text-sm text-zinc-500 text-center max-w-[360px] leading-relaxed">
        Chọn nhóm hoặc người từ danh sách bên trái để xem tin nhắn. Bạn cũng có
        thể tìm kiếm theo tên ở ô tìm kiếm phía trên.
      </p>
    </div>
  );
}
