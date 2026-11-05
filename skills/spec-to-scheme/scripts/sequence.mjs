#!/usr/bin/env node
/**
 * Stage 3 — sequencing, with an explicit pedagogical model.
 *
 * A scheme of work is a pedagogical argument, not an arithmetic result. So the
 * structure is a parameter, not a default:
 *
 *   blocked     topic by topic, practice at the end of each block (the baseline
 *               most departments write by hand)
 *   interleaved practice mixed across topics within a unit, so questions don't
 *               arrive in predictable runs
 *   spaced      retrieval episodes at expanding intervals after teaching
 *   spiral      three passes over the whole course, weighted toward first
 *               exposure, then application, then analysis
 *
 * What the tool adds is not the ordering — a department can order lessons. It is
 * that the choice is explicit, and that each structure is *measured* (coverage,
 * retrieval gaps, topic switching) so the debate is about evidence rather than
 * taste.
 *
 * Usage:
 *   node build-sequence.mjs --pedagogy spaced --lessons 132 --weeks 66
 *   node build-sequence.mjs --compare
 */

import { readFile, writeFile } from 'node:fs/promises';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const flag = process.argv[i];
  if (!flag.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[flag.slice(2)] = true;
  else { args[flag.slice(2)] = next; i += 1; }
}

const TOTAL_LESSONS = Number(args.lessons ?? 132);
const WEEKS = Number(args.weeks ?? 66);
const ASSESSMENT_SHARE = Number(args['assessment-share'] ?? 0.1);
const LESSONS_PER_WEEK = TOTAL_LESSONS / WEEKS;
const STRATEGIES = ['blocked', 'interleaved', 'spaced', 'spiral'];
const RECONCILED_TOTAL = 200;

const spec = JSON.parse(await readFile('spec-map.json', 'utf8'));
const weighting = JSON.parse(await readFile('mark-weighting.json', 'utf8'));

const parsedMarks = Object.values(weighting.byUnit).reduce((a, b) => a + b, 0);
if (Math.abs(parsedMarks - RECONCILED_TOTAL) > 1) {
  console.error(`Refusing to sequence: mark weighting totals ${parsedMarks}, expected ${RECONCILED_TOTAL}.`);
  process.exit(1);
}

// ---- Topic allocation (identical across strategies) -----------------------
const topics = [];
for (const unit of spec.units) {
  if (unit.topics.length === 0) continue;
  const unitMarks = weighting.byUnit[unit.id] ?? 0;
  const known = unit.topics.reduce((n, t) => n + (weighting.byTopic[t.id] ?? 0), 0);
  const uncited = unit.topics.filter((t) => weighting.byTopic[t.id] === undefined);
  const residual = Math.max(0, unitMarks - known);
  for (const topic of unit.topics) {
    topics.push({
      unitId: unit.id,
      unitTitle: unit.title,
      id: topic.id,
      title: topic.title,
      points: topic.points.map((p) => p.id),
      marks: weighting.byTopic[topic.id] ?? (uncited.length > 0 ? residual / uncited.length : 0),
      lessons: 0,
    });
  }
}
{
  // Stage 2 computed unit and topic attribution independently, so their sums
  // drift slightly. Normalise to the reconciled total.
  const rawTotal = topics.reduce((n, t) => n + t.marks, 0);
  for (const t of topics) t.marks *= RECONCILED_TOTAL / rawTotal;
}

const teachable = Math.max(24, Math.round(TOTAL_LESSONS * (1 - ASSESSMENT_SHARE)));
const assessmentLessons = TOTAL_LESSONS - teachable;

const totalMarks = topics.reduce((n, t) => n + t.marks, 0);
const raw = topics.map((t) => (t.marks / totalMarks) * teachable);
const alloc = raw.map((v) => Math.max(1, Math.floor(v)));
let sum = alloc.reduce((a, b) => a + b, 0);
const order2 = raw.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem);
let k = 0;
while (sum < teachable) { alloc[order2[k % order2.length].i] += 1; sum += 1; k += 1; }
k = order2.length - 1;
while (sum > teachable && k > -order2.length * 4) {
  const i = order2[((k % order2.length) + order2.length) % order2.length].i;
  if (alloc[i] > 1) { alloc[i] -= 1; sum -= 1; }
  k -= 1;
}
topics.forEach((t, i) => { t.lessons = alloc[i]; });

// ---- Each topic becomes a teach stream and a retrieval stream -------------
for (const topic of topics) {
  const P = topic.points.length;
  const L = topic.lessons;
  const teaches = [];
  if (P >= L) {
    for (let n = 0; n < L; n += 1) {
      teaches.push(topic.points.slice(Math.floor((n * P) / L), Math.floor(((n + 1) * P) / L)));
    }
  } else {
    for (let n = 0; n < P; n += 1) teaches.push([topic.points[n]]);
  }
  topic.teachItems = teaches.map((points) => ({ topic, kind: 'teach', points }));
  topic.retrievalItems = Array.from({ length: Math.max(0, L - teaches.length) }, () => ({ topic, kind: 'retrieval', points: [] }));
}

const perLessonMarks = (topic) => topic.marks / topic.lessons;

/** Round-robin across a set of arrays, preserving relative order within each. */
function roundRobin(lists) {
  const out = [];
  const cursors = lists.map(() => 0);
  let progress = true;
  while (progress) {
    progress = false;
    lists.forEach((list, i) => {
      if (cursors[i] < list.length) { out.push(list[cursors[i]]); cursors[i] += 1; progress = true; }
    });
  }
  return out;
}

// ---- Ordering per strategy ------------------------------------------------
function order(strategy) {
  const byUnit = {};
  for (const t of topics) (byUnit[t.unitId] ??= []).push(t);
  const unitIds = Object.keys(byUnit);

  if (strategy === 'blocked') {
    return topics.flatMap((t) => [...t.teachItems, ...t.retrievalItems]);
  }

  if (strategy === 'interleaved') {
    const out = [];
    for (const unitId of unitIds) {
      const unitTopics = byUnit[unitId];
      out.push(...roundRobin(unitTopics.map((t) => t.teachItems)));
      out.push(...roundRobin(unitTopics.map((t) => t.retrievalItems)));
    }
    return out;
  }

  if (strategy === 'spaced') {
    const teaches = topics.flatMap((t) => t.teachItems);
    const lastTeach = new Map();
    teaches.forEach((item, i) => lastTeach.set(item.topic.id, i));

    const dues = [];
    for (const t of topics) {
      const end = lastTeach.get(t.id) ?? 0;
      t.retrievalItems.forEach((item, k2) => {
        // Expanding intervals: 2, 4, 8, 16 lessons after the teaching ends.
        dues.push({ item, due: end + Math.min(teaches.length, 2 ** (k2 + 1)) });
      });
    }
    dues.sort((a, b) => a.due - b.due);

    const out = [];
    let emitted = 0;
    let ti = 0;
    while (ti < teaches.length || dues.length > 0) {
      while (dues.length > 0 && dues[0].due <= emitted) out.push(dues.shift().item);
      if (ti < teaches.length) { out.push(teaches[ti]); ti += 1; emitted += 1; }
      else if (dues.length > 0) out.push(dues.shift().item);
    }
    return out;
  }

  // spiral: first exposure -> application -> analysis
  const SHARES = [0.6, 0.25, 0.15];
  const out = [];
  const taken = new Map(topics.map((t) => [t.id, 0]));
  for (const share of SHARES) {
    for (const unitId of unitIds) {
      for (const t of byUnit[unitId]) {
        const from = taken.get(t.id);
        const to = Math.min(t.teachItems.length, from + Math.ceil(t.teachItems.length * share));
        out.push(...t.teachItems.slice(from, to));
        taken.set(t.id, to);
      }
    }
  }
  for (const t of topics) {
    const from = taken.get(t.id);
    if (from < t.teachItems.length) out.push(...t.teachItems.slice(from));
  }
  out.push(...roundRobin(topics.map((t) => t.retrievalItems)));
  return out;
}

// ---- Assemble, insert assessment, verify, measure ------------------------
function build(strategy) {
  const items = order(strategy);
  const lessons = items.map((item) => ({
    type: item.kind,
    unitId: item.topic.unitId,
    unitTitle: item.topic.unitTitle,
    topicId: item.topic.id,
    topicTitle: item.topic.title,
    points: item.points,
    marksAtStake: perLessonMarks(item.topic),
  }));

  const unitIds = [...new Set(lessons.map((l) => l.unitId))];
  const perUnit = Math.floor(assessmentLessons / unitIds.length);
  for (const unitId of unitIds) {
    let last = -1;
    lessons.forEach((l, i) => { if (l.unitId === unitId) last = i; });
    if (last === -1) continue;
    for (let n = 0; n < perUnit; n += 1) {
      lessons.splice(last + 1 + n, 0, {
        type: 'assess', unitId, unitTitle: lessons[last].unitTitle, topicId: null,
        topicTitle: `${lessons[last].unitTitle} — assessment and feedback`, points: [], marksAtStake: 0,
      });
    }
  }
  while (lessons.length < TOTAL_LESSONS) {
    lessons.push({ type: 'retrieve', unitId: null, unitTitle: 'Consolidation', topicId: null, topicTitle: 'Cumulative retrieval and exam technique', points: [], marksAtStake: 0 });
  }
  lessons.length = TOTAL_LESSONS;

  lessons.forEach((l, i) => { l.n = i + 1; l.week = Math.floor(i / LESSONS_PER_WEEK) + 1; });

  const all = topics.flatMap((t) => t.points);
  const counts = new Map();
  for (const l of lessons) for (const p of l.points) counts.set(p, (counts.get(p) ?? 0) + 1);

  const firstWeek = new Map();
  for (const l of lessons) for (const p of l.points) if (!firstWeek.has(p)) firstWeek.set(p, l.week);

  const gaps = [];
  for (const l of lessons) {
    if (l.type !== 'retrieval' || l.topicId === null) continue;
    const topic = topics.find((t) => t.id === l.topicId);
    const first = Math.min(...topic.points.map((p) => firstWeek.get(p) ?? l.week));
    gaps.push(l.week - first);
  }

  let switches = 0;
  for (let i = 1; i < lessons.length; i += 1) if (lessons[i].topicId !== lessons[i - 1].topicId) switches += 1;

  return {
    strategy,
    lessons,
    metrics: {
      lessons: lessons.length,
      specPoints: all.length,
      covered: counts.size,
      uncovered: all.filter((p) => !counts.has(p)),
      duplicated: [...counts.entries()].filter(([, c]) => c > 1).map(([p]) => p),
      marks: Math.round(lessons.reduce((n, l) => n + l.marksAtStake, 0) * 10) / 10,
      topicSwitchRate: Math.round((switches / (lessons.length - 1)) * 1000) / 10,
      meanRetrievalGapWeeks: gaps.length > 0 ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
      topicsInFirst8Weeks: new Set(lessons.filter((l) => l.week <= 8 && l.topicId).map((l) => l.topicId)).size,
      retrievalLessons: lessons.filter((l) => l.type === 'retrieval').length,
    },
  };
}

// ---- Drive ---------------------------------------------------------------
if (args.compare) {
  const rows = STRATEGIES.map((s) => build(s));
  console.log(`same content, same marks, four pedagogies — ${TOTAL_LESSONS} lessons over ${WEEKS} weeks\n`);
  console.log(`${'strategy'.padEnd(13)}${'covered'.padStart(9)}${'marks'.padStart(8)}${'dupes'.padStart(7)}${'retrieval'.padStart(11)}${'gap(wk)'.padStart(9)}${'switches'.padStart(10)}${'topics<8wk'.padStart(12)}`);
  for (const r of rows) {
    const m = r.metrics;
    console.log(`${r.strategy.padEnd(13)}${`${m.covered}/${m.specPoints}`.padStart(9)}${String(m.marks).padStart(8)}${String(m.duplicated.length).padStart(7)}${String(m.retrievalLessons).padStart(11)}${String(m.meanRetrievalGapWeeks ?? '-').padStart(9)}${`${m.topicSwitchRate}%`.padStart(10)}${String(m.topicsInFirst8Weeks).padStart(12)}`);
  }
  const bad = rows.filter((r) => r.metrics.covered !== r.metrics.specPoints
    || r.metrics.duplicated.length > 0
    || Math.abs(r.metrics.marks - RECONCILED_TOTAL) > 0.5);
  if (bad.length > 0) {
    console.log(`\nFAILED verification: ${bad.map((r) => r.strategy).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nall four verify: full coverage, no duplicates, 200 marks');
  }
} else {
  const strategy = args.pedagogy ?? 'spaced';
  if (!STRATEGIES.includes(strategy)) {
    console.error(`unknown pedagogy "${strategy}"; choose one of ${STRATEGIES.join(', ')}`);
    process.exit(2);
  }
  const result = build(strategy);
  await writeFile(`scheme-${strategy}.json`, `${JSON.stringify({
    parameters: { lessons: TOTAL_LESSONS, weeks: WEEKS, pedagogy: strategy },
    ...result,
  }, null, 2)}\n`, 'utf8');

  console.log(`pedagogy: ${strategy} | ${TOTAL_LESSONS} lessons over ${WEEKS} weeks, ${assessmentLessons} for assessment`);
  console.log(`verification: ${result.metrics.covered}/${result.metrics.specPoints} points, ${result.metrics.duplicated.length} duplicates, ${result.metrics.marks} marks`);
  console.log(`retrieval lessons: ${result.metrics.retrievalLessons}, mean gap ${result.metrics.meanRetrievalGapWeeks ?? '-'} weeks, topic switch rate ${result.metrics.topicSwitchRate}%`);
  console.log('\nfirst 10 lessons:');
  for (const l of result.lessons.slice(0, 10)) {
    console.log(`  w${String(l.week).padStart(2)} [${l.type.padEnd(9)}] ${l.topicTitle.slice(0, 46).padEnd(46)} ${l.points.length} pt`);
  }
}
