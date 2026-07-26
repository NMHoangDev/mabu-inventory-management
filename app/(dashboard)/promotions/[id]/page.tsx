"use client";

import { useParams } from "next/navigation";
import { PromotionForm } from "@/components/promotions/PromotionForm";

export default function PromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <PromotionForm mode="edit" promotionId={id} />;
}
