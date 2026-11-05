---
name: coverage-matrix
description: Prove that every specification point in a scheme of work is taught, and show which points the mark schemes actually examine. Use when a department wants to audit a scheme, when a head of department asks "does this cover the spec?", or when someone needs evidence that a plan is complete rather than merely plausible.
---

# coverage-matrix

Joins three files — the specification map, the mark weighting and a scheme of work
— and answers two mechanical questions for every point:

- **taught?** from the scheme
- **examined?** from the mark schemes' own specification references

The second question is the one departments cannot usually answer, because it needs
the mark schemes parsed and joined to the specification across a whole course.

## Run it

```bash
~/.dsh/edu-pack/bin/run scripts/matrix.mjs \
  --spec spec-map.json \
  --weighting mark-weighting.json \
  --scheme scheme-spaced.json \
  --out coverage-matrix
```

Emits `coverage-matrix.md` (for a human) and `coverage-matrix.json` (for a
dashboard or a DPIA-style evidence pack).

## What it refuses to do

It runs the same gates as `spec-to-scheme` before writing anything: lesson count,
full coverage, no duplicates, marks reconciled, and each point taught in exactly
one lesson. If any of those fail, no matrix is written — a partial matrix is worse
than none, because it looks complete.

## Reading the "examined" column

Two cautions, both of which belong in the report:

1. **"Not examined" means "not examined in the papers analysed".** With two
   papers, roughly half a specification will be untouched. Parse several series
   before drawing any conclusion about what matters.
2. **Absence is not permission to skip.** Every point remains examinable. The
   useful output is not "ignore these", it is "here is where your evidence is
   thin".

## Why this is worth the trouble

A scheme of work that claims coverage is an assertion. A coverage matrix is a
claim you can audit in two minutes: every point, the lesson that teaches it, and
the questions that have examined it. Departments currently do not have this,
because producing it by hand for 97 points across two mark schemes is nobody's
idea of a good afternoon.
