# Attendance Tracker — Project State

Last verified: 2026-09-03

## Current stage
Production / live pilot.

## Canonical source
- Repository: `Jwhite1218-blip/attendance-tracker`
- Canonical branch: `main`
- Production site: `allstartracker`
- Production URL: `https://allstartracker.netlify.app`
- Verified production commit: `a2fff81d71b3d1c26b83919743d553ee2d73398f`

## Environment roles
- Production: `allstartracker` — Supabase-backed live data and the enabled end-of-day report.
- Deploy previews: test-only. `ATTENDANCE_STATE_BACKEND=blobs`, report sending disabled, and `VITE_TEST_ENVIRONMENT_LABEL=Preview — test data`.
- Dedicated stress lab: `allstartracker-stress-20260821` — use only for isolated destructive/stress testing; do not treat it as the newest product version.
- Archived legacy site: `archive-attendance-stress-old` — team-only; do not build or deploy to it.

## Current milestone
Keep the live attendance workflow stable while making every review/test change traceable and isolated from production data.

## Current rules
- Start all normal feature work from current `main`.
- Production changes must be committed before deployment.
- A deploy preview must never use production Supabase credentials or send attendance reports.
- Do not create another permanent Netlify test site for convenience.

## Next three actions
1. Verify the next deploy preview visibly shows the test label and reads/writes through Blobs.
2. Reconcile any stress-lab-only code into a named Git branch if it is still worth keeping; otherwise retire the dedicated stress lab when testing is complete.
3. Keep live feature work narrow and tied to actual school/user workflow requests.
