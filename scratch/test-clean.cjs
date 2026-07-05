// Test cleanInvoiceProductName logic mới
function cleanInvoiceProductName(value) {
  if (!value) return value;
  return value
    .replace(/\s*MH\s*:\s*[^\n]+$/i, "")
    .replace(/\s*KT\s*:\s*[^\n]+$/i, "")
    .replace(/\s*NSX\s*:\s*[^\n]+$/i, "")
    .replace(/\s*Model\s*:\s*[^\n]+$/i, "")
    .replace(/\s+MH\s+\d+\S*/gi, "")
    .replace(/\s+KT\s+\d[\dxX.,\s]+\b/gi, "")
    .replace(/\s+NSX\s+\d[\d/\-.]+\b/gi, "")
    .replace(/\s*Mới\s*100%\s*$/g, "")
    .replace(/\s*Mới100%\s*$/g, "")
    .replace(/\s*Không\s*hiệu\.?\s*$/g, "")
    .replace(/\s*,\s*$/g, "")
    .replace(/\s+\.\s*$/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const cases = [
  "Dưa chuột baby 250g (túi 250g) MH 25266/24 KT 6.5x11.5 NSX 03/07/2025",
  "Kem trứng MH: ABC123 KT: 5x5 NSX: 01/01/2024 Mới 100%",
  "Sữa tươi Model: XYZ MH 999 KT 10 NSX 12/12/2023",
  "Ví cầm tay cho nữ, mã Meow, dạng gấp, có cúc bấm và dây cầm, lót trong bằng vải dệt, giả da PU, KT:12*3*9.5cm, NSX:Baisier Leather Co.,Ltd. Mới 100%",
  "Gạo ST25 5kg MH 100 KT 1 NSX 01/06/2025",
  "Bánh quy",
  "",
  "Trứng gà MH : 555  KT : 30  NSX : 01/07"
];

for (const c of cases) {
  console.log(`INPUT : ${JSON.stringify(c)}`);
  console.log(`OUTPUT: ${JSON.stringify(cleanInvoiceProductName(c))}`);
  console.log('---');
}