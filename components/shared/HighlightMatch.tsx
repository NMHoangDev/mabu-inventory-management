export function removeAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Highlight phần text khớp với query (hỗ trợ không dấu) — không làm hỏng dấu gốc.
export function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const qAcc = removeAccents(q);
  const lower = text.toLowerCase();
  const lowerAcc = removeAccents(text);
  // Tìm vị trí match trên chuỗi không dấu, map lại index trên chuỗi gốc.
  const idx = lowerAcc.indexOf(qAcc);
  if (idx < 0) return <>{text}</>;
  // Dùng index của lowerAcc (chuỗi không dấu) để slice trên text gốc
  // cũng OK vì pre-composed char và decomposed char cùng độ dài trong trường hợp
  // không chứa dấu. Với text có dấu thì lowerAcc dài hơn → cần map index.
  // Đơn giản hoá: tìm lại trên lower (giữ dấu) để highlight chính xác phần đầu.
  const startInOriginal = lower.indexOf(text.substring(idx, idx + q.length).toLowerCase());
  if (startInOriginal < 0) return <>{text}</>;
  const end = startInOriginal + q.length;
  return (
    <>
      {text.substring(0, startInOriginal)}
      <mark className="bg-yellow-200 text-[#0d1d29] rounded px-0.5">
        {text.substring(startInOriginal, end)}
      </mark>
      {text.substring(end)}
    </>
  );
}
