#!/usr/bin/env bash
set -u

PATTERN='(BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|[0-9]{8,10}:[A-Za-z0-9_-]{35}|sk-[A-Za-z0-9]{20,}|6bfc772a909341719d02c9f6bb8a63dd)'
FILES_PATTERN='(^|/)(config\.json|\.env(\..*)?|.*\.(pem|key|p12|pfx)|secrets\.json|yt-cookies\.txt)$'

repos=("$@")
if [ ${#repos[@]} -eq 0 ]; then
  repos=("$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
fi

bad=0

for repo in "${repos[@]}"; do
  if ! git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "skip (not a git repo): $repo"
    continue
  fi
  echo "== secrets check: $repo =="
  repo_bad=0

  tracked_sensitive=$(git -C "$repo" ls-files | grep -E "$FILES_PATTERN" || true)
  if [ -n "$tracked_sensitive" ]; then
    echo "!! sensitive files are tracked:"
    echo "$tracked_sensitive"
    repo_bad=1
    bad=1
  fi

  matches=$(git -C "$repo" grep -nIE "$PATTERN" -- . 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "!! secret-like strings in tracked files:"
    echo "$matches"
    repo_bad=1
    bad=1
  fi

  staged=$(git -C "$repo" diff --cached -U0 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+' | grep -E "$PATTERN" || true)
  if [ -n "$staged" ]; then
    echo "!! secret-like strings in staged changes:"
    echo "$staged"
    repo_bad=1
    bad=1
  fi

  if [ $repo_bad -eq 0 ]; then
    echo "OK: no secrets found"
  fi
done

if [ $bad -ne 0 ]; then
  echo
  echo "FAILED: remove secrets from tracked files/staged changes before commit."
  exit 1
fi
echo
echo "All checks passed."
