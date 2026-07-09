# Beta QA Checklist — Real Student Auth

Run through this before shipping the beta build. Each item should pass on desktop and mobile widths.

## Signed-out / demo mode
- [ ] Visiting `/` while signed out redirects to `/login`.
- [ ] "Continue as demo" on the login screen goes straight to `/dashboard` with demo classes visible.
- [ ] Sidebar footer shows **Sign in · demo mode**.
- [ ] TopStrip shows the "Demo · Create account" chip on `sm+` widths.

## Sign up
- [ ] `/signup` with a fresh email + strong password creates an account.
- [ ] A leaked password (`Password1!`) is rejected by HIBP.
- [ ] After sign-up the user lands on `/onboarding` (auto-confirm is on for beta).

## Onboarding
- [ ] All eight steps advance with the primary button.
- [ ] "Skip · use demo" is NOT visible (removed for authenticated users).
- [ ] Learner type selector on step 1 works.
- [ ] Finishing writes a `profiles` row with `onboarded_at`, `learner_type`, `term`, `work_schedule`, `school_id`.
- [ ] Finishing writes `classes` + `enrollments` scoped to the current user.
- [ ] Reaching the dashboard after Finish takes < 5 minutes with realistic input.

## Dashboard (real user)
- [ ] Do This Now hero is visible.
- [ ] Today's Plan sidebar is visible.
- [ ] Campus Brain one-liner is visible.
- [ ] Bottom bar (momentum / streak) is visible.
- [ ] "Your classes" lists the real classes added in onboarding.
- [ ] With zero classes the empty state shows: "No classes yet — add one from Settings…"

## Quick Capture (signed in)
- [ ] Capture flow (record / scan / note) completes without errors.
- [ ] The capture appears in Class Memory on the same device immediately.
- [ ] Signing in on another browser shows the same capture in Class Memory.
- [ ] Network tab confirms POSTs against `/rest/v1/captures` and `/rest/v1/processed_content` return 201, not 401.

## Study from Capture
- [ ] Study drawer opens from a capture.
- [ ] Completing a session updates readiness/momentum on the dashboard.

## Password reset
- [ ] `/forgot-password` sends a reset email.
- [ ] Following the link lands on `/reset-password` and setting a new password signs the user in.

## Sign out
- [ ] Sidebar "Sign out" clears the session and redirects to `/login`.
- [ ] Trying to open `/dashboard` afterward redirects back to `/login`.

## Multi-user isolation
- [ ] User A cannot see User B's captures or classes (Supabase Studio → run selects as each JWT).
- [ ] `community_insights` / `topic_scores` remain aggregate — no per-user identifiers exposed.
