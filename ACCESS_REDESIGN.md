# Access redesign — getting PINs out of the environment

Status: **design, not yet approved.** Nothing in here is built.
Written 2026-10-18. Supersedes nothing; the current system keeps running
untouched until the cutover in Phase 4.

---

## 1. What is actually wrong

Four separate problems hide behind "the PIN system is awkward".

**1.1 Credentials cannot be read, so they cannot be edited.**
`ATTENDANCE_ACCESS_CODES_JSON` is a secret-flagged Netlify variable holding a
single JSON object of roughly nineteen `{pin: profile}` pairs. Netlify never
returns a secret value — not to the CLI, the API, the UI, or the account
owner. Changing one person's PIN therefore means reconstructing all nineteen
profiles from memory and overwriting the lot. A wrong capability flag in that
rebuild locks somebody out silently, with no error anywhere.

**1.2 Every change needs a deploy.** Functions read environment variables at
boot, so even a correct edit is inert until a redeploy. That puts Jon in the
loop for something Liz should do in thirty seconds.

**1.3 There is no audit and no instant off switch.** Nothing records who
signed in, when, or from where. If a PIN is shared outside the district the
only remedy is the rebuild in 1.1. There is no way to disable one credential.

**1.4 The real security problem is PIN length, not storage.** A four-digit PIN
has ten thousand possibilities. The sign-in endpoint is public, and deploy
previews are publicly reachable and accept the same production PINs. Ten
thousand guesses is minutes of scripted traffic.

**This fourth point matters more than the other three combined, and no
amount of hashing fixes it.** A design that encrypts the PINs beautifully and
leaves them four digits long on an unthrottled public endpoint has improved
almost nothing. Rate limiting and PIN length are the load-bearing changes;
hashing is hygiene that limits the damage of a database leak.

### What is deliberately not wrong

**Shared building PINs are a feature.** A kitchen team shares one code on one
screen. That is how the work happens and the design keeps it. It does mean a
building's actions cannot be attributed to a person — addressed as an option
in §9, not assumed.

---

## 2. Target design

### 2.1 Where credentials live

A new table in the existing production Supabase project
(`gbjikeytzdlzjulrnjvo`), **not** in `legacy_state_entries`.

That distinction is load-bearing. `legacy_state_entries` is dumped wholesale
by the backup export in `state.mjs` — `createBackupPayload(entries, …)` takes
every key it loaded. Credentials in that table would land in a downloaded
backup file on somebody's laptop. They get their own table, reachable only by
a dedicated function, and never by the state endpoint.

```sql
create table public.access_profiles (
  id                uuid primary key default gen_random_uuid(),
  district_id       bigint not null references public.districts(id),

  -- lookup and verification (see 2.2)
  pin_index         text not null,          -- HMAC(pepper, pin), unique per district
  pin_hash          text not null,          -- scrypt(pin + pepper, salt)
  pin_salt          text not null,
  pin_length        smallint not null,      -- for the "short PIN" nudge, never the PIN
  credential_version integer not null default 1,

  -- who this is
  display_name      text not null,
  role              text not null check (role in ('admin','school')),
  location_id       text,                   -- required when role = 'school'
  employee_id       text,

  -- what they can do: the same flags normalizeAccessProfile already derives
  capabilities      jsonb not null default '{}'::jsonb,

  -- lifecycle
  disabled_at       timestamptz,
  last_used_at      timestamptz,
  created_at        timestamptz not null default now(),
  created_by        text,
  updated_at        timestamptz not null default now(),
  updated_by        text,

  unique (district_id, pin_index)
);

create table public.access_events (
  id          bigserial primary key,
  district_id bigint not null,
  profile_id  uuid references public.access_profiles(id) on delete set null,
  event       text not null,   -- sign-in-ok | sign-in-failed | created | updated
                               -- | rotated | disabled | enabled | deleted
  detail      jsonb not null default '{}'::jsonb,
  actor       text,
  ip_hash     text,            -- hashed, never the address
  created_at  timestamptz not null default now()
);
```

Both tables are service-role only. No RLS policy grants `anon` or
`authenticated` anything, matching how `legacy_state_entries` is already
reached — the Netlify function holds `SUPABASE_SECRET_KEY` and is the only
caller.

**`access_events` never stores a PIN, not even a failed one.** A failed
attempt records that a failure happened, not what was typed. People mistype
their own credential constantly; a log of near-miss PINs is a list of real
PINs with digits transposed.

### 2.2 Hashing, and an honest account of what it buys

Two columns, because one cannot do both jobs.

**`pin_index` — how we find the row.** `HMAC-SHA256(pepper, pin)`, where the
pepper is a new secret environment variable (`ATTENDANCE_PIN_PEPPER`), never
stored in the database. Deterministic, so sign-in is one indexed lookup
rather than nineteen hash computations. Because the pepper lives only in the
environment, a database leak on its own yields nothing: an attacker holding
`pin_index` values cannot brute-force them without the pepper.

**`pin_hash` — how we verify.** `scrypt(pin + pepper, pin_salt)` at a
deliberately high cost (N=2^15 or above, tuned so one verification is
80–150 ms on the function runtime). Node's `crypto.scrypt` is built in; no
new dependency.

Be clear about the limits:

| Leak | Consequence |
|---|---|
| Database only | Safe. No pepper, so neither column is attackable. |
| Pepper only | Safe. No hashes to attack. |
| **Both** | **A four-digit PIN falls in seconds.** 10,000 scrypt runs at 100 ms is under twenty minutes, and trivially parallel. |

So the hashing is worth doing — it turns the most likely incident, a database
leak, into a non-event — but it is not what protects against guessing. That
is §2.3 and §2.4.

### 2.3 Rate limiting

Per-district and per-source, enforced in the sign-in function before any hash
is computed.

- A sliding window of failed attempts, counted in the existing Netlify Blobs
  store (the same mechanism `server-session.mjs` already uses, so no new
  infrastructure).
- Exponential backoff rather than a hard lock: delay the response at 5
  failures, 10, 20, with a cap. **Never permanently lock**, because a locked
  building is nineteen people who cannot mark attendance, and that is a worse
  outcome than a slow attacker.
- Keyed by a hash of the client IP plus the district. IP addresses are not
  stored in clear.
- Responses are constant in shape and timing whether or not the PIN exists.
  "That PIN is not recognised" for everything, including a disabled profile.

Ten thousand guesses against exponential backoff is no longer minutes. It is
long enough that the audit log will have raised the alarm first.

### 2.4 PIN length

New and rotated credentials are **six digits minimum**, eight recommended for
district-level logins. Existing four-digit PINs keep working until rotated —
`pin_length` is stored so the admin screen can show a "short PIN" nudge
beside them without ever showing the PIN.

This is the single biggest security improvement available and it costs two
extra keypresses.

### 2.5 Sessions and revocation

Sessions barely change, which is the point — the current mechanism is sound.

The token keeps its shape (base64url payload + HMAC, eight hours), and gains
two fields: `profileId` and `credentialVersion`.

Revocation already half exists. `server-session.mjs` keeps a strongly
consistent Netlify Blobs record per session and `revokeServerSession` deletes
it, so `validatedSessionFromRequest` already rejects killed sessions on the
next request. The redesign adds:

- **Disable a profile → every live session for it dies.** On validation,
  compare the token's `credentialVersion` against the profile's current one;
  a rotation or a disable bumps it. One small cached read, refreshed on a
  short TTL, so this does not become a database round trip per request.
- **"Sign out everywhere"** as an explicit button, which bumps the version
  without changing the PIN.

### 2.6 One mechanism instead of five

Today there are five bespoke environment variables doing one job:
`ATTENDANCE_CHEF_PIN`, `ATTENDANCE_RECOGNITION_PILOT_PINS_JSON`,
`ATTENDANCE_PEER_ADMIN_PINS_JSON`, `ATTENDANCE_LIMITED_ADMIN_PINS_JSON`, and
`ATTENDANCE_LIZ_REPLACEMENT_PIN`, each with its own parser, its own refusal
rules and its own log events. Every one of them exists only because the main
blob could not be edited.

They all become ordinary rows. Deleting that code is a substantial
simplification of `auth.mjs` and removes five chances to get a profile subtly
wrong.

---

## 3. What deliberately does not change

- **The sign-in experience.** A PIN on a keypad. Nothing new to learn.
- **Shared building credentials.** See §1.
- **`normalizeAccessProfile`.** The capability derivation is correct and well
  tested; the table stores its inputs and it keeps deriving the rest. Writing
  derived capabilities into the database would let them drift.
- **The session token format**, beyond two added fields.
- **The state endpoint's permission model.** Untouched.

---

## 4. Management screen

Liz-only, the same bar as Settings, enforced on the server as well as the
page.

**List.** Every profile: name, role, building, capability summary, PIN length,
last used, status. Sorted with disabled last. A short PIN is flagged.

**Create.** Name, role, building, capabilities. The app generates the PIN —
people choose 1234 and birthdays. It is shown **once**, large, with copy and
print, and a warning that it cannot be recovered. Closing the dialog loses it.

**Rotate.** Same one-time reveal. Bumps `credential_version`, so every live
session on the old PIN ends immediately.

**Disable / enable.** Instant, reversible, no PIN change. The right tool for
"somebody left on Friday".

**Delete.** Only a profile that has never been used, or one disabled for more
than thirty days. Otherwise disable — a deleted profile loses its audit trail.

**Never shows an existing PIN,** because it genuinely cannot. The screen says
so plainly rather than leaving Liz hunting for it.

### Guardrails

Each of these is a real way to brick the district, so each is enforced
server-side, not just in the page:

- You cannot disable, delete or downgrade **your own** profile.
- You cannot remove the **last** Liz-tier profile.
- You cannot create a profile with capabilities exceeding your own.
- A `school` profile must carry a valid `location_id`.
- A PIN colliding with an existing one is refused, naming no detail.

---

## 5. Cutover, without locking anyone out

The whole plan rests on never having a moment where the table is authoritative
and incomplete.

### Dual read, with self-migration

During the transition, `accessForPin(pin)` resolves in this order:

1. **Table.** Compute `pin_index`, look it up, verify with scrypt. Hit → done.
2. **Environment blob**, exactly as today. Hit → **migrate that credential
   into the table before returning the session.**

Step 2 is the elegant part. At the instant of a successful legacy sign-in we
are holding the plaintext PIN — the only moment anyone ever does. So we can
hash it and write the row then and there. **The system migrates itself as
people use it**, with no bulk rewrite, no reconstruction from memory, and no
window where somebody's credential exists in neither place.

Nineteen credentials in daily use means migration is substantially complete
within a week. Liz can create any stragglers by hand.

Safety properties:

- Self-migration only ever fires on an **already successful** legacy sign-in.
  It cannot create a credential that did not already work.
- Once a `pin_index` exists in the table, the table wins; the blob is never
  consulted for it again. A later env edit cannot resurrect an old profile.
- `ATTENDANCE_LEGACY_CODES_ENABLED` is a kill switch. Set false and step 2
  stops, instantly, without a code change.

### Phases

Each phase ships on its own and is independently safe to stop at.

| Phase | What ships | Visible change | Gate to proceed |
|---|---|---|---|
| **0** | Migration, tables, hashing module, `ATTENDANCE_PIN_PEPPER` | None | Tests green; pepper set; tables exist and are empty |
| **1** | Dual read + self-migration, behind `ATTENDANCE_TABLE_AUTH_ENABLED` | None visible | Every existing PIN still signs in; rows appearing in `access_profiles` |
| **2** | Admin screen, read-only list | Liz can see who has access | List matches reality |
| **3** | Create / rotate / disable, guardrails, audit log | Liz manages access herself | Liz rotates one test credential end to end |
| **4** | Rate limiting, lockout, short-PIN nudges | Slower failed sign-ins | Deliberate lockout test passes |
| **5** | **Cutover.** Remove the env blob and the five additive variables; delete the fallback path | None if 1–4 held | Every profile present and used from the table for 14 consecutive days |
| **6** | Optional: six-digit rotation drive, per-person district logins | New PINs issued | Liz's call |

Phase 5 is the only irreversible one, and it comes after two weeks of
evidence rather than a judgement call.

### If it goes wrong

| Failure | Containment |
|---|---|
| Table auth misbehaves | `ATTENDANCE_TABLE_AUTH_ENABLED=false` — straight back to today's behaviour |
| Self-migration writes a bad row | Disable the row; the blob still works until Phase 5 |
| Nobody can sign in at all | The env blob is untouched through Phases 0–4; revert the deploy |
| Rate limiting locks a kitchen out | Backoff, not hard lock; worst case is a slow sign-in, and the window is clearable |
| Liz locks herself out | Guardrails prevent it; Jon can still insert a row directly in SQL |

---

## 6. Testing

The existing suite already covers the profile matrix well
(`pin-profile-matrix.test.mjs`, `permissions.test.mjs`, `session.test.mjs`)
and those tests keep passing unchanged — that is the main regression signal.

New coverage, roughly in the order it would be written:

- **Hashing**: a known PIN verifies; a wrong one does not; the same PIN under
  two salts produces different hashes; `pin_index` is stable for a pin+pepper
  and changes with the pepper.
- **Lookup**: one database round trip per attempt regardless of profile count.
- **Dual read**: table hit wins; table miss falls through; blob hit migrates;
  a migrated credential is served from the table next time and the blob is
  not consulted.
- **Self-migration cannot invent access**: a PIN absent from both yields
  nothing and writes no row.
- **Kill switches**: each flag, proven to restore the prior behaviour.
- **Guardrails**: every bullet in §4, each asserted to fail server-side even
  when the page is bypassed.
- **Revocation**: disabling a profile invalidates a live session on its next
  request.
- **Rate limiting**: N failures produce backoff; a correct PIN during backoff
  still eventually succeeds; one building's failures do not slow another's.
- **Containment**: `access_profiles` never appears in the state key
  allowlist, and a backup export contains no credential material. This is a
  standing test, not a one-off check.

---

## 7. Work not to forget

Small, easy to drop, each with teeth:

- **Deploy previews.** Previews are publicly reachable and today accept real
  production PINs. The table makes a clean fix available: previews point at a
  separate district row, or table auth is disabled on previews entirely.
  Either way, **fix this in Phase 1, not Phase 5.**
- **Timing.** Compare with `timingSafeEqual`, and make the failure path cost
  roughly what the success path costs, so response time does not reveal
  whether a PIN exists.
- **Logging.** The existing `console.error` events are useful; keep the
  pattern, and keep PINs out of them as they are today.
- **`ATTENDANCE_SESSION_SECRET` stays.** Token signing is unrelated and fine.
- **Pepper rotation.** Changing the pepper invalidates every `pin_index`.
  Write the procedure down before it is needed: it requires re-indexing every
  row, which requires the plaintext, which we do not have — so in practice a
  pepper rotation is a forced rotation of every PIN. Worth knowing in advance.

---

## 8. Cost

Roughly, and honestly — these are estimates, not commitments:

| Phase | Size |
|---|---|
| 0 | Half a day |
| 1 | A day, most of it tests |
| 2 | Half a day |
| 3 | A day and a half — the guardrails are the work |
| 4 | A day |
| 5 | Half a day, plus two weeks of waiting |
| 6 | Liz's call |

Call it a week of build spread over three weeks of calendar, because Phase 5
deliberately waits.

---

## 9. Decisions needed before Phase 0

These change the shape of the build, so they are worth settling first.

1. **PIN length for new credentials.** Recommend six minimum, eight for
   district logins. Four-digit stays valid until rotated.
2. **Per-person district logins?** Building PINs stay shared. But the district
   office is a handful of named people, and giving each their own makes the
   audit log meaningful. Recommend yes.
3. **Attribution inside a building** (optional, deferred). Because a kitchen
   shares one PIN, nothing attributes a star or an attendance mark to a
   person. A name picker after sign-in — no second secret, just "who is on
   the keyboard" — would fix that cheaply. It is a change to how managers
   work, so it is Liz's call, not a technical one.
4. **Who besides Liz can manage access?** Recommend Liz alone at first, with
   the peer-administrator tier able to view but not change.
5. **Lockout numbers.** Recommend backoff from 5 failures, capped at 60
   seconds, window reset after 15 minutes. Needs a sanity check against how
   often a real manager fat-fingers a PIN.
6. **Preview handling** — separate district row, or table auth off on
   previews. Recommend off on previews: simplest, and no production
   credential can ever work there.

---

## 10. What this needs from Jon

- Running each migration in the District 9 SQL editor, as before. The
  connector cannot list that project, so it is addressed by ref and migrations
  are hand-run — see `PROJECT_STATE.md`.
- Setting `ATTENDANCE_PIN_PEPPER` once, Production only, as a secret. It must
  never be committed, and losing it means every PIN must be reissued.
- Answering §9.
- Liz performing the Phase 3 gate herself: rotate one test credential, sign in
  with it, disable it, confirm the session dies. If she cannot do that
  unaided, the screen is not finished.
