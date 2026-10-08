#!/usr/bin/env bash
# Start an already-built engine and wait for its seeded rulebooks to be ready.
set -euo pipefail

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
server_url=${COMPLIANCE_SERVER:-http://localhost:${PORT:-8080}}
log_file=${AUDITOR_LOG_FILE:-$repo_dir/reports/auditor.log}
pid_file=${AUDITOR_PID_FILE:-$repo_dir/reports/auditor.pid}
jar_file="$repo_dir/backend/target/compliance-auditor-1.0.0.jar"

if [[ ! -f "$jar_file" ]]; then
  echo "Build the engine first: cd backend && ./mvnw -B -ntp verify" >&2
  exit 2
fi
mkdir -p -- "$(dirname -- "$log_file")" "$(dirname -- "$pid_file")"
if curl --connect-timeout 2 --max-time 3 -fsS "$server_url/api/health" >/dev/null 2>&1; then
  echo "An API is already listening at $server_url; refusing to replace it." >&2
  exit 2
fi
java -jar "$jar_file" >"$log_file" 2>&1 &
auditor_pid=$!
printf '%s\n' "$auditor_pid" >"$pid_file"
ready=false
cleanup_failed_start() {
  if [[ "$ready" != true ]]; then
    kill "$auditor_pid" 2>/dev/null || true
    rm -f -- "$pid_file"
    tail -n 100 "$log_file" >&2
  fi
}
trap cleanup_failed_start EXIT
for ((attempt = 0; attempt < 60; attempt++)); do
  if ! kill -0 "$auditor_pid" 2>/dev/null; then
    echo "Auditor exited before becoming ready." >&2
    exit 2
  fi
  # /health alone can respond before MongoDB seeding has finished.
  if curl --connect-timeout 2 --max-time 3 -fsS "$server_url/api/rulebooks" 2>/dev/null |
      python3 -c 'import json,sys; books=json.load(sys.stdin); sys.exit(0 if isinstance(books,list) and len(books)>=3 else 1)' 2>/dev/null; then
    ready=true
    echo "Auditor ready at $server_url"
    exit 0
  fi
  sleep 1
done
echo "Timed out waiting for the auditor and seeded rulebooks." >&2
exit 2
