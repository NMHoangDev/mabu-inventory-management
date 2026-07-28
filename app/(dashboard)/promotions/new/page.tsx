"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PromotionForm } from "@/components/promotions/PromotionForm";
import { PageGuard } from "@/components/auth/PageGuard";
import type { PromotionMethod } from "@/lib/promotions/types";

const VALID_METHODS: PromotionMethod[] = ["order_total", "per_product", "by_quantity", "addon_by_order_total"];

function NewPromotionInner() {
  const params = useSearchParams();
  const raw = params.get("method");
  const method = VALID_METHODS.includes(raw as PromotionMethod) ? (raw as PromotionMethod) : "by_quantity";
  return <PromotionForm mode="create" initialMethod={method} />;
}

export default function NewPromotionPage() {
  return (
    <PageGuard permission="promotions.create">
    <Suspense fallback={null}>
      <NewPromotionInner />
    </Suspense>
    </PageGuard>
  );
}
