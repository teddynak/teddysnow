#!/usr/bin/env bash
# Examples intentionally contain violations. Only policy exit 1 is expected here.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
mkdir -p reports
files=(samples/openapi-spec.yaml samples/framework-documentation.md samples/system.log)
books=('API & OpenAPI Spec Compliance' 'Open Source Framework Documentation Auditor' 'Platform log compliance')
reports=(reports/openapi-results.sarif reports/docs-results.sarif reports/logs-results.sarif)
for index in "${!files[@]}"; do
  status=0
  ./cli/audit.sh "${files[$index]}" --rulebook "${books[$index]}" --format sarif -o "${reports[$index]}" --fail-on error || status=$?
  if ((status > 1)); then
    echo "Audit infrastructure failed for ${files[$index]} (exit $status)." >&2
    exit "$status"
  fi
  if [[ ! -s "${reports[$index]}" ]]; then
    echo "Audit did not produce ${reports[$index]}." >&2
    exit 2
  fi
  echo "${files[$index]}: report generated (policy exit $status)."
done
python3 scripts/validate-sarif.py "${reports[@]}"
