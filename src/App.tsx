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
  revealed: boolean;
};

const FIBONACCI = ["1", "2", "3", "5", "8", "13", "☕"];
const DEFAULT_NAME = "Anonymous";

export default function App() {
  const [sessionId, setSessionId] = useState("");
  const [name] = useState(localStorage.getItem("userName") || "");
  const [userId] = useState(
    localStorage.getItem("userId") || crypto.randomUUID(),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin] = useState(false);

  useEffect(() => {
    localStorage.setItem("userId", userId);
    const params = new URLSearchParams(window.location.search);
    const id = params.get("session");
    if (id) {
      setSessionId(id);
      const sessionRef = ref(db, `sessions/${id}`);
      const unsubscribe = onValue(sessionRef, (snapshot) => {
        setSession(snapshot.val());
      });
      return () => unsubscribe();
    }
  }, [userId]);

  const createSession = async () => {
    const id = crypto.randomUUID();
    await set(ref(db, `sessions/${id}`), {
      participants: {
        [userId]: {
          name: name || DEFAULT_NAME,
          vote: null,
          isAdmin: true,
        },
      },
      revealed: false,
    });
    window.history.pushState({}, "", `?session=${id}`);
    setSessionId(id);
  };

  const joinSession = async () => {
    if (!sessionId) return;
    await update(ref(db, `sessions/${sessionId}/participants/${userId}`), {
      name: name || DEFAULT_NAME,
      vote: null,
      isAdmin: false,
    });
  };

  const submitVote = async (value: string) => {
    if (!sessionId) return;
    await update(ref(db, `sessions/${sessionId}/participants/${userId}`), {
      vote: value,
    });
  };

  const revealVotes = async () => {
    if (!sessionId) return;
    await update(ref(db, `sessions/${sessionId}`), { revealed: true });
  };

  const resetSession = async () => {
    if (!sessionId || !session) return;

    const updates: Record<string, null> = {};
    Object.keys(session.participants).forEach((uid) => {
      updates[`participants/${uid}/vote`] = null;
    });

    await update(ref(db, `sessions/${sessionId}`), {
      ...updates,
      revealed: false,
    });
  };

  if (!sessionId) {
    return (
      <div className="container">
        <input
          value={name}
          onChange={(e) => localStorage.setItem("userName", e.target.value)}
          placeholder="Your name"
        />
        <button onClick={createSession}>Create New Session</button>
        <div className="or">OR</div>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Enter session ID"
        />
        <button onClick={joinSession}>Join Session</button>
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
    <div className="container">
      <h2>Session: {sessionId}</h2>

      {isAdmin && (
        <div className="admin-controls">
          <button onClick={revealVotes}>Reveal Votes</button>
          <button onClick={resetSession}>Reset Session</button>
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

      <div className="voting-grid">
        {FIBONACCI.map((value) => (
          <button
            key={value}
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
