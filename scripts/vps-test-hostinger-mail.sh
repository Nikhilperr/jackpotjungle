#!/usr/bin/env bash
# Test Hostinger Mail HTTPS API from the VPS.
# Usage: bash scripts/vps-test-hostinger-mail.sh you@gmail.com
set -euo pipefail
cd "${APP_DIR:-$HOME/app}"

TOKEN=$(grep -E '^HOSTINGER_MAIL_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ')
FROM=$(grep -E '^MAIL_FROM=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ')
FROM=${FROM:-noreply@playjackpotjungle.com}
TO="${1:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: HOSTINGER_MAIL_TOKEN missing in ~/app/.env"
  exit 1
fi

echo "==> GET /api/v1/me"
ME=$(curl -sS https://api.mail.hostinger.com/api/v1/me -H "Authorization: Bearer $TOKEN" -H "accept: application/json")
echo "$ME"
echo ""

MID=$(grep -E '^HOSTINGER_MAILBOX_ID=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)

if [[ -z "$MID" ]]; then
  MID=$(printf '%s' "$ME" | node -e '
    let raw="";
    process.stdin.on("data", d => raw += d);
    process.stdin.on("end", () => {
      const m = JSON.parse(raw);
      const boxes = m?.data?.mailboxes || m?.mailboxes || [];
      const list = Array.isArray(boxes) ? boxes : [];
      const want = (process.env.FROM || "").toLowerCase();
      const hit =
        list.find(b => (b.address || "").toLowerCase() === want) ||
        list.find(b => (b.address || "").toLowerCase().includes("noreply")) ||
        list[0];
      process.stdout.write(hit?.resourceId || hit?.resource_id || "");
    });
  ')
fi

if [[ -z "$MID" ]]; then
  echo "ERROR: could not resolve mailbox resourceId"
  exit 1
fi

echo "==> mailbox id: $MID"
echo "==> from: $FROM"

# Persist mailbox id for the app
if ! grep -qE '^HOSTINGER_MAILBOX_ID=' .env 2>/dev/null; then
  echo "HOSTINGER_MAILBOX_ID=$MID" >> .env
  echo "==> wrote HOSTINGER_MAILBOX_ID to .env"
else
  # update existing
  grep -vE '^HOSTINGER_MAILBOX_ID=' .env > .env.tmp || true
  echo "HOSTINGER_MAILBOX_ID=$MID" >> .env.tmp
  mv .env.tmp .env
  echo "==> updated HOSTINGER_MAILBOX_ID in .env"
fi

if ! grep -qE '^MAIL_FROM=' .env 2>/dev/null; then
  echo "MAIL_FROM=$FROM" >> .env
fi

if [[ -z "$TO" ]]; then
  echo "OK. Token + mailbox work. Re-run with an email to send a test:"
  echo "  bash scripts/vps-test-hostinger-mail.sh you@gmail.com"
  exit 0
fi

echo "==> POST send to $TO"
RESP=$(curl -sS -w "\nHTTP:%{http_code}" -X POST \
  "https://api.mail.hostinger.com/api/v1/mailboxes/${MID}/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "accept: application/json" \
  -d "{\"to\":[\"${TO}\"],\"subject\":\"Jackpot Jungle mail test\",\"text\":\"If you got this, Hostinger HTTPS mail works.\",\"html\":\"<p><b>If you got this, Hostinger HTTPS mail works.</b></p>\",\"displayName\":\"Jackpot Jungle\"}")

echo "$RESP"
CODE=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
if [[ "$CODE" == "200" || "$CODE" == "201" || "$CODE" == "204" ]]; then
  echo "SUCCESS — check inbox (and spam) for $TO"
else
  echo "FAILED — HTTP $CODE"
  exit 1
fi
