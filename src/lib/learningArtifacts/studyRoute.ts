export function buildRealStudyLabPath(searchParams: URLSearchParams) {
  const next = new URLSearchParams();
  const classId = searchParams.get("classId");
  const captureId = searchParams.get("captureId");
  const conceptIds = searchParams.get("conceptIds");
  const requestedMode = searchParams.get("format") ?? searchParams.get("mode");
  const format = requestedMode === "multiple_choice"
    || requestedMode === "multiple-choice"
    || requestedMode === "quiz"
    ? "multiple_choice"
    : "flashcards";

  if (classId) next.set("classId", classId);
  if (captureId) next.set("captureId", captureId);
  if (conceptIds) next.set("conceptIds", conceptIds);
  next.set("format", format);

  return `/study-lab?${next.toString()}`;
}
