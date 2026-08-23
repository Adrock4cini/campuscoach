/**
 * Sidebar class labels must stay compact without becoming indistinguishable.
 * Six classes named "QA — BIOL College", "QA — CHEM College" … all collapsed
 * to "QA —" under a naive two-word truncation, so prefer the course code.
 */
export interface SidebarClassLabelInput {
  name: string;
  courseCode?: string | null;
}

const MAX_LABEL_CHARS = 22;

export function sidebarClassLabel({ name, courseCode }: SidebarClassLabelInput): string {
  const code = courseCode?.trim();
  if (code) return code.length > MAX_LABEL_CHARS ? `${code.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…` : code;

  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return "Class";
  if (clean.length <= MAX_LABEL_CHARS) return clean;

  // Keep the distinguishing tail words rather than a shared prefix like "QA —".
  const words = clean.split(" ");
  let label = "";
  for (const word of words) {
    const next = label ? `${label} ${word}` : word;
    if (next.length > MAX_LABEL_CHARS) break;
    label = next;
  }
  return `${(label || clean.slice(0, MAX_LABEL_CHARS)).trimEnd()}…`;
}
