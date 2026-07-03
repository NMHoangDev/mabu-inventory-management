"use client";

import { useZaloCrawlerFlow } from "@/hooks/useZaloCrawlerFlow";
import { ZaloDashboardView } from "./ZaloDashboardView";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function ZaloAccountsPageContent() {
  const flow = useZaloCrawlerFlow();
  const router = useRouter();

  function handleEnterChat(accountId: string) {
    if (accountId !== flow.userId) {
      flow.switchAccount(accountId);
    }
    // Navigate tới trang chat full-screen (không có sidebar menu)
    router.push("/zalo-chat");
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#f8f9fa]">
      <ZaloDashboardView flow={flow} onEnterChat={handleEnterChat} />
    </div>
  );
}