/**
 * Campus Companion ACCT 2010 Learning Map v0.
 *
 * This module contains original teaching structure and public/retail metadata
 * only. It contains no publisher prose, questions, answer keys, or platform
 * content. The three layers are deliberately separate:
 *
 * - stable: accounting knowledge and original practice blueprints
 * - usu: institution/program context, never presented as a course objective
 * - professor: section/material metadata and explicitly confirmed scope only
 */

export type AcctLearningProblemKind = "fact" | "distinction" | "procedure" | "relation";

export type AcctTeachingMove =
  | "deterministic-equation"
  | "one-event-classification"
  | "statement-articulation"
  | "before-after-table"
  | "compare-table"
  | "interleaved-practice"
  | "worked-example"
  | "faded-example"
  | "independent-transfer"
  | "error-analysis"
  | "retrieval-practice";

export interface Acct2010Unit {
  id: number;
  title: string;
  focus: readonly string[];
  learningProblemKind: AcctLearningProblemKind;
  misconception: {
    lure: string;
    correction: string;
  };
  teachingPlan: readonly AcctTeachingMove[];
  /** Original Campus Companion diagnostic—not an adopted-textbook item. */
  diagnosticStem: string;
}

export const ACCT_2010_STABLE_UNITS = [
  {
    id: 1,
    title: "Accounting equation",
    focus: ["Assets = liabilities + equity", "Classify one event's effect on the equation"],
    learningProblemKind: "distinction",
    misconception: {
      lure: "Equity is just whatever number is left over.",
      correction: "Equity is the owners' claim and changes for identifiable reasons; the equation is a relationship, not permission to plug an arbitrary number.",
    },
    teachingPlan: ["deterministic-equation", "one-event-classification", "independent-transfer"],
    diagnosticStem: "A business has $18,000 of assets and $7,000 of liabilities. What is equity, and which part of the equation did you solve?",
  },
  {
    id: 2,
    title: "Financial statements",
    focus: ["Income statement", "Retained earnings linkage", "Balance sheet", "Profit versus cash"],
    learningProblemKind: "relation",
    misconception: {
      lure: "Profit and cash are the same amount.",
      correction: "Profit measures revenues minus expenses for a period; cash changes when money is received or paid, so timing can make the two amounts different.",
    },
    teachingPlan: ["statement-articulation", "before-after-table", "independent-transfer"],
    diagnosticStem: "A company makes a credit sale today and collects next month. Which statement changes first, and why is that not the same as receiving cash?",
  },
  {
    id: 3,
    title: "Transaction analysis",
    focus: ["Expanded accounting equation", "Before-and-after effects", "Balanced event analysis"],
    learningProblemKind: "procedure",
    misconception: {
      lure: "Both sides of the equation always move in the same direction.",
      correction: "A transaction must keep the equation balanced, but it can exchange two assets, change a liability and an asset, or affect equity in several valid patterns.",
    },
    teachingPlan: ["before-after-table", "worked-example", "faded-example", "independent-transfer"],
    diagnosticStem: "A company buys equipment for cash. Show each affected account before and after the event, then verify that the equation still balances.",
  },
  {
    id: 4,
    title: "Debit and credit",
    focus: ["Asset increases use debits", "Liability increases use credits", "Account-side patterns"],
    learningProblemKind: "distinction",
    misconception: {
      lure: "Debit means bad, or every account increases on the same side.",
      correction: "Debit and credit name the left and right sides of an account; the account type determines which side records an increase.",
    },
    teachingPlan: ["compare-table", "interleaved-practice", "independent-transfer"],
    diagnosticStem: "A company receives cash from a customer. Which side increases Cash, and what rule—not a good/bad judgment—decides that side?",
  },
  {
    id: 5,
    title: "Journal to ledger to trial balance",
    focus: ["Analyze a transaction", "Journalize", "Post", "Prepare a trial balance"],
    learningProblemKind: "procedure",
    misconception: {
      lure: "Start posting before analyzing the event, or reverse the entry's sides.",
      correction: "Identify the accounts and their changes first, choose debit and credit from account type, then journalize and post.",
    },
    teachingPlan: ["worked-example", "faded-example", "independent-transfer"],
    diagnosticStem: "Given one new transaction, identify the accounts, choose their sides, write the two-line entry, and state what reaches the trial balance.",
  },
  {
    id: 6,
    title: "Adjusting entries",
    focus: ["Accruals", "Deferrals", "Earned and incurred amounts at period end"],
    learningProblemKind: "distinction",
    misconception: {
      lure: "A prepaid item and an accrued item require the same reasoning.",
      correction: "A deferral starts with cash recorded before recognition; an accrual recognizes revenue or expense before the related cash movement.",
    },
    teachingPlan: ["compare-table", "worked-example", "error-analysis", "independent-transfer"],
    diagnosticStem: "No cash moved this month, but employees earned wages that will be paid next month. Is this an accrual or a deferral, and what must be recognized now?",
  },
  {
    id: 7,
    title: "Closing the cycle",
    focus: ["Temporary accounts", "Permanent accounts", "Post-closing balances"],
    learningProblemKind: "procedure",
    misconception: {
      lure: "Every account, including a balance-sheet account, is closed at period end.",
      correction: "Temporary revenue, expense, and dividend balances reset; permanent asset, liability, and equity balances carry forward.",
    },
    teachingPlan: ["worked-example", "retrieval-practice", "independent-transfer"],
    diagnosticStem: "Which accounts should begin the next period at zero, and which balances must carry forward?",
  },
  {
    id: 8,
    title: "Merchandising",
    focus: ["Perpetual and periodic systems", "Sales", "Inventory", "Cost of goods sold"],
    learningProblemKind: "distinction",
    misconception: {
      lure: "Recording a merchandise sale requires only the revenue side.",
      correction: "Under a perpetual system, a sale records both revenue and the inventory cost leaving the business.",
    },
    teachingPlan: ["compare-table", "interleaved-practice", "independent-transfer"],
    diagnosticStem: "A perpetual-inventory seller delivers goods to a customer. What two economic effects must the records capture?",
  },
  {
    id: 9,
    title: "Cash and internal control",
    focus: ["Separation of duties", "Bank reconciliation", "Book-side adjustments"],
    learningProblemKind: "procedure",
    misconception: {
      lure: "If the bank balance differs from the books, the bank must be wrong.",
      correction: "Timing differences and items known first by either party explain many differences; a reconciliation identifies which side, if either, needs an entry.",
    },
    teachingPlan: ["worked-example", "before-after-table", "independent-transfer"],
    diagnosticStem: "A bank statement shows an NSF check that the company has not recorded. Which side of the reconciliation changes, and does the company need an entry?",
  },
  {
    id: 10,
    title: "Receivables",
    focus: ["Allowance method", "Direct write-off distinction", "Aging analysis"],
    learningProblemKind: "procedure",
    misconception: {
      lure: "Writing off one account should reduce current-period revenue.",
      correction: "Under the allowance method, the estimate affects expense earlier; a specific write-off reduces the receivable and its allowance, not revenue.",
    },
    teachingPlan: ["worked-example", "faded-example", "independent-transfer"],
    diagnosticStem: "An aging schedule implies a required ending allowance. Determine the adjustment from the allowance's current balance before recording it.",
  },
  {
    id: 11,
    title: "Inventory",
    focus: ["FIFO", "LIFO", "Weighted average", "Cost-flow assumptions"],
    learningProblemKind: "distinction",
    misconception: {
      lure: "LIFO means the last physical units on the shelf were actually sold first.",
      correction: "FIFO, LIFO, and weighted average assign costs; the accounting cost flow need not describe the physical movement of goods.",
    },
    teachingPlan: ["compare-table", "worked-example", "interleaved-practice"],
    diagnosticStem: "Use one purchase-and-sale data set to compare FIFO, LIFO, and weighted average, then explain why none proves the physical units sold.",
  },
  {
    id: 12,
    title: "Long-term assets",
    focus: ["Capitalize versus expense", "Depreciable cost", "Depreciation as allocation"],
    learningProblemKind: "distinction",
    misconception: {
      lure: "Depreciation reports how much the asset's market price fell this year.",
      correction: "Depreciation systematically allocates recorded cost over useful periods; it is not a recurring appraisal of market value.",
    },
    teachingPlan: ["compare-table", "worked-example", "error-analysis"],
    diagnosticStem: "Compute straight-line depreciation from cost, residual value, and useful life, then explain what the resulting book value does—and does not—mean.",
  },
  {
    id: 13,
    title: "Liabilities",
    focus: ["Current liabilities", "Long-term liabilities", "Current portion of long-term debt"],
    learningProblemKind: "fact",
    misconception: {
      lure: "A note originally issued for several years is entirely long term until its final payment.",
      correction: "The amount due within the operating cycle or next year is current even when the remaining obligation is long term.",
    },
    teachingPlan: ["retrieval-practice", "one-event-classification"],
    diagnosticStem: "A five-year note has principal due in the next twelve months. Which amount is current, and which remains long term?",
  },
  {
    id: 14,
    title: "Equity",
    focus: ["Common stock", "Retained earnings", "Dividends"],
    learningProblemKind: "distinction",
    misconception: {
      lure: "Dividends are an operating expense.",
      correction: "Dividends distribute equity to owners; they reduce retained earnings but are not an expense used to calculate net income.",
    },
    teachingPlan: ["compare-table", "statement-articulation", "independent-transfer"],
    diagnosticStem: "Trace net income and a dividend through retained earnings and the balance sheet without placing the dividend in operating expenses.",
  },
  {
    id: 15,
    title: "Cash flows",
    focus: ["Operating activities", "Investing activities", "Financing activities"],
    learningProblemKind: "distinction",
    misconception: {
      lure: "Borrowing money is an operating cash inflow because cash increased.",
      correction: "Classification follows why cash moved: borrowing and owner transactions are financing, long-lived asset transactions are investing, and core business cash is generally operating.",
    },
    teachingPlan: ["compare-table", "one-event-classification", "interleaved-practice"],
    diagnosticStem: "Classify cash received from a bank loan and contrast it with cash collected from a customer and cash paid for equipment.",
  },
] as const satisfies readonly Acct2010Unit[];

export const ACCT_2010_MATERIALS = {
  ebook: {
    id: "phillips-ffa-8e-ebook",
    label: "Phillips Fundamentals of Financial Accounting 8e",
    format: "ebook",
    identifiers: [{ scheme: "ISBN-13", value: "9781265052362" }],
    usePolicy: "metadata-only-do-not-ingest",
  },
  connect: {
    id: "connect-access",
    label: "Connect access",
    format: "course-platform",
    identifiers: [{ scheme: "ISBN-13", value: "9781265560072" }],
    usePolicy: "metadata-only-do-not-ingest",
  },
  examind: {
    id: "examind-access",
    label: "EXAMIND access",
    format: "course-platform",
    identifiers: [{ scheme: "BARCODE", value: "2810000065613" }],
    usePolicy: "metadata-only-do-not-ingest",
  },
} as const;

type Acct2010MaterialId = keyof typeof ACCT_2010_MATERIALS;

export type Acct2010ProfessorScope =
  | { status: "unconfirmed"; excludedUnitIds: readonly [] }
  | {
      status: "confirmed";
      confirmationSource: "student-syllabus" | "student-confirmation";
      excludedUnitIds: readonly (14 | 15)[];
    };

export interface Acct2010SectionOverlay {
  sectionId: string;
  crn: string;
  instructor: string;
  materialIds: readonly Acct2010MaterialId[];
  professorScope: Acct2010ProfessorScope;
}

const UNCONFIRMED_SCOPE = {
  status: "unconfirmed",
  excludedUnitIds: [],
} as const satisfies Acct2010ProfessorScope;

export const ACCT_2010_FALL_2026_SECTIONS = [
  { sectionId: "002", crn: "40016", instructor: "Erickson, Devon", materialIds: ["examind"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "003", crn: "40015", instructor: "Shuai", materialIds: ["examind", "connect"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "004", crn: "42109", instructor: "Webster", materialIds: ["examind", "ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "005", crn: "40021", instructor: "Wilkey, Lacee", materialIds: ["examind", "connect"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "006", crn: "42110", instructor: "Campbell", materialIds: ["ebook", "examind"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "007", crn: "40019", instructor: "Shuai", materialIds: ["examind", "connect"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "008", crn: "40020", instructor: "Campbell", materialIds: ["ebook", "examind"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "009", crn: "40018", instructor: "Simon", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "011", crn: "47792", instructor: "Erickson, Devon", materialIds: ["examind"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "AB1", crn: "48146", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "BB1", crn: "48147", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "CB1", crn: "49362", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "EB1", crn: "49363", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "KB1", crn: "48148", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "MB1", crn: "48006", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "PB1", crn: "49365", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "TB1", crn: "49368", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "UB1", crn: "43501", instructor: "Hunt, Rhett", materialIds: ["ebook"], professorScope: UNCONFIRMED_SCOPE },
  { sectionId: "IO1", crn: "43285", instructor: "Wilkey, Lacee", materialIds: ["examind"], professorScope: UNCONFIRMED_SCOPE },
] as const satisfies readonly Acct2010SectionOverlay[];

export const ACCT_2010_LEARNING_MAP_V0 = {
  schemaVersion: "acct-2010-learning-map-v0",
  courseCode: "ACCT 2010",
  stable: {
    authority: "campus-companion-original",
    units: ACCT_2010_STABLE_UNITS,
    contentPolicy: "original-teaching-copy-only",
  },
  usu: {
    institution: "Utah State University",
    progressionRequirement: {
      scope: "Huntsman program progression",
      minimumGrade: "B",
      statement: "The relevant Huntsman progression requires a grade of B or better in ACCT 2010.",
    },
    programGoalReferences: [{ code: "AoL L1.1", level: "program", wording: null }],
    courseLearningObjectives: { status: "unknown", items: [] },
  },
  professor: {
    term: "Fall 2026",
    sourceKind: "campus-store-adoption-metadata",
    materials: ACCT_2010_MATERIALS,
    sections: ACCT_2010_FALL_2026_SECTIONS,
    oerStatus: "none-in-fetched-store-rows",
    contentPolicy: "metadata-only-do-not-ingest",
  },
} as const;

export function unitsForConfirmedProfessorScope(
  scope: Acct2010ProfessorScope = UNCONFIRMED_SCOPE,
): readonly Acct2010Unit[] {
  if (scope.status !== "confirmed") return ACCT_2010_STABLE_UNITS;
  const excluded = new Set<number>(scope.excludedUnitIds);
  for (const unitId of excluded) {
    if (unitId !== 14 && unitId !== 15) {
      throw new Error("Only units 14 and 15 may be excluded by the launch professor overlay");
    }
  }
  return ACCT_2010_STABLE_UNITS.filter((unit) => !excluded.has(unit.id));
}

export function acct2010SectionOverlay(sectionId: string): Acct2010SectionOverlay | null {
  return ACCT_2010_FALL_2026_SECTIONS.find((section) => section.sectionId === sectionId) ?? null;
}
