"use client";

import { Dot, Line, KV } from "./_shared";
import { COG_FUNCS } from "@/lib/model-types";
import type { SetupWizardState } from "./_types";

export function StorageStep({ wiz }: { wiz: SetupWizardState }) {
  return (
    <div className="space-y-5 animate-fade-slide-up">
      {/* Supabase status */}
      <div className="space-y-2">
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>supabase</span>
        <div className="flex items-center gap-2 mt-1">
          <Dot ok />
          <span className="t-body" style={{ color: "var(--text)" }}>local instance</span>
          <span className="t-micro" style={{ color: "var(--text-faint)" }}>:54321</span>
        </div>
        <p className="t-micro" style={{ color: "var(--text-faint)" }}>
          using local supabase for memory storage — remote configuration coming soon
        </p>
      </div>

      <Line />

      {/* Summary */}
      <div className="space-y-1">
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>summary</span>
        <div className="mt-2 space-y-1">
          <KV label="platform" value={`${wiz.osLabel} · ${wiz.detection?.platform.arch || ""}`} />
          <Line />
          {COG_FUNCS.map(({ key, label, color }) => (
            <KV
              key={key}
              label={label.toLowerCase()}
              value={wiz.assignments[key]?.model.split("/").pop() || ""}
              valueColor={color}
            />
          ))}
          <KV label="server" value={wiz.infBackend === "cloud" ? wiz.cloudProvider : wiz.infBackend} />
          <Line />
          <KV label="embedding" value={`${wiz.embModel.split("/").pop()} · ${wiz.embDims}d`} />
          <KV label="emb server" value={wiz.embBackend} />
          <Line />
          <KV label="storage" value="supabase local" />
        </div>
      </div>

      {/* Error */}
      {wiz.saveError && (
        <p className="t-micro text-center" style={{ color: "var(--error)" }}>
          {wiz.saveError}
        </p>
      )}
      {wiz.migrationError && (
        <p className="t-micro text-center" style={{ color: "var(--error)" }}>
          {wiz.migrationError}
        </p>
      )}

      {/* Migration progress */}
      {wiz.migrating && wiz.migrationProgress && (
        <div className="space-y-2 animate-fade-slide-up">
          <p className="t-micro" style={{ color: "var(--text-faint)" }}>
            {wiz.migrationProgress.phase === "clearing" && "clearing old embeddings..."}
            {wiz.migrationProgress.phase === "schema" && "updating database schema..."}
            {wiz.migrationProgress.phase === "reembedding" && `re-embedding memories: ${wiz.migrationProgress.done}/${wiz.migrationProgress.total}`}
            {wiz.migrationProgress.phase === "done" && "migration complete"}
          </p>
          {wiz.migrationProgress.percent != null && (
            <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${wiz.migrationProgress.percent}%`, background: "var(--accent)" }}
              />
            </div>
          )}
        </div>
      )}

      <Line />

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => wiz.goTo("embedding")}
          disabled={wiz.saving || wiz.migrating}
          className="text-btn t-tiny transition active:scale-95"
          style={{ color: "var(--text-faint)", opacity: wiz.migrating ? 0.3 : 1 }}
        >
          ← back
        </button>
        <button
          onClick={wiz.handleSave}
          disabled={wiz.saving || wiz.migrating}
          className="text-btn t-body transition active:scale-95"
          style={{ color: "var(--accent)", opacity: wiz.saving || wiz.migrating ? 0.5 : 1 }}
        >
          {wiz.saving ? "saving..." : wiz.migrating ? "migrating..." : "start prelude →"}
        </button>
      </div>
    </div>
  );
}
