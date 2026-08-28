import type { Participant, Role } from "../types";

interface Props {
  participants: Participant[];
  myUserId: string;
  isHost: boolean;
  flashUserId: string | null;
  onAssignRole: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
}

const ROLE_LABEL: Record<Role, string> = {
  host: "Host",
  moderator: "Moderator",
  participant: "Participant",
};

export function ParticipantList({ participants, myUserId, isHost, flashUserId, onAssignRole, onRemove }: Props) {
  const count = participants.length;
  return (
    <div className="participant-panel">
      <span className="eyebrow">
        {count} {count === 1 ? "participant" : "participants"}
      </span>
      <ul className="participant-list">
        {participants.map((p) => (
          <li
            key={p.userId}
            className={`participant-row role-${p.role} ${p.userId === flashUserId ? "role-just-changed" : ""}`}
          >
            <div className="participant-identity">
              <span className="participant-name">
                {p.username}
                {p.userId === myUserId && <span className="you-tag"> (you)</span>}
              </span>
              <span className={`role-pill role-pill-${p.role}`}>{ROLE_LABEL[p.role]}</span>
            </div>

            {isHost && p.userId !== myUserId && (
              <div className="host-actions">
                <select
                  value={p.role}
                  onChange={(e) => onAssignRole(p.userId, e.target.value as Role)}
                  aria-label={`Change role for ${p.username}`}
                >
                  <option value="participant">Participant</option>
                  <option value="moderator">Moderator</option>
                  <option value="host">Host (transfer)</option>
                </select>
                <button className="btn btn-danger" onClick={() => onRemove(p.userId)}>
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
