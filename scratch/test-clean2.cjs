function cleanInvoiceProductName(value) {
  if (!value) return value;
  return value
    .replace(/\s*MH\s*:\s*[^\n]+$/i, "")
    .replace(/\s*KT\s*:\s*[^\n]+$/i, "")
    .replace(/\s*NSX\s*:\s*[^\n]+$/i, "")
    .replace(/\s*Model\s*:\s*[^\n]+$/i, "")
    .replace(/\s+(?:MH|KT|NSX)\s+\S+(?:\s+(?:MH|KT|NSX)\s+\S+)*\s*$/i, "")
    .replace(/\s*Mới\s*100%\s*$/g, "")
    .replace(/\s*Mới100%\s*$/g, "")
    .replace(/\s*Không\s*hiệu\.?\s*$/g, "")
    .replace(/\s*,\s*$/g, "")
    .replace(/\s+\.\s*$/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const cases = [
  ["Dưa chuột baby 250g (túi 250g) MH 25266/24 KT 6.5x11.5 NSX 03/07/2025", "Dưa chuột baby 250g (túi 250g)"],
  ["Kem trứng MH: ABC123 KT: 5x5 NSX: 01/01/2024 Mới 100%", "Kem trứng"],
  ["Sữa tươi Model: XYZ MH 999 KT 10 NSX 12/12/2023", "Sữa tươi"],
  ["Ví cầm tay cho nữ, mã Meow, dạng gấp, có cúc bấm và dây cầm, lót trong bằng vải dệt, giả da PU, KT:12*3*9.5cm, NSX:Baisier Leather Co.,Ltd. Mới 100%", "Ví cầm tay cho nữ, mã Meow, dạng gấp, có cúc bấm và dây cầm, lót trong bằng vải dệt, giả da PU"],
  ["Gạo ST25 5kg MH 100 KT 1 NSX 01/06/2025", "Gạo ST25 5kg"],
  ["Bánh quy", "Bánh quy"],
  ["", ""],
  ["Trứng gà MH : 555  KT : 30  NSX : 01/07", "Trứng gà"],
  ["Bánh MH 100", "Bánh"],
  ["Bánh KT 5x5 NSX 01/01/2025", "Bánh"],
  ["Sản phẩm MH đặc biệt cho bé", "Sản phẩm MH đặc biệt cho bé"],
];

let pass = 0, fail = 0;
for (const [input, expected] of cases) {
  const got = cleanInvoiceProductName(input);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} | INPUT: ${JSON.stringify(input)}`);
  console.log(`     | GOT   : ${JSON.stringify(got)}`);
  if (!ok) console.log(`     | EXPECT: ${JSON.stringify(expected)}`);
}
console.log(`\n${pass} pass, ${fail} fail`);