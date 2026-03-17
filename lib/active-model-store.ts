// ── Per-function model assignment store ─────────────────────────
// In-memory runtime state: survives across requests, resets on server restart.
// Falls back to VENICE_MODEL env var when null.

export type CogFunc = "chat" | "dream" | "reflect";

export interface Assignment {
  model: string;
  provider: string;
}

let assignments: Record<CogFunc, Assignment | null> = {
  chat: null,
  dream: null,
  reflect: null,
};

export function getAssignment(fn: CogFunc): Assignment | null {
  return assignments[fn];
}

export function setAssignment(fn: CogFunc, model: string, provider: string): void {
  assignments[fn] = { model, provider };
}

export function getAllAssignments(): Record<CogFunc, Assignment | null> {
  return { ...assignments };
}

/** Clear any assignments that reference the given model */
export function clearAssignmentsForModel(model: string): void {
  for (const fn of ["chat", "dream", "reflect"] as CogFunc[]) {
    if (assignments[fn]?.model === model) {
      assignments[fn] = null;
    }
  }
}

// ── Backward-compat aliases (used by existing code) ────────────

/** Returns the chat-assigned model, or null */
export function getActiveModel(): string | null {
  return assignments.chat?.model ?? null;
}

/** Sets the chat assignment (provider defaults to "unknown") */
export function setActiveModel(model: string): void {
  assignments.chat = { model, provider: "unknown" };
}
