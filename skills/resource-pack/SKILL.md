---
name: resource-pack
description: Turn a verified lesson sequence into teaching resources and a Word scheme of work. Use when a department wants actual lesson materials rather than a plan, or when generated resources must be traceable back to specific specification points. Produces per-lesson briefs, a resource per lesson, and a single .docx pack.
---

# resource-pack

The hand-off between verified data and generated prose.

A model writing a worksheet from a prompt invents its own syllabus. Here it writes
from a **brief** containing only what is already proven: the specification points
this lesson must teach, their verbatim text, the marks at stake, and the exam
questions that have examined exactly those points.

That split is the design. **The tool supplies provenance; the model supplies
pedagogy.** Nothing in a brief is inferred, so nothing in a resource can drift
away from the specification — and every resource ends with a provenance table
pointing back at its points.

## If Python is not installed

The Word export is the only part that needs Python. Check once, before writing
anything:

```bash
python3 -c "import docx" 2>/dev/null && echo available || echo missing
```

If it is missing, **skip the document and say so in one line** — do not fail the
run, and do not ask the user to install anything:

> I've written the lessons and the sequence. The Word pack needs Python, which is
> not on this Mac, so you have `scheme.csv` and `REPORT.md` instead.

## Two stages

### 1. Briefs

```bash
~/.dsh/edu-pack/bin/run scripts/briefs.mjs --spec spec-map.json --weighting mark-weighting.json \
  --scheme scheme-spaced.json --from 1 --to 10 --out briefs
```

Each brief contains the lesson's points with verbatim specification text, the
marks at stake, the questions that have examined them, and a template of what the
resource must contain (objectives, do-now, exposition, worked example, practice,
differentiation, spaced homework).

Generate briefs for a **pilot unit**, not a whole course. Forty lessons nobody
teaches is worse than four that get used.

### 2. Resources, then a document

Write one resource per brief, then assemble:

```bash
python3 scripts/export-docx.py --dir . --scheme scheme-spaced.json \
  --coverage coverage-matrix.json --lesson resources/lesson-01.md \
  --out AQA-Biology-scheme-of-work.docx
```

The document contains the verification record, the marks-per-unit analysis, the
full lesson sequence, the coverage summary and the exemplar lesson — all read from
the same JSON the gates approved, so the document cannot drift from the data.

## What the model must not do

- **Introduce content beyond the specification points in the brief.** If a resource
  needs something the brief doesn't contain, that's a stage-1 or stage-3 problem,
  not a licence to invent.
- **Skip the provenance table.** It is the only thing that makes a generated
  resource auditable later. An empty "covered?" column is a finding.
- **Set homework on the same night.** The brief asks for retrieval four weeks
  later; massed practice is what the spacing analysis exists to avoid.

## Worked example in this repo

`bio-plan/resources/lesson-01.md` is a complete resource written from
`bio-plan/briefs/lesson-01.md` — a single specification point (4.1.1.1 Eukaryotes
and prokaryotes), Foundation tier, 1.8 marks at stake. It is the reference output:
subsequent resources should match its structure.

## Limits

- Brief text inherits any noise left by `pdftotext -layout` column bleed. The
  cleaner strips the obvious artefacts, but read the brief before writing from it.
- The document exporter handles a subset of markdown (headings, tables, bullets,
  bold). Anything more elaborate belongs in the resource itself, not the pack.
- Word output is not proofread for layout. Open it before sending it to a
  department.
