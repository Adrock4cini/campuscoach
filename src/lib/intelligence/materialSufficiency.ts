/**
 * Information sufficiency — a first-class state.
 *
 * A test two weeks out with no captured material must not look like a
 * broken Study feature or a fake readiness score. This pure helper says,
 * in plain student language, whether Campus Coach has enough grounded
 * class material to build reliable test prep yet.
 */

export interface MaterialSignals {
  /** Concepts extracted into permanent memory for this class. */
  conceptCount: number;
  /** Captures attached to this class (notes, photos, hints). */
  captureCount: number;
}

export interface MaterialSufficiency {
  sufficient: boolean;
  /** Short label safe to show on a card. */
  label: string;
  /** One plain sentence explaining what's missing. */
  detail: string;
  /** Primary call to action for this state. */
  ctaLabel: string;
}

/** Below these, test prep would be guesswork rather than grounded study. */
export const MIN_CONCEPTS_FOR_PREP = 5;
export const MIN_CAPTURES_FOR_PREP = 2;

export function assessMaterial(
  signals: MaterialSignals,
  options: { examTitle?: string | null } = {},
): MaterialSufficiency {
  const { conceptCount, captureCount } = signals;
  const forTest = options.examTitle ? ` for ${options.examTitle}` : "";

  if (conceptCount >= MIN_CONCEPTS_FOR_PREP && captureCount >= MIN_CAPTURES_FOR_PREP) {
    return {
      sufficient: true,
      label: "Enough material to study",
      detail: `${conceptCount} concepts from ${captureCount} captures are ready to practice.`,
      ctaLabel: options.examTitle ? "Prepare for this test" : "Start a 10-minute study set",
    };
  }

  if (captureCount === 0) {
    return {
      sufficient: false,
      label: "Not enough class material yet",
      detail: `Campus Coach needs material from this class to build reliable test prep${forTest}.`,
      ctaLabel: "Add study material",
    };
  }

  return {
    sufficient: false,
    label: "Not enough class material yet",
    detail: `Only ${captureCount} capture${captureCount === 1 ? "" : "s"} and ${conceptCount} concept${conceptCount === 1 ? "" : "s"} so far — add a bit more so test prep${forTest} is grounded in your real class.`,
    ctaLabel: "Add study material",
  };
}
