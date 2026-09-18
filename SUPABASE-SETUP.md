# OLLIN — Supabase Setup Guide

The app runs in **file mode** today (data stored in `.ollin-*.json` on the server).
Once the steps below are done, it switches to **Supabase mode** automatically —
no code changes needed. File mode remains as an automatic fallback.

---

## 1. Create the project (browser, ~2 minutes)

1. Go to https://supabase.com → **Sign up / Log in**
2. **New project** → pick any name (e.g. `ollin`), a region near you, and a
   database password (save it somewhere).
3. Wait for provisioning to finish.

## 2. Run the database schema

1. In the Supabase dashboard open **SQL Editor → New query**
2. Open `supabase/schema.sql` from this repo, copy **the whole file**, paste it,
   and click **Run**.
3. You should see "Success. No rows returned". This creates:
   `profiles, programs, courses, quizzes, questions, quiz_attempts,
   attempt_answers, saved_quizzes, api_keys, notifications` — with row-level
   security policies.

## 3. Copy the credentials

In **Project Settings → API** you need three values:

| Value | Where it goes |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| anon / public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role key (keep secret!) | `SUPABASE_SERVICE_ROLE_KEY` |

## 4. Configure locally

Edit `quizai/.env.local` (uncomment / replace the placeholder values):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...anon...
SUPABASE_SERVICE_ROLE_KEY=eyJ...service...
```

Restart the dev server.

## 5. Migrate existing data (optional but recommended)

If you already created users, programs, courses, quizzes, or added API keys
while running in file mode, import them into Supabase:

```
# Preview what would be migrated (no writes):
node scripts/migrate-to-supabase.mjs --dry-run

# Run the migration:
node scripts/migrate-to-supabase.mjs
```

The script needs `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local` (step 4 above). It:

- Creates real auth accounts for every user in `.ollin-users.json`, keeping
  their existing passwords so everyone logs in as before
- Remaps all old IDs (like `admin-001`) to proper UUIDs so references stay
  intact across users, courses, quizzes, questions, saved links, attempts,
  and API keys
- Skips anything that already exists in Supabase — safe to re-run
- Never modifies or deletes the `.ollin-*.json` files

Note: attempts whose quiz no longer exists are skipped (they can't be linked).

## 6. Create the admin account

Because accounts are admin-created, bootstrap the first admin this way:

1. Supabase dashboard → **Authentication → Users → Add user**
2. Email: your admin email, Password: your choice, **Auto-confirm: ON**
3. The `on_auth_user_created` trigger creates a profile with role `student` —
   promote it: **Table Editor → profiles** → find your row → set `role = admin`.

Log in on the site with that email/password → you land on `/admin`.

## 7. Deploy to Vercel

**Vercel Project → Settings → Environment Variables** — add the same three
variables (plus your AI keys, see below) for Production + Preview, then
**redeploy**.

### AI keys

The admin **Settings page** key list is stored in the `api_keys` table once
Supabase is connected — so keys added there work on any device and survive
redeploys. Alternatively/additionally set:

- `GROQ_API_KEY` — a single Groq key, or
- `GROQ_API_KEYS` — comma-separated keys (auto-fallback rotation)

## 8. What changes in Supabase mode

| Thing | File mode | Supabase mode |
|---|---|---|
| Accounts | `.ollin-users.json` (plain passwords) | Supabase Auth (hashed) |
| Sessions | signed cookie re-checked against the file | signed cookie re-checked against `profiles` |
| Users/programs/courses/quizzes/attempts | `.ollin-*.json` | database tables with RLS |
| Saved quizzes (admin → course) | `.ollin-saved-quizzes.json` | `saved_quizzes` table |
| API keys + usage stats | `.ollin-config.json` | `api_keys` table |
| Analytics (`/api/attempts/stats`) | file-backed | DB-backed |

Notes:
- Existing demo data does **not** migrate automatically. If you have real
  quizzes/users in the `.ollin-*.json` files you want to keep, export them
  first — ask and a small migration script can be added.
- In Supabase mode, guest (not logged-in) quiz attempts still work: the
  attempts RLS policies allow anonymous inserts on published quizzes.
- The admin Settings page still works before Supabase is connected — it just
  uses the local file.

## Troubleshooting

- **"No account backend configured"** — Supabase env vars are missing on the
  server that handled the request (on Vercel: did you redeploy after adding
  them?).
- **Login fails but the user exists in Supabase** — check the user was
  auto-confirmed; check `profiles` has a row for them.
- **RLS errors in the server logs** — a write route tried the anon key instead
  of the service role; make sure `SUPABASE_SERVICE_ROLE_KEY` is set.
