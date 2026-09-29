# Attendance Tracker — Project State

Last verified: 2026-09-28

## Current stage
Production / live pilot. Liz demonstrates the All-Star recognition work on
2026-09-29.

## Canonical source
- Repository: `Jwhite1218-blip/attendance-tracker`
- Canonical branch: `main`
- Production site: `allstartracker`
- Production URL: `https://allstartracker.netlify.app`
- Verified production commit: `81971f04b56de2816afb018eb196ea119f0ede4a`

## Environment roles
- Production: `allstartracker` — Supabase-backed live data and the enabled end-of-day report.
- Deploy previews: test-only. `ATTENDANCE_STATE_BACKEND=blobs`, report sending disabled, and `VITE_TEST_ENVIRONMENT_LABEL=Preview — test data`. Confirmed applied at build time on 2026-09-28.
- Dedicated stress lab: `allstartracker-stress-20260821` — use only for isolated destructive/stress testing; do not treat it as the newest product version.
- Archived legacy site: `archive-attendance-stress-old` — team-only; do not build or deploy to it.

## Current milestone
Keep the live attendance workflow stable while making every review/test change traceable and isolated from production data.

## Current rules
- Start all normal feature work from current `main`.
- Production changes must be committed before deployment.
- A deploy preview must never use production Supabase credentials or send attendance reports.
- Do not create another permanent Netlify test site for convenience.
- `vite build` passing is not evidence a page renders. esbuild emits references
  to undefined identifiers without complaint — a missing import shipped to
  production on 2026-09-28 with a green build and 192 passing tests. Scan for
  JSX components that are neither imported nor declared before shipping.

## Shipped 2026-09-27 / 28

**Recognition.** The printed Star of the Day card now matches Liz's paper
version, using the Aramark mark and gold star extracted from her own artwork.
Her All-Stars banner replaces the hand-built hero and is a live surface: the
star's hollow carries the month's count and the board beneath fills with
whoever was recognised. Leaderboard condensed to a top ten, consolidated into
one tabbed panel in the side column, with ties at the cut all kept. Shout-Outs
and Shooting Stars now read differently from the daily star. Cards print as a
six-up sheet or singly from an employee's record. Recognitions open to show who
gave them and what they wrote. Recording a star previews the card first. Stars
by building, by month, expandable to who earned them.

**Manager split.** The eighteen manager-grade staff — fifteen Worker Leads, two
Managers, the Director — have their own leaderboard in blue and are out of
their building's monthly drawing, which now says so rather than silently
dropping them. Membership is read from the roster's `position`, so no live
record was rewritten. `drawManagerAllStar` and `getManagerDrawingEntries` exist
and are tested but are not wired to any screen.

**Language.** EN/ES toggle on the sign-in screen and in the header, remembered
per device. Warren's own vocabulary — sixty terms across attendance codes, HR
occurrence stages and recognition wording — is drafted in Spanish and shown in
place, with a notice saying it is under review. Setting `APPROVAL` in
`src/data/programVocabulary.js` removes the notice; a test fails if the notice
is removed while approval is unset.

**Safety.** `RouteErrorBoundary` wraps the routed content so one failing page
cannot empty the whole app.

## Open, waiting on Liz
1. **ACE Bucks / Leadership Track.** Programme document supplied 2026-09-28;
   scope is building leaders recognising peers across food service and the
   admin team. Five questions still block build — who awards one, any cap, is
   there a manager drawing, does it print a card, and whether employee
   milestone names change from Bronze/Silver/Gold to Rookie All-Star/Rising
   Star/MVP/Hall of Fame/All-Star Legend.
2. **Spanish sign-off** on the sixty drafted terms.
3. Whether "other" belongs on the printed card, and whether the card should be
   bilingual.

## Open, waiting on Jon
1. **Deploy previews are publicly reachable and accept real district PINs**
   (`ATTENDANCE_ACCESS_CODES_JSON` is scoped to all contexts). A password under
   Visitor access, scoped to previews only, closes it. PIN work is deferred by
   decision.
2. **`feature/offline-working-mode`** is unmerged and stale. Re-apply it over
   main's `canWriteManagedKeyForAccess` rather than the reverse, or live school
   recognition access is silently reverted — the commit message explains.
3. A manager's stars still count in their building's "Stars by month" total
   while being off that building's leaderboard and out of its drawing.
   Defensible either way; Liz should choose.
