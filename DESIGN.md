# Design notes

Why edu-pack is built the way it is: the reasoning, the measurements, and what the
end-to-end run produces. The README covers installing and using it.

## The principle

Every figure a planning tool produces is derived from a source: a PDF, a
mark scheme, an allocation. Each derivation can be wrong in a way that still looks
right. A table of percentages is equally convincing whether its total is 200 marks
or 202.

So verification is a library (`packages/edu-verify`), not a habit. Each stage
opens a Gate, records what it checked, and withholds output from the next stage
until it passes. That is the whole difference between this and a chat tool:
**each stage checks its output against an independent total and halts when the check fails.**

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

| strategy | covered | marks | topics revisited | mean gap | worst gap | topic switches |
|---|---|---|---|---|---|---|
| blocked | 97/97 | 200 | 0/24 | — | — | 22.9% |
| interleaved | 97/97 | 200 | 24/24 | 5.6 wk | 34 | 79.4% |
| spaced | 97/97 | 200 | 24/24 | 9.8 wk | 44 | 49.6% |
| spiral | 97/97 | 200 | 24/24 | 9.2 wk | 27 | 58.8% |

All four verify identically on coverage and marks
content is taught, not *what* is taught — and the tool proves that rather than
asserting it.

## The course this implies

Six modules, one per skill, each ending with "now try to break it":

1. **Read a specification as data** — decompose it; find what your parser drops.
2. **Find the marks** — reconcile before you rank; watch a plausible table fail.
3. **Choose a pedagogy** — compare four structures on your own course.
4. **Prove coverage** — the matrix, and what "not examined" means.
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

# Installing, in detail

The README is written for the person using this, not the person maintaining it.
This is the same information with the mechanisms left in.

## How the installer works

If you do not have the harness yet, download it first:
**<https://www.deepseek.com/en/harness/>** — install it, open it once, then quit it.

### What the installer does

Run once, from the unzipped folder:

```bash
node install.mjs --dsh-home ~/.dsh
```

`--dsh-home` defaults to `~/.dsh`, so `node install.mjs` requires no argument.
It performs four steps and then stops:

1. **Copies the skills, packages, helpers and the bundled PDF library** to
   `~/.dsh/edu-pack/`.
2. **Installs the skill provider plugin** (`@edu-pack/dsh-edu-skills`) into the
   profile's `node_modules`, beside the other harness packages.
3. **Appends one entry** to `~/.dsh/cordis.patch.yml` that inserts the plugin and
   points it at the skills directory.
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

To install without the script, perform the same four steps manually:

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

Start a **new conversation** and type `/`.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "cannot be opened because it is from an unidentified developer" | macOS Gatekeeper, unsigned `.command` | Right-click the file → **Open** → **Open** |
| `node: command not found` | Node.js not installed | Install Node 20+; the installer tells you if it is missing |
| Skills absent from `/` after restart | Patch entry missing, or the plugin did not load | Run `test/registration.mjs`; check `~/.dsh/cordis.patch.yml` contains `edu-skills` |
| Skills absent even though the patch is right | You are in an *existing* conversation | Start a **new** one — the catalogue is built when a conversation starts |
| Stage 1 finds 0 points | The PDF is a scan, not text | It needs OCR before it can be read |
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

## Using it — file layout

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
