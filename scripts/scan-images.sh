#!/usr/bin/env bash
#
# Container image vulnerability scan (CH-1, Master Patch #9/#16/#14).
#
# Builds (or reuses) the 4 shipped images and runs Trivy against each, failing on
# any fixable HIGH/CRITICAL CVE. --ignore-unfixed keeps the gate actionable: we
# only fail on vulns that actually have a patch available upstream.
#
# Usage:
#   scripts/scan-images.sh              # build all 4 images from source, then scan
#   scripts/scan-images.sh --no-build   # scan pre-existing tags only (skip docker build)
#   IMAGE_TAG=ci-123 scripts/scan-images.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TAG="${IMAGE_TAG:-chscan-local}"
BUILD=1
[[ "${1:-}" == "--no-build" ]] && BUILD=0

# image_name : dockerfile  (build context is always the repo root)
IMAGES=(
  "mnema-api:apps/api/Dockerfile"
  "mnema-web:apps/web/Dockerfile"
  "mnema-workers:apps/api/Dockerfile.workers"
  "mnema-collab:apps/api/Dockerfile.collab"
)

if ! command -v trivy >/dev/null 2>&1; then
  echo "ERROR: trivy is not installed — cannot scan images." >&2
  echo "" >&2
  echo "Install it:" >&2
  echo "  macOS:  brew install trivy" >&2
  echo "  Debian: sudo apt-get install -y trivy   (or see https://aquasecurity.github.io/trivy)" >&2
  exit 127
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed — cannot build/scan images." >&2
  exit 127
fi

fail=0

for entry in "${IMAGES[@]}"; do
  name="${entry%%:*}"
  dockerfile="${entry#*:}"
  image="${name}:${TAG}"

  if [[ "$BUILD" -eq 1 ]]; then
    echo "=== Building ${image} (${dockerfile}) ==="
    docker build -f "$dockerfile" -t "$image" .
  fi

  echo "=== Scanning ${image} ==="
  if ! trivy image \
      --severity HIGH,CRITICAL \
      --ignore-unfixed \
      --exit-code 1 \
      "$image"; then
    echo "!!! ${image} has fixable HIGH/CRITICAL vulnerabilities" >&2
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  echo "" >&2
  echo "scan-images: FAIL — one or more images have fixable HIGH/CRITICAL CVEs." >&2
  exit 1
fi

echo "scan-images: PASS — no fixable HIGH/CRITICAL vulnerabilities in any image."
