# Deployment

## The live site

**https://allstartracker.netlify.app** — Netlify site `allstartracker` (site id `1b4288a8-b393-4521-9aa0-0e63a29c3496`, team `jwhite1218`).

This is Git-linked to `github.com/Jwhite1218-blip/attendance-tracker` via Netlify's GitHub App integration: every push to `main` triggers an automatic build and deploy, usually live within ~20 seconds. That link won't show up via `gh api repos/.../hooks` (that only lists classic webhooks) — check the Netlify dashboard's Deploys tab, or look for a `netlify/allstartracker/deploy-preview` check on a PR, if you need to confirm it's still wired up.

All Netlify Functions (`session`, `state`, and the disabled-by-default
`end-of-day-report` schedule) deploy as part of that same build — there is no
separate application deploy for them.

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
- `ATTENDANCE_LIZ_EMPLOYEE_ID` — stable identifier used to target Liz's access entry during a PIN rotation
- `ATTENDANCE_LIZ_REPLACEMENT_PIN` — optional secret replacement PIN; setting it disables the original Liz PIN and rejects existing Liz sessions without logging out other staff
- `ATTENDANCE_STATE_BACKEND` — currently `supabase` (see below)
- `ATTENDANCE_REPORT_ENABLED` — `true` only on production after recipient and sender acceptance
- `ATTENDANCE_REPORT_TO` — approved report-review recipient; currently Jon,
  until direct delivery to Liz is authorized
- `ATTENDANCE_REPORT_FROM` — sender at the verified mail domain
- `ATTENDANCE_REPORT_SITE_URL` — secure tracker link included in the report
- `ATTENDANCE_REPORT_TIME_ZONE` — `America/Indiana/Indianapolis`
- `ATTENDANCE_REPORT_HOUR` — local 24-hour send hour; `17` means 5:00 PM
- `RESEND_API_KEY` — sending-only key for the verified mail domain
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_DISTRICT_SLUG` — required when the backend above is `supabase`

## State backend

`ATTENDANCE_STATE_BACKEND=supabase` is intentional, not a leftover default. The
production migration from Netlify Blobs was verified on August 24, 2026 (see
`supabase/migrations/`). Production shared state is now live data: do not reset,
reseed, clear, or replace `legacy_state_entries`. `.env.example` keeps local
development on `blobs`, which is appropriate for local work and the isolated
stress site; it does not need to match production.

## End-of-day email report

The scheduled report is a Localis-owned reporting module with a replaceable
email-delivery adapter. It creates one weekday snapshot for the current local
date, grouped by location and attendance code. The email includes employee
name, location, and attendance code only. It deliberately excludes attendance
comments, employee notes, birthdates, shirt sizes, payroll fields, and other
employee-card details. Weekends and configured district blackout dates are
skipped.

Netlify schedules in UTC, so the function runs at both UTC times that can map to
5:00 PM Indianapolis time and sends only when its time-zone guard matches. The
provider idempotency key includes the report date, preventing a retry from
sending a duplicate daily email.

Before production activation:

1. Confirm the approved review recipient and report fields. The first live
   deliveries are routed to Jon for review and manual forwarding to Liz.
2. Verify a sending domain with Resend and create a sending-only API key.
3. Set all report variables in the production context, leaving
   `ATTENDANCE_REPORT_ENABLED=false` until the first controlled send.
4. Keep `ATTENDANCE_REPORT_ENABLED=false` on every test or stress site and do
   not place Liz's real address or production mail key there.
5. Use Netlify's scheduled-function `Run now` control for the first approved
   production delivery, confirm receipt with Jon, then leave the automated
   weekday schedule enabled only after the message is accepted.

Resend is a commodity delivery provider: report logic and formatting do not
depend on its SDK and can be moved to an approved district mail service. The
production email will transmit the limited report fields above to the selected
provider, so provider/privacy approval is required before activation.

## Where this fits

This app is being built for Warren Township MSD first, with an eye toward becoming a cloneable multi-district product afterward (see the Supabase schema's district/school tenancy). Until it's proven stable, prioritize crash/data-integrity fixes over new features — see repo commit history around "stability sweep" for the kind of review this warrants periodically.
