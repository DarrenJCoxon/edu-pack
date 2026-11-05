#!/usr/bin/env node
/**
 * Coverage matrix — every specification point: is it taught, and is it examined?
 *
 * This is the artefact that closes the loop on a scheme of work. Two mechanical
 * questions, answered for all points at once:
 *
 *   taught?    from the scheme of work
 *   examined?  from the mark schemes, which record the specification reference of
 *              each question
 *
 * The second question is the one departments usually cannot answer. It needs the
 * mark schemes parsed and joined to the specification — work no one does by hand
 * for a whole course, and nothing a document chat tool can do at all.
 *
 * Usage:
 *   node matrix.mjs --spec <spec-map.json> --weighting <mark-weighting.json> \
 *                   --scheme <scheme-*.json> --out <prefix>
 */

import { readFile, writeFile } from 'node:fs/promises';

import { Gate, verifyScheme } from '../../../packages/edu-verify/lib/index.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (!flag.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[flag.slice(2)] = true;
  else { args[flag.slice(2)] = next; i += 1; }
}

const specPath = args.spec ?? 'spec-map.json';
const weightingPath = args.weighting ?? 'mark-weighting.json';
const schemePath = args.scheme;
const outPrefix = args.out ?? 'coverage-matrix';

if (!schemePath) {
  console.error('usage: node matrix.mjs --spec <spec-map.json> --weighting <mark-weighting.json> --scheme <scheme.json> [--out prefix]');
  process.exit(2);
}

const spec = JSON.parse(await readFile(specPath, 'utf8'));
const weighting = JSON.parse(await readFile(weightingPath, 'utf8'));
const scheme = JSON.parse(await readFile(schemePath, 'utf8'));

// ---- Which questions examine which point ---------------------------------
const examinedBy = new Map();
for (const paper of weighting.papers ?? []) {
  for (const question of paper.questions ?? []) {
    for (const ref of question.refs ?? []) {
      if (!examinedBy.has(ref)) examinedBy.set(ref, []);
      examinedBy.get(ref).push({ paper: paper.paperId, question: question.q, marks: question.marks });
    }
  }
}

// ---- Which lessons teach which point -------------------------------------
const taughtBy = new Map();
for (const lesson of scheme.lessons ?? []) {
  for (const point of lesson.points ?? []) {
    if (!taughtBy.has(point)) taughtBy.set(point, []);
    taughtBy.get(point).push(lesson.n);
  }
}

// ---- Gate the inputs ------------------------------------------------------
const allPoints = [];
const topics = [];
for (const unit of spec.units) {
  for (const topic of unit.topics) {
    topics.push(topic);
    for (const point of topic.points) {
      allPoints.push({ id: point.id, title: point.title, topicId: topic.id, topicTitle: topic.title, unitId: unit.id, unitTitle: unit.title });
    }
  }
}

const expectedMarks = Object.values(weighting.byUnit).reduce((a, b) => a + b, 0);
const gate = verifyScheme('coverage matrix inputs', {
  allPoints: allPoints.map((p) => p.id),
  lessons: scheme.lessons,
  expectedLessons: scheme.lessons.length,
  expectedMarks,
  actualMarks: scheme.lessons.reduce((n, l) => n + (l.marksAtStake ?? 0), 0),
});

const neverExamined = allPoints.filter((p) => !examinedBy.has(p.id));
const neverTaught = allPoints.filter((p) => !taughtBy.has(p.id));

gate.assert('every point appears in exactly one taught-by entry',
  [...taughtBy.values()].every((lessons) => lessons.length === 1),
  `${[...taughtBy.values()].filter((l) => l.length > 1).length} point(s) taught in more than one lesson`);

gate.require();

// ---- Emit ---------------------------------------------------------------
const rows = allPoints.map((p) => ({
  ...p,
  lessons: taughtBy.get(p.id) ?? [],
  examined: examinedBy.get(p.id) ?? [],
}));

await writeFile(`${outPrefix}.json`, `${JSON.stringify({
  parameters: { spec: specPath, weighting: weightingPath, scheme: schemePath },
  summary: {
    points: allPoints.length,
    taught: allPoints.length - neverTaught.length,
    examined: allPoints.length - neverExamined.length,
    neverExamined: neverExamined.map((p) => p.id),
    marksAnalysed: Math.round(expectedMarks * 10) / 10,
    papers: (weighting.papers ?? []).map((p) => p.paperId),
  },
  verification: gate.report(),
  rows,
}, null, 2)}\n`, 'utf8');

const lines = [];
lines.push(`# Coverage matrix — ${spec.specification ?? 'specification'}`);
lines.push('');
lines.push(`Scheme: \`${schemePath}\`${scheme.parameters ? ` (${scheme.parameters.pedagogy} pedagogy, ${scheme.parameters.lessons} lessons)` : ''}`);
lines.push(`Mark schemes analysed: ${(weighting.papers ?? []).map((p) => p.paperId).join(', ') || 'none'}`);
lines.push('');
lines.push(`**${allPoints.length} specification points.** Taught: ${allPoints.length - neverTaught.length}. Examined in the papers analysed: ${allPoints.length - neverExamined.length}.`);
lines.push('');
lines.push('> "Examined" means the mark schemes analysed cite that specification point for a question. It is not a claim about the whole assessment, and it is weakest where only a few papers were parsed.');
lines.push('');

let currentUnit = null;
for (const row of rows) {
  if (row.unitId !== currentUnit) {
    currentUnit = row.unitId;
    lines.push(`## ${row.unitId} ${row.unitTitle}`);
    lines.push('');
    lines.push('| Point | Title | Lesson | Examined | Questions |');
    lines.push('|---|---|---|---|---|');
  }
  const questions = row.examined.length > 0
    ? row.examined.map((e) => `${e.paper} Q${e.question}`).join('; ')
    : '—';
  lines.push(`| ${row.id} | ${row.title} | ${row.lessons.join(', ') || '**none**'} | ${row.examined.length > 0 ? 'yes' : '**no**'} | ${questions} |`);
}
lines.push('');
if (neverExamined.length > 0) {
  lines.push('## Points not examined in the papers analysed');
  lines.push('');
  lines.push('Treat as a question, not a conclusion: with two papers this is thin evidence, and some will be examined in other series or tiers.');
  lines.push('');
  for (const p of neverExamined) lines.push(`- ${p.id} ${p.title} (${p.unitTitle})`);
  lines.push('');
}

await writeFile(`${outPrefix}.md`, `${lines.join('\n')}\n`, 'utf8');

console.log(gate.report());
console.log(`\n${allPoints.length} points | taught ${allPoints.length - neverTaught.length} | examined ${allPoints.length - neverExamined.length}`);
console.log(`never examined in the papers analysed: ${neverExamined.length}`);
if (neverExamined.length > 0) {
  console.log(`  ${neverExamined.slice(0, 8).map((p) => p.id).join(', ')}${neverExamined.length > 8 ? '…' : ''}`);
}
console.log(`\nwrote ${outPrefix}.md and ${outPrefix}.json`);
