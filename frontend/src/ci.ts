// Quote arguments as literal POSIX shell strings, including rulebook names with apostrophes.
export const shellQuote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

export function cliCommand(file: string, rulebook: string, format: string, failOn: string) {
  return `./cli/audit.sh ${shellQuote(file)}${rulebook ? ` --rulebook ${shellQuote(rulebook)}` : ""} --format ${format} --fail-on ${failOn}`;
}

export function curlCommand(file: string, rulebookId: string, server: string) {
  const url = `${server.replace(/\/$/, "")}/api/scans/upload${rulebookId ? `?rulebookId=${encodeURIComponent(rulebookId)}` : ""}`;
  return `curl --fail-with-body -sS -F ${shellQuote(`file=@${file}`)} ${shellQuote(url)} | jq .`;
}

export function workflowYaml(file: string, rulebookName: string, failOn: string) {
  const command = `${cliCommand(file, rulebookName, "sarif", failOn)} -o results.sarif`;
  return `name: Document Compliance Audit

on:
  pull_request:
    branches: [main, master]
  push:
    branches: [main, master]

permissions:
  contents: read
  actions: read
  security-events: write

jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      MONGODB_URI: mongodb://localhost:27017/compliance_auditor_ci
      PORT: '8080'
      COMPLIANCE_SERVER: http://localhost:8080
    services:
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017
        options: >-
          --health-cmd "mongosh --quiet --eval 'quit(db.adminCommand({ping: 1}).ok ? 0 : 1)'"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 12
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-java@v5
        with:
          java-version: '21'
          distribution: temurin
          cache: maven
      - name: Build and test the auditor
        working-directory: backend
        run: ./mvnw -B -ntp clean verify
      - name: Start auditor API
        run: ./scripts/start-auditor.sh
      - name: Install report validator
        run: python3 -m pip install -r scripts/requirements-ci.txt
      - name: Audit document
        run: |
          chmod +x cli/audit.sh
${command.split("\n").map(line => `          ${line}`).join("\n")}
      - name: Validate SARIF
        id: sarif
        if: always() && hashFiles('results.sarif') != ''
        run: python3 scripts/validate-sarif.py results.sarif
      - name: Preserve report and startup logs
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: compliance-audit-results
          path: |
            results.sarif
            reports/
          if-no-files-found: ignore
      - name: Upload SARIF
        if: >-
          always() && steps.sarif.outcome == 'success' &&
          github.actor != 'dependabot[bot]' &&
          (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)
        uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: results.sarif
          category: compliance-auditor
      - name: Stop auditor API
        if: always()
        run: ./scripts/stop-auditor.sh
`;
}
