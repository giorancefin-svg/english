# Giora's English vocabulary app

Personal iPhone web app (PWA) for practising the words his English tutor writes in `Giora Bar.docx`.
Hosted free on GitHub Pages from the `docs/` folder. UI is Hebrew (RTL); content is English.

## Layout
- `Giora Bar.docx` — tutor's file. One table per lesson (newest first), dated paragraph above each table.
  Columns: English Word / Phrase | Hebrew Translation | English Phonetic Pronunciation.
- `tools/build.py` — reads the docx + `content/*.txt`, writes `docs/data.js`, bumps the cache VERSION in `docs/sw.js`,
  and prints words that have no sentences and lessons with no paragraph.
- `content/*.txt` — example sentences written by Claude (EN with the target in `[brackets]` + HE translation),
  4 per word (for variety), plus one `## lesson dd-mm-yyyy` paragraph per lesson. Ids are printed by build.py.
- Any other `*.docx` in the root = a grammar/tips topic from the tutor (headings + tables). build.py copies its tables
  as-is into the "דקדוק וטיפים" tab. `content/grammar.txt` holds, per file (`## file <name without .docx>`): TITLE,
  HE title, TIP lines (short Hebrew key points) and exercises (Q: with ___ / A: options, first is correct / WHY: Hebrew).
  The app's interface can be Hebrew or English (`L(he, en)` in app.js) — new UI text needs both.
- `docs/` — the app: `index.html`, `app.js` (all logic, vanilla JS), `style.css`, `sw.js`, `manifest.json`, `icons/`.
- Preview locally: `.claude/launch.json` → `english-app` (python http.server on port 8765).

## Weekly update ("עדכן" / "הוספתי מילים")
1. `python tools/build.py` → note the ids listed under "Words without sentences" and lessons without a paragraph.
2. Write 4 sentences for each of them in a new file `content/NN-<month>.txt` (same format; simple, everyday English,
   prefer topics from his life: insurance/pensions/finance work, gym, home, family). Hebrew translation for each.
3. New grammar/tips Word file? build.py lists it under "Grammar files without title/exercises" — add a
   `## file <name>` block to `content/grammar.txt` (title, Hebrew title, 3–4 TIPs, ~20 exercises with WHY — a round shows 10, least recently seen first).
4. Run build.py again until nothing is missing.
5. Commit and push (`git add -A && git commit && git push`). GitHub Pages updates in ~1 minute;
   the iPhone app picks up the new words next time it is opened online.
