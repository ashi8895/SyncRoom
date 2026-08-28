/**
 * Central RBAC table. Every socket event that mutates room/playback state
 * must be checked against this before it is processed or broadcast —
 * the server is the source of truth, never the client.
 */
export const ROLES = Object.freeze({
  HOST: "host",
  MODERATOR: "moderator",
  PARTICIPANT: "participant",
});

// Which roles may perform which action.
const PERMISSIONS = {
  play: [ROLES.HOST, ROLES.MODERATOR],
  pause: [ROLES.HOST, ROLES.MODERATOR],
  seek: [ROLES.HOST, ROLES.MODERATOR],
  change_video: [ROLES.HOST, ROLES.MODERATOR],
  assign_role: [ROLES.HOST],
  remove_participant: [ROLES.HOST],
  transfer_host: [ROLES.HOST],
  // Chat: only Host/Moderator can post text messages. Participant has no
  // chat interaction at all — pure watch-only, by design.
  send_chat: [ROLES.HOST, ROLES.MODERATOR],
};

/**
 * @param {string} role - the acting participant's role
 * @param {string} action - one of the keys in PERMISSIONS
 * @returns {boolean}
 */
export function can(role, action) {
  const allowed = PERMISSIONS[action];
  if (!allowed) return false; // unknown action -> deny by default
  return allowed.includes(role);
}
