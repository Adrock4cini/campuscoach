# Network Effect Roadmap — future scope, NOT launch scope

Separate from the launch dashboard work. Nothing here is built in this pass beyond
what already exists. Written after inspecting the current architecture only.

## What already exists (reusable, no new build)

- `enrollments` (user ↔ class, role) — the join table a class network would need.
- `courses` / `course_instances` / `schools` — the institution/course graph, already
  keyed by term, year and professor.
- `campus_brain_signals`, `topic_signals`, `topic_scores` — per-user signals with
  `visibility` + `anonymized` columns and threshold-based aggregate scoring
  (`recompute_topic_scores`).
- `InviteClassmatesButton` / `InviteClassmatesModal` + `lib/invite/inviteTracking.ts`
  — an existing, cheap Stage 1 control. **Preserve it; do not remove at launch.**
- `ClassBrainAggregateStrip` — aggregate display component with a minimum-count gate.

Gap for anything beyond Stage 1: classes are currently student-created strings
(`client_class_id`), so reliable school + course matching does not exist yet. That
matching is the true prerequisite for Stage 2+, not UI.

## Moat thesis (preserve)

Private personal coach × class network × institution/course graph × validated
learning-strategy library. More students must improve *coverage and intelligence*,
never vanity metrics. Private academic data stays private by default.

## Stages

**Stage 1 — Launch (already shipped, keep):** invite classmates / share class or
school link. Referral attribution only if existing auth supports it cheaply.
Never display fabricated or estimated classmate counts.

**Stage 2 — Aggregate presence:** "Others are building this class." Requires
reliable school + course matching (canonical `courses`/`course_instances` binding)
and a minimum-count threshold. Identities opt-in only.

**Stage 3 — Class Q&A:** course-scoped forum with moderation, reporting and
per-course identity/privacy controls. No automatic exposure of notes, grades or
recordings.

**Stage 4 — Coverage signals:** "Today's lecture has coverage" / "Someone
contributed class material" without exposing who or what. Students can ask
"Is today's lecture covered?" and explicitly opt into sharing a transcript or
material. No covert sharing, ever.

**Stage 5 — Scholarship / referral rewards:** invites may earn entries or
eligibility only under transparent, non-gambling, legally reviewed, anti-abuse
rules, with fair scholarship selection. Sponsors may fund scholarships. Private
academic data is never sold.

**Stage 6 — Anonymized learning intelligence:** recurring professor/class topic
emphasis, common confusions, technique effectiveness — under privacy thresholds,
with no cross-student content leakage.

## Non-negotiables across all stages

- Private by default; sharing is explicit, per-item and revocable.
- Every aggregate needs a minimum-count threshold and anonymization.
- No fake or inflated social counts.
- Existing academic-integrity rule stands: no verbatim exam content sharing.
