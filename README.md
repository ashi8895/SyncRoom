# SyncRoom

Watch YouTube videos together in sync, with a Host who controls playback and can grant Moderator access to others.

**Live URL:** _add after deploying — e.g. `https://syncroom-client.onrender.com`_

## Stack

- **Client:** React + TypeScript + Vite
- **Server:** Node.js + Express + Socket.IO
- **Video:** YouTube IFrame Player API, with video titles resolved server-side (`GET /api/videos/:id`)
- **Persistence:** PostgreSQL — optional; the app runs fully in real time without it, see "Database" below
- **Theme:** Deep Navy + Warm Amber, "Space Grotesk" display font (all colors live in `client/src/index.css`)

## App flow

```
Home  →  Create Room  →  RoomJoin (name only)      →  Room
Home  →  Join Room    →  RoomJoin (name + code)     →  Room
/?room=CODE            →  RoomJoin (pre-filled code) →  Room     (skips Home entirely)
Room  →  Leave Room (confirm)  →  Home
```

- **Home** (`client/src/components/Home.tsx`) — nav bar (Home / How it works / GitHub), hero section, and a "How it works" walkthrough with four steps plus a Host & Moderator callout.
- **RoomJoin** (`client/src/components/RoomJoin.tsx`) — one shared form component; `mode="create"` only asks for a name and generates a room code, `mode="join"` also asks for the code. A shared invite link (`?room=CODE`) skips Home and opens this directly, pre-filled, per the required URL behavior.
- **Room** — the existing dashboard: header (room code, connection status, Copy room code, Share room, Leave room), video player + seek bar, participants sidebar, chat.

## Features

- **Create/Join separated** as two explicit flows from the Home page, both reusing the same `RoomJoin` component and the same `join_room` Socket.IO event underneath — no duplicate logic.
- **Copy Room Code** and **Share Room** — Share uses the Web Share API where available (mobile), and falls back to copying the invite link with a toast otherwise.
- **Leave Room confirmation** — a modal ("Leave this room? / Cancel / Leave Room") gates the actual `leave_room` emit, so it can't happen from one accidental click.
- **Real video titles via the backend** — the client calls `GET /api/videos/:videoId` on our own server, which resolves the title (via YouTube's oEmbed endpoint, or the official Data API if `YOUTUBE_API_KEY` is set) and returns just `{ videoId, title }`. The frontend never talks to YouTube's Data API directly, so no key is ever exposed to the browser. Shows a loading state while fetching and falls back to the raw video id if the lookup fails.
- **Three-state connection indicator** — Connected (green) / Reconnecting… (amber, pulsing) / Disconnected (red), driven off Socket.IO's own `connect`, `disconnect`, and the underlying manager's `reconnect_attempt` events — no second socket connection created.
- **Participant count** — "N participants" in the sidebar, updates immediately on join/leave.
- **YouTube's native controls are fully hidden** (`controls: 0`) — every client drives playback only through this app's own buttons and seek bar, so nobody can desync the room by clicking YouTube's own progress bar. A transparent overlay also blocks Participants from clicking the video itself.
- **Draggable seek bar** — everyone sees live progress; only Host/Moderator can drag it. Dragging only commits (seeks + broadcasts) on release, not on every pixel of movement.
- **Drift correction** — every 5 seconds, a playing client compares its actual position to where the server says it should be and re-syncs if it's drifted more than 1.5s.
- **Late-joiner catch-up accounts for elapsed time** — joining mid-video lands you at the actual current position, not wherever it was when the last event fired.
- **Toast notifications** — join/leave, role changes, removal, and "Room code copied" all surface as small auto-dismissing popups.
- **Role-change highlight** — a participant's row briefly glows when their role changes.
- **Chat** — visible to everyone; only Host/Moderator can post (`send_chat` permission, enforced server-side). Participants are read-only — no typing, no reactions.
- **Responsive** — the room layout stacks to a single column under 860px, and the header wraps on small screens.

## Project layout

```
watch-party/
  server/
    src/
      index.js            entrypoint — Express app, Socket.IO server, mounts /api/videos
      routes/
        videos.js          GET /api/videos/:videoId — resolves title server-side (never exposes any key to the client)
      db/
        pool.js             PostgreSQL connection pool (safely disabled if DATABASE_URL is unset)
        queries.js           all persistence functions — every one no-ops if persistence is disabled
        schema.sql            users / rooms / room_participants / messages / videos
        migrate.js            npm run migrate — applies schema.sql to DATABASE_URL
      Room.js              per-room state, broadcast + permission logic, chat storage, calls into db/queries.js
      Participant.js       one connected user
      permissions.js       role -> allowed-actions table
      RoomStore.js          in-memory registry of active Room instances, hydrates from Postgres in the background
      socketHandlers.js     thin Socket.IO event handlers
  client/
    src/
      App.tsx              screen state (home/join/room), socket wiring, toasts, connection status, leave confirmation
      socket.ts             shared Socket.IO client + SERVER_URL export (used by useVideoTitle too)
      room.css              all styling — nav, hero, how-it-works, room screen, modal
      index.css              color + font variables (the whole theme lives here)
      components/
        Home.tsx             landing page: nav, hero, Create/Join buttons, How It Works
        RoomJoin.tsx          shared create/join form, mode-driven
        VideoPlayer.tsx       YouTube player, controls, seek bar, native-UI hiding, click guard
        ParticipantList.tsx   roster + host moderation controls + role-change highlight + live count
        ChatPanel.tsx         read-only chat with Host/Moderator-only posting
        ToastStack.tsx        auto-dismissing event notifications
      hooks/
        useYouTubePlayer.ts   wraps the YouTube IFrame API, guards feedback loops
        useVideoTitle.ts      calls the backend's /api/videos/:id endpoint, with a loading state
```

## Running locally

Requires Node.js 18+.

```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
npm run dev            # runs server (port 4000) and client (port 5173) together
```

Then open `http://localhost:5173`. PostgreSQL is entirely optional locally — without `DATABASE_URL` set, everything works in real time, it just won't survive a server restart (see "Database" below).

Copy `.env.example` to `.env` in both `server/` and `client/` if you need non-default ports/origins.

## Database

PostgreSQL is used for persistence; Socket.IO remains responsible for all real-time delivery — chat messages, for instance, are broadcast instantly over the socket regardless of whether Postgres is configured, and are *additionally* saved to Postgres in the background if it is.

**To enable it:**

1. Get a Postgres connection string — Render offers a free instance, or run one locally / via Docker.
2. Set `DATABASE_URL` in `server/.env`.
3. Run the migration once:
   ```bash
   cd server
   npm run migrate
   ```
   This applies `server/src/db/schema.sql` (creates `users`, `rooms`, `room_participants`, `messages`, `videos` if they don't already exist — safe to re-run).
4. Start the server as normal. You'll see `PostgreSQL persistence: enabled` in the startup log.

**What gets persisted:** a room's playback state (video, position, play/pause) so it resumes after a restart; a lightweight `users` row per participant (no auth — just an identity for foreign keys); a join/leave record per participant per room; every chat message; and a row in `videos` each time the video changes. Every query in `server/src/db/queries.js` is written to fail silently (logged, not thrown) so a Postgres hiccup never takes down a live room.

## Architecture overview

**Flow:** `join → sync → action → broadcast`

1. A client connects and emits `join_room` with a room code and username.
2. The server's `RoomStore` finds or creates a `Room` for that code, and kicks off a background Postgres lookup to hydrate its last saved playback state if one exists. The first person in becomes **Host**; everyone else defaults to **Participant**.
3. The server immediately sends the new client `sync_state` (current `videoId`, `playState`, `currentTime`) and `chat_history` — this is how a late joiner catches up mid-video and mid-conversation.
4. When the Host/Moderator plays, pauses, seeks, or loads a new video, the client emits the corresponding event (`play`, `pause`, `seek`, `change_video`).
5. The server's socket handler checks the sender's role against `permissions.js` **before** doing anything. Unauthorized attempts are rejected with an `error_message` and never reach other clients.
6. If authorized, the `Room` instance updates its own state (the single source of truth), fires off a background save to Postgres, and broadcasts `sync_state` to everyone in the room, including the sender.
7. Every client applies the incoming `sync_state` to its own YouTube player instance, correcting for elapsed time if playing. To avoid an infinite loop (player state change → emit event → broadcast → apply to player → player state change → ...), the client calls `suppressNextEvent()` immediately before it programmatically drives the player.
8. While playing, each client also runs a periodic drift check (every 5s) and nudges itself back in sync if it's drifted more than 1.5s from the server-timed position.

**Roles (`server/src/permissions.js`):**

| Role | Can |
|---|---|
| Host | play/pause/seek/change video, assign roles, remove participants, transfer host |
| Moderator | play/pause/seek/change video |
| Participant | watch only (read chat, no posting, no reactions, no playback control) |

Role checks live in one place (`permissions.js`) and are enforced inside `Room.isAuthorized()`, which every mutating Socket.IO handler calls first. The client also hides/disables controls for Participants (including hiding YouTube's own native player UI entirely), but that's a UX nicety, not the security boundary — the server never trusts it.

**Reconnect/host-loss handling:** if the Host disconnects or explicitly leaves, `Room.removeBySocketId` promotes the longest-tenured remaining participant to Host so the room isn't left without one.

## Socket.IO events

| Event | Direction | Payload |
|---|---|---|
| `join_room` | C→S | `{ roomId, username }` |
| `leave_room` | C→S | `{}` |
| `joined` | S→C | `{ you, participants }` (sent only to the joiner) |
| `sync_state` | S→C | `{ videoId, playState, currentTime, lastUpdated }` |
| `play` / `pause` | C→S | `{ currentTime }` |
| `seek` | C→S | `{ time }` |
| `change_video` | C→S | `{ videoId }` |
| `assign_role` | C→S | `{ userId, role }` |
| `remove_participant` | C→S | `{ userId }` |
| `transfer_host` | C→S | `{ userId }` |
| `user_joined` / `user_left` | S→C | `{ username, userId, participants }` |
| `role_assigned` / `participant_removed` | S→C | `{ ..., participants }` |
| `chat_message` | C→S | `{ text }` (Host/Moderator only) |
| `chat_message` | S→C | `{ id, userId, username, text, timestamp }` (broadcast to everyone) |
| `chat_history` | S→C | `{ messages }` (sent once, on join) |
| `removed_from_room` | S→C | `{}` |
| `error_message` | S→C | `{ message }` |

## REST endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{ status, uptime, database }` — `database` reports `"connected"` or `"disabled"` |
| `GET /api/videos/:videoId` | `{ videoId, title }` — resolves a YouTube video's title server-side |

## Environment variables

**Server (`server/.env`):**
```
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://user:password@host:5432/dbname   # optional
YOUTUBE_API_KEY=your-youtube-data-api-key                    # optional
```

**Client (`client/.env`):**
```
VITE_SERVER_URL=http://localhost:4000
```

Neither `DATABASE_URL` nor `YOUTUBE_API_KEY` is ever referenced from client code or a `VITE_` variable — both stay server-side only, per the security requirement.

## Deploying (Render)

1. Push this repo to GitHub.
2. **(Optional, for persistence)** Create a Render **PostgreSQL** instance, copy its connection string.
3. Create a **Web Service** for `server/`:
   - Build command: `npm install`
   - Start command: `npm start`
   - Env vars: `CLIENT_ORIGIN` (set after step 4), `DATABASE_URL` (from step 2, if using it), `YOUTUBE_API_KEY` (optional)
4. Create a **Static Site** for `client/`:
   - Build command: `npm install && npm run build`
   - Publish directory: `dist`
   - Env var: `VITE_SERVER_URL` = the server URL from step 3
5. Go back to the server service, set `CLIENT_ORIGIN` to the actual client URL from step 4 (needed to avoid CORS errors), and let it redeploy.
6. If using Postgres, run the migration once against the production database: locally, `DATABASE_URL=<production-url> npm run migrate` from `server/`, or add it as a one-off Render job.
7. Update this README's "Live URL" line.

Render's free tier sleeps a service after 15 minutes of inactivity — the first request after that can take 30-50 seconds to wake it back up.

## Known simplifications (MVP scope)

- No authentication — usernames are self-reported per session; the `users` table exists to give chat/participant records something to reference, not as an account system.
- Postgres persistence is best-effort and asynchronous — a room created and immediately destroyed within a few hundred milliseconds could theoretically miss being saved. Fine for a watch party; would need a synchronous write path for anything stricter.
- Seeking uses a custom seek bar + ±10s buttons rather than YouTube's native scrub bar, which is intentionally hidden from all users (see "Features" above).
