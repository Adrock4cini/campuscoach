/**
 * React hooks over the Intelligence Engine.
 *
 * Components should prefer these hooks over calling engine functions
 * directly — they memoize per-render and give us a single seam to
 * later swap the demo-data source for a live Supabase/API call
 * without touching every page.
 */

import { useMemo } from "react";
import {
  getAssignmentPriorities,
  getAssignmentPriority,
  getClassPriorities,
  getCoachBrief,
  getExamTopicPredictions,
  getPeerStruggles,
  getSameProfessorSignal,
  getStudyFormatRecommendation,
  getTopFocusClass,
} from "./engine";

import {
  computeMomentum,
  getAssignmentCampusBrainInsight,
  getClassCampusBrainInsight,
  getStudentModel,
  getTopCampusBrainInsight,
} from "./campusBrain";

export const useClassPriorities = () =>
  useMemo(() => getClassPriorities(), []);

export const useTopFocus = () => useMemo(() => getTopFocusClass(), []);

export const useAssignmentPriorities = () =>
  useMemo(() => getAssignmentPriorities(), []);

export const useAssignmentPriority = (id: string) =>
  useMemo(() => getAssignmentPriority(id), [id]);

export const useExamTopicPredictions = (classId: string) =>
  useMemo(() => getExamTopicPredictions(classId), [classId]);

export const useStudyFormatRecommendation = (classId: string) =>
  useMemo(() => getStudyFormatRecommendation(classId), [classId]);

export const usePeerStruggles = (classId: string) =>
  useMemo(() => getPeerStruggles(classId), [classId]);

export const useSameProfessorSignal = (classId: string) =>
  useMemo(() => getSameProfessorSignal(classId), [classId]);

export const useCoachBrief = () => useMemo(() => getCoachBrief(), []);

/* ---------- Campus Brain ---------- */

export const useStudentModel = () => useMemo(() => getStudentModel(), []);

export const useMomentum = () => useMemo(() => computeMomentum(), []);

export const useCampusBrainInsight = () =>
  useMemo(() => getTopCampusBrainInsight(), []);

export const useClassCampusBrainInsight = (classId: string) =>
  useMemo(() => getClassCampusBrainInsight(classId), [classId]);

export const useAssignmentCampusBrainInsight = (id: string) =>
  useMemo(() => getAssignmentCampusBrainInsight(id), [id]);

