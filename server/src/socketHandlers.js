import { nanoid } from "nanoid";

/**
 * Wires up all Socket.IO events for one connected socket.
 * Handlers stay thin: validate payload shape -> check permission via
 * Room.isAuthorized -> mutate Room state -> broadcast.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {import('./RoomStore').RoomStore} roomStore
 */
export function registerSocketHandlers(io, socket, roomStore) {
  // Track which room this socket is in, for cleanup on disconnect.
  let currentRoomId = null;

  function reject(reason) {
    socket.emit("error_message", { message: reason });
  }

  socket.on("join_room", ({ roomId, username }) => {
    if (typeof roomId !== "string" || typeof username !== "string" || !roomId || !username) {
      return reject("roomId and username are required");
    }

    const room = roomStore.getOrCreate(roomId, io);
    const userId = nanoid(10);
    const participant = room.addParticipant(socket.id, userId, username.slice(0, 40));

    socket.join(roomId);
    currentRoomId = roomId;
    socket.data.userId = userId;
    socket.data.roomId = roomId;

    // Tell the joiner who they are + the room's current playback state.
    socket.emit("joined", {
      you: participant.toPublic(),
      participants: room.publicParticipants(),
    });
    socket.emit("sync_state", room.snapshot());
    socket.emit("chat_history", { messages: room.messages });

    // Tell everyone else someone new arrived.
    socket.to(roomId).emit("user_joined", {
      username: participant.username,
      userId: participant.userId,
      role: participant.role,
      participants: room.publicParticipants(),
    });
  });

  socket.on("leave_room", () => {
    handleLeave();
  });

  socket.on("play", ({ currentTime } = {}) => {
    withRoom((room) => {
      if (!room.isAuthorized(socket.id, "play")) return reject("Not authorized to play");
      room.setPlaying(currentTime);
      room.broadcast("sync_state", room.snapshot());
    });
  });

  socket.on("pause", ({ currentTime } = {}) => {
    withRoom((room) => {
      if (!room.isAuthorized(socket.id, "pause")) return reject("Not authorized to pause");
      room.setPaused(currentTime);
      room.broadcast("sync_state", room.snapshot());
    });
  });

  socket.on("seek", ({ time }) => {
    withRoom((room) => {
      if (typeof time !== "number") return reject("Invalid seek time");
      if (!room.isAuthorized(socket.id, "seek")) return reject("Not authorized to seek");
      room.setSeek(time);
      room.broadcast("sync_state", room.snapshot());
    });
  });

  socket.on("change_video", ({ videoId }) => {
    withRoom((room) => {
      if (typeof videoId !== "string" || !videoId) return reject("Invalid videoId");
      if (!room.isAuthorized(socket.id, "change_video")) return reject("Not authorized to change video");
      room.setVideo(videoId);
      room.broadcast("sync_state", room.snapshot());

      // Record this video in the room's history (title is fetched
      // separately by the client via GET /api/videos/:videoId, so we don't
      // duplicate that lookup here — just log which video was played).
      const participant = room.findBySocketId(socket.id);
      room.recordVideo(videoId, null, participant?.userId);
    });
  });

  socket.on("assign_role", ({ userId, role }) => {
    withRoom((room) => {
      const validRoles = ["host", "moderator", "participant"];
      if (!validRoles.includes(role)) return reject("Invalid role");
      if (!room.isAuthorized(socket.id, "assign_role")) return reject("Not authorized to assign roles");

      const updated = room.assignRole(userId, role);
      if (!updated) return reject("User not found in room");

      room.broadcast("role_assigned", {
        userId: updated.userId,
        username: updated.username,
        role: updated.role,
        participants: room.publicParticipants(),
      });
    });
  });

  socket.on("remove_participant", ({ userId }) => {
    withRoom((room) => {
      if (!room.isAuthorized(socket.id, "remove_participant")) {
        return reject("Not authorized to remove participants");
      }
      const target = room.findByUserId(userId);
      if (!target) return reject("User not found in room");

      const targetSocket = io.sockets.sockets.get(target.socketId);
      room.removeBySocketId(target.socketId);
      targetSocket?.leave(room.roomId);
      targetSocket?.emit("removed_from_room");

      room.broadcast("participant_removed", {
        userId: target.userId,
        participants: room.publicParticipants(),
      });
    });
  });

  socket.on("transfer_host", ({ userId }) => {
    withRoom((room) => {
      if (!room.isAuthorized(socket.id, "transfer_host")) {
        return reject("Not authorized to transfer host");
      }
      const ok = room.transferHost(socket.id, userId);
      if (!ok) return reject("Could not transfer host");
      room.broadcast("role_assigned", {
        participants: room.publicParticipants(),
      });
    });
  });

  // Only Host/Moderator may post a text message. Enforced server-side —
  // the client also hides the input box for Participants, but that's UX
  // only, same pattern as every other permission check in this file.
  socket.on("chat_message", ({ text }) => {
    withRoom((room) => {
      if (typeof text !== "string" || !text.trim()) return reject("Message cannot be empty");
      if (!room.isAuthorized(socket.id, "send_chat")) {
        return reject("Only the Host or a Moderator can send chat messages");
      }
      const participant = room.findBySocketId(socket.id);
      const message = room.addMessage(participant, text.trim());
      room.broadcast("chat_message", message);
    });
  });

  socket.on("disconnect", () => {
    handleLeave();
  });

  // ---- helpers ----

  function withRoom(fn) {
    if (!currentRoomId) return reject("Not in a room");
    const room = roomStore.get(currentRoomId);
    if (!room) return reject("Room no longer exists");
    fn(room);
  }

  function handleLeave() {
    if (!currentRoomId) return;
    const room = roomStore.get(currentRoomId);
    if (room) {
      const removed = room.removeBySocketId(socket.id);
      socket.leave(currentRoomId);
      if (removed) {
        room.broadcast("user_left", {
          username: removed.username,
          userId: removed.userId,
          participants: room.publicParticipants(),
        });
      }
      roomStore.deleteIfEmpty(currentRoomId);
    }
    currentRoomId = null;
  }
}
