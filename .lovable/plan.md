# Push #3A — Learning-Spine Preflight (read-only audit result)

No code, migrations, deploys, config, or data were changed. Everything below is evidence from the current repo plus live schema/ledger reads.

## 1. What the deployed `record-study-result` requires (normal MC / flashcard / matching path)

Tables/columns on `public.study_result_attempts` (its `ATTEMPT_SELECT`):
`artifact_id, challenge_fingerprint, client_request_hash, verified_grading_snapshot, result_status, result_payload, result_request_hash, lease_token, lease_started_at, duration_seconds, session_id, completed_at, evidence_contract_version, evidence_tier, target_task_kind, readiness_projection, study_run_id, study_run_segment, study_run_final, study_run_correct, study_run_total, study_run_concept_ids`

Plus: `public.study_runs` (parent run ledger), `study_sessions.study_run_id`, `study_result_concept_updates` evidence columns, `study_strategy_outcomes.evidence_tier`, contract triggers, and RPCs
`reserve_practice_study_attempt_v2`, `apply_study_concept_result_v3`, `project_study_readiness_v1`, `get_study_write_pause`.

The sibling function `generate-artifact` (already deployed) also requires RPCs `ensure_acct_2010_map_concepts` and `insert_confirmed_assignment_review_artifact`.

## 2. Absent LIVE right now (verified)

- `study_result_attempts` columns: `challenge_fingerprint`, `client_request_hash`, `verified_grading_snapshot`, `evidence_contract_version`, `evidence_tier`, `target_task_kind`, `readiness_projection`, all `study_run_*`
- Table `public.study_runs`; table `public.practice_challenge_consumptions`
- `study_strategy_outcomes.evidence_tier` (column list confirmed without it)
- RPCs: `reserve_practice_study_attempt`, `reserve_practice_study_attempt_v2`, `apply_study_concept_result_v3`, `project_study_readiness_v1`, `get_learning_evidence_contract_status`, `ensure_acct_2010_map_concepts`, `insert_confirmed_assignment_review_artifact`
- All contract-v2 triggers (`study_result_attempts_freeze_evidence_contract_v2`, `..._require_current_contract_v2`, `study_runs_*`, etc.)

Present LIVE and healthy: `study_result_attempts` (base shape), `study_result_concept_updates`, `study_sessions`, `learning_artifacts`, `user_concept_mastery`, `readiness_scores`, `concept_capture_evidence`, `captures.practice_source_*`, RPCs `apply_study_concept_result`, `apply_study_concept_result_v2`, `confirm_assignment_practice_source`, `insert_confirmed_assignment_practice_artifact`, `get_study_write_pause`, `consume_ai_request_quota`.

This is the true P0: **both** `record-study-result` and `generate-artifact` are newer than the database — which explains "couldn't build this set yet" *and* "your answers are still here, try saving again".

## 3–4. First canonical creator, and dependency graph

| Missing object | First canonical migration |
|---|---|
| `challenge_fingerprint`, `client_request_hash`, `verified_grading_snapshot`, `practice_challenge_consumptions`, `reserve_practice_study_attempt` | `20260827120000_assignment_tutor_mastery_guard.sql` |
| `ensure_acct_2010_map_concepts` | `20260827124000_course_map_stable_guard.sql` |
| `insert_confirmed_assignment_review_artifact` | `20260827125000_assignment_review_artifact_guard.sql` |
| `evidence_contract_version/_tier`, `target_task_kind`, `study_runs`, `study_run_*`, contract triggers, `reserve_practice_study_attempt_v2`, `apply_study_concept_result_v3` | `20260828100000_learning_evidence_ladder.sql` |
| `readiness_projection`, `project_study_readiness_v1`, `require_*_v2` triggers, `get_learning_evidence_contract_status` | `20260828110000_full_scope_readiness.sql` |

Dependency edges: the ladder replaces/extends `reserve_practice_study_attempt` and the fingerprint columns from `120000`, so `120000` must run first. `110000` replaces triggers and RPCs defined in `100000`, so it runs last. Every other object the three files reference (`captures`, `concepts`, `concept_capture_evidence`, `learning_artifacts`, `study_strategy_outcomes`, `exams`, `classes`, `assignments`, `apply_study_concept_result_v2`) already exists LIVE — so no further prerequisite migration is needed for them.

## 5. Smallest ordered sequence (proved: it is five, not three)

`20260827120000` → `20260827124000` → `20260827125000` → `20260828100000` → `20260828110000`

The two middle files are required not by the study-result path itself but by the already-deployed `generate-artifact`; without them the student can never reach a study set to save, so the spine is not internally consistent without them.

## 6–7. Data effects, and the one STOP flag

| ORDER | MIGRATION | WHY REQUIRED | PREREQS PRESENT? | LIVE OBJECTS ALREADY PRESENT? | DATA EFFECT | RISK | APPLY? |
|---|---|---|---|---|---|---|---|
| 1 | `20260827120000_assignment_tutor_mastery_guard` | attempt fingerprint columns + practice reservation | Yes | No | Schema-only, additive (`add column if not exists`, `create table if not exists`) | Low | Yes |
| 2 | `20260827124000_course_map_stable_guard` | `ensure_acct_2010_map_concepts` for artifact generation | Yes | No | Function/trigger only | Low | Yes |
| 3 | `20260827125000_assignment_review_artifact_guard` | `insert_confirmed_assignment_review_artifact` | Yes | No | Function only | Low | Yes |
| 4 | `20260828100000_learning_evidence_ladder` | contract-v2 columns, `study_runs`, v2/v3 RPCs, triggers | Needs #1 | No | Additive schema + triggers; **no backfill** (legacy rows stay NULL-contract); its only deletes are inside a cascade trigger for future runs | Medium | Yes |
| 5 | `20260828110000_full_scope_readiness` | `readiness_projection`, `project_study_readiness_v1`, closes NULL window | Needs #4 | No | **Data-changing**: marks all non-`v11-evidence-ladder` artifacts stale (69 of 85 rows) and resets `user_concept_mastery` rows **where `attempts = 0`** (120 rows, 112 of which currently carry seeded strength > 0) | **High visibility** | Yes, only with explicit owner acknowledgement |

Demonstrated learning vs seeded state: 138 mastery rows total — **18 have `attempts > 0` (demonstrated) and are untouched**; 120 have `attempts = 0` (capture-seeded, never practiced) and are zeroed. No migration deletes captures, concepts, sessions, attempts, classes, or demonstrated mastery.

STOP flag: step 5 is not destructive to real student work by the readiness-integrity rule, but it *will* visibly drop class/exam readiness for material that was only captured, and it forces regeneration of 69 existing study sets. Safest alternative if the owner does not accept that tonight: apply steps 1–4 only, leave the NULL-contract compatibility window open, and defer step 5 — but note `record-study-result` calls `project_study_readiness_v1`, so **saving still fails without step 5**. There is no partial-credit path.

## 8–9. Ledger drift vs schema drift

The ledger has 38 versions; the repo has 64 files — but that gap is mostly ledger drift, not missing objects. Content from `20260722120000`, `20260817190000/191000`, `20260827110000`, `20260827126000`, and others is already LIVE under managed timestamps (`20260816220611`, `20260830161041`, `20260830231658`). Objects were therefore verified individually via `pg_proc` / `information_schema.columns` rather than by ledger membership, and only genuinely absent objects are listed above. Every file in the recommended sequence uses `if not exists` / `create or replace` forms, so replay is safe where an object happens to exist.

## 10. Rollback of `record-study-result` instead?

Not viable. The immediately prior version (`209c239`) still selects `challenge_fingerprint`, `client_request_hash`, `verified_grading_snapshot` and calls `reserve_practice_study_attempt` — all from `20260827120000`, which is not live. The last truly live-compatible revision is `43c0752` ("Work in progress"), which predates the family-beta agreement gate, retry-integrity, and grading-integrity hardening. Rolling back that far reintroduces removed guards and still leaves `generate-artifact` broken. **Rollback is neither safer nor complete.**

## 11. Post-migration verification (write pass, later)

- `select public.get_learning_evidence_contract_status();` returns contract 2 / `v11-evidence-ladder` / `legacyWritesClosed`.
- Before/after snapshot: `count(*) filter (where attempts > 0)` on `user_concept_mastery` and the full 18-row set unchanged; `study_sessions`, `captures`, `concepts`, `classes` counts unchanged.
- One authenticated MC session end-to-end: new `study_runs` row, `study_result_attempts` row with `evidence_contract_version = 2`, one `study_sessions` row, matching `study_result_concept_updates`, `completed_at` set.
- Reload the class: result persists; mastery for the practiced concepts moved; readiness reflects practice separately from material coverage.
- Repeat the identical save (idempotency): no duplicate attempt, frozen response returned.
- Repository suite + typecheck green before any deploy.

## 12. Rollback / stop conditions for the write pass

- Study writes must be paused (`get_study_write_pause`) before step 5, and unpaused only after verification.
- Stop immediately if: any migration reports a destructive-schema warning beyond the documented step-5 updates; any `attempts > 0` mastery row changes; any count of captures/concepts/sessions/classes decreases; a migration errors mid-sequence (do not hand-edit the ledger, do not hand-write a subset — re-plan).
- Do not proceed past a failed step; each step is applied and verified one at a time.

## Recommendation

**A — safe to proceed, with a five-file ordered sequence (not three), and only with explicit owner sign-off on step 5's seeded-readiness reset:**
`20260827120000` → `20260827124000` → `20260827125000` → `20260828100000` → `20260828110000`, each applied byte-for-byte through the managed mechanism, one at a time, under the study-write pause, with the verification above between steps. Option B (function rollback) is proven unsafe and incomplete; option C is unnecessary because no step deletes or alters demonstrated student work.
