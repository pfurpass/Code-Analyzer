import pg from "pg";
import { logger } from "../utils/logger.js";

const { Pool } = pg;

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === "production" && process.env.DATABASE_SSL === "true"
    ? { rejectUnauthorized: false }
    : false,
});

db.on("error", (err) => {
  logger.error("Unexpected database error", { error: err.message });
});

db.on("connect", () => {
  logger.debug("New database connection established");
});
