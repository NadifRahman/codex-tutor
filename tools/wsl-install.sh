#!/usr/bin/env bash
set -euo pipefail

if ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "This helper is intended for WSL. Use npm install on other platforms." >&2
  exit 1
fi

study_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
study_lock_hash="$(sha256sum "$study_repo_root/package-lock.json" | cut -d ' ' -f 1)"
study_cache_base="${XDG_CACHE_HOME:-$HOME/.cache}"
study_dependency_root="$study_cache_base/course-study-template/$study_lock_hash"

if [ -e "$study_repo_root/node_modules" ] && [ ! -L "$study_repo_root/node_modules" ]; then
  echo "node_modules already exists and is not a link." >&2
  echo "Remove only that generated directory, then rerun npm run setup:wsl." >&2
  exit 1
fi

mkdir -p "$study_dependency_root"
cp "$study_repo_root/package.json" "$study_repo_root/package-lock.json" "$study_dependency_root/"

if [ ! -d "$study_dependency_root/node_modules" ]; then
  (
    cd "$study_dependency_root"
    npm ci --ignore-scripts
  )
fi

if [ -L "$study_repo_root/node_modules" ]; then
  rm "$study_repo_root/node_modules"
fi
ln -s "$study_dependency_root/node_modules" "$study_repo_root/node_modules"

echo "Linked dependencies from $study_dependency_root/node_modules"
npm run doctor

