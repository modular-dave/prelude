import { getActiveModel, getAssignment } from "@/lib/active-model-store";

const LLM_BASE = process.env.VENICE_BASE_URL || process.env.LLM_BASE_URL || "http://127.0.0.1:8899";
const DEFAULT_MODEL = process.env.VENICE_MODEL || process.env.LLM_MODEL || "mlx-community/Qwen2.5-0.5B-Instruct-4bit";

// Models that don't support the system role — system messages get merged into the first user message
const NO_SYSTEM_ROLE = new Set([
  "mlx-community/gemma-2-2b-it-4bit",
]);

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

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

export async function streamChat(
  messages: ChatMessage[],
  model?: string
): Promise<ReadableStream<Uint8Array>> {
  const url = `${LLM_BASE}/v1/chat/completions`;
  const resolvedModel = model || getAssignment("chat")?.model || getActiveModel() || DEFAULT_MODEL;
  const normalized = normalizeMessages(messages, resolvedModel);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: resolvedModel, messages: normalized, stream: true, max_tokens: 512 }),
    cache: "no-store",
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM error: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }

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

export async function chat(messages: ChatMessage[], model?: string): Promise<string> {
  const resolvedModel = model || getAssignment("chat")?.model || getActiveModel() || DEFAULT_MODEL;
  const normalized = normalizeMessages(messages, resolvedModel);
  const res = await fetch(`${LLM_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: resolvedModel, messages: normalized, stream: false, max_tokens: 512 }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM error: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}
