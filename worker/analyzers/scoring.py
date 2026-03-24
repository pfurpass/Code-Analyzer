"""
Scoring Engine
Calculates quality, security, and maintainability scores based on issue severity.
"""
from typing import Any

# Point deductions per severity
DEDUCTIONS = {
    "high":   10,
    "medium":  5,
    "low":     1,
}

# Weight multipliers per issue type (how strongly each type affects each score)
SCORE_WEIGHTS = {
    #                quality  security  maintainability
    "quality":      (1.0,     0.1,      0.3),
    "security":     (0.2,     1.0,      0.1),
    "maintainability": (0.3,  0.05,     1.0),
}


def calculate_scores(issues: list[dict[str, Any]], file_count: int) -> dict[str, int]:
    """
    Calculate three scores (0–100) from a list of normalized issues.

    Scoring model:
    - Start at 100 for each dimension
    - Deduct weighted points per issue based on severity + type
    - Normalize by file count to avoid penalizing large repos unfairly
    - Clamp to [0, 100]
    """
    if not issues:
        return {"quality": 100, "security": 100, "maintainability": 100}

    quality_deduction       = 0.0
    security_deduction      = 0.0
    maintainability_deduction = 0.0

    for issue in issues:
        severity  = issue.get("severity", "low")
        issue_type = issue.get("type", "quality")

        base = DEDUCTIONS.get(severity, 1)
        weights = SCORE_WEIGHTS.get(issue_type, (0.5, 0.1, 0.3))

        quality_deduction         += base * weights[0]
        security_deduction        += base * weights[1]
        maintainability_deduction += base * weights[2]

    # Scale deductions logarithmically relative to file count
    # Larger repos absorb more issues before tanking their score
    scale = max(1.0, (file_count ** 0.5) * 0.5) if file_count > 0 else 1.0

    quality       = max(0, int(100 - (quality_deduction       / scale)))
    security      = max(0, int(100 - (security_deduction      / scale)))
    maintainability = max(0, int(100 - (maintainability_deduction / scale)))

    # Hard cap: any critical (high severity security) issue caps security score at 60
    high_security = [
        i for i in issues
        if i.get("severity") == "high" and i.get("type") == "security"
    ]
    if high_security:
        security = min(security, 60)

    return {
        "quality":        min(100, quality),
        "security":       min(100, security),
        "maintainability": min(100, maintainability),
    }


def calculate_stats(issues: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a summary stats object from issues."""
    by_severity: dict[str, int] = {"high": 0, "medium": 0, "low": 0}
    by_type: dict[str, int]     = {"security": 0, "quality": 0, "maintainability": 0}
    by_source: dict[str, int]   = {}
    by_file: dict[str, int]     = {}

    for issue in issues:
        sev    = issue.get("severity", "low")
        itype  = issue.get("type", "quality")
        source = issue.get("source", "unknown")
        file_  = issue.get("file", "unknown")

        by_severity[sev]  = by_severity.get(sev, 0) + 1
        by_type[itype]    = by_type.get(itype, 0) + 1
        by_source[source] = by_source.get(source, 0) + 1
        by_file[file_]    = by_file.get(file_, 0) + 1

    # Top 10 files by issue count
    top_files = sorted(by_file.items(), key=lambda x: x[1], reverse=True)[:10]

    return {
        "total":       len(issues),
        "by_severity": by_severity,
        "by_type":     by_type,
        "by_source":   by_source,
        "top_files":   [{"file": f, "count": c} for f, c in top_files],
    }
