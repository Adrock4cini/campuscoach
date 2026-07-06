/**
 * Campus Coach Intelligence Engine — public entry.
 *
 * The engine is the single source of truth for every "what should I
 * do next?" decision in the app. Pages import from this module and
 * never re-implement urgency, priority, or study-format logic
 * locally. As more student data flows in, only this module changes.
 */
export * from "./types";
export * from "./engine";
export * from "./hooks";
