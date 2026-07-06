export interface OnboardingClass {
  name: string;
  professor?: string;
  days: string[];       // ["Mon","Wed"]
  time?: string;        // "10:00 AM"
  location?: string;
  textbook?: string;
}

export interface OnboardingData {
  name: string;
  school: string;
  term: string;                // "Spring 2026"
  classes: OnboardingClass[];
  workSchedule?: string;       // free text, optional
  reminderStyle: "gentle" | "standard" | "high";
  studyGoal: string;           // free text: "Raise GPA to 3.5"
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
