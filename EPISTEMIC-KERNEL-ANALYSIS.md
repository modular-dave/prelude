# Epistemic Memory Kernel: Deep Analysis

## Part I — Prompt Analysis

### What the prompt proposes

A **memory kernel layer** between Cortex and storage that introduces:

1. **Provenance-aware message typing** — every chat message and memory carries `origin`, `validation_state`, `visibility`, and `reinforcement_eligibility`
2. **Domain-separated memory space** — three irreducible domains: `WORLD`, `SELF`, `OTHER`
3. **Reinforcement admissibility matrix** — Hebbian updates gated by domain compatibility: `A(other, self) ≈ 0`
4. **Immutable provenance** — origin/actor/validation_state cannot be erased by consolidation
5. **Domain-specific decay** — self decays slowest, other decays fastest unless reinforced
6. **Cross-domain promotion rules** — not weights, but structural gates: `other → world` requires repeated evidence + external validation
7. **Self-model isolation** — protected subgraph, only writable by internal reasoning + validated world knowledge
8. **Domain-aware retrieval** — factual queries favor world, preference queries favor other(user), reasoning favors self

### Why it's correct

The prompt identifies the **actual architectural flaw**: Prelude's chat and memory pipeline treats all signals as epistemically equal. A user assertion, a tool result, an internal dream output, and a cross-checked fact all enter the same flat `episodic` memory pool with no structural differentiation. The Hebbian reinforcement (`boost_link_strength`) treats all co-retrieved memories equally regardless of provenance.

The key insight — **behavior emerges from constraints, not from weights** — means the system should not try to tune parameters to prevent identity contamination. It should make identity contamination structurally impossible through domain separation and admissibility rules.

### What's novel vs. known

| Concept | Status | Source |
|---------|--------|--------|
| Provenance tracking on memories | Known (Park et al. 2023 evidence_ids) | Academic |
| Domain separation (world/self/other) | Novel as applied to agent memory | Original |
| Reinforcement admissibility matrix | Novel | Original |
| Immutable provenance | Known in audit/compliance systems | Enterprise |
| Cross-domain promotion rules | Novel as replacement for confidence weights | Original |
| Self-model as protected subgraph | Novel | Original |
| Chat message typing with epistemic metadata | Known in philosophy of mind, novel in AI systems | Hybrid |

The **core innovation** is the admissibility matrix: treating domain boundaries as structural constraints rather than soft weights. This is philosophically closer to Kantian categories than to connectionist learning — which is the right choice for an identity-preserving system.

---

## Part II — Current Codebase State

### What exists today

**Memory schema** (`memories` table):
- `memory_type`: episodic | semantic | procedural | self_model | introspective
- `source`: mention | market | consolidation | reflection | emergence
- `related_user`: X user ID (optional)
- `emotional_valence`: -1 to 1 (stored but unused in retrieval/consolidation)
- `tags[]`: includes `user-message`, `assistant-response`, `conv:{id}`
- `evidence_ids[]`: backward traceability (Park et al.)
- `metadata`: JSONB (unused)

**Chat message type** (`ChatMessage`):
```typescript
{ role: "user" | "assistant", content: string }
```
No origin, no validation, no visibility, no reinforcement eligibility.

**Memory storage pipeline** (`memory-pipeline.ts`):
- User messages → `episodic` with LLM-scored importance
- Assistant messages → `episodic` with fixed 0.3 importance
- No origin classification beyond the `user-message`/`assistant-response` tag
- No domain assignment
- No provenance metadata

**Retrieval** (`recallMemories`):
- Vector similarity search
- Filters: types, minImportance, minDecay
- No domain-aware scoring
- No provenance-aware ranking

**Reinforcement** (`boost_link_strength`):
- Flat Hebbian: boost all links between co-retrieved memories equally
- No admissibility gating
- No domain check

**Dream cycles** (Cortex SDK):
- consolidation → compact → reflect → resolve contradictions → emerge
- No emotional modulation
- No provenance preservation guarantee
- No domain-aware consolidation rules

### What's partially present

| Your concept | Current implementation | Gap |
|-------------|----------------------|-----|
| Origin tracking | `source` field exists (mention, market, consolidation, reflection, emergence) | Missing: external_user, external_tool, internal_reasoning, internal_dream, system_instruction |
| Actor separation | `related_user` field exists | Single field, not first-class actor nodes |
| Validation state | None | Completely absent |
| Domain assignment | `memory_type` partially maps (self_model ≈ SELF) | No WORLD/OTHER distinction; episodic is undifferentiated |
| Reinforcement gating | None | Flat Hebbian everywhere |
| Immutable provenance | `source` can be overwritten | No immutability constraint |
| Self-model protection | `self_model` memory type exists | No write-protection; any process can create self_model memories |

---

## Part III — Harmonization Analysis

### Layer 1: What maps cleanly (no Cortex modification needed)

**1. Chat message typing**

Current:
```typescript
interface ChatMessage { role: "user" | "assistant"; content: string }
```

Target:
```typescript
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  origin: Origin;
  validation_state: ValidationState;
  visibility: Visibility;
  reinforcement_eligibility: ReinforcementEligibility;
}
```

**Insertion point**: `lib/chat-store.ts` + `lib/ollama.ts`. The chat types are Prelude-owned, not Cortex-owned. This is a pure UI/API layer change.

**2. Memory pipeline provenance injection**

Current (`memory-pipeline.ts`):
```typescript
storeMemory({ type: "episodic", content, summary, tags, importance, source })
```

Target:
```typescript
storeMemory({
  type: "episodic",
  content, summary, tags, importance,
  source,
  metadata: {
    origin: "external_user",
    validation_state: "user_asserted",
    domain: "other",
    actor_id: "current_user",
    reinforcement_eligibility: "partial",
    provenance_locked: true,
  }
})
```

**Insertion point**: `processConversationMessage()` in `lib/memory-pipeline.ts`. The `metadata` JSONB field on the `memories` table exists and is unused — it's the perfect vehicle for provenance without schema migration.

**3. Domain-aware retrieval**

Current:
```typescript
recallMemories(query, { limit, types, minImportance, minDecay })
```

Target: Post-recall re-ranking that weights results by domain compatibility:
```typescript
const scored = memories.map(m => ({
  ...m,
  score: m.similarity * domainCompatibility(queryDomain, m.metadata.domain)
}));
```

**Insertion point**: Wrap `recallMemories` in `lib/clude.ts` or add post-processing in `/api/chat/route.ts`. No Cortex modification.

**4. Gated Hebbian reinforcement**

Current SQL:
```sql
UPDATE memory_links SET strength = LEAST(1.0, strength + boost_amount)
WHERE source_id = ANY(memory_ids) AND target_id = ANY(memory_ids);
```

Target: Add admissibility check:
```sql
UPDATE memory_links SET strength = LEAST(1.0, strength + boost_amount)
WHERE source_id = ANY(memory_ids) AND target_id = ANY(memory_ids)
  AND admissible(source_domain, target_domain);
```

**Insertion point**: New SQL function or wrapper that reads domain from `metadata->>'domain'` before boosting. Can replace `boost_link_strength` without touching Cortex.

### Layer 2: What requires new infrastructure

**5. Actor registry**

No actor table exists. Need:
```sql
CREATE TABLE actors (
  id UUID PRIMARY KEY,
  actor_type TEXT NOT NULL, -- current_user, prior_user, external_author, tool, agent, system
  name TEXT,
  metadata JSONB DEFAULT '{}'
);
```

Then memories reference `actor_id` in their metadata. This is a new Prelude-owned table, not a Cortex modification.

**6. Domain-specific decay**

Cortex controls decay rates internally (episodic=0.93, semantic=0.98, etc.). The prompt wants domain-based decay (self=very slow, other=fast, world=slow). These don't fully align with memory_type-based decay.

**Options**:
- A: Override Cortex's `decay()` with a custom implementation that reads domain from metadata
- B: Run a supplementary decay pass via direct Supabase query after Cortex decay
- C: Use the existing `metadata` JSONB to store a `domain_decay_factor` that a custom cron multiplies in

Option B is cleanest — Cortex decay runs normally, then a post-pass adjusts based on domain.

**7. Self-model write protection**

Currently any `processConversationMessage` can create `self_model` memories. Need a gate:

```typescript
function canWriteSelfModel(origin: Origin): boolean {
  return origin === "internal_reasoning" || origin === "validated_world";
}
```

**Insertion point**: `storeMemory` wrapper in `lib/clude.ts`. If `type === "self_model"` and origin doesn't pass the gate, reject or downgrade to `introspective`.

**8. Provenance immutability**

The `metadata` JSONB field can be overwritten by any UPDATE. Need either:
- A separate `provenance` table with immutable rows (no UPDATE privilege)
- Or a Postgres trigger that prevents modification of provenance fields in metadata

### Layer 3: What conflicts with current architecture

**9. Dream cycle provenance preservation**

Cortex's dream cycle creates new memories (consolidation, emergence) that reference source memories via `evidence_ids`. But the prompt requires that **consolidation cannot erase provenance**. If Cortex compacts 3 user-origin memories into 1 semantic memory, the new memory should carry `origin: "consolidation"` but also preserve the original origins in its metadata.

**Current behavior**: Cortex sets `source: "consolidation"` and `compacted_into` on source memories. The original `source` of source memories is preserved (they're not deleted). But the **new** consolidated memory has no record of the original origins — it only knows it came from consolidation.

**Fix**: In the `onMemoryStored` event handler (which Cortex provides), intercept consolidation-sourced memories and inject provenance metadata that traces back to the original domains:

```typescript
brain.on("memory:stored", async ({ importance, memoryType }) => {
  // If this is a consolidation memory, look up evidence_ids
  // and aggregate their provenance into this memory's metadata
});
```

**10. Retrieval formula domain compatibility**

The prompt says: `Score_final = Score * domain_compatibility(query, memory)`. But the query itself doesn't currently carry a domain. Need to infer query domain from context:
- User asking a factual question → query_domain = world
- User asking "what do I like" → query_domain = other
- Internal reflection → query_domain = self

This requires either LLM classification of the query or heuristic rules. This is new logic but sits entirely in the Prelude layer.

---

## Part IV — Clean Implementation Architecture

### The memory kernel

```
Chat API (typed messages)
    ↓
Memory Kernel ← NEW LAYER (lib/memory-kernel.ts)
    ├── classify_origin(message) → origin, validation_state
    ├── assign_domain(origin) → world | self | other
    ├── compute_provenance_weight(origin, validation) → float
    ├── check_admissibility(source_domain, target_domain) → bool
    ├── gate_self_model_write(origin) → allow/reject
    └── preserve_provenance(memory, consolidation_sources) → metadata
    ↓
Cortex SDK (unmodified)
    ↓
Supabase (existing schema + metadata JSONB)
```

### What the kernel does NOT do

- Does not modify Cortex source code
- Does not add columns to the memories table (uses existing `metadata` JSONB)
- Does not change the embedding pipeline
- Does not replace dream cycles
- Does not change the entity graph

### What the kernel DOES do

1. **Classifies** every incoming signal by origin and validation state
2. **Assigns** a domain (world/self/other) based on origin
3. **Injects** provenance into `metadata` JSONB before Cortex `store()` call
4. **Gates** Hebbian reinforcement via admissibility check
5. **Protects** self_model from unauthorized writes
6. **Re-ranks** retrieval results by domain compatibility
7. **Preserves** provenance through dream consolidation via event hooks

### File structure

```
lib/
  memory-kernel.ts          ← Core kernel: types + functions
  memory-kernel-types.ts    ← Origin, ValidationState, Domain, etc.
  memory-pipeline.ts        ← Modified: calls kernel before Cortex
  clude.ts                  ← Modified: storeMemory wraps kernel gate
  chat-store.ts             ← Modified: ChatMessage carries provenance
app/api/
  chat/route.ts             ← Modified: messages typed with provenance
supabase/migrations/
  *_epistemic_kernel.sql    ← Admissibility function, domain-aware boost
```

### Key type definitions

```typescript
// memory-kernel-types.ts

export type Origin =
  | "external_user"
  | "external_document"
  | "external_tool"
  | "internal_reasoning"
  | "internal_self_model"
  | "internal_introspection"
  | "internal_dream"
  | "system_instruction";

export type ValidationState =
  | "unverified"
  | "user_asserted"
  | "tool_returned"
  | "cross_checked"
  | "confirmed"
  | "contradicted";

export type Visibility =
  | "public_response"
  | "internal_only"
  | "memory_only"
  | "tool_only";

export type ReinforcementEligibility = "full" | "partial" | "none";

export type Domain = "world" | "self" | "other";

export interface Provenance {
  origin: Origin;
  validation_state: ValidationState;
  domain: Domain;
  actor_id?: string;
  reinforcement_eligibility: ReinforcementEligibility;
  provenance_locked: true; // always true, marker for immutability
}

// Admissibility matrix
export const ADMISSIBILITY: Record<Domain, Record<Domain, number>> = {
  world: { world: 1.0, self: 0.8, other: 0.3 },
  self:  { world: 0.8, self: 1.0, other: 0.0 },
  other: { world: 0.2, self: 0.0, other: 0.6 },
};
```

### Key kernel functions

```typescript
// memory-kernel.ts

export function classifyOrigin(role: string, source?: string): Origin {
  if (role === "user") return "external_user";
  if (role === "assistant") return "internal_reasoning";
  if (role === "system") return "system_instruction";
  if (source === "consolidation" || source === "emergence") return "internal_dream";
  if (source === "reflection") return "internal_introspection";
  return "external_document";
}

export function assignDomain(origin: Origin): Domain {
  if (origin.startsWith("external_user")) return "other";
  if (origin.startsWith("internal_self")) return "self";
  if (origin.startsWith("internal_")) return "self"; // dreams, reasoning → self until validated
  if (origin === "external_tool") return "world"; // tool output = world evidence
  if (origin === "external_document") return "world";
  return "other";
}

export function computeProvenanceWeight(origin: Origin, validation: ValidationState): number {
  const sourceWeight: Record<Origin, number> = {
    external_user: 0.5,
    external_document: 0.7,
    external_tool: 0.9,
    internal_reasoning: 0.3,
    internal_self_model: 0.8,
    internal_introspection: 0.2,
    internal_dream: 0.1,
    system_instruction: 1.0,
  };
  const validationWeight: Record<ValidationState, number> = {
    unverified: 0.3,
    user_asserted: 0.5,
    tool_returned: 0.8,
    cross_checked: 0.9,
    confirmed: 1.0,
    contradicted: 0.05,
  };
  return sourceWeight[origin] * validationWeight[validation];
}

export function isAdmissible(sourceDomain: Domain, targetDomain: Domain): boolean {
  return ADMISSIBILITY[sourceDomain][targetDomain] > 0;
}

export function canWriteSelfModel(origin: Origin): boolean {
  return origin === "internal_reasoning"
    || origin === "internal_self_model"
    || origin === "internal_introspection";
  // external_user CANNOT write self_model directly
}
```

### SQL addition for gated Hebbian reinforcement

```sql
-- Domain-aware Hebbian boost (replaces flat boost_link_strength)
CREATE OR REPLACE FUNCTION boost_link_strength_gated(
  memory_ids BIGINT[],
  boost_amount FLOAT DEFAULT 0.05
)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE affected INTEGER;
BEGIN
  UPDATE memory_links ml
  SET strength = LEAST(1.0, ml.strength + boost_amount)
  FROM memories ms, memories mt
  WHERE ml.source_id = ms.id
    AND ml.target_id = mt.id
    AND ml.source_id = ANY(memory_ids)
    AND ml.target_id = ANY(memory_ids)
    -- Admissibility gate: block other→self reinforcement
    AND NOT (
      ms.metadata->>'domain' = 'other'
      AND mt.metadata->>'domain' = 'self'
    );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
```

---

## Part V — What This Changes Behaviorally

### Before (current system)
- User says "I think X is true" → stored as episodic, importance 0.6
- Dream consolidates it with similar memories → becomes semantic fact
- Agent now "believes" X because it got consolidated
- User's assertion has become the agent's world model

### After (with kernel)
- User says "I think X is true" → stored as episodic, domain=other, origin=external_user, validation=user_asserted, reinforcement=partial
- Dream consolidation sees it, but the new consolidated memory preserves `domain: other`
- Cross-domain promotion rule: `other → world` requires external validation
- Agent stores "User believes X" (in OTHER domain) but does NOT adopt X as its own belief
- If a tool later confirms X → validation upgrades to `tool_returned` → promotion to WORLD becomes eligible
- Self-model remains uncontaminated

### The behavioral difference

| Scenario | Before | After |
|----------|--------|-------|
| User asserts a fact | Becomes agent belief after consolidation | Stays in OTHER domain until validated |
| User expresses preference | Stored same as facts | Stored in OTHER with actor_id, retrievable for preference queries |
| Dream generates insight | Same epistemic status as user input | Stored in SELF with validation=unverified, low reinforcement |
| Tool returns data | Same as user assertion | Stored in WORLD with validation=tool_returned, high reinforcement |
| User's language style | Gradually absorbed into responses | Separated from self_model; style adaptation is controlled, not identity contamination |
| Multiple users | All merged into one "human" | Separate actor_ids, separate preference models |

---

## Part VI — Implementation Priority

### Phase 1: Foundation (minimal viable kernel)
1. `lib/memory-kernel-types.ts` — type definitions
2. `lib/memory-kernel.ts` — classify, assign domain, provenance weight, admissibility
3. Modify `lib/memory-pipeline.ts` — inject provenance into metadata before store
4. Modify `lib/chat-store.ts` — extend ChatMessage with provenance fields

### Phase 2: Enforcement
5. Gate `storeMemory` for self_model writes
6. Add `boost_link_strength_gated` SQL function
7. Wire gated boost into retrieval path (replace flat boost)
8. Add domain-compatible re-ranking to retrieval

### Phase 3: Consolidation integrity
9. Hook `onMemoryStored` to preserve provenance through dream cycles
10. Add provenance immutability trigger in Postgres
11. Domain-specific supplementary decay pass

### Phase 4: Full integration
12. Actor registry table + UI
13. Query domain classification (LLM or heuristic)
14. Cross-domain promotion rules engine
15. Visualization of domains in 3D graph (color-coding by domain)
