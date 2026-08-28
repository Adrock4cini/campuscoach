# Campus Companion

Campus Companion turns a student's own class material into grounded study
activities, remembers demonstrated weaknesses, and brings them back before an
exam. The launch path is intentionally narrow: capture one assignment problem,
confirm what the app read, learn through a hint and worked example, solve a new
problem independently, and save that result to concept mastery.

## Local development

Prerequisites:

- Node 24.19.0 (see `.nvmrc`)
- Deno 2.2.12 (see `.deno-version`)
- npm 11.9.0 (the only supported package manager; see `packageManager`)
- Chromium and WebKit for browser journeys

```sh
npm ci
cp .env.example .env
npm run dev
```

`package-lock.json` is the sole npm/package-manager lockfile and frontend release
authority. `deno.lock` separately pins the integrity of the exact npm imports
used by Supabase Edge Functions. Use `npm ci` for reproducible installs in
development, CI, Lovable, and production builds. Do not add `bun.lock` or
`bun.lockb`; competing package-manager lockfiles can make an automated host
resolve a different dependency graph than the one CI verified.

Configure the three public Supabase values in `.env`. The browser fails closed
unless the URL is an exact HTTPS Supabase origin, its project ref matches, and
the key is publishable/anon. Never put a service-role key, an `sb_secret_` key,
or the Lovable AI key in a `VITE_` variable.

## Verification

Run the same gates expected in CI:

```sh
npm run audit:prod
npm run audit:tooling
npm run lint
npm run typecheck
npm test
deno task verify:edge
npm run build
npx playwright install chromium webkit
npm run e2e
git diff --check
```

The Playwright journeys build and serve the optimized production bundle across
desktop Chromium, Pixel-sized Chromium, and iPhone-sized WebKit.

The Edge gate installs the exact `package-lock.json` graph, requires exact
Supabase npm imports and a frozen `deno.lock`, and uses the pinned Deno runtime.
It runs the Deno-native Canvas calendar test and type-checks every
`supabase/functions/*/index.ts` entry point. Frontend verification uses the
exact Node/npm pair, audits both production and developer dependencies, then
runs lint, typecheck, unit, build, and cross-device journey gates. The single
**Required CI** result fails unless both lanes pass; do not deploy while it is
red.

The protected production workflow additionally runs:

```sh
npm run validate:release-env
npm run canary:release
```

The first command validates the exact backend, release SHA, support address,
signup state, and passkey state without printing values. The second validates
both protected canary identities at runtime, then runs after deployment with
dedicated accepted and unaccepted empty accounts; it verifies the published
bundle, direct SPA deep-link fallback, all deployed invite-only indexing
controls, the same-origin non-cacheable public release manifest, strict security
header semantics, both live Auth sessions, the exact
agreement-denial contract, accepted zero-AI validation responses, both cleanup
worker denials, the MCP HTTP 410 tombstone, the exact learning-evidence contract
with fresh legacy writes closed, the evidence-aware `record-study-result`
validation fingerprint, and
error-report ingestion. The contract checks are authenticated and read-only; they
do not create coursework or study results. The canary still does not prove the
complete migration ledger, RLS isolation, every Edge revision, alert delivery,
or full successful write paths; those remain manual staging and operator gates
below.

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
- `cleanup-abandoned-captures`
- `cleanup-abandoned-syllabi`
- `mcp` (a private HTTP 410 retirement tombstone; no demo data or tool runtime)

That is ten deployed function revisions: six agreement-guarded student
study/capture/syllabus endpoints, two secret-bound cleanup workers, the safe
client-error intake, and the retired MCP tombstone.

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

Do not apply every pending launch migration in one unattended pass. The
release has an additive phase, a worker deployment, and a brief write-pause
phase. Follow [the Study Intelligence rollout](docs/study-intelligence-rollout.md)
exactly; it is the source of truth for migration order, drain requirements,
acceptance checks, and rollback preparation.

The UI may be published only after the backend boundary is verified with two
authenticated test users and the complete capture → confirmation → Tutor →
transfer → mastery → reload journey succeeds in staging. Then run the protected
`Production release readiness` workflow against the exact published HTTPS
origin; it must be green before the first invitation.
