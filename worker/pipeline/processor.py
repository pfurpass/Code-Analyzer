"""
Scan Processor
Orchestrates the full analysis pipeline for a single scan job.
"""
import logging
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

import git

from analyzers.eslint_analyzer import run_eslint
from analyzers.pylint_analyzer import run_pylint
from analyzers.semgrep_analyzer import run_semgrep
from analyzers.scoring import calculate_scores, calculate_stats

log = logging.getLogger(__name__)

# Files/dirs to ignore during analysis
IGNORE_PATTERNS = {
    "node_modules", ".git", ".svn", "venv", ".venv", "env",
    "__pycache__", ".pytest_cache", ".mypy_cache", "dist",
    "build", "coverage", ".nyc_output", "vendor", "third_party",
    ".tox", "eggs", ".eggs", "*.egg-info",
}

# Supported extensions
JS_TS_EXTENSIONS  = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
PYTHON_EXTENSIONS = {".py"}
ALL_EXTENSIONS    = JS_TS_EXTENSIONS | PYTHON_EXTENSIONS

MAX_FILE_SIZE_BYTES = 512 * 1024  # 512 KB per file
MAX_FILES_PER_SCAN  = 2000


class ScanProcessor:
    """Orchestrates the analysis pipeline for one scan job."""

    def __init__(self, job_data: dict[str, Any]):
        self.job_data         = job_data
        self.scan_id          = job_data["scanId"]
        self.scan_type        = job_data["type"]
        self.enable_custom    = job_data.get("enableCustomRules", True)
        self._temp_dir: str | None = None

    def run(self) -> dict[str, Any]:
        """Execute the full pipeline and return results."""
        try:
            self._temp_dir = tempfile.mkdtemp(prefix=f"ca_{self.scan_id}_")
            log.info(f"[{self.scan_id}] Working dir: {self._temp_dir}")

            # ── Step 1: Acquire source ─────────────────────────────────────
            repo_root = self._acquire_source()
            log.info(f"[{self.scan_id}] Source acquired at {repo_root}")

            # ── Step 2: Enumerate files ────────────────────────────────────
            js_files, py_files = self._enumerate_files(repo_root)
            total_files = len(js_files) + len(py_files)
            log.info(
                f"[{self.scan_id}] Found {len(js_files)} JS/TS + "
                f"{len(py_files)} Python files ({total_files} total)"
            )

            languages = []
            if js_files:
                languages.append("javascript")
            if py_files:
                languages.append("python")

            # ── Step 3: Run linters ────────────────────────────────────────
            all_issues: list[dict] = []

            if js_files:
                log.info(f"[{self.scan_id}] Running ESLint on {len(js_files)} files...")
                eslint_issues = run_eslint(js_files, repo_root)
                log.info(f"[{self.scan_id}] ESLint: {len(eslint_issues)} issues")
                all_issues.extend(eslint_issues)

            if py_files:
                log.info(f"[{self.scan_id}] Running Pylint on {len(py_files)} files...")
                pylint_issues = run_pylint(py_files, repo_root)
                log.info(f"[{self.scan_id}] Pylint: {len(pylint_issues)} issues")
                all_issues.extend(pylint_issues)

            # ── Step 4: Run Semgrep ────────────────────────────────────────
            if languages:
                log.info(f"[{self.scan_id}] Running Semgrep on {repo_root}...")
                semgrep_issues = run_semgrep(repo_root, languages, self.enable_custom)
                log.info(f"[{self.scan_id}] Semgrep: {len(semgrep_issues)} findings")
                all_issues.extend(semgrep_issues)

            # ── Step 5: Sort + deduplicate ────────────────────────────────
            all_issues = self._deduplicate(all_issues)
            all_issues.sort(key=lambda i: (
                {"high": 0, "medium": 1, "low": 2}.get(i.get("severity", "low"), 3),
                i.get("file", ""),
                i.get("line", 0),
            ))

            # ── Step 6: Calculate scores ───────────────────────────────────
            scores = calculate_scores(all_issues, total_files)
            stats  = calculate_stats(all_issues)

            language_breakdown = {
                "javascript_typescript": len(js_files),
                "python": len(py_files),
            }

            log.info(
                f"[{self.scan_id}] Pipeline complete: {len(all_issues)} issues, "
                f"scores={scores}"
            )

            return {
                "issues":             all_issues,
                "scores":             scores,
                "stats":              stats,
                "file_count":         total_files,
                "language_breakdown": language_breakdown,
            }

        finally:
            self._cleanup()

    # ── Source acquisition ─────────────────────────────────────────────────

    def _acquire_source(self) -> str:
        if self.scan_type == "git":
            return self._clone_repo()
        elif self.scan_type == "upload":
            return self._extract_zip()
        else:
            raise ValueError(f"Unknown scan type: {self.scan_type}")

    def _clone_repo(self) -> str:
        repo_url = self.job_data["repoUrl"]
        branch   = self.job_data.get("branch", "main")
        dest     = os.path.join(self._temp_dir, "repo")

        log.info(f"[{self.scan_id}] Cloning {repo_url} (branch={branch})...")
        try:
            git.Repo.clone_from(
                repo_url,
                dest,
                branch=branch,
                depth=1,                     # Shallow clone for speed
                single_branch=True,
                multi_options=["--quiet"],
            )
        except git.GitCommandError as exc:
            # Try default branch if specified branch not found
            if "not found" in str(exc).lower() or "invalid" in str(exc).lower():
                log.warning(f"Branch '{branch}' not found, trying without branch spec")
                git.Repo.clone_from(repo_url, dest, depth=1, multi_options=["--quiet"])
            else:
                raise

        return dest

    def _extract_zip(self) -> str:
        file_path = self.job_data["filePath"]
        dest      = os.path.join(self._temp_dir, "repo")
        os.makedirs(dest, exist_ok=True)

        log.info(f"[{self.scan_id}] Extracting ZIP: {file_path}")

        with zipfile.ZipFile(file_path, "r") as zf:
            # Security: filter out path traversal attempts
            safe_members = [
                m for m in zf.namelist()
                if not os.path.isabs(m) and ".." not in m
            ]
            zf.extractall(dest, members=safe_members)

        # If the zip has a single top-level dir, use it as root
        entries = list(Path(dest).iterdir())
        if len(entries) == 1 and entries[0].is_dir():
            return str(entries[0])

        return dest

    # ── File enumeration ───────────────────────────────────────────────────

    def _enumerate_files(self, root: str) -> tuple[list[str], list[str]]:
        js_files: list[str]  = []
        py_files: list[str]  = []
        total_count           = 0

        for dirpath, dirnames, filenames in os.walk(root):
            # Prune ignored directories in-place
            dirnames[:] = [
                d for d in dirnames
                if d not in IGNORE_PATTERNS and not d.startswith(".")
            ]

            for filename in filenames:
                if total_count >= MAX_FILES_PER_SCAN:
                    log.warning(
                        f"[{self.scan_id}] Hit file limit ({MAX_FILES_PER_SCAN}), "
                        "truncating file list"
                    )
                    return js_files, py_files

                ext       = Path(filename).suffix.lower()
                full_path = os.path.join(dirpath, filename)

                if ext not in ALL_EXTENSIONS:
                    continue

                # Skip large files
                try:
                    if os.path.getsize(full_path) > MAX_FILE_SIZE_BYTES:
                        log.debug(f"Skipping large file: {full_path}")
                        continue
                except OSError:
                    continue

                if ext in JS_TS_EXTENSIONS:
                    js_files.append(full_path)
                elif ext in PYTHON_EXTENSIONS:
                    py_files.append(full_path)

                total_count += 1

        return js_files, py_files

    # ── Helpers ────────────────────────────────────────────────────────────

    def _deduplicate(self, issues: list[dict]) -> list[dict]:
        """Remove duplicate findings (same file + line + rule)."""
        seen   = set()
        unique = []
        for issue in issues:
            key = (
                issue.get("file", ""),
                issue.get("line", 0),
                issue.get("rule", ""),
                issue.get("message", ""),
            )
            if key not in seen:
                seen.add(key)
                unique.append(issue)
        return unique

    def _cleanup(self):
        """Remove temp working directory."""
        if self._temp_dir and os.path.exists(self._temp_dir):
            try:
                shutil.rmtree(self._temp_dir, ignore_errors=True)
                log.debug(f"[{self.scan_id}] Cleaned up {self._temp_dir}")
            except Exception as exc:
                log.warning(f"[{self.scan_id}] Cleanup failed: {exc}")
