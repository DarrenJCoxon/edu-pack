#!/usr/bin/env node
/**
 * Validate a generated resource against its brief.
 *
 * Generation is the step where provenance can quietly disappear. A resource can
 * read beautifully and still omit a specification point, or carry a provenance
 * table with an empty "Covered?" column — which is the same as no provenance at
 * all, while looking like it.
 *
 * So the last gate is on the prose: every point in the brief must appear, the
 * provenance table must be filled in, and the required sections must exist. This
 * is cheap to run, so it can run on every resource in a batch.
 *
 * Usage:
 *   node check-resource.mjs --brief briefs/lesson-01.md --resource resources/lesson-01.md
 */

import { readFile } from 'node:fs/promises';

import { Gate } from '../../../packages/edu-verify/lib/index.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (!flag.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[flag.slice(2)] = true;
  else { args[flag.slice(2)] = next; i += 1; }
}

if (!args.brief || !args.resource) {
  console.error('usage: node check-resource.mjs --brief <brief.md> --resource <resource.md>');
  process.exit(2);
}

const brief = await readFile(args.brief, 'utf8');
const resource = await readFile(args.resource, 'utf8');

// Point ids are the headings in the brief: "### 4.1.1.1 — Title".
const pointIds = [...brief.matchAll(/^###\s+(\d+(?:\.\d+)+)\s+—/gmu)].map((m) => m[1]);

const gate = new Gate(`resource ${args.resource}`);

gate.assert('the brief names at least one specification point', pointIds.length > 0, `${pointIds.length} point(s)`);

// 1. Every point appears somewhere in the resource.
const missing = pointIds.filter((id) => !resource.includes(id));
gate.assert('every specification point appears in the resource', missing.length === 0,
  missing.length === 0 ? `${pointIds.length}/${pointIds.length} present` : `missing: ${missing.join(', ')}`);

// 2. Required sections. Matched loosely so numbering and wording may vary.
const SECTIONS = [
  ['learning objectives', /learning objective/iu],
  ['do-now', /do[- ]?now/iu],
  ['exposition', /exposition|explanation/iu],
  ['worked example', /worked example/iu],
  ['practice', /practice/iu],
  ['differentiation', /differentiat/iu],
  ['homework', /homework/iu],
  ['provenance table', /provenance/iu],
];
for (const [name, pattern] of SECTIONS) {
  gate.assert(`has a ${name} section`, pattern.test(resource), pattern.test(resource) ? 'present' : 'absent');
}

// 3. The provenance table must be filled in, not just present.
const tableRows = [...resource.matchAll(/^\|\s*(\d+(?:\.\d+)+)[^|]*\|([^|]*)\|([^|]*)\|/gmu)];
if (tableRows.length === 0) {
  gate.assert('the provenance table has a row per point', false, 'no rows matched "| point | covered? | where |"');
} else {
  const emptyCovered = tableRows.filter(([, , covered]) => covered.trim() === '').map(([, id]) => id);
  gate.assert('every provenance row states whether the point is covered', emptyCovered.length === 0,
    emptyCovered.length === 0 ? `${tableRows.length} row(s) complete` : `blank for: ${emptyCovered.join(', ')}`);
  gate.assert('the provenance table covers every point in the brief', tableRows.length >= pointIds.length,
    `${tableRows.length} row(s) for ${pointIds.length} point(s)`);
}

// 4. Volume sanity — a "resource" of 80 words is a stub.
const words = resource.split(/\s+/u).filter(Boolean).length;
gate.assert('the resource is substantial enough to teach from', words >= 350, `${words} words`);

const passed = gate.passed;
console.log(gate.report());
process.exitCode = passed ? 0 : 1;
