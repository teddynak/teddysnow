#!/usr/bin/env bash
# 0 = policy pass, 1 = policy findings, 2 = usage, connection, or report failure.
set -euo pipefail

SERVER_URL="${COMPLIANCE_SERVER:-http://localhost:8080}"
TARGET_FILE=""
RULEBOOK=""
FORMAT="terminal"
OUTPUT_FILE=""
FAIL_ON="error"

usage() {
  cat <<'HELP'
TeddySnow Document Compliance Auditor
Usage: ./cli/audit.sh <file> [options]
  -r, --rulebook <id|name>   Saved rulebook (default: detect known document types)
  -f, --format <format>      terminal | sarif | markdown | json
  -o, --output <file>        Destination report file
  --fail-on <error|warning>  Policy threshold (default: error)
  -s, --server <url>         API server (default: http://localhost:8080)
  -h, --help                 Show help
HELP
}
fail() { printf 'Error: %s\n' "$*" >&2; exit 2; }
while (($#)); do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -r|--rulebook|-f|--format|-o|--output|--fail-on|-s|--server)
      (($# >= 2)) && [[ -n "$2" && "$2" != -* ]] || fail "Missing value for $1."
      case "$1" in
        -r|--rulebook) RULEBOOK="$2" ;;
        -f|--format) FORMAT="$2" ;;
        -o|--output) OUTPUT_FILE="$2" ;;
        --fail-on) FAIL_ON="$2" ;;
        -s|--server) SERVER_URL="$2" ;;
      esac
      shift 2 ;;
    -*) fail "Unknown option $1." ;;
    *) [[ -z "$TARGET_FILE" ]] || fail "Unexpected argument $1."; TARGET_FILE="$1"; shift ;;
  esac
done
[[ -n "$TARGET_FILE" ]] || fail 'Target file is required.'
[[ -f "$TARGET_FILE" ]] || fail "Target file '$TARGET_FILE' does not exist."
case "$FORMAT" in terminal|sarif|markdown|md|json) ;; *) fail "Unsupported format '$FORMAT'." ;; esac
case "$FAIL_ON" in error|warning) ;; *) fail "Unsupported threshold '$FAIL_ON'." ;; esac
[[ "$SERVER_URL" =~ ^https?:// ]] || fail 'Server must be an HTTP(S) URL.'
SERVER_URL="${SERVER_URL%/}"
for dependency in curl python3; do command -v "$dependency" >/dev/null || fail "$dependency is required."; done
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tmp_dir=$(mktemp -d)
trap 'rm -rf -- "$tmp_dir"' EXIT
api_request() { curl --connect-timeout 5 --max-time 60 --fail --silent --show-error "$@"; }
api_request "$SERVER_URL/api/health" >"$tmp_dir/health.json" || fail "Cannot reach the API at $SERVER_URL."
python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("status")=="ok" else 1)' <"$tmp_dir/health.json" || fail 'API health check failed.'

# Detect the corresponding seeded policy; never silently replace a requested policy.
if [[ -z "$RULEBOOK" ]]; then
  RULEBOOK=$(python3 - "$TARGET_FILE" <<'PYTHON'
from pathlib import Path
import re, sys
path = Path(sys.argv[1])
content = path.read_text(encoding="utf-8", errors="replace")
if re.search(r"(?im)^\s*(openapi|swagger)\s*:", content):
    print("API & OpenAPI Spec Compliance")
elif path.suffix.lower() == ".md" or re.search(r"(?i)framework:", content):
    print("Open Source Framework Documentation Auditor")
else:
    print("Platform log compliance")
PYTHON
  ) || fail 'Could not identify the document policy.'
fi
api_request "$SERVER_URL/api/rulebooks" >"$tmp_dir/books.json" || fail 'Could not load saved rulebooks.'
RULEBOOK_ID=$(python3 - "$RULEBOOK" "$tmp_dir/books.json" <<'PYTHON'
import json, sys
books = json.load(open(sys.argv[2], encoding="utf-8"))
target = sys.argv[1]
exact = [book for book in books if book.get("id") == target or book.get("name", "").lower() == target.lower()]
matches = exact or [book for book in books if target.lower() in book.get("name", "").lower()]
if len(matches) != 1 or not matches[0].get("id"):
    sys.exit(1)
print(matches[0]["id"])
PYTHON
) || fail "Rulebook '$RULEBOOK' was not found or is ambiguous."
encoded_id=$(python3 -c 'import sys; from urllib.parse import quote; print(quote(sys.argv[1], safe=""))' "$RULEBOOK_ID")
api_request -F "file=@${TARGET_FILE}" "$SERVER_URL/api/scans/upload?rulebookId=$encoded_id" >"$tmp_dir/scan.json" || fail 'Audit upload failed.'
metadata=$(python3 - "$tmp_dir/scan.json" <<'PYTHON'
import json, sys
scan = json.load(open(sys.argv[1], encoding="utf-8"))
if not isinstance(scan.get("id"), str) or not scan["id"] or not isinstance(scan.get("findings"), list):
    sys.exit(1)
for key in ("errorCount", "warningCount", "infoCount"):
    if type(scan.get(key)) is not int or scan[key] < 0:
        sys.exit(1)
print(scan["id"], scan["errorCount"], scan["warningCount"])
PYTHON
) || fail 'Invalid scan response received.'
read -r SCAN_ID ERRORS WARNINGS <<< "$metadata"
SCAN_RESPONSE=$(cat "$tmp_dir/scan.json")
encoded_scan=$(python3 -c 'import sys; from urllib.parse import quote; print(quote(sys.argv[1], safe=""))' "$SCAN_ID")
report_file="$tmp_dir/report"
case "$FORMAT" in
  sarif)
    api_request "$SERVER_URL/api/scans/$encoded_scan/sarif" >"$tmp_dir/sarif.json" || fail 'SARIF export failed.'
    # Multipart filenames omit directories. Restore checkout paths for GitHub annotations.
    python3 - "$tmp_dir/sarif.json" "$TARGET_FILE" "$repo_dir" >"$report_file" <<'PYTHON' || fail 'Invalid SARIF export received.'
import json, sys
from pathlib import Path
from urllib.parse import quote
report = json.load(open(sys.argv[1], encoding="utf-8"))
if report.get("version") != "2.1.0" or not report.get("runs"):
    sys.exit(1)
path = Path(sys.argv[2]).resolve()
try:
    uri = quote(path.relative_to(Path(sys.argv[3])).as_posix(), safe="/")
except ValueError:
    uri = path.as_uri()
for run in report["runs"]:
    if not isinstance(run.get("results"), list):
        sys.exit(1)
    for result in run["results"]:
        for location in result.get("locations", []):
            location["physicalLocation"]["artifactLocation"] = {"uri": uri}
    # The category is stable across runs; scan database IDs are intentionally excluded.
    run["automationDetails"] = {"id": "compliance/" + uri + "/"}
json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
print()
PYTHON
    ;;
  markdown|md)
    api_request "$SERVER_URL/api/scans/$encoded_scan/export?format=markdown" >"$report_file" || fail 'Markdown export failed.'
    [[ -s "$report_file" ]] || fail 'The Markdown export is empty.' ;;
  json) cp -- "$tmp_dir/scan.json" "$report_file" ;;
  terminal)
  printf '%s\n' "$SCAN_RESPONSE" | python3 -c "
import sys, json

data = json.load(sys.stdin)
filename = data.get('sourceName', 'document')
rulebook = data.get('rulebookName', 'Rulebook')
lines = data.get('lineCount', 0)
errors = data.get('errorCount', 0)
warnings = data.get('warningCount', 0)
info = data.get('infoCount', 0)
compliant = data.get('compliant', False)
findings = data.get('findings', [])

print(f'\n\033[1mCompliance Audit Report:\033[0m \033[36m{filename}\033[0m')
print(f'\033[2mRulebook: {rulebook} | {lines} lines scanned\033[0m\n')

if not findings:
    print('\033[0;32m✓ All compliance checks passed. No violations detected.\033[0m\n')
else:
    for f in findings:
        sev = f.get('severity', 'INFO')
        color = '\033[0;31m' if sev == 'ERROR' else ('\033[1;33m' if sev == 'WARNING' else '\033[0;34m')
        icon = '✖' if sev == 'ERROR' else ('⚠' if sev == 'WARNING' else 'ℹ')
        line = f.get('lineNumber', 1)
        title = f.get('title', 'Violation')
        msg = f.get('message', '')
        excerpt = f.get('excerpt', '')
        suggestion = f.get('suggestion', '')

        print(f'  {color}{icon} Line {line}: [{sev}] {title}\033[0m')
        print(f'    \033[2m{msg}\033[0m')
        if excerpt:
            print(f'    \033[33m--> {excerpt}\033[0m')
        if suggestion:
            print(f'    \033[32m💡 Suggestion: {suggestion}\033[0m')
        print()

    print('─' * 60)
    summary_color = '\033[0;31m' if errors > 0 else ('\033[1;33m' if warnings > 0 else '\033[0;32m')
    print(f'{summary_color}\033[1mSummary: {errors} errors, {warnings} warnings, {info} info ({len(findings)} total problems)\033[0m\n')
" >"$report_file" || fail 'Could not render the audit report.'
    ;;
esac
if [[ -n "$OUTPUT_FILE" ]]; then
  cp -- "$report_file" "$OUTPUT_FILE" || fail "Could not write '$OUTPUT_FILE'."
  printf 'Report exported to: %s\n' "$OUTPUT_FILE" >&2
else
  cat "$report_file"
fi
if ((ERRORS > 0)) || { [[ "$FAIL_ON" == warning ]] && ((WARNINGS > 0)); }; then
  exit 1
fi
exit 0
