#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# BUREAU — one-shot server setup for a fresh Debian/Ubuntu root box.
#
# It installs Docker + nginx, builds the frontend, brings up the backend
# (api + signer + worker + Postgres) with docker compose, and wires nginx with
# the hostpanel log format so the panel gets per-site stats.
#
# REVIEW IT before running — it changes system packages and services.
# Run as root on the server:
#
#     curl -fsSL <raw-url>/deploy/server-setup.sh -o setup.sh
#     # edit the CONFIG block below (at least DOMAIN)
#     bash setup.sh
#
# It does NOT touch /etc/ssh/hostpanel/, /etc/ssh/sshd_config.d/00-hostpanel.conf
# or the hostpanel-agent service.
#
# Money is OFF by default (LAUNCH/MONEY/SOCIAL=false, devnet). Nothing moves
# funds until you flip the switches in server/.env and redeploy. Review
# DEPLOY.md before going to mainnet.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── CONFIG ──────────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-}"                               # e.g. bureau.example.com (blank = serve on IP)
REPO_URL="${REPO_URL:-https://github.com/jadoreblessed/bureau}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/bureau}"
WEB_ROOT="${WEB_ROOT:-/var/www/bureau}"
OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}"       # optional; without it agents stay asleep
# ────────────────────────────────────────────────────────────────────────────

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
need_root() { [ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }; }
need_root

log "Installing prerequisites (docker, nginx, git, openssl, curl)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git nginx openssl
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || apt-get install -y docker-compose-plugin

log "Fetching the project into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH" && git -C "$APP_DIR" checkout "$BRANCH" && git -C "$APP_DIR" pull --ff-only
else
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$APP_DIR"
fi

log "Building the frontend → $WEB_ROOT"
mkdir -p "$WEB_ROOT"
docker run --rm -v "$APP_DIR/web":/app -w /app node:22-alpine sh -c "npm install && npm run build"
cp "$APP_DIR/web/dist/index.html" "$WEB_ROOT/index.html"

ENV_FILE="$APP_DIR/server/.env"
if [ ! -f "$ENV_FILE" ]; then
  log "Generating backend secrets and writing server/.env"
  # Solana keypairs + base64/hex secrets, via a throwaway node container.
  SECRETS="$(docker run --rm -v "$APP_DIR/server":/app -w /app node:22-alpine \
    sh -c "npm install --no-save @solana/web3.js@1.98.0 bs58@6.0.0 >/dev/null 2>&1 && node scripts/gen-secrets.mjs")"
  MASTER_KEY=$(echo "$SECRETS"        | awk -F= '/^MASTER_KEY=/{print $2}')
  SIGNER_TOKEN=$(echo "$SECRETS"      | awk -F= '/^SIGNER_TOKEN=/{print $2}')
  PAYER=$(echo "$SECRETS"             | awk -F= '/^PLATFORM_PAYER_SECRET=/{print $2}')
  FEE=$(echo "$SECRETS"               | awk -F= '/^PLATFORM_FEE_WALLET=/{print $2}')
  CREDITS=$(echo "$SECRETS"           | awk -F= '/^CREDITS_WALLET=/{print $2}')
  BUYBACK=$(echo "$SECRETS"           | awk -F= '/^BUYBACK_WALLET=/{print $2}')
  PAYER_PUBKEY=$(echo "$SECRETS"      | sed -n 's/^# Public key (fund this):  //p')

  PUBLIC_URL="http://${DOMAIN:-localhost}"
  cp "$APP_DIR/server/.env.example" "$ENV_FILE"
  {
    echo ""
    echo "# ── filled by server-setup.sh ──"
    echo "NODE_ENV=production"
    echo "PUBLIC_URL=${PUBLIC_URL}"
    echo "CORS_ORIGINS=${PUBLIC_URL}"
    echo "MASTER_KEY=${MASTER_KEY}"
    echo "SIGNER_TOKEN=${SIGNER_TOKEN}"
    echo "PLATFORM_PAYER_SECRET=${PAYER}"
    echo "PLATFORM_FEE_WALLET=${FEE}"
    echo "CREDITS_WALLET=${CREDITS}"
    echo "BUYBACK_WALLET=${BUYBACK}"
    echo "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}"
    echo "# switches stay OFF — flip to true only after a devnet run"
    echo "LAUNCH_ENABLED=false"
    echo "MONEY_ENABLED=false"
    echo "SOCIAL_ENABLED=false"
    echo "MAX_TOTAL_SPEND_LAMPORTS=20000000"
  } >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "$SECRETS" > "$APP_DIR/server/SECRETS.txt"; chmod 600 "$APP_DIR/server/SECRETS.txt"
  log "Secrets saved to server/SECRETS.txt — BACK UP MASTER_KEY, then delete this file."
  log "Fund the payer wallet with devnet SOL: ${PAYER_PUBKEY:-see SECRETS.txt}"
else
  log "server/.env already exists — leaving it untouched"
fi

log "Starting the backend (db + api + signer + worker)"
cd "$APP_DIR/server"
docker compose up -d db
sleep 5
docker compose run --rm api node dist/util/migrate.js || true
docker compose up -d --build

log "Configuring nginx"
SITE=/etc/nginx/sites-available/bureau
cp "$APP_DIR/deploy/nginx-bureau.conf" "$SITE"
[ -n "$DOMAIN" ] && sed -i "s/server_name .*/server_name ${DOMAIN};/" "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/bureau
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

log "Done."
echo "  Frontend : http://${DOMAIN:-<server-ip>}/"
echo "  Health   : http://${DOMAIN:-<server-ip>}/health"
echo ""
echo "  Next:"
echo "   • fund the payer wallet (devnet SOL) — see server/SECRETS.txt"
echo "   • add OPENROUTER_API_KEY to server/.env so agents can think, then:"
echo "       cd $APP_DIR/server && docker compose up -d"
echo "   • back up MASTER_KEY off-server, then: rm server/SECRETS.txt"
echo "   • for HTTPS: certbot --nginx -d $DOMAIN"
