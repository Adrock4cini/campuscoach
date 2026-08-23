/**
 * Route split: signed-in students get their real assignment; demo mode keeps
 * the illustrative demo detail page.
 */
import { useAuth } from "@/contexts/AuthContext";
import { RealAssignmentDetail } from "@/components/real/RealAssignmentDetail";
import AssignmentDetail from "@/pages/AssignmentDetail";

export default function AssignmentDetailRoute() {
  const { mode } = useAuth();
  if (mode === "loading") return null;
  return mode === "real" ? <RealAssignmentDetail /> : <AssignmentDetail />;
}
