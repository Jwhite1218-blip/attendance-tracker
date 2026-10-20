# Security review — attendance tracker
## Front end, back end and infrastructure, 20 October 2026

Reviewed against commit `245436a`. Every finding below was checked against the
code, not inferred. Where something is good it says so, because a review that
only lists problems gives no sense of proportion.

---

## Summary

The security posture is better than typical for an application of this size.
Authentication, session handling, database isolation and HTTP headers are all
done properly — in several places more strictly than the usual advice. The
weaknesses are concentrated in three places: **how hard it is to guess a PIN**,
**what is exposed without a login**, and **test copies of the site being open to
the internet**.

Nothing here is an emergency. Items 1 to 3 should be fixed before a vendor
review concludes.

---

## What is already right

Verified, not assumed.

**Sessions** — `netlify/functions/_shared/auth.mjs`
- Cookie is `HttpOnly`, `Secure` in production, `SameSite=Strict`, 8-hour
  `Max-Age`. That combination rules out theft by cross-site script, by
  cross-site request, and over plain HTTP.
- Token is HMAC-SHA256 signed and compared with `timingSafeEqual`, so it
  cannot be forged and comparison does not leak timing.
- Expiry is re-checked server-side on every request, not trusted from the
  cookie.

**Database** — `supabase/migrations/`
- Row Level Security is `enable`d **and** `force`d on all ten tables, with
  **zero policies defined**. Deny-by-default: even a leaked anon key returns
  nothing. Stricter than the usual "turn on RLS" advice, which often ships
  with permissive policies that undo it.
- No Supabase key reaches the browser — confirmed by grepping the built
  bundle. The database is not addressable from the client at all.
- `audit_events` records inserts, updates and deletes.

**Authorization**
- `canWriteStateKey` is the single server-side gate; the page's own checks are
  a convenience on top, never the boundary.
- School sessions are narrowed to their own roster for both reads and writes.
- Roster changes sit at the director's tier, with an approval queue for other
  administrators — also enforced server-side.

**HTTP surface** — `netlify.toml`
- CSP: `default-src 'self'`, `script-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. No
  `unsafe-inline` or `unsafe-eval` for scripts.
- HSTS with `includeSubDomains`, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, COOP and CORP `same-origin`,
  `Permissions-Policy` disabling camera, microphone and geolocation.
- No CORS headers anywhere — the API is same-origin only.

**Application code**
- No `dangerouslySetInnerHTML` and no `innerHTML` assignment anywhere. React's
  default escaping is intact, so the usual XSS route is closed.
- No secret values in logs. Log lines name events like `peer-admin-pin-skipped`
  and record a reason, never a PIN.
- No employee data and no secrets in the shipped JavaScript bundle. The roster
  is delivered only after authentication and kept in `sessionStorage`, which
  dies with the tab.
- PINs encrypted with AES-256-GCM and a random IV per value, with a separate
  deterministic HMAC column for lookup. Encrypted rather than hashed on
  purpose, so "what is Creston's code?" can be answered by looking rather than
  by reissuing.

---

## Findings

### 1. The PIN space is exhaustible in hours — HIGHEST PRIORITY

`netlify/functions/session.mjs`

```
MAX_PIN_FAILURES = 5        // per (IP + that exact PIN) per 15 min
MAX_IP_ATTEMPTS  = 100      // per IP per 15 min
RATE_LIMIT_WINDOW_MS = 15 min
```

The per-PIN counter stops someone hammering *one* PIN. It does nothing against
someone trying *many different* PINs, which is the actual attack. The only
barrier there is 100 attempts per IP per 15 minutes.

The arithmetic:

- A 4-digit PIN has 10,000 combinations; roughly 19 are live.
- So about **1 in 526 guesses hits a valid login.**
- At 100 per 15 minutes, that is 400 per hour — **a valid PIN in about 1.3
  hours on average, from a single address.** From ten addresses, under ten
  minutes.

A hit lands on whichever login it lands on, which could be the director's.

**Recommended, and compatible with keeping 4-digit PINs** (a constraint the
director has stated twice and which this does not need to change):

- Reduce `MAX_IP_ATTEMPTS` from 100 to **10** per 15 minutes. A real person
  mistyping needs three or four, not a hundred.
- Add a **district-wide failure counter** independent of source address — say
  50 failures in 15 minutes triggers a global slowdown. This is what defeats
  a distributed attempt, which per-IP limits cannot touch.
- Consider escalating delay on repeated failure rather than a hard cliff.

Estimated work: small, one file, with tests.

### 2. Fifteen unauthenticated pages publish staff full names

`netlify/functions/_shared/public-leaderboards.mjs`,
`netlify/functions/public-leaderboard.mjs`

Every school has a public leaderboard at `/school-stars/<token>` with no
sign-in, returning `first_name last_name` plus recognition counts. Fifteen
hardcoded 16-character tokens.

Mitigating: the tokens are high-entropy and unguessable, and the repository is
private, so they are not published anywhere. This is not an open directory.

Not mitigating: a URL token is a bearer credential that cannot be revoked
except by changing it, and anyone ever sent one keeps it. It also sits oddly
beside the 19 October decision to reduce internal employee cards to first name
and last initial for HR reasons, while these pages show full names publicly.

**Recommended:** a decision from the director, not a unilateral change. Options,
cheapest first — switch these pages to first name + last initial (consistent
with the internal decision, keeps the boards useful); or rotate the tokens; or
withdraw the pages pending review.

### 3. Deploy previews are public and accept live PINs

Netlify publishes a preview for each change, and these are reachable by anyone
with the URL. `ATTENDANCE_ACCESS_CODES_JSON` is scoped to all deploy contexts,
so **a real district PIN signs in to a preview.**

Partly mitigated on 18 October: `ATTENDANCE_TABLE_AUTH_ENABLED` is false
outside production, so a preview cannot authenticate against the credentials
table or migrate one into it. The environment-variable path remains.

**Recommended:** set a Netlify site password on non-production contexts, or
scope `ATTENDANCE_ACCESS_CODES_JSON` to Production only. Either closes it. This
is a dashboard change, not code.

### 4. Cached data persists on shared devices

`src/data/sharedStore.js`

Managed state is cached in `localStorage` for offline tolerance and speed.
`clearClientDataCache()` removes every managed key and the roster, and runs
whenever the app loads without a valid session — so the data does clear. But
`logout()` itself does not call it directly; it relies on the reload that
follows finding no session.

In practice that works. The residual exposure is a shared kitchen tablet where
someone closes the browser without signing out: cached attendance and notes sit
in that browser profile until the app is next opened, which may be the next
morning.

**Recommended:** call `clearClientDataCache()` inside `logout()` before the
reload, so sign-out is immediate rather than consequential. Cheap, and it makes
the guarantee easy to state to a reviewer. Consider also clearing on
`visibilitychange` after a long idle period on shared devices.

### 5. One moderate dependency advisory

`npm audit --omit=dev` reports one moderate issue in `@fastify/busboy`, reached
transitively through `@netlify/blobs`. Not known to be exploitable in this
usage.

**Recommended:** attempt `npm audit fix`, re-run the suite and the page render
check, and if the fix forces a breaking upgrade, record the decision rather
than carrying an unexplained advisory into a review.

### 6. Data residency unconfirmed

The Supabase project's physical region has not been verified. If the district
has a residency requirement this is a blocker, and it is answerable in a
minute from the Supabase dashboard.

### 7. `ATTENDANCE_PIN_KEY` has no recovery path

Not a vulnerability, an operational risk already on the open list. It encrypts
every PIN, is write-only once secret-flagged in Netlify, and losing it means
reissuing every PIN in the district. It must be recorded somewhere outside
Netlify.

---

## Deliberately not recommended

- **Hashing PINs instead of encrypting them.** It looks stronger and is worse
  here: the director must be able to read a PIN back to tell somebody what
  theirs is. Hashing would force a reissue every time anyone forgets, and the
  realistic consequence is PINs written on a note by the till. Encryption with
  a key held outside the database is the right trade for this threat model.
- **Longer or alphanumeric PINs.** Correct in general, rejected here: the
  director has twice stated 4 digits and the current format are a requirement,
  and they are typed on a shared tablet by people with their hands full. The
  rate-limit fix in finding 1 addresses the same risk without changing what
  staff do.
- **Multi-factor authentication.** Disproportionate for attendance data entered
  on a kitchen tablet, and it would not survive contact with the workflow.

---

## Suggested order of work

| # | Item | Effort | Who |
|---|---|---|---|
| 1 | Tighten sign-in rate limits (finding 1) | Small | Developer |
| 2 | Close preview exposure (finding 3) | Minutes | Netlify dashboard |
| 3 | Decide on public leaderboard names (finding 2) | Decision | Director |
| 4 | Clear cache on sign-out (finding 4) | Small | Developer |
| 5 | Record `ATTENDANCE_PIN_KEY` offline (finding 7) | Minutes | Developer |
| 6 | Confirm data residency (finding 6) | Minutes | Either |
| 7 | Dependency advisory (finding 5) | Small | Developer |

Items 1, 2 and 3 are the ones worth doing before a review concludes.
