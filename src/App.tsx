import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/classes" element={<MyClasses />} />
            <Route path="/classes/:classId" element={<ClassDetail />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/study-lab" element={<StudyLab />} />
            <Route path="/focus-sprint" element={<FocusSprint />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/assignments/:assignmentId" element={<AssignmentDetail />} />
            <Route path="/exams" element={<ExamsPage />} />
            <Route path="/exams/:examId" element={<ExamDetail />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:noteId" element={<NoteDetail />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
