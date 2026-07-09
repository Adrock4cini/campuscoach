
# Campus Companion — Intelligence Pipeline

Goal: every capture, session, assignment, and exam permanently improves per-student memory + recommendations. Nothing is lost on logout.

Legend for **Status**: 🟢 Real (Supabase-backed, survives logout) · 🟡 Mock (local/simulated) · 🔴 Missing.

---

## Stage 1 — Account + Class Setup

| Field | Value |
|---|---|
| INPUT | Signup form; class rows (name, code, professor, schedule) |
| OUTPUT | `auth.users` row, `profiles` row, `classes` rows scoped to `auth.uid()` |
| Tables | `auth.users`, `profiles`, `classes` |
| Functions | `owns_row()`; RLS on `classes` |
| Hooks | `useAuth`, `useMyClasses` |
| Components | `Signup`, `Onboarding`, `MyClasses` |
| Edge fns | — |
| AI prompt | — |
| Failure cases | duplicate class code; unauthenticated insert |
| **Status** | 🟢 Real |

---

## Stage 2 — Syllabus Upload → Structured Classes/Exams/Assignments

| Field | Value |
|---|---|
| INPUT | PDF/image via `SyllabusImport` |
| OUTPUT | Parsed JSON: classes, examDates, assignments |
| Tables | Should insert into `classes`, `exams`, `assignments` |
| Edge fns | `parse-syllabus` (Gemini 2.5 flash, JSON mode) |
| Hooks | `parseSyllabus.ts` |
| Failure cases | non-PDF/image mime; hallucinated dates; user not authed |
| **Status** | 🟡 Parser is 🟢 real; **persistence of parsed exams/assignments back to Supabase is 🔴 missing** — output currently only hydrates local onboarding store |

---

## Stage 3 — Capture (lecture / board / textbook / file / note / hint / ask)

| Field | Value |
|---|---|
| INPUT | audio blob, image, file, or text + `{classId, topic}` |
| OUTPUT | `captures` row + `processed_content` (concepts, summary) + optional `materials` row |
| Tables | `captures`, `materials`, `processed_content` |
| Functions | `commitCapture()` in `src/lib/capture/processor.ts` |
| Hooks | `CaptureContext`, `useCapture` |
| Components | `CaptureButton`, `CaptureFlow`, `ClassMemory` |
| Edge fns | 🔴 none — no STT, no OCR, no LLM concept extraction |
| AI prompt | 🔴 missing — needs "Extract key concepts, definitions, examples, professor-emphasis flags" prompt |
| Failure cases | file too large; STT/OCR failure; class not owned by user |
| **Status** | 🟡 Row persistence 🟢; **concept extraction is simulated** (`simulateConcepts`, `simulateSummary`); no upload to storage; flashcard/quiz counts are fake |

---

## Stage 4 — Concept Store / Class Memory

| Field | Value |
|---|---|
| INPUT | extracted concepts from Stage 3 |
| OUTPUT | topic rows keyed by `(class_id, topic_key)` with embeddings for retrieval |
| Tables | `topic_signals` (🟢 exists), `topic_scores` (🟢 exists, recomputed by `recompute_topic_scores`), **🔴 no `concepts` table with embeddings**, **🔴 no per-user concept mastery table** |
| Functions | `contributeStudySignal()`, `recompute_topic_scores()` |
| Hooks | `useClassIntelligence` |
| Edge fns | 🔴 no embedding writer |
| AI prompt | 🔴 embedding call missing |
| **Status** | 🟡 Aggregate signals are 🟢 real; **per-student concept memory with embeddings for RAG is 🔴 missing** |

---

## Stage 5 — Readiness / Momentum / Exam Prediction

| Field | Value |
|---|---|
| INPUT | study_sessions, captures, topic_scores, exam dates |
| OUTPUT | readiness % per class, momentum trend, per-exam predicted score |
| Tables | `readiness_scores` (🟢 exists but not written), `study_sessions` (🟢), `exams` (🟢) |
| Functions | `readinessEngine.ts`, `learningEngine.ts`, `todayPlanEngine.ts` |
| Hooks | `useLearningState` |
| **Status** | 🟡 Engines run **entirely off `@/data/demo`** classes for signed-in users too (see `todayPlanEngine`, `learningEngine`). They do not read `assignments`, `exams`, `captures`, or `topic_scores` from Supabase. **`readiness_scores` is never populated.** |

---

## Stage 6 — Study Artifact Generation (flashcards / quiz / study guide)

| Field | Value |
|---|---|
| INPUT | capture concepts + class topic scores |
| OUTPUT | `flashcards`, `quizzes` rows |
| Tables | `flashcards` (🟢 schema), `quizzes` (🟢 schema) |
| Edge fns | 🔴 no `generate-flashcards`, no `generate-quiz`, no `generate-study-guide` |
| AI prompt | 🔴 missing |
| **Status** | 🔴 Missing — `flashcardCount: 6` in `processor.ts` is a literal constant. |

---

## Stage 7 — Study Session → Results → Readiness Update

| Field | Value |
|---|---|
| INPUT | user answers per card/question |
| OUTPUT | `study_sessions` row, per-topic accuracy update in `topic_signals`, readiness delta |
| Tables | `study_sessions`, `topic_signals`, `readiness_scores` |
| Hooks | `useStudySession` |
| **Status** | 🟡 `useStudySession` runs locally on demo data. `study_sessions` insert exists in `readinessEngine.ts` but is not wired to real sessions. **No writeback to `topic_signals` with accuracy from real sessions.** |

---

## Stage 8 — Dashboard Recommendations (feedback loop)

| Field | Value |
|---|---|
| INPUT | topic_scores + readiness + upcoming exams/assignments |
| OUTPUT | Today's Plan, ClassCards, BrainOneLiner |
| Components | `TodaysPlan`, `RealTodaysPlan`, `DoThisNowHero` |
| **Status** | 🟡 `RealTodaysPlan` reads real assignments/exams (🟢). `TodaysPlan` + engine layer still on demo. Recommendations do not change based on real study performance. |

---

## Stage 9 — Persistence Across Logout

| **Status** | 🟡 `captures`, `classes`, `assignments`, `exams`, `topic_signals` survive. **Concepts, per-user mastery, real study results, readiness — do not (never written or written from demo).** |

---

## Missing pieces, ranked by impact

1. **🔴 Real AI concept extraction from captures** (`extract-concepts` edge fn + prompt + write to `processed_content` + new `concepts` table with pgvector embeddings). Without this, nothing downstream is real.
2. **🔴 Per-user concept mastery table** (`user_concept_mastery`: user_id, class_id, concept_id, strength 0–1, last_seen, next_review). This is the memory system.
3. **🔴 Real readiness writer** — replace demo reads in `readinessEngine`/`learningEngine` with Supabase queries over `assignments`, `exams`, `study_sessions`, `user_concept_mastery`; upsert `readiness_scores`.
4. **🔴 `generate-flashcards` + `generate-quiz` edge fns** driven by top-weakness concepts, persisting to `flashcards` / `quizzes`.
5. **🔴 Real StudySession wiring** — `useStudySession` reads generated flashcards/quizzes, writes `study_sessions` row + per-concept accuracy back into `user_concept_mastery` and `topic_signals`.
6. **🔴 Syllabus → exams/assignments persistence** — after `parse-syllabus`, insert rows for the authed user.
7. **🔴 Storage uploads for audio/image** + STT (`transcribe` edge fn using Gemini audio) / OCR (Gemini vision) feeding Stage 3's raw_text.
8. **🔴 Real Today's Plan / Dashboard** — swap `TodaysPlan` to consume real engine output; hide legacy demo variant for signed-in users.
9. **🟡 → 🟢 Momentum + exam prediction** derived from `user_concept_mastery` history (cheap once #2 exists).
10. **Nice-to-have:** RAG "Ask Campus Brain" using concept embeddings.

---

## Proposed build order (each shippable in isolation)

- **Sprint A — Memory foundation:** migration for `concepts` (vector 1536) + `user_concept_mastery`; edge fn `extract-concepts` (Gemini 2.5 flash JSON) + embeddings via `openai/text-embedding-3-small`; wire `commitCapture` to call it and persist. Replaces `simulateConcepts`.
- **Sprint B — Study artifacts:** `generate-flashcards`, `generate-quiz` edge fns; persist to existing tables; StudyLab reads real rows.
- **Sprint C — Feedback loop:** `useStudySession` writes results → `user_concept_mastery` deltas → recompute readiness → `readiness_scores` upsert.
- **Sprint D — Dashboard truth:** real `TodaysPlanEngine` reading Supabase; retire demo path for authed users.
- **Sprint E — Ingest polish:** storage upload + STT/OCR edge fns; syllabus persistence.

---

## Confirm before I build

1. OK to add two new tables: `concepts` (with `vector(1536)` + pgvector) and `user_concept_mastery`?
2. OK to use `google/gemini-2.5-flash` for extraction + `openai/text-embedding-3-small` for embeddings via Lovable AI Gateway (no user keys needed)?
3. Start with **Sprint A** this turn, then continue sequentially — or a different order?
