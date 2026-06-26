import type { Screen } from "../App";

export default function HomeScreen({
  onNavigate,
}: {
  currentScreen: Screen;
  onNavigate: (s: Screen) => void;
}) {
  return (
    <div className="home-screen">
      <div className="home-brand">
        <span className="brand-s">S</span>warly
      </div>
      <p className="home-tagline">Your Carnatic music teacher</p>

      <div className="journey">
        <div className="journey-node" onClick={() => onNavigate("learn")}>
          <div className="node-circle learn-circle">
            <span className="node-icon">📖</span>
          </div>
          <div className="node-info">
            <div className="node-title">Learn</div>
            <div className="node-sub">Foundations · Carnatic</div>
          </div>
        </div>

        <div className="journey-line" />

        <div className="journey-node" onClick={() => onNavigate("exercises")}>
          <div className="node-circle exercises-circle">
            <span className="node-icon">🎯</span>
          </div>
          <div className="node-info">
            <div className="node-title">Exercises</div>
            <div className="node-sub">Ear training tests · Carnatic tests</div>
          </div>
        </div>

        <div className="journey-line" />

        <div className="journey-node" onClick={() => onNavigate("practice")}>
          <div className="node-circle practice-circle">
            <span className="node-icon">🎤</span>
          </div>
          <div className="node-info">
            <div className="node-title">Song Coach</div>
            <div className="node-sub">Upload a song · Sing · Get feedback</div>
          </div>
        </div>

        <div className="journey-line" />

        <div className="journey-node" onClick={() => onNavigate("chat")}>
          <div className="node-circle chat-circle">
            <span className="node-icon">💬</span>
          </div>
          <div className="node-info">
            <div className="node-title">Ask</div>
            <div className="node-sub">Music questions · Doubts · Guidance</div>
          </div>
        </div>
      </div>
    </div>
  );
}