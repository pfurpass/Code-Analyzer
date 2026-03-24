"""
Pylint Analyzer
Runs Pylint on Python files and normalizes output to the common format.
"""
import json
import logging
import subprocess
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# Pylint message category → severity mapping
CATEGORY_SEVERITY = {
    "E": "high",      # Error
    "F": "high",      # Fatal
    "W": "medium",    # Warning
    "C": "low",       # Convention
    "R": "low",       # Refactor
}

# Pylint message category → type mapping
CATEGORY_TYPE = {
    "E": "quality",
    "F": "quality",
    "W": "quality",
    "C": "maintainability",
    "R": "maintainability",
}

# Security-related Pylint messages
SECURITY_RULES = {
    "W0611",  # unused-import (can be a security smell)
    "W0703",  # broad-except
    "W1510",  # subprocess-run-check
    "W0105",  # pointless-string-statement (code injection risk)
    "E1120",  # no-value-for-argument
    "W0141",  # deprecated built-in (exec, eval)
    "W0122",  # exec-used
    "W0123",  # eval-used
}


def run_pylint(file_paths: list[str], repo_root: str) -> list[dict[str, Any]]:
    """
    Run Pylint on Python files and return normalized issues.
    """
    if not file_paths:
        return []

    issues = []
    chunk_size = 40

    for i in range(0, len(file_paths), chunk_size):
        chunk = file_paths[i : i + chunk_size]
        issues.extend(_run_pylint_chunk(chunk, repo_root))

    return issues


def _run_pylint_chunk(file_paths: list[str], repo_root: str) -> list[dict]:
    """Run Pylint on a chunk of files."""
    cmd = [
        "pylint",
        "--output-format=json",
        "--disable=all",
        "--enable=E,W,C,R",        # Enable all categories
        "--max-line-length=120",
        "--score=no",
        "--from-stdin=no",
        *file_paths,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180,
            cwd=repo_root,
        )
    except subprocess.TimeoutExpired:
        log.warning("Pylint timed out")
        return []
    except FileNotFoundError:
        log.error("Pylint not found. Install with: pip install pylint")
        return []

    # Pylint exit codes: 0=ok, 1=fatal, 2=error, 4=warning, 8=refactor, 16=convention
    # Non-zero doesn't necessarily mean crash
    if result.returncode not in (0, 2, 4, 8, 16, 28, 30, 32):
        log.warning(f"Pylint unexpected exit code {result.returncode}: {result.stderr[:300]}")

    if not result.stdout.strip():
        return []

    try:
        raw = json.loads(result.stdout)
    except json.JSONDecodeError:
        log.error(f"Pylint output not JSON: {result.stdout[:200]}")
        return []

    issues = []
    for msg in raw:
        category = msg.get("type", "W")[0].upper()
        msg_id = msg.get("message-id", "")

        severity = CATEGORY_SEVERITY.get(category, "low")
        issue_type = (
            "security"
            if msg_id in SECURITY_RULES
            else CATEGORY_TYPE.get(category, "quality")
        )

        file_path = msg.get("path", msg.get("module", ""))
        rel_path = _relativize(file_path, repo_root)

        issues.append({
            "file": rel_path,
            "line": msg.get("line", 0),
            "column": msg.get("column", 0),
            "severity": severity,
            "type": issue_type,
            "message": f"[{msg_id}] {msg.get('message', '')}",
            "rule": msg_id,
            "source": "pylint",
        })

    return issues


def _relativize(path_str: str, root: str) -> str:
    """Convert absolute path to relative."""
    try:
        return str(Path(path_str).relative_to(root))
    except ValueError:
        return path_str
