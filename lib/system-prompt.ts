const STORAGE_KEY = "prelude:system-prompt";
const DEFAULT_SYSTEM_PROMPT = "";

export function loadSystemPrompt(): string {
  if (typeof window === "undefined") return DEFAULT_SYSTEM_PROMPT;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SYSTEM_PROMPT;
  } catch {
    return DEFAULT_SYSTEM_PROMPT;
  }
}

export function saveSystemPrompt(prompt: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, prompt);
  } catch {
    // quota exceeded or private browsing
  }
}
