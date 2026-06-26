import { useState } from "react";
import SaraliTest from "./SaraliTest";
import EarTrainingTest from "./EarTrainingTest";
type ExerciseView = "menu" | "sarali-test" | "ear-training-test";

export default function ExercisesScreen({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<ExerciseView>("menu");

  function markSaraliPassed() {
    try {
      localStorage.setItem("swarly_sarali_test_passed", "true");
    } catch {}
    setView("menu");
    onBack(); // back to home, or could navigate to Learn directly later
  }

  if (view === "sarali-test") {
    return (
      <SaraliTest
        onBack={() => setView("menu")}
        onPassed={markSaraliPassed}
      />
    );
  }
if (view === "ear-training-test") {
  return (
    <EarTrainingTest
      onBack={() => setView("menu")}
      onPassed={() => setView("menu")}
    />
  );
}
  return (
    <div className="learn-screen">
      <div className="learn-header">
        <button className="back-btn" onClick={onBack}>← Home</button>
        <div className="learn-title">Exercises</div>
      </div>

      <div className="learn-body">
        <div className="learn-block-label">Carnatic Tests</div>
        <p className="learn-block-sub">Test what you've learned, topic by topic.</p>

        <div className="learn-card" onClick={() => setView("sarali-test")}>
          <div className="lc-icon">📋</div>
          <div className="lc-info">
            <div className="lc-title">Sarali Swaras Test</div>
            <div className="lc-sub">Easy · Medium · Hard — unlocks Janta Swaras</div>
          </div>
          <div className="lc-arrow">→</div>
        </div>

        <div className="learn-card locked-card" style={{ marginTop: 10 }}>
          <div className="lc-icon">🔒</div>
          <div className="lc-info">
            <div className="lc-title">Janta Swaras Test</div>
            <div className="lc-sub">Complete Sarali Swaras Test first</div>
          </div>
          <div className="lc-locked-badge">Locked</div>
        </div>

        <div className="learn-block-label" style={{ marginTop: 32 }}>Ear Training</div>
        <p className="learn-block-sub">Test your ear — identify swaras you hear.</p>

        <div className="learn-card" onClick={() => setView("ear-training-test")}>
  <div className="lc-icon">🎧</div>
  <div className="lc-info">
    <div className="lc-title">Ear Training Test</div>
    <div className="lc-sub">Easy · Medium · Hard — identify swaras by ear</div>
  </div>
  <div className="lc-arrow">→</div>
</div>
      </div>
    </div>
  );
}