# ◈ Code Analyzer

Static code analysis platform for JavaScript/TypeScript and Python.  
**Fully offline · No paid APIs · Open-source tools only.**

![UI](https://img.shields.io/badge/UI-React%20%2B%20Vite-61dafb?style=flat-square)
![API](https://img.shields.io/badge/API-Node.js%20%2B%20Express-339933?style=flat-square)
![Worker](https://img.shields.io/badge/Worker-Python%203.12-3776ab?style=flat-square)
![License](https://img.shields.io/badge/License-Apache%202.0-22d3ee?style=flat-square)

---

## What does it do?

Code Analyzer accepts a Git repository URL or a ZIP file and returns:

- **Quality Score** — code quality issues (ESLint, Pylint)
- **Security Score** — vulnerabilities and unsafe patterns (Semgrep)
- **Maintainability Score** — structural and style issues (Custom Rules)

Every finding includes file path, line number, severity, rule ID, and source tool.

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-user/code-analyzer.git
cd code-analyzer

# 2. Start everything
docker-compose up -d --build

# 3. Open the dashboard
open http://localhost:8080
```

No setup, no API keys, no cloud required.

---

## Requirements

| Tool | Version | Check |
|------|---------|-------|
| Docker | ≥ 20.x | `docker --version` |
| docker-compose | ≥ 1.29 | `docker-compose --version` |

---

## Architecture

```
Browser :8080
    │
    ▼
nginx  (UI + Reverse Proxy)
    │
    ├── /scan/*     ──▶  Node.js API :3000
    └── /results/*  ──▶  Node.js API :3000
                              │
                    ┌─────────┴──────────┐
                    │                    │
                 Redis                PostgreSQL
               (Job Queue)           (Results)
                    │
                    ▼
             Python Worker
        ┌─────────────────────┐
        │  1. Clone / unzip   │
        │  2. Enumerate files │
        │  3. ESLint (JS/TS)  │
        │  4. Pylint (Python) │
        │  5. Semgrep         │
        │  6. Custom rules    │
        │  7. Calculate scores│
        │  8. Persist results │
        └─────────────────────┘
```

---

## Analysis Tools

### ESLint — JavaScript / TypeScript
- Detects: unused variables, `no-eval`, `no-console`, `prefer-const`, missing error handling
- Security: `eslint-plugin-security` — XSS patterns, buffer issues, CSRF, child process
- TypeScript: `@typescript-eslint` — explicit `any`, unused vars

### Pylint — Python
- Categories: Error (E), Warning (W), Convention (C), Refactor (R)
- Security mapping: `eval`, `exec`, subprocess without check flag

### Semgrep — All Languages

| Ruleset | Detects |
|---------|---------|
| `security.yml` | SQL injection, command injection, hardcoded secrets (AWS, JWT, Stripe), path traversal, weak crypto (MD5/SHA1), CORS wildcard, SSL disabled, unsafe pickle, `eval()` |
| `javascript.yml` | `console.log`, `debugger`, `alert()`, sync FS in async context, `process.exit()` in libraries |
| `python.yml` | Bare except, mutable default args, wildcard imports, unsafe `yaml.load()`, hardcoded `/tmp` paths |
| `custom.yml` | Hardcoded URLs, DB queries in route handlers, async functions without try/catch |

---

## Scoring

Each dimension starts at **100** and deducts points based on severity:

| Severity | Deduction |
|----------|-----------|
| HIGH     | −10 pts   |
| MEDIUM   | −5 pts    |
| LOW      | −1 pt     |

Deductions are **weighted by issue type** — a security finding primarily affects the Security score, a quality finding primarily affects the Quality score.

Scores are normalized by file count so large repositories are not unfairly penalized.

> Hard cap: any HIGH severity security issue limits the Security score to a maximum of **60**.

---

## API Reference

### Start a Git scan

```bash
POST /scan/git
Content-Type: application/json

{
  "repoUrl": "https://github.com/owner/repo",
  "branch": "main",
  "enableCustomRules": true
}
```

**Response `202 Accepted`:**
```json
{
  "scanId": "a1b2c3d4-...",
  "status": "pending",
  "links": { "results": "/results/a1b2c3d4-..." }
}
```

### Start a ZIP scan

```bash
POST /scan/upload
Content-Type: multipart/form-data

repository: <file.zip>
enableCustomRules: true
```

### Get results

```bash
GET /results/{scanId}
GET /results/{scanId}?severity=high&type=security&page=1&limit=50
```

**Response (done):**
```json
{
  "scanId": "a1b2c3d4-...",
  "status": "done",
  "results": {
    "issues": [
      {
        "file": "src/routes/users.js",
        "line": 34,
        "severity": "high",
        "type": "security",
        "message": "Potential SQL injection via string concatenation.",
        "rule": "sql-injection-string-concat",
        "source": "semgrep",
        "cwe": ["CWE-89"]
      }
    ],
    "scores": { "quality": 72, "security": 55, "maintainability": 80 },
    "stats": {
      "total": 24,
      "by_severity": { "high": 4, "medium": 8, "low": 12 },
      "by_type": { "security": 6, "quality": 11, "maintainability": 7 }
    }
  }
}
```

### List recent scans

```bash
GET /results?page=1&limit=20
```

---

## Project Structure

```
code-analyzer/
├── docker-compose.yml          # Full stack orchestration
├── Makefile                    # Dev shortcuts
├── .env.example                # Environment template
│
├── api/                        # Node.js API server
│   └── src/
│       ├── index.js            # Express app + startup
│       ├── routes/
│       │   ├── scan.js         # POST /scan/git, /scan/upload
│       │   └── results.js      # GET /results/:id, GET /results
│       ├── queue/scanQueue.js  # BullMQ queue
│       └── db/                 # PostgreSQL + Redis clients
│
├── worker/                     # Python analysis worker
│   ├── worker.py               # Queue consumer
│   ├── pipeline/
│   │   └── processor.py        # Main analysis pipeline
│   ├── analyzers/
│   │   ├── eslint_analyzer.py
│   │   ├── pylint_analyzer.py
│   │   ├── semgrep_analyzer.py
│   │   └── scoring.py
│   └── rules/semgrep/
│       ├── security.yml
│       ├── javascript.yml
│       ├── python.yml
│       └── custom.yml          # ← Add your own rules here
│
└── ui/                         # React + Vite dashboard
    └── src/
        ├── components/
        │   ├── Dashboard.jsx   # Scan history + score overview
        │   ├── ScanPage.jsx    # New scan form (git + zip upload)
        │   └── ResultsPage.jsx # Issue table + filters + scores
        └── utils/api.js
```

---

## Common Commands

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f
docker-compose logs -f worker     # worker only

# Rebuild after code changes
docker-compose build --no-cache ui
docker-compose up -d

# Test the API directly
curl -X POST http://localhost:3000/scan/git \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/expressjs/express","branch":"master"}'

# Database shell
docker exec -it ca_postgres psql -U ca_user -d code_analyzer

# Restart worker only (e.g. after editing Semgrep rules)
docker-compose restart worker
```

---

## Adding Custom Rules

Add new rules to `worker/rules/semgrep/custom.yml`:

```yaml
rules:
  - id: my-custom-rule
    pattern: $SOMETHING_BAD(...)
    message: "Description of the issue"
    severity: WARNING          # ERROR | WARNING | INFO
    languages: [javascript, typescript, python]
    metadata:
      category: security       # security | quality | maintainability
```

Then restart the worker — no rebuild needed since rules are volume-mounted:

```bash
docker-compose restart worker
```

---

## Environment Variables

All defaults work out of the box. For production deployments:

```bash
cp .env.example .env
# Edit passwords, ports, upload limits
```

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_UPLOAD_SIZE_MB` | `200` | Max ZIP upload size |
| `WORKER_CONCURRENCY` | `3` | Parallel scan jobs |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` |
| `CORS_ORIGIN` | `*` | Restrict in production |

---

## Limitations

- Supported languages: **JavaScript, TypeScript, Python**
- Max file size: **512 KB** per file (minified/generated files are skipped)
- Max files per scan: **2,000**
- Binary files (`.exe`, `.dll`, `.onnx`, model weights) are ignored — this tool analyzes **source code**
- Git repositories are shallow-cloned (`depth=1`) for speed

---

## License

```
Copyright 2024 Code Analyzer Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
