#!/usr/bin/env node
/**
 * Lesson briefs — the hand-off between verified data and generated prose.
 *
 * A model writing a worksheet from a prompt alone invents syllabus content. Here it
 * receives a brief containing only what is already proven: the specification
 * points this lesson must teach, their verbatim text, the marks at stake, and
 * the exam questions that have historically examined exactly those points.
 *
 * That split matters. The tool supplies provenance; the model supplies pedagogy.
 * Nothing in a brief is inferred, so nothing in a resource can be silently
 * detached from the specification — and each resource ends up with a provenance
 * table pointing back at the points it covers.
 *
 * Usage:
 *   node briefs.mjs --spec spec-map.json --weighting mark-weighting.json \
 *     --scheme scheme-spaced.json --from 1 --to 6 --out briefs
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Gate } from '../../../packages/edu-verify/lib/index.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (!flag.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[flag.slice(2)] = true;
  else { args[flag.slice(2)] = next; i += 1; }
}

const from = Number(args.from ?? 1);
const to = Number(args.to ?? 6);
const outDir = args.out ?? 'briefs';

const spec = JSON.parse(await readFile(args.spec ?? 'spec-map.json', 'utf8'));
const weighting = JSON.parse(await readFile(args.weighting ?? 'mark-weighting.json', 'utf8'));
const scheme = JSON.parse(await readFile(args.scheme ?? 'scheme-spaced.json', 'utf8'));

// Index the specification so a point id resolves to its text and its topic.
const pointIndex = new Map();
for (const unit of spec.units) {
  for (const topic of unit.topics) {
    for (const point of topic.points) {
      pointIndex.set(point.id, { ...point, topicId: topic.id, topicTitle: topic.title, unitId: unit.id, unitTitle: unit.title });
    }
  }
}

// Index the exam questions by the specification references they cite.
const questionsByRef = new Map();
for (const paper of weighting.papers ?? []) {
  for (const question of paper.questions ?? []) {
    for (const ref of question.refs ?? []) {
      if (!questionsByRef.has(ref)) questionsByRef.set(ref, []);
      questionsByRef.get(ref).push({
        paper: paper.paperId,
        question: question.q,
        marks: question.marks,
        aos: question.aos,
      });
    }
  }
}

/**
 * `pdftotext -layout` interleaves the specification's two columns, so the
 * "Key opportunities for skills development" text lands inside the content and
 * skill codes (MS 1b, WS 4.4) appear mid-sentence. That matters more here than
 * anywhere else in the pipeline: this text is what a model writes a resource
 * from, so noise becomes invented content.
 */
function cleanSpecText(text) {
  return text
    .replace(/^Content\s+/iu, '')
    .replace(/Key opportunities for(\s+skills development)?/giu, ' ')
    .replace(/\b(?:MS|WS|AT|PS)\s*\d+(?:\.\d+)?[a-z]?(?:\s*,\s*\d+(?:\.\d+)?[a-z]?)*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const selected = scheme.lessons.filter((l) => l.n >= from && l.n <= to);
if (selected.length === 0) {
  console.error(`no lessons in range ${from}-${to}`);
  process.exit(2);
}

const gate = new Gate('lesson briefs');
gate.assert('the range selects teachable lessons', selected.some((l) => l.type === 'teach'), `${selected.length} lesson(s) selected`);
gate.require();

await mkdir(outDir, { recursive: true });

const index = [];

for (const lesson of selected) {
  const points = lesson.points.map((id) => pointIndex.get(id)).filter(Boolean);
  if (lesson.points.length > 0 && points.length !== lesson.points.length) {
    const missing = lesson.points.filter((id) => !pointIndex.has(id));
    console.error(`lesson ${lesson.n}: ${missing.length} point(s) missing from the specification map: ${missing.join(', ')}`);
    process.exit(1);
  }

  const questions = points
    .flatMap((p) => (questionsByRef.get(p.id) ?? []).map((q) => ({ ...q, ref: p.id })))
    .filter((q, i, all) => all.findIndex((x) => x.paper === q.paper && x.question === q.question) === i);

  const brief = {
    lesson: lesson.n,
    week: lesson.week,
    type: lesson.type,
    unit: { id: lesson.unitId, title: lesson.unitTitle },
    topic: { id: lesson.topicId, title: lesson.topicTitle },
    marksAtStake: Math.round((lesson.marksAtStake ?? 0) * 10) / 10,
    points: points.map((p) => ({
      id: p.id,
      title: p.title,
      specificationText: cleanSpecText(p.content.join(' ')),
      synthesized: p.synthesized === true,
    })),
    examinedBy: questions,
  };

  const fileName = `lesson-${String(lesson.n).padStart(2, '0')}.md`;
  await writeFile(path.join(outDir, fileName), render(brief), 'utf8');
  index.push({ lesson: lesson.n, week: lesson.week, file: fileName, points: brief.points.length, marksAtStake: brief.marksAtStake });
}

await writeFile(path.join(outDir, 'index.json'), `${JSON.stringify({ range: { from, to }, lessons: index }, null, 2)}\n`, 'utf8');
console.log(`wrote ${index.length} brief(s) to ${outDir}/`);
for (const entry of index) {
  console.log(`  lesson ${String(entry.lesson).padStart(3)}  week ${String(entry.week).padStart(2)}  ${entry.points} point(s)  ${entry.marksAtStake} marks`);
}

function render(brief) {
  const lines = [];
  lines.push(`# Lesson ${brief.lesson} brief — ${brief.topic.title}`);
  lines.push('');
  lines.push(`> Generated from verified data. Every field below is traced to the specification or the mark schemes; nothing here is inferred.`);
  lines.push('');
  lines.push('| | |');
  lines.push('|---|---|');
  lines.push(`| Week | ${brief.week} |`);
  lines.push(`| Unit | ${brief.unit.id} ${brief.unit.title} |`);
  lines.push(`| Topic | ${brief.topic.id} ${brief.topic.title} |`);
  lines.push(`| Type | ${brief.type} |`);
  lines.push(`| Marks at stake | ${brief.marksAtStake} |`);
  lines.push('');
  lines.push('## Specification points this lesson must teach');
  lines.push('');
  for (const point of brief.points) {
    lines.push(`### ${point.id} — ${point.title}${point.synthesized ? ' _(topic-level content)_' : ''}`);
    lines.push('');
    lines.push(point.specificationText || '_(no specification text captured)_');
    lines.push('');
  }

  lines.push('## Examined by');
  lines.push('');
  if (brief.examinedBy.length === 0) {
    lines.push('No question in the mark schemes analysed cites these points. Absence is not permission to skip — it means the evidence is thin.');
  } else {
    lines.push('| Paper | Question | Marks | AO | Point |');
    lines.push('|---|---|---|---|---|');
    for (const q of brief.examinedBy) {
      lines.push(`| ${q.paper} | Q${q.question} | ${q.marks} | ${q.aos.join('/') || '—'} | ${q.ref} |`);
    }
  }
  lines.push('');
  lines.push('## What to produce');
  lines.push('');
  lines.push('Write a lesson resource containing, in this order:');
  lines.push('');
  lines.push('1. **Learning objectives** — one per specification point, using the point\'s own verb (state, explain, calculate, compare).');
  lines.push('2. **Do-now** — three retrieval questions on prior content, with answers.');
  lines.push('3. **Exposition** — the minimum explanation that makes the specification text intelligible, no invented content beyond it.');
  lines.push('4. **Worked example** — one fully worked question at the tier\'s level, with the mark scheme logic made explicit.');
  lines.push('5. **Practice** — four questions, increasing demand, with answers and mark allocations.');
  lines.push('6. **Differentiation** — one scaffold for a pupil who is stuck, one extension that does not go beyond the specification.');
  lines.push('7. **Homework** — one task that re-tests this lesson four weeks later (spacing), not the same night.');
  lines.push('');
  lines.push('End the resource with this table, completed for each point:');
  lines.push('');
  lines.push('| Specification point | Covered? | Where in the resource |');
  lines.push('|---|---|---|');
  for (const point of brief.points) lines.push(`| ${point.id} ${point.title} | | |`);
  lines.push('');
  return lines.join('\n');
}
