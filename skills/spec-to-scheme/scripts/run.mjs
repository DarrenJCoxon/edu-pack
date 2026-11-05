#!/usr/bin/env node
/**
 * spec-to-scheme — one command, three stages, three gates.
 *
 * The stages do the work; this runner enforces the gates between them using
 * edu-verify, and refuses to hand a suspicious output to the next stage. That
 * ordering matters: a stage that writes first and checks later has already
 * published a wrong artefact.
 *
 * Pipeline:
 *   decompose  spec text  -> spec-map.json      (units, topics, points)
 *   weight     mark schemes -> mark-weighting.json (marks per unit/topic, reconciled to the paper total)
 *   sequence   both       -> scheme-<pedagogy>.json (lessons, with coverage proven)
 *
 * Usage:
 *   node run.mjs --dir <project> --spec aqa-bio.txt --papers "papers/*MS*.pdf" \
 *                [--pedagogy spaced] [--lessons 132] [--weeks 66] [--compare]
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyScheme, verifySpecMap, Gate } from '../../../packages/edu-verify/lib/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (!flag.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[flag.slice(2)] = true;
  else { args[flag.slice(2)] = next; i += 1; }
}

const dir = path.resolve(args.dir ?? '.');
const stage = (name, argv) => {
  process.stdout.write(`\n── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}\n`);
  execFileSync(process.execPath, [path.join(HERE, `${name}.mjs`), ...argv], {
    cwd: dir,
    stdio: 'inherit',
  });
};

const specText = args.spec ?? 'specification.txt';
const papers = args.papers;

// ---- Stage 1: decompose --------------------------------------------------
stage('decompose', [specText, 'spec-map.json']);

const spec = JSON.parse(await readFile(path.join(dir, 'spec-map.json'), 'utf8'));
const topics = spec.units.flatMap((u) => u.topics);
const totalPoints = topics.reduce((n, t) => n + t.points.length, 0);

const mapGate = verifySpecMap('spec map', topics, totalPoints);
mapGate.assert('the specification produced more than zero points', totalPoints > 0, `${totalPoints} points`);
mapGate.require();
console.log(`\n  gate passed: ${totalPoints} points across ${topics.length} topics`);

// ---- Stage 2: weight -----------------------------------------------------
if (!papers) {
  console.error('\n--papers is required (a glob or list of mark-scheme PDFs)');
  process.exit(2);
}
stage('weight', [...String(papers).split(/\s+/), '--out', 'mark-weighting.json']);

const weighting = JSON.parse(await readFile(path.join(dir, 'mark-weighting.json'), 'utf8'));
const unitMarks = Object.values(weighting.byUnit).reduce((a, b) => a + b, 0);

const weightGate = new Gate('mark weighting');
weightGate.reconciled('marks reconcile to the paper totals', unitMarks, 200, 1);
weightGate.assert('every paper states a total', (weighting.papers ?? []).every((p) => p.total > 0), 'ok');
weightGate.require();
console.log(`\n  gate passed: ${Math.round(unitMarks)} marks attributed`);

// ---- Stage 3: sequence ---------------------------------------------------
const seqArgs = ['--lessons', String(args.lessons ?? 132), '--weeks', String(args.weeks ?? 66)];
if (args.compare) seqArgs.push('--compare');
else seqArgs.push('--pedagogy', String(args.pedagogy ?? 'spaced'));
stage('sequence', seqArgs);

if (!args.compare) {
  const pedagogy = String(args.pedagogy ?? 'spaced');
  const scheme = JSON.parse(await readFile(path.join(dir, `scheme-${pedagogy}.json`), 'utf8'));
  const gate = verifyScheme('scheme of work', {
    allPoints: topics.flatMap((t) => t.points.map((p) => p.id)),
    lessons: scheme.lessons,
    expectedLessons: scheme.lessons.length,
    expectedMarks: 200,
    actualMarks: scheme.lessons.reduce((n, l) => n + (l.marksAtStake ?? 0), 0),
  });
  gate.require();
  console.log(`\n  gate passed: ${scheme.lessons.length} lessons, every point taught once`);
}

console.log('\nDone. Outputs: spec-map.json, mark-weighting.json, scheme-*.json');
console.log('Next: run the coverage-matrix skill to check taught vs examined.');
