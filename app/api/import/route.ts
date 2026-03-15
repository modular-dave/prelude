import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  storeMemory,
  scoreImportance,
  extractEntities,
  link,
  dream,
  reflect,
  decay,
} from "@/lib/clude";
import type { ParsedConversation } from "@/lib/chatgpt-parser";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { conversations, source = "chatgpt" } = (await req.json()) as {
    conversations: ParsedConversation[];
    source?: string;
  };

  if (!conversations?.length) {
    return new Response(JSON.stringify({ error: "No conversations provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Sort chronologically
  const sorted = [...conversations].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          // stream closed
        }
      };

      const stats = {
        totalConversations: 0,
        totalMemories: 0,
        totalDreams: 0,
        totalReflections: 0,
        totalIdleDays: 0,
      };

      const startTime = Date.now();
      let prevTime: number | null = null;
      let batchConvCount = 0;

      emit("progress", { phase: "starting", total: sorted.length, current: 0 });

      for (let i = 0; i < sorted.length; i++) {
        const conv = sorted[i];
        const convTime = new Date(conv.createdAt).getTime();

        // ── Time gap simulation ──
        if (prevTime !== null) {
          const gapMs = convTime - prevTime;
          const gapHours = gapMs / (1000 * 60 * 60);

          if (gapHours > 6) {
            const dreamCycles = Math.min(Math.floor(gapHours / 6), 20); // cap at 20 per gap
            const reflectCycles = Math.min(Math.floor(gapHours / 24), 5); // cap at 5 per gap
            const gapDays = Math.round(gapHours / 24 * 10) / 10;

            emit("idle", { gapDays, dreamCycles, reflectCycles });

            // Run decay for the idle period
            try {
              await decay();
              emit("decay", { period: `${gapDays} days` });
            } catch {
              // non-critical
            }

            // Dream cycles for idle period
            for (let d = 0; d < dreamCycles; d++) {
              try {
                const result = await dream();
                stats.totalDreams++;
                emit("dream", {
                  batchIndex: i,
                  emergence: (result as any)?.emergence || "",
                  newMemories: (result as any)?.newMemories?.length || 0,
                  idle: true,
                });
              } catch {
                emit("error", { message: `Dream cycle failed during idle gap`, fatal: false });
              }
            }

            // Reflect cycles for idle period
            for (let r = 0; r < reflectCycles; r++) {
              try {
                const result = await reflect();
                stats.totalReflections++;
                emit("reflect", {
                  batchIndex: i,
                  journalMemoryId: (result as any)?.memoryId || null,
                  idle: true,
                });
              } catch {
                emit("error", { message: `Reflection failed during idle gap`, fatal: false });
              }
            }

            stats.totalIdleDays += gapDays;
          }
        }

        prevTime = convTime;

        // ── Store conversation ──
        try {
          await supabase.from("conversations").upsert(
            {
              id: conv.id,
              title: conv.title,
              messages: conv.messages,
              source,
              created_at: conv.createdAt,
              updated_at: conv.updatedAt,
            },
            { onConflict: "id" }
          );
        } catch {
          emit("error", { message: `Failed to store conversation: ${conv.title}`, fatal: false });
          continue;
        }

        // ── Store messages as memories ──
        const memoryIds: number[] = [];

        for (const msg of conv.messages) {
          try {
            let importance = 0.3;
            if (msg.role === "user") {
              importance = await scoreImportance(msg.content).catch(() => 0.5);
            }

            const summary = msg.content.length > 100
              ? msg.content.slice(0, 100) + "..."
              : msg.content;

            const tags = [
              msg.role === "user" ? "user-message" : "assistant-response",
              `conv:${conv.id}`,
              "imported",
            ];

            const memId = await storeMemory({
              type: "episodic",
              content: msg.content,
              summary,
              tags,
              importance,
              source,
            });

            if (memId) {
              memoryIds.push(memId);
              stats.totalMemories++;

              // Extract entities
              await extractEntities(memId, msg.content, summary).catch(() => {});

              emit("memory", {
                conversationIndex: i,
                memoryId: memId,
                role: msg.role,
                importance: Math.round(importance * 100) / 100,
              });
            }
          } catch {
            emit("error", { message: `Failed to store message in: ${conv.title}`, fatal: false });
          }
        }

        // ── Link memories within conversation ──
        for (let a = 0; a < memoryIds.length; a++) {
          for (let b = a + 1; b < memoryIds.length; b++) {
            try {
              await link(memoryIds[a], memoryIds[b], "relates", 0.5);
            } catch {
              // non-critical
            }
          }
        }

        stats.totalConversations++;
        batchConvCount++;

        emit("conversation", {
          index: i,
          title: conv.title,
          messagesCount: conv.messages.length,
          memoriesCreated: memoryIds.length,
          createdAt: conv.createdAt,
        });

        emit("progress", { phase: "importing", total: sorted.length, current: i + 1 });

        // ── Batch dream/reflect: every 10 conversations in active period ──
        if (batchConvCount >= 10) {
          batchConvCount = 0;

          try {
            const result = await dream();
            stats.totalDreams++;
            emit("dream", {
              batchIndex: i,
              emergence: (result as any)?.emergence || "",
              newMemories: (result as any)?.newMemories?.length || 0,
              idle: false,
            });
          } catch {
            emit("error", { message: "Batch dream cycle failed", fatal: false });
          }

          try {
            const result = await reflect();
            stats.totalReflections++;
            emit("reflect", {
              batchIndex: i,
              journalMemoryId: (result as any)?.memoryId || null,
              idle: false,
            });
          } catch {
            emit("error", { message: "Batch reflection failed", fatal: false });
          }
        }
      }

      // Final dream/reflect if there are remaining conversations in the batch
      if (batchConvCount > 0) {
        try {
          const result = await dream();
          stats.totalDreams++;
          emit("dream", {
            batchIndex: sorted.length - 1,
            emergence: (result as any)?.emergence || "",
            newMemories: (result as any)?.newMemories?.length || 0,
            idle: false,
          });
        } catch { /* non-critical */ }

        try {
          const result = await reflect();
          stats.totalReflections++;
          emit("reflect", {
            batchIndex: sorted.length - 1,
            journalMemoryId: (result as any)?.memoryId || null,
            idle: false,
          });
        } catch { /* non-critical */ }
      }

      emit("complete", {
        ...stats,
        elapsed: Date.now() - startTime,
      });

      controller.close();
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
