"use client";

import { Plus } from "lucide-react";

export default function SupplierGroupsPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      <header className="h-14 bg-white px-6 py-4 border-b flex justify-between items-center flex-shrink-0">
        <h1 className="text-2xl font-semibold text-slate-800">Nhóm nhà cung cấp</h1>
        <div className="flex gap-3">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-sm text-sm font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> Thêm nhóm
          </button>
          <button className="bg-white border hover:bg-gray-50 text-gray-700 px-4 py-2 rounded shadow-sm text-sm font-medium">
            Trợ giúp
          </button>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 opacity-20">🏢</div>
          <p className="text-slate-500 text-sm">Trang quản lý nhóm nhà cung cấp đang được xây dựng.</p>
        </div>
      </div>
    </div>
  );
}
