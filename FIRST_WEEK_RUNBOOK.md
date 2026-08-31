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
- Current release-candidate validation deploy: `6a8c2de20407f6aeefea4523`

Do not use `allstartracker-stress-20260821.netlify.app` with staff. It is an
isolated load-test deployment and is not Git-linked.

## Verified launch baseline — August 24, 2026

- 56 automated tests pass and the production build completes.
- The production dependency audit reports zero known vulnerabilities.
- The testing clone passes the public readiness check after the React Router
  7.18.2 security update: application and assets load, anonymous API requests
  return 401, and all required security headers are present.
- The production roster has 146 unique employees across 15 schools plus
  District Admin. The two blank birthdays match the source import note.
- All 146 T-shirt-size fields are blank by design until Liz supplies the Excel
  sheet. The previous single test value was removed on August 24.
- Production attendance and HR progress were reset for launch on August 24,
  2026 (`updated_by = 'Localis launch reset 2026-08-24'`, 10 keys, 14 audit
  events). **That reset is no longer the current state** — real usage began the
  same day. As of August 30, 2026 `legacy_state_entries` holds 44 keys, 38 of
  them per-employee attendance records. Do not treat this table as empty, and
  do not re-run the reset without a fresh backup.
- Week-one adoption was narrow: only 3 of 15 schools have written any data.
  Warren Central HS (26 keys, Aug 24–28), Creston MS (2 keys, Aug 28) and
  Stony Brook MS (2 keys, Aug 28), plus 4 keys written by Liz. The remaining
  12 schools have never written. Verify this is a training gap and not a
  login or permissions problem before drawing conclusions from the data.
- The blackout calendar has **66** unique dates, each with a distinct
  date/label pair. The earliest is July 1, 2026 — not Labor Day, as an earlier
  revision of this runbook stated. Labor Day, September 7 and E Learning,
  September 8 are both recorded. **There are no blackout dates between
  September 1 and 4, so the September 2 launch day is clear.**
- Supabase is on the Pro plan and daily physical backups are active.
  Point-in-time recovery is **not** enabled, so the recovery floor is the last
  daily snapshot — up to 24 hours of loss. Check the current backup timestamp
  in the dashboard rather than trusting a figure recorded here; any date in
  this document is stale the day after it is written.

> Counts above were verified against production on August 30, 2026. Re-verify
> before relying on them; earlier revisions of this file carried figures that
> had silently gone stale.

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
5. Confirm birthday and anniversary dashboard totals are populated from the district roster.
6. Open an employee card, update the shared HR note, and confirm the note is visible from a second restricted-district login.
7. Confirm a qualifying employee shows the same HR occurrence alert for the restricted manager and Liz.
8. Log out.

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

## End-of-day email activation

The end-of-day report code is safe to deploy while disabled. The initial live
recipient is Jon, who will review and manually forward accepted reports to Liz.
Test and stress sites must remain disabled.

Current production staging status on August 24, 2026:

- Jon's review address is stored as a protected production Functions-only
  environment variable. Liz is not a direct recipient yet.
- The Localis sender, tracker URL, Indianapolis time zone, and 5:00 PM hour are
  staged in the production context.
- `ATTENDANCE_REPORT_ENABLED=false` while the production function deploy is
  verified.
- `RESEND_API_KEY` is stored as a protected production Functions-only secret.
  DKIM and both Resend CNAME records resolve publicly.
- The isolated test clone has no real recipient, mail credential, or Supabase
  production secret.

For the controlled first delivery:

1. Deploy the reviewed report code to production while
   `ATTENDANCE_REPORT_ENABLED=false`.
2. Confirm production has `ATTENDANCE_REPORT_TO`, `ATTENDANCE_REPORT_FROM`,
   `ATTENDANCE_REPORT_SITE_URL`, `ATTENDANCE_REPORT_TIME_ZONE`, and a
   sending-only `RESEND_API_KEY`.
3. Confirm the recipient is Jon only and that comments/employee-card details
   are absent from the generated message.
4. Enable the production flag, use the scheduled function's `Run now` control,
   and confirm receipt directly with Jon before he forwards it to Liz.
5. Check the function log for a single `sent` result and provider delivery ID.
6. Confirm a test/clone invocation reports `disabled` and sends nothing.

If the controlled delivery fails, immediately return
`ATTENDANCE_REPORT_ENABLED` to `false`, keep the provider error/request ID, and
correct the sender-domain or API-key configuration before retrying.

## Live cleanup and Liz PIN activation

The district-wide test reset was approved and completed on August 24, 2026.
Independent verification returned zero attendance records, zero current
HR-progress records, zero legacy HR flags, and zero non-empty target state
containers. Existing audit history and all non-target state were preserved.

Liz's production PIN has not been rotated. When the replacement PIN is ready,
set it as a secret, reload Liz's browser, confirm the old PIN/session fail, and
confirm a representative school PIN remains active.

## Incident response

If sign-in fails for everyone:

1. Check the `session` function logs.
2. Confirm `ATTENDANCE_ACCESS_CODES_JSON` and `ATTENDANCE_SESSION_SECRET` still
   exist in the production environment context.
3. Do not replace either secret until the replacement PIN distribution and
   forced session reset have been coordinated.

For a targeted Liz PIN rotation, set `ATTENDANCE_LIZ_EMPLOYEE_ID` and the secret
`ATTENDANCE_LIZ_REPLACEMENT_PIN`. The application removes the original Liz PIN
at runtime, rejects pre-rotation Liz sessions on their next request, and leaves
other staff sessions active. Remove the replacement variable only if the full
PIN roster has first been updated with the intended permanent Liz PIN.

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
