# Campus Companion — Early Access launch boundary

This is the current build context for Lovable. It replaces the historical
prototype plan; do not infer missing work from older chat history or demo code.

## Product promise

Campus Companion turns a student's real class material into grounded practice,
teaches through the student's error, checks independent transfer, and remembers
the resulting evidence for later review.

The launch cohort is an invite-only, 13+ Family Beta. Public signup remains
closed. Canvas remains disabled unless its dedicated rollout runbook is fully
completed.

## What is real in the launch candidate

- Real accounts, classes, assignments, exams, captures, and persisted study data
- Grounded image capture with storage integrity and idempotent recovery
- Teaching Router v1 and deterministic percent/problem recognition
- Assignment Tutor: hint, walk-through, student attempt, transfer, saved evidence
- ACCT 2010 stable learning map with section/professor scope overlays
- Durable Family Beta agreement receipts and fail-closed write boundaries
- Private learning signals, paid-AI quotas, maintenance pause, and release canaries
- MCP demo tools retired; the deployed MCP route is a private 410 tombstone

## Non-negotiable boundaries

- Never mix demo data into a signed-in student's experience.
- Never treat Auth metadata as an agreement receipt.
- Never bypass the study-write pause, owner RLS, storage ownership, or source
  confirmation gates.
- Never expose raw private learning signals or browser-read `topic_scores`.
- Never enable Canvas, public signup, passkeys, or production writes by default.
- Never ingest or reproduce Phillips, Connect, EXAMIND, OpenStax, Canvas, or
  instructor test-bank prose. Use original teaching copy and student-owned input.
- Never deploy or migrate against a Supabase project ref that has not been
  explicitly verified for the current environment.

## Current release sequence

1. Keep the GitHub launch candidate green: lint, typecheck, unit tests, Edge
   verification, production build, and desktop/Android/iPhone journeys.
2. Sync the exact candidate into a private, unpublished, isolated staging app.
3. Bind staging only to its dedicated Supabase project and reconcile the full
   migration history before applying any forward migration.
4. Hold the study-write pause while deploying guarded Edge functions and running
   Auth, RLS, Storage, agreement, quota, privacy, and rollback canaries.
5. Resume staging once, run the complete capture -> confirm -> Tutor -> transfer
   -> mastery -> reload journey, and verify persistence across devices.
6. Run the unchanged learning benchmark only after the staged deployment is
   confirmed: 14% of 50, hypo vs. hyper, Maryland -> Annapolis, and persistence.
7. Prepare a reviewed production handoff. Do not mutate production early.

## Launch stop conditions

Stop and report instead of improvising if the project ref is ambiguous, the
migration ledger is incomplete, unexpected user/data rows exist, an agreement or
pause check fails open, a private table is browser-readable, required security
headers are missing, a device journey fails, or the release manifest does not
match the deployed SHA and environment.

The dashboard is not awaiting another redesign. Engineering focus is the
grounded teaching loop, durable evidence, secure staging, and repeatable release.
