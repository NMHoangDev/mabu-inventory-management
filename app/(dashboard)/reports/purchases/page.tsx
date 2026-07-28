"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  MessageCircle,
  Plus,
  ShoppingBasket,
  Truck
} from "lucide-react";
import { PageGuard } from "@/components/auth/PageGuard";

const IMPORT_SECTIONS = [
  {
    title: "Báo cáo hàng nhập kho",
    description: "Theo dõi thông tin về hàng nhập kho theo",
    cards: [
      {
        icon: CalendarDays,
        label: "Thời gian",
        href: "/reports/purchases/by-time"
      },
      {
        icon: ({ className }: { className?: string }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        label: "Nhà cung cấp",
        href: "/reports/purchases/by-supplier"
      },
      {
        icon: ShoppingBasket,
        label: "Sản phẩm",
        href: "/reports/purchases/by-product"
      },
      {
        icon: ClipboardList,
        label: "Đơn nhập",
        href: "/reports/purchases/by-order"
      }
    ]
  },
  {
    title: "Báo cáo thanh toán nhập hàng",
    description: "Theo dõi các khoản đã thanh toán nhập hàng dựa theo",
    cards: [
      {
        icon: CalendarDays,
        label: "Thời gian",
        href: "/reports/purchases/payment-by-time"
      },
      {
        icon: ({ className }: { className?: string }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
        label: "Nhân viên",
        href: "/reports/purchases/payment-by-staff"
      },
      {
        icon: ({ className }: { className?: string }) => (
          <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <path d="M1 10h22" />
          </svg>
        ),
        label: "Phương thức thanh toán",
        href: "/reports/purchases/payment-by-method"
      },
      {
        icon: Truck,
        label: "Chi nhánh, cửa hàng",
        href: "/reports/purchases/payment-by-branch"
      }
    ]
  }
];

function ReportCard({
  icon: IconComponent,
  label,
  href
}: {
  icon: React.ElementType | (({ className }: { className?: string }) => React.ReactElement);
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="report-card border border-gray-200 rounded p-6 flex flex-col items-center justify-center gap-3 cursor-pointer bg-white hover:border-blue-500 hover:shadow-md transition-all"
    >
      <div className="text-gray-700 w-8 h-8">
        <IconComponent className="w-full h-full" />
      </div>
      <span className="text-sm text-gray-700 text-center">{label}</span>
    </Link>
  );
}

export default function PurchasesReportPage() {
  return (
    <PageGuard permission="reports.view_purchases">
    <div className="flex flex-col min-h-screen bg-[#f0f1f3]">
      {/* Sidebar (native) — only main content in this page component */}

      {/* Page Header */}
      <header className="bg-white p-6 flex flex-col gap-5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/reports/sales" className="text-gray-400 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-semibold text-gray-800">Danh sách báo cáo nhập hàng</h1>
          </div>
          <div className="flex gap-3">
            <button className="bg-[#0088ff] hover:bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Tạo báo cáo tùy chỉnh
            </button>
            <button className="border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2 rounded text-sm text-gray-600 font-medium flex items-center gap-2 transition-colors">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Trợ giúp
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm shadow-sm bg-white"
            placeholder="Tìm kiếm báo cáo"
            type="text"
          />
        </div>
      </header>

      {/* Report Sections */}
      <div className="px-6 py-8 pb-24 space-y-8">
        {IMPORT_SECTIONS.map((section, si) => (
          <section key={si} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <div className="mb-5">
              <h2 className="text-lg font-medium text-gray-800">{section.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{section.description}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {section.cards.map((card, ci) => (
                <ReportCard
                  key={ci}
                  icon={card.icon}
                  label={card.label}
                  href={card.href}
                />
              ))}
            </div>
            {si === 0 && (
              <div className="mt-4 flex justify-center">
                <button className="text-blue-500 text-xs font-medium hover:underline flex items-center gap-1">
                  Xem tất cả
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>
            )}
          </section>
        ))}

        {/* Custom Reports */}
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-medium text-gray-800">Báo cáo bán hàng tùy chỉnh</h2>
              <p className="text-sm text-gray-500 mt-0.5">Báo cáo bạn tự tạo và tùy chỉnh các thông tin cần theo dõi</p>
            </div>
            <select className="text-sm border border-gray-300 rounded px-3 py-1.5 bg-white focus:ring-1 focus:ring-blue-500">
              <option>Tất cả báo cáo</option>
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button className="report-card border border-dashed border-gray-300 bg-gray-50/30 rounded p-6 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-gray-50 transition-all">
              <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-sm text-gray-700 text-center">Thêm mới báo cáo tùy chỉnh</span>
            </button>
          </div>
        </section>
      </div>

      {/* Help Banner */}
      <div className="flex justify-center px-6 pb-12">
        <div className="bg-blue-50 border border-blue-100 rounded-full px-6 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-gray-700">
            Bạn có thể xem thêm hướng dẫn về theo dõi báo cáo{" "}
            <a className="text-blue-500 hover:underline" href="#">tại đây</a>
          </p>
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-10 right-6 z-50">
        <button className="bg-[#0088ff] w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-colors">
          <MessageCircle className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
    </PageGuard>
  );
}
