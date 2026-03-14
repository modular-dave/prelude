#!/usr/bin/env node
/**
 * Generates summaries for existing conversations in a JSON file,
 * then outputs updated JSON to inject into localStorage.
 */

const API = "http://localhost:53231/api/chat/summary";

async function main() {
  const { readFileSync } = await import("fs");

  // Read conversations from localStorage via preview_eval won't work from CLI,
  // so we'll read the seed file and update it
  const args = process.argv.slice(2);
  const inputFile = args[0] || "/tmp/prelude_conversations.json";

  let conversations;
  try {
    conversations = JSON.parse(readFileSync(inputFile, "utf8"));
  } catch {
    console.error("No conversations file found. Run seed-conversations.mjs first.");
    process.exit(1);
  }

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    if (conv.summary) {
      console.log(`[${i + 1}/${conversations.length}] Already has summary: ${conv.summary}`);
      continue;
    }

    process.stdout.write(`[${i + 1}/${conversations.length}] ${conv.title}...`);

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conv.messages }),
      });

      if (res.ok) {
        const { summary } = await res.json();
        if (summary) {
          conv.summary = summary;
          console.log(` → "${summary}"`);
        } else {
          console.log(` → (empty, keeping title)`);
        }
      } else {
        console.log(` → (error ${res.status})`);
      }
    } catch (err) {
      console.log(` → (failed: ${err.message})`);
    }
  }

  const { writeFileSync } = await import("fs");
  writeFileSync("/tmp/prelude_conversations_with_summaries.json", JSON.stringify(conversations, null, 2));
  console.log(`\nDone! Written to /tmp/prelude_conversations_with_summaries.json`);
}

main().catch(console.error);
