"use client";

import { useState } from "react";
import { Section } from "@/components/settings/settings-primitives";
import { useEngineConfig } from "@/lib/hooks/use-engine-config";

export function ConceptsSection() {
  const [engineConfig, updateEngine] = useEngineConfig();
  const [newConcept, setNewConcept] = useState("");
  const [inferring, setInferring] = useState(false);
  const [inferred, setInferred] = useState<string[]>([]);

  const addConcept = () => {
    const c = newConcept.trim().toLowerCase().replace(/\s+/g, "_");
    if (!c || engineConfig.memoryConcepts.includes(c)) return;
    updateEngine({ memoryConcepts: [...engineConfig.memoryConcepts, c] });
    setNewConcept("");
  };

  const removeConcept = (c: string) => {
    updateEngine({ memoryConcepts: engineConfig.memoryConcepts.filter((x) => x !== c) });
  };

  const acceptConcept = (c: string) => {
    const normalized = c.trim().toLowerCase().replace(/\s+/g, "_");
    if (!normalized || engineConfig.memoryConcepts.includes(normalized)) return;
    updateEngine({ memoryConcepts: [...engineConfig.memoryConcepts, normalized] });
    setInferred((prev) => prev.filter((x) => x !== c));
  };

  const dismissConcept = (c: string) => {
    setInferred((prev) => prev.filter((x) => x !== c));
  };

  const autoInfer = async () => {
    setInferring(true);
    try {
      const res = await fetch("/api/cortex/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "infer",
          summary: `Current concepts: ${engineConfig.memoryConcepts.join(", ")}. Suggest new related concepts for a cognitive memory system.`,
          source: "auto-infer",
          tags: engineConfig.memoryConcepts,
        }),
      });
      const data = await res.json();
      const suggestions = (data.concepts || []).filter(
        (c: string) => !engineConfig.memoryConcepts.includes(c.trim().toLowerCase().replace(/\s+/g, "_"))
      );
      setInferred(suggestions);
    } catch { /* ignore */ }
    finally {
      setInferring(false);
    }
  };

  return (
    <Section title="memory concepts">
      <div className="flex flex-wrap gap-1">
        {engineConfig.memoryConcepts.map((c) => (
          <span
            key={c}
            className="rounded-[3px] px-1.5 py-0.5 t-micro cursor-pointer hover:line-through"
            style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
            onClick={() => removeConcept(c)}
            title="Click to remove"
          >
            {c} ×
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        <input
          type="text"
          value={newConcept}
          onChange={(e) => setNewConcept(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addConcept(); }}
          placeholder="new concept..."
          className="flex-1 rounded-[4px] px-2 py-1 t-small outline-none"
          style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
        <button onClick={addConcept} className="t-small transition active:scale-95" style={{ color: "var(--accent)" }}>
          + add
        </button>
        <button
          onClick={autoInfer}
          disabled={inferring}
          className="t-small transition active:scale-95"
          style={{ color: "var(--text-faint)" }}
        >
          {inferring ? "..." : "auto-infer"}
        </button>
      </div>

      {/* ── Inferred suggestions ── */}
      {inferred.length > 0 && (
        <div className="mt-2">
          <span className="t-micro" style={{ color: "var(--text-faint)" }}>suggested concepts</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {inferred.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-[3px] px-1.5 py-0.5 t-micro"
                style={{ background: "var(--surface-dimmer)", color: "var(--accent)" }}>
                {c}
                <button onClick={() => acceptConcept(c)} className="transition active:scale-95" style={{ color: "var(--success)" }} title="Accept">+</button>
                <button onClick={() => dismissConcept(c)} className="transition active:scale-95" style={{ color: "var(--text-faint)" }} title="Dismiss">×</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}
