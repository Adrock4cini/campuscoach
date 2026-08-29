# Staging Actions checkout handoff

The staging migration workflow must preserve the reviewed candidate's byte-clean checkout while preventing GitHub Actions checkout authentication metadata from tripping the hardened replay runner's repository-cleanliness guard.

Required contract:

- check out the exact operator-supplied candidate SHA;
- do not persist checkout credentials into the candidate repository;
- verify `git rev-parse HEAD` equals the supplied SHA;
- verify the worktree/index is clean;
- preserve the replay runner's own clean-tree, migration-byte, protected-target, phase-transition, and attestation checks;
- never weaken or bypass the replay runner.

This document records the Actions-specific handoff invariant discovered by the first live blank-staging rehearsal.
