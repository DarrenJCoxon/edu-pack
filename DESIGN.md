# Design notes

Why edu-pack is built the way it is: the reasoning, the measurements, and what the
end-to-end run produces. The README covers installing and using it.

## The principle

Every figure a planning tool produces is derived from something else: a PDF, a
mark scheme, an allocation. Each derivation can be wrong in a way that still looks
right. A table of percentages is equally convincing whether its total is 200 marks
or 202.

So verification is a library (`packages/edu-verify`), not a habit. Each stage
opens a Gate, records what it checked, and refuses to hand anything downstream
until it passes. That is the whole difference between this and a chat tool:
**the tool has a model of its own completeness, and it stops.**

Three real failures were caught this way while the first two skills were built:

| Failure | What it looked like | What caught it |
|---|---|---|
| Marks totalled 247 instead of 200 | a neat percentage table | reconciliation against the paper total |
| Three topics had no specification points | "94/94 covered" | the coverage gate — the denominator was wrong |
| 15 points taught twice | a plausible-looking sequence | the duplicate check |

Each is now a regression test in `packages/edu-verify/test/`.

## Why the pedagogy is a parameter

A scheme of work is a pedagogical argument, not an arithmetic result. The tool
does not choose; it makes the choice explicit and shows its consequences. A
department can then say *"blocked for the set who need fluency, spaced for the
exam cohort"* and point at the numbers.

Measured on one real specification (97 points, 132 lessons, 200 marks):

| strategy | covered | marks | retrieval gap | topic switches | topics in first 8 weeks |
|---|---|---|---|---|---|
| blocked | 97/97 | 200 | 3.5 wk | 22.9% | 2 |
| interleaved | 97/97 | 200 | 7.4 wk | 72.5% | 3 |
| spaced | 97/97 | 200 | 16.3 wk | 64.1% | 4 |
| spiral | 97/97 | 200 | 41.9 wk | 64.1% | 6 |

All four verify identically on coverage and marks: the pedagogy changes *how* the
content is taught, not *what* is taught — and the tool proves that rather than
asserting it.

## The course this implies

Six modules, one per skill, each ending with "now try to break it":

1. **Read a specification as data** — decompose it; find what your parser drops.
2. **Find the marks** — reconcile before you rank; watch a plausible table fail.
3. **Choose a pedagogy** — compare four structures on your own course.
4. **Prove coverage** — the matrix, and what "not examined" really means.
5. **Build resources** — from verified lessons, not from a blank prompt.
6. **Ship it to colleagues** — skills as the unit of professional sharing.

The failure modes are the curriculum. Anyone can be shown a tool that works; the
value is in learning where it lies to you.

## Status

| | |
|---|---|
| `edu-verify` | Built, 11 tests passing |
| `spec-to-scheme` | Built and run end to end on AQA GCSE Biology (8461) |
| `coverage-matrix` | Built; produced a 97-point matrix |
| `resource-pack` | Built; briefs, an exemplar lesson and a 42 KB .docx |
| `batch.mjs` + `check-resource.mjs` | Built; 80 briefs prepared, validator passes and fails correctly |
| End-to-end run | Verified from a clean directory |
| DSH bundle | Built: `package.json`, `cordis.patch.yml`, `install.mjs` |

## The end-to-end run

From an empty directory containing only the specification text and two mark
schemes:

```
spec-to-scheme   97 points -> 200 marks reconciled -> 132 lessons, all gates passed
coverage-matrix  97 taught, 49 examined in the papers analysed
resource-pack    4 lesson briefs -> exemplar resource -> scheme-of-work.docx
```

Six artefacts, each traceable to the stage that produced it:
`spec-map.json` → `mark-weighting.json` → `scheme-spaced.json` →
`coverage-matrix.{md,json}` → `briefs/` → `AQA-Biology-scheme-of-work.docx`.
