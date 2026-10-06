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

## Live Services Status

| Service | Port | Status | Description |
|---|---|---|---|
| **React UI (Vite)** | `http://localhost:5173` | **ONLINE** | Interactive compliance auditor UI |
| **Spring Boot API** | `http://localhost:8080` | **ONLINE** | Compliance engine & MongoDB REST API |
| **MongoDB Database** | `mongodb://localhost:27017` | **ONLINE** | `compliance_auditor` database |

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
- Exits with `code 0` on compliance pass and `code 1` on policy violations to fail CI/CD builds.
- Pre-configured GitHub Actions workflow located at `.github/workflows/compliance-audit.yml`.
