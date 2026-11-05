import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Gate, VerificationError, verifyScheme, verifySpecMap } from '../lib/index.mjs';

test('a passing gate reports each check', () => {
  const gate = new Gate('marks');
  gate.reconciled('total', 200, 200);
  gate.coversEverything('coverage', ['a', 'b'], new Set(['a', 'b']));
  gate.noDuplicates('dupes', ['a', 'b']);
  gate.require();

  assert.equal(gate.passed, true);
  assert.match(gate.report(), /marks: PASS/);
  assert.match(gate.report(), /✓ total: 200 vs expected 200/);
});

test('a drifted total fails, and the message says by how much', () => {
  const gate = new Gate('marks');
  gate.reconciled('total', 247, 200);
  assert.equal(gate.passed, false);
  assert.throws(() => gate.require(), (error) => {
    assert.ok(error instanceof VerificationError);
    assert.match(error.message, /247 vs expected 200/);
    return true;
  });
});

test('tolerance allows floating point drift but not a real shortfall', () => {
  const fine = new Gate('a');
  fine.reconciled('total', 200.4, 200);
  assert.equal(fine.passed, true);

  const short = new Gate('b');
  short.reconciled('total', 188, 200);
  assert.equal(short.passed, false);
});

test('a missing item is named, not just counted', () => {
  const gate = new Gate('coverage');
  gate.coversEverything('every point is taught', ['4.1.1', '4.2.1', '4.6.4'], new Set(['4.1.1']));
  assert.equal(gate.passed, false);
  assert.match(gate.report(), /4\.2\.1/);
  assert.match(gate.report(), /4\.6\.4/);
});

test('a duplicate is caught — the ceiling-slice failure', () => {
  const gate = new Gate('partition');
  gate.noDuplicates('taught once', ['a', 'b', 'b', 'c']);
  assert.equal(gate.passed, false);
  assert.match(gate.report(), /1 duplicated: b/);
});

test('require() throws nothing when everything passes', () => {
  const gate = new Gate('ok');
  gate.counted('lessons', 132, 132);
  assert.equal(gate.require(), true);
});

test('a failed gate accumulates every failure, not just the first', () => {
  const gate = new Gate('multi');
  gate.counted('lessons', 130, 132);
  gate.reconciled('marks', 188, 200);
  gate.noDuplicates('dupes', ['x', 'x']);
  try {
    gate.require();
    assert.fail('should have thrown');
  } catch (error) {
    assert.equal(error.failures.length, 3);
  }
});

test('verifyScheme passes a correct scheme', () => {
  const gate = verifyScheme('scheme', {
    allPoints: ['p1', 'p2'],
    lessons: [{ points: ['p1'] }, { points: ['p2'] }, { points: [] }],
    expectedLessons: 3,
    expectedMarks: 100,
    actualMarks: 100,
  });
  gate.require();
});

test('verifyScheme catches a point taught twice and a missing one', () => {
  const gate = verifyScheme('scheme', {
    allPoints: ['p1', 'p2', 'p3'],
    lessons: [{ points: ['p1'] }, { points: ['p1'] }],
    expectedLessons: 2,
    expectedMarks: 100,
    actualMarks: 100,
  });
  assert.equal(gate.passed, false);
  assert.throws(() => gate.require(), /missing|duplicated/i);
});

test('verifySpecMap catches the topic-with-no-points bug', () => {
  const topics = [
    { id: '4.1.1', title: 'ok', points: [1, 2] },
    { id: '4.2.1', title: 'Principles of organisation', points: [] },
  ];
  const gate = verifySpecMap('spec map', topics, 2);
  assert.equal(gate.passed, false);
  assert.match(gate.report(), /4\.2\.1/);
  assert.throws(() => gate.require(), /zero specification points/);
});

test('verifySpecMap passes a complete map', () => {
  const gate = verifySpecMap('spec map', [{ id: 'a', points: [1] }, { id: 'b', points: [2] }], 2);
  gate.require();
});
