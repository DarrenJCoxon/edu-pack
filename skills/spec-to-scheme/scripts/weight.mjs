#!/usr/bin/env node
/**
 * Stage 2 — mark weighting.
 *
 * AQA mark schemes carry two columns that make this possible without guessing:
 * the AO for each question, and the specification reference it examines. So
 * "where are the marks" is arithmetic on published data, not an opinion.
 *
 * This is the stage a retrieval tool cannot do. NotebookLM would summarise a
 * mark scheme; it cannot sum marks across papers, attribute them to
 * specification points, and compare that to how much content each unit contains.
 *
 * Usage: node build-mark-weighting.mjs papers/*MS*.pdf
 */

import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const WORD_RE = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/word>/gu;
const PAGE_RE = /<page width="[\d.]+" height="[\d.]+">([\s\S]*?)<\/page>/gu;
const SPEC_RE = /^4\.\d{1,2}\.\d{1,2}\.\d{1,2}$/u;

/** Group words into visual rows, tolerating small baseline differences. */
function rowsOf(pageBody) {
  const words = [...pageBody.matchAll(WORD_RE)].map((m) => ({
    x: Number(m[1]), xEnd: Number(m[3]), y: Number(m[2]), text: m[5],
  }));
  words.sort((a, b) => a.y - b.y || a.x - b.x);

  const rows = [];
  for (const word of words) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - word.y) < 3) last.words.push(word);
    else rows.push({ y: word.y, words: [word] });
  }
  return rows.map((row) => row.words.sort((a, b) => a.x - b.x));
}

/**
 * Parse one mark scheme into question records.
 * Columns, measured from the document: Question ~69, Mark ~469, AO/Spec > 480.
 */
function parseMarkScheme(xml, paperId) {
  const questions = new Map();
  const statedTotals = new Map();
  let currentQ = null;

  const ensure = (q) => {
    if (!questions.has(q)) questions.set(q, { q, marks: 0, aos: new Set(), refs: new Set() });
    return questions.get(q);
  };

  for (const pageMatch of xml.matchAll(PAGE_RE)) {
    for (const row of rowsOf(pageMatch[1])) {
      const texts = row.map((w) => w.text);
      // The mark column shifts a few points between pages (xEnd 469 on one page,
      // 478 on another), so the band has to be wider than the alignment looks.
      // xMin >= 450 keeps numbers from the "Extra information" column out.
      const rightAlignedMark = (w) => w.x >= 450 && w.xEnd >= 462 && w.xEnd <= 482 && /^\d{1,2}$/u.test(w.text);

      // "Total Question N ..... 10" states that question's own total.
      if (texts.includes('Total') && texts.includes('Question')) {
        const at = texts.indexOf('Question');
        const q = texts.slice(at + 1).find((t) => /^\d{1,2}$/u.test(t));
        const mark = row.filter(rightAlignedMark).pop();
        if (q && mark) statedTotals.set(q.padStart(2, '0'), Number(mark.text));
        continue;
      }

      // A sub-part label (01.1) sets the question that later rows belong to.
      const part = row.find((w) => w.x < 100 && /^\d{2}\.\d{1,2}$/u.test(w.text));
      if (part) currentQ = ensure(part.text.split('.')[0]);
      if (currentQ === null) continue;

      const mark = row.find(rightAlignedMark);
      if (mark) currentQ.marks += Number(mark.text);

      for (const word of row) {
        if (word.x <= 480) continue;
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

// Only PDFs are inputs; the runner may pass other flags alongside them.
const files = process.argv.slice(2).filter((a) => a.toLowerCase().endsWith('.pdf'));
if (files.length === 0) {
  console.error('usage: node build-mark-weighting.mjs <mark-scheme.pdf...>');
  process.exit(2);
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'ms-'));
const papers = [];

for (const file of files) {
  const xmlPath = path.join(temp, `${path.basename(file, '.pdf')}.xml`);
  execFileSync('pdftotext', ['-bbox-layout', file, xmlPath]);
  const xml = await readFile(xmlPath, 'utf8');
  const match = path.basename(file).match(/AQA-(\d{5})([A-Z])-MS/u);
  const paperId = match ? `${match[1]}/${match[2]}` : path.basename(file);
  const questions = parseMarkScheme(xml, paperId);
  const total = questions.reduce((n, q) => n + q.marks, 0);
  const withRefs = questions.filter((q) => q.refs.length > 0).length;
  const mismatched = questions.filter((q) => q.totalsAgree === false).map((q) => q.q);
  papers.push({ file: path.basename(file), paperId, questions, total, withRefs, mismatched });
  const gate = total === 100 ? 'reconciles to 100' : `DOES NOT total 100 (got ${total})`;
  console.log(`${paperId}: ${questions.length} questions, ${total} marks [${gate}], ${withRefs} with a spec reference`
    + (mismatched.length ? `, part-sum mismatch on Q${mismatched.join(', Q')}` : ''));
}

// Attribute each question's marks to the units/topics its spec references touch.
// A question citing several points is split evenly, so totals stay honest.
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
