"use client";

import dynamic from "next/dynamic";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";

const AutomationBootstrap = dynamic(
  () => import("@/components/system/AutomationBootstrap").then((m) => m.AutomationBootstrap),
  { ssr: false }
);

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AutomationBootstrap />
      <DashboardLayout>{children}</DashboardLayout>
    </>
  );
}
