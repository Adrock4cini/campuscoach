# Real Student Auth + Multi-User Data — Plan

Goal: make Campus Companion safe for real beta students. Add real auth, onboarding that creates real classes, wire captures to the backend, and unhide the intelligence surfaces for signed-in users. Demo mode stays as a fallback for signed-out visitors.

No redesign, no new features beyond the auth/onboarding path required to reach the existing dashboard as a real user.

---

## 1. Auth UI (email + Google, dark premium look)

New files:
- `src/pages/Login.tsx` — email/password + "Continue with Google" + "Forgot password" link + "Create account" link. Uses the managed helper for Google.
- `src/pages/Signup.tsx` — email/password (with `emailRedirectTo: window.location.origin`) + Google, links to Login.
- `src/pages/ForgotPassword.tsx` — `resetPasswordForEmail` with `redirectTo: origin + "/reset-password"`.
- `src/pages/ResetPassword.tsx` — public route, reads `type=recovery` hash, `supabase.auth.updateUser({ password })`.
- `src/contexts/AuthContext.tsx` — one place that owns `session`, `user`, `signOut`, plus `isDemoMode` (unauthenticated visitor). Registers `onAuthStateChange` and stores session synchronously; `getUser()` used for trust checks.

Router:
- Add `/login`, `/signup`, `/forgot-password`, `/reset-password`.
- Replace `RootGate` with an auth-aware gate:
  - has session AND `profiles.onboarded_at IS NULL` → `/onboarding`
  - has session AND onboarded → `/dashboard`
  - no session AND demo not accepted → `/login` (with "Continue as demo" button that sets `isDemoMode`)
  - no session AND demo accepted → `/dashboard` in demo mode
- Add a `Logout` item to `AppSidebar` / settings.

Providers:
- Wrap `App` with `AuthProvider` at the top of the tree.
- Enable `password_hibp_enabled`; leave email confirmation on.
- Configure Google via `configure_social_auth` so both defaults ship (email + Google).

Constraint: email confirmation stays ON. Users must click the confirmation link before they land on onboarding.

---

## 2. Onboarding (post-signup, ≤5 min)

Reuse the existing `Onboarding` page and its store, but on completion write to Supabase instead of localStorage-only.

Steps (keep it short):
1. Name + learner type (`high_school | college | certification | other`) + term/semester string.
2. School (existing `SchoolCombobox`) — reuses `schools` table so students naturally join the same network.
3. Add classes — for each: title, professor/teacher, schedule (existing `DayPicker` + `TimePicker`), optional textbook.
4. Optional work schedule (single free-text block for now — keep simple).
5. Finish → seed `profiles`, `classes`, `enrollments`, and mark `profiles.onboarded_at = now()`.

Existing `SyllabusImport` stays available as a shortcut on the "Add classes" step.

Skipping onboarding is not allowed on the authenticated path.

---

## 3. Real user data — schema changes

Migration adds the missing columns needed to make onboarding round-trip. Everything else already exists.

`profiles` — add:
- `full_name text`
- `learner_type text` check in ('high_school','college','certification','other')
- `term text`
- `school_id uuid references public.schools(id)`
- `work_schedule text`
- `onboarded_at timestamptz`

`classes` — confirm and add if missing:
- `professor text`, `textbook text`, `schedule jsonb` (`[{ day, start, end, location? }]`)

RLS: keep existing per-user policies. Add self-insert/self-update on `profiles` if not already present. `schools` stays readable to `authenticated` for the combobox.

`user_roles` is out of scope; not needed for beta.

---

## 4. Dashboard — real users get the full experience

Currently `Dashboard.tsx` hides `DoThisNowHero`, `TodaysChecklist`, `BrainOneLiner`, `BottomBar` when `isReal` is true.

Change:
- Feed real classes into the same intelligence hooks (`useClassPriorities`, `useCampusBrainInsight`) so those surfaces have data.
- Remove the `!isReal &&` guards. Both branches render the same 5-row layout.
- `ClassQuickCard` vs `RealClassCard`: keep the split for now (real cards use live data), but present them identically in the "Your classes" column.
- When intelligence hooks have zero data (brand-new account, no captures yet), the components already have empty states — verify each renders a "Nothing yet — capture a lecture to get started" state instead of a blank card.

---

## 5. Quick Capture — Supabase-first when signed in

Change `src/lib/capture/processor.ts::commitCapture`:
- If a Supabase session exists: `await persistCaptureResult(...)` synchronously (currently fire-and-forget). If it succeeds, that's the source of truth. If it fails, fall back to localStorage and surface a toast "Saved locally — will sync when you're back online" (best-effort, not blocking).
- If no session (demo): keep the existing localStorage path unchanged.

Change `listCaptures` → make it async and route through a new `getCapturesForClass(userId, classId)` that reads from Supabase for authenticated users, localStorage otherwise. Class Memory (`src/components/capture/ClassMemory.tsx`) becomes an async data source — use React Query so loading/empty/error states are trivial.

`campus_brain_signals` writes: the aggregate signal path already handles RLS failures gracefully. Confirm it inserts `user_id = auth.uid()` (RLS requires it).

---

## 6. Demo mode preserved

- `AuthContext` exposes `isDemoMode` (no session + user accepted the demo prompt).
- Add a persistent "Demo mode" chip to `TopStrip` when true, with a "Create account" button linking to `/signup`.
- All existing demo data flows (`data/demo.ts`, localStorage) keep working unchanged for demo users.
- The dashboard shell is identical for demo and real — only the data source differs.

---

## 7. Security

- All new tables/columns keep RLS scoped to `auth.uid()`.
- `owns_row` grants stay as they are.
- No new anon SELECT policies. Community intelligence still flows through the existing aggregate tables (`topic_scores`, etc.), which are the aggregate-only surface.
- No secrets change.

---

## 8. Acceptance tests

Add Vitest specs alongside existing tests:
- `src/pages/__tests__/auth-journey.test.tsx` — renders Login, submits form, mocks `supabase.auth.signInWithPassword`, asserts navigation.
- `src/lib/capture/processor.auth.test.ts` — signed-in user: `commitCapture` calls `persistCaptureResult` and returns the same result on Supabase failure (fallback).
- Extend `useStudySession.test.tsx` — already covers score tally; add one case that verifies `endSession` sets `endTime` (proxy for "readiness/momentum updates" — the hook feeds those aggregates).

Plus a manual QA checklist in `docs/qa-checklist.md` covering the ten journeys the user listed (sign up → dashboard on another device).

---

## Execution order

1. Migration (profiles/classes columns).
2. `AuthContext` + `configure_social_auth` (Google) + `configure_auth` (HIBP on).
3. Auth pages + reset flow + router gate + logout in sidebar.
4. Onboarding rewrite → writes to Supabase, marks `onboarded_at`.
5. Dashboard: unhide surfaces for real users, verify empty states.
6. Capture: Supabase-first `commitCapture` + async `listCaptures` + Class Memory read path.
7. Tests + QA checklist.
8. Full typecheck + tests + Playwright sweep of the auth routes.

---

## Open questions before I start

1. **Email confirmation** — keep the standard "click the link in your email" flow (safer, default), or auto-confirm for the beta to remove friction? Default: keep on.
2. **Learner types** — the four listed are fine? Any missing (grad, bootcamp, self-study)?
3. **Onboarding — mandatory vs skippable?** Assumption: mandatory for authenticated users. Signed-in users cannot reach `/dashboard` until onboarding is complete.
4. **Work schedule** — free-text block (fast) or full time-picker rows like classes (slower, richer)? Default: free-text for beta.

If any of these are wrong, tell me which; otherwise I'll build on the defaults.