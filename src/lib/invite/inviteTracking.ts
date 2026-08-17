/**
 * Invite Classmates — tracking + confidence helpers.
 *
 * Lightweight, storage-backed event log so the invite loop is measurable
 * even before a real analytics backend is wired up. Events are also
 * dispatched as `invite:event` CustomEvents so other parts of the app
 * (e.g. Campus Brain diagnostics) can react.
 */

export type InviteEventName =
  | "invite_created"
  | "invite_copied"
  | "invite_shared"
  | "invite_joined"
  | "invite_prompt_shown";

export interface InviteEvent {
  name: InviteEventName;
  classId: string;
  className?: string;
  channel?: "copy" | "sms" | "share" | "qr" | "system" | "post_study";
  at: string;
}

const STORAGE_KEY = "cc_invite_events_v1";
const PROMPT_SEEN_KEY = "cc_invite_prompt_seen_v1";

function readLog(): InviteEvent[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeLog(events: InviteEvent[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-200)));
  } catch {
    /* quota — ignore */
  }
}

export function trackInviteEvent(
  name: InviteEventName,
  detail: Omit<InviteEvent, "name" | "at"> & { at?: string }
) {
  const event: InviteEvent = {
    name,
    at: new Date().toISOString(),
    ...detail,
  };
  const log = readLog();
  log.push(event);
  writeLog(log);
  try {
    window.dispatchEvent(new CustomEvent("invite:event", { detail: event }));
  } catch {
    /* SSR / non-window — ignore */
  }
  console.info("[invite]", name, detail);
}

export function getInviteEvents(classId?: string): InviteEvent[] {
  const log = readLog();
  return classId ? log.filter((e) => e.classId === classId) : log;
}

/* ------------------------------------------------------------------ */
/* Invite link                                                         */
/* ------------------------------------------------------------------ */

export function buildInviteLink(classId: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://campuscoach.lovable.app";
  return `${origin}/join?class=${encodeURIComponent(classId)}`;
}

export function buildInviteMessage(className: string): string {
  return (
    `Studying ${className} with Campus Companion. ` +
    `It works alone — with classmates the class brain spots what this professor emphasizes. ` +
    `Your notes stay private; only anonymous study signals are shared.`
  );
}

/* ------------------------------------------------------------------ */
/* Soft prompt: show once per class after a real study session         */
/* ------------------------------------------------------------------ */

function readPromptSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PROMPT_SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Returns true the first time we should surface a soft invite for this class. */
export function shouldShowPostStudyInvite(classId: string): boolean {
  if (typeof window === "undefined") return false;
  const seen = readPromptSeen();
  return !seen[classId];
}

export function markPostStudyInviteSeen(classId: string) {
  if (typeof window === "undefined") return;
  try {
    const seen = readPromptSeen();
    seen[classId] = new Date().toISOString();
    localStorage.setItem(PROMPT_SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* quota — ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Confidence tiers                                                    */
/* ------------------------------------------------------------------ */

export type InviteConfidenceTier = "starting" | "growing" | "strong";

export interface InviteConfidence {
  tier: InviteConfidenceTier;
  label: string;
  studentCount: number;
}

export function describeInviteConfidence(
  studentCount: number
): InviteConfidence {
  if (studentCount >= 10) {
    return {
      tier: "strong",
      label: "Strong class signal",
      studentCount,
    };
  }
  if (studentCount >= 3) {
    return {
      tier: "growing",
      label: "Growing signal",
      studentCount,
    };
  }
  return {
    tier: "starting",
    label: "Works alone — better with classmates",
    studentCount,
  };
}
