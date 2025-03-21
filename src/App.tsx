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

  useEffect(() => {
    localStorage.setItem("userId", userId);
  }, [userId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session");
    if (id) {
      setSessionId(id);
      const sessionRef = ref(db, `sessions/${id}`);
      const unsubscribe = onValue(sessionRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setSession(data);
          if (!data.participants[userId] && !localStorage.getItem("userName")) {
            setShowNameModal(true);
          }
        }
      });
      return () => unsubscribe();
    }
  }, [userId]);

  const createSession = async () => {
    const id = crypto.randomUUID();
    const userName = name.trim() || DEFAULT_NAME;
    localStorage.setItem("userName", userName);

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

    setIsAdmin(true);
    window.history.pushState({}, "", `?session=${id}`);
    setSessionId(id);
  };

  const joinSession = async (userName: string) => {
    if (!sessionId) return;
    const finalName = userName.trim() || DEFAULT_NAME;
    localStorage.setItem("userName", finalName);

    await update(ref(db, `sessions/${sessionId}/participants/${userId}`), {
      name: finalName,
      vote: null,
      isAdmin: false,
    });
    setShowNameModal(false);
  };

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

  if (!session) return <div>Loading...</div>;

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
            <h3>Enter Your Name</h3>
            <input
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
