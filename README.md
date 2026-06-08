# InvoiceFlow Manager

Next.js management app for OCR invoice scanning, invoice document history, editable summary rows, filters, Supabase storage, and Excel export.

Current scope:

- Approved real flow: invoice upload, OCR, review, save, filter, export Excel.
- Demo frame only: products/SKU, inventory, sales, reports, settings.
- Out of scope for this version: CCCD/CMND/KYC scanning.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment

```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash
GEMINI_MAX_RETRIES=2
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_STORAGE_BUCKET=invoiceflow-documents
DATABASE_URL=postgresql://user:password@host:6543/postgres
PORT=3000
```

## Main Modules

- `Dashboard`: clear split between the approved invoice OCR flow and the later operations demo frame.
- `Scan hóa đơn`: upload invoice PDFs/images and scan with Gemini document understanding.
- `Tổng hợp hóa đơn`: persistent invoice rows, editable Excel-like grid, filters by supplier/date/product/SKU, delete mistaken rows, and export Excel.
- `Tài liệu hóa đơn`: invoice document history, OCR status, warnings, and delete document with cascading row delete.
- `Sản phẩm / SKU`, `Tồn kho`, `Lên đơn hàng`, `Báo cáo`, `Cài đặt`: management frame for the next sales/inventory demo phase.
- `Mẫu thiết kế`: UI blueprint for design handoff.

## Supabase Storage

- Structured data is stored in Supabase Postgres when `DATABASE_URL` is configured.
- Tables are created automatically on first API call: invoice documents, invoice rows, quick options, catalog products, and activity logs.
- Original uploaded files are saved to Supabase Storage bucket `SUPABASE_STORAGE_BUCKET` when service-role access is available; otherwise the app falls back to local `data/uploads/`.
- Quick options are collected from saved invoice data so users can quickly pick suppliers, SKU, adjusted names, retail names, units, and VAT rates.

## Business Rules

- Existing invoice documents are detected by SHA-256 hash, so uploaded files do not need to be scanned again.
- Internal invoice fields stay blank by default and are highlighted light yellow.
- If an invoice has no VAT, `THÀNH TIỀN SAU THUẾ` equals `THÀNH TIỀN TRƯỚC THUẾ`, and `ĐƠN GIÁ SAU THUẾ` equals `ĐƠN GIÁ`.
- Export Excel is placed in the summary/list tabs because the web app is the main working system; Excel is for periodic storage.
- Deleting an invoice document removes all rows created from that document.

## Storage

For the demo/production MVP, persistent data is stored in Supabase. Local files are only used as fallback or temporary Gemini upload files.
