import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { scanRouter } from "./routes/scan.js";
import { resultsRouter } from "./routes/results.js";
import { db } from "./db/index.js";
import { initQueue } from "./queue/scanQueue.js";
import { logger } from "./utils/logger.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "DELETE"],
}));

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use("/scan", rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  message: { error: "Too many scan requests, please try again later." },
}));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ── Request logging ────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/scan", scanRouter);
app.use("/results", resultsRouter);

app.get("/health", async (_req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "degraded", error: "Database unavailable" });
  }
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });

  if (err.name === "ZodError") {
    return res.status(400).json({
      error: "Validation failed",
      details: err.errors,
    });
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal server error" : err.message,
  });
});

// ── Startup ────────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await db.query("SELECT 1");
    logger.info("✅ Database connected");

    await initQueue();
    logger.info("✅ Queue initialized");

    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`🚀 Code Analyzer API running on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start server", { error: err.message });
    process.exit(1);
  }
}

bootstrap();

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down...");
  await db.end();
  process.exit(0);
});
