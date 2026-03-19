import { NextRequest, NextResponse } from "next/server";
import {
  getActiveModel as getMLXActiveModel,
  listInstalledModels as listMLXModels,
  isServerRunning as isMLXRunning,
  isMLXInstalled,
  killMLXServer,
  startMLXServer,
  installModel as installMLXModel,
  uninstallModel as uninstallMLXModel,
} from "@/lib/mlx-server";
import {
  isOllamaRunning,
  isOllamaInstalled,
  startOllamaServer,
  listOllamaModels,
  getLoadedOllamaModel,
  pullOllamaModel,
  deleteOllamaModel,
} from "@/lib/ollama-manager";
import {
  getActiveModel,
  setActiveModel,
  setAssignment,
  getAllAssignments,
  clearAssignmentsForModel,
  type CogFunc,
} from "@/lib/active-model-store";
import { swapVeniceModel, resetCortex } from "@/lib/cortex";

const CONFIGURED_MODEL = process.env.VENICE_MODEL || null;

/** Resolve the actual active Ollama model.
 *  Priority: in-memory override → loaded in Ollama memory → env var (if installed) → first installed */
async function resolveOllamaActive(installed: string[]): Promise<string | null> {
  const overridden = getActiveModel();
  if (overridden && installed.includes(overridden)) return overridden;

  const loaded = await getLoadedOllamaModel();
  if (loaded && installed.includes(loaded)) return loaded;

  if (CONFIGURED_MODEL && installed.includes(CONFIGURED_MODEL)) return CONFIGURED_MODEL;

  return installed[0] || null;
}

// ── GET /api/models?provider= ──────────────────────────────────
// provider=ollama  → Ollama-specific: installed models + binary/running status
// provider=mlx     → MLX-specific: installed models + binary/running status
// (none)           → auto-detect active provider (backward compat)

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");

  try {
    if (provider === "ollama") {
      const running = await isOllamaRunning();
      const binaryInstalled = running || isOllamaInstalled();
      const installed = running ? await listOllamaModels() : [];
      const active = await resolveOllamaActive(installed);
      return NextResponse.json({ installed, active, running, binaryInstalled, provider: "ollama" });
    }

    if (provider === "mlx") {
      const [installed, active, running] = await Promise.all([
        listMLXModels(),
        getMLXActiveModel(),
        isMLXRunning(),
      ]);
      const binaryInstalled = running || isMLXInstalled();
      return NextResponse.json({ installed, active, running, binaryInstalled, provider: running ? "mlx" : null });
    }

    // ── Auto-detect (no provider param) ────────────────────────
    const assignments = getAllAssignments();
    const ollamaUp = await isOllamaRunning();
    if (ollamaUp) {
      const installed = await listOllamaModels();
      const active = await resolveOllamaActive(installed);
      return NextResponse.json({ installed, active, running: true, provider: "ollama", assignments });
    }

    const [installed, active, running] = await Promise.all([
      listMLXModels(),
      getMLXActiveModel(),
      isMLXRunning(),
    ]);
    return NextResponse.json({ installed, active, running, provider: running ? "mlx" : null, assignments });
  } catch {
    return NextResponse.json({ installed: [], active: null, running: false, provider: null, assignments: getAllAssignments() });
  }
}

// ── POST /api/models ───────────────────────────────────────────
// Body: { action: "switch"|"install"|"uninstall"|"start", model?: string, provider?: string }

export async function POST(req: NextRequest) {
  const { action, model, provider, cognitiveFunction } = (await req.json()) as {
    action: string;
    model?: string;
    provider?: string;
    cognitiveFunction?: CogFunc;
  };

  // ── Stop server ────────────────────────────────────────────────
  if (action === "stop") {
    if (provider === "ollama") {
      try {
        const { execSync } = await import("child_process");
        execSync("pkill -f 'ollama serve'", { timeout: 5000 });
      } catch {}
      return NextResponse.json({ ok: true });
    }
    killMLXServer();
    return NextResponse.json({ ok: true });
  }

  // ── Start server (no model required) ─────────────────────────
  if (action === "start") {
    if (provider === "ollama") {
      const already = await isOllamaRunning();
      if (already) return NextResponse.json({ ok: true });
      const ready = await startOllamaServer();
      if (!ready) {
        return NextResponse.json({ error: "Ollama failed to start. Is it installed?" }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    const mlxModel = model || listMLXModels()[0];
    if (!mlxModel) {
      return NextResponse.json({ error: "No MLX models installed. Install a model first." }, { status: 400 });
    }
    killMLXServer();
    const ready = await startMLXServer(mlxModel);
    if (!ready) {
      return NextResponse.json({ error: "MLX server failed to start within timeout" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, model });
  }

  if (!model) {
    return NextResponse.json({ error: "model required" }, { status: 400 });
  }

  // ── Ollama provider ──────────────────────────────────────────
  if (provider === "ollama") {
    if (action === "switch") {
      const fn = cognitiveFunction || "chat";
      setAssignment(fn, model, "ollama");
      resetCortex(); // Re-init Cortex with correct provider URL
      if (fn === "dream" || fn === "reflect") {
        swapVeniceModel(model);
      }
      return NextResponse.json({ ok: true, model, cognitiveFunction: fn, assignments: getAllAssignments() });
    }
    if (action === "install") {
      const result = await pullOllamaModel(model);
      if (!result.success) {
        return NextResponse.json({ error: result.error || "Pull failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, model });
    }
    if (action === "uninstall") {
      const result = await deleteOllamaModel(model);
      if (!result.success) {
        return NextResponse.json({ error: result.error || "Delete failed" }, { status: 500 });
      }
      clearAssignmentsForModel(model);
      return NextResponse.json({ ok: true, model, assignments: getAllAssignments() });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // ── MLX provider (default) ───────────────────────────────────
  if (action === "switch") {
    const fn = cognitiveFunction || "chat";
    setAssignment(fn, model, provider || "mlx");
    resetCortex(); // Re-init Cortex with correct provider URL
    if (fn === "dream" || fn === "reflect") {
      swapVeniceModel(model);
    }
    // For local MLX chat switches, also restart the MLX server with the new model
    if ((provider === "mlx" || !provider) && fn === "chat") {
      try {
        killMLXServer();
        const ready = await startMLXServer(model);
        if (!ready) {
          return NextResponse.json({ error: "Server failed to start within timeout" }, { status: 502 });
        }
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Failed to switch model" },
          { status: 500 },
        );
      }
    }
    return NextResponse.json({ ok: true, model, cognitiveFunction: fn, assignments: getAllAssignments() });
  }
  if (action === "install") {
    const result = installMLXModel(model);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Install failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, model });
  }
  if (action === "uninstall") {
    const result = uninstallMLXModel(model);
    if (!result.success) {
      return NextResponse.json({ error: result.error || "Uninstall failed" }, { status: 500 });
    }
    clearAssignmentsForModel(model);
    return NextResponse.json({ ok: true, model, assignments: getAllAssignments() });
  }

  return NextResponse.json({ error: "Invalid action. Use: start, switch, install, uninstall" }, { status: 400 });
}
