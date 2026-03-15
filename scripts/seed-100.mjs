#!/usr/bin/env node
/**
 * Seeds 100 conversations via the Prelude chat API.
 * Each conversation is a single user message + assistant response.
 * Memories are created server-side (user msg) and via POST (assistant response).
 * Outputs a JSON file to inject into localStorage.
 */

const BASE = process.env.API_URL || "http://localhost:58165";
const CHAT_API = `${BASE}/api/chat`;
const MEM_API = `${BASE}/api/memories`;

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
  "Explain how service workers cache assets",
  "How do column-oriented databases work?",
  "What is the mediator pattern?",
  "Explain zero-downtime deployment strategies",
  "How does the Raft consensus algorithm work?",
  "What are monorepo tools like Turborepo?",
  "Explain functional reactive programming",
  "How do browser extensions communicate internally?",
  "What is domain-driven design?",
  "Explain how map-reduce works",
  "How does prefetching improve web performance?",
  "What is the command pattern?",
  "Explain microservice communication patterns",
  "How do reactive streams work?",
  "What are compile-time guarantees in Rust?",
  "Explain tree shaking in bundlers",
  "How does connection pooling work?",
  "What is property-based testing?",
  "Explain the saga pattern for distributed transactions",
  "How do CSS container queries work?",
  "What is the hexagonal architecture?",
  "Explain how load balancers distribute traffic",
  "How does copy-on-write work?",
  "What are phantom types?",
  "Explain the flyweight pattern",
  "How does browser cookie management work?",
  "What is the strangler fig pattern for migrations?",
  "Explain how async iterators work in JS",
  "How do Kubernetes pods communicate?",
  "What is data locality and why does it matter?",
  "Explain the concept of backpressure",
  "How does image lazy loading work?",
  "What are ADTs in functional programming?",
  "Explain the outbox pattern",
  "How do skip lists work?",
  "What is blue-green deployment?",
  "Explain how Promises chain internally",
  "How does request coalescing work?",
  "What is structural typing vs nominal typing?",
  "Explain how rollback works in databases",
  "How do compression algorithms like gzip work?",
  "What is the repository pattern?",
  "Explain resource hints like preconnect and prefetch",
  "How does optimistic locking work?",
  "What are coroutines?",
  "Explain the concept of idempotency in APIs",
  "How do CSS transitions vs animations differ?",
  "What is a write-ahead log?",
  "Explain how memory-mapped files work",
  "How do GraphQL subscriptions work?",
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

async function main() {
  const CONCURRENCY = 5;
  const conversations = [];
  const baseTime = new Date("2026-03-01T08:00:00Z");

  console.log(`Seeding ${TOPICS.length} conversations (${CONCURRENCY} concurrent)...\n`);

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
  }

  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const { writeFileSync } = await import("fs");
  writeFileSync("/tmp/prelude_100.json", JSON.stringify(conversations, null, 2));
  console.log(`\nDone! ${conversations.length} conversations written to /tmp/prelude_100.json`);
  console.log("Inject into localStorage with:");
  console.log('  localStorage.setItem("prelude:conversations", JSON.stringify(data))');
}

main().catch(console.error);
