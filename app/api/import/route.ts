import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { dream, reflect, decay } from "@/lib/clude";
import { processConversationMessage } from "@/lib/memory-pipeline";
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
            const dreamCycles = Math.min(Math.floor(gapHours / 6), 20);
            const reflectCycles = Math.min(Math.floor(gapHours / 24), 5);
            const gapDays = Math.round(gapHours / 24 * 10) / 10;

            emit("idle", { gapDays, dreamCycles, reflectCycles });

            try {
              await decay();
              emit("decay", { period: `${gapDays} days` });
            } catch {
              // non-critical
            }

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
                emit("error", { message: "Dream cycle failed during idle gap", fatal: false });
              }
            }

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
                emit("error", { message: "Reflection failed during idle gap", fatal: false });
              }
            }

            stats.totalIdleDays += gapDays;
          }
        }

        prevTime = convTime;

        // ── Store conversation record ──
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

        // ── Process messages through shared Cortex pipeline ──
        const memoryIds: number[] = [];

        for (const msg of conv.messages) {
          try {
            const memId = await processConversationMessage({
              role: msg.role as "user" | "assistant",
              content: msg.content,
              conversationId: conv.id,
              source,
              linkToIds: memoryIds.length > 0 ? [memoryIds[memoryIds.length - 1]] : undefined,
            });

            if (memId) {
              memoryIds.push(memId);
              stats.totalMemories++;

              emit("memory", {
                conversationIndex: i,
                memoryId: memId,
                role: msg.role,
              });
            }
          } catch {
            emit("error", { message: `Failed to store message in: ${conv.title}`, fatal: false });
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

        // ── Batch dream/reflect every 10 conversations ──
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

      // Final dream/reflect for remaining batch
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
