"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  HelpCircle,
  Loader2,
  MessageCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Period =
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "custom";

export interface DateRange {
  from: string;
  to: string;
}

export const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 ngày",
  "30d": "30 ngày",
  "90d": "90 ngày",
  this_month: "Tháng này",
  last_month: "Tháng trước",
  this_quarter: "Quý này",
  custom: "Tùy chỉnh"
};

export function getDateRange(period: Period, custom?: DateRange): DateRange {
  if (period === "custom" && custom) return custom;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  switch (period) {
    case "7d": {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    case "30d": {
      const f = new Date(now); f.setDate(f.getDate() - 29);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    case "90d": {
      const f = new Date(now); f.setDate(f.getDate() - 89);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    case "this_month": {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const f = new Date(now.getFullYear(), q * 3, 1);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
    default: {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { from: f.toISOString().slice(0, 10), to: today };
    }
  }
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch { return iso; }
}

export function formatFullDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return iso; }
}

export const fmtMoney = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

// ─── Period Selector ──────────────────────────────────────────────────────────

export function PeriodSelector({
  value,
  onChange
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const periods: Period[] = ["7d", "30d", "90d", "this_month", "last_month", "this_quarter", "custom"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            value === p
              ? "bg-blue-500 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:border-blue-400"
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────────────────

export function DateRangePicker({
  dateFrom,
  dateTo,
  onFromChange,
  onToChange,
  onApply
}: {
  dateFrom: string;
  dateTo: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => onFromChange(e.target.value)}
        className="border border-gray-200 rounded px-2 py-1.5 text-sm"
      />
      <span className="text-gray-400 text-xs">—</span>
      <input
        type="date"
        value={dateTo}
        onChange={(e) => onToChange(e.target.value)}
        className="border border-gray-200 rounded px-2 py-1.5 text-sm"
      />
      <button
        onClick={onApply}
        className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
      >
        Áp dụng
      </button>
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

export function SummaryCard({
  label,
  value,
  sub,
  color = "blue"
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "blue" | "green" | "amber" | "red" | "purple";
}) {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100" },
    green: { bg: "bg-green-50", text: "text-green-600", border: "border-green-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-600", border: "border-amber-100" },
    red: { bg: "bg-red-50", text: "text-red-500", border: "border-red-100" },
    purple: { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-100" }
  };
  const s = styles[color];
  return (
    <div className={`rounded-lg border p-4 bg-white shadow-sm ${s.bg} ${s.border}`}>
      <div className={`text-xs font-medium ${s.text}`}>{label}</div>
      <div className={`text-xl font-bold mt-1 ${s.text}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────

export function SvgBarChart({
  labels,
  datasets,
  height = 200,
  formatValue = (v: number) => fmtMoney.format(v)
}: {
  labels: string[];
  datasets: { label: string; data: number[]; color: string }[];
  height?: number;
  // Formatter dùng cho tooltip <title>. Mặc định giữ hành vi cũ (số thô, dùng
  // cho chart số lượng/tồn kho). Truyền formatCurrencyVND khi chart hiển thị
  // tiền (doanh thu, giá trị nhập/xuất...) để có hậu tố "VND" nhất quán.
  formatValue?: (v: number) => string;
}) {
  if (labels.length === 0) {
    return <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Chưa có dữ liệu</div>;
  }
  const allValues = datasets.flatMap((d) => d.data);
  const maxV = Math.max(...allValues, 1);
  const groupW = Math.max(16, Math.min(60, Math.floor(700 / labels.length)));
  const barW = Math.max(4, Math.floor(groupW / (datasets.length + 1)));
  const totalW = labels.length * groupW + 40;
  const chartH = height;
  const legendH = 28;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${totalW} ${chartH + legendH}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {datasets.map((ds, di) =>
          ds.data.map((v, i) => {
            const x = i * groupW + 20 + di * barW + (groupW - datasets.length * barW) / 2;
            const barH = Math.max(2, (v / maxV) * (chartH - 20));
            return (
              <rect
                key={`${di}-${i}`}
                x={x}
                y={chartH - barH}
                width={barW}
                height={barH}
                fill={ds.color}
                opacity={0.85}
                rx="2"
              >
                <title>{ds.label}: {formatValue(v)}</title>
              </rect>
            );
          })
        )}
        {labels.map((l, i) => (
          <text
            key={i}
            x={i * groupW + 20 + groupW / 2}
            y={chartH + 14}
            textAnchor="middle"
            fontSize="9"
            fill="#9ca3af"
          >
            {l}
          </text>
        ))}
        {/* Legend */}
        {datasets.map((ds, di) => (
          <g key={di} transform={`translate(${di * 90 + 10}, ${chartH + 18})`}>
            <rect width="10" height="6" y="2" fill={ds.color} rx="1" />
            <text x="14" fontSize="9" fill="#6b7280">{ds.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── SVG Line Chart ──────────────────────────────────────────────────────────

export function SvgLineChart({
  labels,
  datasets,
  height = 160
}: {
  labels: string[];
  datasets: { label: string; data: number[]; color: string }[];
  height?: number;
}) {
  if (labels.length === 0) {
    return <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Chưa có dữ liệu</div>;
  }
  const allValues = datasets.flatMap((d) => d.data);
  const maxV = Math.max(...allValues, 1);
  const w = 500;
  const h = height;
  const paddingX = 20;
  const stepX = (w - paddingX * 2) / Math.max(labels.length - 1, 1);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {datasets.map((ds, di) => (
            <linearGradient key={di} id={`lg${di}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ds.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={ds.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {datasets.map((ds, di) => {
          const points = ds.data.map((v, i) => {
            const x = paddingX + i * stepX;
            const y = h - (v / maxV) * (h - 10);
            return { x, y };
          });
          const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
          const fill = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") +
            ` L${points[points.length - 1].x},${h} L${paddingX},${h} Z`;
          return (
            <g key={di}>
              <path d={fill} fill={`url(#lg${di})`} />
              <polyline points={polyline} fill="none" stroke={ds.color} strokeWidth="2" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill={ds.color} />
              ))}
            </g>
          );
        })}
        {/* X labels */}
        {labels.filter((_, i) => i % Math.ceil(labels.length / 8) === 0).map((l, i, arr) => {
          const idx = i * Math.ceil(labels.length / 8);
          return (
            <text
              key={i}
              x={paddingX + idx * stepX}
              y={h + 12}
              textAnchor="middle"
              fontSize="9"
              fill="#9ca3af"
            >
              {l}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

export function DonutChart({
  data, // [{label, value, color}]
  size = 140,
  formatValue = (v: number) => fmtMoney.format(v)
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  // Xem ghi chú formatValue ở SvgBarChart — mặc định giữ số thô, truyền
  // formatCurrencyVND khi data là tiền.
  formatValue?: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <div className="flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu</div>;
  }
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  let current = 0;
  const slices = data.map((d) => {
    const pct = d.value / total;
    const start = current;
    current += pct;
    const startAngle = start * 2 * Math.PI - Math.PI / 2;
    const endAngle = current * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = pct > 0.5 ? 1 : 0;
    return { ...d, pct, x1, y1, x2, y2, large };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path
            key={i}
            d={`M${cx},${cy} L${s.x1},${s.y1} A${r},${r} 0 ${s.large},1 ${s.x2},${s.y2} Z`}
            fill={s.color}
            opacity={0.85}
          />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="14" fontWeight="bold" fill="#1f2937">
          {formatValue(total)}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="#6b7280">
          Tổng
        </text>
      </svg>
      <div className="space-y-2">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-600">{s.label}</span>
            <span className="font-medium text-gray-800">{(s.pct * 100).toFixed(1)}%</span>
            <span className="text-gray-400 tabular-nums">{formatValue(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Generic Table ────────────────────────────────────────────────────────────

export function ReportTable({
  columns, // [{key, label, align?, render?}]
  data,
  empty = "Chưa có dữ liệu"
}: {
  columns: {
    key: string;
    label: string;
    align?: "left" | "center" | "right";
    render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  }[];
  data: any[];
  empty?: string;
}) {
  const alignClass = { left: "text-left", center: "text-center", right: "text-right" };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-3 font-medium ${alignClass[c.align ?? "left"]}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                {empty}
              </td>
            </tr>
          ) : (
            data.map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3 text-gray-700 ${alignClass[c.align ?? "left"]}`}
                  >
                    {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Report Shell ─────────────────────────────────────────────────────────────

interface ReportShellProps {
  title: string;
  description?: string;
  backHref: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
}

export function ReportShell({
  title,
  description,
  backHref,
  children,
  actions,
  loading
}: ReportShellProps) {
  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] -m-4 lg:-m-6">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="text-gray-400 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600 border border-gray-200 rounded px-3 py-1.5 text-sm bg-white">
            <HelpCircle className="w-4 h-4" />
            Trợ giúp
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#f0f1f3]">
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          children
        )}
      </div>

      {/* Footer help */}
      <div className="flex justify-center px-6 py-4 flex-shrink-0">
        <div className="bg-blue-50 border border-blue-100 rounded-full px-6 py-3 flex items-center gap-3">
          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-500 text-xs">
            <HelpCircle className="w-3 h-3" />
          </div>
          <p className="text-sm text-gray-600">
            Bạn có thể xem thêm hướng dẫn{" "}
            <a className="text-blue-500 hover:underline" href="#">tại đây</a>
          </p>
        </div>
      </div>

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-50">
        <button className="bg-blue-500 w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-600 transition-colors">
          <MessageCircle className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
