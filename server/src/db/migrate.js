import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, isPersistenceEnabled } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  if (!isPersistenceEnabled) {
    console.error("DATABASE_URL is not set — nothing to migrate. Set it in server/.env and try again.");
    process.exit(1);
  }

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  console.log("Applying schema.sql to the database...");
  await pool.query(schema);
  console.log("Done — users, rooms, room_participants, messages, videos tables are ready.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
