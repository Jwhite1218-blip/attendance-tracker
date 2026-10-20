# Attendance Tracker — Project State

Last verified: 2026-10-19

## Current stage
Production / live pilot. The recognition work was demonstrated to Liz's team on
2026-09-29; her follow-up notes of 2026-10-10 are built and live apart from the
approval workflow.

Three threads as of 2026-10-19. Liz changing the system without going
through Jon: the settings page is done and the access rework is two phases
of three. The ACE Coach Bucks programme is built and awaiting its first
award. And the attendance side has been deliberately stripped of anything
that reads as HR documentation.

## Canonical source
- Repository: `Jwhite1218-blip/attendance-tracker`
- Canonical branch: `main`
- Production site: `allstartracker`
- Production URL: `https://allstartracker.netlify.app`
- Verified production commit: `56a68c22cafca61de22304356139479f82106028`
- Test suite: 331 passing (`npm test`)
- Page render check: 19 clean (`npm run verify:pages`)
- Confirmed live: `/version.json` returns that commit, 2026-10-19

## Environment roles
- Production: `allstartracker` — Supabase-backed live data and the enabled end-of-day report.
- Deploy previews: test-only. `ATTENDANCE_STATE_BACKEND=blobs`, report sending disabled, and `VITE_TEST_ENVIRONMENT_LABEL=Preview — test data`. Confirmed applied at build time on 2026-09-28.
- Dedicated stress lab: `allstartracker-stress-20260821` — use only for isolated destructive/stress testing; do not treat it as the newest product version.
- Archived legacy site: `archive-attendance-stress-old` — team-only; do not build or deploy to it.

## The production database
Supabase project **`gbjikeytzdlzjulrnjvo`** —
`https://gbjikeytzdlzjulrnjvo.supabase.co`, `SUPABASE_DISTRICT_SLUG=warren-township`,
org `dectbbejdlaqiwgrdxur`, shown in the dashboard as
*jwhite1218@icloud.com's Project* under **District 9**. Confirmed 2026-10-11
from Netlify's `SUPABASE_URL`, which is the only source of truth for where the
app writes.

**Address it by ref.** The Supabase connector does not list this project —
`list_organizations` returns a different org entirely (MDB, holding *MDB* and
*Localis*, neither of which is production). But `get_project`,
`list_migrations` and `execute_sql` all work when given the ref explicitly. Do
not conclude from a listing that the project is unreachable.

*Localis* is active, paid, created 2026-08-16, attendance-shaped, and nothing
is known to use it. Being a plausible-looking non-production database makes it
a hazard; confirm before touching it.

**Dashboard SQL does not register a migration row.** `list_migrations` shows
only the three applied by CLI; the 2026-10-11 key migration was run in the
dashboard and is absent from that list while fully applied. Verify by reading
the function:

```sql
select pg_get_functiondef('public.mutate_legacy_state_entry(bigint, text, jsonb, text)'::regprocedure)
  like '%training-records-v1%' as applied;
```

Confirmed `true` for all three new keys on 2026-10-11, with
`all-star-recognition-v1` still present.

A migration appearing to succeed proves nothing about which database it hit:
`create or replace function` compiles plpgsql lazily, so this function creates
cleanly in an empty project.

## Writing production data
Nothing in this repository can write production state directly. Shared state
is written only by an authenticated admin session in the browser, through the
Netlify state function. There is no server-side or CLI path, and the Supabase
connector cannot reach the production project (above).

So any bulk data task — backfilling training hours, correcting a roster field
across many staff — is built as an **import screen that Jon or Liz runs while
signed in**, with a preview before it commits and unmatched rows listed rather
than dropped. Plan for that shape rather than for a script.

## Current milestone
Keep the live attendance workflow stable while making every review/test change
traceable and isolated from production data.

## Current rules
- Start all normal feature work from current `main`.
- Production changes must be committed before deployment.
- A deploy preview must never use production Supabase credentials or send attendance reports.
- Do not create another permanent Netlify test site for convenience.
- `vite build` passing is not evidence a page renders. esbuild emits references
  to undefined identifiers without complaint — a missing import shipped to
  production on 2026-09-28 with a green build and 192 passing tests. Scan for
  JSX components that are neither imported nor declared before shipping.
- `vite build` passing is not evidence a page renders, and neither is a
  green test suite. Run `npm run verify:pages`: it renders all 13 signed-in
  pages under Node as each role that can reach them, and a reference to
  something never imported throws there instead of in front of a manager.
  That failure has shipped twice — a component on 2026-09-28, a function on
  2026-10-19 that would have blanked the All-Stars page.
- A render check proves a page does not throw. It says nothing about whether
  the data reaching it is right. The Shout-Out picker rendered perfectly
  while showing the wrong names on 2026-10-19; what caught that was moving
  the rule into a pure function and testing it.
- An environment variable change does not reach the functions until a
  redeploy. A flag can be set perfectly and do nothing because the live build
  predates it. Check `/version.json` against `git rev-parse HEAD` before
  debugging any "the flag is not working" problem. Relatedly: the absence of
  a log line is not a diagnosis — anything behind a flag logs when the flag
  is on but blocked, and logs a positive signal when it is actually active.
- A new shared state key must be added in three places — `src/data/sharedStore.js`,
  `netlify/functions/_shared/permissions.mjs`, and the SQL allowlist in a
  migration — and the migration must be applied *before* the feature ships, or
  writes are rejected and the form appears to save while doing nothing.
  `state-key-parity.test.mjs` enforces the first two against the third.

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

## Shipped 2026-10-10 / 11 — Liz's follow-up notes

**Beta banner.** A strip across the top of every page reading
*BETA 0.2.3 · Demo only · still in development*, hidden when printing. Version
comes from `package.json` via `__APP_VERSION__`; the build id is in the
tooltip. No wording about cost, licensing or vendor — deliberately.

**Employee card.** A phone number, stored as ten digits and formatted on
display, rendered as a `tel:` link.

**Occurrence colours.** Severity is now named in one place
(`attendanceSeverityOf`): third occurrence yellow everywhere, fourth red and
the only one that reaches the district main page, a seniority reset red
immediately. The building watch list still shows third occurrences.

**Manager landing page.** `ManagerHome` at `/` for school sessions — their
school, three counts, a button per tracker, all building-scoped. The district
`Dashboard` stays administrator-only. The roster keeps its own nav entry.

**Transfer.** Reported as "gone"; it only ever lived on the building roster, so
the button is now on the employee record too. Its destination list no longer
filters on a staff count, which had made the first transfer into an empty
kitchen impossible.

**Assignment history.** A transfer writes `employee-assignment-history-v1`
alongside the location override, with the acting administrator's name. The
employee record shows the schools worked as a timeline. Transfers before
2026-10-11 were never logged and the page says so. Administrator-only; the
server does not send the key to school sessions.

**Stars by school.** Needed no storage — recognition records already carry the
building, so someone who has moved shows what they earned at each stop.

**Professional Standards training.** New admin-only `/training` page. One
record per event carrying the employees it covered; hours in quarter-hour
increments, restarting each July; report grouped by school against the
requirement. All three tiers are set: 12 hours for the Director, 10 for Food Service
Managers and Worker Leads, 6 for Cooks and Food Service Workers (Liz,
2026-10-11). The admin team tracks its training separately and is deliberately
not in this roster. An unlisted job title still reports as "no requirement
set" rather than defaulting to a tier.

**Defects found and fixed while verifying.** A bare `YYYY-MM-DD` passed to the
shared `formatDate` parsed as UTC midnight and rendered as the previous day in
Eastern time; the manager dashboard would have shown yesterday's date all day.

## Shipped 2026-10-18

**Programme settings.** `/settings`, Liz's tier only, enforced server-side as
well as in the page. Five things that were constants in source files and are
now hers: star milestone names and thresholds, the occurrence stages,
required training hours per position, the printed wording of recognition
reasons, and the Spanish sign-off. Defaults live in `programDefaults.js`; a
stored setting is an override, so anything absent or malformed falls back to
the shipped value rather than leaving the district with no thresholds.
Resetting a section deletes the override rather than writing today's default
in as a value. Read by every session, including school and recognition-only
ones — a session that did not receive them would silently run on defaults and
show different milestones from the district office. Every write records who
and when.

**Access rework, Phase 1 of 3.** See `ACCESS_REDESIGN.md` for the full plan.
Credentials are moving out of `ATTENDANCE_ACCESS_CODES_JSON` into an
`access_profiles` table so Liz can reassign a PIN and edit what it reaches,
herself. Four digits and the sign-in screen are unchanged — this moves where
PINs live, not what they are.

PINs are ENCRYPTED, not hashed (AES-256-GCM under `ATTENDANCE_PIN_KEY`, plus
a deterministic HMAC column for the lookup). That is deliberate: hashing
would make a PIN unreadable forever, so every forgotten code would become a
forced reissue. Credentials are deliberately not in `legacy_state_entries`,
because `state.mjs` exports every row of that table into a downloadable
backup file.

Live behaviour: sign-in checks the table, then falls back to the environment
blob, and a successful blob sign-in writes that credential into the table on
the spot — the one moment anybody holds the plaintext PIN. The district
migrates itself as people work. `ATTENDANCE_TABLE_AUTH_ENABLED` is on in
Production and `false` in every other context; setting it to `false` reverts
to the previous behaviour entirely.

Three things were found by reading the code before building, each of which
would otherwise have been wasted or harmful work: rate limiting already
exists in `session.mjs` (five PIN failures, a hundred IP attempts, fifteen
minutes); revocation already partly exists; and `sessionFromRequest`
re-resolves every live session against the environment blob, synchronously,
so removing that blob in Phase 3 would have logged every signed-in user out
at once. Table-sourced sessions now carry `profileId` instead of a
credential fingerprint and skip that path. Both scenarios have tests.

## Shipped 2026-10-19

**Access rework, Phases 2a and 2b.** `/access` in Liz's nav lists every
sign-in code: what it reaches, what it can do, when it was last used, and
the code itself, masked until she presses Show. She can add a login, change
a code, edit what it reaches, and disable one — all without a deploy.

The guardrails live in `access-guards.mjs` with their own tests, because
each is a way to lock nineteen people out with no way back but SQL: no
disabling your own login, no stripping your own administrator access, the
last full administrator cannot be stood down, nobody grants a capability
they do not hold, and a school login must name a real school. All enforced
in the function, not the page; the tests call the endpoint over HTTP to
prove a manager cannot skip the UI. No hard delete — unwanted logins are
disabled, which keeps the record of what they could reach.

Nineteen credentials migrated themselves out of the environment variable
within a day of the flag going on, with no failures.

**ACE Coach Bucks.** The Leadership Track, in its own green section on the
All-Stars page, administrator-only. Awarded by the district office to the
fifteen kitchen managers — eligibility is keyed on WHERE somebody works,
not their job title, so a Food Service Manager posted to a building would
be eligible while the same title at the district office is not. Eight
categories from Liz's document, five coach milestones from 25 to 200, both
editable in Settings. Counted separately from Daily Stars, which managers
keep on the blue leaderboard: a manager holding both has two totals on
purpose, and a kitchen manager sees their own Buck count on their employee
record.

**Peer Shout-Outs.** A building session now also receives the eighteen
manager-grade staff, so Worker Leads can send each other a Warren Star
Shout-Out. A Daily Star for the same person is still dropped — a Shout-Out
earns nothing and decides nothing, whereas a Daily Star would let one
building inflate another's monthly drawing.

**The attendance side is no longer HR documentation.** The HR manager had
begun treating what the app showed as the formal record. So: "verbal
warning required" is gone, replaced by "formal attendance tracking needed"
from the fourth occurrence; occurrences below that have no stage of their
own, just a count; union seniority reset is removed entirely, display and
computation; the HR ladder (4 verbal, 5 written, 6 final written, 7
possible termination) is shown as reference under "handled outside this
app"; and the panel and every printout now say "a count, not a record".

A test asserts that no stage label contains "verbal", "written",
"termination", "seniority", "warning" or "discipline", so wording cannot
drift back.

**Employee cards carry less.** Phone numbers removed outright — display,
both forms, the code behind them, stripped server-side, and the stored
values purged from production on 2026-10-19 (0 rows remaining, confirmed).
Hire date off the card and moved to the administrator-only part of the
roster payload. Names on the card and the printed ledger read as a full
first name and a last initial; rosters, recognition and the printed Star of
the Day card still use full names, because a manager marking attendance
has to know exactly who they are marking.

**Print full record.** Beside Print ledger: employment status with last
day, termination date and reason; schools worked; the attendance year with
comments; manager notes with author and date; recognition earned. Carries
the same "not a disciplinary file" warning, which matters more on paper.

## Shipped 2026-10-19 (evening)

**ACE Coach milestones are editable.** They were always a separate list in
the data; what was missing was the screen. Settings now has its own section
for them below the star one. The render harness could not have caught this —
the page rendered clean with the section simply absent — so it now also
takes text that must survive to the markup, checked per role.

**Roster changes go through Liz.** An administrator who is not a full
district administrator proposes card edits, transfers, status changes and
new employees; Liz approves or declines at `/requests`, with the waiting
count on the nav label.

Three of those four were previously refused at that tier with no way to
ask, and transfers went straight through. Now all four behave alike. The
boundary is the existing one — roster plus blackout management, labelled
"District administrator" on the Access page — so there is no new notion of
who Liz is.

Enforced in `permissions.mjs`, not in the page: `ROSTER_KEYS` moved to
Liz's tier and `pending-approvals-v1` opened to the administrators who can
no longer write them. The browser already hid two of these, but the state
endpoint would have accepted the write.

Approving calls the same functions the direct path calls. The decision is
recorded before the change is applied, so a failure leaves a request
approved and unapplied — visible and retryable — rather than a change
nobody authorised. The screen flags a request whose record has moved since
it was written, field by field, and one older than a month.

**The Star of the Day card.** "Other" takes a short free-text line saying
what it was. It prints with the star message, not in the reason list —
Liz, 2026-10-19: the list stays the fixed set of words a manager ticks, and
the explanation belongs where the card is written on. Required for a
Star of the Day only — that is the one that gets printed — and the
nomination surfaces keep carrying their reason in the message they already
require.

The card prints in English and Spanish together rather than as two
versions, so a manager never chooses which card somebody gets. Reason words
come from the shared Spanish dictionary, so the Spanish review reaches the
card; only the four fixed labels live with the card. What a manager types
for "Other" is not translated.

The writing area is always two slots, filled or ruled, so the footer sits
at the same height on every card and a sheet still cuts straight.

A print layout cannot be verified by a passing test. This one was checked
by rendering a sheet with the real Sacramento, Bebas and Antonio faces and
the star artwork, serving it, and looking at it. Against fallback fonts the
title wrapped onto two lines and collided with the Spanish subtitle — a
layout that never prints, and tuning to it would have made the real card
worse. Do the same for any further change to this card.

## Open hazards from that change

- **The rule keys on who holds both roster and blackout management.** Any
  other login with both bypasses the review entirely. Liz should check
  `/access` and confirm she is the only "District administrator"; anybody
  else who should be proposing needs blackout management turned off.
- Nothing notifies a requester of the decision. They see it next time they
  open the record.

## Decided by Liz, 2026-10-19

Answered by Liz directly, so these are settled unless she reopens them.

- **No monthly ACE drawing** for now; she may revisit. `drawManagerAllStar`
  and `getManagerDrawingEntries` stay built, tested and wired to nothing.
- **No cap** or monthly allowance on awarding Coach Bucks.
- **Printing a Coach Buck is undetermined** — she is consulting her team.
- **ACE Coach milestones must read differently from the All-Star ones.**
  They already did in the data; what was missing was the screen. Shipped
  the same day in `c0f6efe`.
- **Training backfill is manual.** Her documentation is not in a shape worth
  importing, so no importer will be built. Every member of staff reads as
  "short" until she enters it, which is correct.
- **A manager's stars count towards their building's monthly total, but put
  no entry in that building's drawing.** Settled 2026-10-19; this is what
  the code already did, now tested as one thing and stated on the page.
- **"Other" belongs on the printed Star of the Day card, and the card should
  be bilingual.** Both shipped — free text line, both languages on one card.

## Open, waiting on Liz

1. **Approval workflow — built, not yet exercised.** No real request has
   been made or decided. The first one is worth watching end to end.
2. **Spanish sign-off.** The review sheet is built and linked from Settings;
   what is left is a Spanish speaker reading it. Until somebody is recorded
   as having approved the wording, every Spanish screen carries "still a
   draft under review".

   **The gap worth knowing:** corrections coming back on paper cannot be
   typed in by Liz. The Spanish wording is in `programVocabulary.js`, not in
   settings, so applying them is still a code change through Jon. If the
   review produces more than a handful, making the wording editable is the
   obvious next step — `programSettings` already has the
   override-not-replacement pattern to copy.
3. **All-Stars page reorganisation.** Jon flagged layout changes on
   2026-10-19 and will come back with them. Liz: "re-circle back to that".

## Open, waiting on Jon
1. **Deploy previews are publicly reachable and accept real district PINs**
   (`ATTENDANCE_ACCESS_CODES_JSON` is scoped to all contexts). A password
   under Visitor access, scoped to previews only, closes it. Partly mitigated
   on 2026-10-18: `ATTENDANCE_TABLE_AUTH_ENABLED` is `false` outside
   Production, so no preview can sign anybody in against the table or migrate
   a production credential into it. The blob exposure remains until the
   variable is scoped to Production, or until Phase 3 removes it.
2. **Access rework, Phase 3** — the cutover. Remove
   `ATTENDANCE_ACCESS_CODES_JSON`, the five additive variables, and the
   fallback path in `resolveAccessForPin`. Gate: every login present in
   `access_profiles` and signing in from it for a few days. The hazard is
   written down in `ACCESS_REDESIGN.md` — `sessionFromRequest` must not
   re-resolve a session against a blob that no longer exists, which is
   already handled for table-sourced sessions and has a test.
3. **Phone numbers purged** from production on 2026-10-19, 0 rows remaining,
   confirmed. Nothing to do — recorded so the field is not mistaken for
   still-held data.
4. **`ATTENDANCE_PIN_KEY` must be recorded outside Netlify.** It encrypts
   every PIN and cannot be read back once secret-flagged. Losing it after
   migration means reissuing every PIN in the district. It is the one piece
   of this with no recovery path.
5. **`feature/offline-working-mode`** is unmerged and stale. Re-apply it over
   main's `canWriteManagedKeyForAccess` rather than the reverse, or live school
   recognition access is silently reverted — the commit message explains.
6. **The Supabase connector does not list the production project**, though it
   reaches it by ref. Worth reconnecting on the District 9 account so future
   sessions are not misled by an incomplete listing. Also decide what the
   *Localis* project is for, or remove it.
7. Whether building managers should be able to log their own training (safety
   briefs and huddles are building-level events). Currently administrator-only,
   which matches the entry form Liz described.
8. **Attendance code badge colours are muddy**, deferred 2026-10-11 — nobody
   has complained, so left alone. `LI` (#EC9126) against `EO` (#E8A32B) is a
   1.12 contrast ratio and effectively one colour under a deuteranopia
   simulation; `UNEX` (#E56E6A) against `LI` is 1.28. The two-letter labels
   are carrying the distinction on their own. These hexes look like Liz's own
   colour convention, so changing them is her call, not a tidy-up.
