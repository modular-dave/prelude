#!/usr/bin/env node
/**
 * Seeds ~10,000 memories via the Prelude chat API.
 * Each conversation is a single user message + assistant response (2 memories each).
 * Runs reflect every 50 chats and dream every 100 chats.
 * 5000 conversations × 2 memories = ~10,000 memories (plus reflect/dream extras).
 */

const BASE = process.env.API_URL || "http://localhost:57542";
const CHAT_API = `${BASE}/api/chat`;
const MEM_API = `${BASE}/api/memories`;
const REFLECT_API = `${BASE}/api/reflect`;
const DREAM_API = `${BASE}/api/dream`;

// 200 diverse topics — cycled with variations to reach 5000 conversations
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
  "How does WebAssembly work?",
  "Explain the difference between REST and GraphQL",
  "What is a B-tree and why databases use them?",
  "How does React Server Components work?",
  "What are microservices anti-patterns?",
  "Explain CQRS pattern",
  "How does browser caching work?",
  "What is a distributed lock?",
  "Explain the flyweight pattern",
  "How do CSS container queries work?",
  "What is a DAG and where is it used?",
  "Explain blue-green deployments",
  "How does gRPC differ from REST?",
  "What is a skip list?",
  "Explain the mediator pattern",
  "How do service workers enable offline apps?",
  "What is domain-driven design?",
  "Explain how vector databases work",
  "How does connection pooling work?",
  "What is a Merkle tree?",
  "Explain the saga pattern for distributed transactions",
  "How does CSS specificity work?",
  "What is feature flagging?",
  "Explain how CDNs work",
  "How does the V8 engine optimize JavaScript?",
  "What is a monorepo and when to use one?",
  "Explain write-ahead logging",
  "How do React hooks work internally?",
  "What is a sidecar pattern?",
  "Explain the difference between concurrency and parallelism",
  "How does QUIC protocol improve networking?",
  "What is a trie data structure?",
  "Explain canary deployments",
  "How do CSS animations vs transitions differ?",
  "What is observability vs monitoring?",
  "Explain how garbage collection works in Go",
  "How does event sourcing work?",
  "What is a load balancer and how does it work?",
  "Explain the proxy pattern",
  "How do React error boundaries work?",
  "What is a WAL in databases?",
  "Explain the bulkhead pattern",
  "How does tree shaking work in bundlers?",
  "What is a red-black tree?",
  "Explain zero-trust architecture",
  "How do WebRTC connections work?",
  "What is the strangler fig pattern?",
  "Explain how Promise.all vs Promise.allSettled differ",
  "How does memory allocation work in Rust?",
  "What is a conflict-free replicated data type?",
  "Explain the outbox pattern",
  // More diverse topics
  "How does neural network backpropagation work?",
  "What is attention mechanism in transformers?",
  "Explain how embeddings capture meaning",
  "How does RAG improve LLM responses?",
  "What is reinforcement learning from human feedback?",
  "Explain the transformer architecture simply",
  "How do diffusion models generate images?",
  "What is fine-tuning vs prompt engineering?",
  "Explain tokenization in NLP",
  "How does beam search work in text generation?",
  "What is transfer learning?",
  "Explain how GANs work",
  "How does batch normalization help training?",
  "What is the vanishing gradient problem?",
  "Explain knowledge distillation",
  "How do convolutional neural networks work?",
  "What is federated learning?",
  "Explain the difference between L1 and L2 regularization",
  "How does dropout prevent overfitting?",
  "What is a variational autoencoder?",
  // Systems topics
  "How does Linux handle memory management?",
  "What is copy-on-write in operating systems?",
  "Explain how file systems work",
  "How does virtual memory work?",
  "What is a context switch?",
  "Explain how CPU caches work",
  "How does memory-mapped I/O work?",
  "What is NUMA architecture?",
  "Explain how SSDs differ from HDDs internally",
  "How does the Linux scheduler work?",
  // Security topics
  "How does end-to-end encryption work?",
  "What is a zero-knowledge proof?",
  "Explain how bcrypt hashes passwords",
  "How do hardware security modules work?",
  "What is homomorphic encryption?",
  "Explain the difference between symmetric and asymmetric encryption",
  "How does certificate pinning work?",
  "What is a timing attack?",
  "Explain how TOTP works for 2FA",
  "How does Shamir's secret sharing work?",
  // Data engineering
  "How does Apache Kafka work?",
  "What is a data lakehouse?",
  "Explain how columnar storage works",
  "How does Apache Spark handle distributed computing?",
  "What is a change data capture pattern?",
  "Explain how data partitioning strategies work",
  "How does a distributed file system work?",
  "What is a materialized view?",
  "Explain the lambda architecture",
  "How does stream processing differ from batch processing?",
  // Frontend topics
  "How does the virtual DOM actually work?",
  "What is incremental static regeneration?",
  "Explain how React Suspense works",
  "How does CSS-in-JS compare to utility classes?",
  "What is a micro-frontend architecture?",
  "Explain how web components work",
  "How does lazy loading images work?",
  "What is the island architecture?",
  "Explain how state machines improve UI logic",
  "How does optimistic UI update work?",
  // DevOps topics
  "How does Kubernetes scheduling work?",
  "What is GitOps?",
  "Explain how Terraform state management works",
  "How do rolling updates work in Kubernetes?",
  "What is a sidecar proxy in Istio?",
  "Explain how Prometheus monitoring works",
  "How does horizontal pod autoscaling work?",
  "What is chaos engineering?",
  "Explain how container images are layered",
  "How does a CI/CD pipeline prevent regressions?",
  // Misc CS topics
  "How does the PageRank algorithm work?",
  "What is the Byzantine Generals Problem?",
  "Explain how Raft consensus works",
  "How does map-reduce work?",
  "What is a bloom filter's false positive rate?",
  "Explain how LSM trees work in databases",
  "How does gossip protocol work in distributed systems?",
  "What is a consistent hash ring?",
  "Explain how lock-free data structures work",
  "How does the Paxos algorithm work?",
];

const VARIATIONS = [
  "",
  "Can you give a practical example?",
  "How does this compare to alternatives?",
  "What are the tradeoffs?",
  "When would you NOT use this?",
  "Explain it like I'm a junior developer",
  "What's the history behind this?",
  "How does this scale in production?",
  "What are common mistakes with this?",
  "Can you explain the internals?",
  "How is this implemented in popular frameworks?",
  "What problems does this solve?",
  "Give me a real-world analogy",
  "What's the performance impact?",
  "How has this evolved over the years?",
  "What's the simplest implementation?",
  "How do you debug issues with this?",
  "What monitoring should I set up for this?",
  "How does this work at Google/Meta scale?",
  "What are security implications?",
  "How would you teach this to a team?",
  "What tooling exists for this?",
  "Compare the top 3 approaches",
  "What's changing about this in 2026?",
  "How does this relate to system design interviews?",
];

function getTopicVariation(index) {
  const topic = TOPICS[index % TOPICS.length];
  const variation = VARIATIONS[Math.floor(index / TOPICS.length) % VARIATIONS.length];
  if (!variation) return topic;
  return `${topic} ${variation}`;
}

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
      importance: 0.3 + Math.random() * 0.4,
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
      console.log(`  ⚠️  Reflect returned ${res.status}`);
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
    } else {
      console.log(`  ⚠️  Dream returned ${res.status}`);
    }
  } catch (err) {
    console.log(`  ❌ Dream error: ${err.message}`);
  }
}

async function main() {
  const TOTAL_CHATS = 5000; // 5000 chats × 2 memories each = ~10,000 memories
  const CONCURRENCY = 1;
  const REFLECT_EVERY = 50;
  const DREAM_EVERY = 100;
  let chatsDone = 0;
  let errors = 0;
  const startTime = Date.now();

  console.log(`\n🧠 Seeding ${TOTAL_CHATS} conversations (~${TOTAL_CHATS * 2} memories)`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Reflect every ${REFLECT_EVERY} chats, Dream every ${DREAM_EVERY} chats\n`);

  for (let batch = 0; batch < TOTAL_CHATS; batch += CONCURRENCY) {
    const batchSize = Math.min(CONCURRENCY, TOTAL_CHATS - batch);
    const promises = [];

    for (let j = 0; j < batchSize; j++) {
      const i = batch + j;
      const topic = getTopicVariation(i);
      const id = crypto.randomUUID();

      promises.push(
        (async () => {
          try {
            const response = await sendMessage(topic, id);
            await storeAssistantMemory(response, id);
            return true;
          } catch (err) {
            errors++;
            return false;
          }
        })()
      );
    }

    await Promise.all(promises);
    chatsDone += batchSize;

    // Progress
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (chatsDone / (elapsed || 1)).toFixed(1);
    const eta = ((TOTAL_CHATS - chatsDone) / (rate || 1)).toFixed(0);
    process.stdout.write(
      `\r  [${chatsDone}/${TOTAL_CHATS}] ${elapsed}s elapsed, ${rate} chats/s, ETA ~${eta}s, ${errors} errors`
    );

    // Reflect cycle
    if (chatsDone % REFLECT_EVERY === 0 && chatsDone > 0) {
      await runReflect();
    }

    // Dream cycle
    if (chatsDone % DREAM_EVERY === 0 && chatsDone > 0) {
      await runDream();
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n✅ Done! ${chatsDone} conversations seeded in ${totalTime}s (${errors} errors)`);
  console.log(`   Approximately ${chatsDone * 2} memories created + reflect/dream extras`);
}

main().catch(console.error);
