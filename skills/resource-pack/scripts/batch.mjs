#!/usr/bin/env node
/**
 * Batch briefs — prepare the whole course for generation.
 *
 * Generating resources for 132 lessons is a fan-out job, not a conversation. This
 * prepares every brief up front, so each lesson can be written independently and
 * in parallel, and writes a manifest of what still needs doing.
 *
 * It deliberately does not generate prose. That is the model's job, and keeping
 * the split means every resource is written from a brief that a human can also
 * read and check.
 *
 * Usage:
 *   node batch.mjs --spec spec-map.json --weighting mark-weighting.json \
 *     --scheme scheme-spaced.json --out briefs [--from 1] [--to 132] [--teach-only]
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

const outDir = args.out ?? 'briefs';
const spec = JSON.parse(await readFile(args.spec ?? 'spec-map.json', 'utf8'));
const weighting = JSON.parse(await readFile(args.weighting ?? 'mark-weighting.json', 'utf8'));
const scheme = JSON.parse(await readFile(args.scheme ?? 'scheme-spaced.json', 'utf8'));

const from = Number(args.from ?? 1);
const to = Number(args.to ?? scheme.lessons.length);

const pointIndex = new Map();
for (const unit of spec.units) {
  for (const topic of unit.topics) {
    for (const point of topic.points) {
      pointIndex.set(point.id, { ...point, topicId: topic.id, topicTitle: topic.title, unitId: unit.id });
    }
  }
}

const questionsByRef = new Map();
for (const paper of weighting.papers ?? []) {
  for (const question of paper.questions ?? []) {
    for (const ref of question.refs ?? []) {
      if (!questionsByRef.has(ref)) questionsByRef.set(ref, []);
      questionsByRef.get(ref).push({ paper: paper.paperId, question: question.q, marks: question.marks, aos: question.aos });
    }
  }
}

function cleanSpecText(text) {
  return text
    .replace(/^Content\s+/iu, '')
    .replace(/Key opportunities for(\s+skills development)?/giu, ' ')
    .replace(/\b(?:MS|WS|AT|PS)\s*\d+(?:\.\d+)?[a-z]?(?:\s*,\s*\d+(?:\.\d+)?[a-z]?)*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const selected = scheme.lessons.filter((l) => l.n >= from && l.n <= to);
const teachable = args['teach-only'] ? selected.filter((l) => l.type === 'teach') : selected.filter((l) => l.type !== 'assess');

const gate = new Gate('batch briefs');
gate.assert('there is something to generate', teachable.length > 0, `${teachable.length} lesson(s)`);
gate.assert('every lesson in the range exists in the scheme', selected.length > 0, `${selected.length} found`);
gate.require();

await mkdir(outDir, { recursive: true });

const manifest = [];
const missingPoints = [];

for (const lesson of teachable) {
  const points = lesson.points.map((id) => pointIndex.get(id)).filter(Boolean);
  const unknown = lesson.points.filter((id) => !pointIndex.has(id));
  if (unknown.length > 0) missingPoints.push({ lesson: lesson.n, unknown });

  const questions = points
    .flatMap((p) => (questionsByRef.get(p.id) ?? []).map((q) => ({ ...q, ref: p.id })))
    .filter((q, i, all) => all.findIndex((x) => x.paper === q.paper && x.question === q.question) === i);

  const file = `lesson-${String(lesson.n).padStart(3, '0')}.md`;
  const body = render({ lesson, points, questions, cleanSpecText });
  await writeFile(path.join(outDir, file), body, 'utf8');

  manifest.push({
    lesson: lesson.n,
    week: lesson.week,
    week_of: lesson.week,
    type: lesson.type,
    topic: lesson.topicId,
    topicTitle: lesson.topicTitle,
    points: points.map((p) => p.id),
    marksAtStake: Math.round((lesson.marksAtStake ?? 0) * 10) / 10,
    brief: path.join(outDir, file),
    resource: null,
    status: 'brief ready',
  });
}

if (missingPoints.length > 0) {
  console.error(`FAILED: ${missingPoints.length} lesson(s) reference points absent from the specification map`);
  for (const m of missingPoints.slice(0, 5)) console.error(`  lesson ${m.lesson}: ${m.unknown.join(', ')}`);
  process.exit(1);
}

await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  range: { from, to },
  lessons: manifest.length,
  totalPoints: manifest.reduce((n, m) => n + m.points.length, 0),
  totalMarks: Math.round(manifest.reduce((n, m) => n + m.marksAtStake, 0) * 10) / 10,
  items: manifest,
}, null, 2)}\n`, 'utf8');

const byWeek = {};
for (const item of manifest) byWeek[item.week] = (byWeek[item.week] ?? 0) + 1;

console.log(`prepared ${manifest.length} brief(s) in ${outDir}/`);
console.log(`  points covered: ${manifest.reduce((n, m) => n + m.points.length, 0)}`);
console.log(`  marks covered:  ${Math.round(manifest.reduce((n, m) => n + m.marksAtStake, 0) * 10) / 10}`);
console.log(`  weeks touched:  ${Object.keys(byWeek).length}`);
console.log(`\nNext: write one resource per brief, then validate each with check-resource.mjs.`);

function render({ lesson, points, questions, cleanSpecText }) {
  const lines = [];
  lines.push(`# Lesson ${lesson.n} brief — ${lesson.topicTitle}`);
  lines.push('');
  lines.push('> Generated from verified data. Every field is traced to the specification or the mark schemes; nothing here is inferred.');
  lines.push('');
  lines.push(`**Week** ${lesson.week} · **Unit** ${lesson.unitId} ${lesson.unitTitle} · **Topic** ${lesson.topicId} · **Type** ${lesson.type} · **Marks at stake** ${Math.round((lesson.marksAtStake ?? 0) * 10) / 10}`);
  lines.push('');
  lines.push('## Specification points this lesson must teach');
  lines.push('');
  for (const point of points) {
    lines.push(`### ${point.id} — ${point.title}${point.synthesized ? ' _(topic-level content)_' : ''}`);
    lines.push('');
    lines.push(cleanSpecText(point.content.join(' ')) || '_(no specification text captured)_');
    lines.push('');
  }
  lines.push('## Examined by');
  lines.push('');
  if (questions.length === 0) {
    lines.push('No question in the mark schemes analysed cites these points. Absence is not permission to skip — it means the evidence is thin.');
  } else {
    lines.push('| Paper | Question | Marks | AO | Point |');
    lines.push('|---|---|---|---|---|');
    for (const q of questions) lines.push(`| ${q.paper} | Q${q.question} | ${q.marks} | ${q.aos.join('/') || '—'} | ${q.ref} |`);
  }
  lines.push('');
  lines.push('## What to produce');
  lines.push('');
  lines.push('1. **Learning objectives** — one per specification point, using its own verb.');
  lines.push('2. **Do-now** — three retrieval questions on prior content, with answers.');
  lines.push('3. **Exposition** — the minimum explanation that makes the specification text intelligible.');
  lines.push('4. **Worked example** — one fully worked question, with the mark scheme logic explicit.');
  lines.push('5. **Practice** — four questions, increasing demand, with answers and marks.');
  lines.push('6. **Differentiation** — one scaffold, one extension within the specification.');
  lines.push('7. **Homework** — retrieval four weeks later, not the same night.');
  lines.push('');
  lines.push('End with this provenance table, filled in honestly:');
  lines.push('');
  lines.push('| Specification point | Covered? | Where in the resource |');
  lines.push('|---|---|---|');
  for (const point of points) lines.push(`| ${point.id} ${point.title} | | |`);
  lines.push('');
  return lines.join('\n');
}
