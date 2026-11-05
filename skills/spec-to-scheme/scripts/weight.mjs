#!/usr/bin/env node
/**
 * Stage 2 — mark weighting.
 *
 * AQA mark schemes carry two columns that make this possible without guessing:
 * the AO for each question, and the specification reference it examines. So
 * "where are the marks" is arithmetic on published data, not an opinion.
 *
 * Extraction uses vendored pdf.js, which reports word coordinates — so this no
 * longer needs Poppler installed. The parser is unchanged in spirit: it finds
 * tokens by where they sit, not by how the text happens to be laid out.
 *
 * Usage: node weight.mjs papers/*MS*.pdf
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { extractPages, rowsOf } from './pdf-words.mjs';

const SPEC_RE = /^4\.\d{1,2}\.\d{1,2}\.\d{1,2}$/u;

// Column bands, measured from AQA mark schemes. The mark column shifts a few
// points between pages, so the band is wider than the alignment suggests, and
// x >= 450 excludes numbers belonging to the "Extra information" column.
const MARK_MIN_X = 450;
const MARK_MAX_X = 481;
const QUESTION_MAX_X = 100;
const REFERENCE_MIN_X = 480;

/**
 * The mark column is right-aligned at roughly 475. Filtering on the right edge
 * rather than a loose band excludes stray numbers from the "Extra information"
 * column out of the total.
 */
function markValue(row) {
  const cell = row.find((w) => w.xEnd >= 462 && w.xEnd <= 482 && /^\d{1,2}$/u.test(w.text));
  return cell === undefined ? null : Number(cell.text);
}

/** Parse one mark scheme into question records. */
function parseMarkScheme(pages, paperId) {
  const questions = new Map();
  const statedTotals = new Map();
  let currentQ = null;

  const ensure = (q) => {
    if (!questions.has(q)) questions.set(q, { q, marks: 0, aos: new Set(), refs: new Set() });
    return questions.get(q);
  };

  for (const page of pages) {
    for (const row of rowsOf(page.words)) {
      const texts = row.map((w) => w.text);

      // "Total Question N ..... 10" states that question's own total. Match on the
      // joined text, because pdf.js may hand back "Total Question 1" as one item.
      const totalMatch = texts.join(' ').match(/Total\s+Question\s+(\d{1,2})/u);
      if (totalMatch) {
        const mark = markValue(row);
        if (mark !== null) statedTotals.set(totalMatch[1].padStart(2, '0'), mark);
        continue;
      }

      // A sub-part label (01.1) sets the question later rows belong to.
      const part = row.find((w) => w.x < QUESTION_MAX_X && /^\d{2}\.\d{1,2}$/u.test(w.text));
      if (part) currentQ = ensure(part.text.split('.')[0]);
      if (currentQ === null) continue;

      const mark = markValue(row);
      if (mark !== null) currentQ.marks += mark;

      for (const word of row) {
        if (word.x <= REFERENCE_MIN_X) continue;
        if (/^AO[123]$/u.test(word.text)) currentQ.aos.add(word.text);
        if (SPEC_RE.test(word.text)) currentQ.refs.add(word.text);
      }
    }
  }

  return [...questions.values()]
    .map((q) => {
      const stated = statedTotals.get(q.q);
      return {
        q: q.q,
        marks: stated ?? q.marks,
        marksFromParts: q.marks,
        totalsAgree: stated === undefined ? null : stated === q.marks,
        aos: [...q.aos].sort(),
        refs: [...q.refs].sort(),
      };
    })
    .sort((a, b) => a.q.localeCompare(b.q));
}

const files = process.argv.slice(2).filter((a) => a.toLowerCase().endsWith('.pdf'));
if (files.length === 0) {
  console.error('usage: node weight.mjs <mark-scheme.pdf...>');
  process.exit(2);
}

const papers = [];

for (const file of files) {
  const pages = await extractPages(path.resolve(file));
  const match = path.basename(file).match(/AQA-(\d{5})([A-Z])-MS/u);
  const paperId = match ? `${match[1]}/${match[2]}` : path.basename(file);
  const questions = parseMarkScheme(pages, paperId);
  const total = questions.reduce((n, q) => n + q.marks, 0);
  const withRefs = questions.filter((q) => q.refs.length > 0).length;
  const mismatched = questions.filter((q) => q.totalsAgree === false).map((q) => q.q);
  papers.push({ file: path.basename(file), paperId, questions, total, withRefs, mismatched });
  const gate = total === 100 ? 'reconciles to 100' : `DOES NOT total 100 (got ${total})`;
  console.log(`${paperId}: ${questions.length} questions, ${total} marks [${gate}], ${withRefs} with a spec reference`
    + (mismatched.length ? `, part-sum mismatch on Q${mismatched.join(', Q')}` : ''));
}

// Attribute each question's marks to the units/topics its spec references touch.
// A question citing several points is split evenly, so totals remain consistent.
const byUnit = {};
const byTopic = {};
const byAo = {};

for (const paper of papers) {
  for (const question of paper.questions) {
    for (const ao of question.aos) byAo[ao] = (byAo[ao] ?? 0) + (question.marks / Math.max(question.aos.length, 1));

    const units = new Set(question.refs.map((r) => r.split('.').slice(0, 2).join('.')));
    const topics = new Set(question.refs.map((r) => r.split('.').slice(0, 3).join('.')));
    for (const unit of units) byUnit[unit] = (byUnit[unit] ?? 0) + question.marks / Math.max(units.size, 1);
    for (const topic of topics) byTopic[topic] = (byTopic[topic] ?? 0) + question.marks / Math.max(topics.size, 1);
  }
}

const round = (n) => Math.round(n * 10) / 10;
const out = {
  papers: papers.map(({ file, paperId, total, withRefs, questions }) => ({
    file, paperId, total, questionsWithSpecRef: withRefs, questions,
  })),
  byUnit: Object.fromEntries(Object.entries(byUnit).map(([k, v]) => [k, round(v)])),
  byTopic: Object.fromEntries(Object.entries(byTopic).map(([k, v]) => [k, round(v)])),
  byAssessmentObjective: Object.fromEntries(Object.entries(byAo).map(([k, v]) => [k, round(v)])),
};

await writeFile('mark-weighting.json', `${JSON.stringify(out, null, 2)}\n`, 'utf8');

const totalMarks = papers.reduce((n, p) => n + p.total, 0);
console.log('\nmarks by unit (across all papers parsed):');
for (const [unit, marks] of Object.entries(out.byUnit).sort()) {
  console.log(`  ${unit}  ${String(marks).padStart(6)}  ${((marks / totalMarks) * 100).toFixed(1)}%`);
}
console.log('\nmarks by assessment objective:');
for (const [ao, marks] of Object.entries(out.byAssessmentObjective).sort()) {
  console.log(`  ${ao}  ${String(marks).padStart(6)}  ${((marks / totalMarks) * 100).toFixed(1)}%`);
}
