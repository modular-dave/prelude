// ChatGPT export parser — transforms conversations.json into Prelude format

export interface ParsedConversation {
  id: string;
  title: string;
  messages: { role: "user" | "assistant"; content: string }[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

interface ChatGPTNode {
  id: string;
  message: {
    author: { role: string };
    content: { content_type: string; parts: (string | null)[] };
    create_time: number | null;
  } | null;
  parent: string | null;
  children: string[];
}

interface ChatGPTConversation {
  id: string;
  title: string;
  create_time: number;
  update_time: number;
  current_node: string;
  mapping: Record<string, ChatGPTNode>;
}

/**
 * Extract a linear message thread from the ChatGPT tree structure.
 * Walks from current_node backward via parent pointers, then reverses.
 */
function extractThread(
  mapping: Record<string, ChatGPTNode>,
  currentNode: string
): { role: "user" | "assistant"; content: string }[] {
  const path: { role: "user" | "assistant"; content: string }[] = [];
  let nodeId: string | null = currentNode;

  while (nodeId) {
    const node: any = mapping[nodeId]; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!node) break;

    if (
      node.message &&
      (node.message.author.role === "user" || node.message.author.role === "assistant") &&
      node.message.content?.parts
    ) {
      const text = node.message.content.parts
        .filter((p: any): p is string => typeof p === "string" && p.length > 0) // eslint-disable-line @typescript-eslint/no-explicit-any
        .join("\n");

      if (text.trim()) {
        path.push({
          role: node.message.author.role as "user" | "assistant",
          content: text,
        });
      }
    }

    nodeId = node.parent;
  }

  return path.reverse();
}

/**
 * Parse ChatGPT conversations.json into Prelude format.
 * Returns conversations sorted chronologically (oldest first).
 */
export function parseConversations(raw: unknown[]): ParsedConversation[] {
  const results: ParsedConversation[] = [];

  for (const item of raw) {
    const conv = item as ChatGPTConversation;
    if (!conv.mapping || !conv.current_node) continue;

    const messages = extractThread(conv.mapping, conv.current_node);
    if (messages.length === 0) continue;

    results.push({
      id: conv.id,
      title: conv.title || "Untitled",
      messages,
      createdAt: new Date((conv.create_time || 0) * 1000).toISOString(),
      updatedAt: new Date((conv.update_time || conv.create_time || 0) * 1000).toISOString(),
    });
  }

  // Sort chronologically (oldest first)
  results.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return results;
}
