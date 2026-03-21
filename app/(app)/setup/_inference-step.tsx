"use client";

import { Dot, Line, Section } from "./_shared";
import type { SetupWizardState } from "./_types";
import {
  LOCAL_PROVIDERS,
  HOSTED_PROVIDERS,
  COG_FUNCS,
} from "@/lib/model-types";

export function InferenceStep({ wiz }: { wiz: SetupWizardState }) {
  const mlxAvail = wiz.detection?.backends.mlx.available || wiz.detection?.platform.isAppleSilicon;
  const ollamaAvail = wiz.detection?.backends.ollama.available;
  const mlxRunning = wiz.detection?.backends.mlx.inference;
  const ollamaRunning = wiz.detection?.backends.ollama.available;
  const isLocal = wiz.infBackend === "mlx" || wiz.infBackend === "ollama";
  const isCloud = wiz.infBackend === "cloud";

  if (wiz.detecting) {
    return (
      <div className="space-y-4 animate-fade-slide-up">
        <p className="t-body" style={{ color: "var(--text-faint)" }}>scanning servers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-slide-up">
      {/* Platform badge */}
      <div className="flex items-center gap-2">
        <span className="t-micro" style={{ color: "var(--text-faint)" }}>
          {wiz.osLabel} · {wiz.detection?.platform.arch}
        </span>
      </div>

      {/* ── Local: servers → models ── */}
      <Section label="local servers" active={isLocal} onSelect={() => wiz.setInfBackend(mlxAvail ? "mlx" : "ollama")}>
        <div className="space-y-4">
          {/* MLX */}
          {(wiz.detection?.platform.isAppleSilicon || wiz.detection?.platform.os === "darwin") && (
            <div>
              <ServerRow
                label="MLX"
                desc="Apple Silicon native"
                available={!!mlxAvail}
                running={!!mlxRunning}
                active={wiz.infBackend === "mlx"}
                onSelect={() => wiz.setInfBackend("mlx")}
                onStart={() => wiz.handleStartServer("mlx")}
                starting={wiz.startingServer.loading && wiz.infBackend === "mlx"}
              />
              {/* MLX models (nested under server) */}
              {wiz.infBackend === "mlx" && (
                <ModelList wiz={wiz} provider="mlx" />
              )}
            </div>
          )}

          {/* Ollama */}
          <div>
            <ServerRow
              label="Ollama"
              desc="cross-platform, open-source"
              available={!!ollamaAvail}
              running={!!ollamaRunning}
              active={wiz.infBackend === "ollama"}
              onSelect={() => wiz.setInfBackend("ollama")}
              onStart={() => wiz.handleStartServer("ollama")}
              starting={wiz.startingServer.loading && wiz.infBackend === "ollama"}
            />
            {/* Ollama models (nested under server) */}
            {wiz.infBackend === "ollama" && (
              <ModelList wiz={wiz} provider="ollama" />
            )}
          </div>

          {/* Server start error */}
          {wiz.startingServer.error && (
            <p className="t-micro" style={{ color: "var(--error)" }}>{wiz.startingServer.error}</p>
          )}

          {/* Install model (for local when no models) */}
          {isLocal && wiz.getInfModels().length === 0 && !wiz.installingModel.loading && (
            <div>
              <p className="t-micro" style={{ color: "var(--text-faint)" }}>no models found</p>
              <button
                onClick={() => {
                  const defaultModel = LOCAL_PROVIDERS.find(p => p.id === wiz.infBackend)?.models[0]?.id;
                  if (defaultModel) wiz.handleInstallModel(defaultModel, wiz.infBackend);
                }}
                className="text-btn t-micro mt-1 transition active:scale-95"
                style={{ color: "var(--accent)" }}
              >
                install default model →
              </button>
            </div>
          )}
          {wiz.installingModel.loading && (
            <p className="t-micro" style={{ color: "var(--text-faint)" }}>
              installing... {wiz.installingModel.progress}
            </p>
          )}
        </div>
      </Section>

      {/* ── Hosted: provider → key → models ── */}
      <Section label="hosted APIs" active={isCloud} onSelect={() => { wiz.setInfBackend("cloud"); wiz.setCloudProvider(HOSTED_PROVIDERS[0].id); wiz.setAllAssignments(HOSTED_PROVIDERS[0].models[0]?.id || "", HOSTED_PROVIDERS[0].id); }}>
        <div className="space-y-4">
          {HOSTED_PROVIDERS.map((hp) => (
            <div key={hp.id}>
              <div className="flex items-center gap-2 py-1">
                <Dot ok={isCloud && wiz.cloudProvider === hp.id && !!wiz.cloudApiKey} />
                <button
                  onClick={() => {
                    wiz.setInfBackend("cloud");
                    wiz.setCloudProvider(hp.id);
                    wiz.setAllAssignments(hp.models[0]?.id || "", hp.id);
                  }}
                  className="t-body transition active:scale-[0.99]"
                  style={{ color: isCloud && wiz.cloudProvider === hp.id ? "var(--text)" : "var(--text-faint)" }}
                >
                  {hp.name}
                </button>
                <span className="t-micro" style={{ color: "var(--text-faint)" }}>{hp.description || ""}</span>
              </div>
              {/* Nested: API key + models */}
              {isCloud && wiz.cloudProvider === hp.id && (
                <div className="pl-4 mt-1.5 space-y-2">
                  <input
                    type="password"
                    value={wiz.cloudApiKey}
                    onChange={e => wiz.setCloudApiKey(e.target.value)}
                    placeholder="API key"
                    className="w-full bg-transparent outline-none font-mono t-body px-0 py-1"
                    style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }}
                  />
                  <input
                    type="text"
                    value={wiz.cloudBaseUrl}
                    onChange={e => wiz.setCloudBaseUrl(e.target.value)}
                    placeholder={hp.envVars?.[0]?.placeholder || ""}
                    className="w-full bg-transparent outline-none font-mono t-body px-0 py-1"
                    style={{ borderBottom: "1px solid var(--border)", color: "var(--text)" }}
                  />
                  <ModelList wiz={wiz} provider="cloud" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Test */}
      <div className="flex items-center gap-2">
        <button
          onClick={wiz.handleTestInference}
          disabled={wiz.testingInf || !wiz.assignments.chat.model}
          className="text-btn t-micro transition active:scale-95"
          style={{ color: "var(--text-faint)", opacity: wiz.testingInf || !wiz.assignments.chat.model ? 0.4 : 1 }}
        >
          {wiz.testingInf ? "testing..." : "test connection"}
        </button>
        {wiz.testInfResult && (
          <span className="t-micro" style={{ color: wiz.testInfResult.ok ? "var(--success)" : "var(--error)" }}>
            {wiz.testInfResult.ok ? "connected" : wiz.testInfResult.error || "failed"}
          </span>
        )}
      </div>

      <Line />

      {/* Navigation */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => wiz.goTo("embedding")}
          disabled={!wiz.assignments.chat.model}
          className="text-btn t-body transition active:scale-95"
          style={{ color: "var(--accent)", opacity: !wiz.assignments.chat.model ? 0.3 : 1 }}
        >
          embedding →
        </button>
      </div>
    </div>
  );
}

// ── Model List (nested under server/provider) ────────────────

function ModelList({ wiz, provider }: { wiz: SetupWizardState; provider: string }) {
  const isCloud = provider === "cloud";
  const models = wiz.getInfModels();

  return (
    <div className="pl-4 mt-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="t-micro" style={{ color: "var(--text-faint)" }}>model</span>
        <button
          onClick={wiz.toggleSameForAll}
          className="text-btn t-micro transition"
          style={{ color: "var(--accent)" }}
        >
          {wiz.sameForAll ? "advanced" : "same for all"}
        </button>
      </div>

      {wiz.sameForAll ? (
        <div className="space-y-0.5">
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => wiz.setAllAssignments(m.id, isCloud ? wiz.cloudProvider : wiz.infBackend)}
              className="block w-full text-left py-0.5 transition active:scale-[0.99]"
              style={{ color: wiz.assignments.chat.model === m.id ? "var(--accent)" : "var(--text)", fontSize: 11 }}
            >
              {m.name}{" "}
              <span className="t-micro" style={{ color: "var(--text-faint)" }}>{m.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {COG_FUNCS.map(({ key, label, color }) => (
            <div key={key}>
              <span className="t-micro" style={{ color }}>{label.toLowerCase()}</span>
              <div className="space-y-0 mt-0.5">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => wiz.setFuncAssignment(key, m.id)}
                    className="block w-full text-left py-0 transition"
                    style={{ color: wiz.assignments[key]?.model === m.id ? color : "var(--text-faint)", fontSize: 9 }}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Server Row ───────────────────────────────────────────────────

function ServerRow({
  label,
  desc,
  available,
  running,
  active,
  onSelect,
  onStart,
  starting,
}: {
  label: string;
  desc: string;
  available: boolean;
  running: boolean;
  active: boolean;
  onSelect: () => void;
  onStart: () => void;
  starting: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Dot ok={running} />
      <button
        onClick={onSelect}
        disabled={!available && !running}
        className="t-body transition active:scale-[0.99] disabled:opacity-30"
        style={{ color: active ? "var(--text)" : available ? "var(--text-faint)" : "var(--text-faint)" }}
      >
        {label}
      </button>
      <span className="t-micro" style={{ color: "var(--text-faint)" }}>{desc}</span>
      {available && !running && (
        <button
          onClick={(e) => { e.stopPropagation(); onStart(); }}
          disabled={starting}
          className="text-btn t-micro transition active:scale-95 ml-auto"
          style={{ color: "var(--accent)", opacity: starting ? 0.5 : 1 }}
        >
          {starting ? "starting..." : "start"}
        </button>
      )}
      {running && (
        <span className="t-micro ml-auto" style={{ color: "var(--success)" }}>running</span>
      )}
      {!available && !running && (
        <span className="t-micro ml-auto" style={{ color: "var(--text-faint)" }}>not found</span>
      )}
    </div>
  );
}
