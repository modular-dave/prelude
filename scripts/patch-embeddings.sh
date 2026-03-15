#!/bin/bash
# Patch clude-bot embeddings to support EMBEDDING_BASE_URL env var override.
# Run via `npm run postinstall` or manually after `npm install`.

EMBEDDINGS="node_modules/clude-bot/dist/core/embeddings.js"

if [ ! -f "$EMBEDDINGS" ]; then
  echo "clude-bot not installed yet, skipping patch"
  exit 0
fi

if grep -q "EMBEDDING_BASE_URL" "$EMBEDDINGS"; then
  echo "Embeddings already patched"
  exit 0
fi

sed -i '' \
  "s|url: 'https://api.voyageai.com/v1/embeddings'|url: process.env.EMBEDDING_BASE_URL || 'https://api.voyageai.com/v1/embeddings'|" \
  "$EMBEDDINGS"
sed -i '' \
  "s|url: 'https://api.openai.com/v1/embeddings'|url: process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1/embeddings'|" \
  "$EMBEDDINGS"
sed -i '' \
  "s|url: 'https://api.venice.ai/api/v1/embeddings'|url: process.env.EMBEDDING_BASE_URL || 'https://api.venice.ai/api/v1/embeddings'|" \
  "$EMBEDDINGS"

echo "Patched $EMBEDDINGS with EMBEDDING_BASE_URL support"
