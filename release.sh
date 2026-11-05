#!/bin/bash
# Publish a release: rebuild the zip, commit, push, and create the GitHub release.
#
# The zip is a snapshot of this folder, so every change to the README or the
# scripts needs a new one. Downloading the old zip would otherwise hand people
# documentation that no longer matches the code in it.
#
# Usage:
#   ./release.sh 0.1.1 "Fixed the install instructions"
#
# Prerequisites: git, gh (authenticated), zip.

set -euo pipefail

# ---------------------------------------------------------------------------
# Read the published page back and check it, rather than trusting that what we
# sent is what a reader sees. Three releases shipped a mangled page because a
# backtick was eaten by the shell and nothing looked at the result.
# ---------------------------------------------------------------------------
verify_body() {
  local body="$1" label="$2"
  local failures=0

  present() { if printf '%s' "$body" | grep -qF -- "$1"; then echo "  ok   $2"; else echo "  FAIL $2"; failures=$((failures + 1)); fi; }
  absent()  { if printf '%s' "$body" | grep -qF -- "$1"; then echo "  FAIL $2"; failures=$((failures + 1)); else echo "  ok   $2"; fi; }

  echo "verifying $label"
  present "install.command" "names the installer"
  present "start a new chat" "tells the reader to start a new chat"
  present "deepseek.com/en/harness" "links to the harness download"
  present "edu-pack-v" "names the file pattern to download"
  absent  '\.' "no escaped dots from shell escaping"
  absent  '\`' "no escaped backticks from shell escaping"

  if [ "$failures" -gt 0 ]; then
    echo
    echo "VERIFICATION FAILED ($failures problem(s)). The page says:"
    printf '%s\n' "$body" | head -20
    echo
    echo "Fix with: gh release edit <tag> --notes-file <file>"
    return 1
  fi
  echo "verified: $label looks right"
  return 0
}

# Check an existing release without publishing.
if [ "${1:-}" = "--check" ]; then
  TAG="${2:?usage: ./release.sh --check <tag>}"
  verify_body "$(gh release view "$TAG" --json body --jq .body)" "$TAG"
  exit $?
fi

# Check a body from a file, for testing the checks themselves.
if [ "${1:-}" = "--check-body" ]; then
  FILE="${2:?usage: ./release.sh --check-body <file>}"
  verify_body "$(cat "$FILE")" "$FILE"
  exit $?
fi

VERSION="${1:?usage: ./release.sh <version> \"<notes>\"}"
NOTES="${2:-Release ${VERSION}}"

cd "$(dirname "${BASH_SOURCE[0]}")"
ZIP_DIR="../dist"
ZIP="${ZIP_DIR}/edu-pack-v${VERSION}.zip"

# The writing rule is enforced, not advisory.
if [ -x bin/check-language ]; then
  bin/check-language || { echo "Refusing to release: correct the violations above." >&2; exit 1; }
fi

if gh release view "v${VERSION}" >/dev/null 2>&1; then
  echo "Release v${VERSION} already exists." >&2
  exit 1
fi

mkdir -p "$ZIP_DIR"
rm -f "$ZIP"

# Exclude the git directory, dependencies, generated output and exam-board
# copyright material. A release must not carry a specification or a paper.
zip -rq "$ZIP" . \
  -x ".git/*" "node_modules/*" "*.pdf" "*.docx" \
     "briefs/*" "resources/*" \
     "spec-map.json" "mark-weighting.json" "scheme-*.json" "coverage-matrix.*" \
     ".DS_Store" "*/node_modules/*"

echo "built ${ZIP} ($(du -h "$ZIP" | cut -f1), $(unzip -l "$ZIP" | tail -1 | awk '{print $2}') files)"

# A reader who downloads the archive must receive the same instructions as a
# reader of the repository. Compare the two rather than assuming they match.
if ! unzip -p "$ZIP" README.md 2>/dev/null | cmp -s - README.md; then
  echo "REFUSING: the archive README differs from the repository README." >&2
  exit 1
fi
echo "  README in the archive matches the repository"

if unzip -l "$ZIP" | grep -qiE '\.pdf|/papers/|specification\.txt'; then
  echo "REFUSING: the archive contains exam-board material." >&2
  rm -f "$ZIP"
  exit 1
fi

git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "v${VERSION}: ${NOTES}"
fi

git push -q origin HEAD

# Build the notes in a quoted heredoc so markdown never passes through shell
# escaping. Two earlier releases lost their backticks this way: inside a
# double-quoted string an unmatched ` starts command substitution, which deletes
# the text silently.
NOTES_FILE="$(mktemp)"
{
  printf '%s\n\n' "$NOTES"
  cat <<'BLOCK'
## Install

1. **Get DeepSeek Harness.** If you do not have it: <https://www.deepseek.com/en/harness/>. Open it once, then **quit it**.
2. **Download the zip below** — under *Assets*, the file whose name starts with `edu-pack-v`. Ignore the two *Source code* files. This page is not the download.
3. **Unzip it.** Double-click the zip. You get a folder called `edu-pack`.
4. **Double-click `install.command`** inside that folder. If macOS says it cannot check the file: right-click → **Open** → **Open**.
5. **Open DeepSeek Harness again, start a new chat, and type `/`.**

**Full instructions:** <https://github.com/DarrenJCoxon/edu-pack#readme>

Tested against DeepSeek Harness 0.2.1-rc.5 on macOS. Does not include exam board specifications, past papers or mark schemes.
BLOCK
} > "$NOTES_FILE"

gh release create "v${VERSION}" "$ZIP" --title "v${VERSION}" --notes-file "$NOTES_FILE"

# ---- Read it back ---------------------------------------------------------
verify_body "$(gh release view "v${VERSION}" --json body --jq .body)" "v${VERSION}" || exit 1

ASSETS="$(gh release view "v${VERSION}" --json assets --jq '.assets[].name')"
if printf '%s' "$ASSETS" | grep -qF "$(basename "$ZIP")"; then
  echo "  ok   the zip is attached"
else
  echo "  FAIL the zip is not attached: $ASSETS"
  exit 1
fi

echo "published https://github.com/DarrenJCoxon/edu-pack/releases/tag/v${VERSION}"
