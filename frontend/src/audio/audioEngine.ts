import * as Tone from "tone";

// ── Swara → Western note mapping (Sa = C4) ───────────────────────────────────
export const SWARA_TO_NOTE: Record<string, string> = {
  // Lower octave
  "Sa.":  "C3",
  "Re.":  "D3",
  "Ga.":  "E3",
  "Ma.":  "F3",
  "Pa.":  "G3",
  "Dha.": "A3",
  "Ni.":  "B3",
  // Middle octave (main)
  "Sa":   "C4",
  "Re":   "D4",
  "Ga":   "E4",
  "Ma":   "F4",
  "Pa":   "G4",
  "Dha":  "A4",
  "Ni":   "B4",
  // Upper octave
  "Sa'":  "C5",
  "Re'":  "D5",
  "Ga'":  "E5",
  "Ma'":  "F5",
  "Pa'":  "G5",
  "Dha'": "A5",
  "Ni'":  "B5",
};

export type SwaraName = keyof typeof SWARA_TO_NOTE;

// ── Instrument state ──────────────────────────────────────────────────────────
let _harmonium: Tone.Sampler | null = null;
let _harmoniumReady = false;
let _loadingPromise: Promise<void> | null = null;

// ── Load harmonium samples ────────────────────────────────────────────────────

export async function loadHarmonium(): Promise<void> {
  if (_harmoniumReady) return;
  
  await Tone.start();

  return new Promise((resolve) => {
    _harmonium = new Tone.Sampler({
      urls: {
        "A2": "A2.mp3",
        "A3": "A3.mp3",
        "A4": "A4.mp3",
        "C2": "C2.mp3",
        "C3": "C3.mp3",
        "C4": "C4.mp3",
        "C5": "C5.mp3",
        "D#2": "Ds2.mp3",
        "D#3": "Ds3.mp3",
        "D#4": "Ds4.mp3",
        "F#2": "Fs2.mp3",
        "F#3": "Fs3.mp3",
      },
      release: 1,
      baseUrl: "/audio/harmonium/",
    }).toDestination();

    // Poll until loaded instead of relying on onload callback
    const check = setInterval(() => {
      if (_harmonium!.loaded) {
        clearInterval(check);
        _harmoniumReady = true;
        _loadingPromise = null;
        console.log("Harmonium ready ✓");
        resolve();
      }
    }, 100);

    // Safety timeout
    setTimeout(() => {
      clearInterval(check);
      if (!_harmoniumReady) {
        console.warn("Harmonium timed out");
        resolve();
      }
    }, 15000);
  });
}

export function isHarmoniumReady(): boolean {
  return _harmoniumReady;
}

// ── Play a single swara ───────────────────────────────────────────────────────
export async function playSwara(
  swara: SwaraName,
  duration: number = 0.8,  // seconds
  startDelay: number = 0,  // seconds from now
) {
  await Tone.start();
  if (!_harmoniumReady || !_harmonium) {
    await loadHarmonium();
  }
  const note = SWARA_TO_NOTE[swara];
  if (!note) return;
  _harmonium!.triggerAttackRelease(note, duration, Tone.now() + startDelay);
}

// ── Play a sequence of swaras ─────────────────────────────────────────────────
export type BeatToken = {
  swara: SwaraName | null;
  wave: boolean;           // ~~ = held/oscillated
  duration: number;        // seconds
};

type PlayHandle = {
  stop: () => void;
};

export function playPattern(
  beats: BeatToken[],
  onBeat?: (index: number, swara: SwaraName | null) => void,
  onEnd?: () => void,
): PlayHandle {
  let stopped = false;
  let cursor = 0;

  beats.forEach((beat, i) => {
    const delay = cursor * 1000;

    // Schedule audio
    if (beat.swara) {
      setTimeout(async () => {
        if (stopped) return;
        await Tone.start();
        if (!_harmoniumReady || !_harmonium) return;
        const note = SWARA_TO_NOTE[beat.swara!];
        if (note) {
          // For wave beats hold slightly longer for sustained feel
          const dur = beat.wave ? beat.duration * 0.95 : beat.duration * 0.85;
          _harmonium!.triggerAttackRelease(note, dur);
        }
      }, delay);
    }

    // Schedule UI callback
    setTimeout(() => {
      if (!stopped && onBeat) onBeat(i, beat.swara);
    }, delay);

    cursor += beat.duration;
  });

  // onEnd
  const totalMs = cursor * 1000;
  setTimeout(() => {
    if (!stopped && onEnd) onEnd();
  }, totalMs);

  return {
    stop: () => { stopped = true; },
  };
}

// ── Tanpura drone ─────────────────────────────────────────────────────────────
// Using Web Audio API sine waves for drone — harmonium samples
// are for melodic notes, drone is better as a continuous tone
let _tanpuraCtx: AudioContext | null = null;
let _tanpuraGains: GainNode[] = [];
let _tanpuraOscs: OscillatorNode[] = [];
let _tanpuraRunning = false;

const SA_HZ = 261.63;  // C4

export function startTanpura() {
  if (_tanpuraRunning) return;
  stopTanpura();

  const ctx = new AudioContext();
  _tanpuraCtx = ctx;
  const t = ctx.currentTime;

  // Sa (C3), Pa (G3), Sa (C4), Sa' (C5) — tanpura strings
  const strings = [
  { hz: SA_HZ / 2,   vol: 0.03 },  // low Sa — reduced
  { hz: SA_HZ * 1.5, vol: 0.02 },  // Pa — reduced
  { hz: SA_HZ,       vol: 0.04 },  // middle Sa — reduced
  { hz: SA_HZ * 2,   vol: 0.02 },  // high Sa — reduced
];

  strings.forEach(({ hz, vol }) => {
    [1, 2].forEach((harmonic, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz * harmonic;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol / (i + 1), t + 2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      _tanpuraOscs.push(osc);
      _tanpuraGains.push(gain);
    });
  });

  _tanpuraRunning = true;
}

export function stopTanpura() {
  const ctx = _tanpuraCtx;
  if (ctx) {
    const t = ctx.currentTime;
    _tanpuraGains.forEach(g => {
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.4);
      } catch (_) {}
    });
    setTimeout(() => {
      _tanpuraOscs.forEach(o => { try { o.stop(); } catch (_) {} });
      try { ctx.close(); } catch (_) {}
      _tanpuraOscs = [];
      _tanpuraGains = [];
      _tanpuraCtx = null;
      _tanpuraRunning = false;
    }, 500);
  } else {
    _tanpuraOscs = [];
    _tanpuraGains = [];
    _tanpuraRunning = false;
  }
}

export function isTanpuraRunning(): boolean {
  return _tanpuraRunning;
}

// ── Taalam click ──────────────────────────────────────────────────────────────
export function playTaalam(
  beatDuration: number,
  totalBeats: number,
  onBeat?: (beat: number) => void,
): { stop: () => void } {
  let stopped = false;

  for (let i = 0; i < totalBeats; i++) {
    const delay = i * beatDuration * 1000;
    setTimeout(() => {
      if (stopped) return;
      // Click sound via Web Audio
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      // Beat 1 and 5 = slap (lower pitch), others = tap (higher)
      osc.frequency.value = (i === 0 || i === 4) ? 160 : 200;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(
        (i === 0 || i === 4) ? 0.15 : 0.08,
        ctx.currentTime + 0.005
      );
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
      setTimeout(() => ctx.close(), 200);

      if (onBeat) onBeat(i);
    }, delay);
  }

  return { stop: () => { stopped = true; } };
}