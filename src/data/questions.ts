export interface StudyQuestion {
  id: string;
  classId: string;
  topic: string;
  type: "flashcard" | "multiple-choice" | "fill-blank" | "true-false" | "matching";
  prompt: string;
  answer: string;
  choices?: string[];
  matchPairs?: { term: string; definition: string }[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
}

export type StudyMode = "flashcards" | "multiple-choice" | "fill-blank" | "true-false" | "matching" | "timed-challenge";

export interface StudySessionState {
  sessionId: string;
  classId: string;
  topic: string;
  mode: StudyMode;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  questions: StudyQuestion[];
  totalQuestions: number;
  currentIndex: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  answers: { questionId: string; correct: boolean | null; userAnswer: string }[];
  startTime: number;
  endTime: number | null;
  durationLimit: number | null; // seconds, for timed challenge
}

export function getTopicsForClass(classId: string): string[] {
  const topicMap: Record<string, string[]> = {
    psych101: ["Memory", "Learning", "Encoding", "Retrieval Cues"],
    bio200: ["Cell Division", "Mitosis", "Cytokinesis", "Genetics"],
    eng102: ["Thesis Statements", "Argumentative Essays", "Evidence", "MLA Format"],
    math150: ["Polynomial Functions", "Quadratic Formula", "Graphing", "Roots & Zeros"],
  };
  return topicMap[classId] || [];
}

// ── Psychology Questions ──
const psychQuestions: StudyQuestion[] = [
  // Flashcards
  { id: "pf1", classId: "psych101", topic: "Memory", type: "flashcard", prompt: "What is the multi-store model of memory?", answer: "A model proposing three memory stores: sensory, short-term, and long-term memory, with information flowing linearly between them.", explanation: "Proposed by Atkinson & Shiffrin (1968).", difficulty: "easy" },
  { id: "pf2", classId: "psych101", topic: "Memory", type: "flashcard", prompt: "What is the capacity of short-term memory?", answer: "About 7 items (±2), lasting 20–30 seconds without rehearsal.", explanation: "Known as Miller's Magic Number.", difficulty: "easy" },
  { id: "pf3", classId: "psych101", topic: "Encoding", type: "flashcard", prompt: "What are the three types of encoding?", answer: "Visual (images), acoustic (sounds), and semantic (meaning).", explanation: "Semantic encoding produces the strongest long-term memories.", difficulty: "medium" },
  { id: "pf4", classId: "psych101", topic: "Retrieval Cues", type: "flashcard", prompt: "What is context-dependent memory?", answer: "The phenomenon where recall is better when the retrieval context matches the encoding context.", explanation: "Example: studying in the same room where you'll take the test.", difficulty: "medium" },
  { id: "pf5", classId: "psych101", topic: "Memory", type: "flashcard", prompt: "What is sensory memory?", answer: "A brief storage system that holds raw sensory information for less than a second (visual) or a few seconds (auditory).", explanation: "Iconic memory = visual, echoic memory = auditory.", difficulty: "easy" },
  { id: "pf6", classId: "psych101", topic: "Learning", type: "flashcard", prompt: "What is classical conditioning?", answer: "A learning process where a neutral stimulus becomes associated with a meaningful stimulus to produce a learned response.", explanation: "Pavlov's dog experiments are the classic example.", difficulty: "easy" },
  { id: "pf7", classId: "psych101", topic: "Learning", type: "flashcard", prompt: "What is operant conditioning?", answer: "Learning through consequences — behaviors followed by reinforcement increase, those followed by punishment decrease.", explanation: "Developed by B.F. Skinner.", difficulty: "medium" },
  { id: "pf8", classId: "psych101", topic: "Memory", type: "flashcard", prompt: "What is the difference between recall and recognition?", answer: "Recall requires generating information from memory; recognition involves identifying previously learned information from options.", explanation: "Fill-in-the-blank tests recall; multiple choice tests recognition.", difficulty: "medium" },
  { id: "pf9", classId: "psych101", topic: "Encoding", type: "flashcard", prompt: "What is elaborative rehearsal?", answer: "A deep processing strategy that involves connecting new information to existing knowledge for better encoding.", explanation: "More effective than maintenance rehearsal (simple repetition).", difficulty: "hard" },
  { id: "pf10", classId: "psych101", topic: "Retrieval Cues", type: "flashcard", prompt: "What is the tip-of-the-tongue phenomenon?", answer: "The feeling of knowing something but being temporarily unable to retrieve it from memory.", explanation: "Demonstrates that memories are stored but retrieval can fail.", difficulty: "easy" },
  { id: "pf11", classId: "psych101", topic: "Memory", type: "flashcard", prompt: "What is long-term potentiation (LTP)?", answer: "A long-lasting strengthening of synaptic connections that is believed to be the neural basis of learning and memory.", explanation: "Occurs in the hippocampus.", difficulty: "hard" },
  { id: "pf12", classId: "psych101", topic: "Learning", type: "flashcard", prompt: "What is observational learning?", answer: "Learning by watching others' behaviors and their consequences.", explanation: "Bandura's Bobo doll experiment demonstrated this.", difficulty: "easy" },

  // Multiple Choice
  { id: "pm1", classId: "psych101", topic: "Memory", type: "multiple-choice", prompt: "Which memory store has the largest capacity?", answer: "Long-term memory", choices: ["Sensory memory", "Short-term memory", "Long-term memory", "Working memory"], explanation: "Long-term memory has essentially unlimited capacity and duration.", difficulty: "easy" },
  { id: "pm2", classId: "psych101", topic: "Encoding", type: "multiple-choice", prompt: "Which type of encoding leads to the strongest memory traces?", answer: "Semantic encoding", choices: ["Visual encoding", "Acoustic encoding", "Semantic encoding", "Structural encoding"], explanation: "Encoding based on meaning creates deeper, more durable memories.", difficulty: "medium" },
  { id: "pm3", classId: "psych101", topic: "Memory", type: "multiple-choice", prompt: "Miller's Magic Number refers to:", answer: "The capacity of short-term memory (7±2 items)", choices: ["The number of memory systems", "The capacity of short-term memory (7±2 items)", "The duration of sensory memory", "The age memory peaks"], explanation: "George Miller (1956) found STM holds about 7 items.", difficulty: "easy" },
  { id: "pm4", classId: "psych101", topic: "Learning", type: "multiple-choice", prompt: "In classical conditioning, the unconditioned stimulus:", answer: "Naturally triggers a response without learning", choices: ["Is learned through repetition", "Naturally triggers a response without learning", "Only works after conditioning", "Is always a sound"], explanation: "The UCS produces an automatic response (UCR) without prior learning.", difficulty: "medium" },
  { id: "pm5", classId: "psych101", topic: "Learning", type: "multiple-choice", prompt: "Positive reinforcement involves:", answer: "Adding a desirable stimulus to increase behavior", choices: ["Removing a desirable stimulus", "Adding a desirable stimulus to increase behavior", "Adding an unpleasant stimulus", "Removing an unpleasant stimulus"], explanation: "Positive = adding; reinforcement = increasing behavior.", difficulty: "easy" },
  { id: "pm6", classId: "psych101", topic: "Retrieval Cues", type: "multiple-choice", prompt: "State-dependent memory suggests:", answer: "Recall improves when internal state at retrieval matches encoding", choices: ["Location affects memory", "Recall improves when internal state at retrieval matches encoding", "Memories are stored in states", "Sleep improves memory"], explanation: "Your mood or physiological state acts as a retrieval cue.", difficulty: "hard" },
  { id: "pm7", classId: "psych101", topic: "Memory", type: "multiple-choice", prompt: "The hippocampus is primarily involved in:", answer: "Forming new explicit memories", choices: ["Motor skills", "Forming new explicit memories", "Emotional responses", "Language production"], explanation: "Damage to the hippocampus impairs formation of new declarative memories.", difficulty: "medium" },
  { id: "pm8", classId: "psych101", topic: "Memory", type: "multiple-choice", prompt: "Retrograde amnesia involves:", answer: "Inability to recall memories formed before the amnesia", choices: ["Inability to form new memories", "Inability to recall memories formed before the amnesia", "Forgetting how to perform skills", "Temporary memory loss during sleep"], explanation: "Retro = backward; affects past memories.", difficulty: "medium" },
  { id: "pm9", classId: "psych101", topic: "Encoding", type: "multiple-choice", prompt: "Chunking is a strategy that:", answer: "Groups individual items into larger meaningful units", choices: ["Repeats information quickly", "Groups individual items into larger meaningful units", "Connects new info to images", "Uses rhymes for memorization"], explanation: "Chunking expands the effective capacity of short-term memory.", difficulty: "easy" },
  { id: "pm10", classId: "psych101", topic: "Learning", type: "multiple-choice", prompt: "Who demonstrated observational learning with the Bobo doll experiment?", answer: "Albert Bandura", choices: ["B.F. Skinner", "Ivan Pavlov", "Albert Bandura", "John Watson"], explanation: "Bandura showed children imitate aggressive behavior they observe.", difficulty: "easy" },
  { id: "pm11", classId: "psych101", topic: "Memory", type: "multiple-choice", prompt: "Which of the following is an example of procedural memory?", answer: "Riding a bicycle", choices: ["Remembering your birthday", "Riding a bicycle", "Knowing the capital of France", "Recalling what you ate yesterday"], explanation: "Procedural memory is implicit memory for skills and habits.", difficulty: "easy" },
  { id: "pm12", classId: "psych101", topic: "Retrieval Cues", type: "multiple-choice", prompt: "The serial position effect predicts that:", answer: "Items at the beginning and end of a list are recalled best", choices: ["All items are recalled equally", "Middle items are recalled best", "Items at the beginning and end of a list are recalled best", "Shorter lists are always recalled better"], explanation: "Primacy effect (beginning) + recency effect (end).", difficulty: "medium" },

  // Fill in the Blank
  { id: "pfb1", classId: "psych101", topic: "Memory", type: "fill-blank", prompt: "The multi-store model proposes three stores: sensory, short-term, and _____ memory.", answer: "long-term", explanation: "Long-term memory is the final store with unlimited capacity.", difficulty: "easy" },
  { id: "pfb2", classId: "psych101", topic: "Memory", type: "fill-blank", prompt: "Short-term memory can hold about _____ items (±2).", answer: "7", explanation: "Miller's Magic Number from George Miller's 1956 research.", difficulty: "easy" },
  { id: "pfb3", classId: "psych101", topic: "Encoding", type: "fill-blank", prompt: "_____ encoding, based on meaning, creates the strongest memories.", answer: "semantic", explanation: "Deeper processing = better retention.", difficulty: "medium" },
  { id: "pfb4", classId: "psych101", topic: "Retrieval Cues", type: "fill-blank", prompt: "_____ -dependent memory means recall improves in the same environment.", answer: "context", explanation: "The physical environment serves as a retrieval cue.", difficulty: "medium" },
  { id: "pfb5", classId: "psych101", topic: "Learning", type: "fill-blank", prompt: "In _____ conditioning, a neutral stimulus becomes associated with an unconditioned stimulus.", answer: "classical", explanation: "Discovered by Ivan Pavlov.", difficulty: "easy" },
  { id: "pfb6", classId: "psych101", topic: "Learning", type: "fill-blank", prompt: "B.F. Skinner is associated with _____ conditioning.", answer: "operant", explanation: "Learning through reinforcement and punishment.", difficulty: "easy" },
  { id: "pfb7", classId: "psych101", topic: "Memory", type: "fill-blank", prompt: "The _____ is the brain region most critical for forming new explicit memories.", answer: "hippocampus", explanation: "Part of the limbic system.", difficulty: "medium" },
  { id: "pfb8", classId: "psych101", topic: "Memory", type: "fill-blank", prompt: "_____ memory is our memory for personal experiences and events.", answer: "episodic", explanation: "A type of explicit/declarative memory.", difficulty: "medium" },
  { id: "pfb9", classId: "psych101", topic: "Encoding", type: "fill-blank", prompt: "Grouping items into meaningful units to improve memory is called _____.", answer: "chunking", explanation: "Helps overcome the 7±2 limit of STM.", difficulty: "easy" },
  { id: "pfb10", classId: "psych101", topic: "Learning", type: "fill-blank", prompt: "Learning by watching others is called _____ learning.", answer: "observational", explanation: "Also known as social learning, studied by Bandura.", difficulty: "easy" },
  { id: "pfb11", classId: "psych101", topic: "Memory", type: "fill-blank", prompt: "The inability to form new memories is called _____ amnesia.", answer: "anterograde", explanation: "Antero = forward; can't form new memories going forward.", difficulty: "hard" },
  { id: "pfb12", classId: "psych101", topic: "Retrieval Cues", type: "fill-blank", prompt: "The primacy and recency effects together form the _____ position effect.", answer: "serial", explanation: "First and last items in a list are remembered best.", difficulty: "medium" },

  // True/False
  { id: "ptf1", classId: "psych101", topic: "Memory", type: "true-false", prompt: "Short-term memory has unlimited capacity.", answer: "false", explanation: "STM holds about 7±2 items. Long-term memory has unlimited capacity.", difficulty: "easy" },
  { id: "ptf2", classId: "psych101", topic: "Encoding", type: "true-false", prompt: "Semantic encoding is more effective than acoustic encoding for long-term retention.", answer: "true", explanation: "Processing meaning creates deeper, more durable memory traces.", difficulty: "easy" },
  { id: "ptf3", classId: "psych101", topic: "Learning", type: "true-false", prompt: "In operant conditioning, negative reinforcement means punishment.", answer: "false", explanation: "Negative reinforcement removes an unpleasant stimulus to increase behavior. Punishment decreases behavior.", difficulty: "medium" },
  { id: "ptf4", classId: "psych101", topic: "Memory", type: "true-false", prompt: "The hippocampus is essential for forming new explicit memories.", answer: "true", explanation: "Damage to the hippocampus severely impairs new memory formation.", difficulty: "medium" },
  { id: "ptf5", classId: "psych101", topic: "Retrieval Cues", type: "true-false", prompt: "Context-dependent memory means your physical location can serve as a retrieval cue.", answer: "true", explanation: "Recall is better when the retrieval environment matches the encoding environment.", difficulty: "easy" },
  { id: "ptf6", classId: "psych101", topic: "Learning", type: "true-false", prompt: "Albert Bandura is famous for classical conditioning experiments.", answer: "false", explanation: "Bandura is known for observational/social learning theory (Bobo doll experiment). Pavlov pioneered classical conditioning.", difficulty: "easy" },
  { id: "ptf7", classId: "psych101", topic: "Memory", type: "true-false", prompt: "Procedural memory is a type of explicit memory.", answer: "false", explanation: "Procedural memory (skills, habits) is implicit. Explicit memory includes episodic and semantic.", difficulty: "medium" },
  { id: "ptf8", classId: "psych101", topic: "Memory", type: "true-false", prompt: "Iconic memory refers to brief visual sensory memory.", answer: "true", explanation: "Iconic = visual sensory memory; echoic = auditory sensory memory.", difficulty: "easy" },
  { id: "ptf9", classId: "psych101", topic: "Encoding", type: "true-false", prompt: "Maintenance rehearsal is the most effective way to transfer information to long-term memory.", answer: "false", explanation: "Elaborative rehearsal (connecting to meaning) is more effective than simple repetition.", difficulty: "medium" },
  { id: "ptf10", classId: "psych101", topic: "Learning", type: "true-false", prompt: "Extinction in classical conditioning means the conditioned response gradually disappears.", answer: "true", explanation: "When the CS is repeatedly presented without the UCS, the CR weakens.", difficulty: "medium" },
  { id: "ptf11", classId: "psych101", topic: "Memory", type: "true-false", prompt: "Retrograde amnesia affects the ability to form new memories.", answer: "false", explanation: "Retrograde amnesia affects past memories. Anterograde amnesia affects new memory formation.", difficulty: "medium" },
  { id: "ptf12", classId: "psych101", topic: "Retrieval Cues", type: "true-false", prompt: "Recognition is generally easier than recall.", answer: "true", explanation: "Recognition provides cues (like in multiple choice), while recall requires generating information.", difficulty: "easy" },

  // Matching
  { id: "pma1", classId: "psych101", topic: "Memory", type: "matching", prompt: "Match memory concepts", answer: "", matchPairs: [
    { term: "Sensory memory", definition: "Holds raw info for < 1 second" },
    { term: "Short-term memory", definition: "7±2 items for 20-30 seconds" },
    { term: "Long-term memory", definition: "Unlimited capacity and duration" },
    { term: "Working memory", definition: "Active manipulation of information" },
    { term: "Episodic memory", definition: "Personal experiences and events" },
    { term: "Semantic memory", definition: "General knowledge and facts" },
    { term: "Procedural memory", definition: "Skills and habits" },
    { term: "Iconic memory", definition: "Brief visual sensory store" },
  ], explanation: "These are the main memory types and stores in cognitive psychology.", difficulty: "medium" },
];

// ── Biology Questions ──
const bioQuestions: StudyQuestion[] = [
  // Flashcards
  { id: "bf1", classId: "bio200", topic: "Cell Division", type: "flashcard", prompt: "What is mitosis?", answer: "A type of cell division that produces two genetically identical daughter cells from a single parent cell.", explanation: "Used for growth, repair, and asexual reproduction.", difficulty: "easy" },
  { id: "bf2", classId: "bio200", topic: "Mitosis", type: "flashcard", prompt: "What are the four phases of mitosis?", answer: "Prophase, metaphase, anaphase, and telophase.", explanation: "Remember: PMAT.", difficulty: "easy" },
  { id: "bf3", classId: "bio200", topic: "Cytokinesis", type: "flashcard", prompt: "What is cytokinesis?", answer: "The division of the cytoplasm that follows nuclear division, resulting in two separate cells.", explanation: "In animal cells: cleavage furrow. In plant cells: cell plate.", difficulty: "easy" },
  { id: "bf4", classId: "bio200", topic: "Genetics", type: "flashcard", prompt: "What is a genotype?", answer: "The genetic makeup of an organism — the specific alleles it carries.", explanation: "Example: Bb is a genotype for a heterozygous trait.", difficulty: "easy" },
  { id: "bf5", classId: "bio200", topic: "Genetics", type: "flashcard", prompt: "What is the difference between dominant and recessive alleles?", answer: "Dominant alleles are expressed when one or two copies are present; recessive alleles are only expressed when two copies are present.", explanation: "Dominant = uppercase (B), recessive = lowercase (b).", difficulty: "medium" },
  { id: "bf6", classId: "bio200", topic: "Mitosis", type: "flashcard", prompt: "What happens during prophase?", answer: "Chromatin condenses into visible chromosomes, the nuclear envelope begins to break down, and the spindle apparatus forms.", explanation: "Pro = first. The first visible phase of mitosis.", difficulty: "medium" },
  { id: "bf7", classId: "bio200", topic: "Mitosis", type: "flashcard", prompt: "What happens during metaphase?", answer: "Chromosomes align at the cell's equator (metaphase plate) attached to spindle fibers at their centromeres.", explanation: "Meta = middle. Chromosomes line up in the middle.", difficulty: "medium" },
  { id: "bf8", classId: "bio200", topic: "Cell Division", type: "flashcard", prompt: "What is the cell cycle?", answer: "The ordered sequence of events (G1, S, G2, and M phase) that a cell goes through from one division to the next.", explanation: "Most of the cell cycle is spent in interphase.", difficulty: "easy" },
  { id: "bf9", classId: "bio200", topic: "Genetics", type: "flashcard", prompt: "What is a Punnett square?", answer: "A diagram used to predict the probability of offspring genotypes from a genetic cross.", explanation: "Shows all possible allele combinations.", difficulty: "easy" },
  { id: "bf10", classId: "bio200", topic: "Cytokinesis", type: "flashcard", prompt: "How does cytokinesis differ in plant and animal cells?", answer: "Animal cells form a cleavage furrow that pinches inward. Plant cells build a cell plate from the center outward.", explanation: "Plant cells have rigid cell walls, so they can't pinch.", difficulty: "medium" },
  { id: "bf11", classId: "bio200", topic: "Cell Division", type: "flashcard", prompt: "What is meiosis?", answer: "A type of cell division that produces four genetically unique haploid cells from one diploid cell.", explanation: "Used for producing gametes (sex cells).", difficulty: "medium" },
  { id: "bf12", classId: "bio200", topic: "Genetics", type: "flashcard", prompt: "What is phenotype?", answer: "The observable physical characteristics of an organism resulting from its genotype and environment.", explanation: "Example: brown eyes, tall height.", difficulty: "easy" },

  // Multiple Choice
  { id: "bm1", classId: "bio200", topic: "Mitosis", type: "multiple-choice", prompt: "During which phase do chromosomes line up at the cell's equator?", answer: "Metaphase", choices: ["Prophase", "Metaphase", "Anaphase", "Telophase"], explanation: "Meta = middle. Chromosomes align at the metaphase plate.", difficulty: "easy" },
  { id: "bm2", classId: "bio200", topic: "Mitosis", type: "multiple-choice", prompt: "Sister chromatids are pulled apart during:", answer: "Anaphase", choices: ["Prophase", "Metaphase", "Anaphase", "Telophase"], explanation: "Ana = apart. Spindle fibers shorten and pull chromatids to opposite poles.", difficulty: "easy" },
  { id: "bm3", classId: "bio200", topic: "Cell Division", type: "multiple-choice", prompt: "DNA replication occurs during which phase of the cell cycle?", answer: "S phase (Synthesis)", choices: ["G1 phase", "S phase (Synthesis)", "G2 phase", "M phase"], explanation: "S = Synthesis. DNA is copied so each chromosome has two sister chromatids.", difficulty: "medium" },
  { id: "bm4", classId: "bio200", topic: "Genetics", type: "multiple-choice", prompt: "If a Bb parent crosses with a bb parent, what percentage of offspring are expected to be homozygous recessive?", answer: "50%", choices: ["25%", "50%", "75%", "100%"], explanation: "Bb × bb → Bb, Bb, bb, bb. Half are bb.", difficulty: "medium" },
  { id: "bm5", classId: "bio200", topic: "Cytokinesis", type: "multiple-choice", prompt: "In plant cells, cytokinesis involves the formation of a:", answer: "Cell plate", choices: ["Cleavage furrow", "Cell plate", "Spindle fiber", "Nuclear envelope"], explanation: "Vesicles fuse at the center to build the cell plate, which becomes the new cell wall.", difficulty: "easy" },
  { id: "bm6", classId: "bio200", topic: "Cell Division", type: "multiple-choice", prompt: "How many daughter cells are produced by mitosis?", answer: "2", choices: ["1", "2", "4", "8"], explanation: "Mitosis produces 2 identical diploid daughter cells.", difficulty: "easy" },
  { id: "bm7", classId: "bio200", topic: "Genetics", type: "multiple-choice", prompt: "A heterozygous organism has:", answer: "Two different alleles for a trait", choices: ["Two identical alleles", "Two different alleles for a trait", "Only dominant alleles", "Only recessive alleles"], explanation: "Hetero = different. Example: Bb.", difficulty: "easy" },
  { id: "bm8", classId: "bio200", topic: "Mitosis", type: "multiple-choice", prompt: "The nuclear envelope re-forms during:", answer: "Telophase", choices: ["Prophase", "Metaphase", "Anaphase", "Telophase"], explanation: "Telo = end. The nucleus reforms around each set of chromosomes.", difficulty: "medium" },
  { id: "bm9", classId: "bio200", topic: "Cell Division", type: "multiple-choice", prompt: "Cancer is primarily a disease of uncontrolled:", answer: "Cell division", choices: ["Protein synthesis", "Cell division", "Cell death", "DNA transcription"], explanation: "Cancer cells bypass normal cell cycle checkpoints.", difficulty: "easy" },
  { id: "bm10", classId: "bio200", topic: "Genetics", type: "multiple-choice", prompt: "Mendel's law of segregation states that:", answer: "Allele pairs separate during gamete formation", choices: ["Genes on different chromosomes sort independently", "Allele pairs separate during gamete formation", "Dominant alleles eliminate recessive ones", "All traits are inherited together"], explanation: "Each gamete receives only one allele from each pair.", difficulty: "medium" },

  // Fill in the Blank
  { id: "bfb1", classId: "bio200", topic: "Mitosis", type: "fill-blank", prompt: "The four phases of mitosis are prophase, metaphase, anaphase, and _____.", answer: "telophase", explanation: "PMAT — the order of mitotic phases.", difficulty: "easy" },
  { id: "bfb2", classId: "bio200", topic: "Cytokinesis", type: "fill-blank", prompt: "In animal cells, a _____ furrow forms during cytokinesis.", answer: "cleavage", explanation: "A contractile ring of actin filaments pinches the cell in two.", difficulty: "easy" },
  { id: "bfb3", classId: "bio200", topic: "Cell Division", type: "fill-blank", prompt: "DNA is replicated during the _____ phase of interphase.", answer: "S", explanation: "S = Synthesis phase.", difficulty: "medium" },
  { id: "bfb4", classId: "bio200", topic: "Genetics", type: "fill-blank", prompt: "An organism with two identical alleles (AA or aa) is called _____.", answer: "homozygous", explanation: "Homo = same. Both alleles are the same.", difficulty: "easy" },
  { id: "bfb5", classId: "bio200", topic: "Mitosis", type: "fill-blank", prompt: "During _____, chromatin condenses into visible chromosomes.", answer: "prophase", explanation: "Pro = first. The first visible phase.", difficulty: "easy" },
  { id: "bfb6", classId: "bio200", topic: "Cell Division", type: "fill-blank", prompt: "Meiosis produces _____ haploid daughter cells.", answer: "4", explanation: "Meiosis I and II together produce 4 unique haploid cells.", difficulty: "easy" },
  { id: "bfb7", classId: "bio200", topic: "Genetics", type: "fill-blank", prompt: "A _____ square is used to predict offspring genotypes.", answer: "Punnett", explanation: "Named after Reginald Punnett.", difficulty: "easy" },
  { id: "bfb8", classId: "bio200", topic: "Mitosis", type: "fill-blank", prompt: "Sister chromatids are joined at the _____.", answer: "centromere", explanation: "Spindle fibers attach at the centromere via kinetochores.", difficulty: "medium" },
  { id: "bfb9", classId: "bio200", topic: "Cell Division", type: "fill-blank", prompt: "The _____ is a structure made of microtubules that separates chromosomes during division.", answer: "spindle", explanation: "Also called the mitotic spindle or spindle apparatus.", difficulty: "medium" },
  { id: "bfb10", classId: "bio200", topic: "Genetics", type: "fill-blank", prompt: "The observable characteristics of an organism are called its _____.", answer: "phenotype", explanation: "Phenotype is influenced by genotype and environment.", difficulty: "easy" },

  // True/False
  { id: "btf1", classId: "bio200", topic: "Cell Division", type: "true-false", prompt: "Mitosis produces genetically identical daughter cells.", answer: "true", explanation: "Both daughter cells are diploid clones of the parent cell.", difficulty: "easy" },
  { id: "btf2", classId: "bio200", topic: "Cytokinesis", type: "true-false", prompt: "Plant cells form a cleavage furrow during cytokinesis.", answer: "false", explanation: "Plant cells form a cell plate. Animal cells form a cleavage furrow.", difficulty: "easy" },
  { id: "btf3", classId: "bio200", topic: "Genetics", type: "true-false", prompt: "A recessive allele is always expressed in heterozygous organisms.", answer: "false", explanation: "In heterozygous organisms (Bb), only the dominant allele is expressed.", difficulty: "easy" },
  { id: "btf4", classId: "bio200", topic: "Mitosis", type: "true-false", prompt: "Chromosomes are most visible during metaphase.", answer: "true", explanation: "Chromosomes are maximally condensed and aligned, making them easiest to observe.", difficulty: "medium" },
  { id: "btf5", classId: "bio200", topic: "Cell Division", type: "true-false", prompt: "Interphase is part of mitosis.", answer: "false", explanation: "Interphase is the period between divisions. Mitosis is only the M phase.", difficulty: "medium" },
  { id: "btf6", classId: "bio200", topic: "Genetics", type: "true-false", prompt: "Meiosis produces cells with half the chromosome number of the parent cell.", answer: "true", explanation: "Meiosis creates haploid (n) cells from a diploid (2n) parent.", difficulty: "easy" },
  { id: "btf7", classId: "bio200", topic: "Mitosis", type: "true-false", prompt: "The spindle apparatus is made of microtubules.", answer: "true", explanation: "Microtubules extend from the centrioles to attach to chromosomes.", difficulty: "easy" },
  { id: "btf8", classId: "bio200", topic: "Cell Division", type: "true-false", prompt: "Cancer cells typically have normal cell cycle checkpoints.", answer: "false", explanation: "Cancer cells have mutations that disable checkpoints, allowing uncontrolled division.", difficulty: "medium" },
  { id: "btf9", classId: "bio200", topic: "Cytokinesis", type: "true-false", prompt: "Cytokinesis always occurs immediately after mitosis.", answer: "true", explanation: "Cytokinesis typically begins during late anaphase/telophase.", difficulty: "medium" },
  { id: "btf10", classId: "bio200", topic: "Genetics", type: "true-false", prompt: "Mendel used pea plants in his genetics experiments.", answer: "true", explanation: "Pisum sativum — garden peas were ideal due to distinct, heritable traits.", difficulty: "easy" },

  // Matching
  { id: "bma1", classId: "bio200", topic: "Mitosis", type: "matching", prompt: "Match mitosis phases to events", answer: "", matchPairs: [
    { term: "Prophase", definition: "Chromatin condenses, nuclear envelope breaks down" },
    { term: "Metaphase", definition: "Chromosomes align at the equator" },
    { term: "Anaphase", definition: "Sister chromatids pulled to opposite poles" },
    { term: "Telophase", definition: "Nuclear envelope reforms, chromosomes decondense" },
    { term: "Cytokinesis", definition: "Cytoplasm divides into two cells" },
    { term: "Interphase", definition: "Cell grows and DNA is replicated" },
    { term: "S Phase", definition: "DNA synthesis occurs" },
    { term: "G1 Phase", definition: "Cell growth before DNA replication" },
  ], explanation: "Understanding the order and events of cell division is essential.", difficulty: "medium" },
];

// ── English Questions ──
const engQuestions: StudyQuestion[] = [
  // Flashcards
  { id: "ef1", classId: "eng102", topic: "Thesis Statements", type: "flashcard", prompt: "What makes a strong thesis statement?", answer: "A strong thesis takes a clear, specific, debatable position on a topic and provides a roadmap for the essay.", explanation: "It should be arguable — someone could reasonably disagree.", difficulty: "easy" },
  { id: "ef2", classId: "eng102", topic: "Argumentative Essays", type: "flashcard", prompt: "What is a counterargument?", answer: "An opposing viewpoint to your thesis that you acknowledge and then refute in your essay.", explanation: "Addressing counterarguments strengthens your credibility.", difficulty: "easy" },
  { id: "ef3", classId: "eng102", topic: "Evidence", type: "flashcard", prompt: "What are credible sources?", answer: "Peer-reviewed journals, academic books, reputable news outlets, and expert analyses — not blogs, Wikipedia, or random websites.", explanation: "Always evaluate source authority, currency, and bias.", difficulty: "easy" },
  { id: "ef4", classId: "eng102", topic: "MLA Format", type: "flashcard", prompt: "What is an in-text citation in MLA?", answer: "A parenthetical reference including the author's last name and page number, placed before the period: (Smith 45).", explanation: "MLA uses author-page style, not footnotes.", difficulty: "medium" },
  { id: "ef5", classId: "eng102", topic: "Argumentative Essays", type: "flashcard", prompt: "What is a rebuttal?", answer: "Your response to a counterargument, explaining why your position is still stronger despite the opposing view.", explanation: "A good rebuttal acknowledges the counterpoint before dismantling it.", difficulty: "medium" },
  { id: "ef6", classId: "eng102", topic: "Thesis Statements", type: "flashcard", prompt: "What is the difference between a topic and a thesis?", answer: "A topic is a subject area; a thesis is your specific argument or claim about that topic.", explanation: "Topic: social media. Thesis: Social media harms teen mental health.", difficulty: "easy" },
  { id: "ef7", classId: "eng102", topic: "Evidence", type: "flashcard", prompt: "What is the difference between quoting and paraphrasing?", answer: "Quoting uses the exact words in quotation marks; paraphrasing restates ideas in your own words. Both require citation.", explanation: "Paraphrasing shows deeper understanding.", difficulty: "medium" },
  { id: "ef8", classId: "eng102", topic: "MLA Format", type: "flashcard", prompt: "What goes on the Works Cited page?", answer: "An alphabetized list of all sources cited in the paper, formatted according to MLA guidelines.", explanation: "Every in-text citation must have a Works Cited entry and vice versa.", difficulty: "easy" },
  { id: "ef9", classId: "eng102", topic: "Argumentative Essays", type: "flashcard", prompt: "What is a topic sentence?", answer: "The first sentence of a body paragraph that introduces the paragraph's main point and connects to the thesis.", explanation: "Every body paragraph should have a clear topic sentence.", difficulty: "easy" },
  { id: "ef10", classId: "eng102", topic: "Evidence", type: "flashcard", prompt: "What is the ICE method?", answer: "Introduce the quote, Cite it, and Explain its relevance to your argument.", explanation: "Never drop quotes into paragraphs without context.", difficulty: "medium" },
  { id: "ef11", classId: "eng102", topic: "MLA Format", type: "flashcard", prompt: "What are the basic MLA formatting rules?", answer: "12pt Times New Roman, double-spaced, 1-inch margins, header with last name and page number.", explanation: "Also include a heading with name, professor, course, date.", difficulty: "easy" },
  { id: "ef12", classId: "eng102", topic: "Thesis Statements", type: "flashcard", prompt: "Where should the thesis statement appear?", answer: "Typically at the end of the introduction paragraph.", explanation: "It serves as a transition from background info to your argument.", difficulty: "easy" },

  // Multiple Choice
  { id: "em1", classId: "eng102", topic: "Thesis Statements", type: "multiple-choice", prompt: "Which is the strongest thesis statement?", answer: "Universities should require financial literacy courses because graduates face significant debt without money management skills.", choices: ["College is expensive.", "This essay is about financial literacy.", "Universities should require financial literacy courses because graduates face significant debt without money management skills.", "Money is important."], explanation: "A strong thesis is specific, arguable, and gives a clear reason.", difficulty: "medium" },
  { id: "em2", classId: "eng102", topic: "MLA Format", type: "multiple-choice", prompt: "In MLA format, in-text citations include:", answer: "Author's last name and page number", choices: ["Author's full name and date", "Author's last name and page number", "Title and year", "URL and date accessed"], explanation: "MLA uses author-page: (Smith 45). APA uses author-date.", difficulty: "easy" },
  { id: "em3", classId: "eng102", topic: "Evidence", type: "multiple-choice", prompt: "Which is the most credible source for an academic essay?", answer: "A peer-reviewed journal article", choices: ["A personal blog post", "A Wikipedia article", "A peer-reviewed journal article", "A social media post"], explanation: "Peer-reviewed sources have been evaluated by experts in the field.", difficulty: "easy" },
  { id: "em4", classId: "eng102", topic: "Argumentative Essays", type: "multiple-choice", prompt: "A counterargument is:", answer: "An opposing viewpoint you address and refute", choices: ["A summary of your argument", "An opposing viewpoint you address and refute", "The conclusion of your essay", "A type of logical fallacy"], explanation: "Addressing counterarguments shows you've considered multiple perspectives.", difficulty: "easy" },
  { id: "em5", classId: "eng102", topic: "Thesis Statements", type: "multiple-choice", prompt: "A thesis statement should be:", answer: "Debatable — someone could reasonably disagree", choices: ["A question", "A fact that everyone agrees with", "Debatable — someone could reasonably disagree", "As vague as possible"], explanation: "If no one could disagree, it's a fact, not a thesis.", difficulty: "medium" },
  { id: "em6", classId: "eng102", topic: "MLA Format", type: "multiple-choice", prompt: "The Works Cited page should be:", answer: "Alphabetized by author's last name", choices: ["Numbered in order of use", "Alphabetized by author's last name", "Organized by source type", "Arranged by date"], explanation: "MLA Works Cited is always alphabetical.", difficulty: "easy" },
  { id: "em7", classId: "eng102", topic: "Evidence", type: "multiple-choice", prompt: "The ICE method stands for:", answer: "Introduce, Cite, Explain", choices: ["Interpret, Create, Evaluate", "Introduce, Cite, Explain", "Identify, Connect, Elaborate", "Infer, Conclude, Examine"], explanation: "ICE helps integrate evidence smoothly into paragraphs.", difficulty: "medium" },
  { id: "em8", classId: "eng102", topic: "Argumentative Essays", type: "multiple-choice", prompt: "Which element is NOT typically part of an argumentative essay?", answer: "Personal diary entries", choices: ["Thesis statement", "Counterargument", "Evidence from sources", "Personal diary entries"], explanation: "Argumentative essays use logic and evidence, not personal diary content.", difficulty: "easy" },
  { id: "em9", classId: "eng102", topic: "MLA Format", type: "multiple-choice", prompt: "MLA format requires which font?", answer: "12pt Times New Roman", choices: ["11pt Arial", "12pt Times New Roman", "14pt Calibri", "10pt Courier"], explanation: "Standard MLA: 12pt Times New Roman, double-spaced, 1-inch margins.", difficulty: "easy" },
  { id: "em10", classId: "eng102", topic: "Evidence", type: "multiple-choice", prompt: "Paraphrasing means:", answer: "Restating an idea in your own words while keeping the meaning", choices: ["Copying text word-for-word", "Restating an idea in your own words while keeping the meaning", "Summarizing an entire book", "Making up supporting evidence"], explanation: "Paraphrasing still requires citation.", difficulty: "easy" },

  // Fill in the Blank
  { id: "efb1", classId: "eng102", topic: "Thesis Statements", type: "fill-blank", prompt: "A strong thesis statement should be specific and _____.", answer: "debatable", explanation: "If no one can disagree with your thesis, it's a fact, not an argument.", difficulty: "easy" },
  { id: "efb2", classId: "eng102", topic: "MLA Format", type: "fill-blank", prompt: "MLA in-text citations include the author's last name and _____ number.", answer: "page", explanation: "Format: (Author Page) — e.g., (Smith 45).", difficulty: "easy" },
  { id: "efb3", classId: "eng102", topic: "Argumentative Essays", type: "fill-blank", prompt: "A _____ is your response to an opposing argument.", answer: "rebuttal", explanation: "You acknowledge the counterargument, then explain why your position holds.", difficulty: "medium" },
  { id: "efb4", classId: "eng102", topic: "Evidence", type: "fill-blank", prompt: "_____ -reviewed journal articles are considered the most credible academic sources.", answer: "peer", explanation: "Peer review means experts in the field have evaluated the research.", difficulty: "easy" },
  { id: "efb5", classId: "eng102", topic: "Argumentative Essays", type: "fill-blank", prompt: "Each body paragraph should begin with a _____ sentence.", answer: "topic", explanation: "Topic sentences introduce the paragraph's main idea and connect to the thesis.", difficulty: "easy" },
  { id: "efb6", classId: "eng102", topic: "MLA Format", type: "fill-blank", prompt: "The list of sources at the end of an MLA paper is called Works _____.", answer: "Cited", explanation: "Works Cited, not Bibliography — only includes sources actually referenced.", difficulty: "easy" },
  { id: "efb7", classId: "eng102", topic: "Evidence", type: "fill-blank", prompt: "The ICE method stands for Introduce, Cite, and _____.", answer: "Explain", explanation: "Always explain how the evidence supports your argument.", difficulty: "medium" },
  { id: "efb8", classId: "eng102", topic: "Thesis Statements", type: "fill-blank", prompt: "The thesis usually appears at the end of the _____ paragraph.", answer: "introduction", explanation: "It provides a bridge from context to your argument.", difficulty: "easy" },
  { id: "efb9", classId: "eng102", topic: "MLA Format", type: "fill-blank", prompt: "MLA format requires _____-inch margins on all sides.", answer: "1", explanation: "One-inch margins on top, bottom, left, and right.", difficulty: "easy" },
  { id: "efb10", classId: "eng102", topic: "Argumentative Essays", type: "fill-blank", prompt: "An argument that uses flawed reasoning is called a logical _____.", answer: "fallacy", explanation: "Common fallacies include ad hominem, straw man, and false dichotomy.", difficulty: "medium" },

  // True/False
  { id: "etf1", classId: "eng102", topic: "Thesis Statements", type: "true-false", prompt: "A thesis statement can be a question.", answer: "false", explanation: "A thesis must be a declarative statement, not a question.", difficulty: "easy" },
  { id: "etf2", classId: "eng102", topic: "MLA Format", type: "true-false", prompt: "MLA format uses footnotes for citations.", answer: "false", explanation: "MLA uses parenthetical in-text citations. Chicago style uses footnotes.", difficulty: "medium" },
  { id: "etf3", classId: "eng102", topic: "Evidence", type: "true-false", prompt: "Paraphrased content does not need a citation.", answer: "false", explanation: "Even in your own words, you must cite the original source to avoid plagiarism.", difficulty: "easy" },
  { id: "etf4", classId: "eng102", topic: "Argumentative Essays", type: "true-false", prompt: "Addressing counterarguments weakens your essay.", answer: "false", explanation: "Addressing and refuting counterarguments actually strengthens your credibility.", difficulty: "easy" },
  { id: "etf5", classId: "eng102", topic: "MLA Format", type: "true-false", prompt: "The Works Cited page is alphabetized by author's last name.", answer: "true", explanation: "Alphabetical order by the first word of each entry (usually author's last name).", difficulty: "easy" },
  { id: "etf6", classId: "eng102", topic: "Evidence", type: "true-false", prompt: "Wikipedia is considered a credible academic source.", answer: "false", explanation: "Wikipedia can be a starting point for research but is not accepted as an academic source.", difficulty: "easy" },
  { id: "etf7", classId: "eng102", topic: "Thesis Statements", type: "true-false", prompt: "A good thesis statement takes a position that could be argued against.", answer: "true", explanation: "If the statement is undeniable fact, it's not a thesis.", difficulty: "easy" },
  { id: "etf8", classId: "eng102", topic: "Argumentative Essays", type: "true-false", prompt: "Every body paragraph should have a topic sentence.", answer: "true", explanation: "Topic sentences guide the reader and connect paragraphs to the thesis.", difficulty: "easy" },
  { id: "etf9", classId: "eng102", topic: "MLA Format", type: "true-false", prompt: "MLA papers should be single-spaced.", answer: "false", explanation: "MLA requires double-spacing throughout the entire paper.", difficulty: "easy" },
  { id: "etf10", classId: "eng102", topic: "Evidence", type: "true-false", prompt: "Direct quotes should make up the majority of an academic essay.", answer: "false", explanation: "Most of the essay should be your own analysis. Quotes support your points.", difficulty: "medium" },

  // Matching
  { id: "ema1", classId: "eng102", topic: "Argumentative Essays", type: "matching", prompt: "Match essay concepts", answer: "", matchPairs: [
    { term: "Thesis statement", definition: "Your central argument or claim" },
    { term: "Topic sentence", definition: "Opens a body paragraph with its main idea" },
    { term: "Counterargument", definition: "An opposing viewpoint" },
    { term: "Rebuttal", definition: "Your response to the opposing viewpoint" },
    { term: "In-text citation", definition: "Parenthetical source reference in the text" },
    { term: "Works Cited", definition: "Alphabetized list of all sources used" },
    { term: "Paraphrasing", definition: "Restating ideas in your own words" },
    { term: "Logical fallacy", definition: "An error in reasoning that weakens an argument" },
  ], explanation: "These are foundational concepts for argumentative writing.", difficulty: "medium" },
];

// ── Math Questions ──
const mathQuestions: StudyQuestion[] = [
  // Flashcards
  { id: "mf1", classId: "math150", topic: "Polynomial Functions", type: "flashcard", prompt: "What is a polynomial function?", answer: "A function consisting of terms with non-negative integer exponents, like f(x) = 3x⁴ + 2x² - x + 5.", explanation: "The degree is the highest exponent.", difficulty: "easy" },
  { id: "mf2", classId: "math150", topic: "Quadratic Formula", type: "flashcard", prompt: "What is the quadratic formula?", answer: "x = (-b ± √(b² - 4ac)) / 2a, used to solve ax² + bx + c = 0.", explanation: "Works for any quadratic equation, even when factoring is difficult.", difficulty: "easy" },
  { id: "mf3", classId: "math150", topic: "Roots & Zeros", type: "flashcard", prompt: "What are the zeros of a polynomial?", answer: "The values of x where the polynomial equals zero — the x-intercepts of the graph.", explanation: "Also called roots or solutions.", difficulty: "easy" },
  { id: "mf4", classId: "math150", topic: "Graphing", type: "flashcard", prompt: "What determines end behavior of a polynomial?", answer: "The degree (even/odd) and the sign of the leading coefficient.", explanation: "Odd degree: ends go opposite directions. Even degree: ends go same direction.", difficulty: "medium" },
  { id: "mf5", classId: "math150", topic: "Polynomial Functions", type: "flashcard", prompt: "What is the degree of a polynomial?", answer: "The highest power of the variable in the polynomial.", explanation: "Example: 3x⁴ + x² - 1 has degree 4.", difficulty: "easy" },
  { id: "mf6", classId: "math150", topic: "Quadratic Formula", type: "flashcard", prompt: "What is the discriminant?", answer: "b² - 4ac, the expression under the square root in the quadratic formula.", explanation: "Positive = 2 real roots. Zero = 1 root. Negative = no real roots.", difficulty: "medium" },
  { id: "mf7", classId: "math150", topic: "Roots & Zeros", type: "flashcard", prompt: "What is multiplicity?", answer: "The number of times a particular root appears as a factor.", explanation: "Even multiplicity: graph touches x-axis. Odd multiplicity: graph crosses.", difficulty: "medium" },
  { id: "mf8", classId: "math150", topic: "Graphing", type: "flashcard", prompt: "What is the y-intercept of a polynomial?", answer: "The value of f(0) — found by substituting x = 0.", explanation: "It equals the constant term of the polynomial.", difficulty: "easy" },
  { id: "mf9", classId: "math150", topic: "Polynomial Functions", type: "flashcard", prompt: "What is the Rational Root Theorem?", answer: "If p/q is a rational root, then p divides the constant term and q divides the leading coefficient.", explanation: "Gives possible rational roots to test.", difficulty: "hard" },
  { id: "mf10", classId: "math150", topic: "Quadratic Formula", type: "flashcard", prompt: "What is a vertex form of a quadratic?", answer: "f(x) = a(x - h)² + k, where (h, k) is the vertex.", explanation: "Useful for identifying the minimum/maximum point.", difficulty: "medium" },
  { id: "mf11", classId: "math150", topic: "Roots & Zeros", type: "flashcard", prompt: "What does the Fundamental Theorem of Algebra state?", answer: "Every polynomial of degree n has exactly n roots (counting multiplicity and complex roots).", explanation: "This means a degree-3 polynomial has exactly 3 roots.", difficulty: "hard" },
  { id: "mf12", classId: "math150", topic: "Graphing", type: "flashcard", prompt: "What is a turning point?", answer: "A point where the graph changes from increasing to decreasing or vice versa.", explanation: "A polynomial of degree n has at most n-1 turning points.", difficulty: "medium" },

  // Multiple Choice
  { id: "mm1", classId: "math150", topic: "Polynomial Functions", type: "multiple-choice", prompt: "What is the degree of 5x³ - 2x² + x - 7?", answer: "3", choices: ["2", "3", "4", "5"], explanation: "The highest exponent is 3.", difficulty: "easy" },
  { id: "mm2", classId: "math150", topic: "Quadratic Formula", type: "multiple-choice", prompt: "If the discriminant is negative, the quadratic equation has:", answer: "No real solutions", choices: ["Two real solutions", "One real solution", "No real solutions", "Infinitely many solutions"], explanation: "A negative discriminant means the square root is imaginary.", difficulty: "medium" },
  { id: "mm3", classId: "math150", topic: "Roots & Zeros", type: "multiple-choice", prompt: "What are the zeros of f(x) = x² - 9?", answer: "x = 3 and x = -3", choices: ["x = 9", "x = 3 and x = -3", "x = 0 and x = 9", "x = 3 only"], explanation: "x² - 9 = (x+3)(x-3), so zeros are ±3.", difficulty: "easy" },
  { id: "mm4", classId: "math150", topic: "Graphing", type: "multiple-choice", prompt: "A polynomial with an odd degree and positive leading coefficient:", answer: "Falls left, rises right", choices: ["Rises left, rises right", "Falls left, rises right", "Falls left, falls right", "Rises left, falls right"], explanation: "Odd degree means opposite end behaviors. Positive LC means rises right.", difficulty: "medium" },
  { id: "mm5", classId: "math150", topic: "Quadratic Formula", type: "multiple-choice", prompt: "Solve x² + 2x - 8 = 0 using the quadratic formula:", answer: "x = 2 and x = -4", choices: ["x = 2 and x = -4", "x = 4 and x = -2", "x = 8 and x = -1", "x = 1 and x = -8"], explanation: "x = (-2 ± √(4+32))/2 = (-2 ± 6)/2, giving 2 and -4.", difficulty: "medium" },
  { id: "mm6", classId: "math150", topic: "Polynomial Functions", type: "multiple-choice", prompt: "The leading coefficient of -2x⁵ + 3x³ - x is:", answer: "-2", choices: ["3", "-2", "5", "-1"], explanation: "The leading coefficient is the coefficient of the highest-degree term.", difficulty: "easy" },
  { id: "mm7", classId: "math150", topic: "Roots & Zeros", type: "multiple-choice", prompt: "If x = 2 is a zero with multiplicity 2, the graph at x = 2:", answer: "Touches the x-axis and bounces back", choices: ["Crosses the x-axis", "Touches the x-axis and bounces back", "Has a vertical asymptote", "Is undefined"], explanation: "Even multiplicity means the graph touches but doesn't cross.", difficulty: "medium" },
  { id: "mm8", classId: "math150", topic: "Graphing", type: "multiple-choice", prompt: "How many turning points can a degree-4 polynomial have at most?", answer: "3", choices: ["2", "3", "4", "5"], explanation: "A polynomial of degree n has at most n-1 turning points.", difficulty: "medium" },
  { id: "mm9", classId: "math150", topic: "Polynomial Functions", type: "multiple-choice", prompt: "Which of these is NOT a polynomial?", answer: "f(x) = x^(-2) + 3", choices: ["f(x) = 5x³ - 1", "f(x) = x² + 2x + 1", "f(x) = x^(-2) + 3", "f(x) = 7"], explanation: "Polynomials require non-negative integer exponents. x^(-2) has a negative exponent.", difficulty: "easy" },
  { id: "mm10", classId: "math150", topic: "Quadratic Formula", type: "multiple-choice", prompt: "The vertex of f(x) = (x - 3)² + 5 is:", answer: "(3, 5)", choices: ["(-3, 5)", "(3, 5)", "(3, -5)", "(-3, -5)"], explanation: "Vertex form: a(x-h)²+k, vertex is (h,k) = (3,5).", difficulty: "easy" },

  // Fill in the Blank
  { id: "mfb1", classId: "math150", topic: "Quadratic Formula", type: "fill-blank", prompt: "The discriminant of a quadratic equation is b² - _____.", answer: "4ac", explanation: "The discriminant determines the number and type of solutions.", difficulty: "easy" },
  { id: "mfb2", classId: "math150", topic: "Polynomial Functions", type: "fill-blank", prompt: "The degree of x⁵ - 3x² + 2 is _____.", answer: "5", explanation: "The degree is the highest exponent in the polynomial.", difficulty: "easy" },
  { id: "mfb3", classId: "math150", topic: "Roots & Zeros", type: "fill-blank", prompt: "The zeros of a polynomial are the _____ -intercepts of its graph.", answer: "x", explanation: "Zeros are where f(x) = 0, which are the x-intercepts.", difficulty: "easy" },
  { id: "mfb4", classId: "math150", topic: "Graphing", type: "fill-blank", prompt: "A polynomial of degree n has at most _____ turning points.", answer: "n-1", explanation: "Example: a degree-3 polynomial has at most 2 turning points.", difficulty: "medium" },
  { id: "mfb5", classId: "math150", topic: "Polynomial Functions", type: "fill-blank", prompt: "The _____ coefficient is the coefficient of the highest-degree term.", answer: "leading", explanation: "It determines end behavior along with the degree.", difficulty: "easy" },
  { id: "mfb6", classId: "math150", topic: "Quadratic Formula", type: "fill-blank", prompt: "If the discriminant equals zero, the quadratic has exactly _____ real solution(s).", answer: "1", explanation: "Zero discriminant means one repeated real root.", difficulty: "medium" },
  { id: "mfb7", classId: "math150", topic: "Roots & Zeros", type: "fill-blank", prompt: "x² - 16 factors into (x + 4)(x - _____).", answer: "4", explanation: "Difference of squares: a² - b² = (a+b)(a-b).", difficulty: "easy" },
  { id: "mfb8", classId: "math150", topic: "Graphing", type: "fill-blank", prompt: "The y-intercept of any polynomial is found by evaluating f(_____).", answer: "0", explanation: "Substitute x = 0 to find where the graph crosses the y-axis.", difficulty: "easy" },
  { id: "mfb9", classId: "math150", topic: "Polynomial Functions", type: "fill-blank", prompt: "According to the Fundamental Theorem of Algebra, a degree-n polynomial has exactly _____ roots.", answer: "n", explanation: "Counting multiplicity and complex roots.", difficulty: "medium" },
  { id: "mfb10", classId: "math150", topic: "Roots & Zeros", type: "fill-blank", prompt: "A root with even _____ causes the graph to touch but not cross the x-axis.", answer: "multiplicity", explanation: "Odd multiplicity → crosses. Even multiplicity → bounces.", difficulty: "medium" },

  // True/False
  { id: "mtf1", classId: "math150", topic: "Polynomial Functions", type: "true-false", prompt: "All quadratic functions are polynomial functions.", answer: "true", explanation: "Quadratics (degree 2) are a subset of polynomials.", difficulty: "easy" },
  { id: "mtf2", classId: "math150", topic: "Quadratic Formula", type: "true-false", prompt: "The quadratic formula only works when the discriminant is positive.", answer: "false", explanation: "The formula works for any discriminant. Negative discriminant gives complex solutions.", difficulty: "medium" },
  { id: "mtf3", classId: "math150", topic: "Roots & Zeros", type: "true-false", prompt: "A degree-3 polynomial must have at least one real root.", answer: "true", explanation: "Odd-degree polynomials always cross the x-axis at least once.", difficulty: "medium" },
  { id: "mtf4", classId: "math150", topic: "Graphing", type: "true-false", prompt: "A degree-4 polynomial can have at most 4 turning points.", answer: "false", explanation: "At most n-1 = 3 turning points for degree 4.", difficulty: "medium" },
  { id: "mtf5", classId: "math150", topic: "Polynomial Functions", type: "true-false", prompt: "f(x) = √x is a polynomial function.", answer: "false", explanation: "√x = x^(1/2), which has a fractional exponent. Polynomials require non-negative integers.", difficulty: "easy" },
  { id: "mtf6", classId: "math150", topic: "Quadratic Formula", type: "true-false", prompt: "The vertex of a parabola is always the minimum point.", answer: "false", explanation: "It's the minimum when a > 0 (opens up) and maximum when a < 0 (opens down).", difficulty: "easy" },
  { id: "mtf7", classId: "math150", topic: "Roots & Zeros", type: "true-false", prompt: "Complex roots of polynomials with real coefficients always come in conjugate pairs.", answer: "true", explanation: "If a + bi is a root, then a - bi must also be a root.", difficulty: "hard" },
  { id: "mtf8", classId: "math150", topic: "Graphing", type: "true-false", prompt: "The y-intercept of f(x) = 2x³ - 5x + 7 is 7.", answer: "true", explanation: "f(0) = 0 - 0 + 7 = 7. The y-intercept equals the constant term.", difficulty: "easy" },
  { id: "mtf9", classId: "math150", topic: "Polynomial Functions", type: "true-false", prompt: "The degree of a constant polynomial (like f(x) = 5) is 0.", answer: "true", explanation: "f(x) = 5 = 5x⁰, so the degree is 0.", difficulty: "easy" },
  { id: "mtf10", classId: "math150", topic: "Roots & Zeros", type: "true-false", prompt: "Synthetic division can only be used to divide by linear factors.", answer: "true", explanation: "Synthetic division works for divisors of the form (x - c).", difficulty: "medium" },

  // Matching
  { id: "mma1", classId: "math150", topic: "Polynomial Functions", type: "matching", prompt: "Match polynomial concepts", answer: "", matchPairs: [
    { term: "Degree", definition: "Highest power of the variable" },
    { term: "Leading coefficient", definition: "Coefficient of the highest-degree term" },
    { term: "Zero / Root", definition: "Value where polynomial equals zero" },
    { term: "Multiplicity", definition: "Number of times a root is repeated" },
    { term: "End behavior", definition: "What the graph does as x → ±∞" },
    { term: "Turning point", definition: "Where the graph changes direction" },
    { term: "Y-intercept", definition: "Value of f(0), the constant term" },
    { term: "Discriminant", definition: "b² - 4ac, determines number of roots" },
  ], explanation: "Core vocabulary for understanding polynomial functions.", difficulty: "medium" },
];

export const allQuestions: StudyQuestion[] = [
  ...psychQuestions,
  ...bioQuestions,
  ...engQuestions,
  ...mathQuestions,
];

export function getQuestionsForSession(
  classId: string,
  topic: string | "all",
  type: StudyQuestion["type"] | "mixed",
  difficulty: "easy" | "medium" | "hard" | "mixed",
  count: number
): StudyQuestion[] {
  let pool = allQuestions.filter(q => q.classId === classId);
  if (topic !== "all") pool = pool.filter(q => q.topic === topic);
  if (type !== "mixed") pool = pool.filter(q => q.type === type);
  if (difficulty !== "mixed") pool = pool.filter(q => q.difficulty === difficulty);

  // Shuffle
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getMatchingForSession(classId: string, topic: string | "all"): StudyQuestion | null {
  let pool = allQuestions.filter(q => q.classId === classId && q.type === "matching");
  if (topic !== "all") pool = pool.filter(q => q.topic === topic);
  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
}

export function getModeType(mode: StudyMode): StudyQuestion["type"] | "mixed" {
  const map: Record<StudyMode, StudyQuestion["type"] | "mixed"> = {
    "flashcards": "flashcard",
    "multiple-choice": "multiple-choice",
    "fill-blank": "fill-blank",
    "true-false": "true-false",
    "matching": "matching",
    "timed-challenge": "mixed",
  };
  return map[mode];
}

export const modeLabels: Record<StudyMode, string> = {
  "flashcards": "Flashcards",
  "multiple-choice": "Multiple Choice",
  "fill-blank": "Fill in the Blank",
  "true-false": "True / False",
  "matching": "Matching Game",
  "timed-challenge": "Timed Challenge",
};
