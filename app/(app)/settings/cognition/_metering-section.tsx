"use client";

import { useEffect, useState, useCallback } from "react";
import { Section } from "@/components/settings/settings-primitives";

interface MeterEvent {
  operation: string;
  tokens?: number;
  provider?: string;
  model?: string;
  timestamp: string;
}

const fmtTime = (ts: string) => {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
};

export function MeteringSection() {
  const [cortexSummary, setCortexSummary] = useState<string | null>(null);
  const [meterSummary, setMeterSummary] = useState<Record<string, number>>({});
  const [meterLog, setMeterLog] = useState<MeterEvent[]>([]);
  const [veniceStats, setVeniceStats] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [guardrailStats, setGuardrailStats] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const refresh = useCallback(async () => {
    try {
      const [meterRes, guardrailRes, configRes] = await Promise.all([
        fetch("/api/cortex/meter").then((r) => r.json()).catch(() => ({})),
        fetch("/api/cortex/guardrails").then((r) => r.json()).catch(() => ({})),
        fetch("/api/config").then((r) => r.json()).catch(() => ({})),
      ]);
      setMeterSummary(meterRes.meterSummary || {});
      setMeterLog(meterRes.meterLog || []);
      setVeniceStats(meterRes.veniceStats || null);
      setGuardrailStats(guardrailRes);
      const connected = [
        configRes.supabase?.connected && "DB",
        configRes.inference?.connected && "LLM",
      ].filter(Boolean);
      setCortexSummary(connected.length > 0 ? connected.join(" + ") : "Setup needed");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Section title="usage & metering">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="t-small" style={{ color: "var(--text-muted)" }}>Services</span>
          <span className="t-small" style={{ color: cortexSummary ? "var(--success)" : "var(--text-faint)" }}>
            {cortexSummary || "—"}
          </span>
        </div>

        {Object.keys(meterSummary).length > 0 && (
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(meterSummary).map(([op, count]) => (
              <div key={op} className="rounded-[4px] p-1.5" style={{ background: "var(--surface-dimmer)" }}>
                <div className="t-body font-mono" style={{ color: "var(--text)" }}>{count}</div>
                <div className="t-micro truncate" style={{ color: "var(--text-faint)" }}>{op}</div>
              </div>
            ))}
          </div>
        )}

        {veniceStats && (
          <div>
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>Venice Inference</span>
            <div className="flex gap-3 mt-1">
              <span className="t-micro" style={{ color: "var(--text-muted)" }}>Calls: {veniceStats.totalCalls || 0}</span>
              <span className="t-micro" style={{ color: "var(--text-muted)" }}>Tokens: {((veniceStats.totalTokens || 0) / 1000).toFixed(1)}K</span>
            </div>
          </div>
        )}

        {guardrailStats && (
          <div>
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>Guardrails</span>
            <div className="flex gap-3 mt-1">
              <span className="t-micro" style={{ color: "var(--text-muted)" }}>Input blocked: {guardrailStats.inputBlocked || 0}</span>
              <span className="t-micro" style={{ color: "var(--text-muted)" }}>Output filtered: {guardrailStats.outputBlocked || 0}</span>
            </div>
          </div>
        )}

        {meterLog.length > 0 && (
          <div>
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>Recent Events</span>
            <div className="space-y-0.5 mt-1 max-h-40 overflow-y-auto">
              {meterLog.slice(0, 20).map((e, i) => (
                <div key={i} className="flex items-center gap-2 t-micro">
                  <span style={{ color: "var(--text-faint)" }}>{fmtTime(e.timestamp)}</span>
                  <span style={{ color: "var(--text-muted)" }}>{e.operation}</span>
                  {e.tokens != null && <span style={{ color: "var(--text-faint)" }}>{e.tokens}t</span>}
                  {e.provider && <span style={{ color: "var(--text-faint)" }}>{e.provider}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
