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
  security-events: write

jobs:
  audit:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: temurin
          cache: maven
      - name: Start auditor API
        run: |
          cd backend
          chmod +x mvnw
          ./mvnw spring-boot:start
          timeout 60 bash -c 'until curl -sf http://localhost:8080/api/health; do sleep 2; done'
      - name: Audit document
        run: |
          chmod +x cli/audit.sh
${command.split("\n").map(line => `          ${line}`).join("\n")}
      - name: Upload SARIF
        if: always() && hashFiles('results.sarif') != ''
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
          category: compliance-auditor
`;
}
