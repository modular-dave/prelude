"use client";

import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = "Delete", onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
        onClick={onCancel}
      />
      <div className="relative z-10 mx-4 w-full max-w-xs rounded-[10px] p-5 animate-fade-slide-up glass-panel">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="t-heading" style={{ color: "var(--text)" }}>
              {title}
            </p>
            <p className="mt-1.5 t-small leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {message}
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-[6px] px-3 py-1.5 t-btn transition active:scale-95"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-[6px] px-3 py-1.5 t-btn text-white transition active:scale-95"
            style={{ background: "var(--error)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
