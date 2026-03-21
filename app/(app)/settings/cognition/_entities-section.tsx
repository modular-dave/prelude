"use client";

import { useState } from "react";
import { Section } from "@/components/settings/settings-primitives";

interface Entity {
  id: number;
  name: string;
  entity_type?: string;
  mention_count?: number;
}

interface Cooccurrence {
  entity_id: number;
  name: string;
  entity_type?: string;
  cooccurrence_count: number;
}

export function EntitiesSection() {
  const [query, setQuery] = useState("");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [cooccurrences, setCooccurrences] = useState<Cooccurrence[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [searching, setSearching] = useState(false);
  const [extractId, setExtractId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<any[] | null>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSelectedEntity(null);
    setCooccurrences([]);
    try {
      const res = await fetch(`/api/entities?q=${encodeURIComponent(query.trim())}&limit=20`);
      setEntities(await res.json());
    } catch {
      setEntities([]);
    } finally {
      setSearching(false);
    }
  };

  const showCooccurrences = async (entity: Entity) => {
    setSelectedEntity(entity);
    try {
      const res = await fetch(`/api/entities/${entity.id}/cooccurrences?limit=10`);
      setCooccurrences(await res.json());
    } catch {
      setCooccurrences([]);
    }
  };

  const extract = async () => {
    const id = parseInt(extractId, 10);
    if (!id) return;
    setExtracting(true);
    setExtractResult(null);
    try {
      const res = await fetch("/api/entities/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId: id, content: "", summary: "" }),
      });
      const data = await res.json();
      setExtractResult(Array.isArray(data) ? data : []);
    } catch {
      setExtractResult([]);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Section title="entities">
      <div className="space-y-3">
        {/* ── Search ── */}
        <div>
          <p className="t-tiny mb-1.5" style={{ color: "var(--text-faint)" }}>search knowledge graph entities</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="search entities..."
              className="flex-1 rounded-[4px] px-2 py-1 t-small outline-none"
              style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
            <button
              onClick={search}
              disabled={searching}
              className="t-small transition active:scale-95"
              style={{ color: "var(--accent)" }}
            >
              {searching ? "..." : "search"}
            </button>
          </div>
        </div>

        {/* ── Results ── */}
        {entities.length > 0 && (
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {entities.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-[4px] px-2 py-1 cursor-pointer transition"
                style={{
                  background: selectedEntity?.id === e.id ? "var(--surface-dim)" : "var(--surface-dimmer)",
                }}
                onClick={() => showCooccurrences(e)}
              >
                <span className="t-small" style={{ color: "var(--text)" }}>{e.name}</span>
                <span className="t-micro" style={{ color: "var(--text-faint)" }}>
                  {e.entity_type}{e.mention_count != null ? ` · ${e.mention_count}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Cooccurrences ── */}
        {selectedEntity && (
          <div>
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>
              co-occurs with {selectedEntity.name}
            </span>
            {cooccurrences.length > 0 ? (
              <div className="space-y-0.5 mt-1">
                {cooccurrences.map((c) => (
                  <div key={c.entity_id} className="flex items-center justify-between t-micro">
                    <span style={{ color: "var(--text-muted)" }}>{c.name}</span>
                    <span style={{ color: "var(--text-faint)" }}>{c.entity_type} · {c.cooccurrence_count}×</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="t-micro mt-1" style={{ color: "var(--text-faint)" }}>no cooccurrences found</p>
            )}
          </div>
        )}

        {/* ── Extract ── */}
        <div>
          <span className="t-micro" style={{ color: "var(--text-faint)" }}>extract entities from memory</span>
          <div className="flex gap-1.5 mt-1">
            <input
              type="text"
              value={extractId}
              onChange={(e) => setExtractId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") extract(); }}
              placeholder="memory ID"
              className="w-24 rounded-[4px] px-2 py-1 t-small outline-none"
              style={{ background: "var(--surface-dimmer)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
            <button
              onClick={extract}
              disabled={extracting}
              className="t-small transition active:scale-95"
              style={{ color: "var(--accent)" }}
            >
              {extracting ? "..." : "extract"}
            </button>
          </div>
          {extractResult && (
            <div className="mt-1 space-y-0.5">
              {extractResult.length > 0 ? extractResult.map((e, i) => (
                <span
                  key={i}
                  className="inline-block rounded-[3px] px-1.5 py-0.5 t-micro mr-1"
                  style={{ background: "var(--surface-dimmer)", color: "var(--text-muted)" }}
                >
                  {e.name || e.entity || String(e)}
                </span>
              )) : (
                <span className="t-micro" style={{ color: "var(--text-faint)" }}>no entities extracted</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
