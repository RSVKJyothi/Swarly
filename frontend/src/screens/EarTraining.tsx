import { useState } from "react";
import { ALL_SWARAS, SWARA_LABEL_TE, EAR_TRAINING_STEPS, STEP_TYPE_LABEL } from "../data/earTraining";
import { playSwara, loadHarmonium, startTanpura, stopTanpura } from "../audio/audioEngine";
import type { SwaraName } from "../audio/audioEngine";

type View = "theory" | "phase1" | "phase2";

function toAudioSwara(swara: string): SwaraName {
  if (swara.startsWith("*")) {
    return (swara.slice(1) + "'") as SwaraName;
  }
  return swara as SwaraName;
}

export default function EarTraining({ onBack }: { onBack: () => void }) {
  // ── All hooks declared up front, unconditionally ──────────────────────────
  const [view, setView] = useState<View>("theory");
  const [playingSwara, setPlayingSwara] = useState<string | null>(null);
  const [tanpuraOn, setTanpuraOn] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [playingCombo, setPlayingCombo] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);

  const currentStep = EAR_TRAINING_STEPS[stepIndex];

  async function playOne(swara: string) {
    setPlayingSwara(swara);
    await loadHarmonium();
    if (!tanpuraOn) {
      startTanpura();
      setTanpuraOn(true);
    }
    playSwara(toAudioSwara(swara), 1.0);
    setTimeout(() => setPlayingSwara(null), 1000);
  }

  function stopAll() {
    if (tanpuraOn) {
      stopTanpura();
      setTanpuraOn(false);
    }
  }

  async function playCombo() {
    setPlayingCombo(true);
    setHighlightIdx(null);
    await loadHarmonium();
    if (!tanpuraOn) {
      startTanpura();
      setTanpuraOn(true);
    }

    const NOTE_DURATION = 0.8;
    currentStep.swaras.forEach((swara, i) => {
      setTimeout(() => {
        setHighlightIdx(i);
        playSwara(toAudioSwara(swara), NOTE_DURATION * 0.9);
      }, i * NOTE_DURATION * 1000);
    });

    setTimeout(() => {
      setPlayingCombo(false);
      setHighlightIdx(null);
    }, currentStep.swaras.length * NOTE_DURATION * 1000 + 200);
  }

  function goToStep(idx: number) {
    if (idx < 0 || idx >= EAR_TRAINING_STEPS.length) return;
    setStepIndex(idx);
    setHighlightIdx(null);
  }

  // ── THEORY ────────────────────────────────────────────────────────────────
  if (view === "theory") {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">🎧 Ear Training</div>
        </div>
        <div className="learn-detail-body">
          <div className="learn-tag">Foundation</div>
          <p className="learn-subtitle">Training your ear to recognise swaras</p>

          <div className="learn-content">
            <p className="learn-para">
              Ear training is one of the most important skills in Carnatic music. A trained
              ear can recognise a swara the moment it's heard — without needing to see notation.
            </p>
            <p className="learn-para">
              In this lesson, you will listen to each swara on its own, then in small combinations.
              There's no test here — just listen, as many times as you want, until each note
              becomes familiar to your ear.
            </p>
            <p className="learn-para">
              Once you feel comfortable, you can test yourself in the Exercises section, where
              the app will ask you to identify swaras you hear.
            </p>
          </div>

          <div className="breathing-tip">
            <div className="tip-label">💡 Teacher's tip</div>
            <p>Don't rush this. Spend a few minutes each day just listening. Recognition
            comes from repetition, not from trying hard in one sitting.</p>
          </div>

          <div className="learn-done-wrap" style={{ marginTop: 8 }}>
            <button className="ctrl-btn sing-btn" onClick={() => setView("phase1")}>
              Start Listening →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PHASE 1: Individual swaras ───────────────────────────────────────────
  if (view === "phase1") {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={() => { stopAll(); setView("theory"); }}>← Back</button>
          <div className="learn-detail-title">🎧 Listen — Individual Swaras</div>
        </div>

        <div style={{ padding: "16px 20px", maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 20 }}>
            Tap each swara to hear it. Tap as many times as you like — there's no order to follow.
          </p>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
            marginBottom: 24,
          }}>
            {ALL_SWARAS.map(swara => (
              <button
                key={swara}
                onClick={() => playOne(swara)}
                style={{
                  aspectRatio: "1",
                  borderRadius: "var(--r)",
                  border: `2px solid ${playingSwara === swara ? "var(--accent)" : "var(--border)"}`,
                  background: playingSwara === swara ? "rgba(200,169,110,0.15)" : "var(--bg2)",
                  color: playingSwara === swara ? "var(--accent)" : "var(--text)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: playingSwara === swara ? "0 0 20px rgba(200,169,110,0.25)" : "none",
                }}
              >
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 28, letterSpacing: 1,
                }}>
                  {swara}
                </div>
                <div style={{ fontSize: 14, marginTop: 2, opacity: 0.8 }}>
                  {SWARA_LABEL_TE[swara]}
                </div>
              </button>
            ))}
          </div>

          <div style={{
            background: "var(--bg2)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--accent)",
            borderRadius: "var(--r)",
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--text2)",
            marginBottom: 20,
          }}>
            💡 Tap Sa first, then tap another swara right after. Notice how each one feels
            higher or lower compared to Sa.
          </div>

          <div className="learn-done-wrap">
            <button className="ctrl-btn sing-btn" onClick={() => { stopAll(); setView("phase2"); }}>
              Continue to Combinations →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PHASE 2: Combinations ────────────────────────────────────────────────
  return (
    <div className="breathing-screen">
      <div className="learn-detail-header">
        <button className="back-btn" onClick={() => { stopAll(); setView("phase1"); }}>← Back</button>
        <div className="learn-detail-title">🎧 Combinations</div>
        <div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "monospace" }}>
          {stepIndex + 1} / {EAR_TRAINING_STEPS.length}
        </div>
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 600, margin: "0 auto", width: "100%" }}>

        {/* Step type badge */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{
            padding: "5px 16px",
            borderRadius: 20,
            background: "rgba(124,111,255,0.12)",
            border: "1px solid #7c6fff",
            color: "#7c6fff",
            fontSize: 12,
            fontWeight: 600,
          }}>
            {STEP_TYPE_LABEL[currentStep.type]}
          </div>
        </div>

        {/* Swara display */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 12,
          marginBottom: 28, flexWrap: "wrap",
        }}>
          {currentStep.swaras.map((swara, i) => (
            <div key={i} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "16px 20px",
              borderRadius: "var(--r)",
              background: highlightIdx === i ? "rgba(200,169,110,0.18)" : "var(--bg2)",
              border: `2px solid ${highlightIdx === i ? "var(--accent)" : "var(--border)"}`,
              transition: "all 0.15s",
              minWidth: 64,
            }}>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 32,
                color: highlightIdx === i ? "var(--accent)" : "var(--text)",
                letterSpacing: 1,
              }}>
                {swara}
              </div>
              <div style={{ fontSize: 16, color: "var(--text2)", marginTop: 2 }}>
                {SWARA_LABEL_TE[swara]}
              </div>
            </div>
          ))}
        </div>

        {/* Play button */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <button
            className="ctrl-btn sing-btn"
            onClick={playCombo}
            disabled={playingCombo}
            style={{ opacity: playingCombo ? 0.6 : 1 }}
          >
            {playingCombo ? "🔊 Playing..." : "▶ Play This Combination"}
          </button>
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <button
            className="ctrl-btn play-btn"
            onClick={() => goToStep(stepIndex - 1)}
            disabled={stepIndex === 0}
            style={{ opacity: stepIndex === 0 ? 0.4 : 1, flex: 1 }}
          >
            ← Previous
          </button>
          <button
            className="ctrl-btn play-btn"
            onClick={() => goToStep(stepIndex + 1)}
            disabled={stepIndex === EAR_TRAINING_STEPS.length - 1}
            style={{ opacity: stepIndex === EAR_TRAINING_STEPS.length - 1 ? 0.4 : 1, flex: 1 }}
          >
            Next →
          </button>
        </div>

        {/* Progress dots */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center",
          marginBottom: 24,
        }}>
          {EAR_TRAINING_STEPS.map((_, i) => (
            <div
              key={i}
              onClick={() => goToStep(i)}
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: i === stepIndex ? "var(--accent)" : "var(--border)",
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        {stepIndex === EAR_TRAINING_STEPS.length - 1 && (
          <div className="learn-done-wrap">
            <div style={{
              background: "var(--bg2)", border: "1px solid var(--green)",
              borderRadius: "var(--r)", padding: "16px", textAlign: "center",
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 14, color: "var(--green)", fontWeight: 600, marginBottom: 4 }}>
                🎉 You've completed all combinations
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>
                Ready to test yourself? Head to Exercises → Ear Training Test.
              </div>
            </div>
            <button className="ctrl-btn sing-btn" onClick={() => { stopAll(); onBack(); }}>
              Back to Learn
            </button>
          </div>
        )}

      </div>
    </div>
  );
}