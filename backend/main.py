import io
import os
import subprocess
import tempfile
import threading
import time
import uuid

import ffmpeg
import librosa
import numpy as np
import parselmouth
import scipy.signal
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastdtw import fastdtw
from silero_vad import load_silero_vad, get_speech_timestamps

from song_store import (
    SONG_SA, SONG_STORAGE, SONG_REF_CENTS, SONG_REF_TIMES, SONG_REF_READY,
    SONG_REF_HZ, SONG_REF_HZ_TIMES, SONG_REF_HZ_READY
)

# ── Pre-compute filter once ───────────────────────────────────────────────────
_NYQ = 16000 / 2
_B, _A = scipy.signal.butter(4, [80 / _NYQ, 500 / _NYQ], btype="band")

# ── Load Silero VAD once at startup ───────────────────────────────────────────
print("Loading Silero VAD...")
_VAD_MODEL = load_silero_vad()
print("Silero VAD ready.")

# ── Swara map (cents from Sa) ─────────────────────────────────────────────────
_SWARAS = [
    ("Sa",   0),
    ("Re",   200),
    ("Ga",   400),
    ("Ma",   500),
    ("Pa",   700),
    ("Dha",  900),
    ("Ni",   1100),
]

# ── Sarali Swaras reference generation ───────────────────────────────────────

_SWARA_CENTS = {
    "Sa": 0, "Re": 200, "Ga": 400, "Ma": 500,
    "Pa": 700, "Dha": 900, "Ni": 1100, "*Sa": 1200,
}
# ── Song Coach: Understanding pipeline ────────────────────────────────────────
# Add this to main.py. Reuses: load_audio, extract_voice_only (Silero VAD),
# analyze_voice_quality (pitch/HNR), librosa.

import random

WINDOW_SECONDS = 5.0

# ── Step 1: Window the song and check vocal presence per window ──────────────

def get_vocal_windows(y: np.ndarray, sr: int, duration: float) -> list[dict]:
    """
    Splits the song into fixed 5s windows. For each window, checks if Silero VAD
    detects voice presence, and if so, analyzes pitch/HNR/register for that window.
    """
    windows = []
    n_windows = int(np.ceil(duration / WINDOW_SECONDS))

    for i in range(n_windows):
        start = i * WINDOW_SECONDS
        end = min((i + 1) * WINDOW_SECONDS, duration)
        start_sample = int(start * sr)
        end_sample = int(end * sr)
        segment = y[start_sample:end_sample]

        if len(segment) < sr * 0.5:
            continue

        # Use existing Silero VAD to check vocal presence in this window
        voiced = extract_voice_only(segment, sr)
        has_vocal = len(voiced) > len(segment) * 0.15  # at least 15% voiced

        window_data = {
            "start": round(start, 1),
            "end": round(end, 1),
            "has_vocal": has_vocal,
            "register": None,
            "median_pitch_hz": None,
            "hnr": None,
        }

        if has_vocal and len(voiced) > sr * 0.3:
         analysis = analyze_voice_quality(voiced, sr)
         window_data["median_pitch_hz"] = analysis["median_pitch_hz"]
         window_data["hnr"] = analysis["hnr"]
         window_data["register"] = classify_song_register(analysis["median_pitch_hz"])

        windows.append(window_data)

    return windows

def classify_song_register(median_hz: float) -> str:
    """Register classification for analyzing a song's vocal track (not live mic).
    No 'talking_voice' category — assumes the singer is always actually singing."""
    if median_hz < 220:
        return "chest_voice"
    elif median_hz < 340:
        return "mixed_voice"
    else:
        return "head_voice"

# ── Step 2: Detect transitions between consecutive vocal windows ─────────────

PITCH_JUMP_THRESHOLD_HZ = 100.0  # was 80 — raise to avoid noise
MIN_GAP_BETWEEN_TRANSITIONS_SEC = 15.0  # ignore transitions too close to the previous one

def detect_transitions(windows: list[dict]) -> list[dict]:
    transitions = []
    prev_vocal_window = None
    last_transition_time = -999

    for w in windows:
        if not w["has_vocal"] or w["median_pitch_hz"] is None:
            continue

        if prev_vocal_window is not None:
            register_changed = w["register"] != prev_vocal_window["register"]
            pitch_delta = w["median_pitch_hz"] - prev_vocal_window["median_pitch_hz"]
            big_jump = abs(pitch_delta) > PITCH_JUMP_THRESHOLD_HZ
            enough_gap = (w["start"] - last_transition_time) >= MIN_GAP_BETWEEN_TRANSITIONS_SEC

            if (register_changed or big_jump) and enough_gap:
                transitions.append({
                    "at": w["start"],
                    "from_register": prev_vocal_window["register"],
                    "to_register": w["register"],
                    "pitch_delta": round(pitch_delta, 1),
                    "direction": "up" if pitch_delta > 0 else "down",
                    "register_changed": register_changed,
                })
                last_transition_time = w["start"]

        prev_vocal_window = w

    return transitions


# ── Step 3: Phrase banks for the teacher-style walkthrough ────────────────────

OPENING_PHRASES = [
    "This song opens {register_desc}.",
    "Right from the start, the song settles {register_desc}.",
    "The first thing you'll notice — it begins {register_desc}.",
]

REGISTER_DESC = {
    "chest_voice": "low and grounded, sitting comfortably in chest voice",
    "mixed_voice": "in a comfortable middle register — mixed voice territory",
    "head_voice": "up high, in head voice",
}

REGISTER_DESC_SHORT = {
    "chest_voice": "chest voice",
    "mixed_voice": "mixed voice",
    "head_voice": "head voice",
}

STEADY_PHRASES = [
    "It stays {register_desc} through to {end_time} — a stable place for your voice to settle in.",
    "This continues comfortably {register_desc} until {end_time}.",
    "Nothing dramatic happens here — just steady {register_desc} singing until {end_time}.",
]

TRANSITION_UP_PHRASES = [
    "Then, right at {time}, it lifts — the melody climbs into {to_register_desc}. This is where you'll need to open up and let the sound rise with it.",
    "At {time}, the song asks more of the voice — it rises into {to_register_desc}. Don't push here; let it lift naturally.",
    "Watch for {time} — the melody jumps upward into {to_register_desc}. This is the moment the song wants you to lighten your sound.",
    "There's a clear lift at {time}, moving into {to_register_desc}. Let your voice float up rather than reach for it.",
    "By {time}, the energy builds and the melody pushes into {to_register_desc} — ride that lift, don't force it.",
]

TRANSITION_DOWN_PHRASES = [
    "At {time}, the melody settles back down into {to_register_desc} — let your voice relax and ground itself again.",
    "Then at {time}, it comes back down to {to_register_desc}. This is a moment to breathe and reset.",
    "By {time}, the song pulls back into {to_register_desc} — a gentler, more grounded moment.",
    "At {time}, things ease off, returning to {to_register_desc}. A good place to recover your breath.",
    "The intensity drops at {time}, settling into {to_register_desc} — let it feel effortless.",
]

INSTRUMENTAL_PHRASES = [
    "Between {start} and {end}, the voice steps back and the instruments take over — a good moment to just listen.",
    "From {start} to {end} there's no vocal — purely instrumental. Use this space to rest your voice.",
]

CLOSING_PHRASES = [
    "By the end, the song has taken your voice through {register_count} distinct registers — that's the real challenge here.",
    "Overall, this song moves through {register_count} different vocal registers. Knowing where each one is means you won't get caught off guard.",
]


def format_time(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}:{s:02d}"


def generate_walkthrough(windows: list[dict], transitions: list[dict]) -> str:
    vocal_windows = [w for w in windows if w["has_vocal"] and w["register"]]
    if not vocal_windows:
        return "This song doesn't have a clear vocal line for me to walk you through yet — try a song with vocals throughout."

    paragraphs = []
    introduced_registers = set()

    def desc(register: str) -> str:
        if register in introduced_registers:
            return REGISTER_DESC_SHORT.get(register, register)
        introduced_registers.add(register)
        return REGISTER_DESC.get(register, register)

    first = vocal_windows[0]
    opening = random.choice(OPENING_PHRASES).format(register_desc=desc(first["register"]))
    paragraphs.append(opening)

    if transitions:
        for t in transitions:
            time_str = format_time(t["at"])
            to_desc = desc(t["to_register"])

            if t["direction"] == "up":
                phrase = random.choice(TRANSITION_UP_PHRASES).format(time=time_str, to_register_desc=to_desc)
            else:
                phrase = random.choice(TRANSITION_DOWN_PHRASES).format(time=time_str, to_register_desc=to_desc)
            paragraphs.append(phrase)
    else:
        last = vocal_windows[-1]
        steady = random.choice(STEADY_PHRASES).format(
            register_desc=desc(first["register"]), end_time=format_time(last["end"])
        )
        paragraphs.append(steady)

    # ... instrumental gap detection stays the same ...

    closing = random.choice(CLOSING_PHRASES).format(register_count=len(introduced_registers))
    paragraphs.append(closing)

    return " ".join(paragraphs)


# ── Step 4: Genre placeholder ─────────────────────────────────────────────────

def classify_genre_placeholder(y: np.ndarray, sr: int) -> str:
    """
    Placeholder — returns a fixed string until Essentia genre model is wired in.
    """
    return "Not yet detected"

def swara_to_cents(swara: str) -> float:
    return float(_SWARA_CENTS.get(swara, 0))


def build_sarali_reference(tokens: list[dict], time_per_akshara: float) -> tuple[np.ndarray, np.ndarray]:
    """
    tokens: list of {"swara": str, "slots": int} in playback order
            (";" tokens already merged into preceding note's duration by frontend)
    time_per_akshara: seconds per 1 slot at the tested kaalam

    Returns (times, cents) arrays sampled at ~50ms resolution, matching
    the format of SONG_REF_TIMES / SONG_REF_CENTS for reuse with fastdtw.
    """
    times = []
    cents = []
    t = 0.0
    SAMPLE_DT = 0.05

    for tok in tokens:
        swara = tok["swara"]
        slots = tok["slots"]
        duration = slots * time_per_akshara
        c = swara_to_cents(swara)

        n_samples = max(1, int(duration / SAMPLE_DT))
        for i in range(n_samples):
            times.append(t + i * SAMPLE_DT)
            cents.append(c)
        t += duration

    return np.array(times), np.array(cents)


def cents_to_swara(c: float) -> str:
    c_mod = c % 1200
    name, _ = min(_SWARAS, key=lambda x: abs(c_mod - x[1]))
    if c < -50:
        return name + "ˡ"
    return name


def pitch_curve_to_swara_path(cents: np.ndarray) -> list[dict]:
    """
    Convert a pitch curve (cents from Sa) into a swara path with arrows.
    Returns list of {swara, cents, direction} dicts.
    Groups consecutive same-swara frames into one entry.
    """
    if len(cents) == 0:
        return []

    path = []
    prev_swara = None
    prev_cents = None

    for c in cents:
        swara = cents_to_swara(float(c))
        if swara != prev_swara:
            if prev_swara is not None:
                direction = "↑" if float(c) > prev_cents else "↓" if float(c) < prev_cents else "→"
            else:
                direction = "→"
            path.append({
                "swara": swara,
                "cents": float(c),
                "direction": direction
            })
            prev_swara = swara
            prev_cents = float(c)

    return path


# ── Audio loading ─────────────────────────────────────────────────────────────

def _is_webm(data: bytes) -> bool:
    return data[:4] == b'\x1aE\xdf\xa3' or data[:4] == b'OggS'


def load_audio(audio_bytes: bytes, target_sr: int = 16000) -> tuple[np.ndarray, int]:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(audio_bytes)
        in_path = tmp.name

    out_path = tempfile.mktemp(suffix=".wav")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", in_path,
             "-ac", "1", "-ar", str(target_sr),
             "-f", "wav", out_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )  # NO check=True — ignore non-zero exit, partial chunks are fine
        if not os.path.exists(out_path) or os.path.getsize(out_path) < 100:
            return np.zeros(target_sr, dtype=np.float32), target_sr
        y, _ = sf.read(out_path, dtype="float32", always_2d=False)
        if y.ndim == 2:
            y = y[:, 0]
        return y.astype(np.float32), target_sr
    finally:
        try: os.unlink(in_path)
        except: pass
        try: os.unlink(out_path)
        except: pass


# ── Silero VAD: extract only voice frames ─────────────────────────────────────

def extract_voice_only(y: np.ndarray, sr: int) -> np.ndarray:
    """
    Use Silero VAD to keep only frames where a human voice is detected.
    This is much stronger than noisereduce for filtering background noise.
    """
    tensor = torch.from_numpy(y)
    timestamps = get_speech_timestamps(
        tensor,
        _VAD_MODEL,
        sampling_rate=sr,
        threshold=0.3,
        min_speech_duration_ms=150,
        min_silence_duration_ms=100,
    )
    if not timestamps:
        return y  # return as-is if no speech detected (let downstream handle it)

    voiced_frames = []
    for ts in timestamps:
        voiced_frames.append(y[ts["start"]: ts["end"]])
    return np.concatenate(voiced_frames)


# ── Parselmouth voice quality analysis ───────────────────────────────────────

def analyze_voice_quality(y: np.ndarray, sr: int, speaking_pitch_hz: float = None, speaking_hnr: float = None) -> dict:
    sound = parselmouth.Sound(y, sampling_frequency=sr)

    harmonicity = sound.to_harmonicity()
    hnr_values = harmonicity.values[harmonicity.values != -200]
    hnr = float(np.mean(hnr_values)) if len(hnr_values) > 0 else 0.0

    pitch_obj = sound.to_pitch(
    time_step=0.02,
    pitch_floor=80,
    pitch_ceiling=350,
)
    pitch_values = pitch_obj.selected_array["frequency"]
    pitch_values = pitch_values[pitch_values > 0]
    median_pitch = float(np.median(pitch_values)) if len(pitch_values) > 0 else 0.0

    # Pitch stability — lower variance = more stable
    pitch_variance = float(np.std(pitch_values)) if len(pitch_values) > 1 else 0.0

    if speaking_pitch_hz and speaking_pitch_hz > 80 and speaking_hnr is not None:
        sp = speaking_pitch_hz
        sh = speaking_hnr

        # Normalise singing pitch to same octave as speaking
        singing = median_pitch
        while singing > sp * 2.2:
            singing /= 2
        while singing < sp * 0.5:
            singing *= 2

        pitch_delta = singing - sp          # Hz difference after octave normalisation
        hnr_delta = hnr - sh                # positive = singing clearer than speaking
        ratio = singing / sp

        # Build the human-language description of what changed
        # Pitch change description
        abs_delta = abs(round(pitch_delta))
        if abs_delta < 8:
            pitch_desc = "your pitch stayed almost exactly the same"
        elif pitch_delta > 0:
            pitch_desc = f"your pitch moved {abs_delta} Hz higher"
        else:
            pitch_desc = f"your pitch moved {abs_delta} Hz lower"

        # Quality change description
        if hnr_delta > 4:
            quality_desc = "your voice became noticeably clearer and more resonant"
        elif hnr_delta > 1.5:
            quality_desc = "your voice became slightly cleaner"
        elif hnr_delta < -2:
            quality_desc = "your voice became a little breathier — that is fine for now"
        else:
            quality_desc = "the quality stayed about the same"

        # Now classify register using both pitch ratio and HNR delta
        if ratio < 1.08 and hnr_delta < 2:
            register = "talking_voice"
            register_msg = (
                f"You are singing in the same place as your speaking voice — {pitch_desc} and {quality_desc}. "
                "That is completely normal for a first attempt. "
                "Try again — say Hello, then on the 'o', let the sound bloom outward "
                "like you are calling to someone far away. Do not push — just open."
            )
        elif ratio < 1.08 and hnr_delta >= 2:
            # Pitch barely moved but quality improved — they found resonance without moving pitch
            register = "chest_voice"
            register_msg = (
                f"Good — {pitch_desc} but {quality_desc}. "
                "That shift in quality is exactly what finding your singing voice feels like. "
                "This is your chest voice — warm and grounded."
            )
        elif ratio < 1.55:
            register = "chest_voice"
            register_msg = (
                f"{pitch_desc.capitalize()} and {quality_desc}. "
                "That is your chest voice — the warm, grounded register that forms the "
                "foundation of all your lower notes. This is exactly where you want to be."
            )
        elif ratio < 2.05:
            register = "mixed_voice"
            register_msg = (
                f"{pitch_desc.capitalize()} and {quality_desc}. "
                "You are in your mixed voice — the blend between chest and head. "
                "This is a healthy singing register and it means your voice is already exploring its range."
            )
        else:
            register = "head_voice"
            register_msg = (
                f"{pitch_desc.capitalize()} and {quality_desc}. "
                "That is your head voice — lighter and higher than your speaking voice. "
                "Good for high notes. Make sure it feels effortless, not pushed."
            )

    else:
        # Absolute fallback — no speaking baseline available
        if median_pitch < 165:
            register = "talking_voice"
            register_msg = "You are singing close to your speaking voice — try letting the sound open up slightly"
        elif median_pitch < 260:
            register = "chest_voice"
            register_msg = "Good chest voice — warm and grounded. This is the right foundation for your lower notes."
        elif median_pitch < 400:
            register = "mixed_voice"
            register_msg = "Good mixed voice — you are finding the blend between chest and head."
        else:
            register = "head_voice"
            register_msg = "Head voice — light and clear. Good for high notes."

    # Strain detection — loosened for beginners
    if hnr > 5:
        strain = "none"
        strain_msg = "Your voice sounds healthy and clear"
    elif hnr > 1:
        strain = "mild"
        strain_msg = "Slight breathiness — take a deeper breath before singing"
    else:
        strain = "significant"
        strain_msg = "Your voice sounds strained — stop, rest, drink water and try again"

    return {
        "hnr": round(hnr, 1),
        "median_pitch_hz": round(median_pitch, 1),
        "pitch_variance": round(pitch_variance, 1),
        "register": register,
        "register_message": register_msg,
        "strain": strain,
        "strain_message": strain_msg,
    }


# ── Song Sa extraction ────────────────────────────────────────────────────────

def extract_song_sa(y: np.ndarray, sr: int) -> float | None:
    """Extract the tonic (Sa) from the song using Yin pitch detection."""
    f0 = librosa.yin(y, fmin=60, fmax=400, sr=sr)
    f0 = f0[f0 > 0]
    if len(f0) < 20:
        return None
    return float(np.median(f0))


# ── Background ref extraction ─────────────────────────────────────────────────

def _extract_ref_background(song_id: str, file_path: str, song_sa: float):
    try:
        print(f"[BG] Extracting ref pitch for {song_id}")
        y, sr = librosa.load(file_path, sr=8000, mono=True)  # lower sr = faster
        hop = 512  # bigger hop = faster
        f0 = librosa.yin(y, fmin=60, fmax=1200, sr=sr, hop_length=hop)
        times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop)
        
        mask = (f0 > 0) & (f0 < 2000)
        if not np.any(mask):
            SONG_REF_READY[song_id] = True
            return

        raw_f0 = f0[mask].copy()
        raw_times = times[mask]

        for i in range(len(raw_f0)):
            hz = raw_f0[i]
            while hz < song_sa * 0.65: hz *= 2
            while hz > song_sa * 1.9:  hz /= 2
            raw_f0[i] = hz

        cents = 1200 * np.log2(raw_f0 / song_sa)
        valid = (cents > -100) & (cents < 1250)

        SONG_REF_CENTS[song_id] = cents[valid]
        SONG_REF_TIMES[song_id] = raw_times[valid]
        print(f"[BG] Done. {np.sum(valid)} frames.")
        SONG_REF_READY[song_id] = True
    except Exception as e:
        print(f"[BG] Failed: {e}")
        SONG_REF_READY[song_id] = True


# ── Ref lookup ────────────────────────────────────────────────────────────────

def get_ref_cents_at(song_id: str, t: float) -> float | None:
    times = SONG_REF_TIMES.get(song_id)
    cents = SONG_REF_CENTS.get(song_id)
    if times is None or len(times) == 0:
        return None
    idx = int(np.argmin(np.abs(times - t)))
    return float(cents[idx])


# ── Teacher feedback ──────────────────────────────────────────────────────────

def build_teacher_feedback(
    pitch_shape_score: float,
    direction: float,
    rhythm_score: float,
    stability: str,
    voice_quality: dict,
) -> str:
    """
    Generate teacher-style feedback based on what physically went wrong.
    No swar a names, no Hz values — just actionable physical guidance.
    """
    # Priority 1: voice strain
    if voice_quality["strain"] == "significant":
        return voice_quality["strain_message"]

    # Priority 2: wrong voice register
    if voice_quality["register"] == "talking_voice":
        return voice_quality["register_message"]

    # Priority 3: instability
    if stability == "unstable":
        return "Your voice is shaking — take a slow deep breath before you start, fill your belly not just your chest, and try again"

    # Priority 4: pitch shape
    if pitch_shape_score < 40:
        if direction > 80:
            return "You're singing the whole phrase too high — before you start, hum at a comfortable low note and begin from there"
        elif direction < -80:
            return "You're singing the whole phrase too low — try starting the phrase slightly higher than feels natural"
        else:
            return "The phrase shape isn't matching yet — listen to it one more time with your eyes closed, focus on where it rises and falls, then try again"

    if pitch_shape_score < 65:
        if direction > 30:
            return "You're slightly high overall — let your voice relax down a little before you start"
        elif direction < -30:
            return "You're slightly low overall — think of sending your voice forward and slightly up as you begin"
        else:
            return "Getting closer — you have the right idea. Focus on the moments where the phrase goes up or down and try to exaggerate those movements slightly"

    # Priority 5: rhythm
    if rhythm_score < 60:
        return "Your pitch is good but you're rushing — listen to the pace of the phrase once more and try to match it beat by beat"

    # Good performance
    if pitch_shape_score >= 80:
        return "That was really good — your voice matched the shape of the phrase well. Try it one more time to make it feel natural"

    return "Good effort — you're getting the shape right. One more attempt and it will start to feel comfortable"


# ── Convert to WAV ────────────────────────────────────────────────────────────

def convert_to_wav(input_path: str) -> str:
    output = tempfile.mktemp(suffix=".wav")
    ffmpeg.input(input_path).output(output, ac=1, ar=16000).run(
        overwrite_output=True, quiet=True)
    return output

# Store for song pitch curves (Hz, not cents)
SONG_REF_HZ: dict = {}
SONG_REF_HZ_TIMES: dict = {}
SONG_REF_HZ_READY: dict = {}

def _extract_ref_hz_background(song_id: str, file_path: str):
    """Extract raw Hz pitch curve from song — no Sa, no cents, pure shape."""
    try:
        print(f"[HZ_BG] Extracting Hz curve for {song_id}")
        y, sr = librosa.load(file_path, sr=8000, mono=True)
        hop = 512
        f0 = librosa.yin(y, fmin=60, fmax=1200, sr=sr, hop_length=hop)
        times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop)
        mask = (f0 > 60) & (f0 < 1200)
        if not np.any(mask):
            SONG_REF_HZ_READY[song_id] = True
            return
        SONG_REF_HZ[song_id] = f0[mask].copy()
        SONG_REF_HZ_TIMES[song_id] = times[mask]
        print(f"[HZ_BG] Done. {np.sum(mask)} frames.")
        SONG_REF_HZ_READY[song_id] = True
    except Exception as e:
        print(f"[HZ_BG] Failed: {e}")
        SONG_REF_HZ_READY[song_id] = True


def build_song_shape_feedback(
    pitch_shape: float,
    direction: float,
    stability: str,
    voice_quality: dict,
) -> str:
    """Teacher-style feedback for song practice — guide not judge."""

    if voice_quality["strain"] == "significant":
        return voice_quality["strain_message"]

    if voice_quality["register"] == "talking_voice":
        return voice_quality["register_message"]

    if stability == "unstable":
        return "Your voice is shaking a little — take a slow breath, fill your belly, and try again"

    if pitch_shape >= 80:
        return "Your voice followed the shape of the song really well — the rises and falls are matching. Sing it once more to make it feel natural"

    if pitch_shape >= 60:
        if direction > 0.1:
            return "You are following the shape well but sitting slightly high overall — relax your voice down a little before you start"
        elif direction < -0.1:
            return "Good movement — just slightly low overall. Think of sending your voice a little forward and up as you begin"
        else:
            return "Getting closer — you have the right idea. Focus on the moments where the melody rises or falls and try to exaggerate those movements slightly"

    if pitch_shape >= 35:
        return "You are starting to find the shape. Listen to this phrase one more time with your eyes closed — notice just where it goes up and where it comes back down"

    return "Listen to the phrase once more before singing. Focus only on the general shape — does it rise, fall, or stay level? Then try again"

def build_song_test_feedback(
    pitch_shape: float,
    direction: float,
    stability: str,
    voice_quality: dict,
) -> str:
    """Teacher-style judgment for test mode — honest, direct, no tips."""

    if voice_quality["strain"] == "significant":
        return voice_quality["strain_message"]

    if voice_quality["register"] == "talking_voice":
        return "You sang in your talking voice — that won't work for this song. Singing voice needed."

    if stability == "unstable":
        return "Your pitch was unstable throughout — the voice was shaking. Work on breath support first."

    if pitch_shape >= 80:
        return "Strong — your voice followed the song's shape well. The rises and falls were accurate."

    if pitch_shape >= 60:
        if direction > 0.1:
            return "Mostly correct shape but you sat too high overall — pull the voice down slightly."
        elif direction < -0.1:
            return "Mostly correct shape but you sat too low overall — the voice needs to open up."
        else:
            return "Shape is partially there but not consistent — some phrases matched, others drifted."

    if pitch_shape >= 35:
        return "The shape wasn't matching — you heard the phrase but the voice didn't follow it accurately yet."

    return "The voice didn't follow the song's shape. More listening practice needed before testing."

# ── App setup ─────────────────────────────────────────────────────────────────

torch.set_num_threads(4)
app = FastAPI()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """Upload a song. Extracts Sa and starts background pitch extraction."""
    song_id  = str(uuid.uuid4())
    raw_path = os.path.join(UPLOAD_DIR, f"{song_id}_raw")
    with open(raw_path, "wb") as f:
        f.write(await file.read())

    file_path = convert_to_wav(raw_path)
    SONG_STORAGE[song_id] = file_path
    SONG_REF_READY[song_id] = False

    y, sr = librosa.load(file_path, sr=8000, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)
    song_sa  = extract_song_sa(y[:int(20 * sr)], sr)

    if song_sa:
        SONG_SA[song_id] = song_sa
        print(f"Song SA: {song_sa:.1f} Hz")
        threading.Thread(
            target=_extract_ref_background,
            args=(song_id, file_path, song_sa),
            daemon=True
        ).start()
    else:
        print("WARNING: could not extract song Sa")
        SONG_REF_READY[song_id] = True

    return {"song_id": song_id, "duration": duration, "song_sa_hz": song_sa}


@app.get("/analyze_ready/{song_id}")
def analyze_ready(song_id: str):
    return {"ready": SONG_REF_READY.get(song_id, False)}


@app.get("/song_sa/{song_id}")
def song_sa(song_id: str):
    sa = SONG_SA.get(song_id)
    if not sa:
        raise HTTPException(404, "Sa not found")
    return {"song_sa_hz": sa}


@app.get("/song/{song_id}")
def get_song(song_id: str):
    path = SONG_STORAGE.get(song_id)
    if not path:
        raise HTTPException(404, "Song not found")
    return FileResponse(path, media_type="audio/wav")


@app.get("/phrase_notation/{song_id}")
def phrase_notation(song_id: str, start: float, end: float):
    """
    Return the swara path for a phrase — what notes the song visits
    between start and end time, with direction arrows.
    """
    times = SONG_REF_TIMES.get(song_id)
    cents = SONG_REF_CENTS.get(song_id)
    if times is None or len(times) == 0:
        raise HTTPException(404, "Ref data not ready yet")

    mask = (times >= start) & (times <= end)
    if not np.any(mask):
        raise HTTPException(404, "No pitch data in this time range")

    phrase_cents = cents[mask]
    phrase_times = times[mask]

    # Downsample to ~20 points max for display
    if len(phrase_cents) > 20:
        indices = np.linspace(0, len(phrase_cents) - 1, 20, dtype=int)
        phrase_cents = phrase_cents[indices]
        phrase_times = phrase_times[indices]

    swara_path = pitch_curve_to_swara_path(phrase_cents)

    # Also return raw curve for visualization
    curve = [
        {"time": float(t), "cents": float(c)}
        for t, c in zip(phrase_times, phrase_cents)
    ]

    return {
        "swara_path": swara_path,
        "curve": curve,
        "min_cents": float(np.min(phrase_cents)),
        "max_cents": float(np.max(phrase_cents)),
    }


@app.post("/live_pitch")
async def live_pitch(
    file: UploadFile = File(...),
    song_id: str = Form(...),
    current_time: float = Form(...),
):
    """Real-time pitch feedback during singing."""
    audio_bytes = await file.read()
    y, sr = load_audio(audio_bytes, target_sr=16000)

    if len(y) < sr * 0.1:
        return {"status": "too_short"}

    # VAD filter — only analyse actual voice frames
    y_voiced = extract_voice_only(y, sr)
    if len(y_voiced) < sr * 0.05:
        return {"status": "no_voice", "color": "gray"}

    # Bandpass
    y_filt = scipy.signal.filtfilt(_B, _A, y_voiced)

    # Fast pitch via autocorrelation
    lag_min = int(sr / 500)
    lag_max = int(sr / 80)
    frame_len = int(0.04 * sr)
    hop_len   = int(0.02 * sr)
    n_frames  = (len(y_filt) - frame_len) // hop_len

    pitches = []
    if n_frames > 0:
        frames = np.lib.stride_tricks.as_strided(
            y_filt,
            shape=(n_frames, frame_len),
            strides=(y_filt.strides[0] * hop_len, y_filt.strides[0])
        )
        for frame in frames[:25]:
            n = len(frame)
            fft_size = 1 << (2 * n - 1).bit_length()
            fft_f = np.fft.rfft(frame, n=fft_size)
            corr  = np.fft.irfft(fft_f * np.conj(fft_f))[:n]
            if lag_max >= n or corr[0] < 1e-6:
                continue
            seg      = corr[lag_min:lag_max]
            peak_lag = int(np.argmax(seg)) + lag_min
            if corr[peak_lag] / corr[0] < 0.3:
                continue
            pitches.append(float(sr / peak_lag))

    if len(pitches) < 3:
        return {"status": "no_pitch", "color": "gray"}

    user_hz  = float(np.median(pitches))
    song_sa  = SONG_SA.get(song_id)
    if not song_sa:
        return {"status": "not_ready"}

    # Normalise to same octave as song Sa
    while user_hz > song_sa * 1.95: user_hz /= 2
    while user_hz < song_sa * 0.5:  user_hz *= 2

    user_cents = 1200 * np.log2(user_hz / song_sa)
    user_swara = cents_to_swara(user_cents)
    ref_cents  = get_ref_cents_at(song_id, current_time)

    if ref_cents is None or ref_cents < -100 or ref_cents > 1250:
        color, label = "blue", "listening…"
    else:
        diff = abs(user_cents - ref_cents)
        ref_swara = cents_to_swara(ref_cents)
        if diff < 150:
            color, label = "green", "on pitch"
        elif diff < 350:
            color, label = "orange", "slightly off"
        else:
            color, label = "red", "off pitch"

    return {
        "status":     "ok",
        "user_swara": user_swara,
        "user_cents": round(user_cents, 1),
        "ref_swara":  cents_to_swara(ref_cents) if ref_cents is not None else None,
        "color":      color,
        "label":      label,
    }


@app.post("/score")
async def score(
    user_pitch: UploadFile = File(...),
    song_id:    str   = Form(...),
    start_time: float = Form(...),
    end_time:   float = Form(...),
):
    """Score a practice attempt and return teacher feedback."""
    song_path = SONG_STORAGE.get(song_id)
    if not song_path:
        return {"error": "Song not found"}

    song_sa = SONG_SA.get(song_id)
    if not song_sa:
        return {"error": "Song Sa not ready"}

    # Load and clean user audio
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await user_pitch.read())
        raw_path = tmp.name
    wav_path = convert_to_wav(raw_path)
    y_user, sr = librosa.load(wav_path, sr=16000, mono=True)
    os.unlink(raw_path)
    os.unlink(wav_path)

    # VAD — only user's voice
    y_voiced = extract_voice_only(y_user, sr)
    if len(y_voiced) < sr * 1.5:
       return {"error": "Not enough singing detected — sing for at least 2 seconds"}

    # Voice quality analysis
    voice_quality = analyze_voice_quality(y_voiced, sr)

    # Extract user pitch curve
    user_f0, _, _ = librosa.pyin(
    y_voiced,
    fmin=80,
    fmax=800,
    sr=sr
)
    user_f0 = user_f0[~np.isnan(user_f0) & (user_f0 > 0)]
    if len(user_f0) < 10:
        return {"error": "Could not detect your pitch clearly — sing louder and closer to the mic"}

   # Normalise user pitch to song Sa octave
    median_user = float(np.median(user_f0))
    adjusted = median_user
    while adjusted > song_sa * 1.9:
        adjusted /= 2
    while adjusted < song_sa * 0.65:
        adjusted *= 2
    ratio = adjusted / median_user
    user_f0_shifted = user_f0 * ratio
    user_cents = np.clip(1200 * np.log2(user_f0_shifted / song_sa), -200, 1250)

    # Reference pitch curve for this phrase
    times = SONG_REF_TIMES.get(song_id)
    cents = SONG_REF_CENTS.get(song_id)
    if times is None:
        return {"error": "Reference not ready — please wait a moment and try again"}

    mask = (times >= start_time) & (times <= end_time)
    ref_cents = cents[mask]
    if len(ref_cents) < 5:
        return {"error": "Not enough reference data for this phrase"}

    # DTW shape comparison
    # Normalise both curves to zero mean before comparing — pure shape comparison
    ref_norm = ref_cents - np.mean(ref_cents)
    user_norm = user_cents - np.mean(user_cents)

    # DTW shape comparison
    _, path = fastdtw(ref_norm, user_norm, dist=lambda a, b: abs(a - b))
    safe = [(i, j) for i, j in path if i < len(ref_norm) and j < len(user_norm)]
    ref_aligned  = np.array([ref_norm[i]  for i, j in safe])
    user_aligned = np.array([user_norm[j] for i, j in safe])

    user_aligned_norm = user_aligned  # already normalised
    mean_error = float(np.mean(np.abs(ref_aligned - user_aligned)))
    direction  = float(np.mean(user_aligned - ref_aligned))

    # For swara display, use original cents
    ref_aligned_display = np.array([ref_cents[i] for i, j in safe])
    user_aligned_display = np.array([user_cents[j] for i, j in safe])

    # Pitch shape score
    if mean_error < 30:    pitch_shape = 90.0
    elif mean_error < 60:  pitch_shape = 75.0
    elif mean_error < 100: pitch_shape = 55.0
    else:                   pitch_shape = max(0.0, 100 - mean_error * 0.7)
    print(f"[SCORE] mean_error={mean_error:.1f} pitch_shape={pitch_shape:.1f}")
    # Stability
    pitch_var  = float(np.mean(np.abs(np.diff(user_aligned_norm))))
    stability  = "unstable" if pitch_var > 60 else "slightly_unstable" if pitch_var > 30 else "stable"

    # Rhythm
    path_diffs = np.array([abs(i - j) for i, j in safe])
    warp       = float(np.mean(path_diffs))
    rhythm     = max(30.0, 100.0 - warp * 2)

    # Swara path comparison
    ref_swara_path  = pitch_curve_to_swara_path(ref_aligned_display)
    user_swara_path = pitch_curve_to_swara_path(user_aligned_display)

    # Find specific mismatches
    mismatches = []
    for i, (r, u) in enumerate(zip(ref_swara_path, user_swara_path)):
        if r["swara"] != u["swara"]:
            diff = u["cents"] - r["cents"]
            mismatches.append({
                "expected": r["swara"],
                "sang":     u["swara"],
                "direction": "high" if diff > 0 else "low",
                "cents_off": round(abs(diff), 0),
            })

    # Teacher feedback
    feedback = build_teacher_feedback(
        pitch_shape, direction, rhythm, stability, voice_quality
    )

    # Overall score — shape-based, not absolute
    final_score = round(0.65 * pitch_shape + 0.25 * rhythm + 0.10 * (
        100 if stability == "stable" else 60 if stability == "slightly_unstable" else 30
    ), 1)

    level = (
        "Keep going 💪" if final_score < 50 else
        "Improving ↗"   if final_score < 70 else
        "Good 👍"        if final_score < 85 else
        "Strong 🌟"
    )
    print(f"[SCORE] song_sa={song_sa:.1f}Hz")
    print(f"[SCORE] median_user_raw={float(np.median(user_f0)):.1f}Hz")
    print(f"[SCORE] song_sa={song_sa:.1f}Hz median_raw={median_user:.1f}Hz adjusted={adjusted:.1f}Hz")
    print(f"[SCORE] user_cents: {float(np.min(user_cents)):.0f} to {float(np.max(user_cents)):.0f}")
    print(f"[SCORE] ref_cents: {float(np.min(ref_cents)):.0f} to {float(np.max(ref_cents)):.0f}")
    return {
        "final_score":      final_score,
        "level":            level,
        "pitch_shape":      round(pitch_shape, 1),
        "rhythm":           round(rhythm, 1),
        "stability":        stability,
        "direction":        round(direction, 1),
        "mean_error_cents": round(mean_error, 1),
        "feedback":         feedback,
        "voice_quality":    voice_quality,
        "mismatches":       mismatches[:4],
        "ref_swara_path":   ref_swara_path,
        "user_swara_path":  user_swara_path,
    }


@app.post("/reset_live")
async def reset_live(song_id: str):
    return {"status": "ok"}

@app.post("/detect_register")
async def detect_register(
    file: UploadFile = File(...),
    speaking_pitch_hz: float = Form(0.0),
    speaking_hnr: float = Form(-99.0),
):
    audio_bytes = await file.read()
    y, sr = load_audio(audio_bytes, target_sr=16000)

    if len(y) < sr * 0.3:
        return {"status": "too_short"}

    y_voiced = extract_voice_only(y, sr)
    if len(y_voiced) < sr * 0.2:
        return {"status": "no_voice"}

    result = analyze_voice_quality(
        y_voiced, sr,
        speaking_pitch_hz=speaking_pitch_hz if speaking_pitch_hz > 0 else None,
        speaking_hnr=speaking_hnr if speaking_hnr > -99 else None,
    )
    return {
        "status": "ok",
        "register": result["register"],
        "register_message": result["register_message"],
        "strain": result["strain"],
        "strain_message": result["strain_message"],
        "hnr": result["hnr"],
        "median_pitch_hz": result["median_pitch_hz"],
    }

SA_HZ = 261.63  # C4 — fixed reference Sa

@app.post("/pitch_stability")
async def pitch_stability(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    if len(audio_bytes) < 2000:
      return {"status": "too_short"}
    y, sr = load_audio(audio_bytes, target_sr=16000)
    print(f"[PS_ENTRY] bytes={len(audio_bytes)} y_len={len(y)} y_max={float(np.max(np.abs(y))):.4f}")
    if len(y) < sr * 0.05:
       return {"status": "too_short"}

    # Skip VAD here — user is singing continuously, we want all frames
    # Just apply bandpass filter to reduce noise
    nyq = sr / 2
    b, a = scipy.signal.butter(4, [70 / nyq, 600 / nyq], btype="band")
    y_filt = scipy.signal.filtfilt(b, a, y)

    # Check there is actual signal
    if float(np.max(np.abs(y_filt))) < 0.005:
        return {"status": "no_voice"}

    sound = parselmouth.Sound(y_filt, sampling_frequency=sr)
    pitch_obj = sound.to_pitch(
    time_step=0.02,
    pitch_floor=80,
    pitch_ceiling=350,
)
    pitch_values = pitch_obj.selected_array["frequency"]
    pitch_values = pitch_values[pitch_values > 0]

    print(f"[PS_DEBUG] audio_len={len(y)/sr:.2f}s pitch_frames={len(pitch_values)}")
    if len(pitch_values) < 3:
      return {"status": "no_pitch"}

# Only keep pitch values where there is actual energy
    rms = float(np.sqrt(np.mean(y_filt**2)))
    if rms < 0.001:
      return {"status": "no_voice"}
    
    # Normalise to same octave as C4
    # Find which octave of Sa the user is closest to
    SA_OCTAVES = [SA_HZ / 4, SA_HZ / 2, SA_HZ, SA_HZ * 2, SA_HZ * 4]
    
    normalised = []
    for hz in pitch_values.tolist():
        hz = float(hz)
        if hz <= 0:
           continue
        cents = 1200 * np.log2(hz / SA_HZ)
        normalised.append((hz, float(cents), SA_HZ))

    if not normalised:
       return {"status": "no_pitch"}

    # Keep only values within 400 cents of median to remove drone/noise spikes
    if len(normalised) > 3:
       raw_cents = [c for _, c, _ in normalised]
       rough_median = float(np.median(raw_cents))
       normalised = [(h, c, s) for h, c, s in normalised if abs(c - rough_median) < 400]

    cents_list = [c for _, c, _ in normalised]
    hz_list = [h for h, _, _ in normalised]
    cents_series = np.array(cents_list)
    median_cents = float(np.median(cents_series))
    median_hz = float(np.median(hz_list))
    closest_sa_used = SA_HZ

# Use per-frame cents for stability, not median repeated
    stability_std = float(np.std(cents_series)) if len(cents_series) > 1 else 0.0
    print(f"[STD_DEBUG] n={len(cents_series)} unique={len(set(cents_list))} std={stability_std:.1f}")
    abs_cents = abs(median_cents)
    if abs_cents < 50:
       sa_status, sa_label = "on_sa", "On Sa"
    elif abs_cents < 150:
       sa_status, sa_label = "close", "Almost there"
    elif median_cents > 0:
       sa_status, sa_label = "too_high", "Too high"
    else: 
       sa_status, sa_label = "too_low", "Too low"

    stability = (
        "stable" if stability_std < 15 else
        "slightly_unstable" if stability_std < 40 else
        "unstable"
    )

    print(f"[PITCH_STABILITY] median={median_hz:.1f}Hz cents={median_cents:.1f} status={sa_status} std={stability_std:.1f} sa_octave={closest_sa_used:.1f}Hz")
    # Register detection — same logic as analyze_voice_quality
    sound_full = parselmouth.Sound(y_filt, sampling_frequency=sr)
    harmonicity = sound_full.to_harmonicity()
    hnr_values = harmonicity.values[harmonicity.values != -200]
    hnr = float(np.mean(hnr_values)) if len(hnr_values) > 0 else 0.0

    if median_hz < 165:
       register = "talking_voice"
       register_tip = "You are singing in your talking voice — try to lift the sound, like you are calling someone"
    elif median_hz < 220:
        register = "chest_voice"
        register_tip = "Chest voice — good foundation for lower Sa"
    elif median_hz < 320:
        register = "chest_voice"
        register_tip = "Good — this is Sa in chest voice, the right place to start"
    elif median_hz < 480:
       register = "mixed_voice"
       register_tip = "You are singing the upper Sa — this is correct, just in a higher octave"
    else:
       register = "head_voice"
       register_tip = "You are singing very high — try to relax your voice down to a more comfortable Sa"

    # Strain
    if hnr > 5:
        strain = "none"
    elif hnr > 1:
        strain = "mild"
        register_tip += " — slight breathiness, take a deeper breath"
    else:
        strain = "significant"
        register_tip = "Voice sounds strained — stop, rest, drink water"
    return {
        "status": "ok",
        "median_hz": round(median_hz, 1),
        "cents_from_sa": round(median_cents, 1),
        "sa_status": sa_status,
        "sa_label": sa_label,
        "stability": stability,
        "stability_std": round(stability_std, 1),
        "pitch_points": [round(float(c), 1) for c in cents_series],
        "register": register,
        "register_tip": register_tip,
        "strain": strain,
        "hnr": round(hnr, 1),
    }

@app.post("/score_sarali")
async def score_sarali(
    user_pitch: UploadFile = File(...),
    tokens_json: str = Form(...),       # JSON string: [{"swara":"Sa","slots":1}, ...]
    time_per_akshara: float = Form(...), # seconds per slot at tested kaalam
):
    """Score a Sarali Swaras test attempt against a generated reference curve."""
    import json
    try:
        tokens = json.loads(tokens_json)
    except Exception:
        return {"error": "Invalid tokens data"}

    if not tokens:
        return {"error": "No swara sequence provided"}

    # Build reference curve from the swara sequence
    ref_times, ref_cents = build_sarali_reference(tokens, time_per_akshara)
    if len(ref_cents) < 5:
        return {"error": "Reference sequence too short"}

    # Load and clean user audio
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await user_pitch.read())
        raw_path = tmp.name
    wav_path = convert_to_wav(raw_path)
    y_user, sr = librosa.load(wav_path, sr=16000, mono=True)
    os.unlink(raw_path)
    os.unlink(wav_path)

    y_voiced = extract_voice_only(y_user, sr)
    if len(y_voiced) < sr * 1.0:
        return {"error": "Not enough singing detected — sing the full pattern"}

    # Voice quality analysis (register, strain) — uses absolute pitch fallback
    # since there's no speaking-pitch baseline in a quick test context
    voice_quality = analyze_voice_quality(y_voiced, sr)

    # Extract user pitch curve
    user_f0, _, _ = librosa.pyin(y_voiced, fmin=80, fmax=800, sr=sr)
    user_f0 = user_f0[~np.isnan(user_f0) & (user_f0 > 0)]
    if len(user_f0) < 10:
        return {"error": "Could not detect your pitch clearly — sing louder and closer to the mic"}

    # Determine the user's own Sa — use their median pitch as a personal anchor,
    # snapped to the nearest reasonable octave so the SHAPE comparison is fair
    # regardless of their vocal range (every voice is different).
    median_user = float(np.median(user_f0))
    # Estimate user's Sa as their median pitch minus the song's average offset from Sa
    # Simplify: assume their sung phrase centers near their own Sa + average swara offset
    avg_ref_cents = float(np.mean(ref_cents))
    # Convert user pitch to "their own cents from their own Sa" by removing the
    # average swara-offset implied by the reference, in log space
    user_sa_estimate = median_user / (2 ** (avg_ref_cents / 1200))

    # Clamp user_sa_estimate to a sane vocal range (not used for scoring directly,
    # only for octave folding below)
    while user_sa_estimate > 500: user_sa_estimate /= 2
    while user_sa_estimate < 80:  user_sa_estimate *= 2

    user_cents = np.clip(1200 * np.log2(user_f0 / user_sa_estimate), -200, 1450)

    # DTW shape comparison — zero-mean, pure shape, octave/range independent
    ref_norm = ref_cents - np.mean(ref_cents)
    user_norm = user_cents - np.mean(user_cents)

    _, path = fastdtw(ref_norm, user_norm, dist=lambda a, b: abs(a - b))
    safe = [(i, j) for i, j in path if i < len(ref_norm) and j < len(user_norm)]
    ref_aligned  = np.array([ref_norm[i]  for i, j in safe])
    user_aligned = np.array([user_norm[j] for i, j in safe])

    mean_error = float(np.mean(np.abs(ref_aligned - user_aligned)))
    direction  = float(np.mean(user_aligned - ref_aligned))

    # Pitch shape score — same generous curve as song scoring
    if mean_error < 30:    pitch_shape = 90.0
    elif mean_error < 60:  pitch_shape = 75.0
    elif mean_error < 100: pitch_shape = 55.0
    else:                  pitch_shape = max(0.0, 100 - mean_error * 0.7)

    # Stability
    pitch_var = float(np.mean(np.abs(np.diff(user_aligned))))
    stability = "unstable" if pitch_var > 60 else "slightly_unstable" if pitch_var > 30 else "stable"

    # Rhythm — how well-aligned the timing was (less warping = better rhythm)
    path_diffs = np.array([abs(i - j) for i, j in safe])
    warp = float(np.mean(path_diffs))
    rhythm = max(30.0, 100.0 - warp * 1.5)

    # Teacher feedback — reuse existing function
    feedback = build_teacher_feedback(pitch_shape, direction, rhythm, stability, voice_quality)

    final_score = round(0.65 * pitch_shape + 0.25 * rhythm + 0.10 * (
        100 if stability == "stable" else 60 if stability == "slightly_unstable" else 30
    ), 1)

    level = (
        "Keep practicing 💪" if final_score < 50 else
        "Improving ↗"        if final_score < 70 else
        "Good 👍"             if final_score < 85 else
        "Excellent 🌟"
    )

    return {
        "final_score": final_score,
        "level": level,
        "pitch_shape": round(pitch_shape, 1),
        "rhythm": round(rhythm, 1),
        "stability": stability,
        "feedback": feedback,
        "voice_quality": voice_quality,
    }

# ── Endpoint ───────────────────────────────────────────────────────────────────

@app.post("/understand_song")
async def understand_song(file: UploadFile = File(...)):
    """
    Song Coach — Understanding phase.
    Analyzes the uploaded song's vocal register map, transitions, and generates
    a teacher-style walkthrough. Also saves the song and starts background Hz
    extraction so Practice can reuse the same song_id without re-uploading.
    """
    song_id = str(uuid.uuid4())
    raw_path = os.path.join(UPLOAD_DIR, f"{song_id}_raw")
    raw_bytes = await file.read()
    with open(raw_path, "wb") as f:
        f.write(raw_bytes)

    file_path = convert_to_wav(raw_path)
    SONG_STORAGE[song_id] = file_path
    SONG_REF_HZ_READY[song_id] = False

    y, sr = librosa.load(file_path, sr=16000, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)

    windows = get_vocal_windows(y, sr, duration)
    transitions = detect_transitions(windows)
    walkthrough = generate_walkthrough(windows, transitions)
    genre = classify_genre_placeholder(y, sr)

    vocal_pitches = [w["median_pitch_hz"] for w in windows if w["median_pitch_hz"]]
    pitch_range = None
    if vocal_pitches:
        pitch_range = {
            "min_hz": round(min(vocal_pitches), 1),
            "max_hz": round(max(vocal_pitches), 1),
            "avg_hz": round(sum(vocal_pitches) / len(vocal_pitches), 1),
        }

    # Start background Hz extraction so Practice can reuse this song_id
    threading.Thread(
        target=_extract_ref_hz_background,
        args=(song_id, file_path),
        daemon=True
    ).start()

    return {
        "status": "ok",
        "song_id": song_id,
        "duration": round(duration, 1),
        "genre": genre,
        "pitch_range": pitch_range,
        "windows": windows,
        "transitions": transitions,
        "walkthrough": walkthrough,
    }

@app.post("/analyze_song_coach")
async def analyze_song_coach(file: UploadFile = File(...)):
    """Upload song for Song Coach practice — extracts Hz curve only, no Sa."""
    song_id = str(uuid.uuid4())
    raw_path = os.path.join(UPLOAD_DIR, f"{song_id}_raw")
    with open(raw_path, "wb") as f:
        f.write(await file.read())

    file_path = convert_to_wav(raw_path)
    SONG_STORAGE[song_id] = file_path
    SONG_REF_HZ_READY[song_id] = False

    y, sr = librosa.load(file_path, sr=8000, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)

    threading.Thread(
        target=_extract_ref_hz_background,
        args=(song_id, file_path),
        daemon=True
    ).start()

    return {"song_id": song_id, "duration": duration}


@app.get("/analyze_song_coach_ready/{song_id}")
def analyze_song_coach_ready(song_id: str):
    return {"ready": SONG_REF_HZ_READY.get(song_id, False)}


@app.post("/score_song")
async def score_song(
    user_pitch: UploadFile = File(...),
    song_id: str = Form(...),
    start_time: float = Form(...),
    end_time: float = Form(...),
    mode: str = Form("practice"),
):
    """Score singing against song shape — pure Hz shape matching, no Sa, no swaras."""
    song_path = SONG_STORAGE.get(song_id)
    if not song_path:
        return {"error": "Song not found"}

    ref_hz = SONG_REF_HZ.get(song_id)
    ref_times = SONG_REF_HZ_TIMES.get(song_id)
    if ref_hz is None:
        return {"error": "Song not ready — please wait"}

    # Get phrase slice
    mask = (ref_times >= start_time) & (ref_times <= end_time)
    phrase_ref_hz = ref_hz[mask]
    if len(phrase_ref_hz) < 5:
        return {"error": "Not enough song data in this range"}

    # Load user audio
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await user_pitch.read())
        raw_path = tmp.name
    wav_path = convert_to_wav(raw_path)
    y_user, sr = librosa.load(wav_path, sr=16000, mono=True)
    os.unlink(raw_path)
    os.unlink(wav_path)

    y_voiced = extract_voice_only(y_user, sr)
    if len(y_voiced) < sr * 0.8:
        return {"error": "Not enough singing detected — sing for the full phrase"}

    voice_quality = analyze_voice_quality(y_voiced, sr)

    user_f0, _, _ = librosa.pyin(y_voiced, fmin=60, fmax=1200, sr=sr)
    user_f0 = user_f0[~np.isnan(user_f0) & (user_f0 > 0)]
    if len(user_f0) < 10:
        return {"error": "Could not detect your pitch — sing louder and closer to the mic"}

    # Convert both to log scale for shape comparison
    # Log scale makes octave differences proportional — better for voice comparison
    ref_log = np.log2(phrase_ref_hz)
    user_log = np.log2(user_f0)

    # Zero-mean both — pure shape, no absolute pitch comparison
    ref_norm = ref_log - np.mean(ref_log)
    user_norm = user_log - np.mean(user_log)

    # DTW shape match
    _, path = fastdtw(ref_norm, user_norm, dist=lambda a, b: abs(a - b))
    safe = [(i, j) for i, j in path if i < len(ref_norm) and j < len(user_norm)]
    ref_aligned = np.array([ref_norm[i] for i, j in safe])
    user_aligned = np.array([user_norm[j] for i, j in safe])

    mean_error = float(np.mean(np.abs(ref_aligned - user_aligned)))
    direction = float(np.mean(user_aligned - ref_aligned))

    # Shape score
    if mean_error < 0.15:   pitch_shape = 90.0
    elif mean_error < 0.30: pitch_shape = 75.0
    elif mean_error < 0.50: pitch_shape = 55.0
    else:                    pitch_shape = max(0.0, 100 - mean_error * 150)

    # Stability
    pitch_var = float(np.mean(np.abs(np.diff(user_aligned))))
    stability = "unstable" if pitch_var > 0.08 else "slightly_unstable" if pitch_var > 0.04 else "stable"

    # Rhythm
    path_diffs = np.array([abs(i - j) for i, j in safe])
    warp = float(np.mean(path_diffs))
    rhythm = max(30.0, 100.0 - warp * 2)

    # Teacher feedback — guide not judge
    # Different feedback style for practice vs test
    if mode == "test":
        feedback = build_song_test_feedback(pitch_shape, direction, stability, voice_quality)
    else:
        feedback = build_song_shape_feedback(pitch_shape, direction, stability, voice_quality)

    final_score = round(
        0.60 * pitch_shape +
        0.25 * rhythm +
        0.15 * (100 if stability == "stable" else 60 if stability == "slightly_unstable" else 30),
        1
    )

    level = (
        "Keep going 💪" if final_score < 50 else
        "Getting there ↗" if final_score < 70 else
        "Good 👍" if final_score < 85 else
        "Strong 🌟"
    )

    print(f"[SCORE_SONG] mean_error={mean_error:.3f} pitch_shape={pitch_shape:.1f} rhythm={rhythm:.1f} mode={mode}")

    return {
        "final_score": final_score if mode == "test" else None,
        "level": level if mode == "test" else None,
        "pitch_shape": round(pitch_shape, 1),
        "rhythm": round(rhythm, 1),
        "stability": stability,
        "feedback": feedback,
        "voice_quality": voice_quality,
        "mode": mode,
    }


import httpx

MUSIC_SYSTEM_PROMPT = """You are Swarly's music teacher assistant for Carnatic music beginners.

You ONLY answer questions about Carnatic music, singing technique, Indian classical theory, practice methods, and vocal health. If asked anything unrelated, say: "I can only help with music and singing questions."

Be warm, simple, encouraging — like a patient teacher talking to a beginner. Keep answers short (3-5 sentences) unless asked for more detail.

CRITICAL: Only state facts you are certain about. If you don't know something specific (like an exact technique name or historical detail), say "I'm not fully sure of the details there" rather than inventing an answer. Never make up fake examples or fabricated terminology.

Reference facts about gamakas (the most commonly asked topic) — use these, don't invent your own:
- A gamaka is an ornament: a controlled movement of pitch around or between notes, not a static note.
- Common gamakas include: Kampita (an oscillation/shake on a single note), Jaaru (a smooth slide between two notes, ascending or descending), Nokku (a quick touch of an adjacent note before returning), Sphurita (touching the note below then snapping back up).
- Gamakas are what give Carnatic music its characteristic curved, emotional quality — without them, the music would sound flat and mechanical, more like a Western scale.
- They are sung, not just instrumental — the voice itself must learn to move, not just hold pitches.
"""

@app.post("/chat")
async def chat(request: dict):
    messages = request.get("messages", [])
    if not messages:
        return {"error": "No messages provided"}
    try:
        # Build prompt with system message prepended
        full_messages = [{"role": "system", "content": MUSIC_SYSTEM_PROMPT}] + messages
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                "http://localhost:11434/api/chat",
                json={
                    "model": "gemma2:2b",
                    "messages": full_messages,
                    "stream": False,
                }
            )
            data = res.json()
            reply = data["message"]["content"]
            return {"reply": reply}
    except Exception as e:
        print(f"[CHAT] Error: {e}")
        return {"error": "Could not get response — make sure Ollama is running"}