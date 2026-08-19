import { useNavigate } from "react-router-dom";
import { DashboardAgendaView } from "@/components/dashboard/DashboardAgendaView";
import type { DemoClassAgendaItem } from "@/lib/demo/dashboardSampleAdapter";

type DemoTodaysPlanProps = {
  agenda: DemoClassAgendaItem[];
  now?: Date;
};

/**
 * Read-only demo adapter for the production agenda UI.
 *
 * It accepts already-built sample data and limits every interaction to route
 * navigation. It never loads account data or opens capture/write surfaces.
 */
export function DemoTodaysPlan({ agenda, now = new Date() }: DemoTodaysPlanProps) {
  const navigate = useNavigate();

  const openItem = (item: DemoClassAgendaItem) => {
    navigate(item.classId ? `/classes/${encodeURIComponent(item.classId)}` : "/classes");
  };

  return (
    <DashboardAgendaView
      agenda={agenda}
      now={now}
      classAction="open"
      calendarHref={null}
      onOpenItem={openItem}
    />
  );
}
