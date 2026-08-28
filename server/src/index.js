import express from "express";
import http from "node:http";
import cors from "cors";
import { Server } from "socket.io";
import { RoomStore } from "./RoomStore.js";
import { registerSocketHandlers } from "./socketHandlers.js";
import { videosRouter } from "./routes/videos.js";
import { isPersistenceEnabled } from "./db/pool.js";

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), database: isPersistenceEnabled ? "connected" : "disabled" });
});

// Video-title lookups go through the backend (never the browser directly)
// so that if a real YOUTUBE_API_KEY is ever added, it stays server-side.
app.use(videosRouter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ["GET", "POST"] },
});

const roomStore = new RoomStore();

io.on("connection", (socket) => {
  registerSocketHandlers(io, socket, roomStore);
});

server.listen(PORT, () => {
  console.log(`SyncRoom server listening on port ${PORT}`);
  console.log(`Accepting client origin: ${CLIENT_ORIGIN}`);
  console.log(`PostgreSQL persistence: ${isPersistenceEnabled ? "enabled" : "disabled (set DATABASE_URL to enable)"}`);
});
