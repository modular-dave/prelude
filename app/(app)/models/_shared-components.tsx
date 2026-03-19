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
      className="absolute z-50 p-2 animate-fade-slide-up"
      style={{
        background: "var(--bg)",
        borderLeft: "2px solid var(--border)",
        minWidth: 140,
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: 4,
      }}
    >
      <p className="font-mono px-2 py-1" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
        use for:
      </p>
      {EMB_TYPES.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className="flex w-full items-center gap-2 px-2 py-1 transition hover:opacity-80"
        >
          <span className="h-[5px] w-[5px] rounded-full shrink-0" style={{ background: color }} />
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
      className="absolute z-50 p-2 animate-fade-slide-up"
      style={{
        background: "var(--bg)",
        borderLeft: "2px solid var(--border)",
        minWidth: 160,
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: 4,
      }}
    >
      <p className="font-mono px-2 py-1 truncate" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
        use for:
      </p>
      {COG_FUNCS.map(({ key, label, color }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className="flex w-full items-center gap-2 px-2 py-1 transition hover:opacity-80"
        >
          <span className="h-[5px] w-[5px] rounded-full shrink-0" style={{ background: color }} />
          <span className="font-mono" style={{ color: "var(--text)", fontSize: 11, fontWeight: 400 }}>{label}</span>
        </button>
      ))}
      <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
      <button
        onClick={() => onSelect("all")}
        className="flex w-full items-center gap-2 px-2 py-1 transition hover:opacity-80"
      >
        <span className="h-[5px] w-[5px] rounded-full shrink-0" style={{ background: "var(--success)" }} />
        <span className="font-mono" style={{ color: "var(--text)", fontSize: 11, fontWeight: 400 }}>all functions</span>
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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
          {connected ? "saved" : "credentials"}
        </span>
        <a
          href={prov.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-btn font-mono"
          style={{ color: "var(--accent)", fontSize: 9, fontWeight: 400 }}
        >
          get api key →
        </a>
      </div>

      {/* Credential inputs — underline style */}
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
              className="w-full font-mono bg-transparent px-0 py-1 outline-none transition"
              style={{
                borderBottom: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 9,
                fontWeight: 400,
              }}
              onFocus={(e) => { e.target.style.borderBottomColor = "var(--accent)"; }}
              onBlur={(e) => { e.target.style.borderBottomColor = "var(--border)"; }}
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
        className="text-btn font-mono transition active:scale-95"
        style={{
          color: connected ? "var(--success)" : "var(--accent)",
          opacity: !hasRequired || submitting ? 0.4 : 1,
          fontSize: 11,
          fontWeight: 400,
        }}
      >
        {submitting ? (
          <><Loader2 className="h-3 w-3 inline-block animate-spin mr-1" /> saving...</>
        ) : connected ? "update" : "save"}
      </button>
    </div>
  );
}
