import type { OnboardingClass } from "./types";
import { createStableClassId } from "@/lib/realData/classes";
import { browserTimeZone, normalizeWeekdays } from "@/lib/calendar/classSchedule";

function normalized(classInfo: OnboardingClass): OnboardingClass {
  return {
    ...classInfo,
    days: normalizeWeekdays(classInfo.days),
    timeZone: classInfo.timeZone || browserTimeZone(),
  };
}

/** New/imported drafts receive a retry-safe identity immediately. */
export function prepareNewOnboardingClass(classInfo: OnboardingClass): OnboardingClass {
  return {
    ...normalized(classInfo),
    clientClassId: classInfo.clientClassId || createStableClassId(),
  };
}

/**
 * Pre-release cached named classes used a deterministic legacy key during save.
 * Preserve a missing ID so an interrupted legacy save retries the same row.
 */
export function hydrateCachedOnboardingClass(classInfo: OnboardingClass): OnboardingClass {
  const value = normalized(classInfo);
  if (value.clientClassId || value.name.trim()) return value;
  return prepareNewOnboardingClass(value);
}

