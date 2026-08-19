# 13+ Family Beta Release Checklist

Run this checklist against the exact staging release candidate on desktop and
an actual iPhone in Safari. Do not invite a family until every **release gate**
passes. This beta is for invited students age 13 and older only.

## Release identity and account controls

- [ ] `VITE_PUBLIC_SIGNUPS_ENABLED` is absent or `false` in the release build.
- [ ] New-user creation is disabled in Supabase Auth; a direct unauthenticated
      signup and a new Google identity are rejected server-side.
- [ ] `VITE_PUBLIC_SUPPORT_EMAIL` is a monitored address shown on Privacy.
- [ ] The retired `seed-beta-user` Edge Function returns HTTP 410 (or is absent).
- [ ] One invited email/password account can sign in; an uninvited address cannot
      create an account.

## Agreement and authentication

- [ ] A new invited account must accept the current 13+ family-beta agreement.
- [ ] Declining/signing out leaves no accepted agreement metadata.
- [ ] Password sign-in, forgot password, reset link, and sign-out all work.
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

## Technical release gates

- [ ] Lint, typecheck, full unit tests, production build, and desktop/Android/
      iPhone Playwright projects pass on the exact commit.
- [ ] Updated Edge Functions compile and are deployed before their calling UI.
- [ ] Syllabus migrations, private bucket policies, cleanup function, and one
      active hourly cleanup job are present; a production no-op cleanup returns
      HTTP 200 with zero claims when the bucket is empty.
- [ ] No unexpected 4xx/5xx responses, uncaught application errors, horizontal
      overflow, or secret/service-role values appear in browser logs.
- [ ] Rollback commit/deployment is identified before publishing.
