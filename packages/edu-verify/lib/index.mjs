/**
 * edu-verify — the part that stops a plausible answer being published.
 *
 * Every number a planning tool produces is derived from a source: a PDF, a
 * mark scheme, an allocation. Each derivation can be wrong in ways that still
 * look right. A table of percentages is convincing whether or not its total is
 * 200 marks or 202.
 *
 * So verification is a library, not a habit. Each stage of a pipeline opens a
 * Gate, records what it checked, and calls `require()` before the next stage reads its output. A failed gate throws with the reason, rather than returning a
 * tidier-looking result.
 *
 * The three checks that caught real bugs while building this:
 *   - a mark total that silently drifted (247 instead of 200)
 *   - topics with no points that dropped out of coverage entirely
 *   - points scheduled twice because of a ceiling-based partition
 */

export class VerificationError extends Error {
  constructor(label, failures) {
    const lines = failures.map((f) => `  ✗ ${f.name}: ${f.detail}`);
    super(`${label} failed verification:\n${lines.join('\n')}`);
    this.name = 'VerificationError';
    this.label = label;
    this.failures = failures;
  }
}

export class Gate {
  /** @param {string} label what is being verified, e.g. "mark weighting" */
  constructor(label) {
    this.label = label;
    /** @type {Array<{name: string, ok: boolean, detail: string}>} */
    this.checks = [];
    this.passed = true;
  }

  /**
   * @param {string} name
   * @param {boolean} ok
   * @param {string} detail what was compared, in the form "actual vs expected"
   */
  check(name, ok, detail) {
    this.checks.push({ name, ok, detail });
    if (!ok) this.passed = false;
    return ok;
  }

  /**
   * Totals must agree with an independent source. This is the one that matters
   * most: a wrong total makes every downstream percentage wrong.
   */
  reconciled(name, actual, expected, tolerance = 0.5) {
    const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
    return this.check(name, ok, `${round(actual)} vs expected ${round(expected)} (±${tolerance})`);
  }

  /** Every item must appear at least once. */
  coversEverything(name, all, seen) {
    const missing = all.filter((item) => !seen.has(item));
    const ok = missing.length === 0;
    return this.check(name, ok, ok
      ? `${all.length}/${all.length} covered`
      : `${missing.length} missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
  }

  /** No item may appear twice — the failure mode of a ceiling-based slice. */
  noDuplicates(name, items) {
    const counts = new Map();
    for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    const ok = dupes.length === 0;
    return this.check(name, ok, ok ? 'none' : `${dupes.length} duplicated: ${dupes.slice(0, 8).join(', ')}`);
  }

  /** Simple count equality, for lesson totals and similar. */
  counted(name, actual, expected) {
    return this.check(name, actual === expected, `${actual} vs expected ${expected}`);
  }

  /** Custom predicate. */
  assert(name, ok, detail) {
    return this.check(name, ok, detail);
  }

  /**
   * Throw unless everything passed. Call this before writing output — a pipeline
   * that writes first and checks later has already published a wrong artefact.
   */
  require() {
    if (!this.passed) {
      throw new VerificationError(this.label, this.checks.filter((c) => !c.ok));
    }
    return true;
  }

  /** Human-readable summary, for logs and evidence files. */
  report() {
    const mark = (c) => (c.ok ? '✓' : '✗');
    const lines = this.checks.map((c) => `  ${mark(c)} ${c.name}: ${c.detail}`);
    return `${this.label}: ${this.passed ? 'PASS' : 'FAIL'}\n${lines.join('\n')}`;
  }
}

function round(n) {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : n;
}

/**
 * Verify a sequencing result in one call. Used by the scheme-building skills so
 * the three checks can never be forgotten independently.
 *
 * @param {string} label
 * @param {object} input
 * @param {string[]} input.allPoints
 * @param {Array<{points: string[]}>} input.lessons
 * @param {number} input.expectedLessons
 * @param {number} input.expectedMarks
 * @param {number} input.actualMarks
 */
export function verifyScheme(label, { allPoints, lessons, expectedLessons, expectedMarks, actualMarks }) {
  const gate = new Gate(label);
  const taught = lessons.flatMap((lesson) => lesson.points ?? []);

  gate.counted('lesson count', lessons.length, expectedLessons);
  gate.coversEverything('every specification point is taught', allPoints, new Set(taught));
  gate.noDuplicates('no specification point is taught twice', taught);
  gate.reconciled('marks scheduled match the reconciled total', actualMarks, expectedMarks, 1);

  return gate;
}

/**
 * Verify a decomposition, catching the most consequential failure: topics whose
 * content sits directly under the heading and never gets numbered sub-points.
 *
 * @param {string} label
 * @param {Array<{id: string, title: string, points: unknown[]}>} topics
 * @param {number} expectedPoints
 */
export function verifySpecMap(label, topics, expectedPoints) {
  const gate = new Gate(label);
  const empty = topics.filter((t) => (t.points?.length ?? 0) === 0);
  const total = topics.reduce((n, t) => n + (t.points?.length ?? 0), 0);

  gate.assert('no topic has zero specification points', empty.length === 0,
    empty.length === 0 ? 'none' : `${empty.length} empty: ${empty.map((t) => t.id).join(', ')}`);
  gate.counted('specification point total', total, expectedPoints);

  return gate;
}
