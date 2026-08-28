/**
 * Participant
 * Represents a single connected user inside a Room.
 * Kept intentionally dumb — it just holds identity/role state.
 * All authority logic (who can do what) lives in Room / permissions.js.
 */
export class Participant {
  /**
   * @param {string} socketId - the underlying Socket.IO connection id
   * @param {string} userId - stable id for this user within the room (persists across reconnects if you extend it later)
   * @param {string} username
   * @param {'host'|'moderator'|'participant'} role
   */
  constructor(socketId, userId, username, role = "participant") {
    this.socketId = socketId;
    this.userId = userId;
    this.username = username;
    this.role = role;
    this.joinedAt = Date.now();
  }

  /** Shape sent to clients — never leak socketId to other clients. */
  toPublic() {
    return {
      userId: this.userId,
      username: this.username,
      role: this.role,
    };
  }
}
