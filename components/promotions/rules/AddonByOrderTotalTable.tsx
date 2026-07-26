"use client";

import type { AddonByOrderTotalRules } from "@/lib/promotions/types";
import { DiscountCell, NumberCell, ProductCell } from "./RuleCells";

interface AddonByOrderTotalTableProps {
  rules: AddonByOrderTotalRules;
  errors: Record<string, string>;
  onChange: (rules: AddonByOrderTotalRules) => void;
}

/** Chiết khấu sản phẩm mua thêm theo tổng giá trị đơn hàng: đơn đạt ngưỡng T
 *  thì các SP "mua thêm" trong danh sách được chiết khấu. Mặc định KHÔNG tính
 *  tiền của chính SP mua thêm vào ngưỡng (threshold_excludes_addons) — tránh
 *  khách dùng chính hàng khuyến mại để tự đẩy đơn đạt ngưỡng. */
export function AddonByOrderTotalTable({ rules, errors, onChange }: AddonByOrderTotalTableProps) {
  const products = rules.addon_products;

  const removeProduct = (productId: string) =>
    onChange({ ...rules, addon_products: products.filter((p) => p.product_id !== productId) });
  const addProduct = (hit: { id: string; name: string; sku: string; unit?: string; image_url?: string }) => {
    if (products.some((p) => p.product_id === hit.id)) return;
    onChange({
      ...rules,
      addon_products: [
        ...products,
        { product_id: hit.id, product_name: hit.name, product_sku: hit.sku, unit: hit.unit, image_url: hit.image_url },
      ],
    });
  };

  return (
    <div className="border border-[#c0c6d6] rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 max-w-md">
        <label className="text-xs font-medium text-[#404754] whitespace-nowrap">Đơn hàng từ</label>
        <NumberCell
          value={rules.min_order_total}
          onChange={(v) => onChange({ ...rules, min_order_total: v ?? 0 })}
          error={errors["min_order_total"]}
        />
        <span className="text-sm text-[#404754]">đ</span>
      </div>

      <label className="flex items-center gap-2 text-xs text-[#404754]">
        <input
          type="checkbox"
          checked={rules.threshold_excludes_addons}
          onChange={(e) => onChange({ ...rules, threshold_excludes_addons: e.target.checked })}
          className="w-4 h-4 rounded border-[#c0c6d6] text-[#005baf] focus:ring-[#005baf]"
        />
        Không tính tiền của các sản phẩm mua thêm vào ngưỡng đơn hàng (khuyến nghị)
      </label>

      <div>
        <label className="block text-xs font-medium text-[#404754] mb-1">Sản phẩm mua thêm</label>
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
        {errors["addon_products"] && <p className="mt-1 text-[11px] text-[#ba1a1a]">{errors["addon_products"]}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
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
            Chiết khấu <span className="font-normal">/sp</span>
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
