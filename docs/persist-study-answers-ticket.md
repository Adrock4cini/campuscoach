# Persist study answers — single-ticket acceptance gate

This branch fixes only the production study-result persistence failure.

## Live failure chain

Student answers → `study_result_attempts` row is created → `apply_study_concept_result_v3` attempts to update `study_result_concept_updates` → the BEFORE UPDATE freeze trigger references a nonexistent `outcome_source` field → the RPC transaction rolls back concept/mastery writes → the attempt is marked failed → the student sees save failure and preparedness remains at zero practice.

## Acceptance

Brand-new student:

1. Build a study set.
2. Answer five mixed correct/incorrect questions.
3. Finish/save.
4. Leave Study Lab and open another section.
5. Return and hard refresh.
6. Practice is still recognized.
7. Preparedness/readiness reflects persisted practice.

Engineering proof must show:

`study_result_attempts` persisted → `study_result_concept_updates` persisted → `user_concept_mastery` updated → preparedness reads the practice.

No unrelated UI, capture, tutor, Match Lab, Make It Stick, teacher-hint, or copy changes belong in this ticket.
