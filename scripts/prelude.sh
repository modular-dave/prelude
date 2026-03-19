#!/usr/bin/env bash
set -euo pipefail

# ── Prelude startup orchestrator ──────────────────────────────────
# Probes hardware, auto-starts services, configures .env.local, starts Next.js

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

R='\033[0;31m' G='\033[0;32m' Y='\033[0;33m' B='\033[0;34m' D='\033[0;90m' N='\033[0m'
info()  { echo -e "${B}info${N}  $*"; }
ok()    { echo -e "${G}  ok${N}  $*"; }
warn()  { echo -e "${Y}warn${N}  $*"; }
fail()  { echo -e "${R}fail${N}  $*"; }

echo ""
echo -e "${B}prelude${N} starting up..."
echo ""

LOCAL_SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# ── 1. Ensure .env.local exists ───────────────────────────────────

if [ ! -f .env.local ]; then
  info "generating .env.local"
  cat > .env.local <<EOF
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=${LOCAL_SUPABASE_KEY}

# Inference — auto-configured by probe
VENICE_BASE_URL=http://127.0.0.1:8899/v1
VENICE_API_KEY=local
VENICE_MODEL=mlx-community/Qwen2.5-0.5B-Instruct-4bit
INFERENCE_CHAT_MODEL=mlx-community/Qwen2.5-0.5B-Instruct-4bit
INFERENCE_CHAT_PROVIDER=mlx

# Embedding via Ollama
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=mxbai-embed-large
EMBEDDING_DIMENSIONS=1024
EOF
  ok ".env.local created"
else
  ok ".env.local exists"
fi

# Source current env
set -a; source .env.local 2>/dev/null || true; set +a

# Helper: update or append a key in .env.local
set_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env.local 2>/dev/null; then
    sed -i '' "s|^${key}=.*|${key}=${val}|" .env.local
  else
    echo "${key}=${val}" >> .env.local
  fi
  export "$key=$val"
}

# ── 2. Check Supabase ─────────────────────────────────────────────

if curl -sf http://127.0.0.1:54321/rest/v1/ -o /dev/null 2>/dev/null; then
  ok "supabase · :54321"
else
  info "supabase not running, starting..."
  if command -v npx &>/dev/null && npx supabase --version &>/dev/null 2>&1; then
    npx supabase start 2>&1 | tail -3
    if curl -sf http://127.0.0.1:54321/rest/v1/ -o /dev/null 2>/dev/null; then
      ok "supabase started"
    else
      fail "supabase failed to start — run: npx supabase start"; exit 1
    fi
  else
    fail "supabase CLI not found — install: npm i -g supabase"; exit 1
  fi
fi

# ── 3. Check Ollama (embeddings) ──────────────────────────────────

OLLAMA_OK=false
OLLAMA_MODELS=""
EMBED_MODEL=""
if curl -sf http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null; then
  OLLAMA_OK=true
  OLLAMA_MODELS=$(curl -sf http://127.0.0.1:11434/api/tags | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"//')
  # Detect embedding model
  if echo "$OLLAMA_MODELS" | grep -q "mxbai-embed-large"; then
    EMBED_MODEL="mxbai-embed-large"; set_env EMBEDDING_MODEL "$EMBED_MODEL"; set_env EMBEDDING_DIMENSIONS "1024"
  elif echo "$OLLAMA_MODELS" | grep -q "nomic-embed-text"; then
    EMBED_MODEL="nomic-embed-text"; set_env EMBEDDING_MODEL "$EMBED_MODEL"; set_env EMBEDDING_DIMENSIONS "768"
  fi
  if [ -n "$EMBED_MODEL" ]; then
    ok "ollama · :11434 · embed: $EMBED_MODEL"
  else
    warn "ollama running but no embedding model — run: ollama pull mxbai-embed-large"
  fi
else
  warn "ollama not running — embeddings unavailable"
  echo -e "  ${D}start: ollama serve${N}"
fi

# ── 4. Check/start MLX ────────────────────────────────────────────

MLX_OK=false
MLX_MODEL=""

if curl -sf http://127.0.0.1:8899/ -o /dev/null 2>/dev/null; then
  MLX_OK=true
  MLX_MODEL=$(curl -sf http://127.0.0.1:8899/v1/models 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//') || true
  ok "mlx · :8899 · model: ${MLX_MODEL:-unknown}"
elif [ -f server/mlx_server.py ] && python3 -c "import mlx_lm" 2>/dev/null; then
  info "starting mlx server on :8899..."
  python3 server/mlx_server.py 8899 &
  for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:8899/ -o /dev/null 2>/dev/null; then
      MLX_OK=true
      MLX_MODEL=$(curl -sf http://127.0.0.1:8899/v1/models 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//') || true
      ok "mlx started · :8899 · model: ${MLX_MODEL:-unknown}"
      break
    fi
    sleep 1
  done
  [ "$MLX_OK" = false ] && warn "mlx server didn't start in 30s"
else
  info "mlx not available"
  echo -e "  ${D}install: pip install mlx-lm flask${N}"
fi

# ── 5. Probe inference ────────────────────────────────────────────

INFERENCE_OK=false

probe_inference() {
  local url="$1" model="$2"
  local result
  result=$(curl -sf --max-time 15 "${url}/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer local" \
    -d "{\"model\":\"${model}\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":1,\"stream\":false}" 2>/dev/null) || return 1
  echo "$result" | grep -q '"choices"' && return 0
  return 1
}

CURRENT_PROVIDER="${INFERENCE_CHAT_PROVIDER:-mlx}"

# Try configured provider first
if [ "$CURRENT_PROVIDER" = "mlx" ] && [ "$MLX_OK" = true ]; then
  PROBE_MODEL="${INFERENCE_CHAT_MODEL:-${MLX_MODEL:-mlx-community/Qwen2.5-0.5B-Instruct-4bit}}"
  if probe_inference "http://127.0.0.1:8899/v1" "$PROBE_MODEL"; then
    INFERENCE_OK=true
    set_env VENICE_BASE_URL "http://127.0.0.1:8899/v1"
    set_env VENICE_MODEL "$PROBE_MODEL"
    set_env INFERENCE_CHAT_MODEL "$PROBE_MODEL"
    set_env INFERENCE_CHAT_PROVIDER "mlx"
    ok "inference · mlx · $PROBE_MODEL ✓"
  fi
elif [ "$CURRENT_PROVIDER" = "ollama" ] && [ "$OLLAMA_OK" = true ]; then
  PROBE_MODEL="${INFERENCE_CHAT_MODEL:-${VENICE_MODEL:-phi3:mini}}"
  if probe_inference "http://127.0.0.1:11434/v1" "$PROBE_MODEL"; then
    INFERENCE_OK=true
    set_env VENICE_BASE_URL "http://127.0.0.1:11434/v1"
    set_env VENICE_MODEL "$PROBE_MODEL"
    set_env INFERENCE_CHAT_MODEL "$PROBE_MODEL"
    set_env INFERENCE_CHAT_PROVIDER "ollama"
    ok "inference · ollama · $PROBE_MODEL ✓"
  fi
fi

# Fallback: try the other provider
if [ "$INFERENCE_OK" = false ]; then
  # Try MLX if we haven't
  if [ "$CURRENT_PROVIDER" != "mlx" ] && [ "$MLX_OK" = true ]; then
    PROBE_MODEL="${MLX_MODEL:-mlx-community/Qwen2.5-0.5B-Instruct-4bit}"
    if probe_inference "http://127.0.0.1:8899/v1" "$PROBE_MODEL"; then
      INFERENCE_OK=true
      set_env VENICE_BASE_URL "http://127.0.0.1:8899/v1"
      set_env VENICE_MODEL "$PROBE_MODEL"
      set_env INFERENCE_CHAT_MODEL "$PROBE_MODEL"
      set_env INFERENCE_CHAT_PROVIDER "mlx"
      ok "inference · mlx (fallback) · $PROBE_MODEL ✓"
    fi
  fi
  # Try each Ollama chat model
  if [ "$INFERENCE_OK" = false ] && [ "$OLLAMA_OK" = true ]; then
    for m in $(echo "$OLLAMA_MODELS" | grep -v "embed" 2>/dev/null); do
      if probe_inference "http://127.0.0.1:11434/v1" "$m"; then
        INFERENCE_OK=true
        set_env VENICE_BASE_URL "http://127.0.0.1:11434/v1"
        set_env VENICE_MODEL "$m"
        set_env INFERENCE_CHAT_MODEL "$m"
        set_env INFERENCE_CHAT_PROVIDER "ollama"
        ok "inference · ollama (fallback) · $m ✓"
        break
      fi
    done
  fi
fi

[ "$INFERENCE_OK" = false ] && warn "no working inference backend — chat unavailable"

# ── 6. Probe embeddings ───────────────────────────────────────────

if [ "$OLLAMA_OK" = true ] && [ -n "$EMBED_MODEL" ]; then
  EMB_RESULT=$(curl -sf --max-time 10 "http://127.0.0.1:11434/v1/embeddings" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"${EMBED_MODEL}\",\"input\":\"test\"}" 2>/dev/null) || true
  if echo "$EMB_RESULT" | grep -q '"data"'; then
    ok "embedding probe · $EMBED_MODEL ✓"
  else
    warn "embedding probe failed for $EMBED_MODEL"
  fi
fi

# ── 7. Summary ────────────────────────────────────────────────────

echo ""
echo -e "${B}─── ready ───${N}"
SB="${G}✓${N}"; [ "$OLLAMA_OK" = true ] && OL="${G}✓${N}" || OL="${R}✗${N}"
[ "$MLX_OK" = true ] && MX="${G}✓${N}" || MX="${D}–${N}"
[ "$INFERENCE_OK" = true ] && INF="${G}✓${N}" || INF="${R}✗${N}"
echo -e "  supabase $SB  ollama $OL  mlx $MX  inference $INF"
echo ""

# ── 8. Start Next.js ──────────────────────────────────────────────

exec npx next dev
