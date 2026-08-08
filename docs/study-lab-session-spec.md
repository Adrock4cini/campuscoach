# Campus Companion — Evidence-Backed Study Lab Specification

**Status:** Proposed product contract; not fully implemented
**Last updated:** August 8, 2026
**Depends on:** Phase 0 learning-truth cutover in
[`campus-coach-source-of-truth.md`](campus-coach-source-of-truth.md)

## 1. Purpose

Study Lab turns trustworthy class evidence into short, adaptive practice that
helps a student retrieve and apply the right material on the assessment date.
It is not a note reader, a generic quiz generator, or proof that a student will
pass.

The product loop is:

> **Capture once → identify what matters → retrieve repeatedly → space to the
> assessment → mix when useful → correct errors → re-rank the next action**

Lecture Intelligence chooses evidence-backed material. Study Lab teaches and
tests it. Only the student's own retrieval results update that student's
mastery.

### Two-ledger rule

Campus Companion keeps two truths separate:

| Ledger | What it may change | What it may never change |
| --- | --- | --- |
| Lecture/assessment evidence | Concept importance, assessment relevance, verification priority, and the next recommended activity | A student's mastery |
| Private retrieval evidence | The student's mastery, confidence calibration, misconception priority, and next review | The professor's meaning or another student's mastery |

A newly captured concept begins **unassessed**, not partially mastered. A
shared transcript may make a concept more important for every verified
classmate, but every student remains unassessed until personally tested.

## 2. Evidence boundary

### Strong default rules

These are supported broadly enough to be product defaults:

1. **For introduced material, require retrieval before revealing an answer.**
   Practice testing improves delayed retention compared with equivalent restudy
   in many settings. A student who has not yet learned the procedure needs
   instruction or a worked example before an unaided mastery check.
2. **Revisit material over time.** Review timing should use the assessment date
   and observed retrieval history rather than encourage one-session cramming.
3. **Give corrective feedback.** An error should lead to source-grounded
   correction and another later opportunity to retrieve the correction.
4. **Keep assessment scope and provenance.** Every scored item must remain
   attributable to the exact class, assessment target, concept, and source.
5. **Measure learning with later retrieval.** Reading time, capture count,
   answer reveals, and self-reported familiarity are not secure mastery.

### Context-dependent rules

Use these when the material and assessment support them; do not force them into
every class:

- **Interleaving:** useful when students must distinguish between related
  categories, formulas, or problem types. Evidence varies by material; it is
  not a universal replacement for blocked initial instruction.
- **Short answer versus multiple choice:** match the target skill and maintain
  achievable retrieval. Short answer is not automatically superior when it
  produces mostly failed retrieval; MCQ can still support learning when
  distractors are grounded and feedback is provided.
- **Self-explanation and elaboration:** use after an attempt, especially for
  conceptual relationships, worked examples, and transfer. Do not replace
  retrieval with an unscored feeling of explanation quality.
- **Concrete examples and simple diagrams:** use to repair understanding, then
  return to a new retrieval or application attempt.

### Product hypotheses, not established facts

The following numbers are starting hypotheses and must be measured in the
pilot; they must not be described as research guarantees:

- A `70% high-risk / 20% interleaved / 10% prerequisite` session mix.
- Review intervals near `1, 3, 7, and 14 days`.
- A fixed requirement such as three correct answers in three sessions.
- Any SM-2-style ease factor or mastery delta.
- The current or future readiness percentage as a passing probability.
- A single universal effect size for retrieval, spacing, or interleaving.

## 3. Required inputs

Before a session starts, Campus Coach resolves one immutable target snapshot:

| Input | Required behavior |
| --- | --- |
| Student and class | Authenticated owner and exact class/course instance |
| Assessment scope | Recent material, a specific exam, an assignment, or mixed class review |
| Assessment metadata | Date, weight, topics, and known format when available |
| Candidate concepts | Canonical concept IDs with exact source provenance |
| Importance evidence | Rubric/study-guide evidence, verified professor signals, recurrence, and confidence |
| Learning state | Retrieval history, confidence history, last review, next review, and stability when available |
| Time budget | Default 10–25 minutes; never create a needlessly long plan |

Unsupported, disputed, contradictory, wrong-scope, and low-confidence
high-impact evidence goes to verification. It does not silently enter scored
practice.

## 4. Priority and session assembly

The deterministic scheduler, not a free-form model response, chooses the
concept order. One **candidate Phase 2 prediction model** is:

```text
uncalibrated_predicted_recall =
  mastery_after_retrieval × 2^(-time_to_test / stability_half_life)

assessment_risk = assessment_weight
                × concept_relevance
                × urgency
                × (1 - uncalibrated_predicted_recall)

priority = assessment_risk
         × (1 + prerequisite_unlock_bonus)
         / max(2, expected_practice_minutes)
```

This equation assumes an exponential forgetting curve, a meaningful mastery
scale, and a calibrated stability parameter; none is established for Campus
Companion. It may control readiness or consequential scheduling only after
out-of-sample calibration. Until then, use an honest fallback based on
weakness, due status, exam proximity, verified emphasis, and expected minutes.
The UI must explain the evidence it actually used.

Initial session assembly:

1. Resolve high-impact uncertainty or ask the student to confirm scope.
2. Start with a brief cold diagnostic from the highest-priority concepts.
3. Allocate most remaining items to concepts at greatest assessment risk.
4. Interleave only concepts/problem types the student must discriminate on the
   real assessment.
5. Include a prerequisite repair only when it blocks the target skill.
6. Reserve a later position for retrying an item missed earlier in the session.
7. Stop when the time budget is reached and schedule unfinished priorities.

## 5. One-item learning loop

Every scored item follows this order:

1. **Prompt:** show a grounded question or problem without the answer.
2. **Attempt:** require the student to commit to an answer or explicitly select
   “I don't know.”
3. **Confidence:** collect `Guessing`, `Somewhat sure`, or `Very sure` before
   feedback.
4. **Server scoring:** derive correctness and concept attribution from the
   stored artifact for objective items; do not trust client-owned correctness.
5. **Feedback:** show the correct reasoning and its source evidence.
6. **Repair:** choose the smallest useful response to the error.
7. **Retry:** ask a different but concept-equivalent question later, not an
   immediate copy whose answer remains in working memory.
8. **Persist:** record every immutable attempt exactly once; update
   mastery/review state only when the server marks the attempt mastery-eligible.

Objective performance, source quality, recency, and assistance level dominate
the mastery decision. Confidence is a secondary diagnostic and scheduling
signal; its exact mastery weights remain a product hypothesis.

Every planned item and retry needs a stable server-recognized ID plus a
server-derived evidence role:

- `cold_diagnostic`
- `independent_retrieval`
- `same_session_repair`
- `assisted_practice`

Only eligible unaided objective or rubric-verified retrieval may strengthen
secure mastery. A same-session repair is stored for history but cannot increase
the spaced streak, stability, or next-review interval. Assistance level and
evidence role must be stored server-side; the current `objective` versus
`self_report` distinction is not sufficient for this target behavior.

Ending at the time budget is a valid partial session: answered items persist
once, unanswered items do not lower mastery, coverage is labeled incomplete,
and unfinished priorities return to the queue. The result API must support this
before the product advertises time-bounded adaptive sessions.

### Repair policy

| Outcome | Next action |
| --- | --- |
| Correct, very sure | Advance; schedule a longer follow-up based on history and exam date |
| Correct, guessing/somewhat sure | Treat as weaker evidence and schedule sooner |
| Wrong, very sure | Clearly correct the misconception, ask for one brief explanation, then retry later |
| Wrong, low confidence or blank | Show one source-grounded concrete/worked example, then a near-transfer attempt |
| Ambiguous or disputed item | Exclude from mastery and send to verification |

High-confidence errors are high-priority diagnostic events, but they are not
assumed to be permanently repaired after one feedback screen. They require
later retrieval.

## 6. Match practice to the assessment

| Learning target | Preferred practice |
| --- | --- |
| Terms, facts, and relationships | Cued recall or flashcard attempt, followed by source-grounded feedback |
| Conceptual understanding | Short explanation, comparison, prediction, or application question |
| Math, chemistry, physics, accounting | For low prior knowledge, use an annotated worked example and fade support into near transfer; with partial competence, attempt before steps |
| Choosing among similar methods | Interleaved problem types that require selecting the method |
| Multiple-choice assessment | Grounded MCQ plus rationale; include occasional answer generation when retrieval success is reasonable |
| Written/free-response assessment | Short answer, outline, or teach-back evaluated against source-backed criteria |
| Assignment instructions | Student-confirmed checklist kept separate from concept mastery |

The first supported production formats remain flashcards and multiple choice.
Short answer, worked-example practice, and teach-back require explicit scoring,
grounding, and accessibility contracts before they can update secure mastery.
Games are presentation layers over the same concept and item contracts; they do
not create a second learning system.

### First production improvement: retrieval-first MCQ

Keep objective server scoring while requiring a brief recall attempt:

1. Show the question without choices, hints, rationale, or source evidence.
2. Student selects **I have an answer** or **I'm not sure**.
3. Reveal the grounded choices.
4. Student selects a choice and records confidence before feedback.
5. Reveal correctness, rationale, and the supporting source excerpt.
6. If missed, return a short, concept-equivalent recall prompt after at least
   two other concepts. This same-session repair is practice only and must not
   increase a spaced streak or postpone the next review.

This is a launch hypothesis to test against the current direct-MCQ flow; it is
not a claim that hiding choices always improves learning.

## 7. “I don't get this” and assignment help

The stuck flow is:

1. Preserve the exact class, assignment, source, and concept.
2. Identify prior knowledge and the exact point of confusion.
3. With partial competence, ask for an attempt and give the smallest useful
   hint. With low prior knowledge or a blank response, show one annotated,
   source-grounded worked example first.
4. Ask the student to explain the key step in one sentence.
5. Fade support and present a near-transfer problem or fresh retrieval item.
6. Schedule a later unaided retrieval if the student succeeds.

Assignment completion is separate from demonstrated learning. Campus Companion
may explain requirements, build a student-confirmed checklist, teach the
underlying concept, and provide analogous practice. It must not silently mark a
graded assignment complete, submit work, or provide answers to an active test.

## 8. Lecture Intelligence handoff

Before persistent Lecture Intelligence ships, it needs a reviewed evidence
contract rather than a single context-free `professor_emphasis` Boolean:

| Durable record | Minimum purpose |
| --- | --- |
| Transcript segment | Capture/lecture ID, timestamps, text, STT confidence, and redaction state |
| Concept evidence | Concept, segment reference, exact text offsets, evidence kind, source confidence, and verification state |
| Professor signal | Limited signal type, exact segment/excerpt, confidence, assessment/assignment target, and verification state |
| Assessment-concept link | Exact assessment, concept relevance, evidence references, and verified/inferred/review state |
| Assessment profile | Known test format, timing, allowed tools, source, confidence, and confirmation state |

Initial professor-signal types are limited to explicit assessment cues,
explicit importance, worked examples, repeated explanations, corrected
misconceptions, and assignment instructions. Discussion time alone is weak
evidence. AI paraphrase without an exact transcript reference is not proof.

A lecture capture becomes a trustworthy Study Lab input only after:

1. Permitted classroom audio is processed in encrypted temporary chunks.
2. The complete transcript is saved with exact section and lecture provenance.
3. Temporary audio is deleted and the job records deletion status.
4. Professor statements, repeated explanations, definitions, examples,
   corrections, and assignment directives are extracted with timestamped
   evidence and confidence.
5. Student speech and sensitive discussion are excluded or redacted as
   required by the permission policy.
6. High-impact uncertain passages go to review.
7. “What mattered today” presents a small ranked set with evidence.
8. After conservative same-class concept resolution and evidence records are
   built, approved concepts enter the shared concept pipeline used by notes,
   photos, and syllabi. Until then, the prototype remains non-mutating.

The transcript and professor signals are evidence, not mastery. Receiving,
opening, reading, or sharing them does not change readiness.

The first lecture release is private. Exact-section sharing and notifications
are a later gate after recording permission, canonical section identity,
sanitization, reporting, duplicate control, and access revocation are proven.

## 9. Session completion and readiness language

A completed session may report:

- Objective items correct and missed.
- Confidence calibration.
- Concepts strengthened or needing another review.
- The next scheduled review.
- Coverage of the selected assessment scope.

It must not report “you will pass,” “you are done,” or treat a single successful
session as durable retention. Current readiness is an uncalibrated study index,
not a grade prediction. Target readiness eventually estimates successful
unaided retrieval on the assessment date and must include uncertainty.

## 10. Current implementation versus target

| Capability | August 8 separate local Phase 0 prototype — unmerged and not database-verified |
| --- | --- |
| Flashcards and grounded MCQ | Built locally |
| Exact study target snapshot | Built locally for recent, exam, class, and capture scopes; Coach scope is not reliable across reload |
| Confidence before feedback | Local prototype only; not part of PR #35 |
| Server-derived MCQ correctness and item attribution | Local prototype only; v1/v2 endpoint separation and database/RLS acceptance remain open |
| Positive flashcard self-report protected from secure mastery inflation | Local prototype only; the independent v1/v2 split must be fixed before deployment |
| New concept begins unassessed | Not built; extraction still seeds `0.15`, which Phase 0 must remove from readiness |
| Real-session time budget | Not built; the existing duration control is demo-only |
| Coach-ranked concept order | Not reliably preserved through server artifact generation |
| Coach-scope artifact reload | Has a scope-fingerprint mismatch to repair before relying on reload |
| Adaptive concept/item queue | Not built |
| Within-session delayed retry | Not built |
| Safe partial-session persistence | Not built; v2 currently requires one result for every artifact item |
| Time-sensitive stability/forgetting model | Not built |
| MCQ source evidence after feedback | Not displayed, although a source excerpt is stored |
| “Question seems wrong” / dispute exclusion | Not built |
| Short answer/worked problem/teach-back scoring | Not built |
| Assessment-format-aware mode selection | Not built |
| Real lecture recording and transcription | Not built; current UI is simulated |
| “What mattered today” evidence review | Not built |

## 11. Release slices and gates

### Slice A — Learning-truth cutover

After the focused PR #35 corrections, complete the separate Phase 0 v1/v2
separation, database/RLS acceptance suite, deployment sequence, and legacy-RPC
retirement before adding new mastery paths.

### Slice B — Professor Signal prototype

Run 20–30 permission-cleared or de-identified real lecture transcripts through
an offline, non-mutating fixture harness. The production text-capture seam is
unsafe for this phase until the `0.15` discovery seed is removed from readiness.
Use synthetic transcripts only for deterministic edge-case tests, not to
measure relevance. Build transcript segmentation, evidence-backed professor
signals, a top-five “What Mattered Today” view, and manual correction/dispute
controls before building microphone plumbing.

**Gate:** every prototype output is manually reviewed; every surfaced signal
has valid transcript provenance; at least 80% of audited top-ranked concepts are
accepted as relevant; the reviewed set contains zero material errors in
assessment cues, formulas, dates, or assignment directives; lower-severity
signal errors are reported separately with sample size and uncertainty; and
generated-item correctness is gated separately.

### Slice C — Narrow priority-to-study handoff

Persist the reviewed evidence contract, build the deterministic honest-fallback
ranker, preserve ranked concept order and exact assessment scope, and feed the
existing flashcard/MCQ path.

**Gate:** fixed fixtures produce the expected rank order and explanation; 100%
of generated items retain provenance; every initial pilot study pack is
manually reviewed before exposure; the reviewed set contains zero material
answer-key, formula, due-date, or rubric errors; lower-severity errors are
reported separately with sample size and uncertainty; and disputed material
cannot update mastery.

### Slice D — Private lecture vertical slice

Ship permitted record → transcription → timestamped transcript → verified audio
deletion → exact-class concept extraction. Do not add sharing or new study
formats in this slice.

**Gate:** at least 95% of bounded beta recordings produce a complete transcript;
every recording retains a valid capture-time permission/notice basis; every
successful audio object is verified absent after processing; failed/cancelled
audio is absent within 24 hours; minute/cost meters, hard limits, and budget
alerts pass; in a permission-cleared calibration set at least 95% of audited
high-impact segments are accurate or correctly withheld, with zero materially
wrong formulas, dates, assessment cues, or assignment directives promoted into
study; and there are zero scope/access incidents.

### Slice E — Adaptive retrieval session

Add a deterministic queue, within-session delayed retry, source-grounded repair,
and exam-date-aware follow-up scheduling using the two existing study formats.

**Gate:** fixture tests cover every outcome/confidence transition, retry order,
scope firewall, idempotency, exam-date cap, and disputed-item exclusion. A retry
must use a distinct source-grounded prompt after at least two other concepts and
must not increase the spaced streak, stability, or review interval. Partial
sessions persist answered items once, leave unanswered items neutral, report
incomplete coverage, and reschedule unfinished priorities.

### Slice F — Feasibility and preliminary learning pilot

Run a preregistered 20–30-student, 3–5-section pilot through at least one
assessment cycle. This tests feasibility, trust, use, cost, and a preliminary
within-pilot delayed-retrieval signal; it does not establish general
effectiveness.

**Gate:** meet the source-of-truth safety and feasibility thresholds. Before any
general effectiveness claim, preregister an adequately powered comparison that
accounts for section clustering, attrition, uncertainty, and multiple outcomes.

### Slice G — Shared section transcript

Only after the private loop is useful and safe, test one reviewed transcript
for verified students in one or two exact sections. Sharing permission is
separate from recording permission.

## 12. Evidence and interpretation

- Dunlosky et al. rated practice testing and distributed practice as the two
  highest-utility techniques in their broad review; the review does not supply
  one universal effect size for every product context:
  [Psychological Science in the Public Interest](https://journals.sagepub.com/doi/10.1177/1529100612453266).
- Roediger and Karpicke found that repeated retrieval improved delayed
  retention relative to repeated study even when restudy looked better after a
  five-minute delay:
  [Psychological Science](https://pubmed.ncbi.nlm.nih.gov/16507066/).
- Cepeda et al. found that useful spacing depends on the intended retention
  interval rather than one fixed universal schedule:
  [Psychological Science](https://pubmed.ncbi.nlm.nih.gov/19076480/).
- Butler found retrieval practice supported later transfer to new questions in
  the studied conditions:
  [Journal of Experimental Psychology: Learning, Memory, and Cognition](https://pubmed.ncbi.nlm.nih.gov/20804289/).
- Smith and Karpicke found that short-answer was not uniformly superior to MCQ;
  initial retrieval success moderated the advantage:
  [Memory](https://learninglab.psych.purdue.edu/downloads/2014/2014_Smith_Karpicke_Memory.pdf).
- Brunmair and Richter found a moderate average interleaving effect with strong
  material-dependent moderators, including ambiguous results for expository
  text and smaller effects for mathematical tasks:
  [Psychological Bulletin manuscript](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf).
- Worked examples can support novices while excess guidance can lose value as
  expertise grows, so the stuck flow must adapt to prior knowledge:
  [Kalyuga's expertise-reversal review](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf).

These sources support the product direction. Campus Companion still must
validate its own generated content, scheduling policy, student population, and
assessment outcomes.
