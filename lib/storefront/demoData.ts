/**
 * lib/storefront/demoData.ts — dữ liệu DANH MỤC/SẢN PHẨM GIẢ, chỉ để xem thử
 * giao diện storefront đầy đủ khi DB thật mới có vài sản phẩm publish.
 *
 * KHÔNG bao giờ ghi vào DB — chỉ merge thêm vào kết quả trả về ở
 * lib/storefront/catalog.ts, và CHỈ khi `isDemoMode()` true. `next start`
 * (production, xem zalo-bridge.Dockerfile pattern tương tự cho frontend) tự
 * đặt NODE_ENV=production nên demo data KHÔNG THỂ lọt lên web live dù có quên
 * tắt — không phụ thuộc 1 biến .env dễ copy nhầm sang server.
 *
 * Dọn sạch: xoá file này + các đoạn `isDemoMode()`/`DEMO_*` trong catalog.ts
 * là hết, không cần dọn DB vì chưa từng ghi DB.
 *
 * Giới hạn: sản phẩm demo không có row thật trong bảng `products` nên KHÔNG
 * đặt hàng thật được — checkout() sẽ báo "sản phẩm không còn tồn tại" nếu bấm
 * đặt hàng 1 item demo. Dùng 4 sản phẩm thật (đã tự hiện vì tồn kho > 1) để
 * test luồng đặt hàng/trừ kho thật.
 */

import type { StorefrontCategory, StorefrontProductDetail, StorefrontProductSummary } from "./catalog";

export function isDemoMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

function placeholderImage(emoji: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480">
    <rect width="480" height="480" fill="${bg}"/>
    <text x="50%" y="44%" font-size="120" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
    <text x="50%" y="78%" font-size="22" font-family="Arial, sans-serif" fill="#ffffffcc" text-anchor="middle">Ảnh minh hoạ (demo)</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface DemoCategoryDef {
  slug: string;
  name: string;
  bg: string;
  emoji: string;
}

const DEMO_CATEGORIES: DemoCategoryDef[] = [
  { slug: "demo-phu-kien-toc", name: "Phụ kiện tóc", bg: "#f472b6", emoji: "🎀" },
  { slug: "demo-do-dung-giac-ngu", name: "Đồ dùng giấc ngủ", bg: "#818cf8", emoji: "🌙" },
  { slug: "demo-van-phong-pham", name: "Văn phòng phẩm", bg: "#34d399", emoji: "📒" },
  { slug: "demo-guong-trang-diem", name: "Gương & trang điểm", bg: "#fbbf24", emoji: "🪞" },
  { slug: "demo-tui-vi", name: "Túi & ví", bg: "#60a5fa", emoji: "👜" },
];

interface DemoProductDef {
  slug: string;
  name: string;
  short_description: string;
  description: string;
  unit: string;
  price: number;
  compare_at_price: number | null;
  stock: number;
  category_slug: string;
}

const DEMO_PRODUCTS: DemoProductDef[] = [
  {
    slug: "demo-kep-toc-hoa-cuc",
    name: "Kẹp tóc hoa cúc mini (set 5 cái)",
    short_description: "Set 5 kẹp tóc hoa cúc nhiều màu, chất liệu nhựa dẻo an toàn.",
    description: "Set 5 kẹp tóc hoa cúc mini, phù hợp bé gái và nữ sinh. Chất liệu nhựa dẻo, không gãy, màu sắc trẻ trung, dễ phối đồ.",
    unit: "Set",
    price: 25000,
    compare_at_price: 32000,
    stock: 150,
    category_slug: "demo-phu-kien-toc",
  },
  {
    slug: "demo-day-buoc-toc-lua",
    name: "Dây buộc tóc lụa cao cấp (bộ 10 cái)",
    short_description: "Dây buộc tóc lụa mềm, không kéo gãy tóc, bộ 10 màu cơ bản.",
    description: "Dây buộc tóc chất liệu lụa cao cấp, co giãn tốt, không để lại vết hằn trên tóc. Bộ 10 cái đủ dùng cả tuần.",
    unit: "Bộ",
    price: 18000,
    compare_at_price: null,
    stock: 220,
    category_slug: "demo-phu-kien-toc",
  },
  {
    slug: "demo-bang-do-toc-hoat-hinh",
    name: "Băng đô tóc hoạt hình cho bé",
    short_description: "Băng đô vải mềm in hình hoạt hình, size trẻ em.",
    description: "Băng đô tóc bằng vải cotton mềm mại, hình in hoạt hình dễ thương, phù hợp cho bé từ 2-8 tuổi.",
    unit: "Cái",
    price: 15000,
    compare_at_price: 20000,
    stock: 95,
    category_slug: "demo-phu-kien-toc",
  },
  {
    slug: "demo-bit-mat-ngu-lanh",
    name: "Bịt mắt ngủ gel lạnh massage mắt",
    short_description: "Bịt mắt ngủ tích hợp túi gel lạnh, giảm mỏi mắt, thâm quầng.",
    description: "Bịt mắt ngủ có túi gel bên trong, làm lạnh/ấm tuỳ nhu cầu, giúp giảm mỏi mắt và thâm quầng sau ngày dài làm việc.",
    unit: "Cái",
    price: 35000,
    compare_at_price: 45000,
    stock: 60,
    category_slug: "demo-do-dung-giac-ngu",
  },
  {
    slug: "demo-goi-co-memory-foam",
    name: "Gối kê cổ memory foam du lịch",
    short_description: "Gối chữ U memory foam, đàn hồi tốt, tiện mang đi du lịch.",
    description: "Gối kê cổ hình chữ U làm từ memory foam cao cấp, nâng đỡ vùng cổ tốt, kèm túi đựng gọn nhẹ khi di chuyển.",
    unit: "Cái",
    price: 89000,
    compare_at_price: 120000,
    stock: 40,
    category_slug: "demo-do-dung-giac-ngu",
  },
  {
    slug: "demo-so-tay-bia-da",
    name: "Sổ tay bìa da PU A5 - 120 trang",
    short_description: "Sổ tay bìa da PU sang trọng, giấy dày 120 trang không nhoè mực.",
    description: "Sổ tay A5 bìa da PU mềm, có dây buộc và ngăn đựng thẻ, 120 trang giấy dày 80gsm, phù hợp ghi chú/ sổ tay công việc.",
    unit: "Cuốn",
    price: 42000,
    compare_at_price: null,
    stock: 130,
    category_slug: "demo-van-phong-pham",
  },
  {
    slug: "demo-set-but-gel-6-mau",
    name: "Set bút gel nhũ 6 màu",
    short_description: "Set 6 bút gel nhũ nhiều màu, mực đều, không lem.",
    description: "Set 6 bút gel nhũ nhiều màu sắc rực rỡ, mực ra đều, không lem giấy, phù hợp trang trí sổ tay/ thiệp handmade.",
    unit: "Set",
    price: 22000,
    compare_at_price: 28000,
    stock: 200,
    category_slug: "demo-van-phong-pham",
  },
  {
    slug: "demo-guong-bo-tui-led",
    name: "Gương bỏ túi có đèn LED",
    short_description: "Gương trang điểm mini tích hợp đèn LED, dùng pin AAA.",
    description: "Gương bỏ túi hai mặt (thường + phóng đại 2x), tích hợp viền đèn LED chiếu sáng, tiện trang điểm mọi lúc mọi nơi.",
    unit: "Cái",
    price: 55000,
    compare_at_price: 69000,
    stock: 75,
    category_slug: "demo-guong-trang-diem",
  },
  {
    slug: "demo-coc-trang-diem-mini",
    name: "Cọ trang điểm mini (set 8 cây)",
    short_description: "Set 8 cọ trang điểm mini kèm túi vải, lông cọ mềm mịn.",
    description: "Set 8 cọ trang điểm size mini tiện mang đi, lông cọ tổng hợp mềm mịn, không gây kích ứng da, kèm túi vải đựng gọn.",
    unit: "Set",
    price: 65000,
    compare_at_price: null,
    stock: 55,
    category_slug: "demo-guong-trang-diem",
  },
  {
    slug: "demo-bop-vai-hoa-nho",
    name: "Bóp vải hoa nhỏ đựng tiền lẻ",
    short_description: "Bóp vải hoạ tiết hoa nhỏ, ngăn chia hợp lý, khoá kéo bền.",
    description: "Bóp vải kích thước nhỏ gọn, hoạ tiết hoa dễ thương, có ngăn chia đựng tiền/ thẻ, khoá kéo chắc chắn.",
    unit: "Cái",
    price: 28000,
    compare_at_price: 35000,
    stock: 110,
    category_slug: "demo-tui-vi",
  },
  {
    slug: "demo-tui-deo-cheo-mini",
    name: "Túi đeo chéo mini basic",
    short_description: "Túi đeo chéo dáng basic, chất liệu da PU chống nước nhẹ.",
    description: "Túi đeo chéo mini dáng basic dễ phối đồ, chất liệu da PU chống nước nhẹ, dây đeo điều chỉnh được độ dài.",
    unit: "Cái",
    price: 79000,
    compare_at_price: 99000,
    stock: 48,
    category_slug: "demo-tui-vi",
  },
  {
    slug: "demo-vi-nam-da-that",
    name: "Ví nam da thật dáng ngắn",
    short_description: "Ví nam dáng ngắn, da thật, nhiều ngăn đựng thẻ.",
    description: "Ví nam dáng ngắn làm từ da thật, thiết kế nhiều ngăn đựng thẻ/tiền, form cứng cáp, phù hợp đi làm.",
    unit: "Cái",
    price: 145000,
    compare_at_price: 180000,
    stock: 30,
    category_slug: "demo-tui-vi",
  },
];

function categoryIdFor(slug: string): string {
  return `demo-cat-${slug}`;
}

export function getDemoCategories(): StorefrontCategory[] {
  return DEMO_CATEGORIES.map((c) => ({
    id: categoryIdFor(c.slug),
    name: c.name,
    slug: c.slug,
    image_url: placeholderImage(c.emoji, c.bg),
    product_count: DEMO_PRODUCTS.filter((p) => p.category_slug === c.slug).length,
  }));
}

function toSummary(p: DemoProductDef): StorefrontProductSummary {
  const cat = DEMO_CATEGORIES.find((c) => c.slug === p.category_slug)!;
  return {
    id: `demo-${p.slug}`,
    name: p.name,
    slug: p.slug,
    short_description: p.short_description,
    unit: p.unit,
    price: p.price,
    compare_at_price: p.compare_at_price,
    stock: p.stock,
    category_id: categoryIdFor(cat.slug),
    category_name: cat.name,
    image_url: placeholderImage(cat.emoji, cat.bg),
  };
}

export function getDemoProducts(
  opts: { search?: string; category_slug?: string; category_name?: string } = {}
): StorefrontProductSummary[] {
  let list = DEMO_PRODUCTS;
  // Lọc theo slug demo nội bộ HOẶC theo tên danh mục thật (khi tên danh mục
  // giả trùng tên 1 danh mục thật đã có sản phẩm — xem mergeCategoriesByName
  // trong catalog.ts) — cho phép sản phẩm demo vẫn hiện đúng khi khách bấm
  // vào pill danh mục THẬT trùng tên, không chỉ khi bấm đúng slug demo.
  if (opts.category_slug || opts.category_name) {
    list = list.filter((p) => {
      if (opts.category_slug && p.category_slug === opts.category_slug) return true;
      if (opts.category_name) {
        const cat = DEMO_CATEGORIES.find((c) => c.slug === p.category_slug);
        if (cat && cat.name.trim().toLowerCase() === opts.category_name.trim().toLowerCase()) return true;
      }
      return false;
    });
  }
  const search = (opts.search ?? "").trim().toLowerCase();
  if (search) {
    list = list.filter(
      (p) => p.name.toLowerCase().includes(search) || p.short_description.toLowerCase().includes(search)
    );
  }
  return list.map(toSummary);
}

export function getDemoProductBySlug(slug: string): StorefrontProductDetail | null {
  const p = DEMO_PRODUCTS.find((d) => d.slug === slug);
  if (!p) return null;
  const summary = toSummary(p);
  return {
    ...summary,
    description: p.description,
    images: [{ url: summary.image_url, alt: p.name }],
  };
}
