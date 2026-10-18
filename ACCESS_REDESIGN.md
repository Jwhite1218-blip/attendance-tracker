# Access redesign — PINs out of the environment

Status: **design, not yet approved.** Nothing is built. The current system
keeps running untouched until the cutover.
Written 2026-10-18, rewritten the same day after Jon's correction.

## Scope, in one line

Liz reassigns a PIN and edits what it can reach, herself, in the app. Nothing
else changes.

**Sixteen credentials: fifteen schools, one each, plus a handful of district
office operators.** Four digits. Same keypad, same sign-in, same profile
shape. This is an internal district tool behind a PIN pad, not a public
service, and the design is sized accordingly.

> An earlier draft of this document treated it as a hardening exercise —
> scrypt, a pepper, a blind index, forced six-digit rotation, exponential
> lockout, a fourteen-day evidence gate. That was the wrong size for the
> problem. It is recorded here only so the reasoning is not re-litigated: the
> threat model is sixteen shared building codes on a district tool, and the
> actual complaint is that changing one takes a developer. What follows fixes
> that and little else.

## What is actually broken

1. `ATTENDANCE_ACCESS_CODES_JSON` is secret-flagged, so it cannot be read
   back. Changing one PIN means rebuilding all sixteen profiles from memory,
   and a wrong capability flag locks somebody out silently.
2. Functions read environment variables at boot, so every change needs a
   redeploy.
3. Nobody can look up a PIN. "What is Creston's code again?" currently has no
   answer except reissuing it.

Point 3 is worth noticing. It is not a security feature today, it is an
accident of where the PINs are stored — and it is half the day-to-day
annoyance.

## Three things already built, found while planning

Checked before writing any code, because each would have been wasted work.

**Rate limiting exists.** `session.mjs` already throttles sign-in: five PIN
failures and one hundred attempts per IP, in a fifteen-minute sliding window,
backed by Netlify Blobs. The first draft of this document proposed building
it. It is built. Nothing to do.

**Revocation half exists, in two places.** `server-session.mjs` keeps a
strongly consistent record per session with a `revokeServerSession` path. And
`sessionFromRequest` re-resolves a live session against the current code
table on every request via `credentialFingerprint`, so changing a PIN
*already* kills its sessions.

**That second mechanism is a cutover hazard.** `sessionFromRequest` is
synchronous and reads the environment blob. When the blob is removed in Phase
3, `accessCodeConfiguration()` throws, the surrounding `catch` returns null,
and **every signed-in user is logged out at once**. It would look exactly
like a total auth failure.

So revocation moves to the session registry, which is already async and
already consulted on every request: the registry record gains a `profileId`,
and changing or disabling a profile deletes its live sessions. The
fingerprint re-resolution is retired as part of Phase 3 rather than left to
fail. Keeping `sessionFromRequest` synchronous is deliberate — making it
async would spread `await` through three call sites for no gain.

## The table

One new table in the production Supabase project (`gbjikeytzdlzjulrnjvo`).

**Not** in `legacy_state_entries`. That is not caution for its own sake:
`state.mjs` dumps every entry in that table into the backup export, so
credentials there would land in a downloaded backup file. Separate table,
reached only by its own function, never by the state endpoint.

```sql
create table public.access_profiles (
  id            uuid primary key default gen_random_uuid(),
  district_id   bigint not null references public.districts(id),

  pin_encrypted text not null,          -- AES-256-GCM, iv and tag included
  pin_lookup    text not null,          -- HMAC-SHA256, deterministic, indexed
  pin_length    smallint not null,      -- shown in the list without revealing the PIN
  display_name  text not null,
  role          text not null check (role in ('admin','school')),
  location_id   text,                   -- required when role = 'school'
  employee_id   text,
  capabilities  jsonb not null default '{}'::jsonb,

  disabled_at   timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text,

  unique (district_id, pin_lookup)
);
```

`capabilities` holds the same flags the profile JSON holds today.
`normalizeAccessProfile` keeps deriving the rest, unchanged — it is correct
and well tested, and storing derived values would let them drift.

Service-role only, like `legacy_state_entries`: no RLS grant to `anon` or
`authenticated`, and the Netlify function holding `SUPABASE_SECRET_KEY` is
the only caller.

A second small table, `access_changes`, records who changed a profile and
when — not for security theatre, but because "who moved Creston's PIN" is a
question that will be asked and should have an answer. It never records a
PIN.

## How the PIN is stored — decided

**Encrypted at rest, readable in the app.** Jon chose this on 2026-10-18.

AES-256-GCM with a key in `ATTENDANCE_PIN_KEY`, a new Production-only secret.
The admin screen decrypts and shows each PIN, so "what is Creston's code?" is
answered by looking rather than by reissuing. A raw database dump is not a
list of codes.

Hashing was considered and rejected: it would make a PIN unreadable forever,
including to Liz, turning every forgotten code into a forced rotation. That
is worse at the job this work exists to do.

Lookup is by encrypted value, not by scanning and decrypting. GCM uses a
random IV, so the same PIN encrypts differently every time and an equality
match would never hit. The row therefore carries a second column,
`pin_lookup` — HMAC-SHA256 of the PIN under the same key — which is
deterministic and indexed. One query per sign-in regardless of row count.

Losing `ATTENDANCE_PIN_KEY` means every PIN must be reissued, so it is
written down somewhere other than Netlify before Phase 1 ships.

## The admin screen

Liz-only, same bar as Settings, enforced server-side as well as in the page.

A table of sixteen rows. For each: school or office name, the PIN, what it
can reach, when it was last used, and whether it is active.

- **Change a PIN** — type the new four digits, save. Live sessions on the old
  one end.
- **Edit access** — the same capability checkboxes that exist in the profile
  today: edit attendance, record recognition, manage roster, manage blackout
  dates, run award draws.
- **Add** — for a new building or a new office operator.
- **Disable / enable** — instant, reversible, no PIN change. The right tool
  for someone leaving on Friday.

### Guardrails

Each of these is a real way to lock the district out, so each is enforced on
the server, not only in the page:

- You cannot disable or downgrade **your own** login.
- You cannot remove the **last** Liz-tier login.
- You cannot grant capabilities you do not have yourself.
- A `school` login must have a valid `location_id`.
- A PIN already in use is refused.

## Cutover

Three phases. Nothing before the last one is visible to anybody.

**Phase 1 — dual read with self-migration.** Sign-in checks the table first,
then falls back to the environment blob exactly as today. When the blob
answers, that credential is written into the table on the spot.

A successful legacy sign-in is the one moment anybody holds the plaintext
PIN, so that is when it migrates. **The district migrates itself as people
work** — no reconstruction from memory, no bulk rewrite, no window where a
credential exists in neither place. Sixteen credentials in daily use means
it is done within a week, and Liz can add any stragglers by hand.

Two properties keep it safe: migration only fires on an *already successful*
sign-in, so it cannot create access that did not exist; and once a PIN is in
the table the blob is never consulted for it again, so a stale environment
edit cannot resurrect an old profile.

**Phase 2 — the admin screen.** Liz can see and change everything.

**Phase 3 — cutover.** Remove `ATTENDANCE_ACCESS_CODES_JSON`, the five
additive variables, and the fallback path. Gate: every one of the sixteen
present in the table and signing in from it for a few days.

`ATTENDANCE_TABLE_AUTH_ENABLED=false` reverts to today's behaviour instantly
at any point before Phase 3, with no code change.

## What this also deletes

Five environment variables doing one job: `ATTENDANCE_CHEF_PIN`,
`ATTENDANCE_RECOGNITION_PILOT_PINS_JSON`, `ATTENDANCE_PEER_ADMIN_PINS_JSON`,
`ATTENDANCE_LIMITED_ADMIN_PINS_JSON`, `ATTENDANCE_LIZ_REPLACEMENT_PIN`. Each
has its own parser and refusal rules, and each exists *only* because the main
blob cannot be edited. They all become ordinary rows, which is a real
simplification of `auth.mjs`.

## Deliberately not doing

Recorded so these stay closed unless you reopen them: longer PINs, forced
rotation, password hashing, lockout and backoff, per-person logins for
building staff, any change to the sign-in screen.

One item is worth separating from that list, because it is not a hardening
question: **deploy previews are publicly reachable and accept production
PINs.** That is already an open item in `PROJECT_STATE.md` and predates this
work. The table makes it a one-line fix — table auth off on previews — so it
is worth doing in Phase 1 while the code is open, rather than as a separate
job later. Say if you would rather leave it alone.

## Testing

The existing profile-matrix, permissions and session suites must pass
unchanged; that is the main regression signal. New tests cover: table hit
wins, table miss falls through, a blob hit migrates, a migrated credential
is served from the table afterwards, a PIN in neither place yields nothing
and writes no row, the kill switch restores prior behaviour, every guardrail
fails server-side when the page is bypassed, and credentials never appear in
the state key allowlist or a backup export.

## Cost

Phase 1 a day, mostly tests. Phase 2 a day and a half, the guardrails being
most of it. Phase 3 an hour plus a few days of watching. Call it three days
of build.

## Needed before I start

1. **Option A or B** for storing the PIN. Recommend B.
2. Running two migrations in the District 9 SQL editor, as before.
3. Setting `ATTENDANCE_PIN_KEY` once, Production only — only if B.
4. Whether to fix the preview exposure in Phase 1.
