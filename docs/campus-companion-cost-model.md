# Campus Companion — 1,000-DAU cost model

**Planning date:** August 7, 2026
**Purpose:** Set a defensible operating-cost envelope before recording, scanning, study games, and social features are offered at scale.

## Executive decision

At 1,000 students using the product every day, plan for roughly **$1,100–$12,500 per month** in provider-equivalent usage, with a practical base case near **$4,700 per month**. Audio transcription is the dominant variable: in the base case it is about **$4,050 of $4,734**, or 86% of the modeled total.

Do not market unlimited recording at launch. Include a measured monthly transcription allowance, cache generated study materials, compress source images, and instrument cost per student before raising limits.

These are planning estimates, not a vendor quote. They exclude payroll, customer support, moderation, app-store and payment fees, taxes, email/SMS, analytics/monitoring not already listed, and any separate production hosting that is not covered by the named plans.

## What the product bills for today

The repository currently wires these potentially billable paths:

- Assignment and class-material photo uploads: the full original is stored in
  Supabase and sent through the Lovable AI gateway to Gemini for extraction.
- Typed capture: Gemini extraction and an embedding call through the Lovable AI
  gateway.
- Flashcard and multiple-choice artifact generation through the Lovable AI
  gateway.
- Syllabus processing through the Lovable AI gateway.
- Supabase database, storage, and edge-function activity for classes,
  assignments, and study sessions. Canvas synchronization is conditional;
  institution configuration and deployment remain unknown.

These planned features are **not currently wired end to end**, so they are not present-day production usage:

- Professor/classroom recording and speech-to-text transcription.
- Additional game formats beyond flashcards and multiple choice.
- Friend matching, requests, direct messages, group chat, and the related moderation workload.

The full-product scenarios below include a transcription allowance and an AI-generation allowance so they can guide pricing. Social messaging is excluded until its message volume, attachment policy, retention, realtime concurrency, and moderation design are known.

## Monthly scenarios at 1,000 DAU

Assumptions: 1,000 daily active students, 30 days/month, the current full-image processing behavior, and cached study artifacts after generation. “AI study generations” includes extraction and generated study activities; it is a planning allowance, not a claim that every listed game already exists.

| Usage per active student per day | Low | Base | High |
|---|---:|---:|---:|
| Recorded audio | 10 min | 45 min | 120 min |
| Scanned pages | 0.5 | 2 | 5 |
| AI study generations | 2 | 5 | 12 |

| Monthly provider-equivalent cost | Low | Base | High |
|---|---:|---:|---:|
| Supabase plan, compute, storage, and egress | $27 | $91 | $284 |
| Lovable Pro platform plan | $25 | $25 | $25 |
| Transcription at $0.003/min | $900 | $4,050 | $10,800 |
| Gemini extraction and study generation | $186 | $568 | $1,407 |
| Embeddings | < $1 | < $1 | < $1 |
| **Estimated monthly total** | **$1,138** | **$4,734** | **$12,517** |
| **Cost per active student/month** | **$1.14** | **$4.73** | **$12.52** |

### Calculation inputs

The table is reproducible from these planning inputs and provider-equivalent
rates. Lovable publishes underlying-provider-based credit billing but not a
stable public conversion from every gateway credit to dollars, so production
gateway charges must be confirmed in the pilot dashboard.

- Transcription: `gpt-4o-mini-transcribe` recorded minutes ×
  **$0.003/minute**.
- Audio storage/transfer sensitivity: compressed mono audio at about
  **64 kbps** (**0.48 MB/minute**) with up to 30 days of temporary retention.
  This is a conservative cost sensitivity, not product policy; successful
  audio should be verified deleted immediately after transcription.
- Scans: about **2 MB per original page**, with the table showing the first
  30 days of storage and one outward processing transfer. Current originals
  are retained indefinitely, so cumulative storage grows every month until a
  purge policy ships.
- Transcript processing: about **200 text tokens per recorded minute**.
- Transcript processing output: about **10 output tokens per recorded minute**.
- Each study generation: about **2,000 input tokens and 600 output tokens**.
- Each scanned page: about **1,000 image-input tokens and 800 extraction-output
  tokens**.
- Gemini 2.5 Flash standard pricing used for extraction and study generation:
  **$0.30 per million input tokens** and **$2.50 per million output tokens**.
- `text-embedding-3-small`: **$0.02 per million tokens**.
- Supabase: Small compute in the base case and Medium in the high case, plus
  modeled storage and egress overages.

Multiply those volumes by the official rates linked below. The model does not
include prompt caching discounts, batch discounts, or Lovable's temporary AI
grant, so pilot invoices may differ.

For comparison, removing the future transcription line puts the currently wired/non-audio envelope near **$238 low, $684 base, and $1,717 high per month**. Actual spend remains zero-to-variable until students use the production flows, and Lovable’s temporary AI grant or gateway billing can change who issues the model charge without changing the underlying consumption.

## The sensitivity that matters

At 1,000 DAU and $0.003 per audio minute:

> Every additional **10 recorded minutes per student per day adds about $900/month**.

The calculation is `1,000 students × 30 days × 10 minutes × $0.003`. Sixty minutes per student per day is therefore about **$5,400/month for transcription alone**. A $0.006/min model would double the transcription rows above; a lower-cost model can reduce them, but classroom-noise accuracy must be tested before choosing it.

Image behavior is the next operational risk. The app currently uploads full originals and keeps them indefinitely. At two pages per student per day and an average 1.9 MB original, that adds roughly **114 GB of source images each month** before derivatives, backups, or downloads. Storage itself is not the largest line item, but unbounded retention, repeated full-image model calls, and egress compound over time.

## Cost-control gates before a 1,000-DAU launch

1. **Meter transcription before selling it.** Log minutes by user/class, enforce daily and monthly limits, and alert on cost per active student. Start with **600–900 included minutes per student/month**, then use paid minute packs or a higher tier instead of “unlimited.”
2. **Validate speech quality and price together.** Run the same noisy classroom recordings through the chosen model and at least one lower-cost option. Measure usable-note accuracy, not word-error rate alone.
3. **Shrink and expire uploads.** Resize/compress images before model submission, cap file size/page count, retain derived text and learning metadata, and delete originals after a documented recovery window unless the student explicitly needs them.
4. **Make generation idempotent and cached.** Key extraction and artifact generation by content hash plus generation version. A retry or repeated click must return the existing result instead of buying it twice.
5. **Generate on demand.** Do not pre-generate every game for every concept. Create the next best activity when needed, then reuse it until the source or pedagogy version changes.
6. **Set per-user AI budgets.** Rate-limit capture and regeneration, show students when a task is already processing, and stop retry storms. Record tokens, images/pages, audio minutes, storage, egress, latency, and provider cost for every job.
7. **Add retention jobs and capacity alerts.** Purge stale disposable artifacts, aggregate old event rows, monitor database growth, and warn before Supabase compute/storage/egress tier changes.
8. **Price social separately after design.** Text-only friendships and messaging may be inexpensive in infrastructure at 1,000 DAU, but attachments, realtime fan-out, abuse prevention, reporting, and moderation can dominate. Establish those limits before adding social cost to this model.

## Launch economics recommendation

Use the **base case ($4.73 per active student/month)** for internal planning, but price against a higher percentile of recording usage. A **$14.99–$19.99 paid tier** is materially safer than a $9.99 unlimited plan once payment fees, support, moderation, inactive subscribers, and high-volume recorders are included. Recalculate after a 50–100 student pilot using measured minutes, pages, generations, and retention rather than survey intent.

## Official pricing references

Prices were checked on August 7, 2026. Re-check before launch because provider rates and included quotas can change.

- [Supabase pricing and included quotas](https://supabase.com/pricing)
- [Supabase compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk)
- [Supabase storage usage and overage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size)
- [Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Supabase Edge Function invocations](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations)
- [Lovable pricing](https://lovable.dev/pricing)
- [Lovable AI billing behavior](https://docs.lovable.dev/features/ai)
- [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API pricing, including transcription](https://developers.openai.com/api/docs/pricing)
- [OpenAI text-embedding-3-small model pricing](https://developers.openai.com/api/docs/models/text-embedding-3-small)

## Re-estimation checklist

Replace the planning assumptions with production measurements after the pilot:

- DAU and paid-user count.
- Audio minutes uploaded, successfully transcribed, and successfully processed
  audio verified deleted.
- Pages/images uploaded, average compressed size, and retention days.
- Input/output tokens by extraction and activity type.
- Generation cache-hit rate, retries, and failures.
- Database rows, stored GB, egress GB, and peak realtime connections.
- Cost per active student, paid student, retained student, and completed study session.
