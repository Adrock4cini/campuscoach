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
  | "invite_joined";

export interface InviteEvent {
  name: InviteEventName;
  classId: string;
  className?: string;
  channel?: "copy" | "sms" | "share" | "qr" | "system";
  at: string;
}

const STORAGE_KEY = "cc_invite_events_v1";

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
  // Console breadcrumb so we can see the loop working in the demo.
  // eslint-disable-next-line no-console
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
  return `Join our Campus Coach class brain for ${className}. The more of us who add notes, scans, and study signals, the smarter it gets for everyone.`;
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
    label: "Campus Brain is just getting started",
    studentCount,
  };
}
