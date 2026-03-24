"""
Semgrep Security Analyzer
Runs Semgrep with security-focused rules on the codebase.
"""
import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

RULES_DIR = Path(__file__).parent.parent / "rules" / "semgrep"

# Severity mapping from Semgrep
SEMGREP_SEVERITY_MAP = {
    "ERROR": "high",
    "WARNING": "medium",
    "INFO": "low",
    "CRITICAL": "high",
}


def run_semgrep(
    repo_root: str,
    languages: list[str],
    enable_custom_rules: bool = True,
) -> list[dict[str, Any]]:
    """
    Run Semgrep on the repository using predefined + custom rules.
    """
    rule_configs = _build_rule_configs(languages, enable_custom_rules)

    if not rule_configs:
        log.warning("No Semgrep rule configs found")
        return []

    issues = []
    for config in rule_configs:
        issues.extend(_run_semgrep_config(config, repo_root))

    # Deduplicate by (file, line, rule)
    seen = set()
    unique = []
    for issue in issues:
        key = (issue["file"], issue["line"], issue.get("rule", ""))
        if key not in seen:
            seen.add(key)
            unique.append(issue)

    return unique


def _build_rule_configs(languages: list[str], enable_custom: bool) -> list[str]:
    """Build list of Semgrep rule config paths."""
    configs = []

    # Always include security rules
    security_rule = RULES_DIR / "security.yml"
    if security_rule.exists():
        configs.append(str(security_rule))

    # Language-specific rules
    if "javascript" in languages or "typescript" in languages:
        js_rule = RULES_DIR / "javascript.yml"
        if js_rule.exists():
            configs.append(str(js_rule))

    if "python" in languages:
        py_rule = RULES_DIR / "python.yml"
        if py_rule.exists():
            configs.append(str(py_rule))

    # Custom rules
    if enable_custom:
        custom_rule = RULES_DIR / "custom.yml"
        if custom_rule.exists():
            configs.append(str(custom_rule))

    return configs


def _run_semgrep_config(config: str, repo_root: str) -> list[dict]:
    """Run Semgrep with a specific config."""
    cmd = [
        "semgrep",
        "--config", config,
        "--json",
        "--no-git-ignore",
        "--timeout", "60",
        "--max-memory", "512",
        "--quiet",
        repo_root,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        log.warning(f"Semgrep timed out for config: {config}")
        return []
    except FileNotFoundError:
        log.error("Semgrep not found. Install with: pip install semgrep")
        return []

    if result.returncode not in (0, 1):
        log.warning(
            f"Semgrep exit code {result.returncode} for {config}: "
            f"{result.stderr[:300]}"
        )

    if not result.stdout.strip():
        return []

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        log.error(f"Semgrep output not JSON: {result.stdout[:200]}")
        return []

    issues = []
    for finding in data.get("results", []):
        path = finding.get("path", "")
        rel_path = _relativize(path, repo_root)

        start = finding.get("start", {})
        meta = finding.get("extra", {})

        severity_raw = meta.get("severity", "WARNING").upper()
        severity = SEMGREP_SEVERITY_MAP.get(severity_raw, "medium")

        metadata = meta.get("metadata", {})
        issue_type = _classify_semgrep_rule(
            finding.get("check_id", ""),
            metadata
        )

        issues.append({
            "file": rel_path,
            "line": start.get("line", 0),
            "column": start.get("col", 0),
            "severity": severity,
            "type": issue_type,
            "message": meta.get("message", "Security issue detected"),
            "rule": finding.get("check_id", ""),
            "source": "semgrep",
            "cwe": metadata.get("cwe", []),
            "owasp": metadata.get("owasp", []),
        })

    return issues


def _classify_semgrep_rule(rule_id: str, metadata: dict) -> str:
    """Classify Semgrep finding as security/quality/maintainability."""
    rule_lower = rule_id.lower()

    # Security indicators
    security_keywords = [
        "secret", "injection", "xss", "sqli", "csrf", "rce", "exec",
        "eval", "unsafe", "hardcoded", "credential", "password", "token",
        "key", "auth", "ssl", "tls", "crypto", "hash", "pickle",
        "deserializ", "traversal", "ssrf", "idor", "overflow",
    ]

    if any(k in rule_lower for k in security_keywords):
        return "security"

    if metadata.get("cwe") or metadata.get("owasp"):
        return "security"

    if "maintainability" in rule_lower or "complexity" in rule_lower:
        return "maintainability"

    return "quality"


def _relativize(path_str: str, root: str) -> str:
    try:
        return str(Path(path_str).relative_to(root))
    except ValueError:
        return path_str
