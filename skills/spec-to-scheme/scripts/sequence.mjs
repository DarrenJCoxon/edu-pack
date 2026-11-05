#!/usr/bin/env node
/**
 * Stage 3 — sequencing, with an explicit pedagogical model.
 *
 * A scheme of work is a pedagogical argument, not an arithmetic result, so the
 * structure is a parameter:
 *
 *   blocked     topic by topic; consolidation sits inside each block
 *   interleaved topics round-robin within a unit, with cumulative retrieval
 *   spaced      topics in order, retrieval later and at widening intervals
 *   spiral      three passes over the course, first exposure -> application -> analysis
 *
 * Retrieval is a *course-level pool*, not leftover lessons.
 *
 * The first version derived retrieval from surplus lessons inside a topic, so a
 * topic allocated fewer lessons than it had specification points received none —
 * 15 of 24 topics in a real run. The mean gap then looked healthy because it
 * averaged only over the topics that happened to have retrieval. That is a
 * measurement lying through its denominator.
 *
 * Now the pool is allocated up front, each episode covers two topics chosen
 * least-recently-seen, and the metrics report how many topics were actually
 * revisited and the spread of gaps — including the worst one.
 *
 * Usage:
 *   node sequence.mjs --pedagogy spaced --lessons 132 --weeks 66
 *   node sequence.mjs --compare
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
const TOPICS_PER_RETRIEVAL = 2;

const spec = JSON.parse(await readFile('spec-map.json', 'utf8'));
const weighting = JSON.parse(await readFile('mark-weighting.json', 'utf8'));

const parsedMarks = Object.values(weighting.byUnit).reduce((a, b) => a + b, 0);
if (Math.abs(parsedMarks - RECONCILED_TOTAL) > 1) {
  console.error(`Refusing to sequence: mark weighting totals ${parsedMarks}, expected ${RECONCILED_TOTAL}.`);
  process.exit(1);
}

// ---- Topics and their marks ----------------------------------------------
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
      slots: 0,
    });
  }
}
{
  const rawTotal = topics.reduce((n, t) => n + t.marks, 0);
  for (const t of topics) t.marks *= RECONCILED_TOTAL / rawTotal;
}

const teachable = Math.max(24, Math.round(TOTAL_LESSONS * (1 - ASSESSMENT_SHARE)));
const assessmentLessons = TOTAL_LESSONS - teachable;

/** Largest-remainder allocation of `budget` across `weights`. */
function allocate(budget, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / total) * budget);
  const out = raw.map((v) => Math.max(1, Math.floor(v)));
  let sum = out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem);
  let k = 0;
  while (sum < budget) { out[order[k % order.length].i] += 1; sum += 1; k += 1; }
  k = order.length - 1;
  while (sum > budget && k > -order.length * 4) {
    const i = order[((k % order.length) + order.length) % order.length].i;
    if (out[i] > 1) { out[i] -= 1; sum -= 1; }
    k -= 1;
  }
  return out;
}

// ---- Lesson budget: teaching slots plus a retrieval pool -----------------
function budgetFor(strategy) {
  // "blocked" puts consolidation inside each topic block, so it takes no pool.
  const share = strategy === 'blocked' ? 0 : Number(args['retrieval-share'] ?? 0.15);
  const pool = share === 0 ? 0 : Math.max(topics.length, Math.round(teachable * share));
  return { teaching: teachable - pool, pool };
}

/** One teach item per point group for a topic with `slots` lessons. */
function teachItemsFor(topic, slots) {
  const P = topic.points.length;
  const items = [];
  if (slots >= P) {
    for (let n = 0; n < P; n += 1) items.push({ topic, kind: 'teach', points: [topic.points[n]] });
    for (let n = P; n < slots; n += 1) items.push({ topic, kind: 'practice', points: [] });
  } else {
    for (let n = 0; n < slots; n += 1) {
      const from = Math.floor((n * P) / slots);
      const to = Math.floor(((n + 1) * P) / slots);
      items.push({ topic, kind: 'teach', points: topic.points.slice(from, to) });
    }
  }
  return items;
}

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

// ---- Ordering ------------------------------------------------------------
function buildTeachingStream(strategy, slotsById) {
  const byUnit = {};
  for (const t of topics) {
    t.items = teachItemsFor(t, slotsById.get(t.id));
    (byUnit[t.unitId] ??= []).push(t);
  }
  const unitIds = Object.keys(byUnit);

  if (strategy === 'interleaved') {
    const out = [];
    for (const unitId of unitIds) out.push(...roundRobin(byUnit[unitId].map((t) => t.items)));
    return out;
  }

  if (strategy === 'spiral') {
    const SHARES = [0.6, 0.25, 0.15];
    const out = [];
    const taken = new Map(topics.map((t) => [t.id, 0]));
    for (const share of SHARES) {
      for (const unitId of unitIds) {
        for (const t of byUnit[unitId]) {
          const from = taken.get(t.id);
          const to = Math.min(t.items.length, from + Math.ceil(t.items.length * share));
          out.push(...t.items.slice(from, to));
          taken.set(t.id, to);
        }
      }
    }
    for (const t of topics) out.push(...t.items.slice(taken.get(t.id)));
    return out;
  }

  return topics.flatMap((t) => t.items);
}

/**
 * Place retrieval episodes in one chronological pass.
 *
 * The first attempt chose topics up front and recorded a *future* position for
 * each, so the same early topics were recycled and a third of the course was
 * never revisited — the metric said 14 of 24. Walking the timeline instead, and
 * always revisiting the two topics seen longest ago, rotates through all of them.
 */
function interleave(teachStream, strategy, pool) {
  if (pool === 0) return { lessons: teachStream, episodes: [] };

  // Retrieval that starts immediately gives short gaps but crowds the opening
  // weeks. `retrievalStart` is the fraction of the course taught before the first
  // episode, so a school can trade coverage density against delay.
  const startAt = Math.floor(teachStream.length * Number(args['retrieval-start'] ?? (strategy === 'spaced' ? 0.3 : 0.05)));
  const every = Math.max(2, Math.floor(Math.max(1, teachStream.length - startAt + pool) / pool));
  const lastSeen = new Map();
  const revisits = new Map();
  const episodes = [];
  const out = [];
  let sinceEpisode = 0;

  const emit = () => {
    // Prefer a topic that has never been revisited, then the one seen longest
    // ago. Sorting on recency alone recycled the handful of topics taught early
    // and left a third of the course untouched.
    const chosen = [...lastSeen.entries()]
      .sort((a, b) => (revisits.get(a[0]) ?? 0) - (revisits.get(b[0]) ?? 0) || a[1] - b[1])
      .slice(0, TOPICS_PER_RETRIEVAL)
      .map(([id]) => topics.find((t) => t.id === id));
    if (chosen.length === 0) return false;
    const episode = { kind: 'retrieval', points: [], topics: chosen };
    out.push(episode);
    episodes.push(episode);
    for (const topic of chosen) {
      lastSeen.set(topic.id, out.length - 1);
      revisits.set(topic.id, (revisits.get(topic.id) ?? 0) + 1);
    }
    sinceEpisode = 0;
    return true;
  };

  for (const item of teachStream) {
    out.push(item);
    lastSeen.set(item.topic.id, out.length - 1);
    sinceEpisode += 1;
    if (episodes.length < pool && sinceEpisode >= every && out.length >= startAt) emit();
  }

  // Anything left over goes at the end rather than being silently dropped.
  while (episodes.length < pool && lastSeen.size >= TOPICS_PER_RETRIEVAL) emit();

  return { lessons: out, episodes };
}

// ---- Assemble, insert assessment, verify, measure -----------------------
function build(strategy) {
  const { teaching, pool } = budgetFor(strategy);
  const slots = allocate(teaching, topics.map((t) => t.marks));
  const slotsById = new Map(topics.map((t, i) => [t.id, slots[i]]));

  const teachStream = buildTeachingStream(strategy, slotsById);
  const { lessons: ordered } = interleave(teachStream, strategy, pool);

  const lessons = ordered.map((item) => {
    if (item.kind === 'retrieval') {
      return {
        type: 'retrieval',
        unitId: item.topics[0]?.unitId ?? null,
        unitTitle: item.topics[0]?.unitTitle ?? 'Consolidation',
        topicId: null,
        topicTitle: `Retrieval: ${item.topics.map((t) => t.title).join(' + ')}`,
        covers: item.topics.map((t) => t.id),
        points: [],
        marksAtStake: 0,
      };
    }
    return {
      type: item.kind === 'practice' ? 'practice' : 'teach',
      unitId: item.topic.unitId,
      unitTitle: item.topic.unitTitle,
      topicId: item.topic.id,
      topicTitle: item.topic.title,
      points: item.points,
      marksAtStake: item.topic.marks / slotsById.get(item.topic.id),
    };
  });

  // Assessment windows at the end of each unit, anchored to the last *teaching*
  // lesson, not the last lesson of any kind.
  const unitIds = [...new Set(lessons.map((l) => l.unitId).filter(Boolean))];
  const perUnit = Math.floor(assessmentLessons / unitIds.length);
  for (const unitId of unitIds) {
    let last = -1;
    lessons.forEach((l, i) => { if (l.unitId === unitId && l.type !== 'retrieval') last = i; });
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

  // ---- Verification and reported metrics ----------------------------------
  const all = topics.flatMap((t) => t.points);
  const counts = new Map();
  for (const l of lessons) for (const p of l.points) counts.set(p, (counts.get(p) ?? 0) + 1);

  const firstWeek = new Map();
  for (const l of lessons) for (const p of l.points) if (!firstWeek.has(p)) firstWeek.set(p, l.week);
  const topicFirstWeek = new Map(topics.map((t) => [t.id, Math.min(...t.points.map((p) => firstWeek.get(p) ?? Infinity))]));

  const gapsByTopic = new Map(topics.map((t) => [t.id, []]));
  for (const l of lessons) {
    if (l.type !== 'retrieval' && l.type !== 'retrieve') continue;
    for (const id of l.covers ?? []) gapsByTopic.get(id)?.push(l.week - topicFirstWeek.get(id));
  }

  const revisited = [...gapsByTopic.entries()].filter(([, gaps]) => gaps.length > 0);
  const allGaps = revisited.flatMap(([, gaps]) => gaps);

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
      retrievalLessons: lessons.filter((l) => l.type === 'retrieval').length,
      topicsTotal: topics.length,
      topicsRevisited: revisited.length,
      topicsNeverRevisited: topics.filter((t) => (gapsByTopic.get(t.id)?.length ?? 0) === 0).map((t) => t.id),
      meanGap: allGaps.length > 0 ? Math.round((allGaps.reduce((a, b) => a + b, 0) / allGaps.length) * 10) / 10 : null,
      minGap: allGaps.length > 0 ? Math.min(...allGaps) : null,
      maxGap: allGaps.length > 0 ? Math.max(...allGaps) : null,
      topicSwitchRate: Math.round((switches / (lessons.length - 1)) * 1000) / 10,
      topicsInFirst8Weeks: new Set(lessons.filter((l) => l.week <= 8 && l.topicId).map((l) => l.topicId)).size,
    },
  };
}

// ---- Drive ---------------------------------------------------------------
if (args.compare) {
  const rows = STRATEGIES.map((s) => build(s));
  console.log(`same content, same marks, four pedagogies — ${TOTAL_LESSONS} lessons over ${WEEKS} weeks\n`);
  console.log(`${'strategy'.padEnd(12)}${'covered'.padStart(9)}${'marks'.padStart(7)}${'dupes'.padStart(7)}${'revisited'.padStart(11)}${'mean'.padStart(7)}${'worst'.padStart(7)}${'switches'.padStart(10)}`);
  for (const r of rows) {
    const m = r.metrics;
    console.log(`${r.strategy.padEnd(12)}${`${m.covered}/${m.specPoints}`.padStart(9)}${String(m.marks).padStart(7)}${String(m.duplicated.length).padStart(7)}${`${m.topicsRevisited}/${m.topicsTotal}`.padStart(11)}${String(m.meanGap ?? '-').padStart(7)}${String(m.maxGap ?? '-').padStart(7)}${`${m.topicSwitchRate}%`.padStart(10)}`);
  }
  const bad = rows.filter((r) => r.metrics.covered !== r.metrics.specPoints
    || r.metrics.duplicated.length > 0
    || Math.abs(r.metrics.marks - RECONCILED_TOTAL) > 0.5);
  console.log(bad.length === 0
    ? '\nall four verify: full coverage, no duplicates, 200 marks'
    : `\nFAILED verification: ${bad.map((r) => r.strategy).join(', ')}`);
  process.exitCode = bad.length === 0 ? 0 : 1;
} else {
  const strategy = args.pedagogy ?? 'spaced';
  if (!STRATEGIES.includes(strategy)) {
    console.error(`unknown pedagogy "${strategy}"; choose one of ${STRATEGIES.join(', ')}`);
    process.exit(2);
  }
  const result = build(strategy);
  await writeFile(`scheme-${strategy}.json`, `${JSON.stringify({
    parameters: { lessons: TOTAL_LESSONS, weeks: WEEKS, pedagogy: strategy },
    verification: {
      specPoints: result.metrics.specPoints,
      covered: result.metrics.covered,
      uncovered: result.metrics.uncovered,
      duplicated: result.metrics.duplicated,
      marks: result.metrics.marks,
      topicsRevisited: result.metrics.topicsRevisited,
      topicsNeverRevisited: result.metrics.topicsNeverRevisited,
    },
    metrics: result.metrics,
    lessons: result.lessons,
  }, null, 2)}\n`, 'utf8');

  console.log(`pedagogy: ${strategy} | ${TOTAL_LESSONS} lessons over ${WEEKS} weeks`);
  console.log(`verification: ${result.metrics.covered}/${result.metrics.specPoints} points, ${result.metrics.duplicated.length} duplicates, ${result.metrics.marks} marks`);
  console.log(`retrieval: ${result.metrics.retrievalLessons} lessons, ${result.metrics.topicsRevisited}/${result.metrics.topicsTotal} topics revisited, mean gap ${result.metrics.meanGap ?? '-'} weeks (worst ${result.metrics.maxGap ?? '-'})`);
  if (result.metrics.topicsNeverRevisited.length > 0) {
    console.log(`never revisited: ${result.metrics.topicsNeverRevisited.join(', ')}`);
  }
}
