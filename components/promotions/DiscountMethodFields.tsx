"use client";

import { PROMOTION_METHOD_HINTS, PROMOTION_METHOD_LABELS, type PromotionMethod, type PromotionRulesByMethod } from "@/lib/promotions/types";
import { OrderTotalTierTable } from "./rules/OrderTotalTierTable";
import { PerProductRuleTable } from "./rules/PerProductRuleTable";
import { ByQuantityRuleTable } from "./rules/ByQuantityRuleTable";
import { AddonByOrderTotalTable } from "./rules/AddonByOrderTotalTable";

const METHOD_ORDER: PromotionMethod[] = ["order_total", "per_product", "by_quantity", "addon_by_order_total"];

interface DiscountMethodFieldsProps {
  method: PromotionMethod;
  rules: PromotionRulesByMethod;
  errors: Record<string, string>;
  onMethodChange: (m: PromotionMethod) => void;
  onRulesChange: (method: PromotionMethod, rules: PromotionRulesByMethod[PromotionMethod]) => void;
}

export function DiscountMethodFields({ method, rules, errors, onMethodChange, onRulesChange }: DiscountMethodFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[#404754] mb-1">Chọn phương thức khuyến mại</label>
        <select
          value={method}
          onChange={(e) => onMethodChange(e.target.value as PromotionMethod)}
          className="w-full max-w-md p-2 border border-[#c0c6d6] rounded text-sm focus:border-[#005baf] focus:ring-1 focus:ring-[#005baf] outline-none"
        >
          {METHOD_ORDER.map((m) => (
            <option key={m} value={m}>
              {PROMOTION_METHOD_LABELS[m]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[#404754]">{PROMOTION_METHOD_HINTS[method]}</p>
      </div>

      {method === "order_total" && (
        <OrderTotalTierTable rules={rules.order_total} errors={errors} onChange={(r) => onRulesChange("order_total", r)} />
      )}
      {method === "per_product" && (
        <PerProductRuleTable rules={rules.per_product} errors={errors} onChange={(r) => onRulesChange("per_product", r)} />
      )}
      {method === "by_quantity" && (
        <ByQuantityRuleTable rules={rules.by_quantity} errors={errors} onChange={(r) => onRulesChange("by_quantity", r)} />
      )}
      {method === "addon_by_order_total" && (
        <AddonByOrderTotalTable
          rules={rules.addon_by_order_total}
          errors={errors}
          onChange={(r) => onRulesChange("addon_by_order_total", r)}
        />
      )}
    </div>
  );
}
