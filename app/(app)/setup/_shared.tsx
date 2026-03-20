"use client";

import { useState, useEffect, type ReactNode } from "react";

export function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block h-[5px] w-[5px] rounded-full shrink-0"
      style={{ background: ok ? "var(--success)" : "var(--text-faint)" }}
    />
  );
}

export function Line() {
  return <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />;
}

export function KV({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{label}</span>
      <span className="t-tiny" style={{ color: valueColor || "var(--text)" }}>{value}</span>
    </div>
  );
}

/**
 * Collapsible section that acts as a radio selector.
 * Clicking the header opens it AND calls onSelect (switches the active choice).
 * Sections auto-open when active and auto-close when deactivated.
 */
export function Section({
  label,
  active,
  defaultOpen = false,
  onSelect,
  children,
}: {
  label: string;
  active?: boolean;
  defaultOpen?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || !!active);

  // Auto-open when activated, auto-close when deactivated
  useEffect(() => {
    setOpen(!!active);
  }, [active]);

  const handleClick = () => {
    if (!open) {
      setOpen(true);
      onSelect?.();
    } else {
      setOpen(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-1.5 text-left transition active:scale-[0.99] py-1"
      >
        <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 11, fontWeight: 400 }}>
          {open ? "−" : "+"}
        </span>
        <span className="font-mono" style={{ color: active ? "var(--accent)" : "var(--text-faint)", fontSize: 11, fontWeight: 400 }}>
          {label}
        </span>
      </button>
      {open && (
        <div className="pl-4 pt-1 pb-2 animate-fade-slide-up">
          {children}
        </div>
      )}
    </div>
  );
}
