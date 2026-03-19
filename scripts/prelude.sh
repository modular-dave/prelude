#!/usr/bin/env bash
set -euo pipefail

# ── Prelude startup orchestrator ──────────────────────────────────
# Ensures Supabase + Ollama (embeddings) are running, .env.local exists, then starts Next.js
# Inference defaults to MLX (Apple Silicon). Ollama is used for embeddings only.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

# Colors
R='\033[0;31m' G='\033[0;32m' Y='\033[0;33m' B='\033[0;34m' D='\033[0;90m' N='\033[0m'

info()  { echo -e "${B}info${N}  $*"; }
ok()    { echo -e "${G}ok${N}    $*"; }
warn()  { echo -e "${Y}warn${N}  $*"; }
fail()  { echo -e "${R}fail${N}  $*"; }

echo ""
echo -e "${B}prelude${N} starting up..."
echo ""

# ── 1. Ensure .env.local ──────────────────────────────────────────

LOCAL_SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

if [ ! -f .env.local ]; then
  info "generating .env.local with local-dev defaults (MLX + Ollama embeddings)"
  cat > .env.local <<EOF
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=${LOCAL_SUPABASE_KEY}

# Inference via MLX (Apple Silicon)
VENICE_BASE_URL=http://127.0.0.1:8899/v1
VENICE_API_KEY=local
VENICE_MODEL=mlx-community/Qwen2.5-0.5B-Instruct-4bit

# Per-function model assignments
INFERENCE_CHAT_MODEL=mlx-community/Qwen2.5-0.5B-Instruct-4bit
INFERENCE_CHAT_PROVIDER=mlx

# Embedding via Ollama (embeddings work fine on Ollama, inference may not on Apple Silicon)
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
EOF
  ok ".env.local created"
else
  ok ".env.local exists"
fi

# ── 2. Check Supabase ─────────────────────────────────────────────

if curl -sf http://127.0.0.1:54321/rest/v1/ -o /dev/null 2>/dev/null; then
  ok "supabase running on :54321"
else
  info "supabase not running, attempting to start..."
  if command -v npx &>/dev/null && npx supabase --version &>/dev/null 2>&1; then
    npx supabase start 2>&1 | tail -5
    if curl -sf http://127.0.0.1:54321/rest/v1/ -o /dev/null 2>/dev/null; then
      ok "supabase started"
    else
      fail "supabase failed to start"
      echo "  try: npx supabase start"
      exit 1
    fi
  else
    fail "supabase CLI not found"
    echo "  install: npm install -g supabase"
    echo "  then:    supabase start"
    exit 1
  fi
fi

# ── 3. Check Ollama (for embeddings) ─────────────────────────────

OLLAMA_OK=false
if curl -sf http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null; then
  OLLAMA_OK=true
  ok "ollama running on :11434 (embeddings)"
else
  warn "ollama not running — embeddings will be unavailable"
  echo -e "  ${D}start with: ollama serve${N}"
fi

# ── 4. Detect embedding model ────────────────────────────────────

if [ "$OLLAMA_OK" = true ]; then
  MODELS=$(curl -sf http://127.0.0.1:11434/api/tags | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//')

  EMBED_MODEL=""
  EMBED_DIMS=""
  if echo "$MODELS" | grep -q "mxbai-embed-large"; then
    EMBED_MODEL="mxbai-embed-large"
    EMBED_DIMS="1024"
  elif echo "$MODELS" | grep -q "nomic-embed-text"; then
    EMBED_MODEL="nomic-embed-text"
    EMBED_DIMS="768"
  fi
  if [ -n "$EMBED_MODEL" ]; then
    ok "embedding model: $EMBED_MODEL (${EMBED_DIMS}d)"
    if grep -q "^EMBEDDING_MODEL=" .env.local; then
      sed -i '' "s|^EMBEDDING_MODEL=.*|EMBEDDING_MODEL=${EMBED_MODEL}|" .env.local
      sed -i '' "s|^EMBEDDING_DIMENSIONS=.*|EMBEDDING_DIMENSIONS=${EMBED_DIMS}|" .env.local
    fi
  else
    warn "no embedding model found in ollama"
    echo -e "  ${D}install one: ollama pull nomic-embed-text${N}"
  fi
fi

# ── 5. Check MLX server (for inference) ───────────────────────────

if curl -sf http://127.0.0.1:8899/ -o /dev/null 2>/dev/null; then
  ok "mlx server running on :8899"
else
  warn "mlx server not running — chat will be unavailable"
  echo -e "  ${D}start with: python3 server/mlx_server.py 8899${N}"
fi

# ── 6. Start Next.js ──────────────────────────────────────────────

echo ""
info "starting next.js dev server..."
echo ""
exec npx next dev
