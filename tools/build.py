"""Build docs/data.js from "Giora Bar.docx" + content/sentences.txt.

Usage (from the project folder):
    python tools/build.py

Prints which words are still missing example sentences / which lessons
are missing a paragraph, so they can be written in content/sentences.txt.
"""
import json
import re
import sys
import zipfile
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT / "Giora Bar.docx"
CONTENT = ROOT / "content"  # every *.txt here holds sentences
OUT = ROOT / "docs" / "data.js"

sys.stdout.reconfigure(encoding="utf-8")


def cell_text(xml):
    parts = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml)
    return unescape("".join(parts)).strip()


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
            head, note = split_english(en)
            if head[:1].isupper() and not head[:2].isupper():
                head = head[0].lower() + head[1:]
            words.append({
                "id": slug(en),
                "en": head,
                "note": note,
                "full": en,
                "he": short_hebrew(he),
                "heFull": he,
                "ph": ph,
            })
        lessons.append({"date": current_date or "?", "words": words})
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


def main():
    lessons = read_docx()
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
    data = {"lessons": lessons}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("window.VOCAB = " + json.dumps(data, ensure_ascii=False, indent=0) + ";\n",
                   encoding="utf8")
    no_para = [l["date"] for l in lessons if not l["p"]]
    print(f"Lessons: {len(lessons)}  Words: {total}")
    print(f"Words without sentences ({len(missing)}):")
    for m in missing:
        print("  ", m)
    print(f"Lessons without paragraph ({len(no_para)}): {', '.join(no_para)}")
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
