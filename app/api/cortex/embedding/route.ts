import { NextResponse } from "next/server";
import { resetCortex, activateEmbeddingSlot } from "@/lib/cortex";
import { persistEnv, removeEnv } from "@/lib/env-persist";
import {
  startEmbeddingServer,
  spawnEmbeddingServer,
  getSpawnState,
  stopEmbeddingServer,
  getEmbeddingStatus,
  isEmbeddingServerRunning,
  testEmbedding,
  testEmbeddingEndpoint,
} from "@/lib/embedding-server";

export async function POST(req: Request) {
  const body = await req.json();
  const { action, model, port } = body as {
    action: "test" | "save" | "start" | "stop" | "status" | "disconnect" | "verify" | "health" | "spawn" | "poll" | "save-key" | "delete-key";
    model?: string;
    port?: number;
  };

  // Save/delete a hosted provider API key
  if (action === "save-key") {
    const { provider: provId, apiKey } = body as { provider: string; apiKey: string };
    if (!provId || !apiKey) {
      return NextResponse.json({ ok: false, error: "provider and apiKey required" }, { status: 400 });
    }
    const envKey = `EMBEDDING_${provId.toUpperCase()}_API_KEY`;
    persistEnv({ [envKey]: apiKey });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete-key") {
    const { provider: provId } = body as { provider: string };
    if (!provId) {
      return NextResponse.json({ ok: false, error: "provider required" }, { status: 400 });
    }
    const envKey = `EMBEDDING_${provId.toUpperCase()}_API_KEY`;
    removeEnv([envKey]);
    return NextResponse.json({ ok: true });
  }

  // Server-side health check using stored credentials (no secrets sent to client)
  if (action === "health") {
    const { slot } = body as { slot: "test" | "publish" };
    const prefix = slot === "test" ? "EMBEDDING_TEST" : "EMBEDDING_PUBLISH";
    const baseUrl = process.env[`${prefix}_BASE_URL`];
    const apiKey = process.env[`${prefix}_API_KEY`] || "";
    const slotModel = process.env[`${prefix}_MODEL`] || "";
    if (!baseUrl || !slotModel) {
      return NextResponse.json({ ok: false, error: "Slot not configured" });
    }
    const result = await testEmbeddingEndpoint(baseUrl, apiKey, slotModel);
    return NextResponse.json(result);
  }

  // Non-blocking spawn + poll for progress
  if (action === "spawn") {
    const p = port ?? 11435;
    const running = await isEmbeddingServerRunning(p);
    if (running) {
      const status = await getEmbeddingStatus(p);
      return NextResponse.json({ ok: true, phase: "ready", ...status });
    }
    const result = spawnEmbeddingServer(model, p);
    if ("error" in result) {
      return NextResponse.json({ ok: false, error: result.error });
    }
    return NextResponse.json({ ok: true, phase: "spawning" });
  }

  if (action === "poll") {
    const p = port ?? 11435;
    const running = await isEmbeddingServerRunning(p);
    if (running) {
      const status = await getEmbeddingStatus(p);
      return NextResponse.json({ ok: true, phase: "ready", ...status });
    }
    const spawn = getSpawnState();
    if (spawn.exited && spawn.error) {
      return NextResponse.json({ ok: false, phase: "crashed", error: spawn.error });
    }
    if (spawn.exited) {
      return NextResponse.json({ ok: false, phase: "crashed", error: "Process exited unexpectedly" });
    }
    return NextResponse.json({ ok: true, phase: "loading" });
  }

  if (action === "status") {
    const status = await getEmbeddingStatus(port);
    return NextResponse.json({ ok: true, ...status });
  }

  if (action === "start") {
    const ok = await startEmbeddingServer(model, port);
    if (!ok) {
      return NextResponse.json({
        ok: false,
        error: "Server failed to start within 60s",
      });
    }
    const status = await getEmbeddingStatus(port);
    return NextResponse.json({ ok: true, ...status });
  }

  if (action === "stop") {
    stopEmbeddingServer(port);
    return NextResponse.json({ ok: true, running: false });
  }

  if (action === "test") {
    const result = await testEmbedding(port);
    return NextResponse.json(result);
  }

  if (action === "verify") {
    const { baseUrl, apiKey: bodyKey, provider: provId } = body as { baseUrl: string; apiKey?: string; provider?: string };
    // Use provided key, or fall back to stored provider key
    const apiKey = bodyKey || (provId ? process.env[`EMBEDDING_${provId.toUpperCase()}_API_KEY`] || "" : "");
    const result = await testEmbeddingEndpoint(baseUrl, apiKey, model || "test");
    return NextResponse.json(result);
  }

  if (action === "disconnect") {
    const { slot } = body as { slot?: "test" | "publish" };
    const suffixes = ["PROVIDER", "BASE_URL", "API_KEY", "MODEL", "DIMENSIONS"];
    if (slot) {
      const prefix = slot === "test" ? "EMBEDDING_TEST" : "EMBEDDING_PUBLISH";
      removeEnv(suffixes.map((s) => `${prefix}_${s}`));
    } else {
      stopEmbeddingServer(port);
      removeEnv([
        ...suffixes.map((s) => `EMBEDDING_${s}`),
        ...suffixes.map((s) => `EMBEDDING_TEST_${s}`),
        ...suffixes.map((s) => `EMBEDDING_PUBLISH_${s}`),
      ]);
    }
    resetCortex();
    return NextResponse.json({ ok: true });
  }

  if (action === "save") {
    const { provider: embProvider, baseUrl, apiKey, dimensions, slot } = body as {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      dimensions?: number;
      slot?: "test" | "publish";
    };
    const p = port ?? 11435;
    const prov = embProvider || "openai";
    const bUrl = baseUrl || `http://127.0.0.1:${p}/v1`;
    const aKey = apiKey || process.env[`EMBEDDING_${prov.toUpperCase()}_API_KEY`] || "local";
    const mod = model || "sentence-transformers/all-MiniLM-L6-v2";
    const dim = String(dimensions || 384);

    if (slot) {
      const prefix = slot === "test" ? "EMBEDDING_TEST" : "EMBEDDING_PUBLISH";
      persistEnv({
        [`${prefix}_PROVIDER`]: prov,
        [`${prefix}_BASE_URL`]: bUrl,
        [`${prefix}_API_KEY`]: aKey,
        [`${prefix}_MODEL`]: mod,
        [`${prefix}_DIMENSIONS`]: dim,
      });
      activateEmbeddingSlot(slot);
    } else {
      persistEnv({
        EMBEDDING_PROVIDER: prov,
        EMBEDDING_BASE_URL: bUrl,
        EMBEDDING_API_KEY: aKey,
        EMBEDDING_MODEL: mod,
        EMBEDDING_DIMENSIONS: dim,
      });
      resetCortex();
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
