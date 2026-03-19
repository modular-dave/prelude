"use client";

import { Loader2, ExternalLink, X } from "lucide-react";
import { EmbTypePicker } from "./_shared-components";
import {
  EMB_LOCAL,
  EMB_HOSTED,
  EMB_TYPES,
} from "./_types";
import type { EmbType } from "./_types";
import { useEmbeddingSetup } from "./use-embedding-setup";

export function EmbeddingSection() {
  const emb = useEmbeddingSetup();

  return (
    <>
      {/* Status — embedding assignments */}
      <div className="mt-3 space-y-0.5">
        {EMB_TYPES.map(({ key, label, color }) => {
          const slot = emb.embConfig?.embeddingSlots?.[key];
          const health = emb.slotHealth[key];
          const provId = slot ? emb.resolveProvider(slot.baseUrl) : null;
          const modelName = slot?.model?.split("/").pop() || null;
          return (
            <div key={`emb-${key}`} className="flex items-center gap-2">
              <span className="font-mono" style={{ color, fontSize: 9, fontWeight: 400, width: 44 }}>
                {label.toLowerCase()}
              </span>
              <span className="font-mono truncate" style={{ color: modelName ? "var(--text)" : "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                {modelName || "unassigned"}
              </span>
              {provId && (
                <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                  ︱{provId}{health?.ok ? ` · ${health.dims ?? "?"}d` : health === null ? "" : " · offline"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Embedding section */}
      <div className="mt-8 mb-12">
        <div style={{ borderTop: "1px solid var(--border)", margin: "16px 0 8px" }} />
        <button
          onClick={() => emb.setEmbeddingOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 mb-3 text-left transition active:scale-[0.99]"
        >
          <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 11, fontWeight: 400 }}>
            {emb.embeddingOpen ? "−" : "+"} embedding︱
          </span>
          <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
            semantic search & memory
          </span>
        </button>
        {emb.embeddingOpen && (
          <div className="space-y-3 animate-fade-slide-up">
            {/* Local */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Local</span>
              </div>
              {EMB_LOCAL.map((prov) => (
                <EmbProviderCard key={prov.id} prov={prov} emb={emb} variant="local" />
              ))}
            </div>

            {/* Hosted */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Hosted</span>
              </div>
              {EMB_HOSTED.map((prov) => (
                <EmbProviderCard key={prov.id} prov={prov} emb={emb} variant="hosted" />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────

import type { EmbProvider } from "./_types";
import type { EmbeddingSetupState } from "./use-embedding-setup";

function EmbProviderCard({
  prov,
  emb,
  variant,
}: {
  prov: EmbProvider;
  emb: EmbeddingSetupState;
  variant: "local" | "hosted";
}) {
  const isOpen = emb.embOpenProviders.has(prov.id);
  const isMlx = prov.id === "mlx";
  const isActiveProvider = emb.activeEmbProvider === prov.id;
  const apiKey = emb.embApiKeys[prov.id] || "";

  return (
    <div style={{ border: "none" }}>
      <button
        onClick={() => emb.toggleEmbProvider(prov.id)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition"
        style={{ background: "transparent" }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono" style={{ color: isActiveProvider ? "var(--accent)" : "var(--text)", fontSize: 13, fontWeight: 500 }}>
              {prov.name}
            </span>
            <ProviderStatusBadge emb={emb} provId={prov.id} isMlx={variant === "local" && isMlx} />
            {EMB_TYPES.filter((t) => emb.embTypeAssignments[t.key]?.provider === prov.id && emb.slotHealth[t.key]?.ok).map((t) => (
              <span
                key={t.key}
                className="font-mono"
                style={{ color: t.color, fontSize: 9, fontWeight: 400 }}
              >
                {t.label.toLowerCase()}
              </span>
            ))}
          </div>
          <p className="font-mono mt-0.5" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>{prov.desc}</p>
        </div>
        <span className="font-mono shrink-0" style={{ color: "var(--text-faint)", fontSize: 11 }}>
          {isOpen ? "−" : "+"}
        </span>
      </button>

      {isOpen && (
        <div className="animate-fade-slide-up" style={{ borderTop: "1px solid var(--border)" }}>
          {/* Hosted API key section */}
          {variant === "hosted" && (
            <div className="px-4 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>API Key</span>
                {prov.url && (
                  <a
                    href={prov.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono inline-flex items-center gap-1 transition"
                    style={{ color: "var(--accent)", fontSize: 9, fontWeight: 400 }}
                  >
                    Get key <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder={emb.embConfig?.embeddingKeys?.[prov.id] ? "••••••••  (saved)" : `${prov.id}-api-key...`}
                  value={apiKey}
                  onChange={(e) => emb.setEmbApiKeys((k) => ({ ...k, [prov.id]: e.target.value }))}
                  className="flex-1 font-mono bg-transparent px-0 py-1 outline-none transition"
                  style={{
                    background: "transparent", borderBottom: "1px solid var(--border)",
                    border: `1px solid ${emb.embConfig?.embeddingKeys?.[prov.id] ? "color-mix(in srgb, var(--success) 30%, transparent)" : "var(--border)"}`,
                    color: "var(--text)",
                    fontSize: 9,
                    fontWeight: 400,
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
                  onBlur={(e) => { e.target.style.borderColor = emb.embConfig?.embeddingKeys?.[prov.id] ? "color-mix(in srgb, var(--success) 30%, transparent)" : "var(--border)"; }}
                />
                <button
                  disabled={!apiKey}
                  onClick={() => emb.handleEmbSaveKey(prov.id)}
                  className="shrink-0 font-mono text-btn transition"
                  style={{
                    background: emb.embConfig?.embeddingKeys?.[prov.id] ? "color-mix(in srgb, var(--success) 8%, transparent)" : "color-mix(in srgb, var(--accent) 8%, transparent)",
                    border: `1px solid ${emb.embConfig?.embeddingKeys?.[prov.id] ? "color-mix(in srgb, var(--success) 20%, transparent)" : "color-mix(in srgb, var(--accent) 20%, transparent)"}`,
                    color: emb.embConfig?.embeddingKeys?.[prov.id] ? "var(--success)" : "var(--accent)",
                    opacity: !apiKey ? 0.5 : 1,
                    fontSize: 9,
                    fontWeight: 400,
                  }}
                >
                  {emb.embConfig?.embeddingKeys?.[prov.id] ? "Saved" : "Save"}
                </button>
              </div>
            </div>
          )}

          {/* Models list */}
          <div className="px-4 py-3 space-y-1.5">
            <span className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>models</span>
            {prov.models.map((m) => {
              const isModelActive = emb.activeEmbProvider === prov.id && emb.activeEmbModelId === m.id;
              const typeTags = emb.getEmbTypeTags(prov.id, m.id);
              const pickerKey = `${prov.id}:${m.id}`;
              const isLoading = emb.embLoadingModels.has(pickerKey);
              const keySaved = variant === "hosted" ? !!emb.embConfig?.embeddingKeys?.[prov.id] : true;
              return (
                <div
                  key={m.id}
                  className="group relative py-0.5 transition cursor-pointer"
                  style={{
                    background: "transparent",
                    opacity: !keySaved && !isModelActive && typeTags.length === 0 ? 0.5 : 1,
                  }}
                  onClick={() => {
                    if (variant === "hosted" && !keySaved) return;
                    if (isLoading || emb.embLoadingModels.size > 0) return;
                    emb.setEmbPickerModel(emb.embPickerModel === pickerKey ? null : pickerKey);
                  }}
                >
                  <div className="flex items-center gap-2">
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                    ) : (
                      <div className="w-3" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono" style={{ color: typeTags.length > 0 ? "var(--accent)" : isModelActive ? "var(--success)" : "var(--text)", fontSize: 11, fontWeight: 400 }}>
                          {m.name}
                        </span>
                        {isModelActive && typeTags.length === 0 && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--success)" }} />}
                        {typeTags.map((t) => {
                          const cfg = EMB_TYPES.find((c) => c.key === t)!;
                          return (
                            <span
                              key={t}
                              className="font-mono shrink-0"
                              style={{ color: cfg.color, fontSize: 9, fontWeight: 400 }}
                            >
                              {cfg.label.toLowerCase()}
                            </span>
                          );
                        })}
                      </div>
                      <p className="font-mono" style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}>
                        {m.dims}d{m.size && ` · ${m.size}`} · {m.desc}
                      </p>
                    </div>
                    {isLoading && (
                      <div className="flex items-center gap-2 shrink-0">
                        {variant === "local" && emb.embLoadingProgress[pickerKey] && (
                          <span className="font-mono tabular-nums" style={{ color: "var(--accent)", fontSize: 9, fontWeight: 400 }}>
                            {emb.embLoadingProgress[pickerKey].elapsed}s
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); emb.handleEmbCancel(prov.id, m.id); }}
                          className="rounded-full p-0.5 transition"
                          title="Cancel"
                          style={{ color: "var(--error)" }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {!isLoading && typeTags.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          emb.handleEmbDisconnect();
                        }}
                        className="font-mono transition shrink-0"
                        style={{ color: "var(--error)", fontSize: 9, fontWeight: 400 }}
                      >
                        stop
                      </button>
                    )}
                    {!isLoading && !isModelActive && keySaved && typeTags.length === 0 && (
                      <span
                        className="font-mono shrink-0"
                        style={{ color: "var(--text-faint)", fontSize: 9, fontWeight: 400 }}
                      >
                        {variant === "local" && isMlx ? "start" : "connect"}
                      </span>
                    )}
                  </div>
                  {isLoading && (
                    <div
                      className="mt-1.5 h-1 rounded-full overflow-hidden"
                      style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={variant === "local" ? {
                          width: emb.embLoadingProgress[pickerKey]
                            ? `${Math.min((emb.embLoadingProgress[pickerKey].elapsed / 60) * 100, 95)}%`
                            : "5%",
                          background: "var(--accent)",
                          transition: "width 1s linear",
                        } : {
                          width: "60%",
                          background: "var(--accent)",
                          animation: "indeterminate 1.5s ease-in-out infinite",
                        }}
                      />
                    </div>
                  )}
                  {emb.embPickerModel === pickerKey && (
                    <EmbTypePicker
                      onSelect={(t) => emb.handleEmbTypeSelect(prov.id, m.id, m.dims, prov.baseUrl, variant === "hosted" ? apiKey : "local", t)}
                      onClose={() => emb.setEmbPickerModel(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {emb.embResult && !emb.embResult.ok && emb.embResult.provider === prov.id && (
            <div className="px-4 pb-3">
              <div
                className="flex items-start gap-1.5 font-mono py-1"
                style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 6%, transparent)", fontSize: 9, fontWeight: 400 }}
              >
                <span className="h-1.5 w-1.5 rounded-full shrink-0 mt-1" style={{ background: "var(--error)" }} />
                <span className="break-words min-w-0">
                  {(emb.embResult.error || "failed").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim().slice(0, 200)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderStatusBadge({
  emb,
  provId,
  isMlx,
}: {
  emb: EmbeddingSetupState;
  provId: string;
  isMlx: boolean;
}) {
  const assignedSlots = (["test", "publish"] as EmbType[]).filter(
    (t) => emb.embTypeAssignments[t]?.provider === provId
  );
  const hasAssignment = assignedSlots.length > 0;
  const isHealthy = isMlx
    ? emb.embRunning
    : hasAssignment && assignedSlots.some((t) => emb.slotHealth[t]?.ok);
  const isChecking = hasAssignment && assignedSlots.every((t) => emb.slotHealth[t] === null);

  if (isHealthy || (isMlx && emb.embRunning)) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--success)" }}>
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--success)" }} />
        {isMlx ? "running" : "active"}
      </span>
    );
  }
  if (isChecking) {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--text-faint)" }} />
        checking...
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono" style={{ fontSize: 9, fontWeight: 400, color: "var(--text-faint)" }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--text-faint)" }} />
      inactive
    </span>
  );
}
