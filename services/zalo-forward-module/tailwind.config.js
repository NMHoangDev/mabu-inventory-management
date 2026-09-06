/**
 * Design tokens — học theo hệ màu của webapp merkeeai (COLOR_SYSTEM_GUIDE.md):
 * 1 màu thương hiệu đặc làm toàn bộ phần nhấn, mọi thứ còn lại là xám trung
 * tính; bề mặt phân định bằng VIỀN chứ không bằng shadow. Khác bản gốc ở màu
 * thương hiệu: module này dùng xanh ngọc (`brand`) để phân biệt với
 * zalo-account-module (xanh dương) — 2 module cạnh nhau nên màu phải khác nhau
 * rõ ràng, không dùng chung 1 hue.
 *
 * Tailwind ở đây là v3.4 nên tokens khai báo trong config này, KHÔNG dùng
 * `@theme inline` (cú pháp v4, sẽ không compile).
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#059669",
          hover: "#047857",
          dark: "#065f46",
          subtle: "#ecfdf5",
          border: "#a7f3d0"
        },
        // Alias để `bg-primary` cũ vẫn chạy đúng.
        primary: "#059669"
      },
      fontFamily: {
        // Font hệ thống — cố ý KHÔNG dùng next/font/google (Inter) để build
        // Docker không phụ thuộc mạng: host production hay đầy đĩa/flaky, một
        // lần tải font lỗi là fail cả lần deploy.
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif"
        ]
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem"
      }
    }
  },
  plugins: []
};
