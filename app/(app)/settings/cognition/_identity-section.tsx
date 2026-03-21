"use client";

import { useEffect, useState, useCallback } from "react";
import { Section, Divider } from "@/components/settings/settings-primitives";

interface SelfModelMemory {
  id?: number;
  summary?: string;
  content?: string;
  importance?: number;
  decay?: number;
  tags?: string[];
}

interface ActionStats {
  actionsLogged: number;
  outcomesRecorded: number;
  positive: number;
  negative: number;
  neutral: number;
  strategiesLearned: number;
}

interface ActionEntry {
  id?: number;
  description?: string;
  created_at?: string;
}

interface OutcomeEntry {
  id?: number;
  sentiment?: string;
  notes?: string;
  created_at?: string;
}

const sentimentColor = (s?: string) => {
  if (s === "positive") return "var(--success)";
  if (s === "negative") return "var(--error)";
  return "var(--text-faint)";
};

const fmtDate = (d?: string) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return d;
  }
};

export function IdentitySection() {
  const [selfModel, setSelfModel] = useState<SelfModelMemory[]>([]);
  const [selfLoading, setSelfLoading] = useState(false);
  const [actionStats, setActionStats] = useState<ActionStats | null>(null);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [recentActions, setRecentActions] = useState<ActionEntry[]>([]);
  const [recentOutcomes, setRecentOutcomes] = useState<OutcomeEntry[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [learning, setLearning] = useState(false);
  const [lessons, setLessons] = useState<string[]>([]);

  const refreshSelfModel = useCallback(async () => {
    setSelfLoading(true);
    try {
      const res = await fetch("/api/self-model");
      if (res.ok) setSelfModel(await res.json());
    } catch { /* ignore */ }
    setSelfLoading(false);
  }, []);

  const refreshActions = useCallback(async () => {
    setActionsLoading(true);
    try {
      const res = await fetch("/api/actions");
      if (res.ok) {
        const data = await res.json();
        setActionStats(data.stats || null);
        setStrategies(data.strategies || []);
        setRecentActions((data.actions || []).slice(0, 5));
        setRecentOutcomes((data.outcomes || []).slice(0, 5));
      }
    } catch { /* ignore */ }
    setActionsLoading(false);
  }, []);

  useEffect(() => {
    refreshSelfModel();
    refreshActions();
  }, [refreshSelfModel, refreshActions]);

  const learnNow = async () => {
    setLearning(true);
    setLessons([]);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "learn" }),
      });
      if (res.ok) {
        const data = await res.json();
        setLessons(data.lessons || []);
        await refreshActions();
      }
    } catch { /* ignore */ }
    setLearning(false);
  };

  return (
    <>
      {/* ── Self-Model ── */}
      <Section title={`self-model${selfModel.length > 0 ? ` (${selfModel.length})` : ""}`}>
        {selfLoading && <span className="t-micro" style={{ color: "var(--text-faint)" }}>Loading...</span>}
        {!selfLoading && selfModel.length === 0 && (
          <p className="t-micro" style={{ color: "var(--text-faint)", lineHeight: 1.6 }}>
            Self-model forms as you interact. No self-concept memories yet.
          </p>
        )}
        <div className="space-y-2">
          {selfModel.map((m, i) => (
            <div key={m.id || i} className="rounded-[4px] p-2" style={{ background: "var(--surface-dimmer)" }}>
              <p className="t-small" style={{ color: "var(--text)", lineHeight: 1.5 }}>
                {m.summary || m.content?.slice(0, 120) || "—"}
              </p>
              <div className="flex items-center gap-3 mt-1">
                {m.importance != null && (
                  <div className="flex items-center gap-1">
                    <div className="h-1 w-12 rounded-full" style={{ background: "var(--bar-track)" }}>
                      <div className="h-1 rounded-full" style={{ width: `${Math.round(m.importance * 100)}%`, background: "var(--accent)" }} />
                    </div>
                    <span className="t-micro" style={{ color: "var(--text-faint)" }}>{(m.importance * 100).toFixed(0)}%</span>
                  </div>
                )}
                {m.decay != null && (
                  <span className="t-micro" style={{ color: "var(--text-faint)" }}>decay {(m.decay * 100).toFixed(0)}%</span>
                )}
              </div>
              {m.tags && m.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {m.tags.map((t) => (
                    <span key={t} className="rounded-[3px] px-1 py-0 t-micro" style={{ background: "var(--surface-dim)", color: "var(--text-faint)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Divider />

      {/* ── Action Learning ── */}
      <Section title="action learning">
        {actionsLoading && <span className="t-micro" style={{ color: "var(--text-faint)" }}>Loading...</span>}

        {actionStats && (
          <div className="grid grid-cols-3 gap-1 mb-2">
            {[
              { label: "actions", value: actionStats.actionsLogged },
              { label: "outcomes", value: actionStats.outcomesRecorded },
              { label: "strategies", value: actionStats.strategiesLearned },
              { label: "positive", value: actionStats.positive, color: "var(--success)" },
              { label: "negative", value: actionStats.negative, color: "var(--error)" },
              { label: "neutral", value: actionStats.neutral },
            ].map((s) => (
              <div key={s.label} className="rounded-[4px] p-1.5 text-center" style={{ background: "var(--surface-dimmer)" }}>
                <div className="t-body font-mono" style={{ color: s.color || "var(--text)" }}>{s.value}</div>
                <div className="t-micro" style={{ color: "var(--text-faint)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {strategies.length > 0 && (
          <div className="mb-2">
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>Learned Strategies</span>
            <div className="space-y-1 mt-1">
              {strategies.map((s, i) => (
                <div key={i} className="rounded-[4px] p-2 t-small" style={{ background: "var(--surface-dimmer)", color: "var(--text)", lineHeight: 1.5 }}>
                  {s}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={learnNow}
            disabled={learning}
            className="rounded-[4px] px-3 py-1 t-small transition active:scale-95"
            style={{ background: "var(--surface-dimmer)", color: learning ? "var(--text-faint)" : "var(--accent)", border: "1px solid var(--border)" }}
          >
            {learning ? "Learning..." : "Learn Now"}
          </button>
        </div>

        {lessons.length > 0 && (
          <div className="mt-2 space-y-1">
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>New Lessons</span>
            {lessons.map((l, i) => (
              <div key={i} className="rounded-[4px] p-2 t-small animate-fade-slide-up"
                style={{ background: "var(--surface-dimmer)", color: "var(--success)", lineHeight: 1.5 }}>
                {l}
              </div>
            ))}
          </div>
        )}

        {recentActions.length > 0 && (
          <div className="mt-2">
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>Recent Actions</span>
            <div className="space-y-0.5 mt-1">
              {recentActions.map((a, i) => (
                <div key={a.id || i} className="flex items-center gap-2 t-micro">
                  <span style={{ color: "var(--text-muted)" }}>{a.description || "—"}</span>
                  <span style={{ color: "var(--text-faint)" }}>{fmtDate(a.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentOutcomes.length > 0 && (
          <div className="mt-2">
            <span className="t-micro" style={{ color: "var(--text-faint)" }}>Recent Outcomes</span>
            <div className="space-y-0.5 mt-1">
              {recentOutcomes.map((o, i) => (
                <div key={o.id || i} className="flex items-center gap-2 t-micro">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sentimentColor(o.sentiment) }} />
                  <span style={{ color: "var(--text-muted)" }}>{o.notes || o.sentiment || "—"}</span>
                  <span style={{ color: "var(--text-faint)" }}>{fmtDate(o.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </>
  );
}
