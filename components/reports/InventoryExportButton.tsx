"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { ExcelExportDialog, type ExportScope } from "@/components/shared/ExcelExportDialog";
import { getInventoryExportGroups, type InventoryExportGroupBy } from "@/lib/reports/inventory-export-fields";

interface InventoryExportButtonProps {
  groupBy: InventoryExportGroupBy;
  title: string;
  dateFrom?: string;
  dateTo?: string;
}

export function InventoryExportButton({ groupBy, title, dateFrom, dateTo }: InventoryExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (selection: { fields: string[]; scope: ExportScope }) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports/inventory/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_by: groupBy, date_from: dateFrom, date_to: dateTo, fields: selection.fields })
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bao-cao-ton-kho-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Không xuất được file.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-gray-600 hover:text-blue-600 border border-gray-200 rounded px-3 py-1.5 text-sm bg-white"
      >
        <Download className="w-4 h-4" />
        Xuất file
      </button>
      <ExcelExportDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        fieldPickerTitle={`Tùy chọn trường hiển thị — ${title}`}
        groups={getInventoryExportGroups(groupBy)}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </>
  );
}
