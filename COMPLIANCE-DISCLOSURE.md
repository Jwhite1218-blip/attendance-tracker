# Warren Student Nutrition All-Stars / Attendance Tracker
## Disclosure pack for IT and compliance review

Prepared 20 October 2026. Written to be read by someone who will not read the
code, and to be checkable by someone who will.

---

## 1. What it is, in one paragraph

A web application used by Warren Township food service to record daily staff
attendance exceptions and to run the All-Stars employee recognition
programme. Roughly nineteen people use it: the food service director, a small
district office group, and the manager or lead in each of fifteen school
kitchens. It replaces a paper and spreadsheet process. It was built by a
family member of the food service director, at no cost to the district, and
has been in daily use since September 2026.

## 2. What it stores

| Data | Detail |
|---|---|
| Staff names | First and last name |
| Job title and school | Current assignment, and a history of transfers from 11 Oct 2026 |
| Service date | Used for years-of-service on the employee card |
| Birthday (day/month) | Optional, for birthday recognition |
| T-shirt size | Optional, for staff apparel |
| Attendance exceptions | Date and code — approved time off, no-call/no-show, late in, early out, unexcused, bereavement, FMLA/LOA, other — with an optional comment |
| Manager notes | Free text, dated and attributed to the manager who wrote it |
| Employment status | Active or inactive. Nothing more — no dates, no reason |
| Recognition records | Who was recognised, when, why, and who recognised them |
| Professional Standards training | Hours, type and USDA key area, per training event |
| Sign-in credentials | A 4-digit PIN per login, encrypted (see section 5) |

**It does not store:** social security numbers, addresses, bank details,
medical information, disciplinary records, or any student data of any kind.
Birthdays are held as day and month only, with no year.

**Termination date, last day worked and reason for leaving were removed on
20 October 2026.** They were the clearest HR records in the application and
the district keeps that information on its own forms. Marking somebody
inactive is now a status change and nothing else.

**Hire date was removed entirely on 20 October 2026**, along with the
work-anniversary feature that was the only thing using it. The district's own
hire dates proved to be out of date, so the feature was marking the wrong
day. The field is gone from the roster file, from every form and report, and
is no longer sent to any user; stored copies were purged.

**Annual pay, contracted weekly hours, middle name and department were
removed on 20 October 2026.** The base staff roster is a file inside the
source repository covering 146 food service employees, and it carried those
four fields. Nothing in the application read them and none was ever sent to
a user — the server filters every roster record through an explicit
allowlist and they were not on it — but they should not have been held at
all. They are now deleted from the file. They remain in the repository's
version history, which is private; see section 6.

**The district's payroll number is no longer shown or exported anywhere.** It
remains on each record as the internal key that attendance history, stars and
notes hang from — removing it outright would orphan every record ever
entered. It is not displayed on any screen, not in any report column, and not
in any spreadsheet export; the switch that could restore it to the screen was
deleted rather than left off. Employees added from 20 October onward receive
an opaque identifier that means nothing outside this application. Re-keying
the historic records onto opaque identifiers is planned as a separate,
backed-up migration.

**Phone numbers** were collected briefly in October 2026 and were deleted from
the database on 19 October 2026 at HR's request. Zero records remain; this was
verified by query.

## 3. What it does not do

- **No artificial intelligence of any kind runs in the application.** There is
  no AI service, no language model, no machine learning model, and no
  connection to any AI provider. Nothing a user types is sent to an AI system.
  The application's entire runtime dependency list is five open-source
  packages: React, React DOM, React Router, a spreadsheet library for Excel
  export, and Netlify's storage client. None is AI-related.
- **No automated employment decisions.** The application adds up attendance
  occurrences a manager has typed in and displays the total. It makes no
  recommendation, no rating, no prediction and no decision.
- **It is explicitly not an HR system.** In October 2026, at the director's
  instruction, every element that read as formal disciplinary documentation
  was removed. The application now shows a count and a reference note that any
  formal step happens "outside this app", on the district's own forms. Every
  printed page carries the line: *a tracking record, not a disciplinary file.*
  There is an automated test that fails the build if words like "warning",
  "termination" or "discipline" reappear in those labels.

### On the use of AI to write the software

The code was written with the assistance of an AI coding assistant (Claude),
in the same way a developer might use an IDE, a linter, or Stack Overflow. The
finished application contains no AI. This distinction matters: the tool used
to write the software is not present in the software.

For completeness: during development, staff names have at times appeared in
the developer's working session — for example a list of five administrator
login names on 19 October 2026. No PINs, no attendance records, no notes and
no student data have been placed into an AI tool.

## 4. Where it runs

| Component | Provider | Purpose |
|---|---|---|
| Website and server functions | **Netlify** | Hosts the site; runs the small server programs that read and write data |
| Database | **Supabase** (PostgreSQL) | Stores everything in section 2 |
| Email | **Resend** | Sends the end-of-day summary email to the director |
| Source code | **GitHub**, private repository | Version history |

All four are mainstream commercial providers. **Neither Netlify nor Supabase
is on the district's approved vendor list, because the application has not yet
been through vendor review. That is the purpose of this document.**

**Open question for the review:** the physical region of the Supabase database
has not been confirmed. If the district has a data residency requirement, this
needs checking in the Supabase dashboard before approval.

## 5. How it is secured

Each item below is verifiable in the source code.

**Getting in**
- Access requires a 4-digit PIN. There is no public sign-up and no other way in.
- PINs are stored encrypted (AES-256-GCM), not in plain text.
- Sign-in attempts are rate limited per source address.
- A session lasts 8 hours and is held in a cookie that JavaScript cannot read
  (HttpOnly), is sent only over HTTPS (Secure), is not sent to other sites
  (SameSite=Strict), and is cryptographically signed so it cannot be forged.

**The database**
- Row Level Security is **enabled and forced on all ten tables, with no access
  policies defined at all**. In PostgreSQL this denies every connection except
  the application's own server credential. A leaked read key would return
  nothing.
- **The browser never holds a database key.** The database is unreachable from
  the public internet via the application. Every read and write passes through
  a server function that checks the session first.
- Every change is written to an audit table recording what changed and when.

**What each person can reach**
- A school login sees only its own building's staff, attendance and
  recognition. This is enforced on the server, not merely hidden in the page.
- District-wide settings, the access list and roster changes are restricted to
  the director's login.
- Since 19 October 2026, any administrator other than the director must submit
  roster changes — employee card edits, transfers, status changes, new
  employees — for the director's approval. They cannot change the roster
  directly. This is enforced on the server.

**The website itself**
- A strict Content Security Policy, HTTP Strict Transport Security,
  clickjacking protection, no-referrer policy, and camera, microphone and
  location access disabled at the browser level.
- The source repository is private.

## 6. Known gaps, disclosed

These are stated plainly because an IT reviewer will find them, and finding
them undisclosed would reasonably undermine confidence in everything above.

1. **Version history retains what has been removed.** Pay, hours, hire dates
   and middle names have been deleted from the roster file, but the
   repository's history still contains them, as it does for any file ever
   committed. The repository is private. Whether the history also needs
   rewriting is a question for the review rather than something to decide
   unilaterally.

2. **Fifteen public pages show staff names.** Each school has a public
   recognition leaderboard — no sign-in — listing staff **full first and last
   names** with their recognition counts. Each is at an unguessable address
   protected by a random 16-character token, and the tokens are not published
   anywhere public. But anyone who has ever been sent one of those links
   retains access. *Decision needed: keep, reduce to first name and last
   initial, or withdraw pending review.*

3. **Test copies of the site are publicly reachable and accept live PINs.**
   Netlify publishes a preview copy for each change. These are currently open
   to the internet and a real district PIN will sign in to them. *This should
   be closed before any review concludes.*

4. **PIN strength versus guessing.** A 4-digit PIN allows 10,000
   combinations, of which about nineteen are valid. The current rate limit
   permits 100 attempts per 15 minutes from one address, which means a
   determined attacker could expect to find a working PIN within a few hours.
   *The rate limit should be tightened; see the technical review.*

5. **Data persists in the browser.** For speed, the application keeps a copy of
   the data it has loaded in the browser's local storage. It is erased when the
   app is next opened without a valid session, and sessions expire after 8
   hours — but on a shared kitchen device, data can sit on that device until
   then.

6. **One known moderate-severity advisory** in a third-party package used by
   the hosting provider's storage client. Not known to be exploitable here;
   listed for completeness.

## 7. What is being asked of the district

The application solves a real daily problem and is already relied upon. The
request is not for permission after the fact to keep something hidden — it is
for the district to decide, on the record, one of the following:

- **Approve it** through the vendor governance process, with any conditions
  the review attaches.
- **Approve it conditionally**, pending specific changes. The gaps in section 6
  can be closed quickly.
- **Decline it**, in which case the data can be exported and the application
  retired. There is a built-in backup and export function; nothing is trapped.

## 8. Who to ask

- **The application and its data:** the food service director.
- **The code, hosting and database:** the developer, who built and maintains it.
- **Verification:** anything asserted in this document can be checked in the
  source repository, which will be made available to the review on request.
