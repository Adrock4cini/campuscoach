import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  assignments, getPriorityColor, getStatusLabel, getDaysUntil 
} from "@/data/demo";
import { ArrowUpDown, Lightbulb, ListChecks, HelpCircle, FileEdit, Sparkles } from "lucide-react";

export default function AssignmentsPage() {
  const sorted = [...assignments].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">Assignments</h1>
          <p className="text-muted-foreground mt-1">{assignments.filter(a => a.status !== 'turned-in').length} active assignments</p>
        </div>
        <Button variant="outline" size="sm">
          <ArrowUpDown className="h-4 w-4 mr-1.5" />
          Sort by due date
        </Button>
      </div>

      <div className="space-y-4">
        {sorted.map((a, i) => {
          const days = getDaysUntil(a.dueDate);
          const urgency = days <= 1 ? "border-danger/30" : days <= 3 ? "border-warning/30" : "border-border";
          
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card className={`shadow-card ${urgency}`}>
                <CardContent className="p-5">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-display font-semibold text-foreground">{a.title}</h3>
                        <Badge variant="secondary" className={`text-xs ${getPriorityColor(a.priority)}`}>
                          {a.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{a.className}</p>
                      <p className="text-sm text-foreground/80 mb-3">{a.instructions}</p>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>⏱ {a.estimatedTime}</span>
                        <span>📅 Due {days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span>
                        <Badge variant="outline" className="text-xs">{getStatusLabel(a.status)}</Badge>
                      </div>
                    </div>
                  </div>

                  {/* AI Actions */}
                  <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="text-xs h-8">
                      <ListChecks className="h-3 w-3 mr-1" /> Break into steps
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-8">
                      <HelpCircle className="h-3 w-3 mr-1" /> What's expected?
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-8">
                      <Lightbulb className="h-3 w-3 mr-1" /> Help me start
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-8">
                      <FileEdit className="h-3 w-3 mr-1" /> Outline
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-8">
                      <Sparkles className="h-3 w-3 mr-1" /> Quiz me
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Button variant="outline" className="w-full border-dashed">
        + Add Assignment
      </Button>
    </div>
  );
}
