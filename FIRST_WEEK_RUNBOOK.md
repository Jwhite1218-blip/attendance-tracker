# First Full Week Runbook

Rollout window: August 24–28, 2026

## Production

- Application: https://allstartracker.netlify.app
- Netlify admin: https://app.netlify.com/projects/allstartracker
- Production branch: `main`
- State backend: Supabase, district `warren-township`
- Functions: `session` at `/api/session`, `state` at `/api/state`

## Isolated testing clone

- Application: https://allstartracker-stress-20260821.netlify.app
- Netlify admin: https://app.netlify.com/projects/allstartracker-stress-20260821
- State backend: isolated Netlify Blobs test data
- Current security-patch validation deploy: `6a8bd8ed12e8bed0fcb789e8`

Do not use `allstartracker-stress-20260821.netlify.app` with staff. It is an
isolated load-test deployment and is not Git-linked.

## Verified launch baseline — August 24, 2026

- 44 automated tests pass and the production build completes.
- The production dependency audit reports zero known vulnerabilities.
- The testing clone passes the public readiness check after the React Router
  7.18.2 security update: application and assets load, anonymous API requests
  return 401, and all required security headers are present.
- The production roster has 146 unique employees across 15 schools plus
  District Admin. The two blank birthdays match the source import note.
- All 146 T-shirt-size fields are blank by design until Liz supplies the Excel
  sheet. The previous single test value was removed on August 24.
- Production shared state has 19 valid attendance records with no malformed
  dates, mismatched embedded dates, unknown codes, or invalid JSON shapes.
- The blackout calendar has 27 unique valid dates. The first date is Labor Day,
  September 7, 2026; September 8 is also recorded as E Learning. There are no
  blackout dates in the August 24–28 opening week.
- Supabase is on the Pro plan and daily physical backups are active. The most
  recent backup visible during this audit was August 23, 2026 at 08:10:38 UTC.
  Point-in-time recovery is not enabled; daily restore points are the current
  recovery method.

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
5. Open Employee Records, verify the expected roster is present, and confirm the T-shirt-size field is visible on an employee card. A blank size is expected until Liz supplies the values.
6. Open one school and confirm its staff list loads.
7. Log out and confirm the PIN screen returns.

Complete one school-manager check with a school PIN:

1. Confirm the account opens only its assigned school.
2. Confirm another school's URL redirects back to the assigned school.
3. Confirm the `Blackout Calendar` is view-only and roster-management/blackout controls are not available.
4. Confirm `All Star Performance Tracker` and `Professional Standards` are not visible.
5. Open an employee card and confirm no T-shirt size label or value is visible.
6. Log out.

Complete one restricted-district check with the Marlene/Reese or Jayden/Jess PIN:

1. Confirm the district dashboard and attendance workflows are available.
2. Confirm `Blackout Calendar` is not in navigation and `/calendar` redirects to the dashboard.
3. Confirm employee-card edit, add, reactivate, and roster-management controls are not available.
4. Confirm T-shirt size, `All Star Performance Tracker`, and `Professional Standards` are not visible.
5. Log out.

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

- Using the existing full PIN roster, confirm representative Liz, restricted-district, and school PINs enforce the expected permissions above.
- Confirm with Liz that the consolidated Employee Records and weekly school
  workflows are accepted as the replacement for the former duplicate Quick
  Mark screen.
