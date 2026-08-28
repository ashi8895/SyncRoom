import pg from "pg";

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

/**
 * pool is null when DATABASE_URL isn't configured. Every function in
 * queries.js checks this and no-ops (or returns empty/null) instead of
 * throwing, so the app runs perfectly well locally without Postgres
 * installed — persistence just silently isn't active until you set
 * DATABASE_URL (see server/.env.example).
 */
export const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      // Render's managed Postgres requires SSL but uses a self-signed cert
      // chain that Node won't validate by default — this is the standard
      // way to allow that without disabling SSL entirely.
      ssl: DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : undefined,
    })
  : null;

export const isPersistenceEnabled = Boolean(pool);

if (!isPersistenceEnabled) {
  console.warn(
    "[db] DATABASE_URL not set — running without PostgreSQL persistence. " +
      "Rooms/chat/participants still work in real time via Socket.IO, they just won't survive a server restart."
  );
}

if (pool) {
  pool.on("error", (err) => {
    // A background connection error (e.g. Postgres briefly restarting)
    // should never crash the whole Node process.
    console.error("[db] Unexpected PostgreSQL client error:", err.message);
  });
}
