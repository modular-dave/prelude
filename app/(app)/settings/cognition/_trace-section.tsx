"use client";

import { useState } from "react";
import { Section } from "@/components/settings/settings-primitives";

function renderTrace(node: any, depth = 0): React.ReactNode {
  if (!node) return null;
  const items = Array.isArray(node) ? node : node.children || node.links || [node];
  return (
    <div style={{ paddingLeft: depth * 12 }}>
      {items.map((n: any, i: number) => (
        <div key={i} className="t-micro" style={{ color: depth === 0 ? "var(--text)" : "var(--text-muted)" }}>
          <span style={{ color: "var(--text-faint)" }}>{n.memoryId || n.id || "?"}</span>{" "}
          {n.summary || n.content?.slice(0, 80) || "—"}
          {(n.children || n.links) && renderTrace(n, depth + 1)}
        </div>
      ))}
    </div>
  );
}

export function TraceSection() {
  const [traceId, setTraceId] = useState("");
  const [tracing, setTracing] = useState(false);
  const [traceResult, setTraceResult] = useState<any>(null);
  const [traceError, setTraceError] = useState<string | null>(null);

  const [explainId, setExplainId] = useState("");
  const [explainQ, setExplainQ] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [explainResult, setExplainResult] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  const runTrace = async () => {
    const id = parseInt(traceId, 10);
    if (!id || id < 1) return;
    setTracing(true);
    setTraceResult(null);
    setTraceError(null);
    try {
      const res = await fetch(`/api/trace?memoryId=${id}&maxDepth=3`);
      if (!res.ok) {
        setTraceError(res.status === 404 ? "Memory not found" : `Error ${res.status}`);
      } else {
        setTraceResult(await res.json());
      }
    } catch {
      setTraceError("Network error");
    }
    setTracing(false);
  };

  const runExplain = async () => {
    const id = parseInt(explainId, 10);
    if (!id || id < 1 || !explainQ.trim()) return;
    setExplaining(true);
    setExplainResult(null);
    setExplainError(null);
    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId: id, question: explainQ.trim() }),
      });
      if (!res.ok) {
        setExplainError(res.status === 404 ? "Memory not found" : `Error ${res.status}`);
      } else {
        const data = await res.json();
        setExplainResult(typeof data === "string" ? data : data.explanation || data.answer || JSON.stringify(data, null, 2));
      }
    } catch {
      setExplainError("Network error");
    }
    setExplaining(false);
  };

  return (
    <Section title="memory trace">
      <div className="space-y-2">
        <div>
          <span className="t-micro" style={{ color: "var(--text-faint)" }}>Trace connections</span>
          <div className="flex gap-1.5 mt-1">
            <input
              type="number"
              value={traceId}
              onChange={(e) => setTraceId(e.target.value)}
              placeholder="memory ID"
              min={1}
              className="w-24 rounded-[4px] px-2 py-1 t-small outline-none"
              style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
            <button
              onClick={runTrace}
              disabled={tracing}
              className="rounded-[4px] px-3 py-1 t-small transition active:scale-95"
              style={{ background: "var(--surface-dimmer)", color: tracing ? "var(--text-faint)" : "var(--accent)", border: "1px solid var(--border)" }}
            >
              {tracing ? "..." : "Trace"}
            </button>
          </div>
          {traceError && <span className="t-micro" style={{ color: "var(--error)" }}>{traceError}</span>}
          {traceResult && (
            <div className="mt-1 rounded-[4px] p-2 max-h-40 overflow-y-auto" style={{ background: "var(--surface-dimmer)" }}>
              {renderTrace(traceResult)}
            </div>
          )}
        </div>

        <div>
          <span className="t-micro" style={{ color: "var(--text-faint)" }}>Explain a memory</span>
          <div className="flex gap-1.5 mt-1">
            <input
              type="number"
              value={explainId}
              onChange={(e) => setExplainId(e.target.value)}
              placeholder="memory ID"
              min={1}
              className="w-24 rounded-[4px] px-2 py-1 t-small outline-none"
              style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
          </div>
          <textarea
            value={explainQ}
            onChange={(e) => setExplainQ(e.target.value)}
            placeholder="What would you like to know about this memory?"
            rows={2}
            className="w-full mt-1 resize-y rounded-[4px] px-2 py-1 t-small outline-none"
            style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)", minHeight: "30px", maxHeight: "80px" }}
          />
          <button
            onClick={runExplain}
            disabled={explaining}
            className="mt-1 rounded-[4px] px-3 py-1 t-small transition active:scale-95"
            style={{ background: "var(--surface-dimmer)", color: explaining ? "var(--text-faint)" : "var(--accent)", border: "1px solid var(--border)" }}
          >
            {explaining ? "..." : "Explain"}
          </button>
          {explainError && <span className="t-micro block mt-1" style={{ color: "var(--error)" }}>{explainError}</span>}
          {explainResult && (
            <div className="mt-1 rounded-[4px] p-2 t-small leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto"
              style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}>
              {explainResult}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
