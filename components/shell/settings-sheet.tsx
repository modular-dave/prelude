"use client";

import { useEffect, useState } from "react";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { ImportOverlay } from "@/components/shell/import-overlay";

export function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) { document.body.style.overflow = "hidden"; } else { document.body.style.overflow = ""; }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.08)" }}
        onClick={onClose}
      />

      <div
        className="relative z-10 w-full sm:w-80 h-full overflow-y-auto font-mono animate-slide-in-right"
        style={{ background: "var(--bg)", borderLeft: "2px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="t-heading" style={{ color: "var(--text)" }}>settings</span>
          <button onClick={onClose} className="text-btn t-body" style={{ color: "var(--text-faint)" }}>
            ×
          </button>
        </div>

        {/* Menu */}
        <div className="p-4">
          <SettingsMenu onItemClick={onClose} />

          <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />

          {/* Import (sheet-only — opens overlay modal) */}
          <button
            onClick={() => setImportOpen(true)}
            className="flex w-full items-center gap-1.5 py-1.5 text-left transition"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="t-body">import chats</span>
          </button>
        </div>
      </div>

      {importOpen && <ImportOverlay onClose={() => setImportOpen(false)} />}
    </div>
  );
}
