#!/usr/bin/env bash
#
# Run all three VoltReport load-test scenarios (50 / 100 / 200 VUs) and save a
# JSON summary for each. Server CPU/memory should be captured separately (see
# README.md) while these run.
#
# Usage:
#   ./run-all.sh                       # against http://localhost:3001/api
#   BASE_URL=https://staging/api ./run-all.sh
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/results"
mkdir -p "${OUT_DIR}"

command -v k6 >/dev/null 2>&1 || { echo "ERROR: k6 not installed — see README.md"; exit 1; }

for VUS in 50 100 200; do
  echo "=== Scenario: ${VUS} concurrent users ==="
  VUS="${VUS}" DURATION="${DURATION:-1m}" \
    k6 run \
      --summary-export "${OUT_DIR}/summary-${VUS}vu.json" \
      "${SCRIPT_DIR}/load.js"
  echo
done

echo "All scenarios complete. Summaries in ${OUT_DIR}/"
