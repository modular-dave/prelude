import { NextRequest, NextResponse } from "next/server";
import { chat, type ChatMessage } from "@/lib/inference";

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };

  const prompt: ChatMessage[] = [
    {
      role: "system",
      content:
        "You create ultra-short topic labels. Reply with ONLY 3-5 words. No sentences. No verbs. Just a noun phrase topic label.",
    },
    {
      role: "user",
      content:
        "Topic label for this chat:\n" +
        messages
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .slice(0, 3)
          .join("\n"),
    },
  ];

  try {
    const summary = await chat(prompt, { cogFunc: "summarize" });
    // Clean up: take first line, remove quotes/punctuation, limit length
    const cleaned = summary
      .split("\n")[0]
      .replace(/^["'\-•*]|["']$/g, "")
      .replace(/[.!,]$/, "")
      .replace(/^(topic|label|summary)[:\s]*/i, "")
      .trim()
      .slice(0, 40);
    return NextResponse.json({ summary: cleaned });
  } catch {
    return NextResponse.json({ summary: "" }, { status: 500 });
  }
}
