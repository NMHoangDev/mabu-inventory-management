"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PERMISSION_CATALOG } from "@/lib/permissions/catalog";

interface RolePermissionEditorProps {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function RolePermissionEditor({ value, onChange }: RolePermissionEditorProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggleModule(moduleKey: string) {
    setCollapsed((prev) => ({ ...prev, [moduleKey]: !prev[moduleKey] }));
  }

  function setActionChecked(fullKey: string, checked: boolean) {
    const next = new Set(value);
    if (checked) next.add(fullKey);
    else next.delete(fullKey);
    onChange(next);
  }

  function setModuleChecked(moduleKey: string, actionKeys: string[], checked: boolean) {
    const next = new Set(value);
    for (const key of actionKeys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  }

  return (
    <div className="divide-y">
      {PERMISSION_CATALOG.map((mod) => {
        const fullKeys = mod.actions.map((a) => `${mod.key}.${a.key}`);
        const checkedCount = fullKeys.filter((k) => value.has(k)).length;
        const allChecked = checkedCount === fullKeys.length;
        const someChecked = checkedCount > 0 && !allChecked;
        const isCollapsed = collapsed[mod.key];

        return (
          <div key={mod.key} className="py-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={(e) => setModuleChecked(mod.key, fullKeys, e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <button
                type="button"
                onClick={() => toggleModule(mod.key)}
                className="flex items-center gap-1 text-sm font-semibold hover:text-primary"
              >
                {mod.label}
                {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>

            {!isCollapsed ? (
              <div className="mt-2 grid grid-cols-1 gap-2 pl-6 sm:grid-cols-3">
                {mod.actions.map((action) => {
                  const fullKey = `${mod.key}.${action.key}`;
                  return (
                    <label key={fullKey} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={value.has(fullKey)}
                        onChange={(e) => setActionChecked(fullKey, e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      {action.label}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
