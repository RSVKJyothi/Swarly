import { useState, useEffect } from "react";
import BreathingExercise from "./BreathingExercise";
import FindingYourVoice from "./FindingYourVoice";
import PitchAwareness from "./PitchAwareness";
import SaraliSwaras from "./SaraliSwaras";
import EarTraining from "./EarTraining";
type Section = "foundation" | "level";

type FoundationTopic = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  content: string[];
};

type CurricTopic = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
};

const FOUNDATION: FoundationTopic[] = [
  {
    id: "breathing",
    title: "Breathing & Posture",
    subtitle: "The foundation of every singer",
    icon: "🌬️",
    content: [
      "Before you sing a single note, your body needs to be ready. Singing is physical — it uses your lungs, throat, chest, and stomach together.",
      "Sit straight or stand. Your spine should feel tall, not stiff. Think of a string gently pulling the top of your head upward.",
      "Breathe from your belly, not your chest. Put your hand on your stomach — when you inhale, your hand should move outward. This is called diaphragmatic breathing and it is how every trained singer breathes.",
      "Try this: Inhale slowly for 4 counts, hold for 4 counts, exhale slowly for 8 counts. Repeat 5 times before every practice session.",
      "Hissing exercise: Inhale fully, then exhale slowly making a 'ssss' sound for as long as you can. This builds breath control.",
      "Humming exercise: Hum 'mmmm' on a comfortable note. Feel the vibration in your lips and face. This warms up your voice without strain.",
    ],
  },
  {
    id: "voice",
    title: "Finding Your Singing Voice",
    subtitle: "Chest, head, and talking voice",
    icon: "🎙️",
    content: [
      "Most beginners sing in their talking voice without realising it. Your talking voice and singing voice are different — and using your talking voice to sing causes strain and limits your range.",
      "There are three main voice registers: Chest voice (lower notes, warm and full), Head voice (higher notes, lighter and clearer), and Mixed voice (the blend between them).",
      "To find your chest voice: Speak the word 'Hello' normally. Now sustain the 'o' sound and let it become a sung note. That warm, grounded sound is your chest voice.",
      "To find your head voice: Make a 'wee' sound going upward like a siren. At the top, the lighter, thinner sound is your head voice. It should feel like the sound is coming from behind your eyes.",
      "The talking voice problem: If you feel your throat tightening or straining when you sing, you are using your talking voice. Stop, rest, and try again with a lighter, more forward sound.",
      "Practice tip: Every time you open the app, hum a comfortable note for 10 seconds. Notice where you feel the vibration. Chest = chest and throat. Head = face and skull. This awareness is the foundation.",
    ],
  },
  {
    id: "pitch",
    title: "Pitch Awareness",
    subtitle: "Understanding high and low",
    icon: "📡",
    content: [
      "Pitch is simply how high or low a sound is. When a guitar string is tight, it vibrates fast and produces a high pitch. When loose, it vibrates slowly and produces a low pitch. Your vocal cords work the same way.",
      "In Carnatic music, pitch is everything. Every note you sing must land in the right place — not too high, not too low. This skill is called intonation and it takes practice to develop.",
      "The first step is just hearing the difference between high and low. Listen to any two sounds around you right now — a fan, a voice, a tap — and ask yourself: which is higher?",
      "Steady pitch: The hardest part for beginners is holding a note steady. Most people's voices wobble up and down without them realising. This is called pitch instability.",
      "Exercise: Hum any comfortable note and hold it for 10 seconds. Try to keep it perfectly steady — no wobble, no drift. This is harder than it sounds and it is the single most important exercise for a beginner.",
      "Important: Do not worry about which note you are singing. Just focus on holding it steady. The specific notes (Sa, Re, Ga) come later — first, learn to control your voice.",
    ],
  },
  {
  id: "ear",
  title: "Ear Training",
  subtitle: "Train your ear to recognise swaras",
  icon: "🎧",
  content: [], // not used since we intercept
},
];

const CURRICULUM: CurricTopic[] = [
  {
    id: "sarali",
    title: "Sarali Swaras",
    subtitle: "Sa Re Ga Ma Pa Dha Ni Sa",
    icon: "1",
    description: "The first and most fundamental exercise in Carnatic music. You will learn all 7 swaras in order, ascending and descending.",
  },
  {
    id: "janta",
    title: "Janta Swaras",
    subtitle: "Sa Sa Re Re Ga Ga...",
    icon: "2",
    description: "Each swara sung twice in succession. This builds steadiness and control on each note before moving to the next.",
  },
  {
    id: "datu",
    title: "Datu Swaras",
    subtitle: "Skipping patterns",
    icon: "3",
    description: "Notes sung in skipping patterns — Sa Ga Re Ma Ga Pa. This trains your voice to jump between notes accurately.",
  },
  {
    id: "alankaras",
    title: "Alankaras",
    subtitle: "The 7 fundamental patterns",
    icon: "4",
    description: "Seven rhythmic patterns that every Carnatic student must learn. These form the bridge between exercises and actual songs.",
  },
  {
    id: "gamaka_intro",
    title: "What is a Gamaka",
    subtitle: "The soul of Carnatic music",
    icon: "5",
    description: "Gamakas are ornaments — subtle movements between notes that give Carnatic music its emotion and character. You will learn to hear and identify them.",
  },
  {
    id: "kampita",
    title: "Kampita Gamaka",
    subtitle: "The oscillation",
    icon: "6",
    description: "A gentle shake or oscillation on a single note. This is the most common gamaka and appears in almost every Carnatic phrase.",
  },
  {
    id: "jaaru",
    title: "Jaaru Gamaka",
    subtitle: "The slide",
    icon: "7",
    description: "A smooth slide from one note to another — either ascending or descending. This gives phrases their characteristic gliding quality.",
  },
];

function getUnlockedLevels(): Set<string> {
  try {
    const saved = localStorage.getItem("swarly_completed");
    const completed: string[] = saved ? JSON.parse(saved) : [];
    const unlocked = new Set<string>();
    unlocked.add(CURRICULUM[0].id); // first always unlocked
    CURRICULUM.forEach((topic, i) => {
      if (completed.includes(topic.id) && i + 1 < CURRICULUM.length) {
        unlocked.add(CURRICULUM[i + 1].id);
      }
    });
    return unlocked;
  } catch {
    return new Set([CURRICULUM[0].id]);
  }
}

function getCompletedLevels(): Set<string> {
  try {
    const saved = localStorage.getItem("swarly_completed");
    return new Set(saved ? JSON.parse(saved) : []);
  } catch {
    return new Set();
  }
}

export default function LearnScreen({ onBack }: { onBack: () => void }) {
  const [unlocked, setUnlocked] = useState<Set<string>>(getUnlockedLevels);
  const [completed, setCompleted] = useState<Set<string>>(getCompletedLevels);
  const [selected, setSelected] = useState<{ type: "foundation" | "curriculum"; id: string } | null>(null);

  useEffect(() => {
    setUnlocked(getUnlockedLevels());
    setCompleted(getCompletedLevels());
  }, []);

  function markComplete(id: string) {
    const newCompleted = new Set(completed);
    newCompleted.add(id);
    localStorage.setItem("swarly_completed", JSON.stringify([...newCompleted]));
    setCompleted(newCompleted);
    setUnlocked(getUnlockedLevels());
    setSelected(null);
  }

  // Detail view — Foundation topic
  if (selected?.type === "foundation") {
  // Breathing gets its own interactive screen
  if (selected.id === "breathing") {
    return <BreathingExercise onBack={() => setSelected(null)} />;
  }
  if (selected.id === "voice") {
    return <FindingYourVoice onBack={() => setSelected(null)} />;
  }
  if (selected.id === "pitch") {
  return <PitchAwareness onBack={() => setSelected(null)} />;
}
if (selected.id === "ear") {
  return <EarTraining onBack={() => setSelected(null)} />;
}
  const topic = FOUNDATION.find(f => f.id === selected.id)!;
  return (
    <div className="learn-detail">
      <div className="learn-detail-header">
        <button className="back-btn" onClick={() => setSelected(null)}>← Back</button>
        <div className="learn-detail-title">{topic.icon} {topic.title}</div>
      </div>
      <div className="learn-detail-body">
        <div className="learn-tag">Foundation</div>
        <p className="learn-subtitle">{topic.subtitle}</p>
        <div className="learn-content">
          {topic.content.map((para, i) => (
            <p key={i} className="learn-para">{para}</p>
          ))}
        </div>
        <div className="learn-done-wrap">
          <button className="ctrl-btn sing-btn" onClick={() => setSelected(null)}>
            Got it — Back to Learn
          </button>
        </div>
      </div>
    </div>
  );
}
  // Detail view — Curriculum topic
  if (selected?.type === "curriculum") {
    const topic = CURRICULUM.find(c => c.id === selected.id)!;
    const isCompleted = completed.has(topic.id);
   if (selected.id === "sarali") {
    return <SaraliSwaras onBack={() => setSelected(null)} />;
    }
    return (
      <div className="learn-detail">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={() => setSelected(null)}>← Back</button>
          <div className="learn-detail-title">Level {topic.icon} — {topic.title}</div>
        </div>
        <div className="learn-detail-body">
          <div className="learn-tag carnatic-tag">Carnatic Curriculum</div>
          <p className="learn-subtitle">{topic.subtitle}</p>
          <div className="learn-content">
            <p className="learn-para">{topic.description}</p>
            <div className="coming-soon-box">
              <div className="cs-icon">🎵</div>
              <div className="cs-title">Lesson, Exercise & Test</div>
              <div className="cs-sub">Coming soon — full interactive lesson with audio exercises and tests will be here</div>
            </div>
          </div>
          {!isCompleted && (
            <div className="learn-done-wrap">
              <button className="ctrl-btn sing-btn" onClick={() => markComplete(topic.id)}>
                Mark as Complete → Unlock Next
              </button>
            </div>
          )}
          {isCompleted && (
            <div className="learn-done-wrap">
              <div className="completed-badge">✅ Completed</div>
              <button className="ctrl-btn play-btn" onClick={() => setSelected(null)}>Back</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main Learn screen
  return (
    <div className="learn-screen">
      <div className="learn-header">
        <button className="back-btn" onClick={onBack}>← Home</button>
        <div className="learn-title">Learn</div>
        <div className="learn-progress">
          {completed.size}/{CURRICULUM.length} done
        </div>
      </div>

      <div className="learn-body">

        {/* Foundation block */}
        <div className="learn-block-label">Foundation</div>
        <p className="learn-block-sub">Start here. No tests, no locking — just the basics every singer needs.</p>

        {FOUNDATION.map(topic => (
          <div
            key={topic.id}
            className="learn-card foundation-card"
            onClick={() => setSelected({ type: "foundation", id: topic.id })}
          >
            <div className="lc-icon">{topic.icon}</div>
            <div className="lc-info">
              <div className="lc-title">{topic.title}</div>
              <div className="lc-sub">{topic.subtitle}</div>
            </div>
            <div className="lc-arrow">→</div>
          </div>
        ))}

        {/* Carnatic curriculum */}
        <div className="learn-block-label" style={{ marginTop: 32 }}>Carnatic Curriculum</div>
        <p className="learn-block-sub">Complete each topic to unlock the next. Pass the test to move forward.</p>

        <div className="curriculum-path">
          {CURRICULUM.map((topic, i) => {
            const isUnlocked = unlocked.has(topic.id);
            const isDone = completed.has(topic.id);
            return (
              <div key={topic.id}>
                <div
                  className={`learn-card curriculum-card ${!isUnlocked ? "locked-card" : ""} ${isDone ? "done-card" : ""}`}
                  onClick={() => isUnlocked && setSelected({ type: "curriculum", id: topic.id })}
                >
                  <div className={`lc-num ${isDone ? "num-done" : isUnlocked ? "num-open" : "num-locked"}`}>
                    {isDone ? "✓" : isUnlocked ? topic.icon : "🔒"}
                  </div>
                  <div className="lc-info">
                    <div className="lc-title">{topic.title}</div>
                    <div className="lc-sub">{topic.subtitle}</div>
                  </div>
                  {isUnlocked && !isDone && <div className="lc-arrow">→</div>}
                  {isDone && <div className="lc-done-badge">Done</div>}
                  {!isUnlocked && <div className="lc-locked-badge">Locked</div>}
                </div>
                {i < CURRICULUM.length - 1 && (
                  <div className={`curriculum-connector ${isUnlocked ? "connector-open" : "connector-locked"}`} />
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}