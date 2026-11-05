#!/usr/bin/env node
/**
 * Stage 1 — specification decomposition.
 *
 * Turns an AQA specification (pdftotext -layout output) into a structured map:
 * units -> topics -> specification points, each with its own text. Everything
 * downstream (mark weighting, sequencing, coverage matrix) reads this file, so a
 * mistake here is inherited by everything else — which is why the parser reports
 * what it dropped rather than silently discarding it.
 *
 * Usage: node build-spec-map.mjs aqa-bio.txt spec-map.json
 */

import { readFile, writeFile } from 'node:fs/promises';

const [, , sourcePath, outPath] = process.argv;
if (!sourcePath || !outPath) {
  console.error('usage: node build-spec-map.mjs <spec.txt> <out.json>');
  process.exit(2);
}

const raw = await readFile(sourcePath, 'utf8');

// pdftotext emits form feeds between pages, and -layout pads with long runs of
// spaces. Both get in the way of heading detection.
const lines = raw
  .replace(/\f/g, '\n')
  .replace(/\u00a0/g, ' ')
  .split('\n')
  .map((line) => line.replace(/\s+$/u, ''));

const isTocLine = (line) => /\.{3,}\s*\d+\s*$/u.test(line) || /\s{25,}\d{1,3}\s*$/u.test(line);
const isNoise = (line) => (
  /^GCSE Biology \(8461\)/iu.test(line.trim())
  || /^Visit aqa\.org\.uk/iu.test(line.trim())
  || /^\d+\s*$/u.test(line.trim())
  || /^AQA Education/iu.test(line.trim())
);

const unitRe = /^\s*(4\.[1-8])\s{1,12}([A-Z][A-Za-z ,&()/-]+?)\s*$/u;
const topicRe = /^\s*(4\.[1-8]\.\d{1,2})\s{1,12}([A-Z][A-Za-z ,&()'/-]+?)\s*$/u;
const pointRe = /^\s*(4\.[1-8]\.\d{1,2}\.\d{1,2})\s{1,12}([A-Za-z][A-Za-z ,&()'/:;-]+?)\s*$/u;

const units = [];
let unit = null;
let topic = null;
let point = null;
let body = false;
let skippedHeadings = [];

for (const line of lines) {
  if (!body) {
    // The body begins where the first unit heading appears without TOC padding.
    if (unitRe.test(line) && !isTocLine(line)) body = true;
    else continue;
  }
  if (/^\s*5\s+Scheme of assessment\s*$/u.test(line)) break;
  if (isNoise(line)) continue;

  const asPoint = line.match(pointRe);
  if (asPoint && !isTocLine(line)) {
    if (topic && unit) {
      point = { id: asPoint[1], title: asPoint[2], content: [] };
      topic.points.push(point);
    } else {
      skippedHeadings.push(line.trim());
    }
    continue;
  }

  const asTopic = line.match(topicRe);
  if (asTopic && !isTocLine(line)) {
    if (unit) {
      topic = { id: asTopic[1], title: asTopic[2], points: [], intro: [] };
      unit.topics.push(topic);
      point = null;
    } else {
      skippedHeadings.push(line.trim());
    }
    continue;
  }

  const asUnit = line.match(unitRe);
  if (asUnit && !isTocLine(line)) {
    unit = { id: asUnit[1], title: asUnit[2], topics: [] };
    units.push(unit);
    topic = null;
    point = null;
    continue;
  }

  if (line.trim().length === 0) continue;
  if (point) point.content.push(line.trim());
  else if (topic) topic.intro.push(line.trim());
}

// Some topics carry their content directly, with no numbered sub-points (AQA does
// this for short topics such as "Principles of organisation"). Dropping that
// content would leave a topic with zero specification points and silently remove
// it from coverage checking, so synthesise a single point for it.
for (const u of units) {
  for (const t of u.topics) {
    if (t.points.length === 0 && (t.intro?.length ?? 0) > 0) {
      t.points.push({ id: t.id, title: t.title, content: t.intro, synthesized: true });
    }
    delete t.intro;
  }
}

// Clean column headers that -layout interleaves into the content blocks.
const COLUMN_NOISE = /^(Content|Key opportunities for(\s+skills development)?|skills development)$/iu;
for (const u of units) {
  for (const t of u.topics) {
    for (const p of t.points) {
      p.content = p.content.filter((l) => !COLUMN_NOISE.test(l));
      p.words = p.content.join(' ').split(/\s+/u).filter(Boolean).length;
    }
  }
}

const PAPER_BY_UNIT = { '4.1': 1, '4.2': 1, '4.3': 1, '4.4': 1, '4.5': 2, '4.6': 2, '4.7': 2, '4.8': null };
for (const u of units) u.paper = PAPER_BY_UNIT[u.id] ?? null;

const totalPoints = units.reduce((n, u) => n + u.topics.reduce((m, t) => m + t.points.length, 0), 0);

const map = {
  specification: 'AQA GCSE Biology (8461)',
  source: sourcePath,
  parsed: {
    units: units.length,
    topics: units.reduce((n, u) => n + u.topics.length, 0),
    points: totalPoints,
    words: units.reduce((n, u) => n + u.topics.reduce((m, t) => m + t.points.reduce((k, p) => k + (p.words ?? 0), 0), 0), 0),
    skippedHeadings,
  },
  units,
};

await writeFile(outPath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');

console.log(`units ${map.parsed.units} | topics ${map.parsed.topics} | points ${map.parsed.points} | words ${map.parsed.words}`);
if (skippedHeadings.length > 0) {
  console.log(`skipped ${skippedHeadings.length} heading(s) with no parent:`);
  for (const h of skippedHeadings.slice(0, 5)) console.log(`  ${h}`);
}
console.log('\nunit                                          paper  topics  points');
for (const u of units) {
  const points = u.topics.reduce((m, t) => m + t.points.length, 0);
  console.log(`${u.id} ${u.title.padEnd(42).slice(0, 42)} ${String(u.paper ?? '-').padEnd(6)} ${String(u.topics.length).padEnd(7)} ${points}`);
}
