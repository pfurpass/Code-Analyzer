"""
ESLint Analyzer
Runs ESLint on JavaScript/TypeScript files and normalizes output.
"""
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# ESLint config for JS/TS analysis
ESLINT_CONFIG = {
    "env": {"browser": True, "node": True, "es2022": True},
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaVersion": 2022,
        "sourceType": "module",
        "ecmaFeatures": {"jsx": True},
    },
    "plugins": ["@typescript-eslint", "security"],
    "rules": {
        # Code quality
        "no-unused-vars": "warn",
        "no-undef": "warn",
        "no-console": "warn",
        "eqeqeq": ["warn", "always"],
        "no-eval": "error",
        "no-implied-eval": "error",
        "no-new-func": "error",
        "no-param-reassign": "warn",
        "prefer-const": "warn",
        "no-var": "warn",
        "no-duplicate-imports": "error",
        "no-shadow": "warn",
        "consistent-return": "warn",

        # Security
        "security/detect-eval-with-expression": "error",
        "security/detect-non-literal-regexp": "warn",
        "security/detect-non-literal-require": "warn",
        "security/detect-object-injection": "warn",
        "security/detect-possible-timing-attacks": "warn",
        "security/detect-pseudoRandomBytes": "error",
        "security/detect-unsafe-regex": "warn",
        "security/detect-buffer-noassert": "error",
        "security/detect-child-process": "warn",
        "security/detect-disable-mustache-escape": "error",
        "security/detect-new-buffer": "warn",
        "security/detect-no-csrf-before-method-override": "error",
        "security/detect-non-literal-fs-filename": "warn",

        # TypeScript (won't error on JS files)
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unused-vars": "warn",
    },
}

SEVERITY_MAP = {1: "low", 2: "high"}  # ESLint 1=warning, 2=error


def run_eslint(file_paths: list[str], repo_root: str) -> list[dict[str, Any]]:
    """
    Run ESLint on the given files and return normalized issues.
    """
    if not file_paths:
        return []

    issues = []
    config_file = None

    try:
        # Write ESLint config to temp file
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, dir="/tmp"
        ) as f:
            json.dump(ESLINT_CONFIG, f)
            config_file = f.name

        # Chunk files to avoid CLI length limits
        chunk_size = 50
        for i in range(0, len(file_paths), chunk_size):
            chunk = file_paths[i : i + chunk_size]
            chunk_issues = _run_eslint_chunk(chunk, config_file, repo_root)
            issues.extend(chunk_issues)

    except Exception as exc:
        log.error(f"ESLint execution failed: {exc}")
    finally:
        if config_file and os.path.exists(config_file):
            os.unlink(config_file)

    return issues


def _run_eslint_chunk(
    file_paths: list[str], config_file: str, repo_root: str
) -> list[dict]:
    """Run ESLint on a chunk of files."""
    cmd = [
        "eslint",
        "--format", "json",
        "--config", config_file,
        "--no-eslintrc",
        "--no-ignore",
        *file_paths,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=repo_root,
        )
    except subprocess.TimeoutExpired:
        log.warning("ESLint timed out for chunk")
        return []
    except FileNotFoundError:
        log.error("ESLint not found. Install with: npm install -g eslint")
        return []

    # ESLint exits with code 1 when there are linting errors (not a failure)
    if result.returncode > 1:
        log.warning(f"ESLint exited with code {result.returncode}: {result.stderr[:500]}")

    if not result.stdout.strip():
        return []

    try:
        raw = json.loads(result.stdout)
    except json.JSONDecodeError:
        log.error(f"ESLint output not valid JSON: {result.stdout[:200]}")
        return []

    issues = []
    for file_result in raw:
        rel_path = _relativize(file_result.get("filePath", ""), repo_root)

        for msg in file_result.get("messages", []):
            severity_num = msg.get("severity", 1)
            severity = SEVERITY_MAP.get(severity_num, "low")

            # Classify issue type
            rule_id = msg.get("ruleId") or ""
            issue_type = _classify_rule(rule_id)

            issues.append({
                "file": rel_path,
                "line": msg.get("line", 0),
                "column": msg.get("column", 0),
                "severity": severity,
                "type": issue_type,
                "message": msg.get("message", ""),
                "rule": rule_id,
                "source": "eslint",
            })

    return issues


def _classify_rule(rule_id: str) -> str:
    """Classify ESLint rule into issue type."""
    rule_lower = rule_id.lower()
    if "security" in rule_lower or rule_id in ("no-eval", "no-implied-eval", "no-new-func"):
        return "security"
    if rule_id in ("no-unused-vars", "no-undef", "no-duplicate-imports", "no-shadow"):
        return "quality"
    if rule_id in ("prefer-const", "no-var", "eqeqeq", "consistent-return"):
        return "maintainability"
    return "quality"


def _relativize(absolute: str, root: str) -> str:
    """Convert absolute path to relative."""
    try:
        return str(Path(absolute).relative_to(root))
    except ValueError:
        return absolute
