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
- `content/claude-lessons.txt` — weekly lessons written by Claude (the private lessons ended 11-2026):
  `## new lesson dd-mm-yyyy`, `TOPIC:` grammar key, `WORD: en | he | pronunciation`. Marked 🤖 in the app.
  Grammar topics without a Word file live in grammar.txt with `SOURCE: claude` and `H:/P:/LI:/T:` lines (T: = table row).
- `content/rules.txt` — one-page summary of every grammar rule (R: rule, N: subtlety, EX: examples with ✓/✗), in path order.
  Shown in the app (🧩 → 📋) and built into `docs/rules.pdf` by build.py (headless Chrome). Every grammar topic needs a block;
  build.py lists topics missing from it.
- `content/roadmap.txt` — the learning path (stages A2→B2, ITEM = grammar topic key) and the level test (A2/B1/B2).
- App tabs: 📚 words · 🧩 grammar · 🗣 speaking (in-app speech drills + copyable tutor prompt for the Claude app) · 🧭 path.
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

## New lesson ("שיעור חדש") — no tutor anymore
1. `python tools/build.py` → "next topics not written yet" shows the next roadmap item.
2. Add `## new lesson <today dd-mm-yyyy>` to `content/claude-lessons.txt`: TOPIC = that item's key, 10–12 useful words
   (B1–B2, prefer words that fit the grammar topic and his life), each `WORD: en | he with niqqud | pronunciation`.
3. New `content/NN-claude-<dd-mm>.txt`: 4 sentences per word + a `## lesson <date>` paragraph using most of the words.
4. Grammar topic in `content/grammar.txt`: `## file <key>`, `SOURCE: claude`, TITLE, HE, 3–4 TIPs, explanation
   (H:/T:/P: lines, tables with examples), ~20 exercises with WHY. Mix in earlier topics' traps sometimes.
5. Add the topic's block to `content/rules.txt` (rules, subtleties, ✓/✗ examples).
6. Build until nothing is missing, check in the preview, commit and push.
