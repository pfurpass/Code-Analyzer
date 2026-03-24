import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { db } from "../db/index.js";
import { scanQueue } from "../queue/scanQueue.js";
import { logger } from "../utils/logger.js";

export const scanRouter = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/tmp/ca_uploads";

// Ensure upload dir exists
await fs.mkdir(UPLOAD_DIR, { recursive: true });

// ── Multer config ──────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const safeFilename = `${uuidv4()}-${path.basename(file.originalname)}`;
    cb(null, safeFilename);
  },
});

const fileFilter = (_req, file, cb) => {
  if (file.mimetype === "application/zip" ||
      file.mimetype === "application/x-zip-compressed" ||
      file.originalname.endsWith(".zip")) {
    cb(null, true);
  } else {
    cb(new Error("Only ZIP files are accepted"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_UPLOAD_SIZE_MB || "200") * 1024 * 1024,
  },
});

// ── Validation schemas ─────────────────────────────────────────────────────
const gitScanSchema = z.object({
  repoUrl: z.string().url().refine(
    (url) => url.includes("github.com") || url.includes("gitlab.com") ||
              url.includes("bitbucket.org") || url.endsWith(".git"),
    { message: "Must be a valid Git repository URL" }
  ),
  branch: z.string().optional().default("main"),
  enableCustomRules: z.boolean().optional().default(true),
});

// ── POST /scan/git ─────────────────────────────────────────────────────────
scanRouter.post("/git", async (req, res) => {
  const body = gitScanSchema.parse(req.body);

  const scanId = uuidv4();

  await db.query(
    `INSERT INTO scans (id, status, source_type, source_url, branch, created_at)
     VALUES ($1, 'pending', 'git', $2, $3, NOW())`,
    [scanId, body.repoUrl, body.branch]
  );

  await scanQueue.add("scan", {
    scanId,
    type: "git",
    repoUrl: body.repoUrl,
    branch: body.branch,
    enableCustomRules: body.enableCustomRules,
  }, {
    jobId: scanId,
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400 },
  });

  logger.info("Scan queued", { scanId, type: "git", repoUrl: body.repoUrl });

  res.status(202).json({
    scanId,
    status: "pending",
    message: "Scan queued successfully",
    links: { results: `/results/${scanId}` },
  });
});

// ── POST /scan/upload ──────────────────────────────────────────────────────
scanRouter.post("/upload", upload.single("repository"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No ZIP file provided" });
  }

  const scanId = uuidv4();
  const enableCustomRules = req.body.enableCustomRules !== "false";

  await db.query(
    `INSERT INTO scans (id, status, source_type, source_file, created_at)
     VALUES ($1, 'pending', 'upload', $2, NOW())`,
    [scanId, req.file.filename]
  );

  await scanQueue.add("scan", {
    scanId,
    type: "upload",
    filePath: req.file.path,
    originalName: req.file.originalname,
    enableCustomRules,
  }, {
    jobId: scanId,
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 100 },
    removeOnFail: { age: 86400 },
  });

  logger.info("Scan queued", { scanId, type: "upload", file: req.file.originalname });

  res.status(202).json({
    scanId,
    status: "pending",
    message: "File uploaded and scan queued",
    links: { results: `/results/${scanId}` },
  });
});

// ── DELETE /scan/:id ──────────────────────────────────────────────────────
scanRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    "SELECT id, status FROM scans WHERE id = $1",
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Scan not found" });
  }

  const scan = result.rows[0];

  if (scan.status === "running") {
    return res.status(409).json({ error: "Cannot delete a running scan" });
  }

  await db.query("DELETE FROM scans WHERE id = $1", [id]);

  res.json({ message: "Scan deleted successfully" });
});
