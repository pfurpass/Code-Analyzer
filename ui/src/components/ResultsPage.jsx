import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../utils/api.js";

const SEV = {
  high:   { color: "var(--red)",    bg: "var(--red-dim)",    label: "HIGH" },
  medium: { color: "var(--orange)", bg: "var(--orange-dim)", label: "MED"  },
  low:    { color: "var(--yellow)", bg: "var(--yellow-dim)", label: "LOW"  },
};
const TYPE_COLOR = {
  security:        "var(--red)",
  quality:         "var(--accent)",
  maintainability: "var(--yellow)",
};

function ScoreCard({ score, label }) {
  const c = score >= 80 ? "var(--green)" : score >= 60 ? "var(--yellow)" : "var(--red)";
  const r = 36, circ = 2 * Math.PI * r;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width={90} height={90} viewBox="0 0 90 90">
        <circle cx={45} cy={45} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
        <circle cx={45} cy={45} r={r} fill="none" stroke={c} strokeWidth={5}
          strokeDasharray={`${circ * (score / 100)} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 45 45)" style={{ transition: "stroke-dasharray 800ms ease" }} />
        <text x={45} y={51} textAnchor="middle" fill={c}
          style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 700 }}>{score}</text>
      </svg>
      <div style={{ fontSize: 10, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 4, fontFamily: "var(--mono)" }}>
        {label}
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", padding: "12px 20px", background: "var(--surface-2)", borderRadius: "var(--radius)", border: `1px solid var(--border)` }}>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--mono)", color: color || "var(--text)" }}>{value ?? "—"}</div>
      <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function IssueRow({ issue }) {
  const sev = SEV[issue.severity] || SEV.low;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "56px 1fr 80px 90px",
      padding: "12px 20px", borderBottom: "1px solid var(--border)",
      gap: 12, alignItems: "start",
      fontSize: 12,
    }}>
      {/* Severity badge */}
      <span style={{
        padding: "2px 7px", borderRadius: 4, fontSize: 9,
        fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: 1,
        color: sev.color, background: sev.bg, border: `1px solid ${sev.color}`,
        textAlign: "center",
      }}>{sev.label}</span>

      {/* Message + location */}
      <div>
        <div style={{ color: "var(--text)", lineHeight: 1.5 }}>{issue.message}</div>
        <div style={{ marginTop: 4, fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-3)" }}>
          {issue.file}:{issue.line}
          {issue.rule && <span style={{ marginLeft: 8, color: "var(--text-3)" }}>· {issue.rule}</span>}
        </div>
      </div>

      {/* Type */}
      <span style={{ fontSize: 10, color: TYPE_COLOR[issue.type] || "var(--text-2)", textTransform: "uppercase", letterSpacing: 1, fontFamily: "var(--mono)", paddingTop: 2 }}>
        {issue.type}
      </span>

      {/* Source */}
      <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)", paddingTop: 2 }}>
        {issue.source}
      </span>
    </div>
  );
}

const POLL_INTERVAL = 3000;

export default function ResultsPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ severity: "", type: "" });
  const [page, setPage] = useState(1);

  const fetchResults = useCallback(async () => {
    try {
      const params = { page, limit: 50, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) };
      const result = await api.getResults(id, params);
      setData(result);
    } catch (e) {
      setError(e.message);
    }
  }, [id, page, filters]);

  useEffect(() => {
    fetchResults();
    // Poll while pending/running
    const interval = setInterval(async () => {
      const result = await api.getResults(id, {}).catch(() => null);
      if (result) setData(result);
      if (result?.status === "done" || result?.status === "failed") {
        clearInterval(interval);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => { if (data?.status === "done") fetchResults(); }, [filters, page]);

  if (error) return (
    <div style={{ padding: 32, color: "var(--red)", fontFamily: "var(--mono)" }}>
      ✕ {error} · <Link to="/dashboard">← Back</Link>
    </div>
  );

  if (!data) return (
    <div style={{ padding: 32, color: "var(--text-2)", fontFamily: "var(--mono)", fontSize: 13 }}>
      Loading...
    </div>
  );

  const isPending = data.status === "pending" || data.status === "running";
  const issues    = data.results?.issues || [];
  const scores    = data.results?.scores;
  const stats     = data.results?.stats;
  const pagination = data.results?.pagination;

  return (
    <div style={{ padding: 32, animation: "fadeIn 240ms ease" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <Link to="/dashboard" style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--mono)", textDecoration: "none" }}>← Dashboard</Link>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 6, marginBottom: 4 }}>
            {data.sourceUrl?.replace("https://github.com/", "") || `Scan ${id.slice(0, 8)}`}
          </h1>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
            {id} · branch: {data.branch || "—"}
          </div>
        </div>
        <span style={{
          padding: "5px 12px", borderRadius: 20, fontSize: 10,
          fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1.5,
          color: data.status === "done" ? "var(--green)" : data.status === "failed" ? "var(--red)" : "var(--accent)",
          border: `1px solid ${data.status === "done" ? "var(--green)" : data.status === "failed" ? "var(--red)" : "var(--accent)"}`,
        }}>{data.status}</span>
      </div>

      {/* Pending state */}
      {isPending && (
        <div style={{ padding: "40px 32px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: "var(--text-2)", fontSize: 14 }}>
            {data.status === "pending" ? "Waiting in queue..." : "Analysis in progress..."}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6, fontFamily: "var(--mono)" }}>
            Auto-refreshing every 3s
          </div>
        </div>
      )}

      {/* Failed state */}
      {data.status === "failed" && (
        <div style={{ padding: "24px", background: "var(--red-dim)", border: "1px solid var(--red)", borderRadius: "var(--radius-lg)", color: "var(--red)", fontFamily: "var(--mono)", fontSize: 13 }}>
          ✕ Scan failed: {data.error || "Unknown error"}
        </div>
      )}

      {/* Done state */}
      {data.status === "done" && (
        <>
          {/* Score cards */}
          {scores && (
            <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 28px", display: "flex", gap: 32, alignItems: "center", flex: 1 }}>
                <ScoreCard score={scores.quality}         label="Quality" />
                <ScoreCard score={scores.security}        label="Security" />
                <ScoreCard score={scores.maintainability} label="Maintain" />
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "20px 24px", display: "flex", gap: 12, alignItems: "center" }}>
                <StatPill label="Total Issues" value={stats?.total}       color="var(--text)" />
                <StatPill label="High"         value={stats?.by_severity?.high}   color="var(--red)" />
                <StatPill label="Medium"       value={stats?.by_severity?.medium} color="var(--orange)" />
                <StatPill label="Low"          value={stats?.by_severity?.low}    color="var(--yellow)" />
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1 }}>Filter:</span>
            {["", "high", "medium", "low"].map(s => (
              <button key={s} onClick={() => { setFilters(f => ({ ...f, severity: s })); setPage(1); }} style={{
                padding: "5px 12px", border: `1px solid ${filters.severity === s ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 20, background: filters.severity === s ? "var(--accent-dim)" : "transparent",
                color: filters.severity === s ? "var(--accent)" : "var(--text-2)",
                fontSize: 11, fontFamily: "var(--mono)", cursor: "pointer",
                transition: "all var(--transition)",
              }}>{s || "All"}</button>
            ))}
            <span style={{ margin: "0 4px", color: "var(--border-2)" }}>|</span>
            {["", "security", "quality", "maintainability"].map(t => (
              <button key={t} onClick={() => { setFilters(f => ({ ...f, type: t })); setPage(1); }} style={{
                padding: "5px 12px", border: `1px solid ${filters.type === t ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 20, background: filters.type === t ? "var(--accent-dim)" : "transparent",
                color: filters.type === t ? "var(--accent)" : "var(--text-2)",
                fontSize: 11, fontFamily: "var(--mono)", cursor: "pointer",
                transition: "all var(--transition)",
              }}>{t || "All types"}</button>
            ))}
          </div>

          {/* Issues table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 80px 90px", padding: "10px 20px", fontSize: 10, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid var(--border)", gap: 12 }}>
              <span>Sev</span><span>Issue</span><span>Type</span><span>Source</span>
            </div>

            {issues.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--green)", fontFamily: "var(--mono)", fontSize: 14 }}>
                ✓ No issues found{filters.severity || filters.type ? " matching filters" : ""}
              </div>
            )}

            {issues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20, alignItems: "center" }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "6px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: page <= 1 ? "var(--text-3)" : "var(--text)", cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "var(--mono)" }}>← Prev</button>
              <span style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "var(--mono)" }}>
                {page} / {pagination.pages} · {pagination.total} issues
              </span>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages} style={{ padding: "6px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: page >= pagination.pages ? "var(--text-3)" : "var(--text)", cursor: page >= pagination.pages ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "var(--mono)" }}>Next →</button>
            </div>
          )}

          {/* Top files */}
          {stats?.top_files?.length > 0 && (
            <div style={{ marginTop: 24, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600 }}>
                Top Files by Issue Count
              </div>
              {stats.top_files.map(({ file, count }) => (
                <div key={file} style={{ display: "flex", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                  <span style={{ fontFamily: "var(--mono)", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{file}</span>
                  <span style={{ fontFamily: "var(--mono)", color: count > 10 ? "var(--red)" : count > 5 ? "var(--orange)" : "var(--yellow)", flexShrink: 0 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
