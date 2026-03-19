"use client";

import { useEffect, useState, useRef } from "react";
import { Loader2, Check, ExternalLink } from "lucide-react";
import type { CogFunc } from "@/lib/active-model-store";
import { EMB_TYPES, COG_FUNCS } from "./_types";
import type { EmbType, ProviderDef } from "./_types";

// ── Embedding Type Picker Popup ──────────────────────────────

export function EmbTypePicker({
  onSelect,
  onClose,
}: {
  onSelect: (t: EmbType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 rounded-[8px] p-2 shadow-lg animate-fade-slide-up"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        minWidth: 160,
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: 4,
      }}
    >
      <p className="font-mono px-2 py-1" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
        Use for:
      </p>
      {EMB_TYPES.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className="flex w-full items-center gap-2 px-2 py-1.5 rounded-[4px] transition hover:opacity-80"
          style={{ background: "transparent" }}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-mono" style={{ color: "var(--text)", fontSize: 11, fontWeight: 400 }}>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Function Picker Popup ─────────────────────────────────────

export function FunctionPicker({
  modelName,
  onSelect,
  onClose,
}: {
  modelName: string;
  onSelect: (fn: CogFunc | "all") => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-50 rounded-[8px] p-2 shadow-lg animate-fade-slide-up"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        minWidth: 200,
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: 4,
      }}
    >
      <p className="font-mono px-2 py-1 truncate" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
        Use for:
      </p>
      {COG_FUNCS.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className="flex w-full items-center gap-2 px-2 py-1.5 rounded-[4px] transition hover:opacity-80"
          style={{ background: "transparent" }}
        >
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="font-mono" style={{ color: "var(--text)", fontSize: 11, fontWeight: 400 }}>{label}</span>
        </button>
      ))}
      <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
      <button
        onClick={() => onSelect("all")}
        className="flex w-full items-center gap-2 px-2 py-1.5 rounded-[4px] transition hover:opacity-80"
        style={{ background: "transparent" }}
      >
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: "var(--success)" }} />
        <span className="font-mono" style={{ color: "var(--text)", fontSize: 11, fontWeight: 400 }}>All functions</span>
      </button>
    </div>
  );
}

// ── Hosted Config Form ──────────────────────────────────────────

export function HostedConfigForm({
  provider: prov,
  connected,
  onConnect,
}: {
  provider: ProviderDef;
  connected: boolean;
  onConnect?: (config: Record<string, string>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  // Only credential env vars (exclude model — that's handled per-function below)
  const credentialVars = prov.envVars.filter((e) => !e.key.includes("MODEL"));

  const handleSubmit = async () => {
    if (!onConnect) return;
    setSubmitting(true);
    setWarning(null);
    try {
      await onConnect(values);
    } catch {
      setWarning("Failed to connect");
    } finally {
      setSubmitting(false);
    }
  };

  const hasRequired = credentialVars
    .filter((e) => e.required)
    .every((e) => (values[e.key] || "").trim().length > 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h4 className="font-mono" style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-faint)" }}>
          {connected ? "Saved" : "Credentials"}
        </h4>
        <a
          href={prov.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono inline-flex items-center gap-1 transition"
          style={{ color: "var(--accent)", fontSize: 9, fontWeight: 400 }}
        >
          Get API key <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>

      {/* Credential inputs (API key, base URL) */}
      <div className="space-y-1.5">
        {credentialVars.map((env) => (
          <div key={env.key}>
            <span className="block font-mono mb-0.5" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
              {env.label}
              {env.required && <span style={{ color: "var(--warning)" }}> *</span>}
            </span>
            <input
              type={env.key.includes("KEY") || env.key.includes("SECRET") ? "password" : "text"}
              placeholder={env.placeholder}
              value={values[env.key] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [env.key]: e.target.value }))}
              className="w-full font-mono rounded-[6px] px-3 py-1.5 outline-none transition"
              style={{
                background: "var(--surface-dimmer, var(--surface))",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 9,
                fontWeight: 400,
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
            />
          </div>
        ))}
      </div>

      {warning && (
        <p className="font-mono" style={{ color: "var(--warning)", fontSize: 9, fontWeight: 400 }}>{warning}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={!hasRequired || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-[6px] px-3 py-2 transition cursor-pointer font-mono"
        style={{
          background: connected ? "color-mix(in srgb, var(--success) 8%, transparent)" : "color-mix(in srgb, var(--accent) 8%, transparent)",
          border: `1px solid ${connected ? "color-mix(in srgb, var(--success) 20%, transparent)" : "color-mix(in srgb, var(--accent) 20%, transparent)"}`,
          color: connected ? "var(--success)" : "var(--accent)",
          opacity: !hasRequired || submitting ? 0.5 : 1,
          fontSize: 11,
          fontWeight: 400,
        }}
      >
        {submitting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : connected ? (
          <Check className="h-3 w-3" />
        ) : null}
        {submitting ? "Saving\u2026" : connected ? "Update" : "Save"}
      </button>
    </div>
  );
}
