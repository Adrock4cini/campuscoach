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
import NotFound from "./pages/NotFound";
import { RealComingSoon } from "@/components/real/RealComingSoon";


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

function RootGate() {
  const { user, isDemoMode, loading, onboarded } = useAuth();
  if (loading) return null;
  if (!user && !isDemoMode) return <Navigate to="/login" replace />;
  if (user && onboarded === null) return null; // still checking profile
  if (user && !onboarded) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/dashboard" replace />;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, isDemoMode, loading } = useAuth();
  const loc = useLocation();
  if (loading) return null;
  if (!user && !isDemoMode) return <Navigate to="/login" replace state={{ next: loc.pathname }} />;
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
          <Routes>
            {/* Public auth routes — no AppLayout */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Everything else lives inside the app shell */}
            <Route
              path="*"
              element={
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<RootGate />} />
                    <Route path="/onboarding" element={<Protected><Onboarding /></Protected>} />
                    <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
                    <Route path="/classes" element={<Protected><MyClasses /></Protected>} />
                    <Route path="/classes/:classId" element={<Protected><ClassDetail /></Protected>} />
                    <Route path="/calendar" element={<Protected><DemoOnly title="Calendar — coming soon" description="Your real calendar view is on the way. We'll pull in your classes, assignments, and exams automatically."><CalendarPage /></DemoOnly></Protected>} />
                    <Route path="/study-lab" element={<Protected><StudyLab /></Protected>} />
                    <Route path="/study-lab/session" element={<Protected><StudySession /></Protected>} />
                    <Route path="/focus-sprint" element={<Protected><DemoOnly title="Focus Sprint — coming soon" description="Timed focus sprints tied to your real classes are on the way."><FocusSprint /></DemoOnly></Protected>} />
                    <Route path="/assignments" element={<Protected><AssignmentsPage /></Protected>} />
                    <Route path="/assignments/:assignmentId" element={<Protected><DemoOnly title="Assignment details — coming soon" description="Detailed assignment views for your real assignments are on the way. For now, manage them from the Assignments list."><AssignmentDetail /></DemoOnly></Protected>} />
                    <Route path="/exams" element={<Protected><ExamsPage /></Protected>} />
                    <Route path="/exams/:examId" element={<Protected><DemoOnly title="Exam details — coming soon" description="Detailed exam readiness views for your real exams are on the way. For now, manage them from the Exams list."><ExamDetail /></DemoOnly></Protected>} />
                    <Route path="/notes" element={<Protected><DemoOnly title="Notes & Recordings — coming soon" description="Your real capture library is being wired up here."><NotesPage /></DemoOnly></Protected>} />
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
