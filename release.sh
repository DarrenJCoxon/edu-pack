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

VERSION="${1:?usage: ./release.sh <version> \"<notes>\"}"
NOTES="${2:-Release ${VERSION}}"

cd "$(dirname "${BASH_SOURCE[0]}")"
ZIP_DIR="../dist"
ZIP="${ZIP_DIR}/edu-pack-v${VERSION}.zip"

if gh release view "v${VERSION}" >/dev/null 2>&1; then
  echo "Release v${VERSION} already exists." >&2
  exit 1
fi

mkdir -p "$ZIP_DIR"
rm -f "$ZIP"

# Exclude the git directory, dependencies, generated output, and anything that is
# exam-board copyright. A release must not carry a specification or a paper.
zip -rq "$ZIP" . \
  -x ".git/*" "node_modules/*" "*.pdf" "*.docx" \
     "briefs/*" "resources/*" \
     "spec-map.json" "mark-weighting.json" "scheme-*.json" "coverage-matrix.*" \
     ".DS_Store" "*/node_modules/*"

echo "built ${ZIP} ($(du -h "$ZIP" | cut -f1), $(unzip -l "$ZIP" | tail -1 | awk '{print $2}') files)"

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

gh release create "v${VERSION}" "$ZIP" \
  --title "v${VERSION}" \
  --notes "${NOTES}

## Install

1. **Get DeepSeek Harness.** If you do not have it: <https://www.deepseek.com/en/harness/>. Open it once, then **quit it**.
2. **Download the zip below** — the file under *Assets* ending in `.zip`. That is the download, not this page.
3. **Unzip it.** Double-click the zip. You get a folder called `edu-pack`.
4. **Double-click `install.command`** inside that folder. If macOS says it cannot check the file: right-click → **Open** → **Open**.
5. **Open DeepSeek Harness again, start a new chat, and type \`/\`.**

**Full instructions, troubleshooting and uninstalling:** <https://github.com/DarrenJCoxon/edu-pack#readme>

Tested against DeepSeek Harness 0.2.1-rc.5 on macOS. Does not include exam board specifications, past papers or mark schemes."

echo "published https://github.com/DarrenJCoxon/edu-pack/releases/tag/v${VERSION}"
