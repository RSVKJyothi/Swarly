import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";

type View = "upload" | "loading" | "practice" | "test" | "result";

type ScoreResult = {
  final_score: number | null;
  level: string | null;
  mode: string;
  pitch_shape: number;
  rhythm: number;
  stability: string;
  feedback: string;
  voice_quality: {
    register: string;
    register_message: string;
    strain: string;
    strain_message: string;
  };
};

export default function SongCoachPractice({
  onBack,
  initialSongId,
  initialDuration,
}: {
  onBack: () => void;
  initialSongId?: string;
  initialDuration?: number;
}) {
  const [view, setView] = useState<View>(initialSongId ? "loading" : "upload");
const [songId, setSongId] = useState(initialSongId ?? "");
const [duration, setDuration] = useState(initialDuration ?? 0);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");

  // Phrase selection
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(15);

  // Playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const endRef = useRef(endTime);
  const startRef = useRef(startTime);
  useEffect(() => { endRef.current = endTime; }, [endTime]);
  useEffect(() => { startRef.current = startTime; }, [startTime]);

  // Recording
  const [recording, setRecording] = useState(false);
  const [scoring, setScoring] = useState(false);
  const mrRef = useRef<MediaRecorder | null>(null);
  const allChunks = useRef<Blob[]>([]);
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simTimeRef = useRef(0);

  // Live feedback
  const [liveRegister, setLiveRegister] = useState("");
  const [liveStrain, setLiveStrain] = useState("");

  // Score
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [lastMode, setLastMode] = useState<"practice" | "test">("practice");
  // Upload drag
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // ── Audio setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!songId) return;
    const audio = new Audio(`${API}/song/${songId}`);
    audio.preload = "auto";
    audio.volume = 0.4;
    audio.addEventListener("timeupdate", () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      if (t >= endRef.current) {
        audio.pause();
        setPlaying(false);
      }
    });
    audio.addEventListener("ended", () => setPlaying(false));
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; };
  }, [songId]);

  useEffect(() => {
  if (!initialSongId) return;
  setEndTime(Math.min(15, initialDuration ?? 15));
  setLoadingMsg("Preparing practice...");

  let cancelled = false;
  (async () => {
    for (let i = 0; i < 60; i++) {
      if (cancelled) return;
      await new Promise(r => setTimeout(r, 1000));
      const check = await fetch(`${API}/analyze_song_coach_ready/${initialSongId}`);
      const { ready } = await check.json();
      if (ready) { setView("practice"); return; }
    }
  })();

  return () => { cancelled = true; };
}, [initialSongId]);

  // ── Upload ─────────────────────────────────────────────────────────────────
  async function handleFile(file: File) {
    setError("");
    setView("loading");
    setLoadingMsg("Uploading song...");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/analyze_song_coach`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setSongId(data.song_id);
      setDuration(data.duration);
      setEndTime(Math.min(15, data.duration));
      setLoadingMsg("Analysing song shape...");

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const check = await fetch(`${API}/analyze_song_coach_ready/${data.song_id}`);
        const { ready } = await check.json();
        if (ready) { setView("practice"); return; }
        setLoadingMsg(`Analysing... ${i + 1}s`);
      }
      throw new Error("Analysis timed out");
    } catch (e: any) {
      setError(e.message);
      setView("upload");
    }
  }

  // ── Playback ───────────────────────────────────────────────────────────────
  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause(); setPlaying(false);
    } else {
      a.currentTime = startTime;
      a.volume = 0.4;
      a.play().catch(console.error);
      setPlaying(true);
    }
  }

  function stopAudio() {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = startRef.current;
    setPlaying(false);
    setCurrentTime(startRef.current);
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  async function startRecording(isTest: boolean) {
    setLastMode(isTest ? "test" : "practice"); 
    if (!isTest) {
      // Practice mode — song plays softly
      const a = audioRef.current;
      if (a) { a.currentTime = startTime; a.volume = 0.35; a.play().catch(console.error); setPlaying(true); }
    } else {
      stopAudio();
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch {
      alert("Microphone access denied");
      return;
    }

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find(
      m => MediaRecorder.isTypeSupported(m)
    ) || "";

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mrRef.current = mr;
    allChunks.current = [];

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) allChunks.current.push(e.data);
    };

    mr.start(1500);
    setRecording(true);
    setLiveRegister("");
    setLiveStrain("");

    // Teleprompter ticker
    simTimeRef.current = startTime;
    const phraseLen = endTime - startTime;
    const startedAt = Date.now();
    tickerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      simTimeRef.current = startTime + Math.min(elapsed, phraseLen);
      setCurrentTime(simTimeRef.current);
    }, 100);

    // Live register check every 3 seconds
    liveTimer.current = setInterval(async () => {
      if (allChunks.current.length === 0) return;
      const blob = new Blob([...allChunks.current], { type: mimeType || "audio/webm" });
      if (blob.size < 3000) return;
      try {
        const form = new FormData();
        form.append("file", blob, "live.webm");
        const res = await fetch(`${API}/detect_register`, { method: "POST", body: form });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "ok") {
          setLiveRegister(data.register_message ?? "");
          setLiveStrain(data.strain ?? "");
        }
      } catch (_) {}
    }, 3000);
  }

  async function stopRecording() {
    if (liveTimer.current) { clearInterval(liveTimer.current); liveTimer.current = null; }
    if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
    stopAudio();

    const mr = mrRef.current;
    if (!mr || mr.state === "inactive") return;

    await new Promise<void>(resolve => { mr.onstop = () => resolve(); mr.stop(); });
    mr.stream.getTracks().forEach(t => t.stop());
    setRecording(false);
    setCurrentTime(startTime);

    if (allChunks.current.length === 0) { alert("No audio recorded — check your mic"); return; }

    const mimeType = mr.mimeType || "audio/webm";
    const blob = new Blob(allChunks.current, { type: mimeType });
    await submitScore(blob);
  }

  async function submitScore(blob: Blob) {
    setScoring(true);
    try {
      const form = new FormData();
      form.append("user_pitch", blob, "singing.webm");
      form.append("song_id", songId);
      form.append("start_time", String(startTime));
      form.append("end_time", String(endTime));
      form.append("mode", lastMode);
      form.append("mode", isTest ? "test" : "practice");
      const res = await fetch(`${API}/score_song`, { method: "POST", body: form });
      const data: ScoreResult & { error?: string } = await res.json();
      if (data.error) { alert(data.error); setScoring(false); return; }
      setScoreResult(data);
      setView("result");
    } catch (e) {
      console.error(e);
      alert("Something went wrong — try again");
    }
    setScoring(false);
  }

  const phraseProgress = Math.min(100,
    ((currentTime - startTime) / Math.max(0.1, endTime - startTime)) * 100);

  // ── VIEWS ──────────────────────────────────────────────────────────────────

  if (view === "upload") return (
    <div className="scp-screen">
      <div className="scp-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div className="scp-title">🎤 Practice a Song</div>
      </div>
      <div className="scp-body">
        <div
          className={`upload-zone ${dragging ? "drag-over" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
        >
          <input ref={inputRef} type="file" accept="audio/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <div className="upload-icon">♪</div>
          <p className="upload-main">Drop your song here</p>
          <p className="upload-sub">MP3, WAV, M4A · any song you want to practise</p>
        </div>
        {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
        <div className="scp-info-cards">
          <div className="scp-info-card">
            <span>👂</span>
            <div>
              <strong>Listen first</strong>
              <p>Play the phrase and understand how it moves</p>
            </div>
          </div>
          <div className="scp-info-card">
            <span>🎤</span>
            <div>
              <strong>Sing along</strong>
              <p>Song plays softly while you sing — follow the shape</p>
            </div>
          </div>
          <div className="scp-info-card">
            <span>📝</span>
            <div>
              <strong>Self-test</strong>
              <p>Sing from memory — no reference playing</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (view === "loading") return (
    <div className="scp-screen">
      <div className="scp-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div className="scp-title">Analysing...</div>
      </div>
      <div className="scp-body" style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
        <div className="spinner" style={{ width: 40, height: 40, marginBottom: 16 }} />
        <p style={{ color: "var(--text2)", fontSize: 14 }}>{loadingMsg}</p>
      </div>
    </div>
  );

  if (view === "result" && scoreResult) return (
  <div className="scp-screen">
    <div className="scp-header">
      <button className="back-btn" onClick={() => { setView(lastMode === "test" ? "test" : "practice"); setScoreResult(null); }}>← Back</button>
      <div className="scp-title">{lastMode === "test" ? "📝 Test Result" : "🎤 Practice Feedback"}</div>
    </div>
    <div className="scp-body">

      {/* Score — test mode only, shown at top */}
      {lastMode === "test" && scoreResult.final_score !== null && (
        <div style={{
          textAlign: "center", marginBottom: 16,
        }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 80, lineHeight: 1,
            color: scoreResult.final_score >= 80 ? "var(--green)"
              : scoreResult.final_score >= 55 ? "var(--accent)" : "var(--orange)",
          }}>
            {scoreResult.final_score}
          </div>
          <div style={{ fontSize: 16, color: "var(--text2)", marginTop: 4 }}>
            {scoreResult.level}
          </div>
        </div>
      )}

      {/* Main feedback */}
      <div className="fb-card main-fb">
        <span className="fb-ico">🎓</span>
        <p>{scoreResult.feedback}</p>
      </div>

      {/* Strain warning — both modes */}
      {scoreResult.voice_quality.strain !== "none" && (
        <div className="fb-card warn-fb">
          <span className="fb-ico">⚠️</span>
          <p>{scoreResult.voice_quality.strain_message}</p>
        </div>
      )}

      {/* Stats — test mode only */}
      {lastMode === "test" && (
        <div className="fb-stats">
          <div className="stat-box">
            <span>Shape</span>
            <strong>{scoreResult.pitch_shape}%</strong>
          </div>
          <div className="stat-box">
            <span>Rhythm</span>
            <strong>{scoreResult.rhythm}%</strong>
          </div>
          <div className="stat-box">
            <span>Voice</span>
            <strong>{scoreResult.voice_quality.register.replace("_", " ")}</strong>
          </div>
        </div>
      )}

      {/* Practice mode — just voice register info, no numbers */}
      {lastMode === "practice" && (
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: "var(--r)", padding: "12px 16px",
          fontSize: 13, color: "var(--text2)",
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <span style={{ fontSize: 18 }}>
            {scoreResult.voice_quality.register === "talking_voice" ? "🗣️"
              : scoreResult.voice_quality.register === "chest_voice" ? "🫁"
              : scoreResult.voice_quality.register === "mixed_voice" ? "✨" : "🧠"}
          </span>
          <span>
            Voice register: <strong style={{ color: "var(--text)" }}>
              {scoreResult.voice_quality.register.replace("_", " ")}
            </strong>
            {scoreResult.voice_quality.register === "talking_voice" && " — try to lift into your singing voice"}
          </span>
        </div>
      )}

      <div className="fb-actions">
        <button className="ctrl-btn sing-btn"
          onClick={() => { setView("practice"); setScoreResult(null); }}>
          Sing Again
        </button>
        <button className="ctrl-btn play-btn"
          onClick={() => { setView("test"); setScoreResult(null); }}>
          Self Test
        </button>
        <button className="ctrl-btn play-btn"
          onClick={() => { setView("upload"); setSongId(""); setScoreResult(null); }}>
          New Song
        </button>
      </div>

    </div>
  </div>
);

  // ── Practice & Test views ──────────────────────────────────────────────────
  const isTest = view === "test";

  return (
    <div className="scp-screen">
      <div className="scp-header">
        <button className="back-btn" onClick={() => {
          stopAudio();
          if (isTest) setView("practice");
          else onBack();
        }}>← {isTest ? "Practice" : "Back"}</button>
        <div className="scp-title">{isTest ? "📝 Self Test" : "🎤 Sing Along"}</div>
        <div className="song-sa">{(endTime - startTime).toFixed(0)}s phrase</div>
      </div>

      {/* Mode switcher */}
      {!recording && !scoring && (
        <div className="scp-mode-bar">
          <button
            className={`tab ${!isTest ? "active" : ""}`}
            onClick={() => { stopAudio(); setView("practice"); }}
          >🎤 Sing Along</button>
          <button
            className={`tab ${isTest ? "active" : ""}`}
            onClick={() => { stopAudio(); setView("test"); }}
          >📝 Self Test</button>
        </div>
      )}

      {/* Phrase sliders */}
      {!recording && !scoring && (
        <div className="phrase-controls">
          <span className="phrase-label">Phrase</span>
          <div className="slider-group">
            <label>
              <span>From {startTime}s</span>
              <input type="range" min={0} max={Math.max(0, duration - 1)} step={1}
                value={startTime} onChange={e => { setStartTime(Number(e.target.value)); stopAudio(); }} />
            </label>
            <label>
              <span>To {endTime}s</span>
              <input type="range" min={1} max={duration} step={1}
                value={endTime} onChange={e => { setEndTime(Number(e.target.value)); stopAudio(); }} />
            </label>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="scp-info-box">
        {isTest ? (
          <p>The song will <strong>not play</strong> — sing the phrase from memory. The app listens to your voice only.</p>
        ) : (
          <p>The song plays softly in the background. Sing along and try to <strong>follow the shape</strong> — where it rises, let your voice rise. Where it falls, let it fall.</p>
        )}
      </div>

      {/* Live register feedback during recording */}
      {recording && liveRegister && (
        <div className={`live-box ${liveStrain === "significant" ? "color-red" : "color-gray"}`}
          style={{ margin: "0 16px 12px" }}>
          <div className="live-info">
            <div className="live-label">{liveRegister}</div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {recording && (
        <div style={{ padding: "0 16px 8px" }}>
          <div style={{
            height: 3, background: "var(--border)", borderRadius: 2, overflow: "hidden"
          }}>
            <div style={{
              height: "100%", background: "var(--accent)",
              width: `${phraseProgress}%`, transition: "width 0.15s linear"
            }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, textAlign: "right" }}>
            {Math.max(0, Math.ceil(endTime - simTimeRef.current))}s remaining
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="controls-bar" style={{ flexDirection: "column", gap: 12, padding: "20px" }}>
        {scoring ? (
          <div className="scoring-msg"><div className="mini-spin" />Analysing your singing...</div>
        ) : recording ? (
          <button className="ctrl-btn stop-btn" onClick={stopRecording}>
            ⬛ Done — Get Feedback
          </button>
        ) : (
          <>
            {/* Listen button — always available */}
            <button className="ctrl-btn play-btn" onClick={togglePlay}
              style={{ width: "100%", maxWidth: 360 }}>
              {playing ? "⏸ Pause" : "▶ Listen to Phrase"}
            </button>

            {/* Sing button */}
            <button className="ctrl-btn sing-btn"
              style={{ width: "100%", maxWidth: 360 }}
              onClick={() => startRecording(isTest)}>
              {isTest ? "📝 Start Test — Sing from Memory" : "🎤 Start Singing Along"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}