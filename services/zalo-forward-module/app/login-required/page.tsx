export default function LoginRequiredPage() {
  // Tuyệt đối, KHÔNG phải relative "/" — module này chạy ở subdomain riêng
  // (vd zalo-forward.timetech.markeeai.com), "/" ở đây trỏ về chính nó (bị
  // middleware chặn lại → vòng lặp redirect vô hạn), không phải app chính.
  const mainAppUrl = process.env.NEXT_PUBLIC_MAIN_APP_URL || "https://timetech.markeeai.com/";

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/60 p-6 text-center shadow-sm">
        <div className="text-base font-bold text-amber-900">Cần đăng nhập để dùng module này</div>
        <div className="mt-1 text-xs text-amber-800">
          Module "Chuyển tiếp Zalo" dùng chung phiên đăng nhập với app InvoiceFlow Manager. Vui lòng đăng
          nhập ở app chính trước, sau đó quay lại trang này.
        </div>
        <a
          href={mainAppUrl}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700"
        >
          Về trang chủ InvoiceFlow
        </a>
      </div>
    </div>
  );
}
