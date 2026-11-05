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
| Specification | text from `pdftotext -layout` | AQA-style numbering (`4.1.1.1`) parses cleanly; other boards need a parser tweak |
| Mark schemes | PDF | One per paper. The scheme must state per-question totals and specification references |
| Term structure | count of lessons and weeks | Ask the department; do not guess |

## Run it

```bash
node scripts/run.mjs --dir <project> \
  --spec specification.txt \
  --papers "papers/*MS*.pdf" \
  --pedagogy spaced --lessons 132 --weeks 66
```

Add `--compare` instead of `--pedagogy` to build all four structures and print
their measured differences.

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
> scheduled practice lessons before anything had been taught.

## Pedagogies

| Value | Structure | Measured by |
|---|---|---|
| `blocked` | topic by topic | low topic-switch rate, short retrieval gap |
| `interleaved` | round-robin within a unit | high switch rate |
| `spaced` | retrieval at expanding intervals | mean retrieval gap in weeks |
| `spiral` | three passes over the course | topics touched in the first 8 weeks |

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
its own parameters, so any number can be traced back to the stage that made it.
