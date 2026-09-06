import Sidebar from "@/components/Sidebar";

/**
 * Khung app: sidebar cố định bên trái + vùng nội dung tự cuộn. Bề rộng
 * container và nhịp dọc lấy theo app shell của webapp merkeeai
 * (max-w-[1200px], p-6, space-y-6).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto bg-slate-50/40">
        <div className="mx-auto max-w-[1200px] p-6">{children}</div>
      </main>
    </div>
  );
}
