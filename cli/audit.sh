#!/usr/bin/env bash
# ==============================================================================
# Structured Document Compliance Auditor - CI/CD CLI Companion
# Inspired by Stoplight Spectral & ESLint for Automated PR Quality Gates
# ==============================================================================

set -eo pipefail

SERVER_URL="${COMPLIANCE_SERVER:-http://localhost:8080}"
TARGET_FILE=""
RULEBOOK=""
FORMAT="terminal"
OUTPUT_FILE=""
FAIL_ON="error"

# Terminal Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

usage() {
  cat << EOF
${BOLD}Structured Document Compliance Auditor CLI${NC}

Usage:
  $(basename "$0") <file> [options]

Options:
  -r, --rulebook <id|name>   Rulebook ID or name to scan against (default: auto-detected)
  -f, --format <format>      Output format: terminal | sarif | markdown | json (default: terminal)
  -o, --output <file>        Write output results directly to a destination file
  --fail-on <error|warning>  Threshold to exit with code 1 (default: error)
  -s, --server <url>         Auditor backend server URL (default: http://localhost:8080)
  -h, --help                 Display this help message

Examples:
  ./cli/audit.sh samples/openapi-spec.yaml
  ./cli/audit.sh samples/openapi-spec.yaml --format sarif -o results.sarif
  ./cli/audit.sh samples/framework-documentation.md --fail-on warning
EOF
  exit 0
}

# Parse Command Line Flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      ;;
    -r|--rulebook)
      RULEBOOK="$2"
      shift 2
      ;;
    -f|--format)
      FORMAT="$2"
      shift 2
      ;;
    -o|--output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    --fail-on)
      FAIL_ON="$2"
      shift 2
      ;;
    -s|--server)
      SERVER_URL="$2"
      shift 2
      ;;
    *)
      if [[ -z "$TARGET_FILE" ]]; then
        TARGET_FILE="$1"
        shift
      else
        echo -e "${RED}Error: Unknown argument '$1'${NC}" >&2
        usage
      fi
      ;;
  esac
done

if [[ -z "$TARGET_FILE" ]]; then
  echo -e "${RED}Error: Target file is required.${NC}\n" >&2
  usage
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  echo -e "${RED}Error: Target file '$TARGET_FILE' does not exist.${NC}" >&2
  exit 2
fi

# Ensure curl and jq / python are present
if ! command -v curl &> /dev/null; then
  echo -e "${RED}Error: 'curl' is required to communicate with compliance auditor.${NC}" >&2
  exit 2
fi

# Check server connectivity
if ! curl -sf "${SERVER_URL}/api/health" > /dev/null 2>&1; then
  echo -e "${RED}Error: Cannot connect to Compliance Auditor backend at ${SERVER_URL}${NC}" >&2
  echo -e "${YELLOW}Please ensure Spring Boot is running (e.g., cd backend && ./mvnw spring-boot:run)${NC}" >&2
  exit 2
fi

# Resolve rulebook ID if a name was passed
RULEBOOK_ID=""
if [[ -n "$RULEBOOK" ]]; then
  RULEBOOK_ID=$(curl -sf "${SERVER_URL}/api/rulebooks" | python3 -c "
import sys, json
books = json.load(sys.stdin)
target = '''$RULEBOOK'''.lower()
match = next((b['id'] for b in books if b['id'] == target or target in b['name'].lower()), '')
print(match)
" 2>/dev/null || echo "")
fi

# Upload and scan file
UPLOAD_URL="${SERVER_URL}/api/scans/upload"
if [[ -n "$RULEBOOK_ID" ]]; then
  UPLOAD_URL="${UPLOAD_URL}?rulebookId=${RULEBOOK_ID}"
fi

SCAN_RESPONSE=$(curl -sf -F "file=@${TARGET_FILE}" "${UPLOAD_URL}" 2>/dev/null || true)

if [[ -z "$SCAN_RESPONSE" ]]; then
  echo -e "${RED}Failed to execute audit scan.${NC}" >&2
  exit 2
fi

SCAN_ID=$(echo "$SCAN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)

if [[ -z "$SCAN_ID" ]]; then
  echo -e "${RED}Invalid scan response received.${NC}" >&2
  exit 2
fi

# Export Formats
if [[ "$FORMAT" == "sarif" ]]; then
  SARIF_DATA=$(curl -sf "${SERVER_URL}/api/scans/${SCAN_ID}/sarif")
  if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$SARIF_DATA" > "$OUTPUT_FILE"
    echo -e "${GREEN}✓ SARIF 2.1.0 report exported to: ${OUTPUT_FILE}${NC}"
  else
    echo "$SARIF_DATA"
  fi
elif [[ "$FORMAT" == "markdown" || "$FORMAT" == "md" ]]; then
  MD_DATA=$(curl -sf "${SERVER_URL}/api/scans/${SCAN_ID}/export?format=markdown")
  if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$MD_DATA" > "$OUTPUT_FILE"
    echo -e "${GREEN}✓ Markdown report exported to: ${OUTPUT_FILE}${NC}"
  else
    echo "$MD_DATA"
  fi
elif [[ "$FORMAT" == "json" ]]; then
  if [[ -n "$OUTPUT_FILE" ]]; then
    echo "$SCAN_RESPONSE" > "$OUTPUT_FILE"
    echo -e "${GREEN}✓ JSON report exported to: ${OUTPUT_FILE}${NC}"
  else
    echo "$SCAN_RESPONSE"
  fi
else
  # Default: Human-readable terminal output
  echo "$SCAN_RESPONSE" | python3 -c "
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
"
fi

# Evaluate exit status for CI/CD quality gates
ERRORS=$(echo "$SCAN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('errorCount', 0))" 2>/dev/null || echo 0)
WARNINGS=$(echo "$SCAN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('warningCount', 0))" 2>/dev/null || echo 0)

if [[ "$FAIL_ON" == "warning" ]]; then
  if [[ "$ERRORS" -gt 0 || "$WARNINGS" -gt 0 ]]; then
    exit 1
  fi
else
  if [[ "$ERRORS" -gt 0 ]]; then
    exit 1
  fi
fi

exit 0
