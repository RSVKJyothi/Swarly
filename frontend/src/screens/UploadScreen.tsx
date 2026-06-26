import { useState, useRef } from "react";
import type { SongData } from "../App";

const API = "http://localhost:8000";

export default function UploadScreen({ onSongReady, onBack }: { onSongReady: (s: SongData) => void; onBack?: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file) return;
    setLoading(true);
    setError("");
    setStatus("Uploading song...");

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/analyze`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed");
      const data: SongData = await res.json();

      setStatus("Analysing song... extracting swaras...");

      // Poll until ref is ready
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const check = await fetch(`${API}/analyze_ready/${data.song_id}`);
        const { ready } = await check.json();
        if (ready) {
          setStatus("Ready!");
          onSongReady(data);
          return;
        }
        setStatus(`Analysing song... ${i + 1}s`);
      }
      throw new Error("Analysis timed out");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      setLoading(false);
      setStatus("");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="upload-screen">
      <div className="upload-brand">
        <span className="brand-s">S</span>warly
      </div>
      <p className="upload-tagline">Your Carnatic singing coach</p>

      <div
        className={`upload-zone ${dragging ? "drag-over" : ""} ${loading ? "loading" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {loading ? (
          <div className="upload-loading">
            <div className="spinner" />
            <p className="status-text">{status}</p>
          </div>
        ) : (
          <>
            <div className="upload-icon">♪</div>
            <p className="upload-main">Drop your song here</p>
            <p className="upload-sub">or click to browse · MP3, WAV, M4A</p>
          </>
        )}
      </div>

      {error && <p className="upload-error">{error}</p>}

      <div className="upload-hints">
        <div className="hint">
          <span className="hint-icon">👂</span>
          <span>Understand the swara path before you sing</span>
        </div>
        <div className="hint">
          <span className="hint-icon">🎤</span>
          <span>Real-time feedback on your voice</span>
        </div>
        <div className="hint">
          <span className="hint-icon">🧘</span>
          <span>Detects strain before it hurts you</span>
        </div>
      </div>
    </div>
  );
}