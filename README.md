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

## Installing

### What the installer does

Run once, from the unzipped folder:

```bash
node install.mjs --dsh-home ~/.dsh
```

`--dsh-home` defaults to `~/.dsh`, so you can usually just run `node install.mjs`.
It performs four steps and then stops:

1. **Copies the skills and packages** to `~/.dsh/edu-pack/`.
2. **Installs the skill provider plugin** (`@edu-pack/dsh-edu-skills`) into the
   profile's `node_modules`, beside the other harness packages.
3. **Appends one entry** to `~/.dsh/cordis.patch.yml` that inserts the plugin and
   points it at the skills directory.
4. **Checks for `pdftotext`** and warns if it is missing.

It does **not** touch your model providers, your API keys, or your conversations.
It is idempotent: running it twice reports "already registered" and changes
nothing.

### Why a plugin rather than a skill folder

The harness looks for skills in two ways, and only one works in the desktop app.
A directory registered through `skill-filesystem` is ignored there — that provider
is disabled in the desktop profile, so `customSkillDirs` is written to the config,
accepted, and never read. The symptom is a skill that installs cleanly and never
appears.

The desktop app takes skills from **plugins** instead, which is what
`install.mjs` now installs. If you are installing on a headless profile, either
route works; the plugin route works on both.

### Manual install

If you would rather not run the script, do the same four things by hand:

```bash
cp -R skills packages ~/.dsh/edu-pack/
mkdir -p ~/.dsh/profiles/desktop/node_modules/@edu-pack
cp -R packages/dsh-edu-skills ~/.dsh/profiles/desktop/node_modules/@edu-pack/
```

Then add this to `~/.dsh/cordis.patch.yml`, with the absolute path to the skills
directory:

```yaml
- insert:
    - id: edu-skills
      name: "@edu-pack/dsh-edu-skills"
      config:
        assetRoot: "/Users/you/.dsh/edu-pack/skills"
```

Restart the harness.

### Verify the install

```bash
node test/registration.mjs --dsh-home ~/.dsh
```

It starts a fake provider, runs one harness turn, and checks the three skill names
appear in the system prompt — no model involved:

```
✓ spec-to-scheme appears in the prompt
✓ coverage-matrix appears in the prompt
✓ resource-pack appears in the prompt
RESULT: PASS — skills are surfaced to the model
```

You can also just start a **new conversation** and type `/`.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "cannot be opened because it is from an unidentified developer" | macOS Gatekeeper, unsigned `.command` | Right-click the file → **Open** → **Open** |
| `node: command not found` | Node.js not installed | Install Node 20+; the installer tells you if it is missing |
| Skills absent from `/` after restart | Patch entry missing, or the plugin did not load | Run `test/registration.mjs`; check `~/.dsh/cordis.patch.yml` contains `edu-skills` |
| Skills absent even though the patch is right | You are in an *existing* conversation | Start a **new** one — the catalogue is built when a conversation starts |
| `pdftotext: NOT FOUND` | Poppler not installed | `brew install poppler` |
| Stage 1 finds 0 points | The PDF is a scan, not text | Run OCR first; `pdftotext` cannot read images |
| Marks do not reconcile | The mark scheme is not AQA's layout | The parsers are AQA-shaped; other boards need their own |

### Updating

Download the new release zip, unzip it over the old folder, and re-run
`install.command`. The plugin is replaced; the config entry is left alone.

### Uninstalling

```bash
rm -rf ~/.dsh/edu-pack
rm -rf ~/.dsh/profiles/desktop/node_modules/@edu-pack
```

Then delete the `- insert:` block for `edu-skills` from
`~/.dsh/cordis.patch.yml` and restart. Your providers and conversations are
untouched.

## Using it

Put the source material in one folder and open it as the workspace:

```
my-course/
  spec.pdf
  papers/AQA-84611F-MS-JUN22.pdf
  papers/AQA-84612F-MS-JUN22.pdf
```

Then, in a new conversation:

> **"Build me a scheme of work from spec.pdf and the mark schemes in papers/.
> Spaced pedagogy, 132 lessons over 66 weeks."**

The agent loads `spec-to-scheme` and runs three stages, stopping at the first gate
that fails. Then:

> *"Run the coverage matrix."*
> *"Prepare lesson briefs and write lessons 1–6."*

A scheme of work with typical parameters takes about a minute; the gates are
instant, the parsing is the slow part.

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
