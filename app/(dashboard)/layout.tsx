"use client";

import dynamic from "next/dynamic";
import { DashboardLayout } from "@/invoice-flow-manager-fe/components/layouts/DashboardLayout";
import { PermissionsProvider } from "@/components/providers/PermissionsProvider";

const AutomationBootstrap = dynamic(
  () => import("@/invoice-flow-manager-fe/components/system/AutomationBootstrap").then((m) => m.AutomationBootstrap),
  { ssr: false }
);

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PermissionsProvider>
      <AutomationBootstrap />
      <DashboardLayout>{children}</DashboardLayout>
    </PermissionsProvider>
  );
}
