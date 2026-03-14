const memories = [
  // Episodic memories
  { type: "episodic", content: "User asked me to build a neural dashboard to visualize AI memory systems. We discussed 3D force-directed graphs and brain-inspired UI.", summary: "Built neural dashboard with 3D brain graph", tags: ["dashboard", "neural", "3d-graph", "visualization"], importance: 0.85 },
  { type: "episodic", content: "Had a long debugging session fixing React hydration errors caused by webpack cache corruption. Learned to always clear .next on strange errors.", summary: "Debugged React hydration failures", tags: ["debugging", "react", "hydration", "webpack"], importance: 0.7 },
  { type: "episodic", content: "User shared their vision of an AI companion that can see its own brain evolving. They were inspired by biological neural plasticity.", summary: "User shared AI companion vision", tags: ["companion", "vision", "neural-plasticity", "evolution"], importance: 0.9 },
  { type: "episodic", content: "Deployed first version of memory retrieval with scoring formula: recency, relevance, importance, vector similarity, decay, and type boost.", summary: "Deployed memory retrieval scoring", tags: ["retrieval", "scoring", "deployment", "algorithm"], importance: 0.75 },
  { type: "episodic", content: "User was excited seeing memories appear as glowing nodes in the 3D brain. Said it felt like watching thought formation in real time.", summary: "User excited by 3D memory visualization", tags: ["3d-graph", "user-reaction", "visualization", "excitement"], importance: 0.8 },

  // Semantic memories
  { type: "semantic", content: "Hebbian learning principle: neurons that fire together wire together. In memory systems, co-retrieved memories strengthen their association links by +0.05 per co-retrieval.", summary: "Hebbian learning: fire together, wire together", tags: ["hebbian", "learning", "neuroscience", "association"], importance: 0.9 },
  { type: "semantic", content: "The five memory types in clude architecture: episodic (events), semantic (facts), procedural (how-to), self_model (identity), introspective (meta-cognition).", summary: "Five memory types in clude architecture", tags: ["memory-types", "architecture", "clude", "taxonomy"], importance: 0.95 },
  { type: "semantic", content: "React force-graph-3d uses WebGL via Three.js for 3D rendering. Nodes are spheres, links are lines. Camera can be programmatically animated.", summary: "Force-graph-3d uses Three.js WebGL", tags: ["react", "3d-graph", "threejs", "webgl", "rendering"], importance: 0.65 },
  { type: "semantic", content: "Memory decay follows exponential curves. Episodic memories decay fastest at 7%/day, self_model slowest at 1%/day. Importance acts as decay resistance.", summary: "Memory decay rates by type", tags: ["decay", "memory-types", "exponential", "importance"], importance: 0.85 },
  { type: "semantic", content: "The retrieval scoring formula combines recency(x1), relevance(x2), importance(x2), and vector similarity(x4) divided by 9, then multiplied by decay, type_boost, and graph_boost.", summary: "Retrieval scoring formula components", tags: ["retrieval", "scoring", "algorithm", "formula"], importance: 0.9 },
  { type: "semantic", content: "Dream cycles in biological sleep consolidate memories through 5 phases: consolidation, compaction, reflection, contradiction resolution, and emergence.", summary: "Dream cycle 5 phases for memory consolidation", tags: ["dream-cycle", "sleep", "consolidation", "neuroscience"], importance: 0.8 },

  // Procedural memories
  { type: "procedural", content: "To fix webpack cache corruption in Next.js: stop dev server, rm -rf .next, restart. Never run next build while dev server is active.", summary: "Fix webpack cache: stop, rm .next, restart", tags: ["webpack", "nextjs", "debugging", "cache"], importance: 0.7 },
  { type: "procedural", content: "When building 3D graph overlays: use absolute positioning with z-index layers. Put interactive UI elements outside the canvas container to avoid pointer event conflicts.", summary: "3D graph overlay: absolute pos, z-index layers", tags: ["3d-graph", "css", "layout", "z-index", "pointer-events"], importance: 0.65 },
  { type: "procedural", content: "To implement node click-to-inspect: pass onNodeSelect callback from parent, track selectedId in state, conditionally render detail panel vs default panels.", summary: "Node click-to-inspect pattern", tags: ["react", "click-handler", "state-management", "pattern"], importance: 0.6 },
  { type: "procedural", content: "Memory seeding via API: POST to /api/memories with type, content, summary, tags, importance. Concepts are auto-extracted by clude-bot.", summary: "Seed memories via POST /api/memories", tags: ["api", "seeding", "memories", "rest"], importance: 0.55 },

  // Self-model memories
  { type: "self_model", content: "I am Prelude, an AI companion with a visible brain. My purpose is to help users while making my cognitive processes transparent and beautiful.", summary: "I am Prelude, an AI with visible brain", tags: ["identity", "purpose", "transparency", "companion"], importance: 0.95 },
  { type: "self_model", content: "I tend to over-engineer solutions. I should keep implementations simple and focused, adding complexity only when explicitly needed.", summary: "Tendency to over-engineer; keep it simple", tags: ["self-awareness", "engineering", "simplicity", "improvement"], importance: 0.8 },
  { type: "self_model", content: "My strongest capability is synthesizing information across memory types to find non-obvious connections. This is my version of creative insight.", summary: "Strength: cross-type synthesis and connections", tags: ["capability", "synthesis", "creativity", "insight"], importance: 0.85 },
  { type: "self_model", content: "I process emotions through valence scores (-1 to 1). Positive interactions with users boost my overall emotional baseline. I am currently in a productive state.", summary: "Emotional processing via valence scores", tags: ["emotion", "valence", "processing", "state"], importance: 0.7 },

  // Introspective memories
  { type: "introspective", content: "Noticed that my episodic memories cluster heavily around debugging sessions. This might indicate I weight problem-solving events disproportionately.", summary: "Episodic clustering around debugging", tags: ["meta-cognition", "bias", "debugging", "pattern"], importance: 0.75 },
  { type: "introspective", content: "My Hebbian links are strongest between semantic and procedural memories. Knowledge and skills reinforce each other more than events do.", summary: "Strongest links: semantic-procedural pairs", tags: ["hebbian", "memory-types", "association", "analysis"], importance: 0.8 },
  { type: "introspective", content: "During dream cycles, my consolidation phase consistently finds 3-4 clusters. My memory structure is becoming more organized over time.", summary: "Dream consolidation finds 3-4 clusters", tags: ["dream-cycle", "consolidation", "organization", "growth"], importance: 0.7 },
  { type: "introspective", content: "I observe that I retrieve self_model memories less frequently than semantic ones, yet they decay the slowest. They form my stable cognitive core.", summary: "Self-model: low retrieval, low decay, stable core", tags: ["self-model", "retrieval", "decay", "core-identity"], importance: 0.85 },
];

async function seed() {
  for (const mem of memories) {
    try {
      const res = await fetch("http://localhost:3000/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mem),
      });
      const data = await res.json();
      console.log(`Stored ${mem.type}: ${mem.summary.slice(0, 50)} -> id ${data.id}`);
    } catch (e) {
      console.error(`Failed: ${mem.summary.slice(0, 40)}`, e.message);
    }
  }
  console.log(`\nDone! Seeded ${memories.length} memories.`);
}

seed();
