# Focused study room

## Purpose and scope

Make studying feel like one class at a time. Continue the existing application
and study-clarity repair; do not replace the app or add generated curriculum.

This frontend-only change is stacked on PR #63 at
`d2abda48c77f14a4843101faab0a285f079f996f`. The local baseline tree was checked
against that GitHub commit: `59f9bf88448095bc89b3e1ffd0cace9126376776`.

## Student behavior

- Signed-in Study Lab uses a quiet shell with an All classes exit. Sidebar,
  floating capture button, bottom navigation and ambient animation are hidden
  in the room. CaptureProvider stays mounted so navigation does not reset drafts.
- The selected class is the page heading. Change class is collapsed by default.
- Focus is a native selector; study formats remain a three-button choice.
  Subject strategy details stay behind the existing information button.
- Choosing another class clears capture, assignment, exam and coach query
  parameters. Choosing the current class preserves its scope.
- Class access must finish loading before practice mounts. Unavailable classes
  have a recovery path, including when only one accessible class remains.
- Build/refresh is disabled while the saved set loads, preventing unnecessary
  generation before the app knows whether usable practice already exists.

No database, source-generation, readiness, scoring or persistence contract changes.
No paid AI calls, deployment, merge or production student-data changes were made.

## Local verification (2026-09-18)

- 62 tests passed across AppLayout, StudyLab, StudyLab.navigation,
  RealStudySet and RealStudySet.integration.
- TypeScript check and production build passed.
- Targeted ESLint: zero errors; one existing react-refresh export warning.
- Diff whitespace check passed.
- Browser preview attempted, but the managed browser rejected localhost with
  `ERR_BLOCKED_BY_CLIENT`. No visual browser PASS or screenshot is claimed.
- Integration tests simulate network/database boundaries; not live student QA.

## Review before release

1. At phone and desktop sizes, open Study Lab for a real QA class. Check that
   the class, focus, format and primary action are legible without crowding.
2. Start flashcards, MC and matching. Close the session and return to the class.
   Sources remain collapsed; existing scoring and save behavior must hold.
3. Enter through an assignment, capture or exam; switch classes. Confirm that
   the new class has no selection carried over from the old class.
4. Start a capture draft, visit the room, then return to capture. Draft remains.
5. Test an old class link with a single remaining class. Recover directly.
6. On a slow connection, confirm no build request can start during set loading.

PR #63 still requires its own exact frontend/backend release and live acceptance.
Retarget this draft after that dependency merges; do not bypass its release gate.

## Flashcards and multiple choice polish (2026-09-19)

Continues this same draft using the reviewed visual direction, without a timer.
Practice dialogs use an ivory surface, dark text and a restrained violet accent.
The palette is scoped to these dialogs; the rest of the application keeps its
existing theme. Cards have a larger centered prompt and a distinct answer state.
Answer choices have 56px minimum height, decorative A–D markers, wrapped feedback
labels and full-width Check/Next actions. Instructions sit outside the card.

Bold emphasis only wraps literal words already present in the question: a short
concept name, NOT or EXCEPT. No new hint, answer, illustration or AI generation
is introduced. Existing source disclosures remain available after reveal/check;
the confidence requirement, first-attempt scoring and persistence stay unchanged.
Priority controls and optional assisted hints remain future work.

Verification: 81 focused tests across six files passed, TypeScript check passed,
production build passed with existing size warnings, targeted lint and diff
checks passed. The existing silent-recall test now also checks that the visible
question wording remains intact when its concept is bold. This remains a draft
pending phone/desktop visual review and live student QA. Check long answers,
large text, and post-answer feedback before release; nothing was published.
