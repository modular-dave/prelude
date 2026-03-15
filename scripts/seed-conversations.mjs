#!/usr/bin/env node
/**
 * Seeds conversations + memories into Supabase via the Prelude API.
 *
 * For each conversation topic:
 *  1. Sends user messages through /api/chat to get real LLM responses
 *     (this also creates episodic memories with embeddings via the chat route)
 *  2. Saves the full conversation to /api/conversations
 *
 * Usage:
 *   node scripts/seed-conversations.mjs          # seed all 25
 *   COUNT=5 node scripts/seed-conversations.mjs  # seed first 5
 */

const BASE = process.env.API_URL || "http://localhost:64582";
const CHAT_API = `${BASE}/api/chat`;
const CONV_API = `${BASE}/api/conversations`;

const CONVERSATIONS = [
  [
    "Hey, I just set up a new Docker compose file for our microservices. Any tips for optimizing container builds?",
    "What about multi-stage builds? We're using Node.js and the images are huge",
    "Makes sense. We also need to set up health checks for Kubernetes. How should we approach that?"
  ],
  [
    "I've been working with React hooks a lot lately. What are the most common pitfalls with useEffect?",
    "Good point about stale closures. What about custom hooks for shared state management?",
    "Should I reach for a state management library like Zustand or just stick with context?"
  ],
  [
    "Our Postgres queries are getting slow as the dataset grows. How should we approach optimization?",
    "We have some N+1 query issues in our ORM layer. Best practices for fixing those?",
    "What about caching strategies? We're looking at Redis for frequently accessed data"
  ],
  [
    "I'm building a REST API with Express and TypeScript. What's the best way to structure the project?",
    "How should I handle error responses consistently across all endpoints?",
    "What about rate limiting and request validation?"
  ],
  [
    "Can you explain TypeScript generics with a practical example?",
    "What about conditional types? I find them hard to reason about",
    "How do mapped types and template literal types work together?"
  ],
  [
    "I'm learning Rust and the borrow checker is giving me a hard time. How does ownership work?",
    "When should I use Arc vs Rc?",
    "What about lifetimes? I keep getting lifetime annotation errors"
  ],
  [
    "Working on a Go service that needs high concurrency. How do goroutines compare to threads?",
    "What patterns should I use for goroutine synchronization?",
    "How do channels work for communication between goroutines?"
  ],
  [
    "We need to set up CI/CD for our monorepo. GitHub Actions or something else?",
    "How do we handle secrets and environment variables securely in the pipeline?",
    "What about feature flags for gradual rollouts?"
  ],
  [
    "I'm debugging a memory leak in our Node.js production service. Where do I start?",
    "The heap snapshots show a growing array of event listeners. How do I trace the source?",
    "What monitoring tools do you recommend for catching these issues early?"
  ],
  [
    "I want to adopt TDD but my team is skeptical. How do I make the case?",
    "What's the right level of test coverage to aim for?",
    "How do you decide between unit tests, integration tests, and e2e tests?"
  ],
  [
    "Building a real-time chat feature with WebSockets. Socket.io or raw WS?",
    "How do we handle reconnection and missed messages?",
    "What about scaling WebSocket connections across multiple server instances?"
  ],
  [
    "We need full-text search in our app. Elasticsearch or something lighter?",
    "How do we keep the search index in sync with our primary database?",
    "What about fuzzy matching and typo tolerance?"
  ],
  [
    "Implementing OAuth 2.0 for our API. What flow should we use for a SPA?",
    "How do we securely store tokens on the client side?",
    "What about refresh token rotation?"
  ],
  [
    "We're migrating from REST to GraphQL. Is it worth the complexity?",
    "How do we prevent N+1 queries with GraphQL resolvers?",
    "What about schema stitching for our microservices?"
  ],
  [
    "Setting up Next.js with SSR for our marketing site. When should I use SSG vs SSR?",
    "How does ISR work and when is it the right choice?",
    "What about edge rendering with middleware?"
  ],
  [
    "Our webpack build takes 3 minutes. How do we speed it up?",
    "Should we migrate to Vite or Turbopack?",
    "What about module federation for our micro-frontends?"
  ],
  [
    "What Git branching strategy works best for a team of 8?",
    "How do you handle long-running feature branches that diverge from main?",
    "What's your take on squash merge vs regular merge commits?"
  ],
  [
    "I'm experimenting with local AI models for code generation. What's the state of the art?",
    "How do embedding models work for semantic search?",
    "What about fine-tuning a small model on our codebase?"
  ],
  [
    "We're considering event sourcing for our order processing system. Good idea?",
    "How do we handle event versioning as the schema evolves?",
    "What about CQRS with event sourcing?"
  ],
  [
    "Deploying to the edge with Cloudflare Workers. What are the limitations?",
    "How do we handle database access from edge functions?",
    "What about caching strategies at the edge?"
  ],
  [
    "I want to improve my Vim workflow. What plugins do you recommend?",
    "How do you set up LSP in Neovim for TypeScript?",
    "What about terminal multiplexing with tmux?"
  ],
  [
    "Building a browser extension for developer productivity. What's the architecture?",
    "How do content scripts communicate with the background service worker?",
    "What about manifest v3 limitations?"
  ],
  [
    "We need to internationalize our React app. What library should we use?",
    "How do we handle right-to-left languages?",
    "What about dynamic locale loading to keep bundle size small?"
  ],
  [
    "I've been running more lately to balance all the coding. Any tips for staying consistent?",
    "I also started cooking more instead of ordering. It's actually relaxing",
    "What books would you recommend for a developer who wants to think more broadly?"
  ],
  [
    "I've been reflecting on my growth as a developer this year. I feel like I've leveled up a lot",
    "I realize I learn best by building things rather than just reading docs",
    "I think my debugging process has gotten way more systematic - reproduce, isolate, hypothesize, verify, fix"
  ],
];

/** Stream a conversation through the chat API, collecting responses */
async function chatConversation(userMessages, conversationId) {
  const allMessages = [];

  for (const content of userMessages) {
    allMessages.push({ role: "user", content });

    try {
      const res = await fetch(CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          conversationId,
          recallLimit: 5,
        }),
      });

      if (!res.ok) {
        allMessages.push({ role: "assistant", content: `[Error: ${res.status}]` });
        continue;
      }

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
            const token = json.choices?.[0]?.delta?.content || json.content || "";
            if (token) fullContent += token;
          } catch {}
        }
      }

      allMessages.push({ role: "assistant", content: fullContent || "[no response]" });
    } catch (err) {
      allMessages.push({ role: "assistant", content: `[Error: ${err.message}]` });
    }
  }

  return allMessages;
}

async function main() {
  const baseTime = new Date("2026-03-01T09:00:00Z");
  const count = parseInt(process.env.COUNT || String(CONVERSATIONS.length), 10);
  let seeded = 0;

  for (let i = 0; i < Math.min(count, CONVERSATIONS.length); i++) {
    const userMsgs = CONVERSATIONS[i];
    const title = userMsgs[0].length > 40 ? userMsgs[0].slice(0, 40) + "..." : userMsgs[0];

    process.stdout.write(`[${i + 1}/${count}] ${title}...`);

    const id = crypto.randomUUID();

    // 1. Chat through the API — creates memories with embeddings + entity extraction
    const messages = await chatConversation(userMsgs, id);

    // 2. Save conversation to Supabase via conversations API
    const convTime = new Date(baseTime.getTime() + i * 8 * 3600_000 + i * 17 * 60_000);
    try {
      const res = await fetch(CONV_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title,
          messages,
          createdAt: convTime.toISOString(),
          updatedAt: new Date(convTime.getTime() + messages.length * 2 * 60_000).toISOString(),
        }),
      });

      if (!res.ok) {
        console.log(` chat OK, but save failed: ${res.status}`);
      } else {
        seeded++;
        console.log(` done (${messages.length} msgs)`);
      }
    } catch (err) {
      console.log(` chat OK, but save failed: ${err.message}`);
    }
  }

  // 3. Create memory links between co-occurring memories (same conversation)
  console.log("Creating memory links from conversation co-occurrence...");
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL || "http://127.0.0.1:54321",
      process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
    );

    // For each conversation, find its memories and link them
    const { data: allMems } = await supabase.from("memories").select("id, tags");
    if (allMems) {
      const convGroups = new Map();
      for (const m of allMems) {
        for (const tag of m.tags || []) {
          if (tag.startsWith("conv:")) {
            if (!convGroups.has(tag)) convGroups.set(tag, []);
            convGroups.get(tag).push(m.id);
          }
        }
      }

      let linkCount = 0;
      for (const [, ids] of convGroups) {
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const { error } = await supabase.from("memory_links").upsert({
              source_id: Math.min(ids[i], ids[j]),
              target_id: Math.max(ids[i], ids[j]),
              link_type: "relates",
              strength: 0.5,
            }, { onConflict: "source_id,target_id,link_type" });
            if (!error) linkCount++;
          }
        }
      }
      console.log(`Created ${linkCount} memory links.`);
    }
  } catch (err) {
    console.log(`Link creation failed: ${err.message}`);
  }

  console.log(`\nDone! ${seeded} conversations seeded.`);
}

main().catch(console.error);
