import { useState } from "react";
import { Plus, Mic, Camera, ClipboardPlus, Timer, FileUp, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const actions = [
  { label: "Record Class", icon: Mic, color: "bg-gradient-calm" },
  { label: "Snap Syllabus", icon: Camera, color: "bg-gradient-warm" },
  { label: "Add Assignment", icon: ClipboardPlus, color: "bg-primary" },
  { label: "Study Sprint", icon: Timer, color: "bg-success" },
  { label: "Upload Notes", icon: FileUp, color: "bg-accent" },
];

export function FloatingActionButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex flex-col gap-2 mb-2"
          >
            {actions.map((action, i) => (
              <motion.button
                key={action.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 group"
                onClick={() => setOpen(false)}
              >
                <span className="bg-card shadow-elevated rounded-lg px-3 py-2 text-sm font-medium text-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {action.label}
                </span>
                <div className={`h-11 w-11 rounded-full ${action.color} flex items-center justify-center shadow-elevated`}>
                  <action.icon className="h-5 w-5 text-primary-foreground" />
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(!open)}
        className="h-14 w-14 rounded-full bg-gradient-calm shadow-elevated flex items-center justify-center hover:shadow-lg transition-shadow"
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {open ? (
            <X className="h-6 w-6 text-primary-foreground" />
          ) : (
            <Plus className="h-6 w-6 text-primary-foreground" />
          )}
        </motion.div>
      </motion.button>
    </div>
  );
}
