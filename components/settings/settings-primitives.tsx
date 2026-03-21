"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

// ── Slider ──

export function Slider({
  label,
  value,
  min,
  max,
  step,
  color,
  onChange,
  suffix,
  displayValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  color?: string;
  onChange: (v: number) => void;
  suffix?: string;
  displayValue?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 t-small" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 appearance-none rounded-full cursor-pointer"
        style={{ accentColor: color || "var(--accent)", background: "var(--bar-track)" }}
      />
      <span className="w-14 text-right font-mono t-small" style={{ color: color || "var(--text)" }}>
        {displayValue || value.toFixed(step && step >= 1 ? 0 : 2)}{suffix || ""}
      </span>
    </div>
  );
}

// ── Section header with reset ──

export function SectionHeader({ title, onReset }: { title: string; onReset?: () => void }) {
  return (
    <div className="flex items-center justify-between pt-2 pb-1">
      <span className="t-label" style={{ color: "var(--text-faint)" }}>{title}</span>
      {onReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-1 t-micro transition active:scale-95"
          style={{ color: "var(--text-faint)" }}
          title="Reset to SDK defaults"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          reset
        </button>
      )}
    </div>
  );
}

// ── Collapsible section ──

export function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-1.5 text-left transition active:scale-[0.99]"
      >
        <span className="t-body" style={{ color: "var(--text-faint)" }}>
          {open ? "−" : "+"} {title}
        </span>
      </button>
      {open && (
        <div className="pl-4 space-y-2 pb-2 animate-fade-slide-up">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Divider ──

export function Divider() {
  return <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />;
}
