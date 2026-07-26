"use client";

import type { ByQuantityRules, QuantityTierRow } from "@/lib/promotions/types";
import { AddConditionButton, DiscountCell, NumberCell, ProductCell, RowDeleteButton, genRowId } from "./RuleCells";

interface ByQuantityRuleTableProps {
  rules: ByQuantityRules;
  errors: Record<string, string>;
  onChange: (rules: ByQuantityRules) => void;
}

/** Phương thức ƯU TIÊN, khớp đúng ảnh mẫu Sapo: Sản phẩm mua | SL từ | SL đến |
 *  Chiết khấu. MỘT sản phẩm được phép nằm NHIỀU dòng (dữ liệu thật có 10-19,
 *  20-∞, 20-49 cùng 1 sản phẩm) nên excludeIds LUÔN rỗng và key dùng row_id
 *  sinh client, không dùng product_id. Trùng khoảng chỉ cảnh báo, không chặn —
 *  engine (lib/promotions/engine.ts pickBestQuantityTier) có tie-break xác định:
 *  ưu tiên mức chiết khấu lợi nhất cho khách. */
export function ByQuantityRuleTable({ rules, errors, onChange }: ByQuantityRuleTableProps) {
  const rows = rules.rows;

  const updateRow = (rowId: string, patch: Partial<QuantityTierRow>) => {
    onChange({ ...rules, rows: rows.map((r) => (r.row_id === rowId ? { ...r, ...patch } : r)) });
  };
  const removeRow = (rowId: string) => {
    onChange({ ...rules, rows: rows.filter((r) => r.row_id !== rowId) });
  };
  const addRow = () => {
    onChange({
      ...rules,
      rows: [
        ...rows,
        {
          row_id: genRowId(),
          product_id: "",
          product_name: "",
          product_sku: "",
          qty_from: 1,
          qty_to: null,
          discount_type: "amount",
          discount_value: 0,
        },
      ],
    });
  };

  // Cảnh báo trùng khoảng theo từng sản phẩm — không chặn, chỉ báo để người
  // dùng biết engine sẽ tự chọn mức lợi nhất cho khách.
  const overlapRowIds = new Set<string>();
  const byProduct = new Map<string, QuantityTierRow[]>();
  for (const r of rows) {
    if (!r.product_id) continue;
    const arr = byProduct.get(r.product_id) ?? [];
    arr.push(r);
    byProduct.set(r.product_id, arr);
  }
  for (const group of byProduct.values()) {
    const sorted = [...group].sort((a, b) => a.qty_from - b.qty_from);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i];
        const b = sorted[j];
        const aTo = a.qty_to ?? Infinity;
        if (b.qty_from <= aTo) {
          overlapRowIds.add(a.row_id);
          overlapRowIds.add(b.row_id);
        }
      }
    }
  }

  return (
    <div>
      <div className="border border-[#c0c6d6] rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#ebf5ff] border-b border-[#c0c6d6]">
              <th className="px-3 py-2 text-xs font-semibold text-[#404754] uppercase min-w-[280px]">
                Sản phẩm mua
              </th>
              <th className="px-3 py-2 text-xs font-semibold text-[#404754] uppercase w-28 text-right">SL từ</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#404754] uppercase w-32 text-right">SL đến</th>
              <th className="px-3 py-2 text-xs font-semibold text-[#404754] uppercase w-44 text-right">
                Chiết khấu
                <div className="text-[10px] font-normal normal-case text-[#404754]">trên mỗi sản phẩm</div>
              </th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c0c6d6]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-xs text-[#404754]">
                  Chưa có điều kiện nào. Nhấn "Thêm điều kiện" để bắt đầu.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.row_id}>
                  <td className="px-3 py-2 align-top">
                    <ProductCell
                      productId={row.product_id}
                      productName={row.product_name}
                      productSku={row.product_sku}
                      imageUrl={row.image_url}
                      excludeIds={[]}
                      onPick={(hit) =>
                        updateRow(row.row_id, {
                          product_id: hit.id,
                          product_name: hit.name,
                          product_sku: hit.sku,
                          image_url: hit.image_url,
                        })
                      }
                      onClear={() => updateRow(row.row_id, { product_id: "", product_name: "", product_sku: "" })}
                      error={errors[`rules.${idx}.product_id`]}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <NumberCell
                      value={row.qty_from}
                      onChange={(v) => updateRow(row.row_id, { qty_from: v ?? 1 })}
                      error={errors[`rules.${idx}.qty_from`]}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <NumberCell
                      value={row.qty_to}
                      onChange={(v) => updateRow(row.row_id, { qty_to: v })}
                      placeholder="Không giới hạn"
                      allowEmpty
                      error={errors[`rules.${idx}.qty_to`]}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <DiscountCell
                      type={row.discount_type}
                      value={row.discount_value}
                      onChange={(v) => updateRow(row.row_id, { discount_value: v })}
                      onToggleType={() =>
                        updateRow(row.row_id, { discount_type: row.discount_type === "percent" ? "amount" : "percent" })
                      }
                      error={errors[`rules.${idx}.discount_value`]}
                    />
                    {overlapRowIds.has(row.row_id) && (
                      <p className="mt-0.5 text-[11px] text-orange-600">
                        Khoảng SL trùng với dòng khác — hệ thống sẽ ưu tiên mức chiết khấu cao hơn.
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <RowDeleteButton onClick={() => removeRow(row.row_id)} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <AddConditionButton onClick={addRow} />
    </div>
  );
}
