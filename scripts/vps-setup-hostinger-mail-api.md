# Fix OTP email using Hostinger HTTPS API (recommended)

DigitalOcean **blocks SMTP ports 465/587**. Your Hostinger password is fine —
the VPS simply cannot open those ports. Hostinger’s **Mail REST API uses HTTPS :443**,
which works from the droplet and sends from `noreply@playjackpotjungle.com` (good inbox reputation).

## 1) Create API token in Hostinger

1. Log into **hPanel** (Hostinger)
2. Open **Emails** → **Agentic Mail** (or Email → API)
3. **Create API token**
4. Access: **All mailboxes** (or at least `noreply@playjackpotjungle.com`)
5. Permissions: **Manage all SMTP/IMAP actions**
6. **Copy the token once** (shown only once)

## 2) Put token on the VPS app

```bash
cd ~/app
nano .env
```

Add:

```bash
HOSTINGER_MAIL_TOKEN=paste_token_here
MAIL_FROM=noreply@playjackpotjungle.com
```

Optional (only if auto-detect fails):

```bash
# Get id: curl -s https://api.mail.hostinger.com/api/v1/me -H "Authorization: Bearer TOKEN"
HOSTINGER_MAILBOX_ID=ACxxxxxxxx
```

## 3) Deploy

```bash
cd ~/app
git pull
npm run build
pm2 restart all --update-env
```

## 4) Verify token works

```bash
curl -s https://api.mail.hostinger.com/api/v1/me \
  -H "Authorization: Bearer $(grep HOSTINGER_MAIL_TOKEN ~/app/.env | cut -d= -f2-)"
```

You should see JSON with your mailbox `address` + `resourceId`.

## 5) Test OTP

Send login/forgot OTP from the app, then:

```bash
pm2 logs --lines 40 | grep Mail
# expect: [Mail] Sent via Hostinger Mail API
```

## Why this fixes spam + delivery

- Mail leaves **Hostinger’s mail infrastructure** (not your DO IP)
- From address stays `noreply@playjackpotjungle.com`
- No SMTP port block on the droplet
