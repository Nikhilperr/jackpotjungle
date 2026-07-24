#!/usr/bin/env bash
# Diagnose Hostinger "204 success but inbox empty" (usually Allow/Block silent drop).
# Usage: bash scripts/vps-diagnose-mail-delivery.sh you@gmail.com
set -euo pipefail
cd "${APP_DIR:-$HOME/app}"

TOKEN=$(grep -E '^HOSTINGER_MAIL_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ')
MID=$(grep -E '^HOSTINGER_MAILBOX_ID=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
TO="${1:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: HOSTINGER_MAIL_TOKEN missing"
  exit 1
fi

if [[ -z "$MID" ]]; then
  ME=$(curl -sS https://api.mail.hostinger.com/api/v1/me -H "Authorization: Bearer $TOKEN" -H "accept: application/json")
  MID=$(printf '%s' "$ME" | node -e 'let r="";process.stdin.on("data",d=>r+=d);process.stdin.on("end",()=>{const m=JSON.parse(r);const b=(m?.data?.mailboxes||[])[0];process.stdout.write(b?.resourceId||"")})')
fi

echo "==> mailbox: $MID"
echo "==> folders:"
curl -sS "https://api.mail.hostinger.com/api/v1/mailboxes/${MID}/folders" \
  -H "Authorization: Bearer $TOKEN" -H "accept: application/json"
echo ""

if [[ -z "$TO" ]]; then
  echo ""
  echo "Re-run with an email to send + verify Sent:"
  echo "  bash scripts/vps-diagnose-mail-delivery.sh you@gmail.com"
  echo ""
  echo "If API returns 204 but Gmail never gets mail:"
  echo "  hPanel → Emails → Agentic Mail → Allow/Block lists"
  echo "  for noreply@playjackpotjungle.com:"
  echo "    - Allow list must be EMPTY (empty = send to anyone)"
  echo "    - Remove gmail.com / your address from Block list"
  exit 0
fi

MARKER="jjdiag-$(date +%s)"
SUBJ="JJ delivery diagnose ${MARKER}"
echo "==> sending subject: $SUBJ"
CODE=$(curl -sS -o /tmp/jj-mail-send.json -w "%{http_code}" -X POST \
  "https://api.mail.hostinger.com/api/v1/mailboxes/${MID}/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "accept: application/json" \
  -d "{\"to\":[\"${TO}\"],\"subject\":\"${SUBJ}\",\"text\":\"diagnose ${MARKER}\",\"html\":\"<p>diagnose ${MARKER}</p>\",\"displayName\":\"Jackpot Jungle\"}")
echo "HTTP:$CODE body:$(cat /tmp/jj-mail-send.json 2>/dev/null | head -c 200)"
echo ""

sleep 2
echo "==> recent Sent messages (looking for ${MARKER}):"
# Try common Sent folder paths
for F in "INBOX.Sent" "Sent" "INBOX.Sent Messages" "Sent Messages"; do
  echo "--- folder: $F ---"
  curl -sS "https://api.mail.hostinger.com/api/v1/mailboxes/${MID}/folders/$(python3 -c "import urllib.parse;print(urllib.parse.quote('''$F''',safe=''))" 2>/dev/null || node -e "process.stdout.write(encodeURIComponent('$F'))")/messages?limit=10" \
    -H "Authorization: Bearer $TOKEN" -H "accept: application/json" | head -c 1200
  echo ""
done

echo ""
echo "If HTTP was 204 but marker is NOT in Sent / Gmail:"
echo "  → Clear Agentic Mail ALLOW list (must be empty) for noreply@"
echo "  → Hostinger silently drops blocked recipients with no bounce"
