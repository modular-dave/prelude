import { getActiveModel, getAssignment } from "@/lib/active-model-store";
import { loadEngineConfig } from "@/lib/engine-config";
import { recordMeterEvent } from "@/lib/cortex";
import { resolveBaseUrl, PROVIDER_URLS } from "@/lib/provider-registry";

const DEFAULT_MODEL = process.env.VENICE_MODEL || process.env.LLM_MODEL || "phi3:mini";

export type CogFunc = "chat" | "dream" | "reflect" | "importance" | "entity" | "summarize" | "search";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Resolve LLM base URL based on provider assignment */
function resolveLLMBase(cogFunc: "chat" | "dream" | "reflect" = "chat"): string {
  const assignment = getAssignment(cogFunc as "chat" | "dream" | "reflect");
  if (assignment?.provider) {
    const url = resolveBaseUrl(assignment.provider, "inference");
    if (url) return url;
  }
  // Fallback to env (for hosted providers like Venice/OpenRouter)
  const base = process.env.VENICE_BASE_URL || process.env.LLM_BASE_URL || PROVIDER_URLS.ollama.inference;
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

// Models that don't support the system role — system messages get merged into the first user message
const NO_SYSTEM_ROLE = new Set([
  "mlx-community/gemma-2-2b-it-4bit",
]);

/** Fold system messages into the first user message for models that don't support system role */
function normalizeMessages(messages: ChatMessage[], model: string): ChatMessage[] {
  if (!NO_SYSTEM_ROLE.has(model)) return messages;

  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else {
      rest.push(m);
    }
  }

  if (systemParts.length === 0) return messages;

  // Prepend system content to the first user message
  const firstUserIdx = rest.findIndex((m) => m.role === "user");
  if (firstUserIdx >= 0) {
    rest[firstUserIdx] = {
      ...rest[firstUserIdx],
      content: `${systemParts.join("\n\n")}\n\n${rest[firstUserIdx].content}`,
    };
  } else {
    // No user message — add as user message
    rest.unshift({ role: "user", content: systemParts.join("\n\n") });
  }

  return rest;
}

/** Resolve model for a given cognitive function */
function resolveModel(cogFunc: CogFunc = "chat", explicitModel?: string): string {
  if (explicitModel) return explicitModel;
  const assignment = getAssignment(cogFunc as "chat" | "dream" | "reflect");
  if (assignment?.model) return assignment.model;
  return getActiveModel() || DEFAULT_MODEL;
}

/** Resolve provider for a given cognitive function */
function resolveProvider(cogFunc: CogFunc = "chat"): string {
  const assignment = getAssignment(cogFunc as "chat" | "dream" | "reflect");
  return assignment?.provider || process.env.INFERENCE_CHAT_PROVIDER || "auto";
}

export async function streamChat(
  messages: ChatMessage[],
  opts?: { model?: string; cogFunc?: CogFunc; maxTokens?: number }
): Promise<ReadableStream<Uint8Array>> {
  const cogFunc = opts?.cogFunc || "chat";
  const base = resolveLLMBase(cogFunc as "chat" | "dream" | "reflect");
  const url = `${base}/chat/completions`;
  const resolvedModel = resolveModel(cogFunc, opts?.model);
  const config = loadEngineConfig();
  const maxTokens = opts?.maxTokens || config.chatMaxTokens;
  const normalized = normalizeMessages(messages, resolvedModel);
  const provider = resolveProvider(cogFunc);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.VENICE_API_KEY && process.env.VENICE_API_KEY !== "local"
        ? { Authorization: `Bearer ${process.env.VENICE_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ model: resolvedModel, messages: normalized, stream: true, max_tokens: maxTokens }),
    cache: "no-store",
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM error: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }

  recordMeterEvent("chat_stream", { provider, model: resolvedModel });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n").filter(Boolean)) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          continue;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content })}\n\n`
              )
            );
          }
        } catch {
          // skip malformed lines
        }
      }
    },
  });
}

export async function chat(messages: ChatMessage[], opts?: { model?: string; cogFunc?: CogFunc; maxTokens?: number }): Promise<string> {
  const cogFunc = opts?.cogFunc || "chat";
  const resolvedModel = resolveModel(cogFunc, opts?.model);
  const config = loadEngineConfig();
  const maxTokens = opts?.maxTokens || config.chatMaxTokens;
  const normalized = normalizeMessages(messages, resolvedModel);
  const base = resolveLLMBase(cogFunc as "chat" | "dream" | "reflect");
  const provider = resolveProvider(cogFunc);

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.VENICE_API_KEY && process.env.VENICE_API_KEY !== "local"
        ? { Authorization: `Bearer ${process.env.VENICE_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({ model: resolvedModel, messages: normalized, stream: false, max_tokens: maxTokens }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM error: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }

  recordMeterEvent("chat", { provider, model: resolvedModel });

  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

/** Web search chat via Venice — returns content + citations */
export async function searchChat(
  messages: ChatMessage[],
  opts?: { query?: string; maxTokens?: number }
): Promise<{ content: string; citations: string[] }> {
  try {
    // eslint-disable-next-line no-eval, @typescript-eslint/no-require-imports
    const { createRequire } = eval("require")("module");
    const internalRequire = createRequire(eval("require").resolve("clude-bot"));
    const venice = internalRequire("../core/venice-client");

    if (!venice.isVeniceEnabled()) {
      // Fallback to regular chat
      const content = await chat(messages, opts);
      return { content, citations: [] };
    }

    const result = await venice.generateVeniceResponseWithSearch(messages, {
      query: opts?.query,
      maxTokens: opts?.maxTokens || 1024,
    });

    recordMeterEvent("search_chat", { provider: "venice" });
    return { content: result.content || "", citations: result.citations || [] };
  } catch {
    // Fallback to regular chat
    const content = await chat(messages, opts);
    return { content, citations: [] };
  }
}
