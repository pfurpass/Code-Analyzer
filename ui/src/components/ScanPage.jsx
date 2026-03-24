import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api.js";

export default function ScanPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState("git"); // "git" | "upload"
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [file, setFile] = useState(null);
  const [enableCustom, setEnableCustom] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result;
      if (mode === "git") {
        if (!repoUrl.trim()) throw new Error("Repository URL is required");
        result = await api.scanGit(repoUrl.trim(), branch.trim() || "main", enableCustom);
      } else {
        if (!file) throw new Error("Please select a ZIP file");
        result = await api.scanUpload(file, enableCustom);
      }
      nav(`/results/${result.scanId}`);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".zip")) setFile(f);
    else setError("Only ZIP files are accepted");
  }

  const inputStyle = {
    width: "100%", padding: "10px 14px", background: "var(--surface-2)",
    border: "1px solid var(--border)", borderRadius: "var(--radius)",
    color: "var(--text)", fontSize: 13, fontFamily: "var(--mono)",
    outline: "none", transition: "border-color var(--transition)",
  };

  const labelStyle = {
    display: "block", marginBottom: 6, fontSize: 11,
    color: "var(--text-2)", textTransform: "uppercase",
    letterSpacing: 1, fontFamily: "var(--mono)",
  };

  return (
    <div style={{ padding: 32, maxWidth: 600, animation: "fadeIn 240ms ease" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>New Scan</h1>
      <p style={{ color: "var(--text-2)", fontSize: 14, marginBottom: 32 }}>
        Analyze a repository for code quality, security, and maintainability issues.
      </p>

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 2, marginBottom: 28, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 4 }}>
        {["git", "upload"].map(m => (
          <button key={m} onClick={() => { setMode(m); setError(null); }} style={{
            flex: 1, padding: "8px 0", border: "none", borderRadius: "var(--radius)",
            background: mode === m ? "var(--accent)" : "transparent",
            color: mode === m ? "#000" : "var(--text-2)",
            fontSize: 12, fontWeight: 600, fontFamily: "var(--mono)",
            textTransform: "uppercase", letterSpacing: 1,
            transition: "all var(--transition)",
          }}>
            {m === "git" ? "⎇  Git URL" : "⬆  ZIP Upload"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {mode === "git" ? (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Repository URL</label>
              <input
                style={inputStyle}
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Branch</label>
              <input
                style={inputStyle}
                value={branch}
                onChange={e => setBranch(e.target.value)}
                placeholder="main"
                onFocus={e => e.target.style.borderColor = "var(--accent)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>
          </>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>ZIP Archive</label>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onClick={() => inputRef.current.click()}
              style={{
                border: `2px dashed ${drag ? "var(--accent)" : file ? "var(--green)" : "var(--border)"}`,
                borderRadius: "var(--radius-lg)", padding: "32px 20px", textAlign: "center",
                cursor: "pointer", transition: "all var(--transition)",
                background: drag ? "var(--accent-dim)" : "var(--surface-2)",
              }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{file ? "✓" : "⬆"}</div>
              <div style={{ fontSize: 13, color: file ? "var(--green)" : "var(--text-2)" }}>
                {file ? file.name : "Drop ZIP file here or click to browse"}
              </div>
              {file && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, fontFamily: "var(--mono)" }}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>}
            </div>
            <input ref={inputRef} type="file" accept=".zip" style={{ display: "none" }}
              onChange={e => setFile(e.target.files[0] || null)} />
          </div>
        )}

        {/* Custom rules toggle */}
        <div style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
          <button type="button" onClick={() => setEnableCustom(!enableCustom)} style={{
            width: 36, height: 20, borderRadius: 10, border: "none",
            background: enableCustom ? "var(--accent)" : "var(--border-2)",
            position: "relative", transition: "background var(--transition)",
          }}>
            <span style={{
              position: "absolute", top: 3, left: enableCustom ? 18 : 3,
              width: 14, height: 14, borderRadius: 7, background: "#fff",
              transition: "left var(--transition)",
            }} />
          </button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Enable Custom Rules</div>
            <div style={{ fontSize: 11, color: "var(--text-2)" }}>Run additional Semgrep rules (console.log, hardcoded URLs, etc.)</div>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--red-dim)", border: "1px solid var(--red)", borderRadius: "var(--radius)", fontSize: 13, color: "var(--red)", fontFamily: "var(--mono)" }}>
            ✕ {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "12px 0", background: loading ? "var(--accent-dim)" : "var(--accent)",
          color: "#000", border: "none", borderRadius: "var(--radius)",
          fontSize: 13, fontWeight: 700, fontFamily: "var(--mono)",
          textTransform: "uppercase", letterSpacing: 2,
          transition: "all var(--transition)",
          cursor: loading ? "not-allowed" : "pointer",
        }}>
          {loading ? "Queuing scan..." : "◈  Start Analysis"}
        </button>
      </form>

      {/* Info box */}
      <div style={{ marginTop: 28, padding: "16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12, color: "var(--text-2)", lineHeight: 1.8 }}>
        <strong style={{ color: "var(--text)", display: "block", marginBottom: 6 }}>Analysis includes:</strong>
        ESLint (JS/TS) · Pylint (Python) · Semgrep security rules · Custom rule engine
        <br />Supports: .js .jsx .ts .tsx .py · Max repo size: 100MB · Max files: 2,000
      </div>
    </div>
  );
}
