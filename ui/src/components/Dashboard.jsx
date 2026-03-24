import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../utils/api.js";

const SEV_COLOR = { high: "var(--red)", medium: "var(--orange)", low: "var(--yellow)" };

function ScoreRing({ score, label }) {
  const r = 30, c = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 80 ? "var(--green)" : score >= 60 ? "var(--yellow)" : "var(--red)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={40} cy={40} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
        <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round"
          transform="rotate(-90 40 40)" style={{ transition: "stroke-dasharray 600ms ease" }} />
        <text x={40} y={45} textAnchor="middle" fill={color}
          style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700 }}>{score}</text>
      </svg>
      <span style={{ fontSize: 11, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

function ScanRow({ scan }) {
  const statusColor = { done: "var(--green)", failed: "var(--red)", running: "var(--accent)", pending: "var(--yellow)" };
  return (
    <Link to={`/results/${scan.scanId}`} style={{ textDecoration: "none" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 140px 140px 60px",
        alignItems: "center", padding: "14px 20px",
        borderBottom: "1px solid var(--border)", gap: 16,
        transition: "background var(--transition)", cursor: "pointer",
      }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div>
          <div style={{ fontSize: 13, fontFamily: "var(--mono)", color: "var(--text)", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {scan.sourceUrl?.replace("https://github.com/", "") || `Upload #${scan.scanId.slice(0, 8)}`}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)" }}>
            {scan.scanId.slice(0, 8)} · {scan.fileCount ?? "—"} files · {scan.issueCount ?? "—"} issues
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "var(--mono)" }}>
          {scan.createdAt ? new Date(scan.createdAt).toLocaleDateString() : "—"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["quality", "security", "maintainability"].map(k => (
            scan.scores?.[k] != null &&
            <div key={k} style={{ fontSize: 12, fontFamily: "var(--mono)", color: scan.scores[k] >= 80 ? "var(--green)" : scan.scores[k] >= 60 ? "var(--yellow)" : "var(--red)" }}>
              {scan.scores[k]}
            </div>
          ))}
        </div>
        <span style={{
          display: "inline-block", padding: "3px 8px", borderRadius: 99,
          fontSize: 10, fontFamily: "var(--mono)", textTransform: "uppercase",
          letterSpacing: 1, color: statusColor[scan.status] || "var(--text-2)",
          border: `1px solid ${statusColor[scan.status] || "var(--border)"}`,
        }}>{scan.status}</span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listScans().then(d => { setScans(d.scans || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const latest = scans.find(s => s.status === "done" && s.scores);

  return (
    <div style={{ padding: 32, animation: "fadeIn 240ms ease" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: "var(--text-2)", fontSize: 14 }}>
          Static analysis results across your repositories
        </p>
      </div>

      {/* Latest scores */}
      {latest?.scores && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: "24px 32px",
          marginBottom: 24, display: "flex", gap: 40, alignItems: "center",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
              Latest Scan
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {latest.sourceUrl?.replace("https://github.com/", "") || `Scan ${latest.scanId.slice(0, 8)}`}
            </div>
          </div>
          <ScoreRing score={latest.scores.quality}       label="Quality" />
          <ScoreRing score={latest.scores.security}      label="Security" />
          <ScoreRing score={latest.scores.maintainability} label="Maintain" />
        </div>
      )}

      {/* Scan history */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Recent Scans</h2>
          <Link to="/scan" style={{ fontSize: 12, padding: "6px 14px", background: "var(--accent)", color: "#000", borderRadius: "var(--radius)", fontWeight: 600, textDecoration: "none" }}>
            + New Scan
          </Link>
        </div>

        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px 60px", padding: "10px 20px", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid var(--border)", gap: 16 }}>
          <span>Repository</span><span>Date</span><span>Scores Q/S/M</span><span>Status</span>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-2)", fontFamily: "var(--mono)", fontSize: 13 }}>
            Loading scans...
          </div>
        )}

        {error && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--red)", fontFamily: "var(--mono)", fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && !error && scans.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>◈</div>
            <div style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 16 }}>No scans yet</div>
            <Link to="/scan" style={{ fontSize: 13, color: "var(--accent)" }}>Start your first scan →</Link>
          </div>
        )}

        {scans.map(s => <ScanRow key={s.scanId} scan={s} />)}
      </div>
    </div>
  );
}
