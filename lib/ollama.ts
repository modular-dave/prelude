const OLLAMA_BASE = "http://localhost:11434";
const MODEL = "qwen2.5:1.5b";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function streamChat(
  messages: ChatMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, stream: true }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ content: json.message.content })}\n\n`
              )
            );
          }
          if (json.done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        } catch {
          // skip malformed lines
        }
      }
    },
  });
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, stream: false }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.message?.content ?? "";
}
