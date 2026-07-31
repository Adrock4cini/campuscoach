import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  parseCanvasCalendar,
  validateCanvasFeedUrl,
} from "./canvas-calendar.ts";

Deno.test("accepts a private hosted Canvas calendar URL", () => {
  assertEquals(
    validateCanvasFeedUrl(
      "https://usu.instructure.com/feeds/calendars/user_secret.ics",
    ).hostname,
    "usu.instructure.com",
  );
});

Deno.test("rejects non-Canvas URLs to prevent server-side request abuse", () => {
  assertThrows(() =>
    validateCanvasFeedUrl("https://example.com/feeds/calendars/secret.ics")
  );
});

Deno.test("maps calendar events into class-bound assignments and exams", () => {
  const items = parseCanvasCalendar(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:assignment-42
DTSTART:20260820T235900Z
SUMMARY:Chapter 4 Homework [ACCT 2010]
DESCRIPTION:Complete problems 1-20
URL:https://usu.instructure.com/courses/321/assignments/42
END:VEVENT
BEGIN:VEVENT
UID:quiz-8
DTSTART:20260825T180000Z
SUMMARY:Exam 1 [ACCT 2010]
URL:https://usu.instructure.com/courses/321/quizzes/8
END:VEVENT
END:VCALENDAR`);
  assertEquals(items.length, 2);
  assertEquals(items[0].courseId, "321");
  assertEquals(items[0].courseName, "ACCT 2010");
  assertEquals(items[0].kind, "assignment");
  assertEquals(items[1].kind, "exam");
});

