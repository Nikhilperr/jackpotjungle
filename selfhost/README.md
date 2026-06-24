# Self-Hosted Supabase Catch-Up Package

Everything required to make a self-hosted VPS Supabase identical to the
cloud instance this project was built against. Run in the order below.

## Files in this folder

| File | What it is |
|---|---|
| `01_public_schema.sql` | Complete `pg_dump --schema-only --schema=public` of the cloud DB. Contains all 23 tables, 51 RLS policies, 8 functions, triggers, enums, and constraints. |
| `02_storage_auth_realtime.sql` | Storage buckets + RLS, `auth.users` → `handle_new_user` trigger, realtime publication + `REPLICA IDENTITY FULL`. Things `pg_dump` of the `public` schema does NOT cover. |

Both files are **idempotent** — safe to re-run.

---

## Audit results (what was missing on the VPS)

The codebase itself has **no cloud-Supabase URL hardcoded anywhere**. I
grepped everything:

- `src/integrations/supabase/client.ts` reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — already correct.
- `src/integrations/supabase/client.server.ts` reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — already correct.
- `src/integrations/supabase/auth-middleware.ts` reads `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` — already correct.
- `src/hooks/usePresence.ts` uses `import.meta.env.VITE_SUPABASE_URL` for `sendBeacon` — already correct.
- No `supabase/functions/` directory — **no edge functions to redeploy**.
- `supabase/config.toml` contains the old cloud `project_id`. It is only used by the Supabase CLI on the cloud project; the self-hosted runtime ignores it. Leave it alone.

So the only thing wrong on the VPS is the **database side**: missing
storage buckets, missing `on_auth_user_created` trigger, missing realtime
publication. Plus your VPS `.env` must point at `db.chancerealm.casino`.

---

## Deployment — exact commands

### Step 1 — Make sure the Supabase stack is healthy

```bash
cd /path/to/supabase/docker
docker compose ps          # auth, rest, realtime, storage, db all "Up"
docker compose logs -f db  # quick sanity check, Ctrl-C
```

### Step 2 — Apply schema + catch-up SQL

```bash
# Copy these two files onto the VPS (scp, git pull, however you ship code)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f selfhost/01_public_schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f selfhost/02_storage_auth_realtime.sql
```

`$DATABASE_URL` looks like
`postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres`.

If `01_` errors with "relation already exists" you've already applied the
per-feature migrations — skip it and run only `02_`.

### Step 3 — Restart realtime so it picks up the publication

```bash
docker compose restart realtime
```

This fixes `ErrorConnectingToWebsocket: {:error, :signature_error}` —
that error usually means realtime started before the publication existed
**or** its JWT secret doesn't match the auth container (see Step 4).

### Step 4 — Frontend `.env` on the VPS

This is what fixes "Missing Supabase environment variable(s)" on the
Broadcast page (it's thrown by `client.server.ts` from a server function).

```env
# Browser-visible (Vite inlines at build time)
VITE_SUPABASE_URL=https://db.chancerealm.casino
VITE_SUPABASE_PUBLISHABLE_KEY=<your self-hosted ANON key>
VITE_SUPABASE_PROJECT_ID=self-hosted

# Server-side (read by Nitro/Node at runtime)
SUPABASE_URL=https://db.chancerealm.casino
SUPABASE_PUBLISHABLE_KEY=<same ANON key>
SUPABASE_SERVICE_ROLE_KEY=<your self-hosted SERVICE_ROLE key>
```

**Critical:** the JWT secret used to mint these ANON / SERVICE_ROLE keys
must be the same `JWT_SECRET` configured in the `realtime` and `auth`
containers' env. Mismatch = `signature_error` on the websocket.

Then rebuild and restart:

```bash
bun install
bun run build        # produces .output/
pm2 restart nitro    # or whatever you named the process
```

`VITE_*` vars are baked into the JS bundle at build time — you MUST
rebuild after changing them. `SUPABASE_*` (non-VITE) are read at runtime
by PM2/Nitro, so PM2 must be restarted with the new env loaded.

### Step 5 — Recreate your admin user

The `on_auth_user_created` trigger only fires on NEW signups. Existing
users created before Step 2 have no profile row. For each of them:

```sql
INSERT INTO public.profiles (id, username, email, friend_code, referral_code)
SELECT u.id,
       split_part(u.email,'@',1),
       u.email,
       public.gen_code('JJM'),
       public.gen_code('JJREF')
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.page_conversations (user_id)
SELECT u.id FROM auth.users u
ON CONFLICT DO NOTHING;
```

Then promote yourself:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<your-auth-user-uuid>', 'super_admin')
ON CONFLICT DO NOTHING;
```

---

## Verification — prove the VPS matches cloud

Run every check below. Expected output is in the comment.

```bash
# 1. Tables — expect 23
psql "$DATABASE_URL" -At -c \
  "select count(*) from pg_tables where schemaname='public';"

# 2. RLS policies — expect 51
psql "$DATABASE_URL" -At -c \
  "select count(*) from pg_policies where schemaname='public';"

# 3. Functions — expect 8
psql "$DATABASE_URL" -At -c \
  "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"

# 4. Storage buckets — expect avatars, chat-audio, chat-images
psql "$DATABASE_URL" -At -c "select id from storage.buckets order by 1;"

# 5. Storage RLS policies — expect 4
psql "$DATABASE_URL" -At -c \
  "select count(*) from pg_policies where schemaname='storage' and tablename='objects';"

# 6. Auth trigger — expect on_auth_user_created
psql "$DATABASE_URL" -At -c \
  "select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;"

# 7. Realtime publication — expect 7 tables
psql "$DATABASE_URL" -At -c \
  "select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1;"
# calls
# friend_requests
# friendships
# messages
# page_conversations
# page_messages
# spam_list

# 8. handle_new_user triggers correctly — sign up a brand new user via the UI,
#    then:
psql "$DATABASE_URL" -At -c \
  "select count(*) from public.profiles where id=(select id from auth.users order by created_at desc limit 1);"
# expect: 1
```

### Frontend smoke tests

1. Sign up a brand new email → check it lands in `profiles` + `user_roles` + `page_conversations`.
2. Open two browsers, send a message → message appears live without refresh (realtime OK).
3. Upload an avatar → check `storage.objects` has the row (buckets OK).
4. Open admin Broadcast page → no "Missing Supabase environment variable(s)" error (server env OK).
5. Send a broadcast to "all" → recipients see it instantly (admin server fn + realtime OK).

---

## Troubleshooting the three symptoms you reported

| Symptom | Root cause | Fix |
|---|---|---|
| **"Missing Supabase environment variable(s)" on Broadcast** | `client.server.ts` throws when `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing from the **server-side** env. Vite-only vars (`VITE_*`) are not enough — PM2 needs both. | Step 4 above, then `pm2 restart nitro --update-env`. |
| **Some admin features fail** | Almost always either (a) your user is missing the `super_admin` row in `user_roles`, or (b) `SUPABASE_SERVICE_ROLE_KEY` not loaded server-side (same as above). | Step 5 above. |
| **`ErrorConnectingToWebsocket: {:error, :signature_error}`** | Realtime container's `JWT_SECRET` doesn't match the secret used to mint your ANON key. Or the publication didn't exist when realtime started. | Step 3 + verify `JWT_SECRET` env is identical across `auth`, `rest`, and `realtime` containers in `docker-compose.yml`. Then `docker compose restart realtime`. |
