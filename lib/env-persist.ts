import fs from "fs";
import path from "path";

/** Path to .env.local — follows symlinks so worktrees write to the real file */
const ENV_PATH = path.resolve(process.cwd(), ".env.local");

/** Parse .env.local into ordered entries (preserves comments and blank lines) */
function parseEnvFile(content: string): { lines: string[]; vars: Map<string, number> } {
  const lines = content.split("\n");
  const vars = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) vars.set(match[1], i);
  }
  return { lines, vars };
}

/** Set one or more env vars in .env.local and process.env */
export function persistEnv(entries: Record<string, string>): void {
  let content = "";
  try {
    content = fs.readFileSync(ENV_PATH, "utf-8");
  } catch { /* file doesn't exist yet — will be created */ }

  const { lines, vars } = parseEnvFile(content);

  for (const [key, value] of Object.entries(entries)) {
    process.env[key] = value;
    const idx = vars.get(key);
    if (idx !== undefined) {
      lines[idx] = `${key}=${value}`;
    } else {
      lines.push(`${key}=${value}`);
      vars.set(key, lines.length - 1);
    }
  }

  // Remove trailing empty lines, add single newline at end
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

/** Remove one or more env vars from .env.local and process.env */
export function removeEnv(keys: string[]): void {
  for (const key of keys) {
    delete process.env[key];
  }

  let content = "";
  try {
    content = fs.readFileSync(ENV_PATH, "utf-8");
  } catch {
    return; // no file, nothing to remove
  }

  const { lines, vars } = parseEnvFile(content);
  const toRemove = new Set<number>();
  for (const key of keys) {
    const idx = vars.get(key);
    if (idx !== undefined) toRemove.add(idx);
  }

  if (toRemove.size === 0) return;

  const filtered = lines.filter((_, i) => !toRemove.has(i));
  while (filtered.length > 0 && filtered[filtered.length - 1] === "") filtered.pop();
  fs.writeFileSync(ENV_PATH, filtered.join("\n") + "\n", "utf-8");
}
