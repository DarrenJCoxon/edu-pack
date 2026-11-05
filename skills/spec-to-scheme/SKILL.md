---
name: spec-to-scheme
description: Turn an exam specification and a set of mark schemes into a verified scheme of work. Use when a department asks for a scheme of work, a curriculum map, or a lesson sequence from a syllabus — or when someone claims a scheme "covers the spec" and you need to prove it. Produces a specification map, a mark weighting reconciled to the paper totals, and a lesson sequence with full coverage proven.
---

# spec-to-scheme

Three stages, three gates. The gates are the product: each one exists because it
caught a real error while this was being built.

## Inputs

| Input | Format | Notes |
|---|---|---|
| Specification | text | Convert the PDF with `bin/pdf-to-text.mjs`. AQA-style numbering (`4.1.1.1`) parses cleanly; other boards need a parser tweak |
| Mark schemes | PDF | One per paper. Read with the bundled pdf.js; no extra software needed |
| Term structure | count of lessons and weeks | Ask the department; do not guess |

## Run it

```bash
<pack>/bin/run scripts/run.mjs --dir <project> --quiet \
  --spec specification.txt \
  --papers "papers/*MS*.pdf" \
  --pedagogy spaced --lessons 132 --weeks 66
```

Run scripts through the pack's launcher, not through `node`: on macOS
`<pack>/bin/run`, on Windows `<pack>\bin\run.cmd`. The launcher uses the harness's
own JavaScript runtime, so Node.js is not required. `<pack>` is the installed
pack, normally `~/.dsh/edu-pack` (`%USERPROFILE%\.dsh\edu-pack` on Windows). Run it
from the project directory.

**Always pass `--quiet`.** It sends every stage's output to `build.log` instead of
the conversation, so the teacher sees a result rather than a build.

Add `--compare` instead of `--pedagogy` to build all four structures and print
their measured differences.

## What to report

The person reading is a teacher or head of department, not a developer. The required output is the scheme and the one or two issues that need attention. Report **at most**
this, in this order, and then stop:

1. **One line** — how many lessons over how many weeks, how many specification
   points, all taught once.
2. **The files** — the `.csv` sequence and `REPORT.md`.
3. **Up to three "check before you adopt" items**, in plain English.

A good final message looks like this:

> Done — 132 lessons over 66 weeks, covering all 97 specification points once each.
>
> Files: `scheme-spaced.csv` (the sequence) and `REPORT.md` (how it was built).
>
> Three points to check before adopting it:
> - Bioenergetics gets 31 lessons for 6 points and Ecology 12 for 21. That comes
>   from one year's papers; another year may rank them differently.
> - 15 of the 24 topics get no retrieval lesson under this structure.
> - All six points of one topic are taught in a single lesson.

### Do not put in the reply

- gate names, pass/fail tables, or "all three gates passed"
- parser mechanics — column positions, question numbering, PDF layout, "level of
  response questions", details of how a correction was made
- unit-level percentages, sensitivity tables, year-on-year comparisons
- internal vocabulary: gate, reconcile, partition, denominator, synthesised,
  distribution, breadth metric
- an inventory of every JSON file produced
- "say which and I'll run it"

That material is not lost — write it to `REPORT.md` under **How this was built**
and mention that section once, in one clause.

### When a check fails

Say in one sentence what did not add up and what you need, in these terms:

> Paper 2's marks only add up to 94 of 100, so I have stopped before building the
> scheme. This usually means the mark scheme uses a layout the parser does not
> recognise — can you check it, or send a different year's papers?

No stack traces, no diagnosis of the parser, no offer to "patch locally".

## The three gates

**Gate 1 — decomposition.** Fails if any topic has zero specification points.

> This is not hypothetical. AQA puts the content for short topics directly under
> the topic heading with no numbered sub-points (`4.2.1 Principles of
> organisation`). A parser that only reads numbered points silently drops those
> topics — and then certifies full coverage against a truncated denominator. The
> gate caught three such topics, taking the total from 94 to 97.

**Gate 2 — mark weighting.** Fails unless the attributed marks reconcile to the
papers' own totals.

> The first version summed the wrong PDF column and produced 247 marks where 200
> exist. Every percentage downstream was wrong, and the table looked entirely
> plausible. A reconciliation failure is not a warning; it is a stop.

**Gate 3 — sequencing.** Fails unless every point is taught exactly once and the
lesson count is exact.

> Caught a ceiling-based slice that taught 15 points twice, and a partition that
> scheduled practice lessons before any content had been taught.

## Pedagogies

| Value | Structure | Measured by |
|---|---|---|
| `blocked` | topic by topic; consolidation inside each block | no course-level retrieval |
| `interleaved` | round-robin within a unit | early, frequent revisits |
| `spaced` | topics in order, retrieval starting later | longer gaps, still full coverage |
| `spiral` | three passes over the course | broad early exposure |

Two knobs control retrieval, and both are worth exposing to a department:

- `--retrieval-share` (default 0.15) — the fraction of lessons given to cumulative
  retrieval. Below about 0.1, coverage of all topics stops being possible.
- `--retrieval-start` (default 0.3 for `spaced`, 0.05 otherwise) — how much of the
  course is taught before retrieval begins. Raise it for longer gaps.

Always report **how many topics were revisited** and the **worst** gap, not only
the mean. An earlier version averaged over the topics that happened to receive
retrieval, which made the mean look healthy while a third of the course was never
revisited at all.

The metrics measure **structure, not learning**. They make a departmental argument
auditable; they do not prove one structure teaches better.

## What it will not do

- Fix a bad PDF parse. Read stage 1's output before trusting stages 2–3.
- Weight marks reliably from two papers. Two papers support a demonstration, not a
  policy: parse several series before a department acts on the ranking.
- Attribute assessment objectives accurately. Marks are split evenly across the
  AOs a question touches, which over-weights AO3. Marks-per-topic is exact;
  AO figures are indicative.

## Outputs

`spec-map.json`, `mark-weighting.json`, `scheme-<pedagogy>.json` — each carrying
carries its parameters, so every number can be traced to the stage that produced it.
