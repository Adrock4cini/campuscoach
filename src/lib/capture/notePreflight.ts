/**
 * Cheap, deterministic check for text that cannot possibly produce concepts.
 *
 * This is NOT a length rule: "OIL RIG" is a legitimate capture. We only reject
 * input with no real word content at all, so a genuine extractor failure keeps
 * its own, different message.
 */
export type NotePreflight =
  | { usable: true }
  | { usable: false; reason: "empty" | "no-words"; message: string };

const WORD = /[\p{L}\p{N}]{2,}/gu;

export function assessQuickNoteText(input: string): NotePreflight {
  const text = (input ?? "").trim();
  if (!text) {
    return {
      usable: false,
      reason: "empty",
      message: "Add a few words first — even a short fact like “OIL RIG” works.",
    };
  }

  const words = text.match(WORD) ?? [];
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  // Needs at least one real word and some letters: punctuation, emoji, or a
  // single stray keystroke has nothing to learn from.
  if (words.length === 0 || letters < 2) {
    return {
      usable: false,
      reason: "no-words",
      message: "This note doesn't have any words yet. Type what you want to remember and we'll take it from there.",
    };
  }

  return { usable: true };
}
