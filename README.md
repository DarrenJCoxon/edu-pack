# edu-pack

Three helpers for teachers, inside DeepSeek Harness.

- **spec-to-scheme** — turns a syllabus and some past papers into a scheme of work.
- **coverage-matrix** — shows that every topic is taught, and which ones have been
  examined.
- **resource-pack** — writes lesson materials and a Word document.

The pipeline verifies its arithmetic before producing output. If the marks in the past papers do not reconcile, the pipeline stops and reports the discrepancy rather than producing a plan built on incorrect totals.

## Install

1. **Get DeepSeek Harness.** If you do not have it, download and install it from
   <https://www.deepseek.com/en/harness/>. Open it once, then **quit it**.

2. **Download the zip.** Open the
   [latest release page](https://github.com/DarrenJCoxon/edu-pack/releases/latest)
   and, under **Assets**, download the file whose name starts with
   **`edu-pack-v`** (for example `edu-pack-v0.3.1.zip`). Ignore the two files
   called *Source code* — you do not need those. This web page is not the
   download.

3. **Unzip it.** Double-click the zip in your Downloads folder. You get a folder
   called `edu-pack`.

4. **Double-click `install.command`** inside that folder.
   If your Mac says it cannot check the file: right-click it → **Open** → **Open**.
   You only do this once.

5. **Open DeepSeek Harness again, start a new chat, and type `/`.**

You should see the three helpers in the list.

## Use it

Type **`/`** in the new chat. You should see the three helpers.

Put the syllabus and some past papers in one folder, open that folder, and ask:

> Build me a scheme of work from the syllabus and past papers, with spaced
> retrieval, 132 lessons over two years.

You get a spreadsheet of lessons and a short report.

## If a step fails

**No helpers in the `/` list.** Start a new chat. Existing chats do not pick up
new helpers.

**"Cannot be opened" when you double-click.** Right-click the file → **Open** →
**Open**. It only asks once.

**It stops and says the marks do not add up.** The past papers are probably from
a different exam board than the syllabus. Try another year, or another board.

**Nothing happens at all.** Open DeepSeek Harness once before installing. The installer requires its home directory to exist.

## Before you use the output

**Review the output.** The checks cover arithmetic and coverage. They cannot assess suitability for a class, a tier or individual pupils.

**Do not publish a scheme it produces.** They quote the exam board's own wording,
which is the board's copyright, not ours. Use them in school.

Nothing here is legal advice.

## Word documents

You get a spreadsheet of lessons and a short report. If your Mac is set up for it,
you also get a Word document version.

## More detail

How it works, and why it is built this way: [`DESIGN.md`](./DESIGN.md).

MIT licence. Not affiliated with DeepSeek or any exam board.
