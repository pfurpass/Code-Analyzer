-- Code Analyzer Database Schema
-- Migration 001: Initial schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Scans table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'done', 'failed')),
    source_type     VARCHAR(20) NOT NULL CHECK (source_type IN ('git', 'upload')),
    source_url      TEXT,
    source_file     TEXT,
    branch          VARCHAR(255) DEFAULT 'main',
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scans_status     ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);

-- ── Scan results table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_results (
    id                   SERIAL PRIMARY KEY,
    scan_id              UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    issues               JSONB NOT NULL DEFAULT '[]',
    scores               JSONB NOT NULL DEFAULT '{}',
    stats                JSONB NOT NULL DEFAULT '{}',
    file_count           INTEGER DEFAULT 0,
    language_breakdown   JSONB NOT NULL DEFAULT '{}',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scan_results_scan_id ON scan_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_scores ON scan_results USING gin(scores);
CREATE INDEX IF NOT EXISTS idx_scan_results_issues ON scan_results USING gin(issues);
