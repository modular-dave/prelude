#!/usr/bin/env bash
set -euo pipefail

# ── Prelude startup ──────────────────────────────────────────────
# Detects platform, starts services, launches Next.js.
# Config is handled by the /setup onboarding UI, not this script.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

R='\033[0;31m' G='\033[0;32m' Y='\033[0;33m' B='\033[0;34m' D='\033[0;90m' N='\033[0m'
info()  { echo -e "${B}info${N}  $*"; }
ok()    { echo -e "${G}  ok${N}  $*"; }
warn()  { echo -e "${Y}warn${N}  $*"; }

echo ""
echo -e "${B}prelude${N}"
echo ""

# ── 1. Detect platform ───────────────────────────────────────────

ARCH=$(uname -m)
OS=$(uname -s)
IS_APPLE_SILICON=false
[ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ] && IS_APPLE_SILICON=true

if [ "$IS_APPLE_SILICON" = true ]; then
  ok "platform · Apple Silicon ($ARCH)"
elif [ "$OS" = "Darwin" ]; then
  ok "platform · macOS Intel ($ARCH)"
elif [ "$OS" = "Linux" ]; then
  ok "platform · Linux ($ARCH)"
else
  ok "platform · $OS ($ARCH)"
fi

# ── 2. Ensure minimal .env.local (Supabase only) ─────────────────

LOCAL_SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

if [ ! -f .env.local ]; then
  info "creating .env.local (supabase only — configure via /setup)"
  cat > .env.local <<EOF
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=${LOCAL_SUPABASE_KEY}
EOF
  ok ".env.local created"
fi

# ── 3. Check Supabase ─────────────────────────────────────────────

if curl -sf http://127.0.0.1:54321/rest/v1/ -o /dev/null 2>/dev/null; then
  ok "supabase · :54321"
else
  info "supabase not running, starting..."
  if command -v npx &>/dev/null && npx supabase --version &>/dev/null 2>&1; then
    npx supabase start 2>&1 | tail -3
    curl -sf http://127.0.0.1:54321/rest/v1/ -o /dev/null 2>/dev/null && ok "supabase started" || { echo -e "${R}fail${N}  supabase"; exit 1; }
  else
    echo -e "${R}fail${N}  supabase CLI not found — install: npm i -g supabase"; exit 1
  fi
fi

# ── 4. Start platform-specific backends ───────────────────────────

# Apple Silicon: start MLX servers if available
if [ "$IS_APPLE_SILICON" = true ]; then
  # MLX inference server
  if curl -sf http://127.0.0.1:8899/ -o /dev/null 2>/dev/null; then
    ok "mlx inference · :8899"
  elif [ -f server/mlx_server.py ] && python3 -c "import mlx_lm" 2>/dev/null; then
    info "starting mlx inference on :8899..."
    python3 server/mlx_server.py 8899 "${INFERENCE_CHAT_MODEL:-mlx-community/Qwen2.5-1.5B-Instruct-4bit}" &
    for i in $(seq 1 30); do
      curl -sf http://127.0.0.1:8899/ -o /dev/null 2>/dev/null && break
      sleep 1
    done
    curl -sf http://127.0.0.1:8899/ -o /dev/null 2>/dev/null && ok "mlx inference started" || warn "mlx inference failed to start"
  else
    warn "mlx inference not available (install: pip install mlx-lm flask)"
  fi

  # MLX embedding server
  if curl -sf http://127.0.0.1:11435/health -o /dev/null 2>/dev/null; then
    ok "mlx embedding · :11435"
  elif [ -f scripts/embedding-server.py ] && python3 -c "import mlx_embeddings" 2>/dev/null; then
    info "starting mlx embedding on :11435..."
    python3 scripts/embedding-server.py --port 11435 &
    for i in $(seq 1 30); do
      curl -sf http://127.0.0.1:11435/health -o /dev/null 2>/dev/null && break
      sleep 1
    done
    curl -sf http://127.0.0.1:11435/health -o /dev/null 2>/dev/null && ok "mlx embedding started" || warn "mlx embedding failed to start"
  else
    warn "mlx embedding not available (install: pip install mlx-embeddings)"
  fi
fi

# x86 / Linux: check Ollama
if [ "$IS_APPLE_SILICON" = false ]; then
  if curl -sf http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null; then
    ok "ollama · :11434"
  elif command -v ollama &>/dev/null; then
    info "starting ollama..."
    ollama serve &>/dev/null &
    for i in $(seq 1 15); do
      curl -sf http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null && break
      sleep 1
    done
    curl -sf http://127.0.0.1:11434/api/tags -o /dev/null 2>/dev/null && ok "ollama started" || warn "ollama failed to start"
  else
    warn "ollama not installed (https://ollama.com)"
  fi
fi

# ── 5. Summary + Start Next.js ────────────────────────────────────

echo ""
if ! grep -q "PRELUDE_SETUP_COMPLETE=true" .env.local 2>/dev/null; then
  info "first launch — open the app to run setup"
fi
echo ""
exec npx next dev
