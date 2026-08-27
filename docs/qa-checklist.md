# 13+ Family Beta Release Checklist

Run this checklist against the exact staging release candidate on desktop and
an actual iPhone in Safari. Do not invite a family until every **release gate**
passes. This beta is for invited students age 13 and older only.

## Release identity and account controls

- [ ] `VITE_PUBLIC_SIGNUPS_ENABLED` is absent or `false` in the release build.
- [ ] `VITE_CANVAS_CONNECT_ENABLED=false` exactly; Canvas and all Canvas Edge
      Functions are outside this invite-only launch inventory.
- [ ] The release bundle uses the production Supabase project ID; setting the
      frontend signup flag to `true` still does not open production registration.
- [ ] New-user creation is disabled in Supabase Auth; a direct unauthenticated
      signup and a new Google identity are rejected server-side.
- [ ] Supabase Auth Site URL and allowed redirects use the exact published HTTPS
      origin, including the password-reset destination; preview URLs are removed.
- [ ] Invitation/confirmation/reset email delivery is verified through the
      configured production SMTP sender.
- [ ] `VITE_PUBLIC_SUPPORT_EMAIL` is a monitored address shown on Privacy.
- [ ] The post-deploy canary receives HTTP 404 for `seed-beta-user`,
      `canvas-connect`, `canvas-oauth-callback`, `canvas-sync`, and
      `canvas-calendar-sync`; none of those five functions is deployed.
- [ ] One invited email/password account can sign in; an uninvited address cannot
      create an account.

## Agreement and authentication

- [ ] A new invited account must accept the current 13+ family-beta agreement.
- [ ] Declining/signing out leaves no durable agreement receipt. Acceptance
      creates one owner-bound current-version row with a server timestamp.
- [ ] Direct Auth `user_metadata` mutation cannot unlock the app or any guarded
      capture, study, or syllabus Edge route; missing receipt returns HTTP 403.
- [ ] The dedicated canary has a current durable receipt before its invalid-body
      Edge probes, and the canary verifies that receipt before expecting HTTP 400.
- [ ] A separate dedicated canary has no receipt; all six guarded functions
      return private HTTP 403 with `reason: family_beta_agreement_required` for
      it. The two accounts have different email addresses and Auth UUIDs.
- [ ] Without a current receipt, direct browser capture/material/processed-content
      INSERT/UPDATE and direct `capture-sources`/`syllabus-sources` Storage
      INSERT fail. With the receipt, valid owned writes succeed; DELETE and service-role processing/
      account-erasure paths still work.
- [ ] Direct browser INSERT into `study_strategy_outcomes`, `topic_signals`,
      `exam_debriefs`, and `campus_brain_signals`, plus authenticated UPDATE of
      `topic_signals`, `exam_debriefs`, and `campus_brain_signals`, requires the
      current receipt and an open study-write gate. Accepted owner writes retain
      their existing bounds after resume; owner DELETE and service-role result
      projection/account erasure still work.
- [ ] Password sign-in, forgot password, reset link, and sign-out all work.
- [ ] After onboarding, reload, browser restart, explicit sign-out, and subsequent
      password sign-in all return the same account without rerunning setup.
- [ ] Protected deep links send an unfinished account to onboarding and return a
      completed account to its intended path and query string.

## Five-step onboarding

- [ ] Steps are **You, School, Term, Classes, Schedule**.
- [ ] Next stays disabled until the student chooses Middle school, High school,
      College, Certification/bootcamp, or Other; College is not preselected.
- [ ] A custom school name works without requiring Canvas.
- [ ] Manual class entry is prominent; Canvas is clearly optional.
- [ ] Weekly meetings require valid term dates and save in the local time zone.
- [ ] Finishing writes only the signed-in student's profile, classes, and
      enrollments, then opens the real dashboard.

## Class-owned syllabus

- [ ] Every class says **No syllabus added** or **Syllabus connected** and offers
      Add / View or replace syllabus.
- [ ] Upload one PDF or one photo. For several paper pages, use the in-app
      iPhone Files → Scan Documents instructions to create one PDF first.
- [ ] Review homework/quizzes, tests, test topics, term dates, meetings, and
      dated class topics before saving.
- [ ] Saving once returns to the class and creates exactly one active syllabus.
- [ ] Reviewed dates appear in the class, dashboard, and the correct calendar
      month; test topics focus existing notes/captures in Study Lab.
- [ ] A second class receives none of the first class's syllabus data.

## Quick Capture on iPhone

- [ ] Choose six photos: four are retained, two are honestly reported as not
      added, and **Add to class** remains enabled for the four valid photos.
- [ ] Remove one photo, replace it, and use Remove all; controls remain at least
      44×44 px and VoiceOver announces their names/status.
- [ ] Save four photos, then save the remaining two with the same topic/date.
      Both captures remain visible in Class Memory after reload.
- [ ] Force one upload failure: Back/Review preserves photos and choices; Retry
      succeeds without creating an orphan assignment.
- [ ] A signed-in capture persists across a second browser; demo capture produces
      no Supabase REST, Functions, Storage, or Realtime traffic.

## Dashboard, deadlines, and study

- [ ] Class shortcut chips open the correct class.
- [ ] Today's focus never hides an overdue assignment or recommends completed
      work; data-load failure shows Retry instead of confident advice.
- [ ] Upcoming tests exclude past dates. Past tests remain historical and do not
      offer an active Study CTA.
- [ ] A saved capture can generate flashcards and multiple choice grounded in the
      student's material; a completed session persists after reload.
- [ ] Assignment and test create, complete, edit, and delete-confirmation flows
      work with 44 px mobile targets.
- [ ] A photographed assignment requires a title, preserves its draft on a
      failed upload, shows the confirmed source review, and reaches **Hint →
      worked example → You try → changed transfer problem → saved weakness**.
- [ ] The transfer answer, not seeing the worked answer, is the only Tutor event
      that can increase mastery; a miss returns in later review.
- [ ] Literal ACCT 2010 activation creates exactly 15 original stable course-map
      concepts, no mastery rows, no publisher prose, and no store/professor
      metadata in a generated artifact.

## Privacy and isolation

- [ ] User A cannot read, update, or delete User B's rows; anonymous access to
      private rows/objects is rejected. Owner operations succeed.
- [ ] Switching A → B in the same browser immediately clears A's open capture
      draft, class names, Class Memory, deadlines, and study artifact.
- [ ] The account-deletion rehearsal removes the Auth user, every owner row, and
      every object under the user's prefixes in `capture-sources` and
      `syllabus-sources`; old signed URLs fail.
- [ ] The middle-school migration is applied and a `middle_school` profile saves
      and reloads successfully.
- [ ] The onboarding-completion backfill is applied before this client so an
      established account keeps access while a partially saved new setup still
      returns to onboarding.
- [ ] The capture-attempt idempotency migration is applied before this client;
      repeating one retained capture attempt produces one assignment, capture,
      set of pages, and capture signal.
- [ ] Anonymous clients cannot read `topic_signals`, `exam_debriefs`, or
      `topic_scores`; User A and User B can read/mutate only their own raw rows;
      browser clients cannot read cross-student topic scores.

## Technical release gates

- [ ] Lint, typecheck, full unit tests, production build, and desktop/Android/
      iPhone Playwright projects pass on the exact commit.
- [ ] Updated Edge Functions compile and are deployed before their calling UI.
- [ ] `npm run validate:release-env` passes with the exact HTTPS origin, backend
      project, publishable/anon key, commit SHA, monitored support address,
      signups disabled, Canvas Connect disabled, and passkeys either
      disabled or correctly bound.
- [ ] The final canary process validates both distinct protected account
      addresses/passwords without exposing them to checkout, install, audit,
      Edge verification, validation, or build steps.
- [ ] Paid AI extraction, syllabus, and image paths have both hourly and daily
      fail-closed quotas, plus a tested provider-side hard spend cap/alert.
- [ ] Every changed student-data function returns private `no-store`, `nosniff`
      JSON with a request ID and exposes no provider/DB/source details on 5xx.
- [ ] The published host enforces CSP (`frame-ancestors 'none'`, `object-src
      'none'`), one-year HSTS with `includeSubDomains`, strict Referrer-Policy,
      Permissions-Policy disabling camera/microphone/geolocation, and `nosniff`.
- [ ] Same-origin `release-manifest.json` exactly matches the deployed SHA,
      production Supabase project ID, disabled signup and Canvas Connect flags,
      reviewed passkey state, and public support address; the page loads no
      cross-origin scripts.
- [ ] A sanitized browser crash test reaches the production operator alert;
      neither the event nor Edge 5xx logs contain student content or identifiers.
- [ ] The protected **Production release readiness** workflow passes against the
      exact deployed commit and both dedicated empty canary accounts.
- [ ] The workflow uses the protected `PRODUCTION_ORIGIN` variable and exposes
      no dispatch input that can substitute a different website.
- [ ] The workflow ran from protected `main`; its four account credentials were
      available only to the final direct Node canary step.
- [ ] The rollout paused before the agreement/Edge handoff, drained the old
      revisions, and the `20260827125500` restrictive maintenance guard denied
      authenticated browser INSERT/UPDATE on captures, materials, and processed
      content plus INSERT into both source buckets. Service-role recovery and
      DELETE/account erasure remained available. The rollout remained paused
      through verification of `20260827132000` and the
      `20260827133000` browser learning-evidence guard, then resumed exactly
      once before the public canary. The recorded host maintenance rule was
      removed only while invites remained closed.
- [ ] The deployed Edge inventory contains exactly the ten reviewed revisions,
      including both cleanup workers and the private `mcp` HTTP 410 tombstone;
      no historical MCP demo/tool response remains, and the five forbidden
      function probes above all return HTTP 404.
- [ ] Syllabus migrations, private bucket policies, cleanup function, and one
      active hourly cleanup job are present; a production no-op cleanup returns
      HTTP 200 with zero claims when the bucket is empty.
- [ ] No unexpected 4xx/5xx responses, uncaught application errors, horizontal
      overflow, or secret/service-role values appear in browser logs.
- [ ] Rollback commit/deployment is identified before publishing.
- [ ] After deployment, the unchanged four-case learning benchmark (14% of 50,
      hypo/hyper, Maryland → Annapolis, leave-and-return persistence) is rerun
      without moving its scoring criteria.
