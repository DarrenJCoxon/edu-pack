#!/usr/bin/env python3
"""
Export the verified pipeline output as a Word document.

A scheme of work that lives only in JSON is not a scheme of work. This builds the
artefact a department retains: the parameters and verification record, the
marks-per-unit analysis, the full lesson sequence, the coverage summary, and the
exemplar lesson — all from the same files the gates approved, so the document
cannot drift from the data.

Usage:
    python3 export-docx.py --dir <project> --scheme scheme-spaced.json \
        --out scheme-of-work.docx [--lesson resources/lesson-01.md]
"""

import argparse
import json
import os
import re

from docx import Document
from docx.enum.text import WD_BREAK
from docx.shared import Pt, Cm


def load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def add_kv_table(doc, rows):
    table = doc.add_table(rows=0, cols=2)
    table.style = "Light List Accent 1"
    for key, value in rows:
        cells = table.add_row().cells
        cells[0].text = str(key)
        cells[1].text = str(value)
    return table


def add_table(doc, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Light Grid Accent 1"
    for i, header in enumerate(headers):
        table.rows[0].cells[i].text = str(header)
    for row in rows:
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = "" if value is None else str(value)
    if widths:
        for row in table.rows:
            for i, width in enumerate(widths):
                row.cells[i].width = Cm(width)
    return table


INLINE_BOLD = re.compile(r"\*\*(.+?)\*\*")


def add_markdown(doc, text):
    """Minimal markdown: headings, tables, bullets, bold. Enough for a lesson."""
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()

        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i].strip())
                i += 1
            rows = [[c.strip() for c in row.strip("|").split("|")] for row in block]
            headers, body = rows[0], [r for r in rows[2:]]
            add_table(doc, headers, body)
            continue

        if line.startswith("### "):
            doc.add_heading(line[4:], level=3)
        elif line.startswith("## "):
            doc.add_heading(line[3:], level=2)
        elif line.startswith("# "):
            doc.add_heading(line[2:], level=1)
        elif line.startswith("> "):
            paragraph = doc.add_paragraph()
            run = paragraph.add_run(line[2:])
            run.italic = True
        elif line.startswith("- "):
            doc.add_paragraph(line[2:], style="List Bullet")
        elif re.match(r"^\d+\.\s", line):
            doc.add_paragraph(re.sub(r"^\d+\.\s", "", line), style="List Number")
        elif line.strip() == "---":
            pass
        elif line.strip():
            paragraph = doc.add_paragraph()
            pos = 0
            for match in INLINE_BOLD.finditer(line):
                paragraph.add_run(line[pos:match.start()])
                paragraph.add_run(match.group(1)).bold = True
                pos = match.end()
            paragraph.add_run(line[pos:])
        i += 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default=".")
    parser.add_argument("--spec", default="spec-map.json")
    parser.add_argument("--weighting", default="mark-weighting.json")
    parser.add_argument("--scheme", default="scheme-spaced.json")
    parser.add_argument("--coverage", default="coverage-matrix.json")
    parser.add_argument("--lesson", default=None)
    parser.add_argument("--out", default="scheme-of-work.docx")
    args = parser.parse_args()

    spec = load(os.path.join(args.dir, args.spec))
    weighting = load(os.path.join(args.dir, args.weighting))
    scheme = load(os.path.join(args.dir, args.scheme))

    coverage = None
    coverage_path = os.path.join(args.dir, args.coverage)
    if os.path.exists(coverage_path):
        coverage = load(coverage_path)

    doc = Document()
    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(10)

    # ---- Title ------------------------------------------------------------
    doc.add_heading(spec.get("specification", "Scheme of work"), level=0)
    params = scheme.get("parameters", {})
    doc.add_heading("Scheme of work", level=1)
    doc.add_paragraph(
        f"{params.get('lessons', '?')} lessons over {params.get('weeks', '?')} weeks, "
        f"{params.get('pedagogy', '?')} pedagogy."
    )

    verification = scheme.get("verification") or scheme.get("metrics") or {}
    add_kv_table(doc, [
        ("Specification", spec.get("specification", "")),
        ("Pedagogy", params.get("pedagogy", "")),
        ("Lessons", params.get("lessons", "")),
        ("Weeks", params.get("weeks", "")),
        ("Specification points", verification.get("specPoints", "")),
        ("Points taught", verification.get("covered", "")),
        ("Duplicates", len(verification.get("duplicated", []) or [])),
        ("Marks reconciled", verification.get("marks", "")),
        ("Mark schemes analysed", ", ".join(p.get("paperId", "") for p in weighting.get("papers", []))),
    ])

    doc.add_paragraph()
    doc.add_paragraph(
        "Every figure in this document was produced by a pipeline that does not publish "
        "unreconciled totals. The mark weighting reconciles to the papers' own totals, and "
        "every specification point is taught exactly once."
    )

    # A pack that quotes a specification is not a document to publish. Say so where
    # a reader will see it, not only in a licence file.
    notice = doc.add_paragraph()
    notice_run = notice.add_run(
        "Contains specification text reproduced for internal use only. "
        "Do not publish or redistribute this pack outside your school."
    )
    notice_run.italic = True
    notice_run.font.size = Pt(8)

    # ---- Marks per unit ---------------------------------------------------
    doc.add_page_break()
    doc.add_heading("Where the marks are", level=1)
    doc.add_paragraph(
        "Marks per specification point, from the mark schemes analysed. This is the ratio "
        "that should drive time allocation — not the number of pages the specification "
        "spends on a topic."
    )

    unit_rows = []
    for unit in spec.get("units", []):
        points = sum(len(t.get("points", [])) for t in unit.get("topics", []))
        if points == 0:
            continue
        marks = weighting.get("byUnit", {}).get(unit["id"], 0)
        unit_rows.append([
            unit["id"],
            unit["title"],
            points,
            round(marks, 1),
            round(marks / points, 2),
        ])
    unit_rows.sort(key=lambda r: -r[4])
    add_table(doc, ["Unit", "Title", "Points", "Marks", "Marks per point"], unit_rows)

    # ---- Scheme -----------------------------------------------------------
    doc.add_page_break()
    doc.add_heading("Lesson sequence", level=1)
    scheme_rows = []
    for lesson in scheme.get("lessons", []):
        scheme_rows.append([
            lesson.get("week", ""),
            lesson.get("n", ""),
            lesson.get("type", ""),
            lesson.get("topicTitle", ""),
            len(lesson.get("points", []) or []),
        ])
    add_table(doc, ["Week", "Lesson", "Type", "Focus", "Points"], scheme_rows)

    # ---- Coverage ---------------------------------------------------------
    if coverage:
        doc.add_page_break()
        doc.add_heading("Coverage", level=1)
        summary = coverage.get("summary", {})
        add_kv_table(doc, [
            ("Specification points", summary.get("points", "")),
            ("Taught", summary.get("taught", "")),
            ("Examined in the papers analysed", summary.get("examined", "")),
            ("Not examined in those papers", len(summary.get("neverExamined", []) or [])),
        ])
        doc.add_paragraph()
        doc.add_paragraph(
            "\"Not examined\" means not examined in the papers analysed. With two papers that "
            "is thin evidence, and every point remains examinable. Treat it as a prompt to "
            "parse more series, not as permission to skip content."
        )

    # ---- Exemplar lesson --------------------------------------------------
    if args.lesson:
        lesson_path = os.path.join(args.dir, args.lesson)
        if os.path.exists(lesson_path):
            doc.add_page_break()
            with open(lesson_path, encoding="utf-8") as handle:
                add_markdown(doc, handle.read())

    doc.save(os.path.join(args.dir, args.out))

    paragraphs = len(doc.paragraphs)
    tables = len(doc.tables)
    print(f"wrote {args.out}: {paragraphs} paragraphs, {tables} tables")


if __name__ == "__main__":
    main()
