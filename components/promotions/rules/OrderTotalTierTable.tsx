"use client";

import type { OrderTotalRules } from "@/lib/promotions/types";
import { AddConditionButton, DiscountCell, NumberCell, RowDeleteButton, genRowId } from "./RuleCells";

interface OrderTotalTierTableProps {
  rules: OrderTotalRules;
  errors: Record<string, string>;
  onChange: (rules: OrderTotalRules) => void;
}

/** Chiết khấu theo tổng giá trị đơn hàng — bậc thang GLOBAL (không theo sản
 *  phẩm) nên trùng khoảng bị CHẶN (không như by_quantity — 1 đơn không thể
 *  vừa nằm ở 2 bậc tổng tiền khác nhau một cách hợp lý). */
export function OrderTotalTierTable({ rules, errors, onChange }: OrderTotalTierTableProps) {
  const tiers = rules.tiers;

  const updateRow = (rowId: string, patch: Partial<OrderTotalRules["tiers"][number]>) => {
    onChange({ ...rules, tiers: tiers.map((t) => (t.row_id === rowId ? { ...t, ...patch } : t)) });
  };
  const removeRow = (rowId: string) => onChange({ ...rules, tiers: tiers.filter((t) => t.row_id !== rowId) });
  const addRow = () =>
    onChange({
      ...rules,
      tiers: [...tiers, { row_id: genRowId(), min_order_total: 0, discount_type: "amount", discount_value: 0 }],
    });

  return (
    <div>
      <div className="border border-[#c0c6d6] rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#ebf5ff] border-b border-[#c0c6d6]">
              <th className="px-3 py-2 text-xs font-semibold text-[#404754] uppercase">Tổng giá trị đơn từ</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#404754] uppercase w-44 text-right">Chiết khấu</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c0c6d6]">
            {tiers.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-xs text-[#404754]">
                  Chưa có bậc nào. Nhấn "Thêm điều kiện" để bắt đầu.
                </td>
              </tr>
            ) : (
              tiers.map((tier, idx) => (
                <tr key={tier.row_id}>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-2 max-w-xs">
                      <NumberCell
                        value={tier.min_order_total}
                        onChange={(v) => updateRow(tier.row_id, { min_order_total: v ?? 0 })}
                        error={errors[`rules.${idx}.min_order_total`]}
                      />
                      <span className="text-sm text-[#404754]">đ</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <DiscountCell
                      type={tier.discount_type}
                      value={tier.discount_value}
                      onChange={(v) => updateRow(tier.row_id, { discount_value: v })}
                      onToggleType={() =>
                        updateRow(tier.row_id, { discount_type: tier.discount_type === "percent" ? "amount" : "percent" })
                      }
                      error={errors[`rules.${idx}.discount_value`]}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <RowDeleteButton onClick={() => removeRow(tier.row_id)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {errors["tiers"] && <p className="mt-1 text-[11px] text-[#ba1a1a]">{errors["tiers"]}</p>}
      <AddConditionButton onClick={addRow} />
    </div>
  );
}
