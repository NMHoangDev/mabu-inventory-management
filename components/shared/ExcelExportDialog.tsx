"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

export interface ExportFieldOption {
  key: string;
  label: string;
  default?: boolean;
}

export interface ExportFieldGroup {
  key: string;
  label: string;
  fields: ExportFieldOption[];
  /** undefined = luôn hiện, không phụ thuộc exportType */
  visibleForExportType?: string[];
}

export type ExportScope = "all" | "current_page";

export interface ExcelExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fieldPickerTitle: string;
  groups: ExportFieldGroup[];
  /** omit để ẩn hẳn radio phạm vi */
  scope?: {
    value: ExportScope;
    onChange: (s: ExportScope) => void;
    currentPageCount: number;
    totalCount: number;
  };
  /** omit để ẩn hẳn radio loại file */
  exportType?: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  };
  onSubmit: (selection: { fields: string[]; scope: ExportScope; exportType?: string }) => Promise<void>;
  submitting?: boolean;
}

function initialSelection(groups: ExportFieldGroup[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const group of groups) {
    for (const field of group.fields) {
      if (!(field.key in map)) map[field.key] = field.default ?? true;
    }
  }
  return map;
}

export function ExcelExportDialog({
  open,
  onOpenChange,
  title,
  fieldPickerTitle,
  groups,
  scope,
  exportType,
  onSubmit,
  submitting
}: ExcelExportDialogProps) {
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => initialSelection(groups));

  const visibleGroups = useMemo(
    () =>
      groups.filter(
        (g) => !g.visibleForExportType || (exportType && g.visibleForExportType.includes(exportType.value))
      ),
    [groups, exportType?.value]
  );

  if (!open) return null;

  const toggleField = (key: string) => setSelected((prev) => ({ ...prev, [key]: !prev[key] }));

  const setGroupAll = (group: ExportFieldGroup, value: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const f of group.fields) next[f.key] = value;
      return next;
    });
  };

  const groupState = (group: ExportFieldGroup): "all" | "none" | "partial" => {
    const values = group.fields.map((f) => !!selected[f.key]);
    if (values.every(Boolean)) return "all";
    if (values.every((v) => !v)) return "none";
    return "partial";
  };

  const handleClose = () => {
    setShowFieldPicker(false);
    onOpenChange(false);
  };

  const handleExport = async () => {
    const fields = visibleGroups.flatMap((g) => g.fields.filter((f) => selected[f.key]).map((f) => f.key));
    await onSubmit({ fields, scope: scope?.value ?? "all", exportType: exportType?.value });
  };

  if (showFieldPicker) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowFieldPicker(false)} />
        <div className="relative bg-white rounded shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
          <div className="p-4 border-b border-gray-200 flex items-center gap-2">
            <button
              type="button"
              className="text-gray-500 hover:text-gray-700 text-sm"
              onClick={() => setShowFieldPicker(false)}
            >
              &lt;
            </button>
            <h3 className="font-semibold text-gray-800">{fieldPickerTitle}</h3>
          </div>
          <div className="p-4 space-y-5">
            {visibleGroups.map((group) => {
              const state = groupState(group);
              return (
                <div key={group.key} className="border border-gray-200 rounded">
                  <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 font-medium text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state === "all"}
                      ref={(el) => {
                        if (el) el.indeterminate = state === "partial";
                      }}
                      onChange={(e) => setGroupAll(group, e.target.checked)}
                    />
                    {group.label}
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 p-3">
                    {group.fields.map((field) => (
                      <label key={field.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selected[field.key]}
                          onChange={() => toggleField(field.key)}
                        />
                        {field.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              onClick={handleClose}
            >
              Thoát
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => setShowFieldPicker(false)}
            >
              Xuất file
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
        <div className="p-4 space-y-5 text-sm">
          {scope && (
            <div>
              <div className="font-medium text-gray-700 mb-2">Giới hạn kết quả xuất</div>
              <label className="flex items-center gap-2 mb-1 cursor-pointer">
                <input
                  type="radio"
                  checked={scope.value === "all"}
                  onChange={() => scope.onChange("all")}
                />
                Tất cả ({scope.totalCount})
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={scope.value === "current_page"}
                  onChange={() => scope.onChange("current_page")}
                />
                Dữ liệu trên trang này ({scope.currentPageCount})
              </label>
            </div>
          )}
          {exportType && (
            <div>
              <div className="font-medium text-gray-700 mb-2">Loại xuất file</div>
              {exportType.options.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 mb-1 cursor-pointer">
                  <input
                    type="radio"
                    checked={exportType.value === opt.value}
                    onChange={() => exportType.onChange(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            className="text-blue-600 hover:underline text-sm"
            onClick={() => setShowFieldPicker(true)}
          >
            Tùy chọn trường hiển thị
          </button>
        </div>
        <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={handleClose}
            disabled={submitting}
          >
            Thoát
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
            onClick={handleExport}
            disabled={submitting}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Xuất file
          </button>
        </div>
      </div>
    </div>
  );
}
