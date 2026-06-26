import { useState, useRef } from "react";

const API = "http://localhost:8000";

type Window = {
  start: number;
  end: number;
  has_vocal: boolean;
  register: string | null;
  median_pitch_hz: number | null;
  hnr: number | null;
};

type Transition = {
  at: number;
  from_register: string | null;
  to_register: string | null;
  pitch_delta: number;
  direction: "up" | "down";
  register_changed: boolean;
};

type UnderstandResult = {
  status: string;
  duration: number;
  genre: string;
  pitch_range: { min_hz: number; max_hz: number; avg_hz: number } | null;
  windows: Window[];
  transitions: Transition[];
  walkthrough: string;
};

const REGISTER_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  talking_voice: { label: "Talking Voice", color: "var(--accent)", icon: "🗣️" },
  chest_voice:   { label: "Chest Voice",   color: "var(--accent)", icon: "🫁" },
  mixed_voice:   { label: "Mixed Voice",   color: "var(--green)",  icon: "✨" },
  head_voice:    { label: "Head Voice",    color: "#7c6fff",       icon: "🧠" },
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SongCoach({
  onBack,
  onContinueToPractice,
}: {
  onBack: () => void;
  onContinueToPractice: (songId: string, duration: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UnderstandResult | null>(null);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [songId, setSongId] = useState("");
  const fileRef = useRef<File | null>(null);
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
      fileRef.current = file;
    setFileName(file.name);
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/understand_song`, { method: "POST", body: form });
      const data: UnderstandResult = await res.json();
if (data.status === "ok") {
  setResult(data);
  if ((data as any).song_id) {
    setSongId((data as any).song_id);
  }
} else {
  setError("Could not analyse this song — try a different file");
}
    } catch {
      setError("Something went wrong while uploading — please try again");
    }
    setLoading(false);
  }

  // ── UPLOAD SCREEN ──────────────────────────────────────────────────────────
  if (!result && !loading) {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">🎼 Song Coach</div>
        </div>

        <div style={{ padding: "16px 20px", maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
            <div style={{ fontSize: 18, color: "var(--text)", fontWeight: 600, marginBottom: 8 }}>
              Upload a song to understand it
            </div>
            <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, maxWidth: 380, margin: "0 auto 28px" }}>
              I'll walk you through the song — what voice register it uses, where it rises
              and falls, and what to expect before you try singing it.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <button
              className="ctrl-btn sing-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose a song
            </button>

            {error && (
              <div style={{ color: "var(--red)", fontSize: 13, marginTop: 16 }}>{error}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING SCREEN ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="breathing-screen">
        <div className="learn-detail-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="learn-detail-title">🎼 Song Coach</div>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "60vh", gap: 16,
        }}>
          <div className="mini-spin" style={{ width: 32, height: 32 }} />
          <div style={{ color: "var(--text2)", fontSize: 14 }}>
            Listening to "{fileName}"...
          </div>
          <div style={{ color: "var(--text3)", fontSize: 12 }}>
            This usually takes a few seconds
          </div>
        </div>
      </div>
    );
  }

  // ── RESULTS SCREEN ─────────────────────────────────────────────────────────
  const r = result!;

  return (
    <div className="breathing-screen">
      <div className="learn-detail-header">
        <button className="back-btn" onClick={() => { setResult(null); setFileName(""); }}>
          ← New song
        </button>
        <div className="learn-detail-title">🎼 Song Coach</div>
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 640, margin: "0 auto", width: "100%" }}>

        {/* Song summary card */}
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--border)",
          borderRadius: "var(--r)", padding: "16px 20px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 600, marginBottom: 12 }}>
            {fileName}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 1 }}>DURATION</div>
              <div style={{ fontSize: 16, color: "var(--accent)", fontFamily: "'Bebas Neue', sans-serif" }}>
                {formatTime(r.duration)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 1 }}>GENRE</div>
              <div style={{ fontSize: 16, color: "var(--accent)", fontFamily: "'Bebas Neue', sans-serif" }}>
                {r.genre}
              </div>
            </div>
            {r.pitch_range && (
              <div>
                <div style={{ fontSize: 10, color: "var(--text3)", letterSpacing: 1 }}>PITCH RANGE</div>
                <div style={{ fontSize: 16, color: "var(--accent)", fontFamily: "'Bebas Neue', sans-serif" }}>
                  {r.pitch_range.min_hz}–{r.pitch_range.max_hz} Hz
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Walkthrough — the main teacher narrative */}
        <div style={{
          background: "var(--bg2)", border: "1px solid var(--accent)",
          borderRadius: "var(--r)", padding: "20px", marginBottom: 20,
        }}>
          <div style={{ fontSize: 10, color: "var(--accent)", letterSpacing: 2, marginBottom: 12 }}>
            💡 WALKTHROUGH
          </div>
          <p style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.8, margin: 0 }}>
            {r.walkthrough}
          </p>
        </div>

        {/* Register timeline */}
        <div style={{ marginBottom: 20 }}>
          <div className="learn-block-label" style={{ marginBottom: 10 }}>Register Timeline</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {r.windows.map((w, i) => {
              const reg = w.register ? REGISTER_DISPLAY[w.register] : null;
              return (
                <div key={i} title={`${formatTime(w.start)}–${formatTime(w.end)}`} style={{
                  flex: "1 1 auto", minWidth: 36,
                  height: 36,
                  borderRadius: 6,
                  background: reg ? `${reg.color}22` : "var(--bg3)",
                  border: `1px solid ${reg ? reg.color : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14,
                }}>
                  {reg ? reg.icon : "·"}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {Object.entries(REGISTER_DISPLAY).map(([key, val]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text3)" }}>
                <span>{val.icon}</span> {val.label}
              </div>
            ))}
          </div>
        </div>

        {/* Transitions list */}
        {r.transitions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="learn-block-label" style={{ marginBottom: 10 }}>Key Moments</div>
            {r.transitions.map((t, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                background: "var(--bg2)", border: "1px solid var(--border)",
                borderRadius: "var(--r)", marginBottom: 6,
              }}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: 16,
                  color: "var(--accent)", minWidth: 44,
                }}>
                  {formatTime(t.at)}
                </div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>
                  {t.direction === "up" ? "↗" : "↘"}{" "}
                  {t.from_register && REGISTER_DISPLAY[t.from_register]?.label} →{" "}
                  {t.to_register && REGISTER_DISPLAY[t.to_register]?.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Continue to practice — placeholder for now */}
        <button
  className="ctrl-btn sing-btn"
  onClick={async () => {
    if (!fileRef.current) return;
    const form = new FormData();
    form.append("file", fileRef.current);
    const res = await fetch(`${API}/analyze_song_coach`, { method: "POST", body: form });
    const data = await res.json();
    onContinueToPractice(data.song_id, r.duration);
  }}
>
  Continue to Practice →
</button>

      </div>
    </div>
  );
}