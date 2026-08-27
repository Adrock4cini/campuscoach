# Campus Coach — RLS and privacy boundaries

Campus Coach stores sensitive student data: raw notes, recordings, scans,
assignment text, study attempts, and readiness signals. This document is a
classification overview, not a deployment runbook.

The authoritative launch procedures are:

- `docs/family-beta-operations.md` for Auth, agreement, hosting, canaries, and
  family-beta operations.
- `docs/study-intelligence-rollout.md` for migration order, the coordinated
  study-write pause, executable RLS checks, Edge deployment, and rollback.
- `docs/capture-storage.md` and `docs/syllabus-cleanup.md` for private source
  objects and bounded cleanup.

If this overview conflicts with a reviewed migration or those runbooks, stop
the rollout and reconcile the conflict before deploying.

---

## 1. Launch mode

The current release target is an invite-only, authenticated, 13+ family beta.
It is not an anonymous demo or a public/self-serve launch.

- `public.owns_row(user_id)` requires a non-null authenticated subject equal to
  the row owner.
- The browser fails closed when Supabase configuration is absent or invalid.
- Public signup is disabled in the release build and must also be disabled in
  hosted Auth configuration.
- A durable current-version family-beta agreement receipt is required at the
  table, Storage, and guarded Edge write boundaries.
- The coordinated study-write pause denies authenticated browser writes during
  the migration and function handoff while preserving reviewed service-role
  recovery and account-erasure paths.

The old `auth.uid() IS NULL` prototype path is retired. Do not restore it for a
preview, test fixture, or launch workaround.

---

## 2. Private student data

Raw, identifying, reconstructable, or performance data is owner-only. Another
student must never receive it, including through an aggregate payload.

| Data | Examples |
| --- | --- |
| Identity and schedule | `profiles`, `classes`, `enrollments`, assignments, exams |
| Raw learning input | `captures`, `materials`, `processed_content`, class syllabi |
| Study output and history | flashcards, quizzes, `learning_artifacts`, sessions, attempts |
| Mastery and readiness | concept mastery, readiness scores, strategy outcomes |
| Raw learning signals | `campus_brain_signals`, `topic_signals`, `exam_debriefs` |
| Private integrations | Canvas connections, OAuth state, imported calendar data |

Owner policies are necessary but not sufficient. Launch verification also
checks table grants, foreign-key ownership boundaries, immutable provenance,
private/no-store Edge responses, request correlation, and two-user isolation.

### Raw source objects

`capture-sources` and `syllabus-sources` are private Storage buckets. Browser
uploads are constrained by current agreement, maintenance state, owner/path,
type, size, and quota policies. Capture sources use immutable
`owner/capture/sha256.ext` paths and must match the committed material row.
Browser mutation cannot bypass the fenced service cleanup paths.

---

## 3. Learning signals and aggregates

Raw topic signals and exam debriefs are private owner records. At family-beta
launch, `topic_scores` is backend-only: `anon` and `authenticated` receive no
table privileges. The disabled Class Intelligence route must not be enabled by
granting a raw aggregate table to the browser.

Any later cross-student insight requires a separate privacy review and a
thresholded server-owned RPC or view that cannot expose a user ID, raw text,
notes, payload, small cohort, or reconstructable source. That is post-launch
scope.

---

## 4. Stable and shared course data

Stable course-map truth is service-owned and protected from professor overlays
and ordinary student writes. USU and professor/section data may filter scope;
it cannot overwrite stable accounting relationships.

The legacy catalog tables `schools`, `courses`, and `course_instances` remain
readable reference data. Historical migrations still permit authenticated
catalog insertion for the invite-only prototype path. The family-beta client
must not treat those rows as authoritative course intelligence. Remove that
legacy insertion path or replace it with a reviewed service/admin workflow
before any public/self-serve release.

---

## 5. What must never be exposed

- Raw audio, image bytes, OCR text, transcripts, or assignment text belonging
  to another student.
- Another student's processed content, artifacts, answers, mistakes, mastery,
  readiness, strategy evidence, or Canvas credentials.
- Raw signal payloads, free-form reflections, user IDs, or source identifiers
  in a community result.
- Service-role keys, provider keys, cleanup secrets, OAuth client secrets, or
  agreement audit internals in any browser bundle or response.
- A professor overlay presented as stable truth, or an unconfirmed OCR result
  used as assignment practice/mastery evidence.

---

## 6. Current release status

| Boundary | Source status | Launch evidence still required |
| --- | --- | --- |
| Strict owner RLS | Implemented | Accepted User A, unaccepted User B, anonymous, and service-role staging checks |
| Agreement and maintenance gates | Implemented | Apply in documented order and prove denial/resume behavior |
| Capture and syllabus Storage | Implemented | Legacy provenance/byte preflight, two-user bucket tests, cleanup races |
| Private learning signals | Implemented | Executable grants/RLS test; keep cross-student route disabled |
| Stable course map | Implemented | Confirm professor overlays cannot alter stable rows |
| Auth and signup | Fail-closed in source | Hosted redirects, signup/provider settings, SMTP, and invite rehearsal |
| Edge privacy | Implemented | Deploy and drain the exact reviewed revisions; verify live private responses |
| Public host | Not source-controlled | Canonical origin, CSP, HSTS, Permissions-Policy, SPA fallback, manifest |

Passing source tests does not satisfy these hosted gates. Keep the launch PR
draft and student writes paused until the staging runbook reaches its single
documented resume point.
