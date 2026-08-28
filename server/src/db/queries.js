import { pool, isPersistenceEnabled } from "./pool.js";

/** Records/updates a lightweight "known user" row — no auth, just identity. */
export async function ensureUser(userId, username) {
  if (!isPersistenceEnabled) return;
  try {
    await pool.query(
      `INSERT INTO users (id, username) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET username = excluded.username`,
      [userId, username]
    );
  } catch (err) {
    console.error("[db] ensureUser failed:", err.message);
  }
}

/** Creates a room row on first use (idempotent on room_code) and returns its numeric id. */
export async function ensureRoom(roomCode, createdByUserId) {
  if (!isPersistenceEnabled) return null;
  try {
    const result = await pool.query(
      `INSERT INTO rooms (room_code, created_by) VALUES ($1, $2)
       ON CONFLICT (room_code) DO UPDATE SET room_code = excluded.room_code
       RETURNING id`,
      [roomCode, createdByUserId]
    );
    return result.rows[0]?.id ?? null;
  } catch (err) {
    console.error("[db] ensureRoom failed:", err.message);
    return null;
  }
}

/** Loads a previously-saved room's playback state by room_code, if any. */
export async function loadRoomState(roomCode) {
  if (!isPersistenceEnabled) return null;
  try {
    const result = await pool.query(
      `SELECT id, video_id, play_state, current_time, last_updated_at
       FROM rooms WHERE room_code = $1`,
      [roomCode]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      dbRoomId: row.id,
      videoId: row.video_id,
      playState: row.play_state,
      currentTime: Number(row.current_time),
      lastUpdated: new Date(row.last_updated_at).getTime(),
    };
  } catch (err) {
    console.error("[db] loadRoomState failed:", err.message);
    return null;
  }
}

/** Persists a room's current playback state. Fire-and-forget from Room.js. */
export async function saveRoomState(roomCode, state) {
  if (!isPersistenceEnabled) return;
  try {
    await pool.query(
      `UPDATE rooms
       SET video_id = $2, play_state = $3, current_time = $4, last_updated_at = to_timestamp($5 / 1000.0)
       WHERE room_code = $1`,
      [roomCode, state.videoId, state.playState, state.currentTime, state.lastUpdated]
    );
  } catch (err) {
    console.error("[db] saveRoomState failed:", err.message);
  }
}

/** Records a participant joining a room (a new row per join, so history is kept). */
export async function recordParticipantJoin(dbRoomId, userId, role) {
  if (!isPersistenceEnabled || !dbRoomId) return null;
  try {
    const result = await pool.query(
      `INSERT INTO room_participants (room_id, user_id, role) VALUES ($1, $2, $3) RETURNING id`,
      [dbRoomId, userId, role]
    );
    return result.rows[0]?.id ?? null;
  } catch (err) {
    console.error("[db] recordParticipantJoin failed:", err.message);
    return null;
  }
}

/** Marks a participant row as having left. */
export async function recordParticipantLeave(participantRowId) {
  if (!isPersistenceEnabled || !participantRowId) return;
  try {
    await pool.query(`UPDATE room_participants SET left_at = now() WHERE id = $1`, [participantRowId]);
  } catch (err) {
    console.error("[db] recordParticipantLeave failed:", err.message);
  }
}

/** Saves one chat message. */
export async function saveMessage(dbRoomId, userId, message) {
  if (!isPersistenceEnabled || !dbRoomId) return;
  try {
    await pool.query(`INSERT INTO messages (room_id, user_id, message) VALUES ($1, $2, $3)`, [
      dbRoomId,
      userId,
      message,
    ]);
  } catch (err) {
    console.error("[db] saveMessage failed:", err.message);
  }
}

/** Loads the most recent messages for a room (used only as a Postgres-backed fallback — live chat is in-memory via Room.messages). */
export async function loadRecentMessages(dbRoomId, limit = 200) {
  if (!isPersistenceEnabled || !dbRoomId) return [];
  try {
    const result = await pool.query(
      `SELECT m.id, m.user_id, u.username, m.message, m.created_at
       FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.room_id = $1 ORDER BY m.created_at ASC LIMIT $2`,
      [dbRoomId, limit]
    );
    return result.rows.map((r) => ({
      id: String(r.id),
      userId: r.user_id,
      username: r.username,
      text: r.message,
      timestamp: new Date(r.created_at).getTime(),
    }));
  } catch (err) {
    console.error("[db] loadRecentMessages failed:", err.message);
    return [];
  }
}

/** Records a video that was loaded into a room (for the `videos` history table). */
export async function saveVideo(dbRoomId, youtubeVideoId, title, addedByUserId) {
  if (!isPersistenceEnabled || !dbRoomId) return;
  try {
    await pool.query(
      `INSERT INTO videos (room_id, youtube_video_id, title, added_by) VALUES ($1, $2, $3, $4)`,
      [dbRoomId, youtubeVideoId, title ?? null, addedByUserId ?? null]
    );
  } catch (err) {
    console.error("[db] saveVideo failed:", err.message);
  }
}
