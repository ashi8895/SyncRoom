import { nanoid } from "nanoid";
import { Participant } from "./Participant.js";
import { can, ROLES } from "./permissions.js";
import * as db from "./db/queries.js";

const MAX_CHAT_HISTORY = 200;

/**
 * Room
 * Owns everything about one watch party: who's in it, what role they have,
 * and what the video is currently doing. All mutation goes through this
 * class so the Socket.IO event handlers can stay thin (just: validate the
 * socket, call a Room method, done).
 */
export class Room {
  /**
   * @param {string} roomId
   * @param {import('socket.io').Server} io - used to broadcast to this room's channel
   */
  constructor(roomId, io) {
    this.roomId = roomId;
    this.io = io;

    /** @type {Map<string, Participant>} keyed by socketId */
    this.participants = new Map();

    // Numeric Postgres id for this room (once ensureRoom() has resolved).
    // Stays null when persistence is disabled — every DB call below is a
    // safe no-op in that case (see db/queries.js).
    this.dbRoomId = null;

    // Postgres row id for each socket's participant record, so we can mark
    // left_at when they leave. Keyed by socketId, same as `participants`.
    this.dbParticipantRowId = new Map();

    // Playback state — the single source of truth all clients sync against.
    this.state = {
      videoId: null,
      playState: "paused", // 'playing' | 'paused'
      currentTime: 0,
      lastUpdated: Date.now(),
    };

    /** @type {Array<{id:string, userId:string, username:string, text:string, timestamp:number}>} */
    this.messages = [];
  }

  get participantCount() {
    return this.participants.size;
  }

  get isEmpty() {
    return this.participants.size === 0;
  }

  /** Broadcast helper — sends to everyone currently in this room's Socket.IO channel. */
  broadcast(event, payload) {
    this.io.to(this.roomId).emit(event, payload);
  }

  publicParticipants() {
    return [...this.participants.values()].map((p) => p.toPublic());
  }

  findBySocketId(socketId) {
    return this.participants.get(socketId);
  }

  findByUserId(userId) {
    return [...this.participants.values()].find((p) => p.userId === userId);
  }

  /**
   * Add a new participant. The very first person to join a fresh room
   * becomes Host automatically; everyone else defaults to Participant.
   */
  addParticipant(socketId, userId, username) {
    const role = this.isEmpty ? ROLES.HOST : ROLES.PARTICIPANT;
    const participant = new Participant(socketId, userId, username, role);
    this.participants.set(socketId, participant);

    // Fire-and-forget persistence — never blocks the join flow, and every
    // call below is a safe no-op if DATABASE_URL isn't set.
    db.ensureUser(userId, username)
      .then(() => db.ensureRoom(this.roomId, role === ROLES.HOST ? userId : undefined))
      .then((dbRoomId) => {
        if (dbRoomId && !this.dbRoomId) this.dbRoomId = dbRoomId;
        return db.recordParticipantJoin(this.dbRoomId, userId, role);
      })
      .then((rowId) => {
        if (rowId) this.dbParticipantRowId.set(socketId, rowId);
      })
      .catch((err) => console.error("[Room] persistence on join failed:", err.message));

    return participant;
  }

  removeBySocketId(socketId) {
    const participant = this.participants.get(socketId);
    this.participants.delete(socketId);

    const dbRowId = this.dbParticipantRowId.get(socketId);
    this.dbParticipantRowId.delete(socketId);
    if (dbRowId) db.recordParticipantLeave(dbRowId).catch(() => {});

    // If the Host disconnected, promote the longest-tenured remaining
    // participant so the room isn't left leaderless.
    if (participant?.role === ROLES.HOST && !this.isEmpty) {
      const next = [...this.participants.values()].sort(
        (a, b) => a.joinedAt - b.joinedAt
      )[0];
      if (next) next.role = ROLES.HOST;
    }
    return participant;
  }

  /**
   * Central permission gate. Every state-changing socket handler should
   * call this before doing anything else.
   */
  isAuthorized(socketId, action) {
    const participant = this.findBySocketId(socketId);
    if (!participant) return false;
    return can(participant.role, action);
  }

  // ---- Playback state mutators (server is authoritative) ----

  setPlaying(currentTime) {
    this.state.playState = "playing";
    this.state.currentTime = currentTime ?? this.state.currentTime;
    this.state.lastUpdated = Date.now();
    this.persist();
  }

  setPaused(currentTime) {
    this.state.playState = "paused";
    this.state.currentTime = currentTime ?? this.state.currentTime;
    this.state.lastUpdated = Date.now();
    this.persist();
  }

  setSeek(time) {
    this.state.currentTime = time;
    this.state.lastUpdated = Date.now();
    this.persist();
  }

  setVideo(videoId) {
    this.state.videoId = videoId;
    this.state.currentTime = 0;
    this.state.playState = "paused";
    this.state.lastUpdated = Date.now();
    this.persist();
  }

  /** Writes current playback state to PostgreSQL (no-op if persistence is disabled). */
  persist() {
    db.saveRoomState(this.roomId, this.state).catch((err) =>
      console.error("[Room] persist failed:", err.message)
    );
  }

  /** Records a video load in the `videos` history table. Called by socketHandlers alongside setVideo. */
  recordVideo(videoId, title, addedByUserId) {
    db.saveVideo(this.dbRoomId, videoId, title, addedByUserId).catch(() => {});
  }

  /** What a client should apply verbatim to "catch up" on join. */
  snapshot() {
    return { ...this.state };
  }

  // ---- Role / moderation mutators ----

  assignRole(userId, role) {
    const participant = this.findByUserId(userId);
    if (!participant) return null;
    participant.role = role;
    return participant;
  }

  transferHost(fromSocketId, toUserId) {
    const current = this.findBySocketId(fromSocketId);
    const next = this.findByUserId(toUserId);
    if (!current || !next) return false;
    current.role = ROLES.PARTICIPANT;
    next.role = ROLES.HOST;
    return true;
  }

  // ---- Chat ----

  /**
   * Adds a chat message. Caller must already have checked isAuthorized
   * for "send_chat" — this method just stores + returns it.
   */
  addMessage(participant, text) {
    const message = {
      id: nanoid(10),
      userId: participant.userId,
      username: participant.username,
      text: text.slice(0, 500),
      timestamp: Date.now(),
    };
    this.messages.push(message);
    if (this.messages.length > MAX_CHAT_HISTORY) {
      this.messages.shift();
    }

    // Real-time delivery is Socket.IO's job (handled by the caller,
    // socketHandlers.js broadcasting this returned object) — this call is
    // just persistence, fire-and-forget, per the "Socket.IO = real-time,
    // PostgreSQL = persistence" split.
    db.saveMessage(this.dbRoomId, participant.userId, message.text).catch(() => {});

    return message;
  }
}
