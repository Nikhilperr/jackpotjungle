#!/usr/bin/env bash
# Sync Hostinger SMTP from Auth docker .env into the app and restart.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
DOCKER_ENV="$APP_DIR/supabase/docker/.env"
APP_ENV="$APP_DIR/.env"

cd "$APP_DIR"

if [[ ! -f "$DOCKER_ENV" ]]; then
  echo "ERROR: missing $DOCKER_ENV"
  exit 1
fi

echo "==> SMTP in Auth docker .env (password hidden):"
grep -E '^(SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|SMTP_ADMIN_EMAIL|SMTP_SENDER_NAME)=' "$DOCKER_ENV" \
  | sed -E 's/^(SMTP_PASS)=.*/\1=***/'

HOST=$(grep -E '^SMTP_HOST=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
PORT=$(grep -E '^SMTP_PORT=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
USER=$(grep -E '^SMTP_USER=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
PASS=$(grep -E '^SMTP_PASS=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
FROM=$(grep -E '^SMTP_ADMIN_EMAIL=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
NAME=$(grep -E '^SMTP_SENDER_NAME=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")

echo ""
echo "==> Reachability test smtp.hostinger.com"
for p in "${PORT:-465}" 465 587; do
  if timeout 5 bash -c "echo >/dev/tcp/${HOST:-smtp.hostinger.com}/$p" 2>/dev/null; then
    echo "OK   ${HOST}:$p"
  else
    echo "FAIL ${HOST}:$p"
  fi
done

echo ""
echo "==> Sync SMTP_* into $APP_ENV for PM2"
touch "$APP_ENV"
grep -vE '^(SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|SMTP_FROM|SMTP_ADMIN_EMAIL|SMTP_SENDER_NAME)=' "$APP_ENV" > "${APP_ENV}.tmp" || true
mv "${APP_ENV}.tmp" "$APP_ENV"
{
  echo "SMTP_HOST=$HOST"
  echo "SMTP_PORT=$PORT"
  echo "SMTP_USER=$USER"
  echo "SMTP_PASS=$PASS"
  echo "SMTP_FROM=$FROM"
  echo "SMTP_ADMIN_EMAIL=$FROM"
  echo "SMTP_SENDER_NAME=$NAME"
} >> "$APP_ENV"

echo "==> Pull + build + restart"
git pull
npm run build
pm2 restart all --update-env

echo "Done. Watch: pm2 logs --lines 40 | grep SMTP"
