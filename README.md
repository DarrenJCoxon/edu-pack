# edu-pack

Three helpers for teachers, inside DeepSeek Harness.

- **spec-to-scheme** — turns a syllabus and some past papers into a scheme of work.
- **coverage-matrix** — shows that every topic is taught, and which ones have been
  examined.
- **resource-pack** — writes lesson materials and a Word document.

The pipeline verifies its arithmetic before producing output. If the marks in the past papers do not reconcile, the pipeline stops and reports the discrepancy rather than producing a plan built on incorrect totals.

## Which computers

macOS is tested. Windows support is written but **not yet verified** — if you run
the Windows installer, expect to report what happens.

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

4. **Run the installer** inside that folder: `install.command` on macOS,
   `install.cmd` on Windows.

   **macOS will not run `install.command` when double-clicked.** The file is
   not signed by an identified developer, and macOS no longer offers a way past
   that by right-clicking. Choose one:

   *Ask DeepSeek Harness to install it* — start a new chat and paste:

   > Install the edu-pack skills from the zip in my Downloads folder.

   DeepSeek Harness runs commands directly rather than through Finder, so the
   security check does not apply. It may ask for permission to write into
   `~/.dsh`. This is the method that requires no Terminal and no security
   settings.

   *Or one line in Terminal* — open Terminal, paste this, press Return, then
   double-click the installer:

   ```bash
   xattr -d com.apple.quarantine ~/Downloads/edu-pack*/install.command
   ```

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

**"Apple could not verify install.command" when you double-click.** macOS blocks
unsigned scripts, and right-clicking no longer bypasses it. Use the Terminal line
in step 4, or ask DeepSeek Harness to install the pack.

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

## Why the installer is blocked

The installer is an unsigned shell script. Signing it and having Apple notarise it
would remove the warning entirely, and requires a paid Apple Developer account.
Until that is done, the two methods in step 4 are the available routes.

## More detail

How it works, and why it is built this way: [`DESIGN.md`](./DESIGN.md).

MIT licence. Not affiliated with DeepSeek or any exam board.
