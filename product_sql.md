-- ============================================================
-- SAPO PRODUCT MANAGEMENT - FULL SCHEMA FOR SUPABASE
-- ============================================================
-- Thứ tự tạo bảng (theo dependency):
-- 1. Bảng lookup / danh mục phụ
-- 2. locations (chi nhánh)
-- 3. products (sản phẩm chính)
-- 4. product_options, product_variants
-- 5. inventory_levels, product_batches
-- 6. product_images
-- 7. product_catalog (bảng khai báo nhập khẩu)
-- ============================================================


-- ------------------------------------------------------------
-- 1. BẢNG DANH MỤC PHỤ
-- ------------------------------------------------------------

-- Danh mục sản phẩm (có thể đa cấp)
create table categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references categories(id) on delete set null,
  name        text not null,
  slug        text unique,
  position    int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Nhãn hiệu / Thương hiệu
create table brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text unique,
  logo_url    text,
  created_at  timestamptz default now()
);

-- Loại sản phẩm
create table product_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz default now()
);


-- ------------------------------------------------------------
-- 2. CHI NHÁNH / VỊ TRÍ KHO
-- ------------------------------------------------------------

create table locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,           -- "Cửa hàng chính", "Kho B"
  address     text,
  phone       text,
  is_active   boolean default true,
  is_default  boolean default false,   -- Chi nhánh mặc định
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);


-- ------------------------------------------------------------
-- 3. SẢN PHẨM CHÍNH
-- ------------------------------------------------------------

create table products (

  -- ĐỊNH DANH
  id                    uuid primary key default gen_random_uuid(),

  -- THÔNG TIN CƠ BẢN
  name                  text not null,
  sku                   text unique,
  barcode               text,
  unit                  text,                        -- Đơn vị tính: Cái, Hộp, Kg...
  description           text,                        -- Mô tả đầy đủ (HTML)
  short_description     text,                        -- Mô tả ngắn

  -- THÔNG TIN GIÁ
  price                 numeric(18,2) not null default 0,   -- Giá bán
  compare_at_price      numeric(18,2),                      -- Giá so sánh
  cost_price            numeric(18,2),                      -- Giá vốn
  taxable               boolean default false,              -- Áp dụng thuế

  -- THÔNG TIN KHO
  track_inventory       boolean default true,        -- Quản lý số lượng tồn kho
  allow_negative_stock  boolean default false,       -- Cho phép bán âm
  manage_expiry         boolean default false,       -- Quản lý theo lô - HSD

  -- VẬN CHUYỂN
  requires_shipping     boolean default true,
  weight                numeric(10,3) default 0,
  weight_unit           text default 'g'
                        check (weight_unit in ('g', 'kg', 'lb', 'oz')),

  -- PHÂN LOẠI
  category_id           uuid references categories(id) on delete set null,
  brand_id              uuid references brands(id) on delete set null,
  product_type_id       uuid references product_types(id) on delete set null,
  tax_group             text,                        -- Nhóm ngành nghề thuế GTGT/TNCN
  tags                  text[] default '{}',

  -- KÊNH BÁN HÀNG & GIAO DIỆN
  sales_channels        text[] default '{}',         -- ["pos","website","facebook"]
  theme_template        text default 'product',      -- Khung giao diện

  -- SEO
  seo_title             text,
  seo_description       text,
  slug                  text unique,

  -- TRẠNG THÁI
  status                text default 'active'
                        check (status in ('active', 'inactive', 'draft')),
  published_at          timestamptz,

  -- AUDIT
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  created_by            uuid references auth.users(id) on delete set null
);

-- Index thường dùng
create index idx_products_sku        on products(sku);
create index idx_products_status     on products(status);
create index idx_products_category   on products(category_id);
create index idx_products_brand      on products(brand_id);
create index idx_products_tags       on products using gin(tags);


-- ------------------------------------------------------------
-- 4. THUỘC TÍNH & PHIÊN BẢN SẢN PHẨM
-- ------------------------------------------------------------

-- Thuộc tính (VD: Màu sắc, Kích thước)
create table product_options (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  name        text not null,       -- "Màu sắc", "Kích thước"
  position    int default 1,
  values      text[] default '{}'  -- ["Đỏ", "Xanh", "Vàng"]
);

create index idx_product_options_product on product_options(product_id);


-- Phiên bản sản phẩm (mỗi tổ hợp thuộc tính = 1 variant)
create table product_variants (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references products(id) on delete cascade,

  title             text,              -- "Đỏ / L"
  sku               text unique,
  barcode           text,

  -- Giá trị thuộc tính (tối đa 3 option)
  option1           text,              -- VD: "Đỏ"
  option2           text,              -- VD: "L"
  option3           text,

  -- Giá (override từ product nếu có)
  price             numeric(18,2),
  compare_at_price  numeric(18,2),
  cost_price        numeric(18,2),

  -- Vận chuyển
  weight            numeric(10,3),
  weight_unit       text default 'g'
                    check (weight_unit in ('g', 'kg', 'lb', 'oz')),

  image_id          uuid,              -- FK tới product_images (thêm sau)
  position          int default 1,

  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index idx_variants_product on product_variants(product_id);
create index idx_variants_sku     on product_variants(sku);


-- ------------------------------------------------------------
-- 5. TỒN KHO
-- ------------------------------------------------------------

-- Tồn kho theo variant + chi nhánh
create table inventory_levels (
  id                uuid primary key default gen_random_uuid(),
  variant_id        uuid not null references product_variants(id) on delete cascade,
  location_id       uuid not null references locations(id) on delete cascade,

  quantity          int default 0,         -- Số lượng tồn thực tế
  quantity_on_hold  int default 0,         -- Đang giữ (đơn chờ xử lý)
  -- Số lượng có thể bán = quantity - quantity_on_hold

  storage_location  text,                  -- Vị trí lưu kho: "Kệ A - Tầng 2"

  updated_at        timestamptz default now(),

  unique(variant_id, location_id)
);

create index idx_inventory_variant  on inventory_levels(variant_id);
create index idx_inventory_location on inventory_levels(location_id);


-- Quản lý lô hàng - Hạn sử dụng (HSD)
create table product_batches (
  id              uuid primary key default gen_random_uuid(),
  variant_id      uuid not null references product_variants(id) on delete cascade,
  location_id     uuid not null references locations(id) on delete cascade,

  batch_number    text,                    -- Số lô
  manufacture_date date,                  -- Ngày sản xuất
  expiry_date     date,                   -- Hạn sử dụng
  quantity        int default 0,          -- Số lượng trong lô này
  cost_price      numeric(18,2),          -- Giá vốn lô này (có thể khác nhau theo lô)
  note            text,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index idx_batches_variant    on product_batches(variant_id);
create index idx_batches_expiry     on product_batches(expiry_date);


-- ------------------------------------------------------------
-- 6. ẢNH SẢN PHẨM
-- ------------------------------------------------------------

create table product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  url         text not null,
  alt         text,
  position    int default 1,
  created_at  timestamptz default now()
);

create index idx_images_product on product_images(product_id);

-- Sau khi tạo xong product_images, gắn FK cho variant.image_id
alter table product_variants
  add constraint fk_variant_image
  foreign key (image_id) references product_images(id) on delete set null;


-- ------------------------------------------------------------
-- 7. BẢNG CATALOG (Khai báo nhập khẩu / hải quan)
-- ------------------------------------------------------------

create table product_catalog (
  id            bigint primary key generated always as identity,
  sku           text unique not null,

  -- 3 tầng tên
  input_name    text not null,   -- Tên khai báo đầy đủ (hải quan)
  invoice_name  text,            -- Tên rút gọn trên hóa đơn
  retail_name   text,            -- Tên hiển thị bán lẻ cho khách

  -- Thông tin sản phẩm
  unit          text,            -- Đơn vị tính
  sale_price    numeric(18,2),   -- Giá bán
  image_url     text,

  -- Liên kết sang bảng products (nếu đã tạo sản phẩm tương ứng)
  product_id    uuid references products(id) on delete set null,

  -- AUDIT
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_catalog_sku        on product_catalog(sku);
create index idx_catalog_product    on product_catalog(product_id);


-- ------------------------------------------------------------
-- 8. AUTO-UPDATE updated_at (trigger dùng chung)
-- ------------------------------------------------------------

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Áp dụng trigger cho từng bảng có updated_at
create trigger trg_products_updated_at
  before update on products
  for each row execute function update_updated_at();

create trigger trg_variants_updated_at
  before update on product_variants
  for each row execute function update_updated_at();

create trigger trg_inventory_updated_at
  before update on inventory_levels
  for each row execute function update_updated_at();

create trigger trg_batches_updated_at
  before update on product_batches
  for each row execute function update_updated_at();

create trigger trg_catalog_updated_at
  before update on product_catalog
  for each row execute function update_updated_at();

create trigger trg_locations_updated_at
  before update on locations
  for each row execute function update_updated_at();

create trigger trg_categories_updated_at
  before update on categories
  for each row execute function update_updated_at();


-- ------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) - bật cho Supabase
-- ------------------------------------------------------------

alter table products          enable row level security;
alter table product_options   enable row level security;
alter table product_variants  enable row level security;
alter table inventory_levels  enable row level security;
alter table product_batches   enable row level security;
alter table product_images    enable row level security;
alter table product_catalog   enable row level security;
alter table categories        enable row level security;
alter table brands            enable row level security;
alter table product_types     enable row level security;
alter table locations         enable row level security;

-- Policy mẫu: cho phép authenticated user đọc tất cả
-- (tuỳ chỉnh theo logic phân quyền thực tế của bạn)
create policy "Allow read for authenticated"
  on products for select
  to authenticated
  using (true);

-- ============================================================
-- SUMMARY - Các bảng đã tạo:
-- ============================================================
-- categories        : Danh mục sản phẩm (đa cấp)
-- brands            : Nhãn hiệu / thương hiệu
-- product_types     : Loại sản phẩm
-- locations         : Chi nhánh / kho
-- products          : Sản phẩm chính
-- product_options   : Thuộc tính (màu, size,...)
-- product_variants  : Phiên bản sản phẩm
-- inventory_levels  : Tồn kho theo variant + chi nhánh
-- product_batches   : Lô hàng - hạn sử dụng
-- product_images    : Ảnh sản phẩm
-- product_catalog   : Danh mục khai báo nhập khẩu
-- ============================================================