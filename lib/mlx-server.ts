import { execSync, spawn } from "child_process";

const PYTHON = "/Users/dav/.pyenv/versions/lewagon/bin/python";
const MLX_SERVER = "/Users/dav/.pyenv/versions/lewagon/bin/mlx_lm.server";
const PORT = 8899;
const LLM_BASE = `http://127.0.0.1:${PORT}`;

/** Find PID of mlx_lm.server running on our port */
export function findMLXProcess(): number | null {
  try {
    const out = execSync(`lsof -ti :${PORT}`, { encoding: "utf-8" }).trim();
    const pids = out.split("\n").map(Number).filter(Boolean);
    return pids[0] ?? null;
  } catch {
    return null;
  }
}

/** Kill the running MLX server */
export function killMLXServer(): boolean {
  const pid = findMLXProcess();
  if (!pid) return false;
  try {
    process.kill(pid, "SIGTERM");
    // Wait briefly for process to die
    for (let i = 0; i < 20; i++) {
      try {
        process.kill(pid, 0); // Check if still alive
        execSync("sleep 0.25");
      } catch {
        return true; // Process is gone
      }
    }
    // Force kill if still alive
    try { process.kill(pid, "SIGKILL"); } catch {}
    return true;
  } catch {
    return false;
  }
}

/** Start MLX server with given model, returns when ready */
export async function startMLXServer(model: string): Promise<boolean> {
  const child = spawn(MLX_SERVER, ["--model", model, "--port", String(PORT)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Wait for server to be ready (up to 60s)
  return waitForServer(60_000);
}

/** Poll server until it responds */
export async function waitForServer(timeout: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${LLM_BASE}/v1/models`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Get the active model from the running server */
export async function getActiveModel(): Promise<string | null> {
  try {
    const res = await fetch(`${LLM_BASE}/v1/models`);
    if (!res.ok) return null;
    const data = await res.json();
    // The first model listed is typically the loaded one
    // But we can also check process args
    const pid = findMLXProcess();
    if (pid) {
      try {
        const cmdline = execSync(`ps -p ${pid} -o args=`, { encoding: "utf-8" }).trim();
        const match = cmdline.match(/--model\s+(\S+)/);
        if (match) return match[1];
      } catch {}
    }
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** List models installed in HuggingFace cache */
export function listInstalledModels(): string[] {
  try {
    const script = `
import json
from huggingface_hub import scan_cache_dir
cache = scan_cache_dir()
models = [r.repo_id for r in cache.repos if 'mlx' in r.repo_id.lower() or any(k in r.repo_id.lower() for k in ['qwen', 'llama', 'gemma', 'smol', 'phi', 'mistral'])]
print(json.dumps(models))
`;
    const out = execSync(`${PYTHON} -c "${script.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    return JSON.parse(out);
  } catch {
    return [];
  }
}

/** Download a model from HuggingFace */
export function installModel(model: string): { success: boolean; error?: string } {
  try {
    execSync(
      `${PYTHON} -c "from huggingface_hub import snapshot_download; snapshot_download('${model.replace(/'/g, "")}')"`,
      { encoding: "utf-8", timeout: 300_000 } // 5 min timeout
    );
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg.slice(0, 200) };
  }
}

/** Uninstall a model from HuggingFace cache */
export function uninstallModel(model: string): { success: boolean; error?: string } {
  try {
    const script = `
from huggingface_hub import scan_cache_dir
cache = scan_cache_dir()
to_delete = []
for repo in cache.repos:
    if repo.repo_id == '${model.replace(/'/g, "")}':
        for rev in repo.revisions:
            to_delete.append(rev.commit_hash)
if to_delete:
    strategy = cache.delete_revisions(*to_delete)
    strategy.execute()
    print('deleted')
else:
    print('not_found')
`;
    const out = execSync(`${PYTHON} -c "${script.replace(/"/g, '\\"')}"`, {
      encoding: "utf-8",
      timeout: 30_000,
    }).trim();
    if (out.includes("not_found")) {
      return { success: false, error: "Model not found in cache" };
    }
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg.slice(0, 200) };
  }
}

/** Check if server is running */
export async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${LLM_BASE}/v1/models`);
    return res.ok;
  } catch {
    return false;
  }
}
