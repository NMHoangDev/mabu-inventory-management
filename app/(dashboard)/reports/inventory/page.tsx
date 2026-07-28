"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Boxes,
  CheckSquare,
  MessageCircle,
  PackageSearch,
  TrendingDown,
  TrendingUp,
  Warehouse
} from "lucide-react";
import { PageGuard } from "@/components/auth/PageGuard";

const REPORTS = [
  {
    icon: Warehouse,
    title: "Báo cáo tồn kho",
    description: "Quản lý số lượng và giá trị tồn kho của chi nhánh và toàn hệ thống",
    href: "/reports/inventory/summary"
  },
  {
    icon: PackageSearch,
    title: "Báo cáo tồn kho chi tiết",
    description: "Quản lý hàng hóa ở các trạng thái khác nhau",
    href: "/reports/inventory/detail"
  },
  {
    icon: BookOpen,
    title: "Sổ kho",
    description: "Quản lý lịch sử giao dịch xuất nhập kho",
    href: "/reports/inventory/stock-ledger"
  },
  {
    icon: TrendingDown,
    title: "Báo cáo tồn kho dưới định mức",
    description: "Quản lý các sản phẩm có tồn kho dưới định mức",
    href: "/reports/inventory/below-threshold"
  },
  {
    icon: TrendingUp,
    title: "Báo cáo tồn kho vượt định mức",
    description: "Quản lý các sản phẩm có tồn kho vượt định mức",
    href: "/reports/inventory/above-threshold"
  },
  {
    icon: Boxes,
    title: "Báo cáo xuất nhập tồn sản phẩm",
    description: "Quản lý tồn đầu kỳ, nhập trong kỳ và tồn cuối kỳ của sản phẩm",
    href: "/reports/inventory/in-out-balance"
  },
  {
    icon: CheckSquare,
    title: "Báo cáo kiểm kê hàng hóa",
    description: "Quản lý các thông tin kiểm hàng, số lượng hàng hỏng và lý do",
    href: "/reports/inventory/stock-check"
  }
];

export default function InventoryReportsPage() {
  return (
    <PageGuard permission="reports.view_inventory">
    <div className="flex flex-col min-h-screen bg-[#f0f2f5]">
      {/* Header */}
      <header className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <Link href="/reports/sales" className="text-gray-400 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-gray-800">Danh sách báo cáo kho</h1>
        </div>
        <button className="flex items-center gap-2 text-gray-600 hover:text-blue-600 border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Trợ giúp
        </button>
      </header>

      {/* Reports Grid */}
      <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded hover:shadow-md cursor-pointer transition-shadow"
          >
            <div className="mt-1 text-gray-700">
              <r.icon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">{r.title}</h3>
              <p className="text-gray-500 text-xs mt-1 leading-relaxed">{r.description}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Help Banner */}
      <div className="mt-auto flex justify-center pb-20 px-6">
        <div className="bg-blue-50 border border-blue-100 rounded-full px-6 py-3 flex items-center gap-3">
          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">
            Bạn có thể xem thêm hướng dẫn về theo dõi báo cáo{" "}
            <a className="text-blue-500 hover:underline" href="#">tại đây</a>
          </p>
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-50">
        <button className="bg-blue-500 w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-colors">
          <MessageCircle className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
    </PageGuard>
  );
}
