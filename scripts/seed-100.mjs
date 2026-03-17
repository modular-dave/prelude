#!/usr/bin/env node
/**
 * Seeds 50 conversations via the Prelude chat API.
 * Each conversation is a single user message + assistant response.
 * Runs an introspection (reflect) cycle every 5 chats and a dream cycle every 10.
 * Outputs a JSON file to inject into localStorage.
 */

const BASE = process.env.API_URL || "http://localhost:3000";
const CHAT_API = `${BASE}/api/chat`;
const MEM_API = `${BASE}/api/memories`;
const REFLECT_API = `${BASE}/api/reflect`;
const DREAM_API = `${BASE}/api/dream`;

const TOPICS = [
  "What's the difference between TCP and UDP?",
  "Explain how JWT tokens work",
  "Best practices for React component testing",
  "How does garbage collection work in JavaScript?",
  "What is event-driven architecture?",
  "Explain the CAP theorem simply",
  "When should I use WebSockets vs SSE?",
  "How do database indexes work?",
  "What's the observer pattern?",
  "Explain Docker networking basics",
  "How does DNS resolution work?",
  "What's the difference between SQL and NoSQL?",
  "Explain CORS and why it exists",
  "How do CSS Grid and Flexbox differ?",
  "What is memoization and when to use it?",
  "Explain the event loop in Node.js",
  "What are design tokens in UI systems?",
  "How does HTTP/2 improve on HTTP/1.1?",
  "What is a service mesh?",
  "Explain content-addressable storage",
  "How do bloom filters work?",
  "What is eventual consistency?",
  "Explain the strategy pattern with an example",
  "How does TLS handshake work?",
  "What are Web Workers used for?",
  "Explain the SOLID principles briefly",
  "How does React's reconciliation algorithm work?",
  "What is a message queue and when to use one?",
  "Explain database sharding strategies",
  "What's the difference between threads and processes?",
  "How do progressive web apps work?",
  "What is trunk-based development?",
  "Explain the builder pattern",
  "How does consistent hashing work?",
  "What are edge functions?",
  "Explain OAuth 2.0 authorization code flow",
  "How do CSS custom properties cascade?",
  "What is a reverse proxy?",
  "Explain the actor model for concurrency",
  "How does browser rendering pipeline work?",
  "What is semantic versioning?",
  "Explain rate limiting algorithms",
  "How do virtual threads work in Java?",
  "What is Infrastructure as Code?",
  "Explain the pub/sub pattern",
  "How does hot module replacement work?",
  "What are algebraic data types?",
  "Explain container orchestration basics",
  "How does git rebase differ from merge?",
  "What is the circuit breaker pattern?",
];

async function sendMessage(content, conversationId) {
  const messages = [{ role: "user", content }];

  const res = await fetch(CHAT_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, conversationId, recallLimit: 3 }),
  });

  if (!res.ok) return `[Error: ${res.status}]`;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") break;
      try {
        const json = JSON.parse(data);
        if (json.content) fullContent += json.content;
      } catch {}
    }
  }

  return fullContent || "[no response]";
}

async function storeAssistantMemory(content, conversationId) {
  await fetch(MEM_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "semantic",
      content,
      summary: content.length > 100 ? content.slice(0, 100) + "..." : content,
      tags: ["assistant-response", `conv:${conversationId}`],
      importance: 0.4,
    }),
  });
}

async function runReflect() {
  console.log("\n  🔍 Running introspection (reflect) cycle...");
  try {
    const res = await fetch(REFLECT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ Reflect complete: ${data.journal ? "journal created" : "no output"}`);
    } else {
      const text = await res.text();
      console.log(`  ⚠️  Reflect returned ${res.status}: ${text.slice(0, 120)}`);
    }
  } catch (err) {
    console.log(`  ❌ Reflect error: ${err.message}`);
  }
}

async function runDream() {
  console.log("\n  💭 Running dream cycle...");
  try {
    const res = await fetch(DREAM_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`  ✅ Dream complete: ${data.stats?.totalPhases || 0} phases, ${data.stats?.totalNewMemories || 0} new memories`);
      if (data.emergence) {
        console.log(`  💡 Emergence: ${data.emergence.slice(0, 100)}...`);
      }
    } else {
      const text = await res.text();
      console.log(`  ⚠️  Dream returned ${res.status}: ${text.slice(0, 120)}`);
    }
  } catch (err) {
    console.log(`  ❌ Dream error: ${err.message}`);
  }
}

async function main() {
  const CONCURRENCY = 3;
  const conversations = [];
  const baseTime = new Date("2026-03-01T08:00:00Z");
  let chatsDone = 0;

  console.log(`Seeding ${TOPICS.length} conversations (${CONCURRENCY} concurrent)...`);
  console.log(`  Reflect every 5 chats, Dream every 10 chats\n`);

  for (let batch = 0; batch < TOPICS.length; batch += CONCURRENCY) {
    const slice = TOPICS.slice(batch, batch + CONCURRENCY);
    const promises = slice.map(async (topic, j) => {
      const i = batch + j;
      const id = crypto.randomUUID();
      const title = topic.length > 40 ? topic.slice(0, 40) + "..." : topic;

      process.stdout.write(`  [${i + 1}/${TOPICS.length}] ${title}\n`);

      const response = await sendMessage(topic, id);
      await storeAssistantMemory(response, id);

      const convTime = new Date(baseTime.getTime() + i * 3 * 3600_000 + i * 11 * 60_000);

      return {
        id,
        title,
        messages: [
          { role: "user", content: topic },
          { role: "assistant", content: response },
        ],
        createdAt: convTime.toISOString(),
        updatedAt: new Date(convTime.getTime() + 2 * 60_000).toISOString(),
      };
    });

    const results = await Promise.all(promises);
    conversations.push(...results);
    chatsDone += results.length;

    // Run introspection every 5 chats
    if (chatsDone % 5 === 0 && chatsDone > 0) {
      await runReflect();
    }

    // Run dream cycle every 10 chats
    if (chatsDone % 10 === 0 && chatsDone > 0) {
      await runDream();
    }
  }

  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const { writeFileSync } = await import("fs");
  writeFileSync("/tmp/prelude_50.json", JSON.stringify(conversations, null, 2));
  console.log(`\nDone! ${conversations.length} conversations written to /tmp/prelude_50.json`);
  console.log("Inject into localStorage with:");
  console.log('  localStorage.setItem("prelude:conversations", JSON.stringify(data))');
}

main().catch(console.error);
