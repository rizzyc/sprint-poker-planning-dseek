import { useEffect, useState } from "react";
import { ref, set, onValue, update } from "firebase/database";
import { db } from "./firebase";
import { Bar } from "react-chartjs-2";
import { Chart, registerables } from "chart.js";
import "./App.css";
Chart.register(...registerables);

type Participant = {
  name: string;
  vote: string | null;
  isAdmin: boolean;
};

type Session = {
  participants: Record<string, Participant>;
  topic: string;
  revealed: boolean;
};

const FIBONACCI = ["1", "2", "3", "5", "8", "13", "☕"];
const DEFAULT_NAME = "Anonymous";

export default function App() {
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("");
  const [userId] = useState(
    localStorage.getItem("userId") || crypto.randomUUID(),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [loadingError, setLoadingError] = useState("");

  // Initialize user ID
  useEffect(() => {
    localStorage.setItem("userId", userId);
    if (!localStorage.getItem("userName")) {
      setShowNameModal(true);
    }
  }, [userId]);

  useEffect(() => {
    localStorage.setItem("userId", userId);
  }, [userId]);

  // Session loading effect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session");

    if (id) {
      setSessionId(id);
      const sessionRef = ref(db, `sessions/${id}`);

      const unsubscribe = onValue(
        sessionRef,
        (snapshot) => {
          if (!snapshot.exists()) {
            setLoadingError("Session not found");
            return;
          }

          const data = snapshot.val();
          setSession(data);

          // Check if user needs to provide name
          if (!data.participants[userId] && !localStorage.getItem("userName")) {
            setShowNameModal(true);
          }
        },
        (error) => {
          setLoadingError("Failed to load session");
          console.error("Database error:", error);
        },
      );

      return () => unsubscribe();
    }
  }, [userId]);

  const createSession = async () => {
    const id = crypto.randomUUID();
    const userName = name.trim() || DEFAULT_NAME;

    try {
      await set(ref(db, `sessions/${id}`), {
        participants: {
          [userId]: {
            name: userName,
            vote: null,
            isAdmin: true,
          },
        },
        topic: newTopic || "Default Topic",
        revealed: false,
      });

      localStorage.setItem("userName", userName);
      setIsAdmin(true);
      window.history.pushState({}, "", `?session=${id}`);
      setSessionId(id);
    } catch (error) {
      console.error("Create session error:", error);
    }
  };

  const joinSession = async (userName: string) => {
    const finalName = userName.trim() || DEFAULT_NAME;

    try {
      await update(ref(db, `sessions/${sessionId}/participants/${userId}`), {
        name: finalName,
        vote: null,
        isAdmin: false,
      });

      localStorage.setItem("userName", finalName);
      setShowNameModal(false);
      setName(finalName);
    } catch (error) {
      console.error("Join session error:", error);
    }
  };

  if (!sessionId) {
    return (
      <div className="container">
        <input
          id="topic-input"
          value={newTopic}
          onChange={(e) => setNewTopic(e.target.value)}
          placeholder="Session topic"
        />
        <input
          id="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
        <button onClick={createSession}>Create New Session</button>
      </div>
    );
  }

  if (loadingError) {
    return (
      <div className="container">
        <h2>Error: {loadingError}</h2>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  const submitVote = async (value: string) => {
    if (!sessionId) return;
    await update(ref(db, `sessions/${sessionId}/participants/${userId}`), {
      vote: value,
    });
  };

  const resetSession = async () => {
    if (!sessionId || !session) return;

    const updates: Record<string, any> = {
      revealed: false,
      topic: newTopic || session.topic,
    };

    Object.keys(session.participants).forEach((uid) => {
      updates[`participants/${uid}/vote`] = null;
    });

    await update(ref(db, `sessions/${sessionId}`), updates);
    setNewTopic("");
  };

  if (!sessionId) {
    return (
      <div className="container" id="main-container">
        <div id="session-creation">
          <input
            id="topic-input"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="Session topic"
          />
          <input
            id="name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
          <button id="create-session-btn" onClick={createSession}>
            Create New Session
          </button>
        </div>
      </div>
    );
  }

  if (!session) return <div className="container">Loading session...</div>;

  const votes = Object.values(session.participants)
    .filter((p) => p.vote && !p.isAdmin)
    .map((p) => p.vote);

  const voteCounts: Record<string, number> = FIBONACCI.reduce(
    (acc, val) => {
      acc[val] = 0;
      return acc;
    },
    {} as Record<string, number>,
  );

  votes.forEach((vote) => {
    if (vote) voteCounts[vote] = (voteCounts[vote] || 0) + 1;
  });

  return (
    <div className="container" id="main-container">
      {showNameModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Enter Your Name to Join</h3>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
            <button onClick={() => joinSession(name)}>Join Session</button>
          </div>
        </div>
      )}

      <h2 id="session-topic">{session.topic}</h2>

      {isAdmin && (
        <div className="admin-controls">
          <input
            id="new-topic-input"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="New topic"
          />
          <button onClick={resetSession}>Reset Votes & Change Topic</button>
          <button
            onClick={() =>
              update(ref(db, `sessions/${sessionId}`), { revealed: true })
            }
          >
            Reveal Votes
          </button>
        </div>
      )}

      {session.revealed && (
        <div className="results">
          <h3>
            Average:{" "}
            {(
              votes.reduce((a, b) => a + (Number(b) || 0), 0) / votes.length
            ).toFixed(1)}
          </h3>
          <Bar
            data={{
              labels: FIBONACCI,
              datasets: [
                {
                  label: "Votes",
                  data: FIBONACCI.map((v) => voteCounts[v]),
                  backgroundColor: "#2196f3",
                },
              ],
            }}
          />
        </div>
      )}

      <div className="voting-grid" id="voting-grid">
        {FIBONACCI.map((value) => (
          <button
            key={value}
            id={`vote-btn-${value}`}
            onClick={() => submitVote(value)}
            className={
              session.participants[userId]?.vote === value ? "selected" : ""
            }
          >
            {value}
          </button>
        ))}
      </div>

      <div className="participants">
        <h3>Participants ({Object.keys(session.participants).length}/25)</h3>
        {Object.entries(session.participants).map(([uid, p]) => (
          <div key={uid} className="participant">
            <span>
              {p.name}
              {p.isAdmin ? " 👑" : ""}
            </span>
            {session.revealed ? (
              <span>{p.vote || "❌"}</span>
            ) : (
              <span>{p.vote ? "✅" : "❌"}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
