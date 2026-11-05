#!/usr/bin/env node
/**
 * Convert a PDF to text without external software.
 *
 * Replaces the previous shell script, which depended on Apple's PDFKit through
 * osascript and therefore existed only on macOS. This uses the pdf.js copy that
 * the mark-scheme parser already needs, so it runs identically on macOS and
 * Windows.
 *
 * Layout approximation: words are grouped into visual rows and joined with
 * spaces. That resembles `pdftotext -layout` closely enough for the specification
 * parser, which reads one heading per line.
 *
 * Usage:  bin/run bin/pdf-to-text.mjs <file.pdf> > specification.txt
 */

import { extractPages, rowsOf } from '../skills/spec-to-scheme/scripts/pdf-words.mjs';

const source = process.argv[2];
if (source === undefined) {
  console.error('usage: node pdf-to-text.mjs <file.pdf> > out.txt');
  process.exit(2);
}

const pages = await extractPages(source);
const lines = [];

for (const page of pages) {
  for (const row of rowsOf(page.words)) {
    const text = row.map((word) => word.text).join(' ').replace(/\s+/gu, ' ').trim();
    if (text.length > 0) lines.push(text);
  }
  lines.push('');
}

process.stdout.write(`${lines.join('\n').replace(/\n+$/u, '')}\n`);
