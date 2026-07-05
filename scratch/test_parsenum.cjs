function parseNumeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/,/g, "")
    .replace(/(?<=\d)\.(?=\d{3}(\D|$))/g, "")
    .replace(/%$/, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : undefined;
}

console.log('parseNumeric tests:');
[
  ["35163.72", 35163.72],          // decimal (US)
  ["35,163.72", 35163.72],         // US with thousands
  ["35.163,72", 35163.72],         // VN (but parseNumeric doesn't handle this)
  ["35163,72", 35163.72],          // EU
  ["3516372", 3516372],            // integer
  ["3,516,372", 3516372],          // US thousands
  ["1000000", 1000000],
  ["1000000.50", 1000000.5],
  ["1.234.567", 1234567],          // VN thousands (gets handled as decimal? no—strip dots → 1234567)
  ["", undefined],
  [null, undefined],
  [undefined, undefined],
  [0, 0],
  [12345.67, 12345.67],            // already number
  ["abc", undefined],              // invalid
].forEach(([input, expected]) => {
  const result = parseNumeric(input);
  const match = result === expected ? "✓" : "✗";
  console.log(`  ${match} ${JSON.stringify(input).padEnd(15)} → ${JSON.stringify(result)} (expected ${JSON.stringify(expected)})`);
});