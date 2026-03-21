"use client";

import { useState } from "react";
import { Loader2, X, ExternalLink } from "lucide-react";
import { Section, Divider, Slider } from "@/components/settings/settings-primitives";
import { EMB_LOCAL, EMB_HOSTED } from "@/lib/model-types";
import { useEngineConfig } from "@/lib/hooks/use-engine-config";
import type { EmbProvider, EmbType } from "@/lib/model-types";
import { usePlatform } from "@/lib/hooks/use-platform";
import { useEmbeddingSetup } from "./use-embedding-setup";
import type { EmbeddingSetupState } from "./use-embedding-setup";

// ── Main Content ───────────────────────────────────────────────

export function EmbeddingContent() {
  const embedding = useEmbeddingSetup();

  const hasModel = !!embedding.activeEmbModelId;

  return (
    <>
      {/* ── Status ── */}
      <div className="flex items-center gap-2 -mt-2 mb-1">
        <span
          className="h-[6px] w-[6px] rounded-full shrink-0"
          style={{ background: hasModel ? "var(--success)" : "var(--text-faint)" }}
        />
        <span className="t-small" style={{ color: hasModel ? "var(--success)" : "var(--text-faint)" }}>
          {hasModel ? `${embedding.activeEmbModelId?.split("/").pop()}` : "no model"}
        </span>
      </div>

      {/* ── Servers ── */}
      <Section title="servers">
        {/* Local servers (hardware-aware) */}
        <LocalEmbServers embedding={embedding} />

        {/* Separator */}
        {embedding.embConfig && (
          <div className="my-1.5" style={{ borderTop: "1px dashed var(--border)" }} />
        )}

        {/* Hosted providers */}
        {embedding.embConfig && ["openai", "voyage"].map((provId) => {
          const keySaved = !!embedding.embConfig?.embeddingKeys?.[provId];
          const hasSlot = (["test", "publish"] as EmbType[]).some(
            (t) => embedding.embTypeAssignments[t]?.provider === provId
          );
          const isHealthy = hasSlot && (["test", "publish"] as EmbType[]).some(
            (t) => embedding.embTypeAssignments[t]?.provider === provId && embedding.slotHealth[t]?.ok
          );
          return (
            <EmbHostedServerRow key={provId} provId={provId}
              name={provId === "openai" ? "OpenAI" : "Voyage AI"}
              keySaved={keySaved} isHealthy={isHealthy}
              apiKey={embedding.embApiKeys[provId] || ""}
              onApiKeyChange={(v) => embedding.setEmbApiKeys((k) => ({ ...k, [provId]: v }))}
              onSaveKey={() => embedding.handleEmbSaveKey(provId)}
              url={provId === "openai" ? "https://platform.openai.com" : "https://www.voyageai.com"} />
          );
        })}
      </Section>

      <Divider />

      {/* ── Models ── */}
      <Section title="models">
        {/* Default model indicator */}
        <div className="flex items-center gap-2 py-1 mb-1">
          <span
            className="h-[6px] w-[6px] rounded-full shrink-0"
            style={{ background: embedding.activeEmbModelId ? "var(--accent)" : "var(--text-faint)" }}
          />
          <span className="t-small" style={{ color: "var(--text-faint)" }}>default</span>
          <span className="t-body truncate flex-1" style={{ color: embedding.activeEmbModelId ? "var(--accent)" : "var(--text-faint)" }}>
            {embedding.activeEmbModelId?.split("/").pop() || "none selected"}
          </span>
          {embedding.activeEmbProvider && (
            <span className="t-tiny shrink-0" style={{ color: "var(--text-faint)" }}>
              {embedding.activeEmbProvider}
            </span>
          )}
        </div>

        {/* Model catalogs — each provider in a collapsible Section */}
        <EmbeddingModels embedding={embedding} />
      </Section>

      <Divider />

      {/* ── Cache & Fragmentation ── */}
      <Section title="cache & fragmentation">
        <EmbeddingCacheContent />
      </Section>

      {/* ── Migration progress ── */}
      {embedding.embMigrating && (
        <>
          <Divider />
          <div className="flex items-center gap-2 py-1">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--warning)" }} />
            <span className="t-tiny" style={{ color: "var(--warning)" }}>
              migrating embeddings{embedding.embMigrationProgress?.phase ? ` · ${embedding.embMigrationProgress.phase}` : ""}
              {embedding.embMigrationProgress?.percent != null ? ` · ${Math.round(embedding.embMigrationProgress.percent)}%` : ""}
            </span>
          </div>
        </>
      )}
    </>
  );
}

// ── Embedding Cache ─────────────────────────────────────────────

function EmbeddingCacheContent() {
  const [engineConfig, updateEngine] = useEngineConfig();

  return (
    <div className="space-y-1">
      <p className="t-tiny mb-2" style={{ color: "var(--text-faint)" }}>
        vector cache and text fragmentation for embedding pipeline
      </p>
      <Slider label="Cache Size" value={engineConfig.embeddingCacheMax} min={50} max={1000} step={25}
        onChange={(v) => updateEngine({ embeddingCacheMax: v })} />
      <Slider label="Cache TTL (m)" value={engineConfig.embeddingCacheTTLMin} min={5} max={120} step={5}
        onChange={(v) => updateEngine({ embeddingCacheTTLMin: v })} />
      <Slider label="Fragment Max" value={engineConfig.embeddingFragmentMaxLength} min={500} max={5000} step={250}
        onChange={(v) => updateEngine({ embeddingFragmentMaxLength: v })} />
    </div>
  );
}

// ── Models ──────────────────────────────────────────────────────

function EmbeddingModels({ embedding }: { embedding: EmbeddingSetupState }) {
  const { capabilities } = usePlatform();

  const localProviders = capabilities
    ? (capabilities.isMobile ? [] : EMB_LOCAL.filter((p) => !p.guard || p.guard(capabilities)))
    : EMB_LOCAL;
  const hostedProviders = capabilities
    ? EMB_HOSTED.filter((p) => !p.guard || p.guard(capabilities))
    : EMB_HOSTED;

  return (
    <div className="space-y-0">
      {localProviders.map((prov) => (
        <EmbProviderSection key={prov.id} prov={prov} emb={embedding} />
      ))}
      {hostedProviders.map((prov) => (
        <EmbProviderSection key={prov.id} prov={prov} emb={embedding} />
      ))}
    </div>
  );
}

// ── Hosted Server Row ────────────────────────────────────────────

function EmbHostedServerRow({
  provId, name, keySaved, isHealthy, apiKey, onApiKeyChange, onSaveKey, url,
}: {
  provId: string; name: string; keySaved: boolean; isHealthy: boolean;
  apiKey: string; onApiKeyChange: (v: string) => void;
  onSaveKey: () => void; url: string;
}) {
  const [open, setOpen] = useState(false);
  const statusDot = isHealthy ? "var(--success)" : keySaved ? "var(--warning)" : "var(--text-faint)";
  const statusLabel = isHealthy ? "active" : keySaved ? "saved" : "not saved";

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left transition active:scale-[0.99]">
        <span className="h-[5px] w-[5px] rounded-full shrink-0" style={{ background: statusDot }} />
        <span className="t-body flex-1" style={{ color: keySaved ? "var(--text)" : "var(--text-faint)" }}>
          {name}
        </span>
        <span className="t-tiny" style={{ color: statusDot }}>{statusLabel}</span>
        <span className="t-tiny" style={{ color: "var(--text-faint)" }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="pl-4 pb-2 space-y-2 animate-fade-slide-up">
          <div className="flex items-center justify-between">
            <span className="t-tiny" style={{ color: "var(--text-faint)" }}>api key</span>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="t-tiny inline-flex items-center gap-0.5 transition" style={{ color: "var(--accent)" }}>
              get key <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <div className="flex items-center gap-2">
            <input type="password"
              placeholder={keySaved ? "••••••••  (saved)" : `${provId}-api-key...`}
              value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)}
              className="flex-1 t-tiny bg-transparent px-0 py-1 outline-none transition"
              style={{
                border: `1px solid ${keySaved ? "color-mix(in srgb, var(--success) 30%, transparent)" : "var(--border)"}`,
                color: "var(--text)",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.target.style.borderColor = keySaved ? "color-mix(in srgb, var(--success) 30%, transparent)" : "var(--border)"; }} />
            <button disabled={!apiKey} onClick={onSaveKey}
              className="shrink-0 t-tiny text-btn transition"
              style={{ color: keySaved ? "var(--success)" : "var(--accent)", opacity: !apiKey ? 0.5 : 1 }}>
              {keySaved ? "saved" : "save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Provider Models Section ──────────────────────────────────────

function EmbProviderSection({
  prov, emb,
}: {
  prov: EmbProvider; emb: EmbeddingSetupState;
}) {
  const isLocal = prov.baseUrl.includes("127.0.0.1");
  const keySaved = isLocal || !!emb.embConfig?.embeddingKeys?.[prov.id];

  if (prov.models.length === 0) return null;

  const hasActiveModel = prov.models.some(
    (m) => emb.activeEmbProvider === prov.id && emb.activeEmbModelId === m.id
  );
  const shouldOpen = isLocal || hasActiveModel;

  return (
    <Section title={prov.name} defaultOpen={shouldOpen}>
      {prov.models.map((m) => {
        const isDefault = emb.activeEmbProvider === prov.id && emb.activeEmbModelId === m.id;
        const modelKey = `${prov.id}:${m.id}`;
        const isLoading = emb.embLoadingModels.has(modelKey);
        return (
          <div key={m.id}
            className="group relative flex items-center gap-2 py-0.5 transition cursor-pointer rounded-[4px] -mx-1 px-1"
            style={{
              opacity: !keySaved && !isDefault ? 0.4 : 1,
              background: isDefault ? "color-mix(in srgb, var(--accent) 6%, transparent)" : undefined,
            }}
            onClick={() => {
              if (isLoading || isDefault) return;
              if (!isLocal && !keySaved) return;
              emb.handleEmbeddingSwitch(prov.id, m.id);
            }}>
            {isLoading ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
            ) : isDefault ? (
              <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
            ) : (
              <span className="t-tiny shrink-0" style={{ color: "var(--text-faint)" }}>+</span>
            )}
            <span className="t-body truncate" style={{ color: isDefault ? "var(--accent)" : "var(--text)" }}>
              {m.name}
            </span>
            {isDefault && <span className="t-tiny shrink-0" style={{ color: "var(--accent)" }}>default</span>}
            <span className="t-tiny flex-1 text-right" style={{ color: "var(--text-faint)" }}>
              {m.dims}d{m.size && ` · ${m.size}`}
            </span>
            {isLoading && (
              <div className="flex items-center gap-2 shrink-0">
                {isLocal && emb.embLoadingProgress[modelKey] && (
                  <span className="t-tiny tabular-nums" style={{ color: "var(--accent)" }}>
                    {emb.embLoadingProgress[modelKey].elapsed}s
                  </span>
                )}
                <button onClick={(e) => { e.stopPropagation(); emb.handleEmbCancel(prov.id, m.id); }}
                  className="rounded-full p-0.5 transition" title="Cancel" style={{ color: "var(--error)" }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {!isLoading && !isDefault && keySaved && (
              <span className="t-tiny shrink-0" style={{ color: "var(--text-faint)" }}>
                {isLocal ? "start" : "connect"}
              </span>
            )}
          </div>
        );
      })}

      {emb.embResult && !emb.embResult.ok && emb.embResult.provider === prov.id && (
        <div className="mt-1">
          <div className="flex items-start gap-1.5 t-tiny py-1 rounded-[4px] px-1"
            style={{ color: "var(--error)", background: "color-mix(in srgb, var(--error) 6%, transparent)" }}>
            <span className="h-1.5 w-1.5 rounded-full shrink-0 mt-1" style={{ background: "var(--error)" }} />
            <span className="break-words min-w-0">
              {(emb.embResult.error || "failed").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/gi, " ").trim().slice(0, 200)}
            </span>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Local Embedding Servers (hardware-aware) ─────────────────────

function LocalEmbServers({ embedding }: { embedding: EmbeddingSetupState }) {
  const { capabilities } = usePlatform();

  const localProviders = capabilities
    ? EMB_LOCAL.filter((p) => !p.guard || p.guard(capabilities))
    : EMB_LOCAL;

  if (localProviders.length === 0) return null;

  return (
    <>
      {localProviders.map((prov) => {
        const isMlx = prov.id === "mlx";
        const running = isMlx ? embedding.embRunning : false;
        return (
          <LocalEmbServerRow
            key={prov.id}
            name={prov.name}
            running={running}
            starting={embedding.embStarting}
            stopping={embedding.embStopping}
            onStart={() => embedding.handleEmbeddingStart(prov.id)}
            onStop={() => embedding.handleEmbeddingStop()}
          />
        );
      })}
    </>
  );
}

function LocalEmbServerRow({
  name, running, starting, stopping, onStart, onStop,
}: {
  name: string; running: boolean;
  starting: boolean; stopping: boolean;
  onStart: () => void; onStop: () => void;
}) {
  const statusDot = running ? "var(--success)" : "var(--warning)";
  const statusLabel = running ? "running" : "stopped";

  return (
    <div className="flex items-center gap-1.5 py-0.5 group">
      <span className="h-[5px] w-[5px] rounded-full shrink-0" style={{ background: statusDot }} />
      <span className="t-body flex-1" style={{ color: running ? "var(--text)" : "var(--text-faint)" }}>
        {name}
      </span>
      <span className="t-tiny" style={{ color: statusDot }}>{statusLabel}</span>
      {running && (
        <button onClick={onStop} disabled={stopping}
          className="text-btn t-tiny transition active:scale-95"
          style={{ color: "var(--error)", opacity: stopping ? 0.5 : 1 }}>
          {stopping ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : "stop"}
        </button>
      )}
      {!running && (
        <button onClick={onStart} disabled={starting}
          className="text-btn t-tiny transition active:scale-95"
          style={{ color: "var(--success)", opacity: starting ? 0.5 : 1 }}>
          {starting ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" /> : "start"}
        </button>
      )}
    </div>
  );
}
