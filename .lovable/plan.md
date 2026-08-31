# LIVE signup readiness check (read-only, no changes made)

Bottom line: **RED — two brand-new students cannot self-serve sign up on the published app today.** The live build runs on the production backend, where self-serve registration is deliberately closed. You must create their accounts for them (or approve a config change) before sending the link.

## Checklist

| Item | Status | Detail |
|---|---|---|
| `/signup` route exists | GREEN | Route is live. |
| Signup form actually shown | RED | On production, the page renders the closed-beta screen: "New accounts are created by invitation". No email/password form, no Google button. |
| Google sign-in on `/login` | RED | The "Continue with Google" button is hidden whenever self-serve signups are closed — production included. |
| Password sign-in on `/login` | GREEN | Email + password form is always available, so pre-created accounts work. |
| Invite/allowlist blocks unknown email | RED (by design) | The gate is the production project ref itself: self-serve opens only on a separately configured staging backend with an explicit flag. Production can never open it, even if the flag were set. |
| Email verification requirement | YELLOW | Unverified — cannot read the live auth email/confirm setting in read-only mode. If confirmation is on, each account must click a confirmation link before first sign-in. |
| Family Beta 13+ agreement gate | GREEN | Every protected route redirects to `/family-beta-agreement` until accepted; one checkbox (13+, terms, privacy) then continues. Backend acceptance RPCs are live and verified. |
| Onboarding gate | GREEN | After acceptance, a new account is sent to `/onboarding` once, then lands on Today/Dashboard. |
| 18+ / certification / security gate | GREEN | None exists. Only the 13+ confirmation. |
| New account reaches dashboard | GREEN (once the account exists) | Sign in → agreement → onboarding → `/dashboard`. |
| Two new users concurrently | GREEN | All data is per-user with row-level security; no shared/global state, no single-session lock. Separate devices or separate browser profiles are fine. |
| Password reset available | GREEN | `/forgot-password` is live. |

## What blocks you tonight

Self-serve signup is intentionally hard-closed on production: it unlocks only when the app is pointed at a separate, non-protected staging backend **and** an explicit flag is `true`. The production project is on the permanent protected list, so no flag or link can open registration there.

## Instructions to give your daughters (after you create their accounts)

1. Open the app link on their own phone or laptop.
2. Tap **Sign in with password** (not "Create account" — that page will say invitation only).
3. Enter the email and temporary password you gave them.
   - If they get an email-confirmation notice, open the emailed link first, then sign in.
4. On the safety screen, read it and check the box confirming the student is 13+, then continue.
5. Complete the short onboarding (school, classes).
6. They land on **Today**. From there: add a class, scan an assignment, study.
7. If they forget the password, use **Forgot password?** on the sign-in screen.

## Options to make them self-serve (needs your approval; nothing done yet)

- **A (recommended, no code change):** you create both accounts in the Cloud users area and hand each daughter their credentials. Zero risk, works with the currently published build.
- **B:** open Google sign-in only on production for the beta — requires a code change and a new publish, and weakens the current closed-beta guard.
- **C:** move the family beta onto a separate staging backend where self-serve is already supported — larger change, not a tonight task.

Also worth confirming before you send the link: whether email confirmation is enabled, since that decides if step 3's confirmation email is needed.
