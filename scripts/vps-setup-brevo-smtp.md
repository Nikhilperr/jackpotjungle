# Fix OTP email on DigitalOcean (Brevo port 2525)

Hostinger `smtp.hostinger.com:465/587` is blocked on DO.
Use **Brevo free** SMTP on **port 2525** (usually open) + domain auth so mail hits **Inbox**.

## 1) Create Brevo account
https://app.brevo.com → free plan

## 2) Get SMTP login + key
Brevo → **SMTP & API** → **SMTP** tab  
Copy:
- Login (email like `...@smtp-brevo.com`)
- SMTP key (password)

## 3) Authenticate your domain (stops spam)
Brevo → **Senders, domains** → add `playjackpotjungle.com`  
Add the DNS records they show (SPF + DKIM) at your domain DNS.  
Verify sender: `noreply@playjackpotjungle.com`

## 4) On the VPS app `.env`
```bash
nano ~/app/.env
```

Add (keep Hostinger lines if you want; app will prefer Brevo):
```bash
BREVO_SMTP_LOGIN=your_brevo_smtp_login
BREVO_SMTP_KEY=your_brevo_smtp_key
MAIL_FROM=noreply@playjackpotjungle.com
```

Optional HTTPS instead of SMTP:
```bash
BREVO_API_KEY=xkeysib-...
```

## 5) Deploy
```bash
cd ~/app
git pull
npm run build
pm2 restart all --update-env
```

## 6) Test port 2525
```bash
timeout 5 bash -c 'echo >/dev/tcp/smtp-relay.brevo.com/2525' && echo OK || echo FAIL
```

## 7) Send OTP and check logs
```bash
pm2 logs --lines 40 | grep Mail
# expect: [Mail] Sent via Brevo SMTP :2525
```
