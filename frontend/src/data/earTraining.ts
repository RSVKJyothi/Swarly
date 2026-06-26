export type EarStep = {
  step: number;
  swaras: string[];
  noteCount: number;
  type: "adjacent" | "triplet" | "full" | "skip1" | "skip2" | "jump-desc" | "jump-mixed";
};

// The 7 base swaras for Phase 1 (individual teaching)
export const ALL_SWARAS = ["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni", "*Sa"];

export const SWARA_LABEL_TE: Record<string, string> = {
  "Sa": "స", "Re": "రి", "Ga": "గ", "Ma": "మ",
  "Pa": "ప", "Dha": "ద", "Ni": "ని", "*Sa": "*స",
};

// ── Ear Training Test question generation ───────────────────────────────────
export type EarTestQuestion = {
  difficulty: "easy" | "medium" | "hard";
  answer: string[];        // the correct swara sequence, e.g. ["Sa"] or ["Sa","Re","Ga"]
  options: string[][];     // 3 options, each a swara sequence; one matches `answer`
};

const SWARA_ORDER = ["Sa", "Re", "Ga", "Ma", "Pa", "Dha", "Ni", "*Sa"];

function swaraIndex(swara: string): number {
  return SWARA_ORDER.indexOf(swara);
}

function adjacentSwara(swara: string, offset: number): string {
  const idx = swaraIndex(swara);
  const newIdx = Math.max(0, Math.min(SWARA_ORDER.length - 1, idx + offset));
  return SWARA_ORDER[newIdx];
}

function randomSwara(exclude: string[]): string {
  const pool = SWARA_ORDER.filter(s => !exclude.includes(s));
  return pool[Math.floor(Math.random() * pool.length)];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build a question for a single swara (easy difficulty)
function buildSingleSwaraQuestion(): EarTestQuestion {
  const correct = pick(SWARA_ORDER);
  const closeOptions = [
    adjacentSwara(correct, -1),
    adjacentSwara(correct, 1),
  ].filter(s => s !== correct);

  const close1 = closeOptions[0] ?? randomSwara([correct]);
  const randomOpt = randomSwara([correct, close1]);

  const options = shuffle([[correct], [close1], [randomOpt]]);

  return { difficulty: "easy", answer: [correct], options };
}

// Build a question from an EAR_TRAINING_STEPS-style combo (medium/hard)
function buildComboQuestion(swaras: string[], difficulty: "easy" | "medium" | "hard"): EarTestQuestion {
  // Close option: shift the LAST note by one step (common discrimination challenge)
  const lastNote = swaras[swaras.length - 1];
  const closeLast = adjacentSwara(lastNote, Math.random() > 0.5 ? 1 : -1);
  const closeOption1 = [...swaras.slice(0, -1), closeLast];

  // Second close option: shift the FIRST note instead
  const firstNote = swaras[0];
  const closeFirst = adjacentSwara(firstNote, Math.random() > 0.5 ? 1 : -1);
  const closeOption2 = [closeFirst, ...swaras.slice(1)];

  // Random option: same length, fully random swaras
  const randomOption = swaras.map(() => randomSwara([]));

  // Pick 2 "close" + 1 random as the requirement said
  // Total 3 options: the correct answer + 1 close variant + 1 random variant
  const options = shuffle([swaras, closeOption1, closeOption2, randomOption]);

  return { difficulty, answer: swaras, options };
}

export function generateEarTestQuestions(): EarTestQuestion[] {
  const questions: EarTestQuestion[] = [];

  // Easy — 3 questions: individual swaras
  for (let i = 0; i < 3; i++) {
    questions.push(buildSingleSwaraQuestion());
  }

  // Medium — 3 questions: adjacent pairs or triplets from EAR_TRAINING_STEPS
  const mediumSteps = EAR_TRAINING_STEPS.filter(s => s.type === "adjacent" || s.type === "triplet");
  const usedMedium: number[] = [];
  for (let i = 0; i < 3; i++) {
    const available = mediumSteps.filter(s => !usedMedium.includes(s.step));
    const step = pick(available.length > 0 ? available : mediumSteps);
    usedMedium.push(step.step);
    questions.push(buildComboQuestion(step.swaras, "medium"));
  }

  // Hard — 1 question: jump-mixed or full
  const hardSteps = EAR_TRAINING_STEPS.filter(s => s.type === "jump-mixed" || s.type === "full" || s.type === "jump-desc");
  const hardStep = pick(hardSteps);
  questions.push(buildComboQuestion(hardStep.swaras, "hard"));

  return questions;
}

export const EAR_TRAINING_STEPS: EarStep[] = [
  // Adjacent pairs — moving up the scale
  { step: 1,  swaras: ["Sa", "Re"],            noteCount: 2, type: "adjacent" },
  { step: 2,  swaras: ["Re", "Ga"],            noteCount: 2, type: "adjacent" },
  { step: 3,  swaras: ["Ga", "Ma"],            noteCount: 2, type: "adjacent" },
  { step: 4,  swaras: ["Ma", "Pa"],            noteCount: 2, type: "adjacent" },
  { step: 5,  swaras: ["Pa", "Dha"],           noteCount: 2, type: "adjacent" },
  { step: 6,  swaras: ["Dha", "Ni"],           noteCount: 2, type: "adjacent" },
  { step: 7,  swaras: ["Ni", "*Sa"],           noteCount: 2, type: "adjacent" },

  // Adjacent triplets
  { step: 8,  swaras: ["Sa", "Re", "Ga"],      noteCount: 3, type: "triplet" },
  { step: 9,  swaras: ["Re", "Ga", "Ma"],      noteCount: 3, type: "triplet" },
  { step: 10, swaras: ["Ga", "Ma", "Pa"],      noteCount: 3, type: "triplet" },
  { step: 11, swaras: ["Ma", "Pa", "Dha"],     noteCount: 3, type: "triplet" },
  { step: 12, swaras: ["Pa", "Dha", "Ni"],     noteCount: 3, type: "triplet" },
  { step: 13, swaras: ["Dha", "Ni", "*Sa"],    noteCount: 3, type: "triplet" },

  // Full ascending
  { step: 14, swaras: ["Sa", "Re", "Ga", "Ma"], noteCount: 4, type: "full" },

  // Skip-1 jumps (skip one note — Sa-Ga, Re-Ma, etc.)
  { step: 15, swaras: ["Sa", "Ga"],            noteCount: 2, type: "skip1" },
  { step: 16, swaras: ["Re", "Ma"],            noteCount: 2, type: "skip1" },
  { step: 17, swaras: ["Ga", "Pa"],            noteCount: 2, type: "skip1" },
  { step: 18, swaras: ["Ma", "Dha"],           noteCount: 2, type: "skip1" },
  { step: 19, swaras: ["Pa", "Ni"],            noteCount: 2, type: "skip1" },
  { step: 20, swaras: ["Dha", "*Sa"],          noteCount: 2, type: "skip1" },

  // Skip-2 jumps (skip two notes — Sa-Ma, Re-Pa, etc.)
  { step: 21, swaras: ["Sa", "Ma"],            noteCount: 2, type: "skip2" },
  { step: 22, swaras: ["Re", "Pa"],            noteCount: 2, type: "skip2" },
  { step: 23, swaras: ["Ga", "Dha"],           noteCount: 2, type: "skip2" },
  { step: 24, swaras: ["Ma", "Ni"],            noteCount: 2, type: "skip2" },
  { step: 25, swaras: ["Pa", "*Sa"],           noteCount: 2, type: "skip2" },

  // Descending jumps
  { step: 26, swaras: ["*Sa", "Dha", "Ma", "Re"], noteCount: 4, type: "jump-desc" },
  { step: 27, swaras: ["Ni", "Pa", "Ga", "Sa"],   noteCount: 4, type: "jump-desc" },

  // Mixed jump combinations
  { step: 28, swaras: ["Re", "Ma", "Dha", "*Sa"], noteCount: 4, type: "jump-mixed" },
  { step: 29, swaras: ["Sa", "Ga", "Pa", "Ni"],   noteCount: 4, type: "jump-mixed" },
  { step: 30, swaras: ["Ga", "Sa", "Pa", "Ma"],   noteCount: 4, type: "jump-mixed" },
];

export const STEP_TYPE_LABEL: Record<string, string> = {
  adjacent:    "Adjacent notes",
  triplet:     "Three in a row",
  full:        "Full phrase",
  skip1:       "Skipping one note",
  skip2:       "Skipping two notes",
  "jump-desc": "Descending jump",
  "jump-mixed":"Mixed jumps",
};