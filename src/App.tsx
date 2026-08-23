import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import MyClasses from "./pages/MyClasses";
import ClassDetail from "./pages/ClassDetail";
import ClassSyllabusPage from "./pages/ClassSyllabusPage";
import CalendarPage from "./pages/CalendarPage";
import StudyLab from "./pages/StudyLab";
import StudySession from "./pages/StudySession";
import FocusSprint from "./pages/FocusSprint";
import AssignmentsPage from "./pages/AssignmentsPage";
import AssignmentDetail from "./pages/AssignmentDetail";
import ExamsPage from "./pages/ExamsPage";
import ExamDetail from "./pages/ExamDetail";
import NotesPage from "./pages/NotesPage";
import NoteDetail from "./pages/NoteDetail";
import ProgressPage from "./pages/ProgressPage";
import SettingsPage from "./pages/SettingsPage";
import ExamDebriefPage from "./pages/ExamDebriefPage";
import CourseIntelligencePage from "./pages/CourseIntelligencePage";
import PathToGraduation from "./pages/PathToGraduation";
import ScholarshipsPage from "./pages/ScholarshipsPage";
import YourWeekPage from "./pages/YourWeekPage";
import Onboarding from "./pages/Onboarding";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import FamilyBetaAgreement from "./pages/FamilyBetaAgreement";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import NotFound from "./pages/NotFound";
import { RealComingSoon } from "@/components/real/RealComingSoon";
import { RealOnly } from "@/components/real/RealOnly";
import CanvasConnectionPage from "./pages/CanvasConnectionPage";
import ClassEditorPage from "./pages/ClassEditorPage";
import { hasFamilyBetaAgreement } from "@/lib/legal/familyBeta";
import { getOnboardingRedirect, getSetupGate } from "@/lib/auth/protectedRoute";
import { setupErrorCopy } from "@/lib/auth/setupStatus";

import { readLastRoute, writeLastRoute } from "@/lib/app/routeMemory";


function DemoOnly({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <RealComingSoon title={title} description={description}>
      {children}
    </RealComingSoon>
  );
}

/**
 * Shown instead of the login screen whenever a known session is temporarily
 * unreadable (offline, backgrounded phone, refresh in flight). The student
 * stays signed in; nothing is cleared unless they choose Sign out.
 */
function ReconnectingPanel() {
  const { signOut } = useAuth();
  return (
    <section
      className="mx-auto max-w-lg rounded-2xl border border-border/60 bg-card/70 p-6 text-center"
      aria-live="polite"
      data-testid="auth-reconnecting"
    >
      <h1 className="font-display text-xl font-semibold text-foreground">Reconnecting…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You’re still signed in. We’re just waiting on your connection — nothing you saved is lost.
      </p>
      <button
        type="button"
        className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-primary hover:bg-primary/5"
        onClick={() => window.location.reload()}
      >
        Try again
      </button>
      <button
        type="button"
        className="mt-2 min-h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
        onClick={() => { void signOut(); }}
      >
        Sign out
      </button>
    </section>
  );
}

/** Remembers the student's current place so a reload/resume lands back here. */
function RouteMemory() {
  const loc = useLocation();
  useEffect(() => {
    writeLastRoute(`${loc.pathname}${loc.search}`);
  }, [loc.pathname, loc.search]);
  return null;
}

/** Visible, terminal setup states. Never an endless spinner. */
function SetupPanel({ gate }: { gate: "checking" | "error" }) {
  const { setupError, refreshOnboarded, signOut } = useAuth();
  const copy = gate === "checking"
    ? {
        title: "Checking your account setup…",
        description: "This only takes a moment. Nothing will be changed.",
      }
    : setupErrorCopy(setupError);

  return (
    <section className="mx-auto max-w-lg rounded-2xl border border-border/60 bg-card/70 p-6 text-center" aria-live="polite">
      <h1 className="font-display text-xl font-semibold text-foreground">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{copy.description}</p>
      {gate === "error" && (
        <>
          <button
            type="button"
            className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-primary hover:bg-primary/5"
            onClick={() => { void refreshOnboarded(); }}
          >
            Try again
          </button>
          <button
            type="button"
            className="mt-2 min-h-11 rounded-xl px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
            onClick={() => { void signOut(); }}
          >
            Sign out
          </button>
        </>
      )}
    </section>
  );
}

function RootGate() {
  const { user, isDemoMode, loading, recovering, setupStatus } = useAuth();
  if (loading) return null;
  if (!user && recovering) return <ReconnectingPanel />;
  if (!user && !isDemoMode) return <Navigate to="/login" replace />;
  if (user && !hasFamilyBetaAgreement(user)) return <Navigate to="/family-beta-agreement" replace state={{ next: "/" }} />;
  const gate = getSetupGate({ signedIn: Boolean(user), setupStatus });
  if (gate) return <SetupPanel gate={gate} />;
  if (user && setupStatus === "needs_onboarding") return <Navigate to="/onboarding" replace />;
  // Returning students land back where they were, not on a generic Today page.
  return <Navigate to={(user && readLastRoute()) || "/dashboard"} replace />;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, isDemoMode, loading, recovering, setupStatus } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  // A transient session read failure must never look like a logout.
  if (!user && recovering) return <ReconnectingPanel />;
  if (!user && !isDemoMode) return <Navigate to="/login" replace state={{ next: `${loc.pathname}${loc.search}` }} />;
  if (user && !hasFamilyBetaAgreement(user)) {
    return <Navigate to="/family-beta-agreement" replace state={{ next: `${loc.pathname}${loc.search}` }} />;
  }
  const gate = getSetupGate({ signedIn: Boolean(user), setupStatus });
  if (gate) return <SetupPanel gate={gate} />;
  const onboardingRedirect = getOnboardingRedirect({
    signedIn: Boolean(user),
    setupStatus,
    pathname: loc.pathname,
  });
  if (onboardingRedirect) return <Navigate to={onboardingRedirect} replace />;
  return <>{children}</>;
}



const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RouteMemory />
          <Routes>
            {/* Public auth routes — no AppLayout */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/family-beta-agreement" element={<FamilyBetaAgreement />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            {/* Compatibility alias: older builds linked /beta-terms. Never 404 a legal page. */}
            <Route path="/beta-terms" element={<TermsPage />} />

            {/* Everything else lives inside the app shell */}
            <Route
              path="*"
              element={
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<RootGate />} />
                    <Route path="/onboarding" element={<Protected><RealOnly><Onboarding /></RealOnly></Protected>} />
                    <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
                    <Route path="/classes" element={<Protected><MyClasses /></Protected>} />
                    <Route path="/classes/new" element={<Protected><RealOnly><ClassEditorPage /></RealOnly></Protected>} />
                    <Route path="/classes/:classId/edit" element={<Protected><RealOnly><ClassEditorPage /></RealOnly></Protected>} />
                    <Route path="/classes/:classId/syllabus" element={<Protected><RealOnly><ClassSyllabusPage /></RealOnly></Protected>} />
                    <Route path="/classes/:classId" element={<Protected><ClassDetail /></Protected>} />
                    <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
                    <Route path="/integrations/canvas" element={<Protected><RealOnly><CanvasConnectionPage /></RealOnly></Protected>} />
                    <Route path="/study-lab" element={<Protected><StudyLab /></Protected>} />
                    <Route path="/study-lab/session" element={<Protected><StudySession /></Protected>} />
                    <Route path="/focus-sprint" element={<Protected><DemoOnly title="Focus Sprint — coming soon" description="Timed focus sprints tied to your real classes are on the way."><FocusSprint /></DemoOnly></Protected>} />
                    <Route path="/assignments" element={<Protected><AssignmentsPage /></Protected>} />
                    <Route path="/assignments/:assignmentId" element={<Protected><DemoOnly title="Assignment details — coming soon" description="Detailed assignment views for your real assignments are on the way. For now, manage them from the Assignments list."><AssignmentDetail /></DemoOnly></Protected>} />
                    <Route path="/exams" element={<Protected><ExamsPage /></Protected>} />
                    <Route path="/exams/:examId" element={<Protected><DemoOnly title="Exam details — coming soon" description="Detailed exam readiness views for your real exams are on the way. For now, manage them from the Exams list."><ExamDetail /></DemoOnly></Protected>} />
                    <Route path="/notes" element={<Protected><NotesPage /></Protected>} />
                    <Route path="/notes/:noteId" element={<Protected><DemoOnly title="Note details — coming soon" description="Detailed views for your real captures are on the way."><NoteDetail /></DemoOnly></Protected>} />
                    <Route path="/progress" element={<Protected><DemoOnly title="Progress — coming soon" description="Your real study progress and streaks will show up here soon."><ProgressPage /></DemoOnly></Protected>} />
                    <Route path="/settings" element={<Protected><DemoOnly title="Settings — coming soon" description="Account settings backed by your real profile are being finished. Nothing shown here will pretend to save until it can be stored securely."><SettingsPage /></DemoOnly></Protected>} />
                    <Route path="/exam-debrief" element={<Protected><DemoOnly title="Exam Debrief — coming soon" description="Post-exam reflections tied to your real exams are on the way."><ExamDebriefPage /></DemoOnly></Protected>} />
                    <Route path="/course-intelligence" element={<Protected><DemoOnly title="Class Intelligence — coming soon" description="Peer-driven class intelligence for your real classes is not ready yet."><CourseIntelligencePage /></DemoOnly></Protected>} />
                    <Route path="/your-week" element={<Protected><DemoOnly title="Your Week — coming soon" description="A week-at-a-glance built from your real schedule is on the way."><YourWeekPage /></DemoOnly></Protected>} />
                    <Route path="/path-to-graduation" element={<Protected><DemoOnly title="Path to Graduation — coming soon" description="Long-term degree planning for your real record isn't ready yet."><PathToGraduation /></DemoOnly></Protected>} />
                    <Route path="/scholarships" element={<Protected><DemoOnly title="Scholarships — coming soon" description="Personalized scholarship matches for your real profile aren't ready yet."><ScholarshipsPage /></DemoOnly></Protected>} />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
