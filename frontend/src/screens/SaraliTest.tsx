import { useState, useRef } from "react";
import {
  SARALI_VARIATIONS, getSwaraLabel, flattenVariationTokens,
  timePerAksharaForKaalam, generateTestQuestions,
} from "../data/saraliSwaras";
import type { TestQuestion, Variation, Cycle, Script } from "../data/saraliSwaras";

const API = "http://localhost:8000";

type Phase = "intro" | "question" | "result" | "summary";

type QuestionResult = {
  final_score: number;
  level: string;
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

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "var(--green)",
  medium: "var(--accent)",
  hard: "var(--red)",
};

const KAALAM_NAMES: Record<number, string> = {
  1: "1 swara per beat (slow)",
  2: "2 swaras per beat (medium)",
  3: "4 swaras per beat (fast)",
};

// ── Read-only notation display (no playback, no highlighting) ───────────────
function NotationDisplay({ variation, script }: { variation: Variation; script: Script }) {
  function renderGroup(group: { swara: string; slots: number }[]) {
    return group.map(t => getSwaraLabel(t as any, script)).join(" ");
  }

  function renderCycle(cycle: Cycle, idx: number) {
    const all = [
      ...cycle.laghu.map(g => ({ g, type: "laghu" })),
      ...cycle.drutham1.map(g => ({ g, type: "d1" })),
      ...cycle.drutham2.map(g => ({ g, type: "d2" })),
    ].filter(x => x.g.length > 0);

    return (
      <div key={idx} style={{
        background: "var(--bg2)", border: "1px solid var(--border)",
        borderRadius: "var(--r)", padding: "10px 12px", marginBottom: 8,
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {all.map(({ g }, i) => (
            <div key={i} style={{
              fontFamily: script === "en" ? "'Bebas Neue', sans-serif" : "inherit",
              fontSize: script === "en" ? 18 : 16,
              color: "var(--text)",
              padding: "4px 8px",
              background: "var(--bg3)",
              borderRadius: 6,
            }}>
              {renderGroup(g as any)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <div>{variation.cycles.map((c, i) => renderCycle(c, i))}</div>;
}

export default function SaraliTest({ onBack, onPassed }: { onBack: () => void; onPassed: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [recording, setRecording] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [currentResult, setCurrentResult] = useState<QuestionResult | null>(null);
  const [error, setError] = useState("");

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentQuestion = questions[qIndex];
  const currentVariation = currentQuestion
    ? SARALI_VARIATIONS.find(v => v.number === currentQuestion.variationNumber)!
    : null;

  function startTest() {
    const qs = generateTestQuestions();
    setQuestions(qs);
    setQIndex(0);
    setResults([]);
    setCurrentResult(null);
    setPhase("question");
  }

  async function startRecording() {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied — please allow and refresh");
      return;
    }
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
      .find(m => MediaRecorder.isTypeSupported(m)) || "";
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mrRef.current = mr;
    chunksRef.current = [];
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(300);
    setRecording(true);
  }

  async function stopRecording() {
    const mr = mrRef.current;
    if (!mr || mr.state === "inactive") return;
    await new Promise<void>(resolve => { mr.onstop = () => resolve(); mr.stop(); });
    mr.stream.getTracks().forEach(t => t.stop());
    setRecording(false);
    setScoring(true);

    const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });

    try {
      const tokens = flattenVariationTokens(currentVariation!);
      const timePerAkshara = timePerAksharaForKaalam(currentQuestion.kaalam);

      const form = new FormData();
      form.append("user_pitch", blob, "test.webm");
      form.append("tokens_json", JSON.stringify(tokens));
      form.append("time_per_akshara", String(timePerAkshara));

      const res = await fetch(`${API}/score_sarali`, { method: "POST", body: form });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setScoring(false);
        return;
      }

      setCurrentResult(data);
      setResults(prev => [...prev, data]);
      setPhase("result");
    } catch (e) {
      setError("Something went wrong — please try again");
    }
    setScoring(false);
  }

  function nextQuestion() {
    if (qIndex + 1 >= questions.length) {
      setPhase("summary");
    } else {
      setQIndex(qIndex + 1);
      setCurrentResult(null);
      setPhase("question");
    }
  }

  function retryQuestion() {
    setCurrentResult(null);
    setResults(prev => prev.slice(0, -1));
    setPhase("question");
  }

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">📋 Sarali Swaras Test</div>
        </div>
        <div className="learn-detail-body">
          <div className="learn-content">
            <p className="learn-para">
              This test checks if you're ready to move on to Janta Swaras. You'll see 7
              questions — 3 easy, 3 medium, and 1 hard — each showing a Sarali Swaras
              pattern for you to sing.
            </p>
            <p className="learn-para">
              There's no audio reference here — you'll read the notation and sing it from
              what you've learned. This is exactly what it means to truly know a pattern.
            </p>
            <p className="learn-para">
              Scoring is based on the shape of your singing, not exact pitch matching — every
              voice is different, and that's completely fine. Focus on the rises and falls,
              not hitting a specific note.
            </p>
          </div>

          <div className="breathing-tip">
            <div className="tip-label">💡 Teacher's tip</div>
            <p>Take a breath before each question. Read the notation once fully before you
            start singing — knowing where it's headed helps you sing it steadily.</p>
          </div>

          <div className="learn-done-wrap" style={{ marginTop: 8 }}>
            <button className="ctrl-btn sing-btn" onClick={startTest}>
              Start Test →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTION ──────────────────────────────────────────────────────────────
  if (phase === "question" && currentQuestion && currentVariation) {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Exit Test</button>
          <div className="learn-detail-title">Question {qIndex + 1} of {questions.length}</div>
        </div>

        <div style={{ padding: "16px 20px", maxWidth: 600, margin: "0 auto", width: "100%" }}>

          <div style={{
  background: "var(--bg2)",
  border: `2px solid ${DIFFICULTY_COLOR[currentQuestion.difficulty]}`,
  borderRadius: "var(--r)",
  padding: "16px 20px",
  marginBottom: 20,
  textAlign: "center",
}}>
  <div style={{
    display: "inline-block",
    padding: "4px 14px", borderRadius: 20,
    background: `${DIFFICULTY_COLOR[currentQuestion.difficulty]}22`,
    color: DIFFICULTY_COLOR[currentQuestion.difficulty],
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: 10,
  }}>
    {currentQuestion.difficulty}
  </div>

  <div style={{
    fontSize: 17, color: "var(--text)", fontWeight: 600, marginBottom: 6,
  }}>
    Variation {currentQuestion.variationNumber}
  </div>

  <div style={{
    display: "inline-flex", alignItems: "center", gap: 8,
    background: "rgba(124,111,255,0.12)",
    border: "1px solid #7c6fff",
    borderRadius: 20,
    padding: "6px 16px",
  }}>
    <span style={{ fontSize: 16 }}>⚡</span>
    <span style={{ fontSize: 14, color: "#7c6fff", fontWeight: 700 }}>
      Sing at Kaalam {currentQuestion.kaalam} — {KAALAM_NAMES[currentQuestion.kaalam]}
    </span>
  </div>
</div>

          <NotationDisplay variation={currentVariation} script="en" />

          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            {scoring ? (
              <div className="scoring-msg"><div className="mini-spin" />Analysing your singing...</div>
            ) : recording ? (
              <button className="ctrl-btn stop-btn" onClick={stopRecording}>⬛ Done — Submit</button>
            ) : (
              <button className="ctrl-btn sing-btn" onClick={startRecording}>🎤 Start Singing</button>
            )}
            {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT (per question) ────────────────────────────────────────────────
  if (phase === "result" && currentResult) {
    const scoreColor = currentResult.final_score >= 80 ? "var(--green)"
      : currentResult.final_score >= 55 ? "var(--orange)" : "var(--red)";

    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Exit Test</button>
          <div className="learn-detail-title">Question {qIndex + 1} Result</div>
        </div>

        <div className="feedback-screen" style={{ minHeight: "auto", paddingTop: 24 }}>
          <div className="fb-score" style={{ color: scoreColor }}>
            {currentResult.final_score}
            <span className="fb-level">{currentResult.level}</span>
          </div>

          <div className="fb-card main-fb">
            <span className="fb-ico">🎓</span>
            <p>{currentResult.feedback}</p>
          </div>

          {currentResult.voice_quality.strain !== "none" && (
            <div className="fb-card warn-fb">
              <span className="fb-ico">⚠️</span>
              <p>{currentResult.voice_quality.strain_message}</p>
            </div>
          )}

          <div className="fb-stats">
            <div className="stat-box"><span>Shape</span><strong>{currentResult.pitch_shape}%</strong></div>
            <div className="stat-box"><span>Rhythm</span><strong>{currentResult.rhythm}%</strong></div>
            <div className="stat-box"><span>Stability</span><strong>{currentResult.stability.replace("_", " ")}</strong></div>
          </div>

          <div className="fb-actions">
            <button className="ctrl-btn play-btn" onClick={retryQuestion}>Try Again</button>
            <button className="ctrl-btn sing-btn" onClick={nextQuestion}>
              {qIndex + 1 >= questions.length ? "See Final Result →" : "Next Question →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  if (phase === "summary") {
    const avgScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + r.final_score, 0) / results.length)
      : 0;

    const passed = avgScore >= 85;
    const readyWithoutHesitation = avgScore >= 90;

    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back to Learn</button>
          <div className="learn-detail-title">Test Complete</div>
        </div>

        <div className="feedback-screen" style={{ minHeight: "auto", paddingTop: 24 }}>
          <div className="fb-score" style={{
            color: readyWithoutHesitation ? "var(--green)" : passed ? "var(--accent)" : "var(--orange)"
          }}>
            {avgScore}
            <span className="fb-level">Average Score</span>
          </div>

          <div className="fb-card main-fb">
            <span className="fb-ico">{readyWithoutHesitation ? "🌟" : passed ? "✅" : "💪"}</span>
            <p>
              {readyWithoutHesitation
                ? "You're more than ready — go ahead and start Janta Swaras with confidence."
                : passed
                ? "You've passed! You can move on to Janta Swaras. If you'd like to feel even more confident, a little more practice on Sarali never hurts."
                : "You're not quite there yet — that's completely normal. Go back to Sarali Swaras practice for a bit longer, focus on the patterns you found hardest, and try this test again whenever you're ready."}
            </p>
          </div>

          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            width: "100%", maxWidth: 480, marginBottom: 16,
          }}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "var(--bg2)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "8px 14px", fontSize: 13,
              }}>
                <span style={{ color: "var(--text2)" }}>
                  Q{i + 1} · {questions[i].difficulty}
                </span>
                <span style={{
                  color: r.final_score >= 80 ? "var(--green)" : r.final_score >= 55 ? "var(--orange)" : "var(--red)",
                  fontWeight: 600,
                }}>
                  {r.final_score}
                </span>
              </div>
            ))}
          </div>

          <div className="fb-actions">
            <button className="ctrl-btn play-btn" onClick={startTest}>Retake Test</button>
            {passed ? (
              <button className="ctrl-btn sing-btn" onClick={onPassed}>
                Go to Janta Swaras →
              </button>
            ) : (
              <button className="ctrl-btn sing-btn" onClick={onBack}>
                Back to Practice
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}