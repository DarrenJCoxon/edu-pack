# edu-pack

Three helpers for teachers, inside DeepSeek Harness.

- **spec-to-scheme** — turns a syllabus and some past papers into a scheme of work.
- **coverage-matrix** — shows that every topic is taught, and which ones have been
  examined.
- **resource-pack** — writes lesson materials and a Word document.

It checks its own numbers before handing anything over. If the marks in the past
papers do not add up, it stops and says so, rather than giving you a plan you
cannot trust.

## What you need

DeepSeek Harness. Nothing else.

If you do not have it: <https://www.deepseek.com/en/harness/>

## Install

1. Open DeepSeek Harness once, then **quit it**.
2. **Unzip** the download.
3. **Double-click `install.command`.**
   If your Mac says it cannot check the file: right-click it → **Open** → **Open**.
4. Open DeepSeek Harness again and start a **new chat**.

## Use it

Type **`/`** in the new chat. You should see the three helpers.

Put the syllabus and some past papers in one folder, open that folder, and ask:

> Build me a scheme of work from the syllabus and past papers, with spaced
> retrieval, 132 lessons over two years.

You get a spreadsheet of lessons and a short report.

## If something goes wrong

**No helpers in the `/` list.** Start a new chat. Existing chats do not pick up
new helpers.

**"Cannot be opened" when you double-click.** Right-click the file → **Open** →
**Open**. It only asks once.

**It stops and says the marks do not add up.** The past papers are probably from
a different exam board than the syllabus. Try another year, or another board.

**Nothing happens at all.** Open DeepSeek Harness once first — the installer needs
it there before it can add anything to it.

## Before you use the output

**Check it.** The tool checks its own arithmetic. It cannot know your class, your
tier or your pupils.

**Do not publish a scheme it produces.** They quote the exam board's own wording,
which is the board's copyright, not ours. Use them in school.

Nothing here is legal advice.

## Word documents

You get a spreadsheet of lessons and a short report. If your Mac is set up for it,
you also get a Word document version.

## More detail

How it works, and why it is built this way: [`DESIGN.md`](./DESIGN.md).

MIT licence. Not affiliated with DeepSeek or any exam board.
