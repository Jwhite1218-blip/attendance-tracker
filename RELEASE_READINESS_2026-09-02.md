# Warren All-Star Package Release Readiness

Prepared: August 27, 2026

Dress rehearsal: Thursday, August 27, 2026

Production launch: Wednesday, September 2, 2026

## Production outcome — verified September 3

- **The September 2 production launch is confirmed.** Netlify production deploy
  `6a98304f7478c80008c8bba8` reached ready state at 10:19 AM ET from `main`
  commit `a2691d323cc06dc54f453f113acc4d0191185150`.
- That deployment includes the internal All-Star recognition workflow and all
  15 public NFC leaderboards; both release commits are ancestors of the deployed
  commit.
- Production advanced later on September 2 to ready deploy
  `6a98d35ae3f50900087c5dda` at 9:54 PM ET from `main` commit
  `387140b8738a82dcf71463bd6e8710f2e61a0802`; this is the current live deploy.
- The documented read-only public readiness check passed on September 3: the
  homepage and assets returned 200, anonymous session and state requests returned
  401, and all required security headers were present.
- The GET-only recognition readiness check passed for all 15 school pages and
  APIs. Each token resolved to the correct school, unknown tokens returned 404,
  and public responses exposed only the approved leaderboard fields. All 15
  leader lists were empty at verification time.
- Current `main` passes 125 automated tests and the Vite production build. The
  production-only dependency audit reports zero known vulnerabilities.
- Still not independently evidenced: the fresh pre-launch Liz backup, Liz and
  representative building-manager authenticated smoke checks, physical phone/NFC
  validation, the 60-minute monitoring window, and scheduled-report delivery.
  These remain owner-confirmation items rather than inferred passes.
- Owner confirmation received September 3: the updated PINs were saved and
  delivered to Liz. Credential values are intentionally excluded from this
  repository and the audit record.
- The isolated lab remains separate on Netlify Blobs. No production data writes
  were performed during this verification.

## Verified August 28

- 86 automated tests pass, including the administrator-only recognition boundary.
- The Vite production bundle builds successfully.
- The production dependency audit reports zero known vulnerabilities.
- The current production homepage, immutable assets, anonymous API denial, and
  security headers pass the remote readiness check.
- All 15 lab NFC pages return the correct school, accept no PIN, reject unknown
  tokens, and expose only name plus separate public recognition counts.
- Employees with only a Shout-Out, Shooting Star nomination, monthly All-Star,
  or Employee of the Month remain visible without increasing earned-star rank.
- Public responses exclude attendance, HR data, employee IDs, location IDs,
  criteria, notes, source names, and manager attribution.
- Browser checks confirm the Warren-branded crowd view, empty-school state,
  five separately compiled Liz totals, approved Daily Star reasons, Shooting
  Star nomination language, monthly drawing controls, ACE Bucks pending notice,
  and Liz-only Backup & Recovery page.
- The saved `DATA PERSISTENCE PROOF` employee and recognition survived refresh,
  sign-out/sign-in, and multiple lab redeploys, including the final deploy above.

## Known rehearsal restriction

The lab uses Netlify Blobs so its data cannot touch production. A 30-request
same-record stress test found that the hosted Blobs backend is not reliable for
many simultaneous edits to one record. This does **not** apply to the production
Supabase mutation path, which is tenant-scoped and atomic.

For August 27, use **one active editor at a time**. Other attendees may keep the
public crowd views open because those links are read-only. A true multi-editor
lab requires explicit approval to provision and migrate to a separate Supabase
tenant; do not improvise that change during training.

## August 27 dress rehearsal

### Before Liz and managers arrive

1. Open the lab URL and confirm the purple isolated-test banner is visible.
2. Open Warren Central's test crowd URL from the CSV on a phone using Wi-Fi,
   then cellular data. Confirm it opens without a PIN.
3. Confirm the production URL still shows the existing attendance package and
   has not received the recognition release.
4. Assign one person as the active editor. Everyone else observes or uses the
   read-only crowd links.

### Recognition script

1. Sign in to the lab with an administrator-role PIN and open **All-Stars**.
2. Record one **Star of the Day** with an approved reason. Refresh, navigate
   away and back, and confirm the employee earned-star total increases by one.
3. Record one **Shooting Star nomination**. Confirm its quarterly total changes
   and the earned-star total does not.
4. Record one **Warren Star Shout-Out**. Confirm its separate total changes and
   the earned-star total does not.
5. Switch the building filter and confirm only the selected school's employees
   and recognition history appear.
6. Sign in with a representative building PIN. Confirm **All-Stars** is absent,
   `/recognition` redirects to the assigned school, no recognition state is
   delivered, and recognition writes are denied. Return to administrator access
   before continuing.
7. Open the matching crowd URL and wait up to 60 seconds for its automatic
   refresh. Confirm only the public counts and names appear.

### Persistence and recovery script

1. Refresh the browser, sign out, sign back in, and confirm the three rehearsal
   records remain.
2. Publish no new code during the rehearsal. The prior persistence proof already
   demonstrates data survival across website redeploys.
3. As Liz, open **Backup & Recovery** and download a complete backup.
4. Store that JSON file privately. It contains attendance and HR information.
5. Review the restore flow, but do not restore unless verified data is actually
   missing. Restore requires a validated Warren backup and typing `RESTORE`.

### Dress-rehearsal pass criteria

- No lab action appears in production.
- Daily Star changes earned stars and drawing entries exactly once.
- Shooting Star and Shout-Out totals remain separate.
- School filters and public URLs resolve to the correct buildings.
- Building PINs cannot see, open, read, or write the recognition program.
- Data remains after refresh and sign-out/sign-in.
- Liz successfully downloads a full backup without technical assistance.
- Attendees understand that the public page is read-only and the lab permits
  only one active editor at a time.

## September 2 production launch

### Go/no-go gate

Do not launch unless every item is true:

- The release branch still passes `npm test`, `npm run build`,
  `npm audit --omit=dev`, and `npm run test:recognition:remote`.
- Liz confirms the August 27 rehearsal passed.
- The 15 NFC destinations in `SCHOOL_NFC_LEADERBOARD_URLS.csv` have not changed.
- Production still reports `ATTENDANCE_STATE_BACKEND=supabase` and the Supabase
  URL, secret key, and district slug variables are present.
- Liz downloads a fresh production backup immediately before deployment.
- The pre-launch production deploy ID is recorded for rollback.
- ACE Bucks values and Professional Standards are understood to remain pending;
  neither blocks the approved recognition launch.

### Controlled deployment

1. Announce a 15-minute change window and ask managers to finish active edits.
2. Record the current production deploy ID and release commit SHA.
3. Download the fresh Liz production backup.
4. Merge the reviewed release commit to `main`; production is Git-linked to
   `main`, so use that exact build instead of deploying an uncommitted folder.
5. Wait for Netlify to report the production deploy as ready and confirm its
   commit SHA matches the release commit.
6. Run `npm run test:production:public`.
7. Sign in as Liz and verify **Shared**, All-Stars, the district compilation,
   Backup & Recovery, one school roster, and sign-out.
8. Sign in with one building-manager PIN and verify school scoping, the absence
   of **All-Stars**, and the `/recognition` redirect.
9. Open one populated and one empty production NFC URL on a phone.
10. Activate or distribute the NFC cards only after those checks pass.
11. Monitor Netlify function errors and manager feedback for at least 60 minutes.

## Rollback

If the website or functions fail after launch:

1. Stop new entries and keep the downloaded production backup private.
2. In Netlify, publish the recorded pre-launch deploy. For the current baseline,
   that is `6a90d9a07b7e160009de2d61`; replace this ID with the actual pre-launch
   deploy if production changes before September 2.
3. Re-run the production public readiness check and verify Liz sign-in plus a
   school view.
4. Do **not** restore data merely because the website was rolled back. Website
   deploys and Supabase records are separate.
5. Use **Backup & Recovery** only if records are verified missing. A restore
   replaces managed state, creates a safety copy first, and requires `RESTORE`.

## Open items that do not block this release

- Liz still needs to define ACE Bucks amounts and redemption values.
- Professional Standards still needs its separate specification or approved URL.
- The optional public shout-out intake workflow has not been approved; current
  crowd pages are deliberately read-only.
