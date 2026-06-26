// ── Swara token ───────────────────────────────────────────────────────────────
export type SwaraToken = {
  swara: string;   // internal key e.g. "Sa", "Re", "*Sa", ";"
  slots: 1 | 2;   // 1 = normal, 2 = aa/ii vottu (Paa, Maa, Nii, *Saa, Dhaa, Gaa)
};

export type BeatGroup = SwaraToken[];

export type Cycle = {
  laghu:    BeatGroup[]; // 4 beats
  drutham1: BeatGroup[]; // 2 beats
  drutham2: BeatGroup[]; // 2 beats
};

export type Variation = {
  number:  number;
  kaalams: number[];
  cycles:  Cycle[];
};

// ── Flatten a Variation into a simple tokens array for testing ──────────────
// Merges ";" hold-tokens into the preceding note's slot count.
// Used to send to /score_sarali as the reference sequence.
export type FlatToken = { swara: string; slots: number };

export function flattenVariationTokens(variation: Variation): FlatToken[] {
  const result: FlatToken[] = [];

  variation.cycles.forEach(cycle => {
    const allGroups = [...cycle.laghu, ...cycle.drutham1, ...cycle.drutham2];
    allGroups.forEach(group => {
      let i = 0;
      while (i < group.length) {
        const tok = group[i];
        if (tok.swara === ";") { i++; continue; } // orphan, skip
        let totalSlots = tok.slots;
        let j = i + 1;
        while (j < group.length && group[j].swara === ";") {
          totalSlots += group[j].slots;
          j++;
        }
        result.push({ swara: tok.swara, slots: totalSlots });
        i = j;
      }
    });
  });

  return result;
}

export function timePerAksharaForKaalam(kaalam: 1 | 2 | 3): number {
  return kaalam === 1 ? 1.0 : kaalam === 2 ? 0.5 : 0.25;
}

// ── Test question pool ───────────────────────────────────────────────────────
export type TestQuestion = {
  variationNumber: number;
  kaalam: 1 | 2 | 3;
  difficulty: "easy" | "medium" | "hard";
};

export function generateTestQuestions(): TestQuestion[] {
  const easyPool = [1, 2, 3, 6];       // simple, short patterns
  const mediumPool = [4, 5, 7, 8, 9];  // moderate complexity, some held notes
  const hardPool = [11, 13];           // longest / most complex

  function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function uniquePick(pool: number[], exclude: number[]): number {
    const available = pool.filter(n => !exclude.includes(n));
    return pick(available.length > 0 ? available : pool);
  }

  const questions: TestQuestion[] = [];
  const usedEasy: number[] = [];
  const usedMedium: number[] = [];

  // Easy — 3 questions, Kaalam 1 only
  for (let i = 0; i < 3; i++) {
    const v = uniquePick(easyPool, usedEasy);
    usedEasy.push(v);
    questions.push({ variationNumber: v, kaalam: 1, difficulty: "easy" });
  }

  // Medium — 3 questions, Kaalam 1 or 2
  for (let i = 0; i < 3; i++) {
    const v = uniquePick(mediumPool, usedMedium);
    usedMedium.push(v);
    const kaalam = pick([1, 2]) as 1 | 2;
    questions.push({ variationNumber: v, kaalam, difficulty: "medium" });
  }

  // Hard — 1 question, Kaalam 2 or 3
  const hardV = pick(hardPool);
  const hardKaalam = pick([2, 3]) as 2 | 3;
  questions.push({ variationNumber: hardV, kaalam: hardKaalam, difficulty: "hard" });

  return questions;
}
// ── Script maps ───────────────────────────────────────────────────────────────
// Each swara key maps to { te: Telugu, hi: Hindi, en: English }
// slots=1 → short form, slots=2 → long form (vottu)
export type Script = "te" | "en";

export const SWARA_LABELS: Record<string, { te: string; en: string }> = {
  "Sa":    { te: "స",   en: "Sa"   },
  "*Sa":   { te: "*స",  en: "*Sa"  },
  "Re":    { te: "రి",  en: "Re"   },
  "Ga":    { te: "గ",   en: "Ga"   },
  "Ma":    { te: "మ",   en: "Ma"   },
  "Pa":    { te: "ప",   en: "Pa"   },
  "Dha":   { te: "ద",   en: "Dha"  },
  "Ni":    { te: "ని",  en: "Ni"   },
  "Sa_l":  { te: "సా",  en: "Saa"  },
  "*Sa_l": { te: "*సా", en: "*Saa" },
  "Re_l":  { te: "రీ",  en: "Ree"  },
  "Ga_l":  { te: "గా",  en: "Gaa"  },
  "Ma_l":  { te: "మా",  en: "Maa"  },
  "Pa_l":  { te: "పా",  en: "Paa"  },
  "Dha_l": { te: "దా",  en: "Dhaa" },
  "Ni_l":  { te: "నీ",  en: "Nii"  },
  ";":     { te: ";",   en: ";"    },
};

export function getSwaraLabel(token: SwaraToken, script: Script): string {
  if (token.swara === ";") return ";";
  const key = token.slots === 2 ? token.swara + "_l" : token.swara;
  return SWARA_LABELS[key]?.[script] ?? token.swara;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const s  = (swara: string): SwaraToken => ({ swara, slots: 1 });
const sl = (swara: string): SwaraToken => ({ swara, slots: 2 });

// ── Shared cycles ─────────────────────────────────────────────────────────────
// CLOSE: *Sa Ni Dha Pa | Ma Ga | Re Sa ||
const CLOSE: Cycle = {
  laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
  drutham1: [[s("Ma")],  [s("Ga")]],
  drutham2: [[s("Re")],  [s("Sa")]],
};

// MID: Sa Re Ga Ma | Pa Dha | Ni *Sa ||
const MID: Cycle = {
  laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
  drutham1: [[s("Pa")],  [s("Dha")]],
  drutham2: [[s("Ni")],  [s("*Sa")]],
};

export const SARALI_VARIATIONS: Variation[] = [

  // 1. Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 1, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[s("Pa")],  [s("Dha")]],
        drutham2: [[s("Ni")],  [s("*Sa")]],
      },
      CLOSE,
    ],
  },

  // 2. Sa Re Ga Ma | Sa Re | Ga Ma ||
  //    Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni Dha Pa | *Sa Ni | Dha Pa ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 2, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[s("Sa")],  [s("Re")]],
        drutham2: [[s("Ga")],  [s("Ma")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
        drutham1: [[s("*Sa")], [s("Ni")]],
        drutham2: [[s("Dha")], [s("Pa")]],
      },
      CLOSE,
    ],
  },

  // 3. Sa Re Ga Ma | Sa Re | Sa Re ||
  //    Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni Dha Pa | *Sa Ni | *Sa Ni ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 3, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[s("Sa")],  [s("Re")]],
        drutham2: [[s("Sa")],  [s("Re")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
        drutham1: [[s("*Sa")], [s("Ni")]],
        drutham2: [[s("*Sa")], [s("Ni")]],
      },
      CLOSE,
    ],
  },

  // 4. Sa Re Ga Ma | Paa ; | Paa ; ||
  //    Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni Dha Pa | Maa ; | Maa ; ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 4, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[sl("Pa"), s(";")]],
        drutham2: [[sl("Pa"), s(";")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
        drutham1: [[sl("Ma"), s(";")]],
        drutham2: [[sl("Ma"), s(";")]],
      },
      CLOSE,
    ],
  },

  // 5. Sa Re Ga Ma | Paa | Sa Re ||
  //    Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni Dha Pa | Maa | *Sa Ni ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 5, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[sl("Pa")]],
        drutham2: [[s("Sa")],  [s("Re")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
        drutham1: [[sl("Ma")]],
        drutham2: [[s("*Sa")], [s("Ni")]],
      },
      CLOSE,
    ],
  },

  // 6. Sa Re Ga Ma | Pa Ma | Ga Re ||
  //    Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni Dha Pa | Ma Pa | Dha Ni ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 6, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[s("Pa")],  [s("Ma")]],
        drutham2: [[s("Ga")],  [s("Re")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
        drutham1: [[s("Ma")],  [s("Pa")]],
        drutham2: [[s("Dha")], [s("Ni")]],
      },
      CLOSE,
    ],
  },

  // 7. Sa Re Ga Ma | Pa Ma | Dha Pa ||
  //    Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni Dha Pa | Ma Pa | Ga Ma ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 7, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[s("Pa")],  [s("Ma")]],
        drutham2: [[s("Dha")], [s("Pa")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
        drutham1: [[s("Ma")],  [s("Pa")]],
        drutham2: [[s("Ga")],  [s("Ma")]],
      },
      CLOSE,
    ],
  },

  // 8. Sa Re Ga Ma | Sa Ma | Ga Re ||
  //    Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni Dha Pa | Sa Pa | Dha Ni ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 8, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[s("Sa")],  [s("Ma")]],
        drutham2: [[s("Ga")],  [s("Re")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
        drutham1: [[s("*Sa")], [s("Pa")]],
        drutham2: [[s("Dha")], [s("Ni")]],
      },
      CLOSE,
    ],
  },

  // 9. Sa Re Sa Ma | Ga Ma | Re Ga ||
  //    Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //    *Sa Ni *Sa Pa | Dha Pa | Ni Dha ||
  //    *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 9, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Sa")], [s("Ma")]],
        drutham1: [[s("Ga")],  [s("Ma")]],
        drutham2: [[s("Re")],  [s("Ga")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("*Sa")], [s("Pa")]],
        drutham1: [[s("Dha")], [s("Pa")]],
        drutham2: [[s("Ni")],  [s("Dha")]],
      },
      CLOSE,
    ],
  },

  // 10. Sa Re Ga *Sa | Re Ga | *Sa Re ||
//     Sa Re Ga Ma  | Pa Ma  | Ni *Sa ||
//     *Sa Ni Dha *Sa | Ni Dha | *Sa Ni ||
//     *Sa Ni Dha Pa  | Ma Ga  | Re Sa  ||
{
  number: 10, kaalams: [1, 2, 3],
  cycles: [
    {
      laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Sa")]],
      drutham1: [[s("Re")],   [s("Ga")]],
      drutham2: [[s("Sa")],  [s("Re")]],
    },
    {
      laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
      drutham1: [[s("Pa")],   [s("Ma")]],
      drutham2: [[s("Ni")],   [s("*Sa")]],
    },
    {
      laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("*Sa")]],
      drutham1: [[s("Ni")],   [s("Dha")]],
      drutham2: [[s("*Sa")],  [s("Ni")]],
    },
    CLOSE,
  ],
},

  

  // 12. Sa Re Ga Ma | Re Ga | Ma Pa ||
  //     Sa Re Ga Ma | Pa Dha | Ni *Sa ||
  //     *Sa Ni Dha Pa | Ni Dha | Pa Ma ||
  //     *Sa Ni Dha Pa | Ma Ga | Re Sa ||
  {
    number: 11, kaalams: [1, 2, 3],
    cycles: [
      {
        laghu:    [[s("Sa")], [s("Re")], [s("Ga")], [s("Ma")]],
        drutham1: [[s("Re")],  [s("Ga")]],
        drutham2: [[s("Ma")],  [s("Pa")]],
      },
      MID,
      {
        laghu:    [[s("*Sa")], [s("Ni")], [s("Dha")], [s("Pa")]],
        drutham1: [[s("Ni")],  [s("Dha")]],
        drutham2: [[s("Pa")],  [s("Ma")]],
      },
      CLOSE,
    ],
  },

  // ── Variation 13 — Kaalam 3 ONLY — 1 beat = 4 slots ─────────────────────
  // Cycle 1:  స రి గ మ | ప గ మ | పా ; | పా ; || గ మ ప ద | ని ద ప మ | గ మ ప గ | మ గ రి స ||
  // Cycle 2:  *సా ని ద నీ ద ప | దా ప మ | పా పా || గ మ ప ద ని ద ప మ | గ మ ప గ | మ గ రి స ||
  // Cycle 3:  స *సా ని ద | ని ని ద ప | ద ద ప మ | పా పా || గ మ ప ద ని ద ప మ | గ మ ప గ | మ గ రి స ||
  // Cycle 4:  స రి గ రి గా గ మ | ప మ పా | ద ప దా || మ ప ద ప ద ని ద ప | మ ప ద ప | మ గ రి సా ||
  // Cycle 5:  స రి గ మ | పా పా | ద ద పా | మ మ పా || ద ని సా | స ని ద ప | *సా ని ద ప | మ గ రి స ||
  {
    number: 12, kaalams: [3],
    cycles: [

      // Cycle 1
      {
        laghu: [
          [s("Sa"),   s("Re"),  s("Ga"),  s("Ma")],
          [sl("Pa"),  s("Ga"),  s("Ma")],
          [sl("Pa"),  s(";")],
          [sl("Pa"),  s(";")],
        ],
        drutham1: [
          [s("Ga"),  s("Ma"),  s("Pa"),  s("Dha")],
          [s("Ni"),  s("Dha"), s("Pa"),  s("Ma")],
        ],
        drutham2: [
          [s("Ga"),  s("Ma"),  s("Pa"),  s("Ga")],
          [s("Ma"),  s("Ga"),  s("Re"),  s("Sa")],
        ],
      },

      // Cycle 2
      {
        laghu: [
          [sl("*Sa"), s("Ni"),  s("Dha")],
          [sl("Ni"),  s("Dha"), s("Pa")],
          [sl("Dha"), s("Pa"),  s("Ma")],
          [sl("Pa"),  sl("Pa")],
        ],
        drutham1: [
          [s("Ga"),  s("Ma"),  s("Pa"),  s("Dha")],
          [s("Ni"),  s("Dha"), s("Pa"),  s("Ma")],
        ],
        drutham2: [
          [s("Ga"),  s("Ma"),  s("Pa"),  s("Ga")],
          [s("Ma"),  s("Ga"),  s("Re"),  s("Sa")],
        ],
      },

      // Cycle 3
      {
        laghu: [
          [s("Sa"),  s("*Sa"), s("Ni"),  s("Dha")],
          [s("Ni"),  s("Ni"),  s("Dha"), s("Pa")],
          [s("Dha"), s("Dha"), s("Pa"),  s("Ma")],
          [sl("Pa"), sl("Pa")],
        ],
        drutham1: [
          [s("Ga"),  s("Ma"),  s("Pa"),  s("Dha")],
          [s("Ni"),  s("Dha"), s("Pa"),  s("Ma")],
        ],
        drutham2: [
          [s("Ga"),  s("Ma"),  s("Pa"),  s("Ga")],
          [s("Ma"),  s("Ga"),  s("Re"),  s("Sa")],
        ],
      },

      // Cycle 4
      {
        laghu: [
          [s("Sa"),  s("Re"),  s("Ga"),  s("Re")],
          [sl("Ga"), s("Ga"),  s("Ma")],
          [s("Pa"),  s("Ma"),  sl("Pa")],
          [s("Dha"), s("Pa"),  sl("Dha")],
        ],
        drutham1: [
          [s("Ma"),  s("Pa"),  s("Dha"), s("Pa")],
          [s("Dha"), s("Ni"),  s("Dha"), s("Pa")],
        ],
        drutham2: [
          [s("Ma"),  s("Pa"),  s("Dha"), s("Pa")],
          [s("Ma"),  s("Ga"),  s("Re"),  sl("Sa")],
        ],
      },

      // Cycle 5
      {
        laghu: [
          [s("Sa"),  s("Re"),  s("Ga"),  s("Ma")],
          [sl("Pa"), sl("Pa")],
          [s("Dha"), s("Dha"), sl("Pa")],
          [s("Ma"),  s("Ma"),  sl("Pa")],
        ],
        drutham1: [
          [s("Dha"), s("Ni"),  sl("*Sa")],
          [s("*Sa"), s("Ni"),  s("Dha"), s("Pa")],
        ],
        drutham2: [
          [s("*Sa"), s("Ni"),  s("Dha"), s("Pa")],
          [s("Ma"),  s("Ga"),  s("Re"),  s("Sa")],
        ],
      },
    ],
  },
];