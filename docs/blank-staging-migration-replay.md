# Phased staging migration replay

This is the operator handoff for applying the canonical GitHub migrations to a
newly provisioned, private, disposable Supabase staging project. It does not
publish the web app, deploy Edge Functions, change the write-pause state, or
run product canaries. Lovable's saved project is not a canonical package,
migration, or Edge source because it normalized and altered reviewed files.

The 63 migrations must not be pushed together. The live-safe rollout contains
operator and Edge handoffs between database versions, and staging must exercise
those same boundaries.

## Global stop conditions

Stop unless all of these are true before every phase:

- the target is private, unpublished, disposable staging and is not a protected
  or quarantined ref below;
- the exact GitHub candidate is committed, its required CI is green, and the
  local checkout is that full SHA with no tracked or untracked changes;
- exactly 63 tracked canonical migrations end at `20260828110000`;
- one exact stable Supabase CLI version has been reviewed for `link`,
  `migration list`, and `db push`, recorded privately, installed, and
  authenticated for only this staging target;
- no invitation, production release, Lovable migration task, or other schema
  writer is active; and
- the operator has completed the preceding transition gate in the table below.

The runner permanently rejects:

- `norsaaoyppctrvxxgjtg` — production;
- `dfpgnmldxphkfmobjbvr` — previous Family Beta;
- `lzwaiobgrhwmywugsgjo` — abandoned/remixed staging; and
- `mviunlhhtcjuuburjxbf` — quarantined after Lovable altered a migration.

No writable project ref or CLI version is hard-coded in source.

## First-phase blank-target proof

The first phase alone requires an independent hosted read-only check. Retain
the result in the private operator record, not source control or chat:

```sql
select
  (select count(*) from auth.users) as auth_user_count,
  (select count(*) from pg_catalog.pg_tables where schemaname = 'public')
    as public_table_count,
  to_regclass('supabase_migrations.schema_migrations') as migration_ledger;
```

If `migration_ledger` is non-null, separately select its versions and require
zero rows. Require zero Auth users and zero public tables too. An empty ledger
does not prove an empty schema. Any unexpected object, row, ref, or uncertainty
is a stop condition.

Run only the first allowed transition:

```sh
npm run migrate:staging:phase -- \
  --project-ref <new-private-staging-ref> \
  --expected-project-ref <same-project-ref> \
  --candidate-sha <full-40-character-reviewed-sha> \
  --expected-current-version none \
  --through-version 20260827125500 \
  --blank-preflight-attestation <same-project-ref>:zero-auth-users:zero-public-tables:zero-ledger-rows \
  --approved-cli-version <reviewed-x.y.z> \
  --apply
```

## Allowed transitions and mandatory gates

Each later invocation must name exactly one row's current version, through
version, and gate token. The runner rejects missing, combined, reordered, or
skipped transitions.

| Expected current | Through | Work completed before applying | Exact gate token |
|---|---|---|---|
| `none` | `20260827125500` | Independent zero-user/table/ledger proof | Blank attestation argument |
| `20260827125500` | `20260827126000` | Set/verify pause; deploy, test, and drain six guarded Edge revisions | `writes-paused-edge-deployed-tested-drained` |
| `20260827126000` | `20260827126500` | Verify agreement receipt schema, helpers, ownership, and grants while paused | `writes-paused-agreement-migration-verified` |
| `20260827126500` | `20260827126750` | Verify raw-input table and Storage denials plus service recovery | `writes-paused-raw-input-guard-verified` |
| `20260827126750` | `20260827127500` | Run accepted/unaccepted agreement UI, direct-write, and owner canaries | `writes-paused-agreement-ui-canaries-passed` |
| `20260827127500` | `20260827130000` | Commit mirror retirement and verify old invocations are drained | `writes-paused-mirror-retirement-verified` |
| `20260827130000` | `20260827132000` | Verify capture mutation lockdown and retry contracts | `writes-paused-capture-lockdown-verified` |
| `20260827132000` | `20260827133000` | Verify Storage path/hash/quota and cleanup fencing | `writes-paused-storage-integrity-verified` |
| `20260827133000` | `20260827134000` | Verify evidence/signal agreement, pause, owner, delete, and service boundaries | `writes-paused-learning-evidence-guard-verified` |
| `20260827134000` | `20260827135000` | Run two-user class identity and owner-scope canaries | `writes-paused-class-owner-scope-verified` |
| `20260827135000` | `20260827140000` | Verify the launch-schema regression guard and expected inventory | `writes-paused-launch-schema-regression-verified` |
| `20260827140000` | `20260828100000` | Verify onboarding ownership/security hardening before installing the nullable evidence contract | `writes-paused-onboarding-owner-guard-verified` |
| `20260828100000` | `20260828110000` | Deploy the evidence-aware Edge functions; verify their exact revision plus the database contract directly while HTTP study writes remain paused | `writes-paused-evidence-contract-edge-deployed-verified` |

Use this shape for one later transition:

```sh
npm run migrate:staging:phase -- \
  --project-ref <new-private-staging-ref> \
  --expected-project-ref <same-project-ref> \
  --candidate-sha <full-40-character-reviewed-sha> \
  --expected-current-version <current-version-from-one-table-row> \
  --through-version <through-version-from-the-same-row> \
  --phase-gate-attestation <exact-token-from-the-same-row> \
  --approved-cli-version <same-reviewed-x.y.z> \
  --apply
```

### Required work between transitions

After `20260827125500`, set and verify the service-only study-write pause. While
paused, deploy the six guarded Edge revisions from the exact green GitHub
archive, prove their documented fail-closed responses, and wait for old
revisions to drain. Only then attest
`writes-paused-edge-deployed-tested-drained` and apply `20260827126000`.

Verify `20260827126000` before applying `20260827126500`, then verify the raw
input guard before applying `20260827126750`. After `20260827126750`, publish
only the maintenance-restricted agreement-compatible UI stage and complete the
accepted/unaccepted agreement, direct-write-denial, and owner canaries. Only
then attest `writes-paused-agreement-ui-canaries-passed`.

Apply every remaining migration separately while the write pause stays active.
Complete the named verification represented by each exact gate token before
moving to the next table row. Follow `docs/study-intelligence-rollout.md` for
the full checks; the short tokens are explicit operator attestations, not proof.
Do not resume writes from this runner.

The write pause deliberately makes a successful `record-study-result` HTTP
call impossible. Between `20260828100000` and `20260828110000`, verify the
deployed function revision/bundle and exercise the trigger/RPC evidence
contract with rollback-only operator fixtures. Do not claim an end-to-end HTTP
result test at this gate. The accepted-owner HTTP evidence journey runs only
after the final migration closes legacy inserts and the single controlled
resume occurs; any failure immediately restores the pause.

After `20260828110000`, verify the agreement/owner guards, evidence contract,
and full-scope readiness repair. Then separately deploy and test any remaining
reviewed Edge revisions and run
the full paused hosted canaries described in the authoritative rollout. Resume
writes exactly once only after every database, Storage, Edge, UI, owner-isolation,
observability, and cleanup gate passes.

## What the runner proves

Before touching the CLI, it validates the complete clean 63-file candidate. For
one allowed transition it creates an OS-generated temporary directory, copies
only the canonical migration prefix through that phase byte-for-byte, and uses
that temporary Supabase workdir for this exact sequence:

1. `supabase link --project-ref ...` and exact linked-ref verification;
2. `supabase migration list --linked`, requiring the remote ledger to equal the
   exact expected-current prefix, with only this phase's migrations pending;
3. `supabase db push --linked --include-all --dry-run --yes`, requiring exactly
   the allowed pending subset and no other version;
4. `supabase db push --linked --include-all --yes`; and
5. `supabase migration list --linked`, requiring exact alignment through the
   phase's through-version.

It then removes only the explicit OS-created temporary workdir. The canonical
repository and all 63 migration files remain unchanged. There is no assumed
Supabase target-version flag, no ledger SQL, no `migration repair`, and no Edge
Function deployment in this script.

The dry-run parser requires the one reviewed `DRY RUN: migrations will *not* be
pushed to the database.` heading, the reviewed migration-plan heading, and one
`• <full-migration-filename>.sql` row per pending file. Bare version tokens,
changed headings, renamed rows, warnings, skipped-migration messages, duplicate
rows, and migration tokens anywhere outside those filename rows fail closed.

If the initial ledger is not the exact prior prefix, or the CLI cannot render
the expected pending rows, stop. Never create, seed, delete, or edit ledger rows
to make a phase pass.

Any push or final-verification failure quarantines the entire target because a
prefix may already have committed. Preserve private output, close writers,
discard the target, and provision and independently prove a newly blank project.
Never retry or repair the failed target.

That quarantine is currently enforced by this runbook and the operator, not by
a durable cross-process registry. The runner always emits the quarantine result
after a push attempt—even if temporary-workdir cleanup also fails—but it cannot
remember a newly failed ref after the process exits. Immediately record the ref
in the private operator quarantine register and add it to the source-protected
ref list in the next reviewed commit. Until an external registry is integrated,
never treat a later process accepting an unlisted ref as permission to reuse it.
