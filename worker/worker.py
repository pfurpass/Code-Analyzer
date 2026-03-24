"""
Code Analyzer Worker
Polls BullMQ (Redis) for scan jobs and processes them through the analysis pipeline.
"""
import json
import logging
import os
import signal
import sys
import time
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
import redis

from pipeline.processor import ScanProcessor

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("worker")

# ── Configuration ──────────────────────────────────────────────────────────
REDIS_URL     = os.getenv("REDIS_URL", "redis://localhost:6379")
DATABASE_URL  = os.getenv("DATABASE_URL", "postgresql://ca_user:ca_secret@localhost:5432/code_analyzer")
CONCURRENCY   = int(os.getenv("WORKER_CONCURRENCY", "3"))
QUEUE_NAME    = "bull:scan-jobs"
QUEUE_WAIT    = f"{QUEUE_NAME}:wait"
QUEUE_ACTIVE  = f"{QUEUE_NAME}:active"

# ── Graceful shutdown ──────────────────────────────────────────────────────
_running = True

def handle_signal(signum, frame):
    global _running
    log.info(f"Signal {signum} received, shutting down gracefully...")
    _running = False

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)


def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def update_scan_status(db_conn, scan_id: str, status: str, error: str = None):
    """Update scan status in PostgreSQL."""
    with db_conn.cursor() as cur:
        if status == "running":
            cur.execute(
                "UPDATE scans SET status=%s, started_at=%s WHERE id=%s",
                (status, datetime.now(timezone.utc), scan_id)
            )
        elif status in ("done", "failed"):
            cur.execute(
                "UPDATE scans SET status=%s, completed_at=%s, error_message=%s WHERE id=%s",
                (status, datetime.now(timezone.utc), error, scan_id)
            )
        db_conn.commit()


def save_results(db_conn, scan_id: str, results: dict):
    """Persist analysis results to PostgreSQL."""
    with db_conn.cursor() as cur:
        cur.execute(
            """INSERT INTO scan_results
               (scan_id, issues, scores, stats, file_count, language_breakdown)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (scan_id) DO UPDATE SET
               issues=EXCLUDED.issues, scores=EXCLUDED.scores,
               stats=EXCLUDED.stats, file_count=EXCLUDED.file_count,
               language_breakdown=EXCLUDED.language_breakdown""",
            (
                scan_id,
                json.dumps(results["issues"]),
                json.dumps(results["scores"]),
                json.dumps(results["stats"]),
                results["file_count"],
                json.dumps(results["language_breakdown"]),
            )
        )
        db_conn.commit()


def process_job(job_data: dict, r: redis.Redis, db_conn):
    """Process a single scan job."""
    scan_id = job_data.get("scanId")
    if not scan_id:
        log.error("Job missing scanId, skipping")
        return

    log.info(f"[{scan_id}] Starting scan (type={job_data.get('type')})")
    update_scan_status(db_conn, scan_id, "running")

    try:
        processor = ScanProcessor(job_data)
        results = processor.run()

        save_results(db_conn, scan_id, results)
        update_scan_status(db_conn, scan_id, "done")

        log.info(
            f"[{scan_id}] Scan completed: {len(results['issues'])} issues found, "
            f"scores: quality={results['scores']['quality']}, "
            f"security={results['scores']['security']}, "
            f"maintainability={results['scores']['maintainability']}"
        )

    except Exception as exc:
        log.exception(f"[{scan_id}] Scan failed: {exc}")
        update_scan_status(db_conn, scan_id, "failed", str(exc))
        raise


def fetch_next_job(r: redis.Redis):
    """
    Pop a job from BullMQ wait list.
    BullMQ stores jobs as JSON strings keyed as bull:<queue>:<jobId>
    """
    result = r.brpoplpush(QUEUE_WAIT, QUEUE_ACTIVE, timeout=2)
    if not result:
        return None, None

    job_id = result.decode() if isinstance(result, bytes) else result
    job_key = f"{QUEUE_NAME}:{job_id}"
    raw = r.hgetall(job_key)

    if not raw:
        # Remove from active, job data missing
        r.lrem(QUEUE_ACTIVE, 1, result)
        return None, None

    data_raw = raw.get(b"data") or raw.get("data", b"{}")
    if isinstance(data_raw, bytes):
        data_raw = data_raw.decode()

    return job_id, json.loads(data_raw)


def ack_job(r: redis.Redis, job_id: str):
    """Mark job as completed in BullMQ."""
    r.lrem(QUEUE_ACTIVE, 1, job_id)
    # Move to completed set
    r.zadd(f"{QUEUE_NAME}:completed", {job_id: time.time()})


def fail_job(r: redis.Redis, job_id: str, reason: str):
    """Mark job as failed in BullMQ."""
    r.lrem(QUEUE_ACTIVE, 1, job_id)
    r.zadd(f"{QUEUE_NAME}:failed", {job_id: time.time()})
    job_key = f"{QUEUE_NAME}:{job_id}"
    r.hset(job_key, "failedReason", reason)


def main():
    log.info("🚀 Code Analyzer Worker starting...")

    # Connect with retries
    r = None
    db_conn = None

    for attempt in range(1, 11):
        try:
            r = redis.from_url(REDIS_URL, decode_responses=False)
            r.ping()
            log.info("✅ Redis connected")
            break
        except Exception as e:
            log.warning(f"Redis connection attempt {attempt}/10 failed: {e}")
            time.sleep(3)

    for attempt in range(1, 11):
        try:
            db_conn = get_db()
            log.info("✅ PostgreSQL connected")
            break
        except Exception as e:
            log.warning(f"DB connection attempt {attempt}/10 failed: {e}")
            time.sleep(3)

    if not r or not db_conn:
        log.error("Could not connect to required services. Exiting.")
        sys.exit(1)

    log.info(f"👷 Worker polling queue '{QUEUE_WAIT}' (concurrency={CONCURRENCY})")

    while _running:
        try:
            # Check/renew DB connection
            if db_conn.closed:
                db_conn = get_db()

            job_id, job_data = fetch_next_job(r)

            if not job_id:
                continue

            log.info(f"Dequeued job: {job_id}")

            try:
                process_job(job_data, r, db_conn)
                ack_job(r, job_id)
            except Exception as exc:
                fail_job(r, job_id, str(exc))

        except redis.exceptions.ConnectionError as e:
            log.error(f"Redis connection lost: {e}. Reconnecting...")
            time.sleep(5)
            r = redis.from_url(REDIS_URL, decode_responses=False)

        except psycopg2.OperationalError as e:
            log.error(f"DB connection lost: {e}. Reconnecting...")
            time.sleep(5)
            try:
                db_conn = get_db()
            except Exception:
                pass

        except Exception as e:
            log.exception(f"Unexpected worker error: {e}")
            time.sleep(2)

    log.info("Worker stopped gracefully.")
    if db_conn and not db_conn.closed:
        db_conn.close()


if __name__ == "__main__":
    main()
