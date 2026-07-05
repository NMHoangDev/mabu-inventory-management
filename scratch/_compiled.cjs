export function cleanInvoiceProductName(value) {
  if (!value) return value;
  // Strip trailing metadata tokens MH/KT/NSX/Model + value đi kèm.
  // Hóa đơn Việt Nam hay ghi cuối dòng: "...MH 25266/24 KT 6.5x11.5 NSX 03/07/2025"
  // hoặc "...MH: ABC KT: 5x5 NSX: 01/01/2024". Cả 2 dạng đều strip hết.
  //
  // Lưu ý: chỉ strip ở CUỐI string. MH/KT/NSX xuất hiện giữa câu (không phải
  // metadata, vd "Sản phẩm MH đặc biệt") → giữ nguyên để không làm hỏng tên.
  //
  // Chiến lược 2-pass:
  //   1) Strip quality descriptors "Mới 100%" / "không hiệu" (trailing) trước
  //   2) Iteratively strip cụm MH/KT/NSX/Model + value (colon hoặc non-colon).
  //
  // Lý do cần 2 pass: nếu cụm "MH 25266, NSX: Yiyi, Mới 100%" thì phải strip
  // "Mới 100%" trước (để NSX: Yiyi trở thành cuối string), rồi NSX: Yiyi,
  // rồi mới đến MH 25266.
  let result = String(value ?? "");

  // Pass 1: strip trailing quality descriptors (có thể đứng một mình hoặc theo sau text)
  for (let i = 0; i < 5; i++) {
    const before = result;
    result = result
      .replace(/,?\s+Mới\s*100\s*%\s*$/gi, "")
      .replace(/,?\s+Mới\s*100%\s*$/gi, "")
      .replace(/,?\s+Mới100\s*%\s*$/gi, "")
      .replace(/,?\s+Mới100%\s*$/gi, "")
      .replace(/^Mới\s*100\s*%\s*$/gi, "")
      .replace(/^Mới\s*100%\s*$/gi, "")
      .replace(/,?\s+không\s*hiệu\.?\s*$/gi, "")
      .replace(/^không\s*hiệu\.?\s*$/gi, "")
      .replace(/\s*,\s*$/g, "")
      .replace(/\s+\.\s*$/, ".")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (result === before) break;
  }

  // Pass 2: iteratively strip MH/KT/NSX/Model metadata tokens ở cuối string.
  //
  // Chỉ match khi value "looks like metadata": chứa digits, /, -, *, x, . —
  // i.e., look like code/number/dimension identifier, KHÔNG phải tên sản phẩm
  // tiếng Việt thông thường. Đây là cách giảm over-strip trên các tên chứa
  // "MH" trong câu (vd "Sản phẩm MH đặc biệt" → giữ nguyên).
  const trailingTokenPatterns = [
    // Dạng có dấu :
    /[\s,\.]+(?:MH|KT|NSX|Model)\s*:\s*[^,\n]+$/i,
    // Dạng không dấu : — value bắt đầu bằng digit (code/number/dimension)
    /[\s,\.]+(?:MH|KT|NSX|Model)\s+[0-9][^,\n]*$/i,
    /[\s,\.]+(?:MH|KT|NSX|Model)[0-9][^,\n]*$/i,
  ];

  const endsWithMetadataToken = (s) => {
    const trimmed = String(s).trim();
    return trailingTokenPatterns.some((p) => p.test(trimmed));
  };

  for (let i = 0; i < 10; i++) {
    const before = result;
    const trimmed = result.trim();
    if (!trimmed) break;
    if (!endsWithMetadataToken(trimmed)) break;

    // Tìm vị trí bắt đầu của cụm token metadata cuối cùng (đã match ở
    // `endsWithMetadataToken`). Cắt từ đó trở về trước + cleanup.
    let cut = trimmed.length;
    for (const p of trailingTokenPatterns) {
      const m = trimmed.match(p);
      if (m) {
        cut = trimmed.indexOf(m[0]);
        break;
      }
    }
    if (cut >= trimmed.length) break;
    // Trim leading whitespace/comma/dot từ vị trí cắt
    while (cut > 0 && /[\s,\.]/.test(trimmed[cut - 1])) cut--;
    result = trimmed.slice(0, cut);
    result = result
      .replace(/\s*,\s*$/g, "")
      .replace(/\s+\.\s*$/, ".")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (result === before) break;
  }

  return result;
}

export function fixMojibakeText(value) {
  if (!/[ÃÄÂ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from([...value].map((char) => char.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return repaired.includes("\uFFFD") ? value : repaired;
module.exports = { cleanInvoiceProductName };
