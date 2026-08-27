# Capture source Storage lockdown

This runbook covers `20260827132000_capture_storage_integrity.sql`, the matching
insert-only web client, `process-capture-images`, and the internal
`cleanup-abandoned-captures` worker. Treat them as one reviewed release unit.
Never print a student UUID, object path, file name, hash, image, OCR text, cleanup
secret, or service key in logs, chat, tickets, or CI output.

## Guarantees and limits

- A capture image lives at `<owner>/<capture>/<sha256>.<ext>` and may belong to
  only that capture. Reusing one physical path across captures is forbidden.
- Storage object `UPDATE` is denied. A dropped successful upload is recovered by
  retrying the deterministic path with `upsert: false`, accepting the unique-path
  conflict, and reconciling an exact material row.
- The material commit checks owner, capture, SHA-256 path, page, size, MIME type,
  and live Storage metadata. `process-capture-images` hashes downloaded bytes
  again before any paid AI request. The immutable capture metadata records an
  expected page count from one through four; the worker requires that exact
  count and the complete request/material ID set before consuming quota.
- Successful study-material processing records a SHA-256 of the ordered source
  manifest with its provider model. Retry recovery requires that exact manifest
  result plus existing concept evidence; legacy capture-only concept links are
  never rebound to a changed page set.
- A cheap per-user source-read quota is consumed before Storage download/base64
  work. The tighter paid-AI quota is consumed only after byte verification and
  durable-retry recovery; the provider has a 60-second timeout.
- A browser may delete only an uncommitted object. Material source fields become
  immutable at insert, and a processed or confirmed source requires an explicit
  service-owned retention/deletion flow.
- New uploads require the durable current family-beta agreement receipt
  (`2026-08-17`). Auth metadata is not accepted as evidence.
  The additive `20260827126500` guard establishes this denial before the full
  capture path/quota/provenance policy arrives in `20260827132000`.
- Quotas are serialized per owner: four objects per capture, twelve unfinished
  objects, 256 total objects, and 512 MB per owner. The bucket retains its 8 MB
  per-object cap; the UI retains its 24 MB per-capture cap.
- Unreferenced objects older than 24 hours are claimed in batches of at most 50.
  A 15-minute fenced lease is rechecked immediately before the Storage API
  deletion. No cleanup SQL deletes from `storage.objects`.

## Staged rollout

1. Confirm `20260827125500_study_write_maintenance_guard.sql`,
   `20260827126000_family_beta_agreement_acceptance.sql`,
   `20260827126500_family_beta_raw_input_guard.sql`,
   `20260827126750_capture_request_idempotency.sql`, and the complete
   Assignment Tutor lockdown through `20260827130000_capture_mutation_lockdown.sql`
   are applied. Confirm the matching web build uses `upsert: false` and exact
   material insert/recovery before tightening Storage policies.
2. Confirm capture/study writes are still paused from the agreement handoff.
   Wait for prior capture workers and browser uploads to drain; do not introduce
   a second pause/resume cycle.
3. Run the legacy preflight query below read-only. If it returns a nonzero count,
   stop. Do not apply the migration until the sources are remediated.
4. Apply `20260827132000_capture_storage_integrity.sql` as its own transaction.
   Verify browser roles cannot execute cleanup RPCs or read the claim ledger.
5. Apply
   `20260827133000_browser_learning_evidence_write_guard.sql` as its own
   transaction. Verify its restrictive policies cover authenticated INSERT on
   all four direct browser signal/evidence tables and authenticated UPDATE on
   `topic_signals`, `exam_debriefs`, and `campus_brain_signals`; verify owner
   DELETE remains available and keep the single existing pause active.
6. Deploy the exact reviewed `process-capture-images` and
   `cleanup-abandoned-captures` functions. The worker accepts only `{}` and has
   no runtime test cutoff capable of making fresh uploads eligible.
7. Run owner, cross-owner, changed-retry, quota, hash-mismatch, cleanup-race, and
   browser-denial checks. Keep writes paused for the launch API handoff.
8. Schedule the authenticated cleanup only after a production no-op invocation
   and alert-delivery check succeed.
9. Return to **Final resume and public canary** in
   `docs/study-intelligence-rollout.md`. Do not resume from this sub-runbook:
   that authoritative step resumes exactly once only after this migration and
   every verification above succeeds. The canary expects HTTP 401 without the
   internal secret and must never run a real cleanup sweep.

## Legacy preflight and remediation

Run this only in the SQL editor while writes are paused. Record the count, not
the returned paths or hashes.

```sql
select count(*) as incompatible_capture_materials
from public.materials material
where (
    exists (
      select 1
      from public.captures capture
      where capture.id = material.capture_id
        and capture.kind in ('scan-assignment', 'scan-material')
    )
    or coalesce(material.storage_path, '') ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$'
  )
  and (
    material.kind is distinct from 'image'
    or material.storage_path is null
    or material.capture_id is null
    or material.content_hash is null
    or material.page_index is null
    or material.size_bytes is null
    or not exists (
      select 1
      from public.captures capture
      where capture.id = material.capture_id
        and capture.user_id = material.user_id
        and capture.kind in ('scan-assignment', 'scan-material')
    )
    or material.storage_path is distinct from concat(
      material.user_id::text, '/', material.capture_id::text, '/',
      material.content_hash,
      case lower(coalesce(material.mime_type, ''))
        when 'image/jpeg' then '.jpg'
        when 'image/png' then '.png'
        when 'image/webp' then '.webp'
        when 'image/heic' then '.heic'
        when 'image/heif' then '.heif'
        else '.invalid'
      end
    )
    or not exists (
      select 1
      from storage.objects object
      where object.bucket_id = 'capture-sources'
        and object.name = material.storage_path
        and coalesce(object.metadata->>'size', '') ~ '^[0-9]+$'
        and (object.metadata->>'size')::bigint = material.size_bytes
        and lower(coalesce(object.metadata->>'mimetype', '')) = lower(material.mime_type)
    )
  );

select count(*) as cross_owner_scan_material_links
from public.materials material
join public.captures capture on capture.id = material.capture_id
where capture.kind in ('scan-assignment', 'scan-material')
  and capture.user_id is distinct from material.user_id;

select count(*) as invalid_expected_capture_page_counts
from public.captures capture
where capture.kind in ('scan-assignment', 'scan-material')
  and exists (
    select 1 from public.materials material where material.capture_id = capture.id
  )
  and coalesce(capture.meta->>'sourceImageCount', '') !~ '^[1-4]$';

select count(*) as noncanonical_capture_objects
from storage.objects object
where object.bucket_id = 'capture-sources'
  and object.name !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{64}\.(jpg|png|webp|heic|heif)$';
```

For any mismatch, keep writes paused. Through an audited service process:

1. Download the existing object through the Storage API and compute its SHA-256.
2. Upload an unchanged copy with `upsert: false` to the exact
   `<owner>/<capture>/<sha256>.<ext>` path. Do not delete the old object yet.
3. In a database transaction, update only that material row to the verified new
   path/hash/size/MIME values. Re-run the preflight.
4. Once no material references the old path, remove it through the Storage API.

Cross-capture legacy deduplication needs one immutable copy per capture before
the old shared path can be removed. Never repair provenance by renaming or
deleting rows in `storage.objects` from SQL.

Storage metadata is not proof of the stored bytes. Before applying the
migration, the audited service process must also download and SHA-256 every
referenced legacy capture object, compare actual length/hash to its material
row, and report aggregate pass/fail counts only. A mismatch follows the same
copy-then-transaction remediation above. The runtime worker repeats this check
on every processing attempt.

## Scheduled cleanup

The capture worker reuses the encrypted internal cleanup secret already bound
by UUID in `syllabus_cleanup_configuration`; it never reads a Vault secret by
name at runtime. Deploy with gateway JWT verification disabled because the
worker authenticates the constant-time `x-cleanup-secret` digest before any
claim. The claim/digest RPCs remain executable only by `service_role`.

Use the same Vault-bound URL and secret lookup pattern documented in
`docs/syllabus-cleanup.md`, but call:

```text
POST /functions/v1/cleanup-abandoned-captures
x-cleanup-secret: <Vault-bound internal cleanup secret>
{}
```

Schedule it hourly at a different minute from syllabus cleanup. A production
no-op returns HTTP 200 with `claimed: 0` and `deleted: 0`. Without the secret,
expect HTTP 401; with a malformed or wrong secret, expect HTTP 403. A claim,
confirmation, Storage removal, or release failure returns a private no-store
HTTP 503 and leaves the fenced lease for retry.

Monitor only sanitized event class, status, request ID, and aggregate deleted
count. Alert on repeated 503s, a growing owner orphan quota, cleanup leases that
repeatedly expire, or unexpected nonzero cleanup volume. Never log paths.

## Acceptance checks

- A first upload succeeds and creates one exact material.
- Replaying the same attempt/path returns the same material without an object
  update, duplicate material, or paid AI duplication.
- Replaying the capture/page with changed bytes is rejected and preserves the
  first material and object.
- A fifth object under one capture and a thirteenth unfinished owner object are
  denied even under concurrent requests.
- A user without the current durable agreement receipt cannot upload directly
  to Storage.
- User A cannot list, sign, insert, update, or delete User B's source.
- No authenticated browser can update any capture object, delete a referenced
  object, mutate committed material source fields, add/remove a page after any
  derivation exists, delete a capture with a live worker claim, read cleanup
  claims, or call cleanup RPCs.
- A byte/hash mismatch returns HTTP 409 after the cheap source-read permit but
  before paid-AI quota or provider access, and never creates OCR, concepts,
  mastery, or Tutor evidence.
- A 24-hour orphan committed concurrently with a cleanup claim has exactly one
  outcome: the material commit wins and the object remains, or cleanup wins and
  the commit fails for a fresh retry.
- Cleanup releases and reports a batch only when the Storage API returns the
  exact confirmed path set; partial or malformed success responses keep the
  fenced claims for retry.

## Rollback

Stop the web rollout and pause writes. Keep immutable objects, material rows,
and claims intact. Do not restore browser Storage `UPDATE`, do not restore
`upsert: true`, and do not re-enable the retired SQL deletion trigger. A forward
fix may temporarily stop new uploads while reads and service-owned deletion
remain available; source bytes and provenance are never rewritten as rollback.
