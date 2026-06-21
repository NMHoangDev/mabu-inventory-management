"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  CircleUser,
  HelpCircle,
  MessageCircle
} from "lucide-react";

const REPORTS = [
  {
    key: "profit-loss",
    href: "/reports/finance/profit-loss",
    icon: (
      <svg className="w-full h-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 36H40" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M12 28L18 22L24 28L36 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 12V16M8 20H12M40 28V32M36 36H40" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <circle cx="24" cy="28" fill="currentColor" r="1.5" />
      </svg>
    ),
    title: "Báo cáo lãi lỗ",
    description: "Theo dõi doanh thu, chi phí và lợi nhuận của cửa hàng"
  },
  {
    key: "cash-ledger",
    href: "/finance/cash-ledger",
    icon: (
      <svg className="w-full h-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <rect height="32" rx="2" stroke="currentColor" strokeWidth="2" width="32" x="8" y="8" />
        <path d="M14 16H34M14 24H34M14 32H24" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <rect height="8" rx="1" stroke="currentColor" strokeWidth="2" width="8" x="30" y="28" />
      </svg>
    ),
    title: "Sổ quỹ",
    description: "Theo dõi các khoản thu chi của cửa hàng"
  },
  {
    key: "customer-debt",
    href: "/reports/finance/customer-debt",
    icon: (
      <svg className="w-full h-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path d="M36 24C36 30.6274 30.6274 36 24 36C17.3726 36 12 30.6274 12 24C12 17.3726 17.3726 12 24 12C30.6274 12 36 17.3726 36 24Z" stroke="currentColor" strokeWidth="2" />
        <path d="M24 18V24L28 28" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M4 24H8M40 24H44M24 4V8M24 40V44" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    ),
    title: "Báo cáo công nợ khách hàng",
    description: "Theo dõi các khoản công nợ phải thu hoặc phải trả khách hàng"
  },
  {
    key: "supplier-debt",
    href: "/reports/finance/supplier-debt",
    icon: (
      <svg className="w-full h-full" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 12H36V32C36 34.2091 34.2091 36 32 36H16C13.7909 36 12 34.2091 12 32V12Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
        <path d="M18 12V8H30V12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <circle cx="24" cy="24" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
    title: "Báo cáo công nợ nhà cung cấp",
    description: "Theo dõi các khoản công nợ phải thu hoặc phải trả nhà cung cấp"
  }
];

export default function FinanceReportsPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 flex-shrink-0">
        <h1 className="text-xl font-semibold text-slate-800">Danh sách báo cáo tài chính</h1>
        <button className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm border border-slate-300 rounded px-3 py-1.5 bg-white">
          <HelpCircle className="w-4 h-4" />
          Trợ giúp
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 bg-[#f4f6f8]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {REPORTS.map((r) => (
            <Link
              key={r.key}
              href={r.href}
              className="flex items-start p-5 bg-white border border-slate-200 rounded-sm hover:border-blue-500 hover:shadow-md transition-all group"
            >
              <div className="mr-4 mt-1 flex-shrink-0 text-slate-600 w-12 h-12">
                {r.icon}
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 mb-1 group-hover:text-blue-600">{r.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{r.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex justify-center px-6 py-6 flex-shrink-0">
        <div className="bg-blue-50 border border-blue-100 rounded-full px-6 py-3 flex items-center gap-3">
          <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-600">
            Bạn có thể xem thêm hướng dẫn về theo dõi báo cáo{" "}
            <a className="text-blue-600 hover:underline" href="#">tại đây</a>
          </p>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-20">
        <button className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700 transition-colors">
          <MessageCircle className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
