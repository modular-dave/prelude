import { execSync, spawn } from "child_process";
import path from "path";

const PYTHON = "/Users/dav/.pyenv/versions/lewagon/bin/python";
const SCRIPT = path.join(process.cwd(), "scripts/embedding-server.py");
const DEFAULT_PORT = 11435;
const DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

/** Find PID of embedding server running on our port */
export function findEmbeddingProcess(port = DEFAULT_PORT): number | null {
  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
    const pids = out.split("\n").map(Number).filter(Boolean);
    return pids[0] ?? null;
  } catch {
    return null;
  }
}

/** Check if server is running and healthy */
export async function isEmbeddingServerRunning(
  port = DEFAULT_PORT,
): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Get server status including model and dimensions */
export async function getEmbeddingStatus(
  port = DEFAULT_PORT,
): Promise<{ running: boolean; model?: string; dimensions?: number }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    if (!res.ok) return { running: false };
    const data = await res.json();
    return {
      running: true,
      model: data.model,
      dimensions: data.dimensions,
    };
  } catch {
    return { running: false };
  }
}

// Track spawn state for crash detection
let lastSpawnError: string | null = null;
let spawnExited = false;

export function getSpawnState(): { exited: boolean; error: string | null } {
  return { exited: spawnExited, error: lastSpawnError };
}

/** Spawn MLX embedding server without blocking. Use getSpawnState() + isEmbeddingServerRunning() to poll. */
export function spawnEmbeddingServer(
  model = DEFAULT_MODEL,
  port = DEFAULT_PORT,
): { alreadyRunning: false; spawned: true } | { alreadyRunning: true; spawned: false } | { error: string } {
  lastSpawnError = null;
  spawnExited = false;

  // Kill anything on the port first
  const existingPid = findEmbeddingProcess(port);
  if (existingPid) {
    try { process.kill(existingPid, "SIGTERM"); } catch {}
  }

  console.log(`[embedding] Spawning: ${PYTHON} ${SCRIPT} --model ${model} --port ${port}`);
  try {
    const child = spawn(
      PYTHON,
      [SCRIPT, "--model", model, "--port", String(port)],
      {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderrBuf = "";
    child.stderr?.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      stderrBuf += line + "\n";
      console.error(`[embedding] ${line}`);
    });
    child.stdout?.on("data", (d: Buffer) => console.log(`[embedding] ${d.toString().trim()}`));
    child.on("error", (e) => {
      lastSpawnError = e.message;
      spawnExited = true;
    });
    child.on("exit", (code) => {
      spawnExited = true;
      if (code) {
        lastSpawnError = stderrBuf.trim().split("\n").pop() || `Process exited with code ${code}`;
        console.error(`[embedding] exited with code ${code}`);
      }
    });
    child.unref();
    return { alreadyRunning: false, spawned: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    lastSpawnError = msg;
    spawnExited = true;
    return { error: msg };
  }
}

/** Start MLX embedding server, returns when ready */
export async function startEmbeddingServer(
  model = DEFAULT_MODEL,
  port = DEFAULT_PORT,
): Promise<boolean> {
  // Already running?
  if (await isEmbeddingServerRunning(port)) return true;

  const result = spawnEmbeddingServer(model, port);
  if ("error" in result) return false;
  if (result.alreadyRunning) return true;

  // Wait up to 60s for server to be ready
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    if (await isEmbeddingServerRunning(port)) return true;
    if (spawnExited && lastSpawnError) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Stop the embedding server */
export function stopEmbeddingServer(port = DEFAULT_PORT): boolean {
  const pid = findEmbeddingProcess(port);
  if (!pid) return false;
  try {
    process.kill(pid, "SIGTERM");
    for (let i = 0; i < 20; i++) {
      try {
        process.kill(pid, 0);
        execSync("sleep 0.25");
      } catch {
        return true;
      }
    }
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
    return true;
  } catch {
    return false;
  }
}

/** Send a test embedding request and return dimensions */
export async function testEmbedding(
  port = DEFAULT_PORT,
): Promise<{ ok: boolean; dimensions?: number; error?: string }> {
  return testEmbeddingEndpoint(
    `http://127.0.0.1:${port}/v1`,
    "local",
    "test",
  );
}

/** Test any OpenAI-compatible embedding endpoint */
export async function testEmbeddingEndpoint(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; dimensions?: number; error?: string }> {
  try {
    const url = `${baseUrl.replace(/\/+$/, "")}/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && apiKey !== "local" ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, input: "hello world" }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}${text ? `: ${text.slice(0, 100)}` : ""}` };
    }
    const data = await res.json();
    const dims = data.data?.[0]?.embedding?.length;
    return { ok: true, dimensions: dims };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
