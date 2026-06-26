import { useState, useEffect, useRef } from "react";

type Phase = "idle" | "inhale" | "hold" | "exhale" | "rest";
type Exercise = "478" | "hiss" | "hum";
type View = "theory" | "practice";

const EXERCISES = [
  { id: "478" as Exercise, icon: "🫁", title: "4-7-8 Breathing", sub: "The foundation breath" },
  { id: "hiss" as Exercise, icon: "🐍", title: "Hissing — ssss", sub: "Builds breath control" },
  { id: "hum" as Exercise, icon: "🎵", title: "Humming — mmmm", sub: "Warms up your voice" },
];

const PHASE_CONFIG: Record<Exercise, { phases: Phase[]; counts: number[]; labels: string[]; colors: string[] }> = {
  "478": {
    phases: ["inhale", "hold", "exhale", "rest"],
    counts: [4, 7, 8, 1],
    labels: ["Inhale", "Hold", "Exhale", ""],
    colors: ["#7c6fff", "#c8a96e", "#4ade80", "#55556a"],
  },
  hiss: {
    phases: ["inhale", "exhale", "rest"],
    counts: [4, 12, 2],
    labels: ["Inhale", "Exhale — sssss", ""],
    colors: ["#7c6fff", "#fb923c", "#55556a"],
  },
  hum: {
    phases: ["inhale", "exhale", "rest"],
    counts: [3, 10, 2],
    labels: ["Inhale", "Hum — mmmm", ""],
    colors: ["#7c6fff", "#4ade80", "#55556a"],
  },
};

const ROUNDS = 5;

export default function BreathingExercise({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>("theory");
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(0);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function start() {
    if (!selected) return;
    setRunning(true);
    setDone(false);
    setRound(1);
    setPhaseIdx(0);
    runPhase(selected, 0, 1);
  }

  function runPhase(ex: Exercise, pIdx: number, r: number) {
    const cfg = PHASE_CONFIG[ex];
    setPhase(cfg.phases[pIdx]);
    setCount(cfg.counts[pIdx]);
    setPhaseIdx(pIdx);
    let remaining = cfg.counts[pIdx];
    clearTimer();
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCount(remaining);
      if (remaining <= 0) {
        clearTimer();
        const nextPIdx = pIdx + 1;
        if (nextPIdx >= cfg.phases.length) {
          const nextRound = r + 1;
          if (nextRound > ROUNDS) {
            setRunning(false);
            setPhase("idle");
            setDone(true);
          } else {
            setRound(nextRound);
            runPhase(ex, 0, nextRound);
          }
        } else {
          runPhase(ex, nextPIdx, r);
        }
      }
    }, 1000);
  }

  function stop() {
    clearTimer();
    setRunning(false);
    setPhase("idle");
    setCount(0);
    setRound(0);
  }

  function selectExercise(id: Exercise) {
    if (running) stop();
    setDone(false);
    setSelected(id);
  }

  useEffect(() => () => clearTimer(), []);

  const cfg = selected ? PHASE_CONFIG[selected] : null;
  const currentColor = cfg && phase !== "idle" ? cfg.colors[phaseIdx] ?? "#55556a" : "var(--border)";
  const currentLabel = cfg && phase !== "idle" ? cfg.labels[phaseIdx] ?? "" : "";
  const circleScale = phase === "inhale" ? 1.3 : phase === "hold" ? 1.3 : phase === "exhale" ? 0.85 : 1;
  const exInfo = selected ? EXERCISES.find(e => e.id === selected)! : null;

  // ── SCREEN 1: Theory ──────────────────────────────────────────────────────
  if (view === "theory") {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">🌬️ Breathing & Posture</div>
        </div>

        <div className="learn-detail-body">
          <div className="learn-tag">Foundation</div>
          <p className="learn-subtitle">The foundation of every singer</p>

          <div className="learn-content">
            <p className="learn-para">
              Before you sing a single note, your body needs to be ready. Singing is physical — it
              uses your lungs, throat, chest, and stomach together.
            </p>
            <p className="learn-para">
              Sit straight or stand. Your spine should feel tall, not stiff. Think of a string
              gently pulling the top of your head upward.
            </p>
            <p className="learn-para">
              Breathe from your belly, not your chest. Put your hand on your stomach — when you
              inhale, your hand should move outward. This is called diaphragmatic breathing and
              it is how every trained singer breathes.
            </p>
            <p className="learn-para">
              Try this: Inhale slowly for 4 counts, hold for 4 counts, exhale slowly for 8 counts.
              Repeat 5 times before every practice session.
            </p>
            <p className="learn-para">
              Hissing exercise: Inhale fully, then exhale slowly making a 'ssss' sound for as long
              as you can. This builds breath control.
            </p>
            <p className="learn-para">
              Humming exercise: Hum 'mmmm' on a comfortable note. Feel the vibration in your lips
              and face. This warms up your voice without strain.
            </p>
          </div>

          <div className="breathing-tip">
            <div className="tip-label">💡 Teacher's tip</div>
            <p>Always do the 4-7-8 exercise first. Then hissing. Then humming.
            In that order, they prepare your lungs, build control, and warm up your vocal cords.</p>
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

  // ── SCREEN 2: Practice ────────────────────────────────────────────────────
  return (
    <div className="breathing-screen">
      <div className="learn-detail-header">
        <button className="back-btn" onClick={() => { stop(); setSelected(null); setView("theory"); }}>← Back</button>
        <div className="learn-detail-title">🌬️ Breathing Exercises</div>
        {running && <div className="round-badge">Round {round}/{ROUNDS}</div>}
      </div>

      {/* Exercise picker — always visible at top */}
      <div className="breathing-intro" style={{ paddingBottom: 0 }}>
        <div className="learn-block-label">Choose an exercise</div>
        <p className="learn-block-sub">Do 5 rounds before every practice session.</p>
        <div className="breathing-cards">
          {EXERCISES.map(ex => (
            <div
              key={ex.id}
              className="breathing-card"
              style={selected === ex.id
                ? { borderColor: "var(--accent)", background: "rgba(200,169,110,0.06)" }
                : {}}
              onClick={() => selectExercise(ex.id)}
            >
              <div className="bc-icon">{ex.icon}</div>
              <div className="bc-info">
                <div className="bc-title">{ex.title}</div>
                <div className="bc-sub">{ex.sub}</div>
              </div>
              <div className="lc-arrow">{selected === ex.id ? "✓" : "→"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Exercise player — appears below once one is selected */}
      {selected && exInfo ? (
        <div className="breathing-body">
          {done ? (
            <div className="breathing-done">
              <div className="done-big">✅</div>
              <div className="done-title">Well done!</div>
              <p className="done-sub">You completed {ROUNDS} rounds. Your lungs and voice are ready.</p>
              <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                <button className="ctrl-btn sing-btn" onClick={() => { setDone(false); start(); }}>
                  Again
                </button>
                <button className="ctrl-btn play-btn" onClick={() => { stop(); setDone(false); setSelected(null); }}>
                  Change
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="breath-circle-wrap">
                <div
                  className="breath-circle"
                  style={{
                    transform: `scale(${running ? circleScale : 1})`,
                    borderColor: currentColor,
                    boxShadow: running ? `0 0 40px ${currentColor}40` : "none",
                    transition: phase === "inhale"
                      ? `transform ${cfg!.counts[0]}s ease-in-out`
                      : phase === "exhale"
                      ? `transform ${cfg!.counts[selected === "hiss" ? 1 : 2]}s ease-in-out`
                      : "transform 0.3s ease",
                  }}
                >
                  <div className="breath-count" style={{ color: running ? currentColor : "var(--text3)" }}>
                    {running ? count : ""}
                  </div>
                  <div className="breath-phase-label" style={{ color: currentColor }}>
                    {running ? currentLabel : "Ready"}
                  </div>
                </div>
              </div>

              {!running && (
                <div className="breath-instructions">
                  {selected === "478" && (
                    <>
                      <div className="bi-row"><span className="bi-num" style={{ color: "#7c6fff" }}>4</span><span>counts inhale through your nose</span></div>
                      <div className="bi-row"><span className="bi-num" style={{ color: "var(--accent)" }}>7</span><span>counts hold your breath</span></div>
                      <div className="bi-row"><span className="bi-num" style={{ color: "var(--green)" }}>8</span><span>counts exhale through your mouth</span></div>
                    </>
                  )}
                  {selected === "hiss" && (
                    <>
                      <div className="bi-row"><span className="bi-num" style={{ color: "#7c6fff" }}>4</span><span>counts inhale deeply</span></div>
                      <div className="bi-row"><span className="bi-num" style={{ color: "var(--orange)" }}>12</span><span>counts exhale as "sssss" — steady and controlled</span></div>
                    </>
                  )}
                  {selected === "hum" && (
                    <>
                      <div className="bi-row"><span className="bi-num" style={{ color: "#7c6fff" }}>3</span><span>counts inhale</span></div>
                      <div className="bi-row"><span className="bi-num" style={{ color: "var(--green)" }}>10</span><span>counts hum "mmmm" — feel vibration in your lips</span></div>
                    </>
                  )}
                  <p className="bi-rounds">{ROUNDS} rounds total</p>
                </div>
              )}

              <button
                className={`ctrl-btn ${running ? "stop-btn" : "sing-btn"}`}
                onClick={running ? stop : start}
                style={{ marginTop: 24 }}
              >
                {running ? "⬛ Stop" : "▶ Start"}
              </button>
            </>
          )}
        </div>
      ) : (
        // Nothing selected yet — gentle prompt
        <div style={{ textAlign: "center", color: "var(--text3)", fontSize: 13, padding: "32px 24px" }}>
          Choose an exercise above to begin
        </div>
      )}
    </div>
  );
}