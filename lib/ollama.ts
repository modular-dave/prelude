const LLM_BASE = process.env.LLM_BASE_URL || "http://localhost:8899";
const DEFAULT_MODEL = process.env.LLM_MODEL || "mlx-community/Qwen2.5-0.5B-Instruct-4bit";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function streamChat(
  messages: ChatMessage[],
  model?: string
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${LLM_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, messages, stream: true, max_tokens: 512 }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`LLM error: ${res.status} ${res.statusText}`);
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
  const res = await fetch(`${LLM_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: model || DEFAULT_MODEL, messages, stream: false, max_tokens: 512 }),
  });

  if (!res.ok) {
    throw new Error(`LLM error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}
