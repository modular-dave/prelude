/**
 * Ollama native API management.
 * Uses the Ollama REST API at http://127.0.0.1:11434/api/...
 * (NOT the OpenAI-compatible /v1/ endpoint)
 */

import { execSync, spawn } from "child_process";
import { PORTS } from "@/lib/provider-registry";

const OLLAMA_HOST = process.env.OLLAMA_HOST || `http://127.0.0.1:${PORTS.ollama}`;
const OLLAMA_API = `${OLLAMA_HOST}/api`;

/** Check if the ollama binary is installed on this machine */
export function isOllamaInstalled(): boolean {
  try {
    execSync("which ollama", { encoding: "utf-8", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Start the Ollama server daemon, returns true when ready */
export async function startOllamaServer(): Promise<boolean> {
  try {
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    // Wait for server to be ready (up to 15s)
    const start = Date.now();
    while (Date.now() - start < 15_000) {
      try {
        const res = await fetch(`${OLLAMA_API}/tags`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) return true;
      } catch { /* server not ready yet — expected during polling */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  } catch (e) {
    console.warn("[ollama] Failed to start:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Check if the Ollama daemon is reachable */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_API}/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** List models installed in Ollama */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_API}/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

/** Get the model currently loaded in Ollama's memory (if any) */
export async function getLoadedOllamaModel(): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_API}/ps`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const models = data.models || [];
    return models.length > 0 ? models[0].name : null;
  } catch {
    return null;
  }
}

/** Pull (download/install) a model via Ollama */
export async function pullOllamaModel(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${OLLAMA_API}/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: false }),
      signal: AbortSignal.timeout(600_000), // 10 min
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, error: body.slice(0, 200) || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg.slice(0, 200) };
  }
}

/** Delete (uninstall) a model from Ollama */
export async function deleteOllamaModel(
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${OLLAMA_API}/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { success: false, error: body.slice(0, 200) || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg.slice(0, 200) };
  }
}
