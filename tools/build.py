"""Build docs/data.js from "Giora Bar.docx" + content/sentences.txt.

Usage (from the project folder):
    python tools/build.py

Prints which words are still missing example sentences / which lessons
are missing a paragraph, so they can be written in content/sentences.txt.
"""
import html
import json
import re
import sys
import zipfile
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / "Giora Bar.docx"
CONTENT = ROOT / "content"  # every *.txt here holds sentences (except grammar.txt)
GRAMMAR = CONTENT / "grammar.txt"  # titles, Hebrew tips and exercises for the grammar/tips files
CLAUDE_LESSONS = CONTENT / "claude-lessons.txt"  # weekly lessons written by Claude (no tutor)
ROADMAP = CONTENT / "roadmap.txt"  # learning path stages + level test
RULES = CONTENT / "rules.txt"  # summary of all grammar rules (app page + docs/rules.pdf)
OUT = ROOT / "docs" / "data.js"

sys.stdout.reconfigure(encoding="utf-8")


def cell_text(xml):
    parts = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml)
    return unescape("".join(parts)).strip()


def cell_lines(xml):
    """Cell text keeping its paragraphs as separate lines."""
    lines = [cell_text(p) for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)]
    return "\n".join(l for l in lines if l)


def slug(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def split_english(full):
    """'anomaly (irregularity / ...)' -> ('anomaly', 'irregularity / ...')"""
    m = re.match(r"^([^(\[]+)(.*)$", full)
    head = m.group(1).strip() if m else full
    rest = m.group(2).strip() if m else ""
    note = re.sub(r"\)\s*\(", "; ", rest).strip("() ")
    return head, note


def short_hebrew(he):
    """First translation, without grammar notes in parentheses."""
    no_paren = re.sub(r"\([^)]*\)", "", he)
    first = no_paren.split(" / ")[0]
    first = re.sub(r"\s+", " ", first).strip(" /")
    return first or he


def read_docx():
    z = zipfile.ZipFile(DOCX)
    xml = z.read("word/document.xml").decode("utf8")
    body = re.search(r"<w:body>(.*)</w:body>", xml, re.S).group(1)
    lessons, current_date = [], None
    for m in re.finditer(r"<w:tbl>.*?</w:tbl>|<w:p[ >].*?</w:p>", body, re.S):
        block = m.group(0)
        if not block.startswith("<w:tbl>"):
            t = cell_text(block)
            if re.fullmatch(r"\d{1,2}-\d{1,2}-\d{4}", t):
                current_date = t
            continue
        words = []
        for row in re.findall(r"<w:tr[ >].*?</w:tr>", block, re.S):
            cells = [cell_text(c) for c in re.findall(r"<w:tc>.*?</w:tc>", row, re.S)]
            if len(cells) < 3 or cells[0].lower().startswith("english word"):
                continue
            en, he, ph = cells[0], cells[1], cells[2]
            if not en:
                continue
            words.append(make_word(en, he, ph))
        lessons.append({"date": current_date or "?", "words": words})
    return lessons


def make_word(en, he, ph):
    head, note = split_english(en)
    if head[:1].isupper() and not head[:2].isupper():
        head = head[0].lower() + head[1:]
    return {"id": slug(en), "en": head, "note": note, "full": en,
            "he": short_hebrew(he), "heFull": he, "ph": ph}


def read_claude_lessons():
    """content/claude-lessons.txt:
    ## new lesson dd-mm-yyyy
    TOPIC: <grammar topic key>   (optional)
    WORD: english | hebrew | pronunciation
    """
    lessons, cur = [], None
    if not CLAUDE_LESSONS.exists():
        return lessons
    for line in CLAUDE_LESSONS.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#!"):
            continue
        if line.startswith("## new lesson "):
            cur = {"date": line[14:].strip(), "words": [], "src": "claude"}
            lessons.append(cur)
        elif cur and line.startswith("TOPIC:"):
            cur["topic"] = line[6:].strip()
        elif cur and line.startswith("WORD:"):
            parts = [x.strip() for x in line[5:].split("|")]
            if len(parts) >= 3:
                cur["words"].append(make_word(parts[0], parts[1], parts[2]))
    return lessons


def date_key(d):
    m = re.fullmatch(r"(\d{1,2})-(\d{1,2})-(\d{4})", d or "")
    return (int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else (0, 0, 0)


def assign_ids(lessons):
    # ids: headword slug; same headword with a different meaning gets its qualifier
    # (e.g. "equity-fairness" / "equity-financial-housing", "step-n" / "step-v")
    groups = {}
    for lesson in lessons:
        for w in lesson["words"]:
            groups.setdefault(slug(w["en"]), []).append(w)
    for base, ws in groups.items():
        meanings = {w["he"] for w in ws}
        for w in ws:
            w["id"] = base
            if len(meanings) > 1 and w["note"]:
                qual = w["note"].split(";")[0].split(" - ")[0]
                w["id"] = slug(base + "-" + qual)[:40].strip("-")
    return lessons


def read_sentences():
    """content/*.txt format:

    ## <word-id>
    EN: sentence with the [target] word in brackets
    HE: Hebrew translation
    (repeat EN/HE pairs)

    ## lesson <dd-mm-yyyy>
    EN: a paragraph with several [targets] ...
    HE: translation
    """
    words, paragraphs = {}, {}
    key, kind = None, None
    lines = []
    for f in sorted(CONTENT.glob("*.txt")):
        if f in (GRAMMAR, CLAUDE_LESSONS, ROADMAP, RULES):
            continue
        lines += f.read_text(encoding="utf8").splitlines()
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#!"):
            continue
        if line.startswith("## "):
            key = line[3:].strip()
            if key.startswith("lesson "):
                kind, key = "p", key[7:].strip()
                paragraphs.setdefault(key, [])
            else:
                kind = "w"
                words.setdefault(key, [])
            continue
        target = paragraphs if kind == "p" else words
        if line.startswith("EN:"):
            target[key].append({"en": line[3:].strip(), "he": ""})
        elif line.startswith("HE:") and target.get(key):
            target[key][-1]["he"] = line[3:].strip()
    return words, paragraphs


def read_grammar_docx(path):
    """Every other .docx = a grammar/tips topic: headings + tables, in order."""
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf8")
    body = re.search(r"<w:body>(.*)</w:body>", xml, re.S).group(1)
    blocks = []
    for m in re.finditer(r"<w:tbl>.*?</w:tbl>|<w:p[ >].*?</w:p>", body, re.S):
        b = m.group(0)
        if b.startswith("<w:tbl>"):
            rows = [[cell_lines(c) for c in re.findall(r"<w:tc>.*?</w:tc>", r, re.S)]
                    for r in re.findall(r"<w:tr[ >].*?</w:tr>", b, re.S)]
            rows = [r for r in rows if any(r)]
            if rows:
                blocks.append({"head": rows[0], "rows": rows[1:]})
        else:
            t = cell_text(b).strip()
            if not t:
                continue
            runs = [r for r in re.findall(r"<w:r[ >].*?</w:r>", b, re.S) if re.search(r"<w:t[ >]", r)]
            all_bold = runs and all(re.search(r'<w:b/>|<w:b w:val="(1|true)"/>', r) for r in runs)
            if re.search(r'<w:pStyle w:val="Heading', b) or all_bold:
                blocks.append({"h": t.strip(" *:")})          # heading
            elif t.startswith("•") or "<w:numPr>" in b:
                blocks.append({"li": t.lstrip("•· ").strip()})  # bullet (often a practice / speaking question)
            else:
                blocks.append({"p": t})                      # plain paragraph
    # a short plain line right above a table is that table's title
    for i, blk in enumerate(blocks[:-1]):
        if "p" in blk and "head" in blocks[i + 1] and len(blk["p"]) < 80:
            blocks[i] = {"h": blk["p"].strip(" *:")}
    return blocks


def read_grammar_txt():
    topics, cur, q = {}, None, None
    if not GRAMMAR.exists():
        return topics
    for line in GRAMMAR.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#!"):
            continue
        if line.startswith("## file "):
            cur = topics.setdefault(line[8:].strip(), {"title": "", "he": "", "tips": [], "qs": [], "blocks": [], "src": ""})
            q = None
        elif cur is None:
            continue
        elif line.startswith("TITLE:"):
            cur["title"] = line[6:].strip()
        elif line.startswith("HE:"):
            cur["he"] = line[3:].strip()
        elif line.startswith("TIP:"):
            cur["tips"].append(line[4:].strip())
        elif line.startswith("SOURCE:"):
            cur["src"] = line[7:].strip()
        elif line.startswith("H:"):
            cur["blocks"].append({"h": line[2:].strip()})
        elif line.startswith("P:"):
            cur["blocks"].append({"p": line[2:].strip()})
        elif line.startswith("LI:"):
            cur["blocks"].append({"li": line[3:].strip()})
        elif line.startswith("T:"):
            cells = [c.strip().replace("\\n", "\n") for c in line[2:].split(" | ")]
            last = cur["blocks"][-1] if cur["blocks"] else None
            if last is not None and "head" in last:
                last["rows"].append(cells)
            else:
                cur["blocks"].append({"head": cells, "rows": []})
        elif line.startswith("Q:"):
            q = {"q": line[2:].strip(), "a": [], "why": ""}
            cur["qs"].append(q)
        elif line.startswith("A:"):
            if q is None or q["a"]:
                q = {"q": "", "a": [], "why": ""}
                cur["qs"].append(q)
            q["a"] = [x.strip() for x in line[2:].split(" | ") if x.strip()]
        elif line.startswith("WHY:") and q is not None:
            q["why"] = line[4:].strip()
            q = None
    return topics


def read_grammar():
    info = read_grammar_txt()
    order = list(info)  # topics appear in the order of content/grammar.txt; new files at the end
    files = sorted((f for f in ROOT.glob("*.docx") if f != DOCX and not f.name.startswith("~$")),
                   key=lambda f: (order.index(f.stem) if f.stem in order else len(order), f.stem))
    out, missing = [], []
    for f in files:
        t = info.get(f.stem)
        if not t or not t["qs"]:
            missing.append(f.stem)
        t = t or {"title": f.stem, "he": "", "tips": [], "qs": []}
        out.append({"id": slug(f.stem) or "topic", "file": f.stem, "title": t["title"] or f.stem,
                    "he": t["he"], "tips": t["tips"], "qs": t["qs"], "blocks": read_grammar_docx(f)})
    # topics written by Claude (no Word file): explanation comes from grammar.txt itself
    for key, t in info.items():
        if t.get("src") == "claude" and t.get("blocks"):
            out.append({"id": slug(key), "file": key, "title": t["title"] or key, "he": t["he"],
                        "tips": t["tips"], "qs": t["qs"], "blocks": t["blocks"], "src": "claude"})
    return out, missing


def read_roadmap():
    """content/roadmap.txt:
    ## stage <n> | <level> | <english title> | <hebrew title>
    ITEM: <grammar topic key> | <english title> | <hebrew title>
    ## test <level>
    Q: / A: / WHY:   (same as grammar.txt, first option is correct)
    """
    stages, test, cur, q = [], [], None, None
    if not ROADMAP.exists():
        return {"stages": stages, "test": test}
    for line in ROADMAP.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#!"):
            continue
        if line.startswith("## stage "):
            parts = [x.strip() for x in line[9:].split("|")]
            cur = {"n": parts[0], "level": parts[1], "title": parts[2], "he": parts[3], "items": []}
            stages.append(cur)
            q = None
        elif line.startswith("## test "):
            cur = {"test": line[8:].strip()}
            q = None
        elif line.startswith("ITEM:") and cur and "items" in cur:
            parts = [x.strip() for x in line[5:].split("|")]
            cur["items"].append({"key": parts[0], "title": parts[1], "he": parts[2] if len(parts) > 2 else ""})
        elif cur and "test" in cur:
            if line.startswith("Q:"):
                q = {"level": cur["test"], "q": line[2:].strip(), "a": [], "why": ""}
                test.append(q)
            elif line.startswith("A:"):
                if q is None or q["a"]:
                    q = {"level": cur["test"], "q": "", "a": [], "why": ""}
                    test.append(q)
                q["a"] = [x.strip() for x in line[2:].split(" | ") if x.strip()]
            elif line.startswith("WHY:") and q is not None:
                q["why"] = line[4:].strip()
                q = None
    return {"stages": stages, "test": test}


def read_rules():
    """content/rules.txt: "## <topic key> | <english> | <hebrew>", then R: / EX: / N: lines."""
    out = []
    if not RULES.exists():
        return out
    for line in RULES.read_text(encoding="utf8").splitlines():
        line = line.strip()
        if not line or line.startswith("#!"):
            continue
        if line.startswith("## "):
            parts = [x.strip() for x in line[3:].split("|")]
            out.append({"key": parts[0], "title": parts[1], "he": parts[2] if len(parts) > 2 else "", "items": []})
        elif out and re.match(r"^(R|EX|N):", line):
            t, x = line.split(":", 1)
            out[-1]["items"].append({"t": t, "x": x.strip()})
    return out


def he_mix(t):
    """Hebrew text with English runs wrapped in LTR <bdi> (same as heMix in app.js)."""
    parts = re.split(r"([A-Za-z][A-Za-z0-9 '’.,:!?+/-]*[A-Za-z0-9'’?!])", t)
    return "".join(f'<bdi dir="ltr">{html.escape(p)}</bdi>' if i % 2 else html.escape(p) for i, p in enumerate(parts))


def ex_html(x):
    parts = []
    for p in x.split(" · "):
        cls = "ok" if p.startswith("✓") else "bad" if p.startswith("✗") else ""
        parts.append(f'<span class="{cls}">{html.escape(p)}</span>')
    return " <i>·</i> ".join(parts)


def write_rules_pdf(rules):
    """docs/rules.html (print layout) -> docs/rules.pdf with headless Chrome/Edge, only when rules.txt changed."""
    pdf = ROOT / "docs" / "rules.pdf"
    if not rules or (pdf.exists() and pdf.stat().st_mtime >= RULES.stat().st_mtime):
        return
    secs = []
    for i, r in enumerate(rules):
        rows = []
        for it in r["items"]:
            if it["t"] == "EX":
                rows.append(f'<div class="ex">{ex_html(it["x"])}</div>')
            else:
                cls = "rule" if it["t"] == "R" else "note"
                ico = "📌" if it["t"] == "R" else "⚠️"
                rows.append(f'<div class="{cls}">{ico} {he_mix(it["x"])}</div>')
        num = "" if r["key"] == "tips" else f"{i + 1}. "
        secs.append(f'<section><h2><bdi>{num}{html.escape(r["title"])}</bdi></h2><div class="he-t">{html.escape(r["he"])}</div>{"".join(rows)}</section>')
    doc = f"""<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>English rules</title><style>
@page {{ size: A4; margin: 14mm 13mm; }}
body {{ font-family: Arial, 'Segoe UI', sans-serif; color: #1d2733; font-size: 12.5px; line-height: 1.5; }}
h1 {{ font-size: 22px; margin: 0 0 2px; color: #2b5d8f; }} .sub {{ color: #6b7785; margin-bottom: 12px; }}
section {{ border: 1px solid #d7e0ea; border-radius: 10px; padding: 8px 12px 10px; margin-bottom: 10px; break-inside: avoid; }}
h2 {{ font-size: 16px; margin: 0; color: #2b5d8f; direction: ltr; text-align: right; }}
.he-t {{ color: #6b7785; margin-bottom: 4px; }}
.rule {{ font-weight: bold; margin-top: 6px; }} .note {{ margin-top: 6px; }}
.ex {{ direction: ltr; text-align: left; background: #f1f5f9; border-radius: 6px; padding: 3px 8px; margin-top: 3px; }}
.ex .ok {{ color: #1d8a4f; }} .ex .bad {{ color: #c0392b; text-decoration: line-through; }} .ex i {{ color: #aab4c0; font-style: normal; }}
</style></head><body><h1>סיכום חוקי הדקדוק</h1><div class="sub">📌 חוק · ⚠️ דקות / מלכודת · <span style="color:#1d8a4f">✓ נכון</span> · <span style="color:#c0392b">✗ לא נכון</span></div>
{"".join(secs)}</body></html>"""
    page = ROOT / "docs" / "rules.html"
    page.write_text(doc, encoding="utf8")
    import subprocess
    for exe in (r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"):
        if Path(exe).exists():
            subprocess.run([exe, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                            f"--print-to-pdf={pdf}", page.as_uri()], capture_output=True, timeout=120)
            break
    page.unlink()
    print("Rules PDF:", "written" if pdf.exists() else "FAILED (no Chrome/Edge?)")


def main():
    lessons = read_docx() + read_claude_lessons()
    lessons.sort(key=lambda l: date_key(l["date"]), reverse=True)  # newest first (stable)
    assign_ids(lessons)
    sent, paras = read_sentences()
    seen, missing, total = set(), [], 0
    for lesson in lessons:
        for w in lesson["words"]:
            total += 1
            w["s"] = sent.get(w["id"]) or sent.get(slug(w["en"]), [])
            if not w["s"] and w["id"] not in seen:
                missing.append(w["id"])
            seen.add(w["id"])
        lesson["p"] = paras.get(lesson["date"], [])
    grammar, g_missing = read_grammar()
    roadmap = read_roadmap()
    rules = read_rules()
    data = {"lessons": lessons, "grammar": grammar, "roadmap": roadmap, "rules": rules}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("window.VOCAB = " + json.dumps(data, ensure_ascii=False, indent=0) + ";\n",
                   encoding="utf8")
    no_para = [l["date"] for l in lessons if not l["p"]]
    print(f"Lessons: {len(lessons)}  Words: {total}")
    print(f"Words without sentences ({len(missing)}):")
    for m in missing:
        print("  ", m)
    print(f"Lessons without paragraph ({len(no_para)}): {', '.join(no_para)}")
    print(f"Grammar topics: {len(grammar)}  (" + ", ".join(g["title"] for g in grammar) + ")")
    print(f"Grammar files without title/exercises in content/grammar.txt ({len(g_missing)}): {', '.join(g_missing)}")
    keys = {g["file"] for g in grammar}
    upcoming = [i["key"] for st in roadmap["stages"] for i in st["items"] if i["key"] not in keys]
    print(f"Roadmap: {len(roadmap['stages'])} stages, level test {len(roadmap['test'])} questions; "
          f"next topics not written yet: {', '.join(upcoming[:3])}")
    r_keys = {r["key"] for r in rules}
    print(f"Grammar topics missing from content/rules.txt: {', '.join(g['file'] for g in grammar if g['file'] not in r_keys) or 'none'}")
    write_rules_pdf(rules)
    unknown = [k for k in sent if k not in seen]
    if unknown:
        print("Sentence ids not found in the Word file:", ", ".join(unknown))
    # bump the service-worker cache version so phones pick up the new data
    sw = ROOT / "docs" / "sw.js"
    if sw.exists():
        import time
        txt = sw.read_text(encoding="utf8")
        txt = re.sub(r"const VERSION = '[^']*';", f"const VERSION = 'v{int(time.time())}';", txt)
        sw.write_text(txt, encoding="utf8")


if __name__ == "__main__":
    main()
