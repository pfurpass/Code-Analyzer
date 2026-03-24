import { Router } from "express";
import { db } from "../db/index.js";

export const resultsRouter = Router();

// ── GET /results/:id ───────────────────────────────────────────────────────
resultsRouter.get("/:id", async (req, res) => {
  const { id } = req.params;

  const scanResult = await db.query(
    `SELECT s.id, s.status, s.source_type, s.source_url, s.branch,
            s.created_at, s.started_at, s.completed_at, s.error_message,
            sr.issues, sr.scores, sr.stats, sr.file_count, sr.language_breakdown
     FROM scans s
     LEFT JOIN scan_results sr ON sr.scan_id = s.id
     WHERE s.id = $1`,
    [id]
  );

  if (scanResult.rows.length === 0) {
    return res.status(404).json({ error: "Scan not found" });
  }

  const scan = scanResult.rows[0];

  const response = {
    scanId: scan.id,
    status: scan.status,
    sourceType: scan.source_type,
    sourceUrl: scan.source_url || null,
    branch: scan.branch || null,
    timestamps: {
      created: scan.created_at,
      started: scan.started_at || null,
      completed: scan.completed_at || null,
    },
  };

  if (scan.status === "failed") {
    response.error = scan.error_message;
  }

  if (scan.status === "done" && scan.issues !== null) {
    const issues = scan.issues || [];

    // Apply filters from query params
    const { severity, type, file, page = 1, limit = 50 } = req.query;

    let filtered = issues;
    if (severity) filtered = filtered.filter(i => i.severity === severity);
    if (type) filtered = filtered.filter(i => i.type === type);
    if (file) filtered = filtered.filter(i => i.file.includes(file));

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const start = (pageNum - 1) * limitNum;

    response.results = {
      issues: filtered.slice(start, start + limitNum),
      scores: scan.scores,
      stats: scan.stats,
      fileCount: scan.file_count,
      languageBreakdown: scan.language_breakdown,
      pagination: {
        total: filtered.length,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(filtered.length / limitNum),
      },
    };
  }

  res.json(response);
});

// ── GET /results/:id/summary ───────────────────────────────────────────────
resultsRouter.get("/:id/summary", async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    `SELECT s.id, s.status, sr.scores, sr.stats, sr.file_count, sr.language_breakdown,
            s.created_at, s.completed_at
     FROM scans s
     LEFT JOIN scan_results sr ON sr.scan_id = s.id
     WHERE s.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Scan not found" });
  }

  const scan = result.rows[0];

  res.json({
    scanId: scan.id,
    status: scan.status,
    scores: scan.scores,
    stats: scan.stats,
    fileCount: scan.file_count,
    languageBreakdown: scan.language_breakdown,
    timestamps: { created: scan.created_at, completed: scan.completed_at },
  });
});

// ── GET /results (list recent scans) ──────────────────────────────────────
resultsRouter.get("/", async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * limitNum;

  const [scans, countResult] = await Promise.all([
    db.query(
      `SELECT s.id, s.status, s.source_type, s.source_url, s.created_at, s.completed_at,
              sr.scores, sr.file_count, sr.stats
       FROM scans s
       LEFT JOIN scan_results sr ON sr.scan_id = s.id
       ORDER BY s.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limitNum, offset]
    ),
    db.query("SELECT COUNT(*) FROM scans"),
  ]);

  res.json({
    scans: scans.rows.map(s => ({
      scanId: s.id,
      status: s.status,
      sourceType: s.source_type,
      sourceUrl: s.source_url,
      scores: s.scores,
      fileCount: s.file_count,
      issueCount: s.stats?.total ?? null,
      createdAt: s.created_at,
      completedAt: s.completed_at,
    })),
    pagination: {
      total: parseInt(countResult.rows[0].count),
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(parseInt(countResult.rows[0].count) / limitNum),
    },
  });
});
