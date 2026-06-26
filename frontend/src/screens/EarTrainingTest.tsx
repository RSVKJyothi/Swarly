import { useState, useRef } from "react";
import {
  generateEarTestQuestions, SWARA_LABEL_TE,
} from "../data/earTraining";
import type { EarTestQuestion } from "../data/earTraining";
import { playSwara, loadHarmonium, startTanpura, stopTanpura } from "../audio/audioEngine";
import type { SwaraName } from "../audio/audioEngine";

type Phase = "intro" | "question" | "summary";

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: "var(--green)",
  medium: "var(--accent)",
  hard: "var(--red)",
};

function toAudioSwara(swara: string): SwaraName {
  if (swara.startsWith("*")) return (swara.slice(1) + "'") as SwaraName;
  return swara as SwaraName;
}

function sequencesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

export default function EarTrainingTest({ onBack, onPassed }: { onBack: () => void; onPassed: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<EarTestQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<boolean[]>([]); // true = correct
  const [playing, setPlaying] = useState(false);
  const [tanpuraOn, setTanpuraOn] = useState(false);

  const currentQuestion = questions[qIndex];

  function startTest() {
    const qs = generateEarTestQuestions();
    setQuestions(qs);
    setQIndex(0);
    setResults([]);
    setSelectedOption(null);
    setRevealed(false);
    setPhase("question");
  }

  async function playSequence(seq: string[]) {
    setPlaying(true);
    await loadHarmonium();
    if (!tanpuraOn) {
      startTanpura();
      setTanpuraOn(true);
    }
    const NOTE_DURATION = 0.8;
    seq.forEach((swara, i) => {
      setTimeout(() => {
        playSwara(toAudioSwara(swara), NOTE_DURATION * 0.9);
      }, i * NOTE_DURATION * 1000);
    });
    setTimeout(() => setPlaying(false), seq.length * NOTE_DURATION * 1000 + 200);
  }

  function selectOption(idx: number) {
    if (revealed) return;
    setSelectedOption(idx);
    setRevealed(true);
    const isCorrect = sequencesEqual(currentQuestion.options[idx], currentQuestion.answer);
    setResults(prev => [...prev, isCorrect]);
  }

  function nextQuestion() {
    if (tanpuraOn) { stopTanpura(); setTanpuraOn(false); }
    if (qIndex + 1 >= questions.length) {
      setPhase("summary");
    } else {
      setQIndex(qIndex + 1);
      setSelectedOption(null);
      setRevealed(false);
    }
  }

  function exitTest() {
    if (tanpuraOn) { stopTanpura(); setTanpuraOn(false); }
    onBack();
  }

  function formatSeq(seq: string[]): string {
    return seq.map(s => SWARA_LABEL_TE[s] ?? s).join(" ");
  }
  function formatSeqEn(seq: string[]): string {
    return seq.join(" ");
  }

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">🎧 Ear Training Test</div>
        </div>
        <div className="learn-detail-body">
          <div className="learn-content">
            <p className="learn-para">
              This test checks how well you can recognise swaras by ear. You'll hear 7
              questions — 3 easy, 3 medium, and 1 hard — and pick the correct answer from
              3 options each time.
            </p>
            <p className="learn-para">
              You can replay the audio as many times as you need before answering. Take
              your time — this is about training your ear, not rushing.
            </p>
          </div>
          <div className="breathing-tip">
            <div className="tip-label">💡 Teacher's tip</div>
            <p>Close your eyes while listening. Try to feel where the note sits compared
            to Sa before you look at the options.</p>
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
  if (phase === "question" && currentQuestion) {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={exitTest}>← Exit Test</button>
          <div className="learn-detail-title">Question {qIndex + 1} of {questions.length}</div>
        </div>

        <div style={{ padding: "16px 20px", maxWidth: 600, margin: "0 auto", width: "100%" }}>

          {/* Difficulty banner */}
          <div style={{
            background: "var(--bg2)",
            border: `2px solid ${DIFFICULTY_COLOR[currentQuestion.difficulty]}`,
            borderRadius: "var(--r)",
            padding: "14px 20px",
            marginBottom: 24,
            textAlign: "center",
          }}>
            <div style={{
              display: "inline-block",
              padding: "4px 14px", borderRadius: 20,
              background: `${DIFFICULTY_COLOR[currentQuestion.difficulty]}22`,
              color: DIFFICULTY_COLOR[currentQuestion.difficulty],
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 1,
            }}>
              {currentQuestion.difficulty}
            </div>
            <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 8 }}>
              {currentQuestion.answer.length === 1
                ? "Listen and identify the swara"
                : `Listen and identify the ${currentQuestion.answer.length}-note sequence`}
            </div>
          </div>

          {/* Play button */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <button
              className="ctrl-btn sing-btn"
              onClick={() => playSequence(currentQuestion.answer)}
              disabled={playing}
              style={{ opacity: playing ? 0.6 : 1 }}
            >
              {playing ? "🔊 Playing..." : "🔁 Play / Replay"}
            </button>
          </div>

          {/* Options */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {currentQuestion.options.map((opt, i) => {
              const isCorrectOption = sequencesEqual(opt, currentQuestion.answer);
              const isSelected = selectedOption === i;

              let borderColor = "var(--border)";
              let bg = "var(--bg2)";
              if (revealed) {
                if (isCorrectOption) {
                  borderColor = "var(--green)";
                  bg = "rgba(74,222,128,0.08)";
                } else if (isSelected) {
                  borderColor = "var(--red)";
                  bg = "rgba(248,113,113,0.08)";
                }
              } else if (isSelected) {
                borderColor = "var(--accent)";
              }

              return (
                <button
                  key={i}
                  onClick={() => selectOption(i)}
                  disabled={revealed}
                  style={{
                    background: bg,
                    border: `2px solid ${borderColor}`,
                    borderRadius: "var(--r)",
                    padding: "14px 18px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    cursor: revealed ? "default" : "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div>
                    <div style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 22, color: "var(--text)", letterSpacing: 1,
                    }}>
                      {formatSeqEn(opt)}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 2 }}>
                      {formatSeq(opt)}
                    </div>
                  </div>
                  {revealed && isCorrectOption && <span style={{ fontSize: 20 }}>✅</span>}
                  {revealed && isSelected && !isCorrectOption && <span style={{ fontSize: 20 }}>❌</span>}
                </button>
              );
            })}
          </div>

          {/* Feedback + next */}
          {revealed && (
            <div style={{
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderLeft: `3px solid ${results[results.length - 1] ? "var(--green)" : "var(--orange)"}`,
              borderRadius: "var(--r)",
              padding: "14px 18px",
              marginBottom: 16,
              fontSize: 14,
              color: "var(--text2)",
              lineHeight: 1.6,
            }}>
              {results[results.length - 1]
                ? "🎓 Correct — well recognised."
                : `🎓 Not quite — the correct answer was "${formatSeqEn(currentQuestion.answer)}". Listen again and notice the difference.`}
            </div>
          )}

          {revealed && (
            <div className="learn-done-wrap">
              <button className="ctrl-btn sing-btn" onClick={nextQuestion}>
                {qIndex + 1 >= questions.length ? "See Final Result →" : "Next Question →"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  if (phase === "summary") {
    const correctCount = results.filter(Boolean).length;
    const total = results.length;
    const percent = Math.round((correctCount / total) * 100);
    const passed = percent >= 70; // ear training threshold — lower bar, recognition-based

    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={exitTest}>← Back to Exercises</button>
          <div className="learn-detail-title">Test Complete</div>
        </div>

        <div className="feedback-screen" style={{ minHeight: "auto", paddingTop: 24 }}>
          <div className="fb-score" style={{ color: passed ? "var(--green)" : "var(--orange)" }}>
            {correctCount}/{total}
            <span className="fb-level">{percent}% correct</span>
          </div>

          <div className="fb-card main-fb">
            <span className="fb-ico">{passed ? "🌟" : "💪"}</span>
            <p>
              {passed
                ? "Your ear is recognising swaras well. Keep listening regularly to sharpen it further."
                : "Your ear is still developing — that takes time and regular listening. Go back to the Ear Training lesson and spend a few more sessions there before retrying."}
            </p>
          </div>

          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            width: "100%", maxWidth: 480, marginBottom: 16,
          }}>
            {results.map((correct, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "var(--bg2)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "8px 14px", fontSize: 13,
              }}>
                <span style={{ color: "var(--text2)" }}>
                  Q{i + 1} · {questions[i].difficulty}
                </span>
                <span style={{ color: correct ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                  {correct ? "Correct ✓" : "Missed ✗"}
                </span>
              </div>
            ))}
          </div>

          <div className="fb-actions">
            <button className="ctrl-btn play-btn" onClick={startTest}>Retake Test</button>
            <button className="ctrl-btn sing-btn" onClick={exitTest}>
              Back to Exercises
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}