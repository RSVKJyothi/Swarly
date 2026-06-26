import { playSwara, startTanpura, stopTanpura, loadHarmonium } from "./audioEngine";
import type { SwaraName } from "./audioEngine";
import type { Variation, BeatGroup, SwaraToken } from "../data/saraliSwaras";

// Map internal swara keys to audioEngine note names
// audioEngine SWARA_TO_NOTE uses: "Sa","Re","Ga","Ma","Pa","Dha","Ni","Sa'", "Sa.", etc.
function toAudioSwara(swara: string): SwaraName | null {
  if (swara === ";") return null;
  // "*Sa" -> "Sa'" (upper octave)
  if (swara.startsWith("*")) {
    const base = swara.slice(1); // "Sa"
    return (base + "'") as SwaraName;
  }
  return swara as SwaraName;
}

const TIME_PER_AKSHARA: Record<number, number> = {
  1: 1.0,   // Kaalam 1 — 1 second per akshara
  2: 0.5,   // Kaalam 2
  3: 0.25,  // Kaalam 3
};

export type PlaybackEvent = {
  cycleIndex: number;
  beatNum: number;   // 1-8
  startTime: number; // seconds from playback start
};

export type PlaybackHandle = {
  stop: () => void;
};

// Flatten a Cycle into ordered (beatGroup, beatNum) pairs
function flattenCycleBeats(cycle: { laghu: BeatGroup[]; drutham1: BeatGroup[]; drutham2: BeatGroup[] }) {
  const result: { group: BeatGroup; beatNum: number }[] = [];
  let bn = 1;
  cycle.laghu.forEach(g => { if (g.length > 0) result.push({ group: g, beatNum: bn }); bn++; });
  bn = 5;
  cycle.drutham1.forEach(g => { if (g.length > 0) result.push({ group: g, beatNum: bn }); bn++; });
  bn = 7;
  cycle.drutham2.forEach(g => { if (g.length > 0) result.push({ group: g, beatNum: bn }); bn++; });
  return result;
}

/**
 * Play a full variation at a given kaalam, repeated `repeats` times.
 * Calls onBeat(cycleIndex, beatNum) as each beat starts, for UI highlighting.
 * Calls onEnd() when playback fully finishes.
 */
export function playVariation(
  variation: Variation,
  kaalam: 1 | 2 | 3,
  repeats: number,
  onBeat?: (cycleIndex: number, beatNum: number, group: BeatGroup) => void,
  onEnd?: () => void,
): PlaybackHandle {
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const timePerAkshara = TIME_PER_AKSHARA[kaalam];

  let cursor = 0; // seconds

  for (let rep = 0; rep < repeats; rep++) {
    variation.cycles.forEach((cycle, cycleIndex) => {
      const beats = flattenCycleBeats(cycle);

      beats.forEach(({ group, beatNum }) => {
        // Process tokens within this beat group.
        // Walk through tokens; for each non-";" token, look ahead for
        // immediately following ";" tokens and add their slots.
        let i = 0;
        let beatStartCursor = cursor; // cursor at start of this beat group (for onBeat callback)
        let firstTokenInBeat = true;

        while (i < group.length) {
          const token: SwaraToken = group[i];

          if (token.swara === ";") {
            // Orphan ";" with no preceding note in this group — skip silently
            cursor += token.slots * timePerAkshara;
            i++;
            continue;
          }

          // Look ahead for trailing ";" tokens
          let totalSlots = token.slots;
          let j = i + 1;
          while (j < group.length && group[j].swara === ";") {
            totalSlots += group[j].slots;
            j++;
          }

          const duration = totalSlots * timePerAkshara;
          const audioSwara = toAudioSwara(token.swara);
          const playAt = cursor;

          if (audioSwara) {
            const t = setTimeout(() => {
              if (stopped) return;
              playSwara(audioSwara, duration * 0.92); // slight gap before next note
            }, playAt * 1000);
            timers.push(t);
          }

          // Fire onBeat callback once per beat group, at the start of the group
          if (firstTokenInBeat && onBeat) {
  const t2 = setTimeout(() => {
    if (stopped) return;
    onBeat(cycleIndex, beatNum, group);
  }, beatStartCursor * 1000);
  timers.push(t2);
  firstTokenInBeat = false;
}

          cursor += duration;
          i = j; // skip past consumed ";" tokens
        }

        // If the beat group is empty (shouldn't happen) still fire onBeat
        if (firstTokenInBeat && onBeat) {
  const t2 = setTimeout(() => {
    if (stopped) return;
    onBeat(cycleIndex, beatNum, group);
  }, beatStartCursor * 1000);
  timers.push(t2);
  firstTokenInBeat = false;
}
      });
    });
  }

  // onEnd
  const endTimer = setTimeout(() => {
    if (!stopped && onEnd) onEnd();
  }, cursor * 1000);
  timers.push(endTimer);

  return {
    stop: () => {
      stopped = true;
      timers.forEach(t => clearTimeout(t));
    },
  };
}

// ── Full session: tanpura + harmonium playback ──────────────────────────────
export async function startSession(
  variation: Variation,
  kaalam: 1 | 2 | 3,
  repeats: number,
  onBeat?: (cycleIndex: number, beatNum: number, group: BeatGroup) => void,
  onEnd?: () => void,
): Promise<PlaybackHandle> {
  await loadHarmonium();
  startTanpura();

  const handle = playVariation(variation, kaalam, repeats, onBeat, () => {
    stopTanpura();
    if (onEnd) onEnd();
  });

  return {
    stop: () => {
      handle.stop();
      stopTanpura();
    },
  };
}

// ── Singing guide ─────────────────────────────────────────────────────────────
// Converts a beat group into plain-language vocalization instructions
export function getSingingGuide(group: BeatGroup): string {
  const parts: string[] = [];

  for (let i = 0; i < group.length; i++) {
    const token = group[i];

    if (token.swara === ";") {
      // Standalone ; — show as hold marker
      parts.push(";");
      continue;
    }

    const syllable = SWARA_SYLLABLE[token.swara] ?? token.swara.toLowerCase();
    const nextIsSemicolon = i + 1 < group.length && group[i + 1].swara === ";";

    if (token.slots === 2) {
      if (nextIsSemicolon) {
        // Split at semicolon — show PA ; AA
        const vowelExtension = getVowelExtension(token.swara);
        parts.push(syllable.toUpperCase());
        // don't add the ; here — the next iteration will add it
      } else {
        // No semicolon — stretch fully PAAA / NIII / MAAA
        parts.push(stretchSyllable(token.swara, syllable));
      }
    } else {
      parts.push(syllable.toUpperCase());
    }
  }

  return parts.join(" ");
}

// How to stretch each swara's vowel sound
function stretchSyllable(swara: string, syllable: string): string {
  const stretches: Record<string, string> = {
    "Sa":  "SAAA",
    "*Sa": "SAAA",
    "Re":  "RIII",
    "Ga":  "GAAA",
    "Ma":  "MAAA",
    "Pa":  "PAAA",
    "Dha": "DHAA",
    "Ni":  "NIII",
  };
  return stretches[swara] ?? syllable.toUpperCase() + "AA";
}

function getVowelExtension(swara: string): string {
  const extensions: Record<string, string> = {
    "Sa":  "AA",
    "*Sa": "AA",
    "Re":  "II",
    "Ga":  "AA",
    "Ma":  "AA",
    "Pa":  "AA",
    "Dha": "AA",
    "Ni":  "II",
  };
  return extensions[swara] ?? "AA";
}

const SWARA_SYLLABLE: Record<string, string> = {
  "Sa":  "sa",
  "*Sa": "sa",
  "Re":  "ri",
  "Ga":  "ga",
  "Ma":  "ma",
  "Pa":  "pa",
  "Dha": "dha",
  "Ni":  "ni",
};