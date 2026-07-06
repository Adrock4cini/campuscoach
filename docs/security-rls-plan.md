# Campus Coach — RLS & Privacy Plan

Campus Coach stores sensitive student data: raw notes, lecture recordings,
textbook scans, study history, class activity, and personal readiness. This
document is the source of truth for what is private, what is shareable as
aggregate community intelligence, and what must ship before public beta.

---

## 1. Data classification

### 🔒 Private — owner only, never exposed to other students
These tables hold raw, personally identifying, or reconstructable student work.
Access is strictly `auth.uid() = user_id`.

| Table                | Why private                                                  |
| -------------------- | ------------------------------------------------------------ |
| `profiles`           | Name, school, personal settings                              |
| `classes`            | The student's personal schedule                              |
| `enrollments`        | Which classes a student is in                                |
| `captures`           | Raw recordings, scans, notes, professor hints                |
| `materials`          | Uploaded files, textbook pages, board photos                 |
| `processed_content`  | AI summaries derived from the student's raw captures         |
| `flashcards`         | Personal study artifacts derived from captures               |
| `quizzes`            | Personal quiz results, answers, mistakes                     |
| `study_sessions`     | Personal study history, timing, quality                      |
| `readiness_scores`   | Personal readiness / momentum time series                    |

**Rule:** never expose these to another user, ever — not even anonymized.
Aggregate insights must be derived from the *signals* tables below, not from
these raw tables.

### 📊 Aggregate — anonymous community intelligence
These tables intentionally power "students with the same professor are
struggling with X" style insights. Rows always carry a `user_id` for audit and
owner-side edits, but **only aggregate views are exposed to other students**.

| Table                  | Aggregate use                                          |
| ---------------------- | ------------------------------------------------------ |
| `campus_brain_signals` | Signal stream feeding the intelligence engine          |
| `topic_signals`        | Per-topic study effort, confidence, miss-rate          |
| `exam_debriefs`        | Post-exam recall of topics that appeared               |
| `topic_scores`         | **Materialized aggregate only** — no user_id, safe read |

Raw rows in `campus_brain_signals`, `topic_signals`, and `exam_debriefs` are
readable only by the owner. Other students see aggregates through:

- `public.topic_scores` (already user-free)
- `public.campus_brain_aggregate` view (no user_id, no raw payload)

### 🌐 Shared reference — safe for everyone
| Table              | Notes                                                    |
| ------------------ | -------------------------------------------------------- |
| `schools`          | Directory data                                           |
| `courses`          | Course catalog                                           |
| `course_instances` | Per-term offerings + professor name                      |

These are read-only for `anon`/`authenticated` and writable only through
admin/service paths (today: permissive INSERT for MVP seeding, tightened
before beta).

---

## 2. Helper columns

All private/aggregate rows now carry:

- `user_id uuid` — owner
- `visibility text` — `private` | `aggregate` | `shared`
- `anonymized boolean` — whether the row is safe to expose in aggregate views
- `source_user_id uuid` (aggregate tables only) — kept private, never selected
  by aggregate views; enables owner edits and abuse audits.

`visibility` defaults to `private` everywhere except signal tables, where the
owner can opt a row into `aggregate` (default true for the signal tables since
they exist precisely for community intelligence).

---

## 3. Policy modes

### Demo mode (today)
Auth is not yet required by the app. RLS policies allow access when either:

- `auth.uid() = user_id` (real user), **or**
- `auth.uid() IS NULL` (anonymous prototype traffic)

This is expressed by `public.owns_row(user_id)`. The demo keeps working; the
moment a real session exists, the anonymous branch stops matching that user's
rows and ownership is enforced.

### Production mode (before public beta)
Flip demo mode off by dropping the `auth.uid() IS NULL` branch from
`public.owns_row`. No other policy changes are required — every private table
already routes through the helper.

Additional beta hardening required:

1. Require authenticated sign-in in the app (no anonymous writes).
2. Remove permissive INSERT policies on `schools`, `courses`,
   `course_instances` — restrict to service role / admin.
3. Add `authenticated`-only GRANTs (drop `anon` where present) once the app
   fully requires sign-in.
4. Add rate limiting on `captures` / `campus_brain_signals` inserts.
5. Move raw recordings and scans into Storage buckets with owner-only policies
   (currently URLs live in `materials.storage_path`).
6. Add a nightly job that verifies no aggregate view leaks `user_id`,
   `raw_text`, or `payload`.

---

## 4. What must never be exposed

- Raw audio / video / OCR text from `captures` or `materials`
- Contents of `processed_content` for another user
- Any row in `flashcards`, `quizzes`, `study_sessions`, `readiness_scores`
  belonging to another user
- `campus_brain_signals.payload` or `.user_id` in any public view
- `topic_signals.user_id`, `.notes`, or freeform text in any public view
- `exam_debriefs.user_id` or freeform reflection text

Aggregate views must select only counts, averages, probabilities, and topic
names. Any new aggregate view must go through code review with this doc open.

---

## 5. Current status

| Area                                 | Status                     |
| ------------------------------------ | -------------------------- |
| Private-owned RLS (owner-only)       | ✅ enforced via `owns_row`  |
| Demo compatibility                   | ✅ `auth.uid() IS NULL` allowed |
| Aggregate views (no PII)             | ✅ `topic_scores`, `campus_brain_aggregate` |
| Anonymous writes on reference tables | ⚠️ MVP-only, tighten before beta |
| Storage buckets for raw media        | ⏳ not yet created          |
| Authenticated sign-in required       | ⏳ not yet enforced         |

When all ⏳/⚠️ items are resolved and `owns_row` is switched to strict mode,
Campus Coach is ready for public beta from a data-privacy standpoint.
