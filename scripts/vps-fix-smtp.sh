#!/usr/bin/env bash
# Run on the VPS as deploy (or root). Diagnoses + syncs SMTP for login/forgot OTP.
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/app}"
DOCKER_ENV="${DOCKER_ENV:-$APP_DIR/supabase/docker/.env}"
APP_ENV="${APP_ENV:-$APP_DIR/.env}"

echo "==> Paths"
echo "APP_DIR=$APP_DIR"
echo "DOCKER_ENV=$DOCKER_ENV"
echo "APP_ENV=$APP_ENV"

if [[ ! -f "$DOCKER_ENV" ]]; then
  echo "ERROR: docker env not found at $DOCKER_ENV"
  echo "Find it with: find /home -name '.env' 2>/dev/null | head"
  exit 1
fi

echo ""
echo "==> GOTRUE / SMTP keys in docker .env (values hidden)"
grep -E '^(GOTRUE_SMTP_|SMTP_)' "$DOCKER_ENV" | sed -E 's/(PASS|PASSWORD|PASSWD)=.*/\1=***/I' || true

HOST=$(grep -E '^(GOTRUE_SMTP_HOST|SMTP_HOST)=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
PORT=$(grep -E '^(GOTRUE_SMTP_PORT|SMTP_PORT)=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
USER=$(grep -E '^(GOTRUE_SMTP_USER|GOTRUE_SMTP_ADMIN_EMAIL|SMTP_USER)=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
PASS=$(grep -E '^(GOTRUE_SMTP_PASS|GOTRUE_SMTP_PASSWORD|SMTP_PASS)=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
FROM=$(grep -E '^(GOTRUE_SMTP_ADMIN_EMAIL|SMTP_FROM|SMTP_SENDER)=' "$DOCKER_ENV" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")

HOST=${HOST:-smtp.gmail.com}
PORT=${PORT:-587}
FROM=${FROM:-$USER}

echo ""
echo "==> Resolved: host=$HOST port=$PORT user=${USER:-MISSING} from=${FROM:-MISSING}"

if [[ -z "${USER}" || -z "${PASS}" ]]; then
  echo "ERROR: SMTP user/pass missing in $DOCKER_ENV"
  echo "Add (Gmail example):"
  echo '  GOTRUE_SMTP_HOST=smtp.gmail.com'
  echo '  GOTRUE_SMTP_PORT=587'
  echo '  GOTRUE_SMTP_USER=your@gmail.com'
  echo '  GOTRUE_SMTP_PASS=your_app_password'
  echo '  GOTRUE_SMTP_ADMIN_EMAIL=your@gmail.com'
  echo "Then restart Auth: cd $APP_DIR/supabase/docker && docker compose restart auth"
  exit 1
fi

echo ""
echo "==> TCP reachability (DigitalOcean often blocks 25/465/587)"
for p in "$PORT" 587 465 2525; do
  if timeout 5 bash -c "echo >/dev/tcp/$HOST/$p" 2>/dev/null; then
    echo "OK   $HOST:$p"
  else
    echo "FAIL $HOST:$p  (blocked or wrong host/port)"
  fi
done

echo ""
echo "==> Sync SMTP_* into app .env for Nitro/PM2"
touch "$APP_ENV"
# Remove old SMTP lines then append fresh ones
grep -vE '^(SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|SMTP_FROM)=' "$APP_ENV" > "${APP_ENV}.tmp" || true
mv "${APP_ENV}.tmp" "$APP_ENV"
{
  echo "SMTP_HOST=$HOST"
  echo "SMTP_PORT=$PORT"
  echo "SMTP_USER=$USER"
  echo "SMTP_PASS=$PASS"
  echo "SMTP_FROM=$FROM"
} >> "$APP_ENV"
echo "Wrote SMTP_* to $APP_ENV"

echo ""
echo "==> Deploy latest app code + restart"
cd "$APP_DIR"
git pull
npm run build
pm2 restart all --update-env

echo ""
echo "==> Restart Auth so GOTRUE_SMTP_* is reloaded"
if [[ -d "$APP_DIR/supabase/docker" ]]; then
  (cd "$APP_DIR/supabase/docker" && docker compose restart auth) || true
fi

echo ""
echo "Done. Test login email OTP and Forgot Password again."
echo "If TCP tests all FAIL: open a DigitalOcean support ticket to unlock SMTP,"
echo "or switch GOTRUE_SMTP_PORT to 2525 with a provider that supports it (SendGrid/Mailgun/Brevo)."
