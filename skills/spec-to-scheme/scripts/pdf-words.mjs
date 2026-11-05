/**
 * PDF text extraction with coordinates, using vendored pdf.js.
 *
 * The mark-scheme parser needs to know *where* a word sits, not just what it says:
 * marks live in one column, specification references in another. That is why this
 * pipeline used `pdftotext -bbox-layout`, and why it needed Poppler installed —
 * which is where most teachers stopped.
 *
 * pdf.js (Apache-2.0, pure JavaScript) exposes the same information through
 * `getTextContent()`, so the dependency disappears.
 */

import { getDocument, GlobalWorkerOptions } from '../../../vendor/pdfjs/pdf.mjs';

// pdf.js runs its parser in a worker; in Node it needs to know where that is.
GlobalWorkerOptions.workerSrc = new URL('../../../vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;

/**
 * pdf.js returns line segments, not words ("Question 1" arrives as one item).
 * The parser matches individual tokens, so split them and apportion the width by
 * character count. The estimate only has to be good enough to put a token in the
 * right column, which is tens of points wide.
 *
 * @param {{ str: string, transform: number[], width?: number }} item
 * @param {number} pageHeight
 */
function wordsFromItem(item, pageHeight) {
  const [, , , , x, baseline] = item.transform;
  const y = pageHeight - baseline;
  const width = item.width ?? 0;
  const text = item.str;
  if (text.trim() === '') return [];

  const parts = text.split(/(\s+)/u).filter((part) => part !== '');
  if (parts.length === 1) return [{ x, xEnd: x + width, y, text }];

  const total = text.length;
  const out = [];
  let consumed = 0;
  for (const part of parts) {
    const start = x + (width * consumed) / total;
    consumed += part.length;
    const end = x + (width * consumed) / total;
    if (part.trim() !== '') out.push({ x: start, xEnd: end, y, text: part });
  }
  return out;
}

/**
 * @param {string} pdfPath
 * @returns {Promise<Array<{ number: number, width: number, height: number,
 *   words: Array<{ x: number, xEnd: number, y: number, text: string }> }>>}
 */
export async function extractPages(pdfPath) {
  const doc = await getDocument({
    url: pdfPath,
    useWorkerFetch: false,
    isEvalSupported: false,
    // Text extraction does not render, so canvas primitives are not needed.
    disableFontFace: true,
  }).promise;

  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const pieces = [];
    for (const item of content.items) {
      if (typeof item.str !== 'string') continue;
      pieces.push(...wordsFromItem(item, viewport.height));
    }

    // pdf.js reports glyph runs, so "11" can arrive as "1" and "1" two points
    // apart. pdftotext merged those into a word, and the parser relies on that:
    // a mark cell is one token. Re-merge adjacent fragments on the same line.
    const words = [];
    for (const piece of pieces.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const last = words[words.length - 1];
      if (last && Math.abs(last.y - piece.y) < 1 && piece.x - last.xEnd < 2) {
        last.text += piece.text;
        last.xEnd = piece.xEnd;
      } else {
        words.push({ ...piece });
      }
    }

    pages.push({ number, width: viewport.width, height: viewport.height, words });
  }

  await doc.destroy();
  return pages;
}

/**
 * Group words into visual rows, tolerating small baseline differences — the same
 * shape the old XML-based parser produced.
 *
 * @param {Array<{ x: number, xEnd: number, y: number, text: string }>} words
 */
export function rowsOf(words) {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const word of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - word.y) < 3) last.words.push(word);
    else rows.push({ y: word.y, words: [word] });
  }
  return rows.map((row) => row.words.sort((a, b) => a.x - b.x));
}
