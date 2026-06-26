import { useState, useRef, useEffect } from "react";

const API = "http://localhost:8000";
const SA_HZ = 261.63;
const TOTAL_SECONDS = 10;
const SVG_W = 500;
const SVG_H = 120;
const SA_Y = SVG_H / 2;
const CENTS_RANGE = 600;

type View = "theory" | "practice";
type Phase = "idle" | "listen" | "sing" | "result";
type SaStatus = "on_sa" | "close" | "too_high" | "too_low" | "no_voice" | "no_pitch" | null;
type StabilityPoint = { cents: number };

const STATUS_COLOR: Record<string, string> = {
  on_sa:    "var(--green)",
  close:    "var(--accent)",
  too_high: "var(--orange)",
  too_low:  "#7c6fff",
};

export default function PitchAwareness({ onBack }: { onBack: () => void }) {
  const [view, setView]                 = useState<View>("theory");
  const [phase, setPhase]               = useState<Phase>("idle");
  const [points, setPoints]             = useState<StabilityPoint[]>([]);
  const [currentStatus, setCurrentStatus] = useState<SaStatus>(null);
  const [currentCents, setCurrentCents] = useState(0);
  const [elapsed, setElapsed]           = useState(0);
  const [error, setError]               = useState("");

  const mrRef        = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const stoppedRef   = useRef(false);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const gainRef      = useRef<GainNode | null>(null);
  const gainRef2     = useRef<GainNode | null>(null);
  const osc1Ref      = useRef<OscillatorNode | null>(null);
  const osc2Ref      = useRef<OscillatorNode | null>(null);
  const [register, setRegister] = useState<string>("");
  const [registerTip, setRegisterTip] = useState<string>("");
  const [strain, setStrain] = useState<string>("");
  useEffect(() => () => { hardStop(); }, []);

  // ── Drone ──────────────────────────────────────────────────────────────────
  function startDrone() {
    hardStopDrone();
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, ctx.currentTime);
    g1.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 0.6);
    gainRef.current = g1;

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, ctx.currentTime);
    g2.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    gainRef2.current = g2;

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = SA_HZ;
    o1.connect(g1);
    g1.connect(ctx.destination);
    o1.start();
    osc1Ref.current = o1;

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = SA_HZ / 2;
    o2.connect(g2);
    g2.connect(ctx.destination);
    o2.start();
    osc2Ref.current = o2;
  }

  function hardStopDrone() {
    const ctx = audioCtxRef.current;
    if (ctx) {
      [gainRef.current, gainRef2.current].forEach(g => {
        if (!g) return;
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
          g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
        } catch (_) {}
      });
      setTimeout(() => {
        try { osc1Ref.current?.stop(); } catch (_) {}
        try { osc2Ref.current?.stop(); } catch (_) {}
        try { ctx.close(); } catch (_) {}
        audioCtxRef.current = null;
        osc1Ref.current = null;
        osc2Ref.current = null;
        gainRef.current = null;
        gainRef2.current = null;
      }, 200);
    } else {
      audioCtxRef.current = null;
      osc1Ref.current = null;
      osc2Ref.current = null;
      gainRef.current = null;
      gainRef2.current = null;
    }
  }

  function clearTimers() {
    if (liveTimerRef.current) { clearInterval(liveTimerRef.current); liveTimerRef.current = null; }
    if (tickerRef.current)    { clearInterval(tickerRef.current);    tickerRef.current = null; }
  }

  function hardStop() {
    stoppedRef.current = true;
    clearTimers();
    hardStopDrone();
    const mr = mrRef.current;
    if (mr && mr.state !== "inactive") {
      try { mr.stop(); } catch (_) {}
      mr.stream?.getTracks().forEach(t => t.stop());
    }
    mrRef.current = null;
  }

  // ── Phase 1: Start drone, user listens for 3 seconds ─────────────────────
  function startListenPhase() {
  setError("");
  setPoints([]);
  setElapsed(0);
  setCurrentStatus(null);
  stoppedRef.current = false;
  startDrone();
  setPhase("listen");
}

  // ── Phase 2: Start mic, user sings ────────────────────────────────────────
  async function startSingPhase() {
    setPhase("sing");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied — please allow and refresh");
      hardStop();
      setPhase("idle");
      return;
    }

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
      .find(m => MediaRecorder.isTypeSupported(m)) || "";
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mrRef.current = mr;
    chunksRef.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(1500);
    console.log("MediaRecorder started, mimeType:", mr.mimeType, "state:", mr.state);
    startedAtRef.current = Date.now();

    // Countdown ticker
    tickerRef.current = setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(Math.min(secs, TOTAL_SECONDS));
      if (secs >= TOTAL_SECONDS) finishSession();
    }, 100);

    // Live pitch analysis
    liveTimerRef.current = setInterval(async () => {
  if (stoppedRef.current) return;
  if (chunksRef.current.length === 0) return;
  
  // Send ALL chunks accumulated so far (not just new ones)
  // WebM requires the header chunk to decode any subsequent chunk
  const blob = new Blob([...chunksRef.current], { type: mimeType || "audio/webm" });
  if (blob.size < 3000) return;

  try {
    const form = new FormData();
    form.append("file", blob, "chunk.webm");
    const res = await fetch(`${API}/pitch_stability`, { method: "POST", body: form });
    if (!res.ok) return;
    const data = await res.json();
    if (data.status === "ok") {
      setCurrentStatus(data.sa_status as SaStatus);
      setCurrentCents(data.cents_from_sa ?? 0);
      setRegister(data.register ?? "");
      setRegisterTip(data.register_tip ?? "");
      setStrain(data.strain ?? "");
      if (data.pitch_points?.length) {
        setPoints(prev => [
          ...prev,
          ...data.pitch_points.map((c: number) => ({ cents: c }))
        ]);
      }
    } else {
      setCurrentStatus(data.status as SaStatus);
    }
  } catch (e) {
    console.error(e);
  }
}, 1500);
  }

  // ── Finish ────────────────────────────────────────────────────────────────
  function finishSession() {
    hardStop();
    setPhase("result");
  }

  function resetAll() {
    hardStop();
    setTimeout(() => {
      stoppedRef.current = false;
      setPhase("idle");
      setPoints([]);
      setElapsed(0);
      setCurrentStatus(null);
      setCurrentCents(0);
      setError("");
      setRegister("");
      setRegisterTip("");
      setStrain("");
    }, 250);
  }

  // ── SVG ───────────────────────────────────────────────────────────────────
  function centsToY(cents: number) {
    return SA_Y - (cents / CENTS_RANGE) * (SVG_H * 0.45);
  }

  function buildPath(pts: StabilityPoint[]) {
    if (pts.length < 2) return "";
    const MAX = 200;
    const display = pts.slice(-MAX);
    const total = Math.max(display.length - 1, 1);
    return display.map((p, i) => {
    const x = (i / total) * SVG_W;
      const y = Math.max(4, Math.min(SVG_H - 4, centsToY(p.cents)));
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  }

  function getScore(pts: StabilityPoint[]) {
  if (pts.length < 5) return 0;
  const mean = pts.reduce((s, p) => s + p.cents, 0) / pts.length;
  // Filter outliers before calculating stability
  const filtered = pts.filter(p => Math.abs(p.cents - mean) < 300);
  if (filtered.length < 3) return 0;
  const filteredMean = filtered.reduce((s, p) => s + p.cents, 0) / filtered.length;
  const variance = filtered.reduce((s, p) => s + Math.abs(p.cents - filteredMean), 0) / filtered.length;
  const stabilityScore = Math.max(0, Math.round(100 - variance * 0.5));
  const onSa = filtered.filter(p => Math.abs(p.cents) < 100).length;
  const saBonus = Math.round((onSa / filtered.length) * 30);
  return Math.min(100, stabilityScore + saBonus);
}

  const score      = getScore(points);
  const lineColor  = currentStatus && STATUS_COLOR[currentStatus]
    ? STATUS_COLOR[currentStatus] : "var(--text3)";
  const remaining  = Math.max(0, Math.ceil(TOTAL_SECONDS - elapsed));

  // ── Theory screen ─────────────────────────────────────────────────────────
  if (view === "theory") {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">📡 Pitch Awareness</div>
        </div>
        <div className="learn-detail-body">
          <div className="learn-tag">Foundation</div>
          <p className="learn-subtitle">Finding and holding your Sa</p>
          <div className="learn-content">
            <p className="learn-para">
              Sa is the home note of Carnatic music. Every other swara — Re, Ga, Ma,
              Pa, Dha, Ni — is defined by its distance from Sa. If you know your Sa,
              everything else follows.
            </p>
            <p className="learn-para">
              The app plays Sa (C4 — 261.63 Hz) as a drone. Your job is to hum along
              and match it. Do not worry about what note it is — just listen and follow.
            </p>
            <p className="learn-para">
              The line on screen shows how steady your pitch is. A flat line at the
              centre means you are holding Sa. A wavy line means your pitch is drifting.
              The goal is a flat line for 10 seconds.
            </p>
            <p className="learn-para">
              Most beginners' voices waver without realising. That is completely normal.
              Steadiness comes with daily practice.
            </p>
          </div>
          <div className="breathing-tip">
            <div className="tip-label">💡 Teacher's tip</div>
            <p>The app will play Sa for 3 seconds first — just listen. Then it will ask
            you to sing. Hum softly, do not force it. Let your voice find the note
            naturally.</p>
          </div>
          <div className="learn-done-wrap" style={{ marginTop: 8 }}>
            <button className="ctrl-btn sing-btn" onClick={() => setView("practice")}>
              Start Practising →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Practice screen ───────────────────────────────────────────────────────
  return (
    <div className="breathing-screen">
      <div className="learn-detail-header">
        <button className="back-btn" onClick={() => {
          hardStop();
          setView("theory");
          setPhase("idle");
          setPoints([]);
          setElapsed(0);
        }}>← Back</button>
        <div className="learn-detail-title">📡 Sa · C4 · 261.63 Hz</div>
        {phase === "sing" && (
          <div className="round-badge" style={{
            color: remaining <= 3 ? "var(--orange)" : "var(--accent)"
          }}>
            {remaining}s
          </div>
        )}
      </div>

      <div className="breathing-body" style={{ gap: 20, paddingTop: 24 }}>

        {/* ── IDLE ── */}
        {phase === "idle" && (
          <>
            <div style={{
              textAlign: "center", maxWidth: 300,
              color: "var(--text2)", fontSize: 14, lineHeight: 1.8,
            }}>
              Press Start. Sa will play for <strong style={{ color: "var(--text)" }}>3 seconds</strong> —
              just listen. Then <strong style={{ color: "var(--text)" }}>sing Sa</strong> and hold it
              steady for <strong style={{ color: "var(--text)" }}>10 seconds</strong>.
            </div>
            <button className="ctrl-btn sing-btn" onClick={startListenPhase}
              style={{ marginTop: 8 }}>
              ▶ Start
            </button>
          </>
        )}

        {/* ── LISTEN phase ── */}
        {phase === "listen" && (
  <>
    <div style={{
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 52, color: "var(--accent)",
      letterSpacing: 2, lineHeight: 1,
    }}>
      Listen to Sa...
    </div>

    <div style={{
      width: 120, height: 120, borderRadius: "50%",
      border: "3px solid var(--accent)",
      background: "rgba(200,169,110,0.08)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      boxShadow: "0 0 30px rgba(200,169,110,0.2)",
      animation: "pulse 2s ease-in-out infinite",
    }}>
      <span style={{ fontSize: 36 }}>🎵</span>
      <span style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>
        Sa · 261.63 Hz
      </span>
    </div>

    <p style={{
      fontSize: 13, color: "var(--text2)",
      textAlign: "center", maxWidth: 280, lineHeight: 1.7,
    }}>
      Let it settle in your ear. When you feel ready to match it, press the button below.
    </p>

    <button className="ctrl-btn sing-btn" onClick={startSingPhase}>
      🎤 I'm Ready — Sing Sa
    </button>

    <button
      className="ctrl-btn play-btn"
      onClick={() => { hardStop(); setPhase("idle"); }}
      style={{ marginTop: -8 }}
    >
      Cancel
    </button>
  </>
)}

        {/* ── SING phase ── */}
        {phase === "sing" && (
          <>
            {/* Status */}
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 48, letterSpacing: 2, lineHeight: 1,
              color: lineColor, transition: "color 0.3s",
              textAlign: "center", minHeight: 52,
            }}>
              {currentStatus === "on_sa"    ? "Sa ✓" :
               currentStatus === "close"    ? "Almost there" :
               currentStatus === "too_high" ? "Too High ↑" :
               currentStatus === "too_low"  ? "Too Low ↓" :
               "Sing Sa  🎤"}
            </div>
            {currentStatus === "on_sa" && (
              <div style={{
                fontSize: 12, color: "var(--green)",
                fontFamily: "monospace", marginTop: -12,
              }}>
                {currentCents > 0
                  ? `+${currentCents.toFixed(0)}`
                  : currentCents.toFixed(0)} cents from Sa
              </div>
            )}
             {phase === "sing" && currentStatus && currentStatus !== "on_sa" && currentStatus !== "no_voice" && (
  <div style={{ fontSize: 13, color: "var(--text2)", textAlign: "center", maxWidth: 260, lineHeight: 1.6, marginTop: -12 }}>
    {currentStatus === "too_low"
      ? "Raise your voice — sing brighter, like you're surprised"
      : currentStatus === "too_high"
      ? "Relax your voice down — sing softer and lower"
      : "You're close — hold it steady"}
  </div>
)}

            {/* Stability line */}
            <div style={{
              width: "100%", maxWidth: 520,
              background: "var(--bg2)",
              border: `1px solid ${lineColor}`,
              borderRadius: "var(--r)",
              padding: "16px 12px 8px",
              position: "relative",
              transition: "border-color 0.3s",
            }}>
              <div style={{
                position: "absolute", left: 10, top: "50%",
                transform: "translateY(-50%)",
                fontSize: 10, color: "var(--accent)",
                fontFamily: "monospace",
              }}>Sa</div>

              <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block" }}>
                <line x1={0} y1={centsToY(50)}  x2={SVG_W} y2={centsToY(50)}
                  stroke="var(--border)" strokeWidth={0.5} />
                <line x1={0} y1={centsToY(-50)} x2={SVG_W} y2={centsToY(-50)}
                  stroke="var(--border)" strokeWidth={0.5} />
                <line x1={0} y1={SA_Y} x2={SVG_W} y2={SA_Y}
                  stroke="var(--accent)" strokeWidth={1}
                  strokeDasharray="5 5" opacity={0.5} />
                {points.length > 1 && (
                  <path
                    d={buildPath(points)}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {points.length === 0 && (
                  <text x={SVG_W / 2} y={SA_Y + 4}
                    textAnchor="middle" fill="var(--text3)" fontSize={11}>
                    sing Sa and hold it steady...
                  </text>
                )}
              </svg>

              {/* Progress bar */}
              <div style={{
                marginTop: 8, height: 3,
                background: "var(--border)", borderRadius: 2,
              }}>
                <div style={{
                  height: "100%",
                  width: `${(elapsed / TOTAL_SECONDS) * 100}%`,
                  background: lineColor, borderRadius: 2,
                  transition: "width 0.1s linear",
                }} />
              </div>
            </div>

            <div style={{
              display: "flex", justifyContent: "space-between",
              width: "100%", maxWidth: 520,
              fontSize: 11, color: "var(--text3)", padding: "0 12px",
            }}>
              <span>↑ Too high</span>
              <span style={{ color: "var(--accent)" }}>— Sa (aim for centre)</span>
              <span>↓ Too low</span>
            </div>

            {/* Manual stop */}
            <button className="ctrl-btn stop-btn" onClick={finishSession}>
              ⬛ Stop Early
            </button>
          </>
        )}
         {register && (
  <div style={{
    width: "100%", maxWidth: 520,
    background: "var(--bg2)",
    border: `1px solid ${
      strain === "significant" ? "var(--red)" :
      strain === "mild" ? "var(--orange)" :
      register === "talking_voice" ? "var(--orange)" :
      "var(--border)"
    }`,
    borderRadius: "var(--r)",
    padding: "10px 14px",
    display: "flex", alignItems: "center", gap: 10,
    fontSize: 13, color: "var(--text2)",
  }}>
    <span style={{ fontSize: 18 }}>
      {strain === "significant" ? "⚠️" :
       register === "talking_voice" ? "🗣️" :
       register === "chest_voice" ? "🫁" :
       register === "mixed_voice" ? "✨" : "🧠"}
    </span>
    <span>{registerTip}</span>
  </div>
)}
        {/* ── RESULT phase ── */}
        {phase === "result" && (
          <>
            {/* Show the line they drew */}
            {points.length > 1 && (
              <div style={{
                width: "100%", maxWidth: 520,
                background: "var(--bg2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                padding: "16px 12px 8px",
                position: "relative",
              }}>
                <div style={{
                  position: "absolute", left: 10, top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: 10, color: "var(--accent)", fontFamily: "monospace",
                }}>Sa</div>
                <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: "block" }}>
                  <line x1={0} y1={centsToY(50)}  x2={SVG_W} y2={centsToY(50)}
                    stroke="var(--border)" strokeWidth={0.5} />
                  <line x1={0} y1={centsToY(-50)} x2={SVG_W} y2={centsToY(-50)}
                    stroke="var(--border)" strokeWidth={0.5} />
                  <line x1={0} y1={SA_Y} x2={SVG_W} y2={SA_Y}
                    stroke="var(--accent)" strokeWidth={1}
                    strokeDasharray="5 5" opacity={0.5} />
                  <path
                    d={buildPath(points)}
                    fill="none"
                    stroke={score >= 70 ? "var(--green)"
                      : score >= 40 ? "var(--accent)" : "var(--orange)"}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}

            {/* Score card */}
            <div style={{
              width: "100%", maxWidth: 380,
              background: "var(--bg2)",
              border: `2px solid ${score >= 70 ? "var(--green)"
                : score >= 40 ? "var(--accent)" : "var(--orange)"}`,
              borderRadius: "var(--r)",
              padding: "20px",
              textAlign: "center",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, lineHeight: 1,
                color: score >= 70 ? "var(--green)"
                  : score >= 40 ? "var(--accent)" : "var(--orange)",
              }}>
                {score}%
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
                {score >= 70 ? "Strong Sa — well held 🎯"
                  : score >= 40 ? "Good start — keep practising daily"
                  : "Keep going — this takes time"}
              </div>
              <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>
                {score >= 70
                  ? "Your voice is finding Sa reliably. This is the foundation everything else is built on."
                  : score >= 40
                  ? "You are landing on Sa but drifting. Listen to the drone longer before you start humming."
                  : points.length < 1
                  ? "No pitch was detected — make sure your mic is working and hum loud enough."
                  : "Sit quietly, listen to the drone with closed eyes, then hum very softly."}
              </p>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button className="ctrl-btn play-btn" onClick={resetAll}>
                Try Again
              </button>
              <button className="ctrl-btn sing-btn" onClick={() => {
                hardStop();
                setView("theory");
                setPhase("idle");
                setPoints([]);
                setElapsed(0);
              }}>
                Done ✓
              </button>
            </div>
          </>
        )}

        {error && (
          <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>
        )}

      </div>
    </div>
  );
}