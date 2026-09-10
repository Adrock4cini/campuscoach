# Slides and completed assignments — PR 61

Existing branch: `feat/pdf-study-capture`. This extends the PDF importer; no new backend, schema or public deployment.

## Slides

- Add from class → Upload File → choose a `.pptx` or PDF (25 MiB / 300 slides/pages maximum).
- Google Slides: download as Microsoft PowerPoint or PDF. Old `.ppt`: save as `.pptx` or PDF. Links, speaker notes, video and animations are not imported.
- PowerPoint is rendered on the device with pinned `@aiden0z/pptx-renderer` and `html-to-image`, both lazy loaded. Check the slide preview and choose a range before uploading. Complex layouts and unavailable fonts can differ; PDF is the fidelity fallback. Detected equations, OLE, audiovisual objects, legacy vector artwork and externally linked media require PDF export instead of silently losing study content.
- ZIP entry, expanded-byte, file-size, slide-count and canvas limits apply. No converter service receives the original file. Selected slide images retain their slide numbers and go through the same `scan-material` owner checks, batch checkpoints and wrong-class gate as PDF pages. Existing PDF checkpoints remain readable.
- Run `npm run verify:slides` after installing Playwright Chromium/WebKit. The synthetic two-slide biology fixture checks actual JPEG rendering, visible text/diagram pixels, ordered filenames and zero external requests. CI retains the rendered images.

Live acceptance (after approval to load this candidate):
1. Upload a real professor's PPTX to its existing class. Inspect several preview slides, including diagrams; no material should be saved before Add selected slides.
2. Import a selected range. Inspect saved source images, slide references and generated flashcards against that range; check after hard refresh.
3. Import an accounting slide deck into BIOL without Keep. The warning must stop further batches and add zero new concepts. A private material row alone is allowed.
4. Pause/resume with the same file/account: stable attempt IDs, no repeated completed batches. Different file/account must be rejected.
5. Google Slides PDF export and an existing PDF checkpoint still work. Unsupported/locked files give a useful error rather than success.

## Completed work

The assignment list, assignment detail and class assignment rows must show Completed, with no overdue label or deadline danger color, when status is `complete`. The original due date stays stored. Overdue filters/counters already exclude completed work.

Live acceptance: complete an overdue assignment; inspect all three views and dashboard counts; hard refresh. Reopen the assignment: its original deadline and overdue state return. Completion never awards study mastery.

Reference implementation API: https://github.com/aiden0z/pptx-renderer and https://github.com/bubkoo/html-to-image (pinned versions are in the lockfile).
