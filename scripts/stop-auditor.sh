#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
pid_file=${AUDITOR_PID_FILE:-$repo_dir/reports/auditor.pid}
if [[ -f "$pid_file" ]]; then
  auditor_pid=$(cat "$pid_file")
  if [[ "$auditor_pid" =~ ^[0-9]+$ ]]; then
    kill "$auditor_pid" 2>/dev/null || true
  fi
  rm -f -- "$pid_file"
fi
