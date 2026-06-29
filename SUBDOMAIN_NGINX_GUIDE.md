# Nginx Subdomain Configuration Guide

This guide explains how to configure Nginx on your VPS to match the new subdomain-isolated infrastructure architecture for **playjackpotjungle.com**.

---

## 1. Prerequisites & DNS Setup

Ensure the following DNS **A records** point to your VPS IP address:

```text
playjackpotjungle.com        →  <VPS-IP>
www.playjackpotjungle.com    →  <VPS-IP>
admin.playjackpotjungle.com  →  <VPS-IP>
chat.playjackpotjungle.com   →  <VPS-IP>
api.playjackpotjungle.com    →  <VPS-IP>
ws.playjackpotjungle.com     →  <VPS-IP>
cdn.playjackpotjungle.com    →  <VPS-IP>
```

---

## 2. Obtain SSL Certificates

Run Certbot to fetch wildcard/multi-domain certificates:

```bash
sudo certbot certonly --nginx \
  -d playjackpotjungle.com \
  -d www.playjackpotjungle.com \
  -d admin.playjackpotjungle.com \
  -d chat.playjackpotjungle.com \
  -d api.playjackpotjungle.com \
  -d ws.playjackpotjungle.com \
  -d cdn.playjackpotjungle.com
```

---

## 3. Nginx Server Configuration File

Create or update your site config (e.g. `/etc/nginx/sites-available/playjackpotjungle.com`):

```nginx
# ────────────────────────────────────────────────────────
# 1. PRIMARY SITE & APP (playjackpotjungle.com)
# ────────────────────────────────────────────────────────
server {
    listen 80;
    server_name playjackpotjungle.com www.playjackpotjungle.com;
    return 301 https://playjackpotjungle.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name playjackpotjungle.com www.playjackpotjungle.com;

    ssl_certificate     /etc/letsencrypt/live/playjackpotjungle.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/playjackpotjungle.com/privkey.pem;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ────────────────────────────────────────────────────────
# 2. ADMIN PORTAL (admin.playjackpotjungle.com)
# ────────────────────────────────────────────────────────
server {
    listen 80;
    server_name admin.playjackpotjungle.com;
    return 301 https://admin.playjackpotjungle.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name admin.playjackpotjungle.com;

    ssl_certificate     /etc/letsencrypt/live/playjackpotjungle.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/playjackpotjungle.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ────────────────────────────────────────────────────────
# 3. BROWSER CHAT (chat.playjackpotjungle.com)
# ────────────────────────────────────────────────────────
server {
    listen 80;
    server_name chat.playjackpotjungle.com;
    return 301 https://chat.playjackpotjungle.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name chat.playjackpotjungle.com;

    ssl_certificate     /etc/letsencrypt/live/playjackpotjungle.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/playjackpotjungle.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ────────────────────────────────────────────────────────
# 4. API SUBDOMAIN (api.playjackpotjungle.com)
# ────────────────────────────────────────────────────────
server {
    listen 80;
    server_name api.playjackpotjungle.com;
    return 301 https://api.playjackpotjungle.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.playjackpotjungle.com;

    ssl_certificate     /etc/letsencrypt/live/playjackpotjungle.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/playjackpotjungle.com/privkey.pem;

    location / {
        # Proxy to local self-hosted Supabase Kong API gateway
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # CORS Preflight
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE, PATCH';
            add_header 'Access-Control-Allow-Headers' '*';
            add_header 'Access-Control-Max-Age' 1728000;
            return 204;
        }
    }
}

# ────────────────────────────────────────────────────────
# 5. WEBSOCKET SUBDOMAIN (ws.playjackpotjungle.com)
# ────────────────────────────────────────────────────────
server {
    listen 80;
    server_name ws.playjackpotjungle.com;
    return 301 https://ws.playjackpotjungle.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ws.playjackpotjungle.com;

    ssl_certificate     /etc/letsencrypt/live/playjackpotjungle.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/playjackpotjungle.com/privkey.pem;

    location / {
        # Proxy to local self-hosted Realtime server
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}

# ────────────────────────────────────────────────────────
# 6. CDN STATIC ASSETS (cdn.playjackpotjungle.com)
# ────────────────────────────────────────────────────────
server {
    listen 80;
    server_name cdn.playjackpotjungle.com;
    return 301 https://cdn.playjackpotjungle.com$request_uri;
}

server {
    listen 443 ssl http2;
    server_name cdn.playjackpotjungle.com;

    ssl_certificate     /etc/letsencrypt/live/playjackpotjungle.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/playjackpotjungle.com/privkey.pem;

    location / {
        # Proxy to local self-hosted Supabase storage public buckets path
        proxy_pass http://127.0.0.1:8000/storage/v1/object/public/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Enable client-side asset caching (1 year)
        expires 365d;
        add_header Cache-Control "public, no-transform";
    }
}
```

---

## 4. Apply Nginx Changes

Run tests and reload configuration:

```bash
sudo nginx -t
sudo systemctl reload nginx
```
