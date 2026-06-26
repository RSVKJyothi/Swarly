import { useState, useRef } from "react";

const API = "http://localhost:8000";

type View = "theory" | "practice";
type Step = "speak" | "sing" | "result";
type RegisterResult = {
  status: string;
  register?: string;
  register_message?: string;
  strain?: string;
  strain_message?: string;
  median_pitch_hz?: number;
  hnr?: number;
};

const REGISTER_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  talking_voice: { label: "Talking voice ", color: "var(--accent)", icon: "🗣️" },
  chest_voice:   { label: "Chest Voice",            color: "var(--accent)", icon: "🫁" },
  mixed_voice:   { label: "Mixed Voice",            color: "var(--green)",  icon: "✨" },
  head_voice:    { label: "Head Voice",             color: "#7c6fff",       icon: "🧠" },
};

export default function FindingYourVoice({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>("theory");
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [step, setStep] = useState<Step>("speak");
  const [speakingPitch, setSpeakingPitch] = useState(0);
  const [speakingHNR, setSpeakingHNR] = useState(-99);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stepRef = useRef<Step>("speak");

  function goToStep(s: Step) {
    stepRef.current = s;
    setStep(s);
  }

  async function startRecording() {
    setResult(null);
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied — please allow microphone and refresh");
      return;
    }
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
      .find(m => MediaRecorder.isTypeSupported(m)) || "";
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mrRef.current = mr;
    chunksRef.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(200);
    setRecording(true);
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    setTimeout(() => {
      clearInterval(interval);
      if (stepRef.current === "speak") stopRecordingSpeak();
      else stopRecordingSing();
    }, 5000);
  }

  async function stopRecordingSpeak() {
    const mr = mrRef.current;
    if (!mr || mr.state === "inactive") return;
    await new Promise<void>(resolve => { mr.onstop = () => resolve(); mr.stop(); });
    mr.stream.getTracks().forEach(t => t.stop());
    setRecording(false);
    setLoading(true);
    const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
    try {
      const form = new FormData();
      form.append("file", blob, "speak.webm");
      const res = await fetch(`${API}/detect_register`, { method: "POST", body: form });
      const data: RegisterResult = await res.json();
      if (data.status === "ok" && data.median_pitch_hz && data.median_pitch_hz > 80) {
        setSpeakingPitch(data.median_pitch_hz);
        setSpeakingHNR(data.hnr ?? -99);
        goToStep("sing");
      } else {
        setError("Could not measure your speaking voice clearly — speak a little louder and try again");
      }
    } catch {
      setError("Something went wrong — please try again");
    }
    setLoading(false);
  }

  async function stopRecordingSing() {
    const mr = mrRef.current;
    if (!mr || mr.state === "inactive") return;
    await new Promise<void>(resolve => { mr.onstop = () => resolve(); mr.stop(); });
    mr.stream.getTracks().forEach(t => t.stop());
    setRecording(false);
    setLoading(true);
    const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
    try {
      const form = new FormData();
      form.append("file", blob, "sing.webm");
      if (speakingPitch > 80) {
        form.append("speaking_pitch_hz", String(speakingPitch));
        form.append("speaking_hnr", String(speakingHNR));
      }
      const res = await fetch(`${API}/detect_register`, { method: "POST", body: form });
      const data: RegisterResult = await res.json();
      setResult(data);
      goToStep("result");
    } catch {
      setError("Something went wrong — please try again");
    }
    setLoading(false);
  }

  // ── SCREEN 1: Theory ──────────────────────────────────────────────────────
  if (view === "theory") {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">🎙️ Finding Your Singing Voice</div>
        </div>
        <div className="learn-detail-body">
          <div className="learn-tag">Foundation</div>
          <p className="learn-subtitle">Chest, head, and talking voice</p>

          <div className="learn-content">
            <p className="learn-para">
              Most beginners sing in their talking voice without realising it. Your talking voice
              and singing voice are different — and using your talking voice to sing causes strain
              and limits your range.
            </p>
            <p className="learn-para">
              There are three main voice registers: Chest voice (lower notes, warm and full),
              Head voice (higher notes, lighter and clearer), and Mixed voice (the blend between them).
            </p>
            <p className="learn-para">
              To find your chest voice: Speak the word "Hello" normally. Now sustain the "o" sound
              and let it become a sung note. That warm, grounded sound is your chest voice.
            </p>
            <p className="learn-para">
              To find your head voice: Make a "wee" sound going upward like a siren. At the top,
              the lighter, thinner sound is your head voice. It should feel like the sound is
              coming from behind your eyes.
            </p>
            <p className="learn-para">
              The talking voice problem: If you feel your throat tightening or straining when you
              sing, you are using your talking voice. Stop, rest, and try again with a lighter,
              more forward sound.
            </p>
          </div>

          <div className="breathing-tip">
            <div className="tip-label">💡 Teacher's tip</div>
            <p>Every time you open the app, hum a comfortable note for 10 seconds. Notice where
            you feel the vibration. Chest = chest and throat. Head = face and skull. This awareness
            is the foundation.</p>
          </div>

          <div className="learn-done-wrap" style={{ marginTop: 8 }}>
            <button className="ctrl-btn sing-btn" onClick={() => setView("practice")}>
              Detect My Voice →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SCREEN 2: Practice ────────────────────────────────────────────────────
  const reg = result?.register ? REGISTER_DISPLAY[result.register] : null;

  return (
    <div className="breathing-screen">
      <div className="learn-detail-header">
        <button className="back-btn" onClick={() => {
          setResult(null); setStep("speak"); setSpeakingPitch(0); setSpeakingHNR(-99);
        }}>← Back</button>
        <div className="learn-detail-title">🎙️ Voice Type Detector</div>
      </div>

      <div className="breathing-body" style={{ gap: 20, paddingTop: 32 }}>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {["speak", "sing", "result"].map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: step === s ? "var(--accent)" :
                  (["speak","sing","result"].indexOf(step) > i ? "var(--green)" : "var(--bg3)"),
                border: `2px solid ${step === s ? "var(--accent)" :
                  (["speak","sing","result"].indexOf(step) > i ? "var(--green)" : "var(--border)")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 600,
                color: step === s ? "#000" :
                  (["speak","sing","result"].indexOf(step) > i ? "#000" : "var(--text3)"),
              }}>
                {["speak","sing","result"].indexOf(step) > i ? "✓" : i + 1}
              </div>
              {i < 2 && <div style={{ width: 24, height: 2, background: "var(--border)" }} />}
            </div>
          ))}
        </div>

        {/* STEP 1 — record speaking voice */}
        {step === "speak" && (
          <>
            <div style={{ textAlign: "center", maxWidth: 300, color: "var(--text2)", fontSize: 14, lineHeight: 1.7 }}>
              Say <strong style={{ color: "var(--text)" }}>"Hello, how are you"</strong> naturally,
              as if greeting a friend.
            </div>

            <div
              onClick={recording ? stopRecordingSpeak : startRecording}
              style={{
                width: 140, height: 140, borderRadius: "50%",
                border: `3px solid ${recording ? "var(--red)" : "var(--accent)"}`,
                background: recording ? "rgba(248,113,113,0.08)" : "rgba(200,169,110,0.06)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                boxShadow: recording ? "0 0 40px rgba(248,113,113,0.25)" : "none",
                transition: "all 0.3s ease",
              }}
            >
              <span style={{ fontSize: 40 }}>💬</span>
              <span style={{ fontSize: 12, color: recording ? "var(--red)" : "var(--accent)", marginTop: 6 }}>
                {recording ? "Stop" : "Tap to speak"}
              </span>
            </div>

            {recording && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 64,
                  color: countdown <= 2 ? "var(--orange)" : "var(--accent)", lineHeight: 1,
                }}>{countdown}</div>
                <div style={{ color: "var(--text2)", fontSize: 13 }}>🔴 Keep speaking...</div>
              </div>
            )}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text2)", fontSize: 13 }}>
                <div className="mini-spin" /> Measuring your speaking voice...
              </div>
            )}
          </>
        )}

        {/* STEP 2 — record singing voice */}
        {step === "sing" && (
          <>
            <div style={{
              background: "var(--bg2)", border: "1px solid var(--border)",
              borderLeft: "3px solid var(--green)",
              borderRadius: "var(--r)", padding: "12px 16px",
              fontSize: 13, color: "var(--text2)", maxWidth: 320,
            }}>
              ✅ Speaking voice recorded — {speakingPitch.toFixed(0)} Hz
            </div>

            <div style={{ textAlign: "center", maxWidth: 300, color: "var(--text2)", fontSize: 14, lineHeight: 1.7 }}>
              Now say <strong style={{ color: "var(--text)" }}>"Hello"</strong> again —
              but this time, when you reach the <strong style={{ color: "var(--text)" }}>"o"</strong>,
              let it bloom into a sung note and hold it.
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--text3)" }}>
                Like this: "Hell — ooooo 🎵"
              </div>
            </div>

            <div
              onClick={recording ? stopRecordingSing : startRecording}
              style={{
                width: 140, height: 140, borderRadius: "50%",
                border: `3px solid ${recording ? "var(--red)" : "#7c6fff"}`,
                background: recording ? "rgba(248,113,113,0.08)" : "rgba(124,111,255,0.06)",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                boxShadow: recording ? "0 0 40px rgba(248,113,113,0.25)" : "none",
                transition: "all 0.3s ease",
              }}
            >
              <span style={{ fontSize: 40 }}>{recording ? "⬛" : "🎤"}</span>
              <span style={{ fontSize: 12, color: recording ? "var(--red)" : "#7c6fff", marginTop: 6 }}>
                {recording ? "Stop" : "Tap to sing"}
              </span>
            </div>

            {recording && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 64,
                  color: countdown <= 2 ? "var(--orange)" : "#7c6fff", lineHeight: 1,
                }}>{countdown}</div>
                <div style={{ color: "var(--text2)", fontSize: 13 }}>🔴 Hold the "o"...</div>
            </div>
            )}

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text2)", fontSize: 13 }}>
                <div className="mini-spin" /> Comparing your voices...
              </div>
            )}
          </>
        )}

        {/* STEP 3 — result */}
        {step === "result" && result && result.status === "ok" && reg && (
          <>
            <div style={{
              width: "100%", maxWidth: 360,
              background: "var(--bg2)",
              border: `2px solid ${reg.color}`,
              borderRadius: "var(--r)",
              padding: "24px 20px",
              display: "flex", flexDirection: "column", gap: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 36 }}>{reg.icon}</span>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text3)", letterSpacing: 2, textTransform: "uppercase" }}>
                    Detected
                  </div>
                  <div style={{ fontSize: 24, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, color: reg.color }}>
                    {reg.label}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.7 }}>
                {result.register_message}
              </p>

              {result.strain !== "none" && (
                <p style={{
                  fontSize: 13, color: "var(--orange)", lineHeight: 1.6,
                  borderTop: "1px solid var(--border)", paddingTop: 10,
                }}>
                  ⚠️ {result.strain_message}
                </p>
              )}

              <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "monospace" }}>
                Speaking: {speakingPitch.toFixed(0)} Hz · Singing: {result.median_pitch_hz} Hz
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button className="ctrl-btn play-btn" onClick={() => {
                setResult(null);
                setStep("speak");
                setSpeakingPitch(0);
                setSpeakingHNR(-99);
              }}>
                Try Again
              </button>
              <button className="ctrl-btn sing-btn" onClick={onBack}>
                Done ✓
              </button>
            </div>
          </>
        )}

        {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}

      </div>
    </div>
  );
}