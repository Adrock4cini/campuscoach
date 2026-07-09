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
import { isOnboarded } from "@/lib/onboarding/store";

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
                    <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
                    <Route path="/study-lab" element={<Protected><StudyLab /></Protected>} />
                    <Route path="/study-lab/session" element={<Protected><StudySession /></Protected>} />
                    <Route path="/focus-sprint" element={<Protected><FocusSprint /></Protected>} />
                    <Route path="/assignments" element={<Protected><AssignmentsPage /></Protected>} />
                    <Route path="/assignments/:assignmentId" element={<Protected><AssignmentDetail /></Protected>} />
                    <Route path="/exams" element={<Protected><ExamsPage /></Protected>} />
                    <Route path="/exams/:examId" element={<Protected><ExamDetail /></Protected>} />
                    <Route path="/notes" element={<Protected><NotesPage /></Protected>} />
                    <Route path="/notes/:noteId" element={<Protected><NoteDetail /></Protected>} />
                    <Route path="/progress" element={<Protected><ProgressPage /></Protected>} />
                    <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
                    <Route path="/exam-debrief" element={<Protected><ExamDebriefPage /></Protected>} />
                    <Route path="/course-intelligence" element={<Protected><CourseIntelligencePage /></Protected>} />
                    <Route path="/your-week" element={<Protected><YourWeekPage /></Protected>} />
                    <Route path="/path-to-graduation" element={<Protected><PathToGraduation /></Protected>} />
                    <Route path="/scholarships" element={<Protected><ScholarshipsPage /></Protected>} />
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
