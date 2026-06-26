import { useState, useRef, useEffect } from "react";

const API = "http://localhost:8000";
const STORAGE_KEY = "swarly_chat_history";

type Message = {
  role: "user" | "assistant";
  content: string;
};

function loadHistory(): Message[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // ignore storage errors
  }
}

const SUGGESTED_QUESTIONS = [
  "What is a gamaka?",
  "Why does my voice shake on high notes?",
  "What's the difference between Sarali and Janta swaras?",
  "How do I stop straining my voice?",
];

export default function ChatScreen({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>(loadHistory);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveHistory(messages);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();

      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setError(data.error || "Something went wrong — please try again");
      }
    } catch {
      setError("Could not reach the server — make sure the backend is running");
    }
    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function clearChat() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <div className="breathing-screen" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className="learn-detail-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div className="learn-detail-title">💬 Ask</div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            style={{
              fontSize: 12, color: "var(--text3)", background: "none",
              border: "none", cursor: "pointer", textDecoration: "underline",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: "auto",
          padding: "16px 20px",
          maxWidth: 640, margin: "0 auto", width: "100%",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        {messages.length === 0 && (
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
            <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 600, marginBottom: 6 }}>
              Ask me anything about music
            </div>
            <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, maxWidth: 320, margin: "0 auto 24px" }}>
              Carnatic theory, singing technique, voice care — ask away.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 20,
                    border: "1px solid var(--border)",
                    background: "var(--bg2)",
                    color: "var(--text2)",
                    fontSize: 13,
                    cursor: "pointer",
                    maxWidth: 320,
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div style={{
              maxWidth: "78%",
              padding: "10px 16px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user" ? "rgba(200,169,110,0.15)" : "var(--bg2)",
              border: `1px solid ${msg.role === "user" ? "var(--accent)" : "var(--border)"}`,
              color: "var(--text)",
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              padding: "10px 16px",
              borderRadius: "16px 16px 16px 4px",
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div className="mini-spin" />
              <span style={{ fontSize: 13, color: "var(--text3)" }}>thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: "var(--red)", fontSize: 13, textAlign: "center", marginTop: 8 }}>
            {error}
          </div>
        )}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex", gap: 10,
          padding: "12px 20px 20px",
          maxWidth: 640, margin: "0 auto", width: "100%",
          boxSizing: "border-box",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a music question..."
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 24,
            border: "1px solid var(--border)",
            background: "var(--bg2)",
            color: "var(--text)",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="ctrl-btn sing-btn"
          style={{
            borderRadius: 24,
            opacity: loading || !input.trim() ? 0.5 : 1,
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}