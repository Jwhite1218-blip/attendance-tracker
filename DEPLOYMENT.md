# Deployment

## The live site

**https://allstartracker.netlify.app** — Netlify site `allstartracker` (site id `1b4288a8-b393-4521-9aa0-0e63a29c3496`, team `jwhite1218`).

This is Git-linked to `github.com/Jwhite1218-blip/attendance-tracker` via Netlify's GitHub App integration: every push to `main` triggers an automatic build and deploy, usually live within ~20 seconds. That link won't show up via `gh api repos/.../hooks` (that only lists classic webhooks) — check the Netlify dashboard's Deploys tab, or look for a `netlify/allstartracker/deploy-preview` check on a PR, if you need to confirm it's still wired up.

Both Netlify Functions (`session`, `state`) deploy as part of that same build — there's nothing separate to configure for them.

## The retired site

**https://localis-attendance-review.netlify.app** — an older, unrelated deploy. As of 2026-08-21 it has no functions and no environment variables, and its last deploy was a one-off manual `netlify deploy` from 2026-08-19 — it is **not** Git-linked and does **not** update automatically. It predates the current app and isn't used by anyone day-to-day. Safe to delete once you've confirmed nobody still has that URL bookmarked (in particular, double-check the district's read-only reviewer(s) — the "Localis" watermarked review role now lives on the real site's own PIN list, not a separate deployment).

## Environment variables (production)

Set on the `allstartracker` site, **production context specifically** — `netlify env:list` with no flags only shows the `dev` context and will look empty even when production is fully configured. Use:

```bash
netlify env:list --context production --json
```

Required:
- `ATTENDANCE_ACCESS_CODES_JSON` — PIN → role/location/permissions map
- `ATTENDANCE_SESSION_SECRET` — HMAC signing secret for session cookies
- `ATTENDANCE_STATE_BACKEND` — currently `supabase` (see below)
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_DISTRICT_SLUG` — required when the backend above is `supabase`

## State backend

`ATTENDANCE_STATE_BACKEND=supabase` is intentional, not a leftover default. The
production migration from Netlify Blobs was verified on August 24, 2026 (see
`supabase/migrations/`). Production shared state is now live data: do not reset,
reseed, clear, or replace `legacy_state_entries`. `.env.example` keeps local
development on `blobs`, which is appropriate for local work and the isolated
stress site; it does not need to match production.

## Where this fits

This app is being built for Warren Township MSD first, with an eye toward becoming a cloneable multi-district product afterward (see the Supabase schema's district/school tenancy). Until it's proven stable, prioritize crash/data-integrity fixes over new features — see repo commit history around "stability sweep" for the kind of review this warrants periodically.
