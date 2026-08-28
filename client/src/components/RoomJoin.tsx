import { useState } from "react";

interface Props {
  mode: "create" | "join";
  initialRoomId?: string;
  onSubmit: (roomId: string, username: string) => void;
  onBack: () => void;
}

function randomRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

/**
 * Pure join/create form. `mode` decides which fields show — it's passed in
 * from Home's "Create a Room" / "Join a Room" buttons, or forced to "join"
 * by App.tsx when the URL already contains ?room=CODE (see the shared-link
 * handling in App.tsx), in which case the room field arrives pre-filled.
 */
export function RoomJoin({ mode, initialRoomId, onSubmit, onBack }: Props) {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState(initialRoomId ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;

    if (mode === "create") {
      onSubmit(randomRoomCode(), username.trim());
    } else {
      if (!roomId.trim()) return;
      onSubmit(roomId.trim().toUpperCase(), username.trim());
    }
  }

  return (
    <div className="join-screen">
      <div className="ticket-stub">
        <span className="eyebrow">SyncRoom</span>
        <h1>Same screen. Same moment. Any room.</h1>
        <p className="tagline">
          Start a room, share the code, and everyone's play button moves
          together.
        </p>
      </div>

      <form className="join-form" onSubmit={handleSubmit}>
        <label>
          Your name
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Ashi"
            maxLength={40}
            autoFocus
          />
        </label>

        {mode === "join" && (
          <label>
            Room code
            <input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="e.g. 7QK6P"
              maxLength={12}
            />
          </label>
        )}

        <button className="btn btn-marquee btn-large" type="submit">
          {mode === "create" ? "Create Room →" : "Join Room →"}
        </button>
        <button className="btn" type="button" onClick={onBack}>
          ← Back
        </button>
      </form>
    </div>
  );
}
