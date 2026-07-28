"use client";

import { useParams } from "next/navigation";
import { PromotionForm } from "@/components/promotions/PromotionForm";
import { PageGuard } from "@/components/auth/PageGuard";

export default function PromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PageGuard permission="promotions.view">
      <PromotionForm mode="edit" promotionId={id} />
    </PageGuard>
  );
}
