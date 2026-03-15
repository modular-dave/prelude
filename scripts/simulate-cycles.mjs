#!/usr/bin/env node
/**
 * Simulates N dream + introspection (reflect) cycles via the API.
 *
 * Usage:
 *   node scripts/simulate-cycles.mjs          # 50 cycles (default)
 *   CYCLES=10 node scripts/simulate-cycles.mjs # 10 cycles
 */

const BASE = process.env.API_URL || "http://localhost:53448";
const DREAM_API = `${BASE}/api/dream`;
const REFLECT_API = `${BASE}/api/reflect`;
const CYCLES = parseInt(process.env.CYCLES || "50", 10);

async function run() {
  console.log(`Running ${CYCLES} dream + reflect cycles against ${BASE}...\n`);

  for (let i = 1; i <= CYCLES; i++) {
    // Dream phase
    process.stdout.write(`[${i}/${CYCLES}] dream...`);
    try {
      const dreamRes = await fetch(DREAM_API, { method: "POST" });
      if (!dreamRes.ok) {
        const body = await dreamRes.text();
        console.log(` FAIL (${dreamRes.status}: ${body.slice(0, 100)})`);
      } else {
        const d = await dreamRes.json();
        const emergence = d.emergence ? ` "${d.emergence.slice(0, 50)}..."` : "";
        process.stdout.write(` ok${emergence} | `);
      }
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
      continue;
    }

    // Reflect phase
    process.stdout.write(`reflect...`);
    try {
      const reflectRes = await fetch(REFLECT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!reflectRes.ok) {
        const body = await reflectRes.text();
        console.log(` FAIL (${reflectRes.status}: ${body.slice(0, 100)})`);
      } else {
        const r = await reflectRes.json();
        const memId = r.journal?.memoryId ? ` m${r.journal.memoryId}` : "";
        console.log(` ok${memId}`);
      }
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
    }
  }

  console.log(`\nDone! ${CYCLES} dream + reflect cycles completed.`);
}

run().catch(console.error);
