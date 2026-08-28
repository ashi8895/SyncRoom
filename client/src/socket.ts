import { io, Socket } from "socket.io-client";

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

// One shared socket for the whole app lifetime. Connects lazily on first use.
export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  transports: ["websocket", "polling"],
});
