export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  summary?: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function saveConversation(conv: Conversation): Promise<Conversation> {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(conv),
  });
  return res.json();
}

export async function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, "title" | "summary" | "messages">>
): Promise<Conversation> {
  const res = await fetch(`/api/conversations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`/api/conversations/${id}`, { method: "DELETE" });
}

export async function clearAllConversations(): Promise<void> {
  // Fetch all conversation IDs and delete each
  const convs = await loadConversations();
  await Promise.all(convs.map((c) => deleteConversation(c.id)));
}

export function generateTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  const text = first.content.trim();
  return text.length > 40 ? text.slice(0, 40) + "..." : text;
}
