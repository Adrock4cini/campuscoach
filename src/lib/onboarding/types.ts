export interface OnboardingExam {
  label: string;
  date: string; // ISO YYYY-MM-DD
}

export interface OnboardingAssignment {
  label: string;
  dueDate: string; // ISO YYYY-MM-DD
}

export interface OnboardingClass {
  name: string;
  code?: string;
  professor?: string;
  days: string[];       // ["Mon","Wed"]
  time?: string;        // "10:00 AM"
  endTime?: string;
  location?: string;
  textbook?: string;
  examDates?: OnboardingExam[];
  assignments?: OnboardingAssignment[];
}

export interface OnboardingData {
  name: string;
  school: string;
  term: string;                // "Spring 2026"
  classes: OnboardingClass[];
  workSchedule?: string;
  reminderStyle: "gentle" | "standard" | "high";
  studyGoal: string;
}

export const emptyOnboarding: OnboardingData = {
  name: "",
  school: "",
  term: "",
  classes: [{ name: "", professor: "", days: [], time: "" }],
  workSchedule: "",
  reminderStyle: "gentle",
  studyGoal: "",
};
