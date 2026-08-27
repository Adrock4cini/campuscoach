# Campus Companion

Campus Companion turns a student's own class material into grounded study
activities, remembers demonstrated weaknesses, and brings them back before an
exam. The launch path is intentionally narrow: capture one assignment problem,
confirm what the app read, learn through a hint and worked example, solve a new
problem independently, and save that result to concept mastery.

## Local development

Prerequisites:

- Node 20 (see `.nvmrc`)
- npm
- Chromium and WebKit for browser journeys

```sh
npm ci
cp .env.example .env
npm run dev
```

Configure the three public Supabase values in `.env`. The browser fails closed
unless the URL is an exact HTTPS Supabase origin, its project ref matches, and
the key is publishable/anon. Never put a service-role key, an `sb_secret_` key,
or the Lovable AI key in a `VITE_` variable.

## Verification

Run the same gates expected in CI:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium webkit
npm run e2e
git diff --check
```

The Playwright journeys build and serve the optimized production bundle across
desktop Chromium, Pixel-sized Chromium, and iPhone-sized WebKit.

The protected production workflow additionally runs:

```sh
npm run validate:release-env
npm run canary:release
```

The first command validates the exact backend, release SHA, support address,
signup state, and passkey state without printing values. The second runs only
after deployment with a dedicated empty canary account; it proves the published
bundle, security headers, Auth, required migrations/functions, and sanitized
error signal through zero-AI invalid requests.

## Learning boundaries

- Source material is evidence, not automatically a correct answer.
- Assignment OCR stays quarantined until the student confirms the exact
  problem.
- Assignment Tutor teaches with a different worked example, then uses a changed
  transfer problem as the durable mastery signal.
- The Teaching Router chooses a method from the learning problem and error
  class, not from the selected UI format.
- Stable course knowledge controls truth; institution and professor data are
  overlays that control relevance.
- Publisher platforms, textbooks, and adoption records are metadata only. Do
  not ingest Phillips/McGraw Hill, Connect, EXAMIND, or OpenStax prose.

## Backend functions

The launch release changes these Supabase Edge Functions together:

- `process-capture-images`
- `extract-concepts`
- `generate-artifact`
- `confirm-assignment-practice-source`
- `record-study-result`
- `parse-syllabus`
- `report-client-error`

They require these server-side secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY` where an AI-backed path is used

Paid AI branches consume both hourly and daily durable quotas before contacting
the provider. Production must also have a provider-side hard spend cap and alert.
The error-reporting function accepts only authenticated, content-free error
classes and redacted routes; a production log alert must be tested before invites.

## Production rollout

Do not apply every pending `20260827` migration in one unattended pass. The
release has an additive phase, a worker deployment, and a brief write-pause
phase. Follow [the Study Intelligence rollout](docs/study-intelligence-rollout.md)
exactly; it is the source of truth for migration order, drain requirements,
acceptance checks, and rollback preparation.

The UI may be published only after the backend boundary is verified with two
authenticated test users and the complete capture → confirmation → Tutor →
transfer → mastery → reload journey succeeds in staging. Then run the protected
`Production release readiness` workflow against the exact published HTTPS
origin; it must be green before the first invitation.
