import { useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import { Home } from "./components/Home";
import { RoomJoin } from "./components/RoomJoin";
import { VideoPlayer } from "./components/VideoPlayer";
import { ParticipantList } from "./components/ParticipantList";
import { ChatPanel } from "./components/ChatPanel";
import { ToastStack, type ToastItem } from "./components/ToastStack";
import type { ChatMessage, Participant, PlaybackState, Role } from "./types";
import "./room.css";

type Screen = "home" | "join" | "room";
type ConnectionState = "connected" | "reconnecting" | "disconnected";

export default function App() {
  // Shared-room links (?room=CODE) skip the Home page entirely and land
  // straight on the Join form, pre-filled — per the required URL behavior.
  const [initialRoomId] = useState(() => new URLSearchParams(window.location.search).get("room") ?? undefined);

  const [screen, setScreen] = useState<Screen>(initialRoomId ? "join" : "home");
  const [joinMode, setJoinMode] = useState<"create" | "join">(initialRoomId ? "join" : "create");
  const [roomId, setRoomId] = useState("");
  const [me, setMe] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [playback, setPlayback] = useState<PlaybackState>({
    videoId: null,
    playState: "paused",
    currentTime: 0,
    lastUpdated: Date.now(),
  });
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    socket.connected ? "connected" : "disconnected"
  );
  const [flashUserId, setFlashUserId] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Keep the previous participant list around so we can diff it against
  // an incoming update and tell WHICH participant's role just changed
  // (the server only sends the new list, not a "what changed" delta).
  const prevParticipantsRef = useRef<Participant[]>([]);

  function pushToast(message: string) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  useEffect(() => {
    function onConnect() {
      setConnectionState("connected");
    }
    function onDisconnect() {
      setConnectionState("disconnected");
    }
    // socket.io-client fires this on its underlying Manager while it's
    // actively retrying — distinct from a plain "disconnected" state.
    function onReconnectAttempt() {
      setConnectionState("reconnecting");
    }

    function onJoined(payload: { you: Participant; participants: Participant[] }) {
      setMe(payload.you);
      setParticipants(payload.participants);
      prevParticipantsRef.current = payload.participants;
      setError(null);
      setScreen("room");
    }
    function onSyncState(state: PlaybackState) {
      setPlayback(state);
    }
    function onChatHistory(payload: { messages: ChatMessage[] }) {
      setMessages(payload.messages);
    }
    function onChatMessage(message: ChatMessage) {
      setMessages((prev) => [...prev, message]);
    }
    function onUserJoined(payload: { username: string; participants: Participant[] }) {
      setParticipants(payload.participants);
      prevParticipantsRef.current = payload.participants;
      pushToast(`${payload.username} joined the room`);
    }
    function onUserLeft(payload: { username: string; participants: Participant[] }) {
      setParticipants(payload.participants);
      prevParticipantsRef.current = payload.participants;
      pushToast(`${payload.username} left the room`);
    }
    function onRoleAssigned(payload: { participants: Participant[] }) {
      // Diff against the previous list to find who actually changed role,
      // so we can show a toast + a brief highlight on their row.
      const prev = prevParticipantsRef.current;
      for (const p of payload.participants) {
        const before = prev.find((x) => x.userId === p.userId);
        if (before && before.role !== p.role) {
          setFlashUserId(p.userId);
          setTimeout(() => setFlashUserId((cur) => (cur === p.userId ? null : cur)), 1600);

          setMe((currentMe) => {
            if (currentMe?.userId === p.userId) {
              pushToast(`You are now ${roleLabel(p.role)}`);
            } else {
              pushToast(`${p.username} is now ${roleLabel(p.role)}`);
            }
            return currentMe;
          });
        }
      }

      setParticipants(payload.participants);
      prevParticipantsRef.current = payload.participants;
      setMe((prevMe) => {
        if (!prevMe) return prevMe;
        const updated = payload.participants.find((p) => p.userId === prevMe.userId);
        return updated ?? prevMe;
      });
    }
    function onParticipantRemoved(payload: { participants: Participant[] }) {
      setParticipants(payload.participants);
      prevParticipantsRef.current = payload.participants;
    }
    function onRemovedFromRoom() {
      pushToast("You were removed from the room");
      resetRoomState();
      setScreen("home");
    }
    function onErrorMessage(payload: { message: string }) {
      setError(payload.message);
      setTimeout(() => setError(null), 4000);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.on("joined", onJoined);
    socket.on("sync_state", onSyncState);
    socket.on("chat_history", onChatHistory);
    socket.on("chat_message", onChatMessage);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("role_assigned", onRoleAssigned);
    socket.on("participant_removed", onParticipantRemoved);
    socket.on("removed_from_room", onRemovedFromRoom);
    socket.on("error_message", onErrorMessage);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.off("joined", onJoined);
      socket.off("sync_state", onSyncState);
      socket.off("chat_history", onChatHistory);
      socket.off("chat_message", onChatMessage);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("role_assigned", onRoleAssigned);
      socket.off("participant_removed", onParticipantRemoved);
      socket.off("removed_from_room", onRemovedFromRoom);
      socket.off("error_message", onErrorMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleJoinSubmit(id: string, username: string) {
    setRoomId(id);
    socket.emit("join_room", { roomId: id, username });
  }

  const canControl = me?.role === "host" || me?.role === "moderator";
  const isHost = me?.role === "host";

  function copyRoomCode() {
    navigator.clipboard?.writeText(roomId);
    pushToast("Room code copied");
  }

  async function shareRoom() {
    const url = `${window.location.origin}/?room=${roomId}`;
    const shareData = { title: "SyncRoom", text: `Join my SyncRoom watch party — code ${roomId}`, url };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled the native share sheet — fall through to clipboard.
      }
    }
    navigator.clipboard?.writeText(url);
    pushToast("Invite link copied");
  }

  function resetRoomState() {
    setMe(null);
    setParticipants([]);
    setMessages([]);
    setPlayback({ videoId: null, playState: "paused", currentTime: 0, lastUpdated: Date.now() });
    setRoomId("");
  }

  /**
   * Explicit "Leave Room" action — tells the server so it can promote a
   * new Host / broadcast user_left properly, instead of relying on the
   * socket just disconnecting when the tab happens to close. Gated behind
   * a confirmation dialog so it can't be triggered by one accidental click.
   */
  function confirmLeaveRoom() {
    socket.emit("leave_room");
    resetRoomState();
    setShowLeaveConfirm(false);
    setScreen("home");
  }

  // ---- Screen: Home ----
  if (screen === "home") {
    return (
      <Home
        onCreateRoom={() => {
          setJoinMode("create");
          setScreen("join");
        }}
        onJoinRoom={() => {
          setJoinMode("join");
          setScreen("join");
        }}
      />
    );
  }

  // ---- Screen: Create/Join form ----
  if (screen === "join") {
    return (
      <RoomJoin
        mode={joinMode}
        initialRoomId={initialRoomId}
        onSubmit={handleJoinSubmit}
        onBack={() => setScreen("home")}
      />
    );
  }

  // ---- Screen: Room ----
  return (
    <div className="room-screen">
      <header className="room-header">
        <div>
          <span className="eyebrow">SyncRoom · Room</span>
          <h1>{roomId}</h1>
        </div>
        <div className="header-actions">
          <span className="connection-status">
            <span className={`connection-dot connection-dot-${connectionState}`} />
            {connectionState === "connected" && "Connected"}
            {connectionState === "reconnecting" && "Reconnecting…"}
            {connectionState === "disconnected" && "Disconnected"}
          </span>
          <button className="btn" onClick={copyRoomCode}>
            Copy room code
          </button>
          <button className="btn" onClick={shareRoom}>
            Share room
          </button>
          <button className="btn btn-danger" onClick={() => setShowLeaveConfirm(true)}>
            Leave room
          </button>
        </div>
      </header>

      {error && <div className="banner banner-danger">{error}</div>}

      <div className="room-body">
        <VideoPlayer
          playback={playback}
          canControl={canControl}
          onPlay={(t) => socket.emit("play", { currentTime: t })}
          onPause={(t) => socket.emit("pause", { currentTime: t })}
          onSeek={(t) => socket.emit("seek", { time: t })}
          onChangeVideo={(id) => socket.emit("change_video", { videoId: id })}
        />

        <div className="sidebar-stack">
          <ParticipantList
            participants={participants}
            myUserId={me?.userId ?? ""}
            isHost={isHost}
            flashUserId={flashUserId}
            onAssignRole={(userId, role: Role) => socket.emit("assign_role", { userId, role })}
            onRemove={(userId) => socket.emit("remove_participant", { userId })}
          />

          <ChatPanel
            messages={messages}
            canSend={canControl}
            onSend={(text) => socket.emit("chat_message", { text })}
          />
        </div>
      </div>

      {showLeaveConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h3>Leave this room?</h3>
            <p>You'll need the room code again to rejoin.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowLeaveConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmLeaveRoom}>
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}

function roleLabel(role: Role): string {
  if (role === "host") return "the Host";
  if (role === "moderator") return "a Moderator";
  return "a Participant";
}
