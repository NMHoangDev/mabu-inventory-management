"use client";

import type { PerProductRules } from "@/lib/promotions/types";
import { DiscountCell, NumberCell, ProductCell, RowDeleteButton, genRowId } from "./RuleCells";

interface PerProductRuleTableProps {
  rules: PerProductRules;
  errors: Record<string, string>;
  onChange: (rules: PerProductRules) => void;
}

/** Chiết khấu theo từng sản phẩm — mua bất kỳ SP trong danh sách với SL tối
 *  thiểu N (tính theo TỪNG DÒNG, không gộp cả giỏ) thì được chiết khấu trên
 *  từng sản phẩm. "Giới hạn KM" = tổng SL tối đa được hưởng trên cả đơn. */
export function PerProductRuleTable({ rules, errors, onChange }: PerProductRuleTableProps) {
  const products = rules.products;

  const removeProduct = (productId: string) =>
    onChange({ ...rules, products: products.filter((p) => p.product_id !== productId) });
  const addProduct = (hit: { id: string; name: string; sku: string; unit?: string; image_url?: string }) => {
    if (products.some((p) => p.product_id === hit.id)) return;
    onChange({
      ...rules,
      products: [
        ...products,
        { product_id: hit.id, product_name: hit.name, product_sku: hit.sku, unit: hit.unit, image_url: hit.image_url },
      ],
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[#404754] mb-1">Sản phẩm áp dụng</label>
        <div className="border border-[#c0c6d6] rounded-lg divide-y divide-[#c0c6d6]">
          {products.length === 0 ? (
            <div className="px-3 py-3 text-xs text-[#404754]">Chưa chọn sản phẩm nào.</div>
          ) : (
            products.map((p) => (
              <div key={p.product_id} className="px-3 py-2">
                <ProductCell
                  productId={p.product_id}
                  productName={p.product_name}
                  productSku={p.product_sku}
                  imageUrl={p.image_url}
                  excludeIds={products.map((x) => x.product_id)}
                  onPick={() => undefined}
                  onClear={() => removeProduct(p.product_id)}
                />
              </div>
            ))
          )}
          <div className="px-3 py-2">
            <ProductCell
              productId=""
              productName=""
              productSku=""
              excludeIds={products.map((p) => p.product_id)}
              onPick={addProduct}
              onClear={() => undefined}
            />
          </div>
        </div>
        {errors["products"] && <p className="mt-1 text-[11px] text-[#ba1a1a]">{errors["products"]}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-xl">
        <div>
          <label className="block text-xs font-medium text-[#404754] mb-1">SL tối thiểu</label>
          <NumberCell
            value={rules.min_quantity}
            onChange={(v) => onChange({ ...rules, min_quantity: v ?? 1 })}
            error={errors["min_quantity"]}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#404754] mb-1">Giới hạn KM</label>
          <NumberCell
            value={rules.quantity_cap}
            onChange={(v) => onChange({ ...rules, quantity_cap: v })}
            placeholder="Không giới hạn"
            allowEmpty
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#404754] mb-1">
            Chiết khấu <span className="font-normal text-[#404754]">/sp</span>
          </label>
          <DiscountCell
            type={rules.discount_type}
            value={rules.discount_value}
            onChange={(v) => onChange({ ...rules, discount_value: v })}
            onToggleType={() => onChange({ ...rules, discount_type: rules.discount_type === "percent" ? "amount" : "percent" })}
            error={errors["discount_value"]}
          />
        </div>
      </div>
    </div>
  );
}
