# First Full Week Runbook

Rollout window: August 24–28, 2026

## Production

- Application: https://allstartracker.netlify.app
- Netlify admin: https://app.netlify.com/projects/allstartracker
- Production branch: `main`
- State backend: Supabase, district `warren-township`
- Functions: `session` at `/api/session`, `state` at `/api/state`

Do not use `allstartracker-stress-20260821.netlify.app` with staff. It is an
isolated load-test deployment and is not Git-linked.

## Opening check

Run this before staff begin work and after any deployment:

```bash
npm run test:production:public
```

The check must report HTTP 200 for the application, HTTP 401 for anonymous API
requests, successful asset loads, and all security headers.

Then complete one manual Liz check without entering test attendance:

1. Sign in with Liz's assigned production PIN.
2. Confirm the header shows Liz's name and `Administrator`.
3. Confirm the shared-data indicator is green and reads `Shared`.
4. Confirm `All Star Performance Tracker` and `Professional Standards` are visible and show `Setup pending · Liz only`.
5. Open Employee Records, verify the expected roster is present, and confirm T-shirt size is visible on an employee card.
6. Open one school and confirm its staff list loads.
7. Log out and confirm the PIN screen returns.

Complete one school-manager check with a school PIN:

1. Confirm the account opens only its assigned school.
2. Confirm another school's URL redirects back to the assigned school.
3. Confirm the `Blackout Calendar` is view-only and roster-management/blackout controls are not available.
4. Confirm `All Star Performance Tracker` and `Professional Standards` are not visible.
5. Open an employee card and confirm no T-shirt size label or value is visible.
6. Log out.

## Staff guidance

1. Use https://allstartracker.netlify.app only.
2. Enter the PIN assigned for the person's role or school.
3. Wait for the green `Shared` indicator before entering attendance.
4. After a change, wait for `Saving` to return to `Shared`.
5. If the indicator says `Retrying`, keep the browser open and reconnect to the
   network. Do not repeat the same attendance entry on another device.
6. Use `Lock & Log Out` before handing a shared device to someone else.

## Daily monitoring

At the start and end of each day:

1. Run `npm run test:production:public`.
2. Review Netlify function logs for `session-error`, `state-error`, HTTP 429,
   or sustained response times above two seconds.
3. Confirm the most recent production deploy is `ready` in Netlify.
4. Ask Liz whether any site reports a persistent `Retrying` indicator or a
   missing employee/location.

Never run `tests/remote/deployment-verification.mjs` against production during
the rollout. It writes concurrent load-test attendance records. Use the stress
site for that test.

## Incident response

If sign-in fails for everyone:

1. Check the `session` function logs.
2. Confirm `ATTENDANCE_ACCESS_CODES_JSON` and `ATTENDANCE_SESSION_SECRET` still
   exist in the production environment context.
3. Do not replace either secret until the replacement PIN distribution and
   forced session reset have been coordinated.

If attendance reads or saves fail:

1. Stop staff from making further changes and keep affected browser tabs open.
2. Capture the visible request ID and time of the error.
3. Check the `state` function logs and Supabase project health.
4. Do not switch production back to Netlify Blobs; it does not provide the
   concurrency guarantees required for shared attendance editing.

If a new deployment causes the problem, restore the previous known-good deploy
from the Netlify Deploys page. Restoring the application does not roll back
Supabase data, so database recovery must be handled separately from code
rollback.

## Items requiring an owner check

- Confirm Liz's PIN and at least one school PIN work in production.
- Confirm Supabase backup or point-in-time recovery coverage in the Supabase
  dashboard before the first live attendance entry.
- Confirm the production PIN map includes every school expected to participate
  this week and that each `locationId` exactly matches a location in the app.
