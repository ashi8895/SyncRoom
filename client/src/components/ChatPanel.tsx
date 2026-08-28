import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

interface Props {
  messages: ChatMessage[];
  canSend: boolean; // Host or Moderator
  onSend: (text: string) => void;
}

/**
 * Read-only for everyone except Host/Moderator. Deliberately has no
 * reaction/emoji affordance — a Participant's only interaction with this
 * app is watching; even reacting to chat was decided to be too much.
 */
export function ChatPanel({ messages, canSend, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest message as they arrive.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  }

  return (
    <div className="chat-panel">
      <span className="eyebrow">Chat</span>

      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && <p className="hint-text">No messages yet.</p>}

        {messages.map((m) => (
          <div key={m.id} className="chat-message">
            <div className="chat-message-head">
              <span className="chat-message-author">{m.username}</span>
              <span className="chat-message-time">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="chat-message-text">{m.text}</p>
          </div>
        ))}
      </div>

      {canSend ? (
        <form className="chat-input-row" onSubmit={handleSubmit}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something…"
            maxLength={500}
          />
          <button className="btn btn-marquee" type="submit">
            Send
          </button>
        </form>
      ) : (
        <p className="hint-text">Only the Host or a Moderator can post messages. You can read along here.</p>
      )}
    </div>
  );
}
