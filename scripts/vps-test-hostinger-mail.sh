#!/usr/bin/env bash
# Quick test: Hostinger Mail HTTPS API from the VPS (must work for OTP).
set -euo pipefail
cd "${APP_DIR:-$HOME/app}"

TOKEN=$(grep -E '^HOSTINGER_MAIL_TOKEN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
FROM=$(grep -E '^MAIL_FROM=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
FROM=${FROM:-noreply@playjackpotjungle.com}
TO="${1:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: HOSTINGER_MAIL_TOKEN missing in ~/app/.env"
  echo "Create token: hPanel → Emails → Agentic Mail → API"
  exit 1
fi

echo "==> GET /api/v1/me"
ME=$(curl -sS https://api.mail.hostinger.com/api/v1/me -H "Authorization: Bearer $TOKEN")
echo "$ME" | head -c 800
echo ""

MID=$(grep -E '^HOSTINGER_MAILBOX_ID=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [[ -z "$MID" ]]; then
  MID=$(python3 - <<'PY' 2>/dev/null || node -e '
const m=JSON.parse(process.argv[1]);
const boxes=m?.data?.mailboxes||m?.mailboxes||m?.data||[];
const list=Array.isArray(boxes)?boxes:[];
const want=(process.env.FROM||"").toLowerCase();
const hit=list.find(b=>(b.address||"").toLowerCase()===want)||list[0];
process.stdout.write(hit?.resourceId||hit?.resource_id||"");
' "$ME")
import json,os
m=json.loads("""'"$ME"'""")
boxes=(m.get("data") or {}).get("mailboxes") or m.get("mailboxes") or m.get("data") or []
if not isinstance(boxes,list): boxes=[]
want=os.environ.get("FROM","").lower()
hit=next((b for b in boxes if (b.get("address") or "").lower()==want), None) or (boxes[0] if boxes else None)
print((hit or {}).get("resourceId") or (hit or {}).get("resource_id") or "")
PY
)
fi

# Simpler node extract
MID=$(FROM="$FROM" node -e '
let raw=""; process.stdin.on("data",d=>raw+=d); process.stdin.on("end",()=>{
  try {
    const m=JSON.parse(raw);
    const boxes=m?.data?.mailboxes||m?.mailboxes||(Array.isArray(m?.data)?m.data:[])||[];
    const list=Array.isArray(boxes)?boxes:[];
    const want=(process.env.FROM||"").toLowerCase();
    const hit=list.find(b=>(b.address||"").toLowerCase()===want)||list.find(b=>(b.address||"").includes("noreply"))||list[0];
    process.stdout.write(hit?.resourceId||hit?.resource_id||"");
  } catch { process.stdout.write(""); }
});
' <<<"$ME")

if [[ -z "$MID" ]]; then
  echo "ERROR: could not resolve mailbox resourceId"
  exit 1
fi
echo "==> mailbox id: $MID"

if [[ -z "$TO" ]]; then
  echo "OK token works. To send a test: bash scripts/vps-test-hostinger-mail.sh you@gmail.com"
  exit 0
fi

echo "==> POST send to $TO"
curl -sS -X POST "https://api.mail.hostinger.com/api/v1/mailboxes/$MID/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"to\":[\"$TO\"],\"subject\":\"JJ Hostinger API test\",\"text\":\"OTP path OK\",\"html\":\"<b>OTP path OK</b>\",\"displayName\":\"Jackpot Jungle\"}"
echo ""
