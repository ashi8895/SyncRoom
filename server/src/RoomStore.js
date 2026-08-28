import { Room } from "./Room.js";
import { loadRoomState } from "./db/queries.js";

/**
 * RoomStore
 * In-memory registry of active Room instances. Real-time state always
 * lives here; PostgreSQL (see db/queries.js) is asked in the background
 * to see if this room existed before a server restart, and — if so — the
 * Room's playback state is updated once that lookup resolves.
 */
export class RoomStore {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  getOrCreate(roomId, io) {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room(roomId, io);
      this.rooms.set(roomId, room);

      // Best-effort hydration: this resolves a beat after the room object
      // already exists (Postgres round-trip), so anyone who joins in that
      // first instant sees the freshly-blank state. That's an acceptable
      // trade-off for keeping room creation itself synchronous and simple.
      loadRoomState(roomId)
        .then((saved) => {
          if (!saved) return;
          room.dbRoomId = saved.dbRoomId;
          room.state = {
            videoId: saved.videoId,
            playState: saved.playState,
            currentTime: saved.currentTime,
            lastUpdated: saved.lastUpdated,
          };
          // If people are already connected and waiting, bring them up to date.
          room.broadcast("sync_state", room.snapshot());
        })
        .catch((err) => console.error("[RoomStore] hydration failed:", err.message));
    }
    return room;
  }

  get(roomId) {
    return this.rooms.get(roomId);
  }

  /** Clean up empty rooms so memory doesn't grow unbounded. */
  deleteIfEmpty(roomId) {
    const room = this.rooms.get(roomId);
    if (room?.isEmpty) {
      this.rooms.delete(roomId);
    }
  }
}
