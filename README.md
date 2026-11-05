# edu-pack

Planning and resourcing skills for teachers, for DeepSeek Harness.

It turns an exam specification and a set of mark schemes into a scheme of work,
a coverage matrix, lesson briefs and a Word pack — and **refuses to publish a
number it cannot reconcile**.

## Quick start

**You need:** DeepSeek Harness (opened once), Node.js 20+, and `pdftotext`
(`brew install poppler`). For the Word export only: Python 3 with `python-docx`.

1. **Quit DeepSeek Harness.**
2. **Double-click `install.command`** — or run `node install.mjs`.
   First time on macOS: right-click → Open, because the file is unsigned.
3. **Reopen DeepSeek Harness** and start a **new conversation**.
4. Type `/` — you should see `spec-to-scheme`, `coverage-matrix` and `resource-pack`.
5. Put a specification PDF and some mark-scheme PDFs in a folder, open it as the
   workspace, and ask: *"build me a scheme of work from this spec"*.

If the skills do not appear, run `node test/registration.mjs` — it checks the
mechanism directly instead of guessing.

> **Exam board material is copyrighted.** Specifications, past papers and mark
> schemes are not included, and should not be committed to a repository. Keep them
> in a folder outside the project.

## What is in it

```
packages/edu-verify/              the gates (11 tests)
skills/spec-to-scheme/            spec + mark schemes -> verified scheme of work
skills/coverage-matrix/           proves every point is taught, shows which are examined
skills/resource-pack/             lesson briefs -> resources -> Word scheme of work
```

## The three skills

**`spec-to-scheme`** — decompose a specification, weight marks from the mark
schemes, and sequence the result under one of four pedagogies (blocked,
interleaved, spaced, spiral). Each structure is measured: retrieval gap, topic
switching, breadth in the first eight weeks.

**`coverage-matrix`** — joins the specification, the mark schemes and a scheme of
work into a single auditable table: every point, the lesson that teaches it, and
the questions that have examined it.

**`resource-pack`** — generates per-lesson briefs containing only proven content
(verbatim specification text, marks at stake, the questions that examined those
points), then assembles resources and a Word document. The model writes the
pedagogy; the tool supplies the provenance.

Two supporting scripts make batch generation safe:

- `batch.mjs` prepares every brief in the course at once (80 for a 132-lesson
  scheme) plus a manifest, so lessons can be written independently and in parallel.
- `check-resource.mjs` validates a generated resource against its brief: every
  specification point present, required sections there, and the provenance table
  **filled in** — an empty "Covered?" column looks like provenance and is not.

## Install details

```bash
node install.mjs --dsh-home ~/.dsh
```

Copies the pack to `<home>/edu-pack`, registers `<home>/edu-pack/skills` in the
home patch, and checks for `pdftotext`. Restart the harness afterwards.

Three things were learned by testing rather than reading:

- **The skills service takes one provider.** A second `skill-filesystem`
  instance is silently ignored. The supported hook is `customSkillDirs` on the
  existing entry, so the installer patches that entry — which *replaces* its
  config, and is documented as an override.
- **A wrong path fails silently.** The skills simply never appear, and the first
  run of `test/registration.mjs` proved it by finding none of the three names in
  the model's prompt. Use that test after installing.
- **Appending below a `[]` disable marker produces invalid YAML.** The installer
  strips it wherever it appears.

`node test/registration.mjs --dsh-home ~/.dsh` is the verification: a fake
provider records the request body and the test asserts the skill names are in the
system prompt. No model judgement involved.

## Caveats

- Metrics measure **structure, not learning**. They make an argument auditable;
  they do not prove a pedagogy works in a room.
- Two mark schemes support a demonstration, not a policy. Parse several series
  before acting on a weighting.
- Assessment-objective attribution is approximate; marks-per-topic is exact.
- The parsers are built against AQA's layout. Other boards need their own.

## Your responsibility

This is a tool. What you put into it, and what you do with the output, is yours —
not the maintainer's.

- **Exam board material is copyrighted.** Specifications, past papers and mark
  schemes belong to the exam boards, not to this project. Use them only as your
  school's licence permits, and do not publish packs this tool generates: they
  quote specification text verbatim, so sharing one redistributes it.
- **Check before you teach.** The pipeline verifies its own arithmetic and its own
  coverage. It cannot verify that a resource is right for your class, your tier or
  your pupils.
- **No warranty, no liability.** Provided as-is under the MIT licence, with no
  liability for decisions taken on the basis of its output. See `LICENSE`.

Nothing here is legal advice.

## Licence

MIT. See `LICENSE`. Not affiliated with DeepSeek or any exam board.
