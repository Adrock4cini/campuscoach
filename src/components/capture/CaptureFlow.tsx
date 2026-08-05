import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Mic, Camera, BookOpen, FileUp, StickyNote, MessageSquare, Brain,
  X, ArrowLeft, ArrowRight, Check, Sparkles, Loader2, Calendar,
  ClipboardList, Images, FileText,
} from "lucide-react";
import { classes as demoClasses } from "@/data/demo";
import { detectCurrentClass } from "@/lib/autoClass";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClasses } from "@/lib/onboarding/useMyClasses";
import {
  CAPTURE_LABELS,
  PROCESSING_STEPS,
  commitCapture,
} from "@/lib/capture/processor";
import type {
  CaptureContext,
  CaptureKind,
  CaptureResult,
  ProcessingStep,
} from "@/lib/capture/types";
import { ClassesLoadError } from "@/components/real/ClassesLoadError";
import { useRealAssignments, useRealExams } from "@/lib/realData/hooks";
import {
  filterCaptureTargets,
  validateCaptureImages,
} from "@/lib/capture/imageCapture";

// NOTE: Full original restored. Photo-first changes will be applied in subsequent small commits.
