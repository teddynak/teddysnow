# Structured Document Compliance Auditor

An intelligent compliance auditing tool for developers and platform engineers to paste or upload standard text records—such as **open source framework documentation**, **system & audit logs**, or **OpenAPI specifications**—and scan them against strict JSON schema rulebooks in MongoDB. Violating lines and exact character spans are conditionally highlighted with severity tags, violation explanations, and actionable remediation suggestions.

---

## Architecture & Stack

- **Frontend:** React 18 + TypeScript + Vite + Lucide Icons
  - Interactive document viewer with sticky line-number gutter
  - Exact character span highlights (`<mark>`) with hover tooltips
  - Quick jump controls (Next / Previous Violation)
  - Severity (Error / Warning / Info) & Category filters
  - Live Rulebook & Strict JSON Schema Studio
  - Scan History manager with JSON / Markdown export
- **Backend:** Java 21 + Spring Boot 3.3
  - Line-by-line regex and version compliance engine
  - Strict JSON schema validator for incoming rulebook specifications
  - RESTful APIs for scans, rulebooks, and schema retrieval
- **Database:** MongoDB
  - Stores rulebooks, compliance checks, and audit scan histories

---

## Local Service Addresses

| Service | Address | Description |
|---|---|---|
| **React UI (Vite)** | `http://localhost:5173` | Interactive compliance auditor UI |
| **Spring Boot API** | `http://localhost:8080` | Compliance engine & MongoDB REST API |
| **MongoDB Database** | `mongodb://localhost:27017` | `compliance_auditor` database |

---

## Running Locally

### 1. MongoDB
```bash
docker compose up -d
```
*(Listening on `localhost:27017`)*

### 2. Spring Boot Backend
```bash
cd backend
JAVA_HOME=/usr/lib/jvm/java-1.21.0-openjdk-amd64 ./mvnw spring-boot:run
```
*(Running on port `8080`)*

### 3. React Frontend
```bash
cd frontend
npm install
npm run dev
```
*(Accessible at `http://localhost:5173`)*

---

## Frontend Configuration and Verification

The frontend checks API health and loads rulebooks, scan history, and schema independently. Connection diagnostics and **Refresh connection** are in **Settings → Workspace connection**. Uploads accept UTF-8 text documents up to 8 MB; disable **Audit after upload** to review files before scanning, including while disconnected. The Studio can create, save, validate, and test drafts without saving them; validation uses the backend's Java regex and inheritance checks.

**Settings** includes dark, light, and system themes; comfortable or compact spacing; editor font size and line wrapping; upload behavior; default findings filter; and preferred report format. Preferences are saved in this browser. The connection URL can also be changed without rebuilding: switching servers clears the previous catalog and report while preserving your document. Reset preferences leaves the connection URL unchanged.

The custom vector logo is `frontend/public/teddysnow-logo.svg`, also used as the favicon. Download it from Settings. **How it works** explains the document → rulebook → findings → report workflow and supports keyboard navigation. The layout spans the available screen with sidebar navigation on desktop and a compact navigation grid on phones.

Copy `frontend/.env.example` to `frontend/.env.local` to customize the connection:

- `API_PROXY_TARGET` configures the backend target for both Vite development and preview servers; default `http://localhost:8080`.
- `VITE_API_BASE_URL` configures the initial browser API path at build time; a saved Settings connection URL takes precedence on that browser; default `/api`. A deployed frontend needs either a reverse proxy for `/api` or an absolute backend API URL such as `https://auditor.example/api`. For a separate origin, set the backend's `CORS_ORIGINS` to the frontend URL.

```bash
cd frontend
npm run typecheck
npm run build
npm audit
npx playwright install chromium
npm test
```

The default browser suite verifies service failures, recovery, clipboard errors, duplicate submissions, destructive-action wiring, persistent preferences, connection switching, report defaults, upload review, help accessibility, and responsive dark/light layouts with controlled API responses. To also run real API checks for scanning, exports, history, uploads, studio save/update, inherited drafts, and responsive views, start a backend connected to an **isolated test database**, then run:

```bash
AUDITOR_API_URL=http://localhost:8080 API_PROXY_TARGET=http://localhost:8080 npm test
```

To test the production build, run `npm run build` and add `PLAYWRIGHT_PREVIEW=1` to the browser test command. Development uses port 5173 and standalone preview uses 4173; both local origins are allowed by the backend defaults. Browser tests start their own server on 5173 and reject a port already used by another app. Set `PLAYWRIGHT_PORT` and the backend `CORS_ORIGINS` together if you need another test port.

The live tests create and remove their own scan and rulebook records. Layout checks cover 320, 375, 768, 1024, 1440, and 1920 pixel widths. Browser screenshots and failure traces are written to `frontend/test-results/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium or Chrome executable.

Run backend tests with Java 21 using `cd backend && ./mvnw test`.

---

## Default Seeded Rulebooks in MongoDB

On boot, the compliance engine automatically seeds three production rulebooks:

### 1. Open Source Framework Documentation Auditor
- **Outdated Framework Version (`API_VERSION`):** Checks for outdated library versions (`React <18`, `Angular <16`, `Node <18`, `Spring Boot <3.0`).
- **Deprecated Framework Lifecycle Methods (`FORBIDDEN_TOKENS`):** Flags `componentWillMount`, `componentWillReceiveProps`, `componentWillUpdate`, `UNSAFE_componentWillMount`, `getDOMNode`.
- **Missing Route Validation Flag (`REQUIRED_WHEN`):** Ensures documented route handlers (`app.post`, `@PostMapping`, `router.put`) include schema validation (`zod`, `Joi`, `@Valid`, `validate()`).
- **Insecure HTTP Protocol in Examples (`FORBIDDEN_PATTERN`):** Disallows unencrypted `http://` URLs or `insecureSkipVerify: true` in code snippets.
- **Deprecated Framework Tags (`FORBIDDEN_TOKENS`):** Catches `@deprecated`, `[DEPRECATED]`, `[LEGACY]`, `OBSOLETE`.
- **Missing Framework Metadata Header (`DOCUMENT_REQUIRED`):** Requires target Framework/Version metadata (e.g. `Framework: React 18+`).

### 2. Platform System Log Compliance
- **Outdated API Version (`API_VERSION`):** Flags `api/v1` and `api/v2.1` below minimum `3.0`.
- **Missing Validation Flag (`REQUIRED_WHEN`):** Flags `POST` / `PUT` / `WRITE` lines missing `validated=true`.
- **Deprecated Tags (`FORBIDDEN_TOKENS`):** Flags `DEPRECATED`, `@deprecated`, `LEGACY`, `OBSOLETE`, `ARCHIVED`.
- **Insecure Protocol (`FORBIDDEN_PATTERN`):** Disallows `http://`, `tls 1.0`, `tls 1.1`, and `sslv3`.
- **Missing Environment Tag (`DOCUMENT_REQUIRED`):** Requires `env=prod|staging|dev|test`.

### 3. API & OpenAPI Spec Compliance
- **Outdated OpenAPI Version (`API_VERSION`):** Flags Swagger/OpenAPI versions below `3.0`.
- **Missing RequestBody Validation (`REQUIRED_WHEN`):** Checks parameter and payload blocks for `required: true` and `schema:`.
- **Deprecated Operation Flag (`FORBIDDEN_TOKENS`):** Flags `deprecated: true` and `x-deprecated`.
- **Insecure HTTP Scheme (`FORBIDDEN_PATTERN`):** Disallows `schemes: - http` or `url: http://`.

---

## API Endpoints

- `POST /api/scans` — Scan pasted content or custom in-memory rulebook
- `POST /api/scans/upload` — Multipart upload (`.log`, `.txt`, `.md`, `.json`, `.yaml`)
- `GET /api/scans` — Retrieve recent audit scan summaries
- `GET /api/scans/{id}` — Full scan record with findings and original document
- `GET /api/scans/{id}/sarif` — Export findings in OASIS SARIF 2.1.0 format
- `GET /api/scans/{id}/export?format=sarif|markdown|json` — Download report in requested format
- `DELETE /api/scans/{id}` — Delete a specific scan record
- `DELETE /api/scans` — Clear all scan records
- `GET /api/rulebooks` — List all active rulebooks in MongoDB
- `GET /api/rulebooks/{id}` — Get rulebook by ID
- `GET /api/rulebooks/{id}/effective` — Get rulebook with full inherited rules merged
- `POST /api/rulebooks/validate` — Validate a draft and return merged inherited rules without saving
- `POST /api/rulebooks` — Create rulebook with strict JSON schema validation & inheritance (`extendsRulebookId`)
- `PUT /api/rulebooks/{id}` — Update rulebook with strict JSON schema validation & inheritance
- `DELETE /api/rulebooks/{id}` — Delete rulebook
- `POST /api/rulebooks/reset` — Restore default seeded rulebooks in MongoDB
- `GET /api/rulebooks/schema` — Returns the formal strict JSON Schema specification

---

## 🛠️ Stoplight Spectral-Inspired Advanced Features

### 1. OASIS SARIF 2.1.0 Export (GitHub Code Scanning)
Export audit findings in standard SARIF 2.1.0 format to integrate directly with **GitHub Code Scanning**, **GitLab SAST**, and IDE problem panels.
```bash
curl -s http://localhost:8080/api/scans/{id}/sarif > results.sarif
```

### 2. Rulebook Inheritance (`extends`)
Allow rulebooks in MongoDB to inherit and extend base rulebooks via `extendsRulebookId`. Child rulebooks automatically inherit all parent rules and can override rules by `id` or declare supplementary checks.
- View effective merged rulebooks via `GET /api/rulebooks/{id}/effective`.
- Visual studio badge highlights inherited vs authored rules.

### 3. CI/CD Companion CLI (`./cli/audit.sh`)
Run automated quality gates in terminal or CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins):
```bash
# Terminal human-readable audit:
./cli/audit.sh samples/openapi-spec.yaml --fail-on error

# Export SARIF for GitHub Code Scanning:
./cli/audit.sh samples/openapi-spec.yaml --format sarif -o results.sarif
```
- Exit `0` means the selected policy passed; exit `1` means the configured error/warning threshold was reached; exit `2` means invalid arguments, a missing/ambiguous policy, a connection failure, or an invalid report. Reports are written before returning policy exit `1`. Explicit rulebooks never fall back to another policy. Known document types select their corresponding seeded rulebook.
- The workflow in `.github/workflows/compliance-audit.yml` runs a clean Java 21 build and tests before starting the packaged engine, waits for MongoDB and seeded rulebooks, audits the three sample types, and validates reports against the vendored OASIS SARIF 2.1.0 schema. A separate job builds and checks the production frontend.
- The bundled examples deliberately contain violations, so the demonstration audit accepts policy exit `1` while failing on infrastructure/report errors. Workflows generated by **CI / automation** enforce the chosen policy threshold and still preserve valid reports when the gate fails.
- Code scanning uploads use `security-events: write`, `actions: read`, and `contents: read`. Fork and Dependabot runs retain downloadable report artifacts without attempting a restricted code-scanning upload. Reports, startup logs, and browser traces are saved as Actions artifacts; missing reports are never submitted to the SARIF uploader.
- SARIF locations retain checkout-relative file paths for annotations. Suggestions appear in rule help and remediation metadata; actual SARIF fixes require executable artifact edits. Analysis categories remain stable across reruns.

To reproduce the backend audit job locally, start MongoDB with `docker compose up -d`, then run:

```bash
(cd backend && ./mvnw -B -ntp clean verify)
python3 -m pip install -r scripts/requirements-ci.txt
python3 -m unittest discover -s cli/tests -v
./scripts/start-auditor.sh
./scripts/audit-examples.sh
./scripts/stop-auditor.sh
```

Generated reports and the startup log are in `reports/` (ignored by Git). Set `MONGODB_URI`, `PORT`, and `COMPLIANCE_SERVER` together to use isolated test services.
