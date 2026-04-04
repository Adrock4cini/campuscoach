import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import MyClasses from "./pages/MyClasses";
import CalendarPage from "./pages/CalendarPage";
import StudyLab from "./pages/StudyLab";
import AssignmentsPage from "./pages/AssignmentsPage";
import ExamsPage from "./pages/ExamsPage";
import NotesPage from "./pages/NotesPage";
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
            <Route path="/" element={<Dashboard />} />
            <Route path="/classes" element={<MyClasses />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/study-lab" element={<StudyLab />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/exams" element={<ExamsPage />} />
            <Route path="/notes" element={<NotesPage />} />
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
