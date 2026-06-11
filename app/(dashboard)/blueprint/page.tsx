"use client";

import { ShieldCheck } from "lucide-react";

export default function BlueprintPage() {
  return (
    <section className="space-y-5">
      <div className="panel p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-primary">Design blueprint</div>
            <h2 className="mt-2 text-3xl font-bold">Khung trang quản lý InvoiceFlow</h2>
            <p className="mt-2 max-w-3xl text-slate-500">
              Dùng làm mẫu để dựng demo quản lý sau: scan OCR hóa đơn, lưu web, quản lý tài liệu, tổng hợp hóa đơn, lọc dữ liệu, xuất Excel định kỳ và khung vận hành.
            </p>
          </div>
          <div className="rounded-2xl bg-accent p-4 text-primary">
            <ShieldCheck className="h-10 w-10" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {[
          ["01", "Upload & OCR", "Khu upload PDF/ảnh, trạng thái đang scan, cảnh báo OCR, nhận diện file trùng theo hash."],
          ["02", "Review & Tổng hợp", "Bảng editable kiểu Excel, tự lưu khi rời ô, xóa từng dòng scan nhầm, lọc theo nghiệp vụ."],
          ["03", "Tài liệu & Lịch sử", "Danh sách file đã xử lý, xóa tài liệu kéo theo rows, không scan lại tài liệu đã có."],
          ["04", "Vận hành demo", "Module placeholder cho sản phẩm, tồn kho, đồng bộ web bán hàng kiểu Sapo/Sales dashboard."],
          ["05", "Báo cáo", "KPI, lịch sử xuất Excel, báo cáo định kỳ và cảnh báo dữ liệu thiếu."],
          ["06", "Cài đặt", "Khung cấu hình OCR, lưu trữ Supabase, gợi ý nhanh và mẫu export."]
        ].map(([step, title, desc]) => (
          <div key={step} className="panel p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">{step}</div>
            <h3 className="mt-4 text-lg font-bold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 font-semibold">Navigation mẫu</div>
          <div className="space-y-2 p-4">
            {["Dashboard", "Scan hóa đơn", "Tổng hợp hóa đơn", "Tài liệu", "Sản phẩm", "Tồn kho", "Lên đơn hàng", "Báo cáo", "Cài đặt"].map((item, index) => (
              <div key={item} className={`rounded-xl px-4 py-3 text-sm font-semibold ${index === 2 ? "bg-primary text-white" : "bg-slate-50 text-slate-600"}`}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-4 font-semibold">Bảng dữ liệu mẫu</div>
          <div className="overflow-auto">
            <table className="data-table w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-accent text-accent-foreground">
                <tr>
                  {["Ngày", "Nhà cung cấp", "Sản phẩm", "SKU", "SL", "Thành tiền", "Trạng thái"].map((header) => (
                    <th key={header} className="border-b border-r border-slate-200 px-4 py-3 text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["07/06/2026", "Á Châu Logistics", "Ví cầm tay", "VCT001", "450", "7,144,200", "Đã lưu"],
                  ["07/06/2026", "ASM", "Cuốn dính số 5", "LDN00196", "120", "1,584,000", "Thiếu SKU"],
                  ["07/06/2026", "Mỹ Thanh", "Sổ bìa cứng", "SDA000245", "60", "570,000", "Đã lưu"]
                ].map((row) => (
                  <tr key={row.join("-")} className="hover:bg-accent/40">
                    {row.map((cell, index) => (
                      <td key={`${cell}-${index}`} className="border-b border-r border-slate-200 px-4 py-3">
                        {index === 6 ? <span className="rounded-full bg-honey-50 px-3 py-1 text-xs font-semibold text-amber-800">{cell}</span> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="text-lg font-bold">Nguyên tắc UI cho demo</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Màu chính", "Xanh cobalt cho hành động chính, vàng kem cho ô nhập tay hoặc dữ liệu thiếu."],
            ["Bảng", "Header sticky, scroll ngang, input trong cell, autosave khi blur, có nút xóa dòng."],
            ["Form", "Ngày dùng date picker, số dùng numeric input, trường nội bộ để trống và highlight."],
            ["Tài liệu", "Mỗi file có lịch sử, trạng thái OCR, cảnh báo và xóa cascade."]
          ].map(([title, desc]) => (
            <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">{title}</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
