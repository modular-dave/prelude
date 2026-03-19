import { NextRequest } from "next/server";
import {
  spawnInstallModel as spawnMLXInstall,
} from "@/lib/mlx-server";
import {
  isOllamaRunning,
  startOllamaServer,
} from "@/lib/ollama-manager";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

/**
 * GET /api/models/install?model=X&provider=Y
 * Streams download progress via SSE.
 *
 * Events:
 *   data: {"status":"downloading","completed":123456,"total":789012,"percent":15.6}
 *   data: {"status":"done"}
 *   data: {"status":"error","error":"..."}
 */
export async function GET(req: NextRequest) {
  const model = req.nextUrl.searchParams.get("model");
  const provider = req.nextUrl.searchParams.get("provider") || "ollama";

  if (!model) {
    return new Response(JSON.stringify({ error: "model required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (provider === "ollama") {
    // Auto-start Ollama if not running (pulling requires the server)
    const running = await isOllamaRunning();
    if (!running) {
      const started = await startOllamaServer();
      if (!started) {
        return new Response(
          JSON.stringify({ error: "Ollama server failed to start. Is Ollama installed?" }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    return streamOllamaPull(model);
  }

  // MLX: no streaming support, just run synchronously and send done/error
  return streamMLXInstall(model);
}

function streamOllamaPull(model: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: model, stream: true }),
          signal: AbortSignal.timeout(600_000),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          send({ status: "error", error: body || `HTTP ${res.status}` });
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          send({ status: "error", error: "No response body" });
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.total && json.completed !== undefined) {
                const percent = Math.round((json.completed / json.total) * 1000) / 10;
                send({
                  status: "downloading",
                  completed: json.completed,
                  total: json.total,
                  percent,
                  digest: json.digest || undefined,
                });
              } else if (json.status) {
                // Forward status messages like "verifying sha256 digest", "writing manifest", "success"
                send({ status: json.status });
              }
            } catch {
              // skip malformed lines
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.status) send({ status: json.status });
          } catch {}
        }

        send({ status: "done" });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        send({ status: "error", error: msg.slice(0, 200) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function streamMLXInstall(model: string): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream may be closed
        }
      };

      send({ status: "downloading", percent: 0 });

      spawnMLXInstall(
        model,
        (progress) => send(progress),
        () => controller.close(),
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
