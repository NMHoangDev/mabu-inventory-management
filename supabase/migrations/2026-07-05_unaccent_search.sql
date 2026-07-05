-- Migration: Bỏ dấu tiếng Việt cho search customers + products
-- Chạy trong Supabase SQL Editor.
--
-- Vấn đề: tìm "nguyen van" không ra "Nguyễn Văn A" vì ILIKE so sánh byte.
-- Fix: enable extension `unaccent` + thêm cột `search_text` lưu dạng không dấu
-- + index GIN/trigram để search nhanh.
--
-- Chiến lược an toàn:
--   1. extension unaccent (built-in, không cần superuser)
--   2. thêm cột unaccented_name/unaccented_sku/unaccented_phone (nullable) cho products + customers
--   3. trigger tự động fill các cột này khi INSERT/UPDATE
--   4. index GIN trigram (pg_trgm) để search nhanh với ILIKE %x% không dấu
--   5. API search sẽ dùng `unaccent(name) ILIKE unaccent('%q%')` thay vì name ILIKE.

-- ============================================================================
-- 1. Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 2. Customers: cột search không dấu
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customers' AND column_name='search_text'
  ) THEN
    ALTER TABLE public.customers
      ADD COLUMN search_text TEXT;
  END IF;
END $$;

-- Trigger tự fill search_text khi insert/update.
-- search_text = unaccent của name + ' ' + phone + ' ' + code + ' ' + email
-- để search theo bất kỳ trường nào cũng ra.
CREATE OR REPLACE FUNCTION public.customers_fill_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text := lower(unaccent(
    coalesce(NEW.name,'') || ' ' ||
    coalesce(NEW.phone,'') || ' ' ||
    coalesce(NEW.code,'') || ' ' ||
    coalesce(NEW.email,'')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_customers_fill_search_text ON public.customers;
CREATE TRIGGER trg_customers_fill_search_text
  BEFORE INSERT OR UPDATE OF name, phone, code, email ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_fill_search_text();

-- Backfill cho rows hiện có.
UPDATE public.customers
SET search_text = lower(unaccent(
  coalesce(name,'') || ' ' ||
  coalesce(phone,'') || ' ' ||
  coalesce(code,'') || ' ' ||
  coalesce(email,'')
))
WHERE search_text IS NULL OR search_text = '';

-- Index GIN trigram cho search không dấu — ILIKE %x% dùng index nếu có trgm.
CREATE INDEX IF NOT EXISTS idx_customers_search_text_trgm
  ON public.customers USING gin (search_text gin_trgm_ops);

-- ============================================================================
-- 3. Products: cột search không dấu
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='products' AND column_name='search_text'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN search_text TEXT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.products_fill_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text := lower(unaccent(
    coalesce(NEW.name,'') || ' ' ||
    coalesce(NEW.sku,'') || ' ' ||
    coalesce(NEW.barcode,'')
  ));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_fill_search_text ON public.products;
CREATE TRIGGER trg_products_fill_search_text
  BEFORE INSERT OR UPDATE OF name, sku, barcode ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_fill_search_text();

-- Backfill
UPDATE public.products
SET search_text = lower(unaccent(
  coalesce(name,'') || ' ' ||
  coalesce(sku,'') || ' ' ||
  coalesce(barcode,'')
))
WHERE search_text IS NULL OR search_text = '';

CREATE INDEX IF NOT EXISTS idx_products_search_text_trgm
  ON public.products USING gin (search_text gin_trgm_ops);