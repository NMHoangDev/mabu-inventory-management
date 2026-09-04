/**
 * Trang tĩnh hiển thị khi middleware.ts không tìm thấy/không xác thực được
 * cookie `current_staff_id`. Module này không có login form riêng — người
 * dùng phải đăng nhập ở app chính trước.
 */

export default function LoginRequiredPage() {
  const mainAppUrl = process.env.NEXT_PUBLIC_MAIN_APP_URL || "https://timetech.markeeai.com/";

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        !
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Cần đăng nhập</h2>
      <p className="text-sm text-slate-600">
        Trang này chỉ dành cho nhân viên đã đăng nhập ở InvoiceFlow Manager. Vui lòng đăng nhập
        ở app chính trước, sau đó quay lại đây.
      </p>
      <a
        href={mainAppUrl}
        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        Về trang đăng nhập app chính
      </a>
    </div>
  );
}
