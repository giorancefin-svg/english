/* English practice app for Giora — vanilla JS, works offline. */
(function () {
  'use strict';

  // ---------- data ----------
  const LESSONS = (window.VOCAB && window.VOCAB.lessons) || [];
  LESSONS.forEach(l => l.words.forEach(w => { w.lesson = l.date; }));
  const ALL = [];
  const BY_ID = {};
  LESSONS.forEach(l => l.words.forEach(w => {
    if (!BY_ID[w.id]) { BY_ID[w.id] = w; ALL.push(w); }   // newest lesson wins
  }));

  // ---------- storage ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('ge_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ge_' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const settings = Object.assign({ showHe: false, showPh: false, autoSay: false, lang: 'he', tab: 'vocab', scope: 'all', round: 10, rate: 0.85, streak: 0, lastDay: '' },
    LS.get('settings', {}));
  const prog = LS.get('progress', {});
  const saveSettings = () => LS.set('settings', settings);
  if (!Array.isArray(settings.lessons)) settings.lessons = [];
  if (/^\d/.test(settings.scope)) { settings.lessons = [settings.scope]; settings.scope = 'custom'; }
  const saveProg = () => LS.set('progress', prog);
  // interface language: L('עברית', 'English') picks by settings.lang (content stays as is)
  const L = (he, en) => settings.lang === 'en' ? en : he;
  function applyLang() {
    const en = settings.lang === 'en';
    document.documentElement.lang = en ? 'en' : 'he';
    document.documentElement.dir = en ? 'ltr' : 'rtl';
    document.getElementById('backBtn').textContent = en ? '←' : '→';
  }

  const DAY = 86400000;
  const INTERVALS = [10 / 1440, 1, 2, 4, 8, 16, 32]; // days per box
  function grade(id, ok) {
    if (!id) return;
    const p = prog[id] || (prog[id] = { b: 0, ok: 0, bad: 0, due: 0 });
    if (ok) { p.ok++; p.b = Math.min(p.b + 1, 6); } else { p.bad++; p.b = 0; }
    p.due = Date.now() + INTERVALS[p.b] * DAY;
    saveProg();
    touchStreak();
  }
  function touchStreak() {
    const today = new Date().toDateString();
    if (settings.lastDay === today) return;
    const yesterday = new Date(Date.now() - DAY).toDateString();
    settings.streak = settings.lastDay === yesterday ? settings.streak + 1 : 1;
    settings.lastDay = today;
    saveSettings();
  }
  const box = w => (prog[w.id] ? prog[w.id].b : -1);
  const isDue = w => prog[w.id] && prog[w.id].due <= Date.now();

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const view = $('#view');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  // variety: remember when each sentence / paragraph / grammar question was last shown,
  // and always prefer the ones not seen for the longest time
  const seen = LS.get('seen', {});
  const seenKey = k => String(k).slice(0, 90);
  const seenAt = k => seen[seenKey(k)] || 0;
  function markSeen(k) {
    seen[seenKey(k)] = Date.now();
    const ks = Object.keys(seen);
    if (ks.length > 4000) ks.sort((a, b) => seen[a] - seen[b]).slice(0, ks.length - 3000).forEach(x => delete seen[x]);
    LS.set('seen', seen);
  }
  function freshPick(arr, keyOf = x => x.en) {
    const best = Math.min(...arr.map(x => seenAt(keyOf(x))));
    const it = pick(arr.filter(x => seenAt(keyOf(x)) === best));
    markSeen(keyOf(it));
    return it;
  }
  const freshOrder = (arr, keyOf) => shuffle(arr).sort((a, b) => seenAt(keyOf(a)) - seenAt(keyOf(b)));
  const plain = s => String(s).replace(/\[([^\]]+)\]/g, '$1');
  const norm = s => String(s).toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9']/g, '');
  function lev(a, b) {
    const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  const forms = w => w.en.split('/').map(s => s.trim()).filter(Boolean);
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 1800);
  }
  function fmtDate(d) { const p = d.split('-'); return p.length === 3 ? `${p[0]}/${p[1]}` : d; }

  // ---------- speech ----------
  let voice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    const pref = ['Samantha', 'Ava', 'Allison', 'Susan', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Alex', 'Daniel'];
    voice = null;
    for (const name of pref) { voice = vs.find(v => v.name.indexOf(name) >= 0 && /en[-_]US|en[-_]GB/i.test(v.lang)); if (voice) break; }
    if (!voice) voice = vs.find(v => /en[-_]US/i.test(v.lang)) || vs[0] || null;
  }
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text, slow) {
    if (!('speechSynthesis' in window)) { toast(L('אין תמיכה בהשמעה במכשיר', 'Speech is not supported on this device')); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain(text).replace(/\s*\/\s*/g, ', '));
    u.lang = voice ? voice.lang : 'en-US';
    if (voice) u.voice = voice;
    u.rate = slow ? Math.max(0.45, settings.rate - 0.35) : settings.rate;
    speechSynthesis.speak(u);
  }
  // automatic speech (when a question opens / an answer is shown) only if the 🔊 toggle is on
  function autoSpeak(text) { if (settings.autoSay) speak(text); }
  // delegate all speak buttons
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) { e.stopPropagation(); speak(b.getAttribute('data-say'), b.hasAttribute('data-slow')); }
  });

  // ---------- top bar ----------
  const tglHe = $('#tglHe'), tglPh = $('#tglPh'), tglSay = $('#tglSay'), backBtn = $('#backBtn'), title = $('#title');
  function syncToggles() {
    tglHe.classList.toggle('on', settings.showHe);
    tglPh.classList.toggle('on', settings.showPh);
    tglSay.classList.toggle('on', settings.autoSay);
    tglSay.textContent = settings.autoSay ? '🔊' : '🔇';
    document.body.classList.toggle('show-he', settings.showHe);
    document.body.classList.toggle('show-ph', settings.showPh);
    document.querySelectorAll('[data-auto="he"]').forEach(el => el.classList.toggle('hidden', !settings.showHe && !el.dataset.open));
    document.querySelectorAll('[data-auto="ph"]').forEach(el => el.classList.toggle('hidden', !settings.showPh && !el.dataset.open));
  }
  tglHe.onclick = () => { settings.showHe = !settings.showHe; saveSettings(); syncToggles(); toast(settings.showHe ? L('תרגום לעברית מוצג', 'Hebrew translation shown') : L('תרגום לעברית מוסתר', 'Hebrew translation hidden')); };
  tglPh.onclick = () => { settings.showPh = !settings.showPh; saveSettings(); syncToggles(); toast(settings.showPh ? L('הגייה מוצגת', 'Pronunciation shown') : L('הגייה מוסתרת', 'Pronunciation hidden')); };
  tglSay.onclick = () => {
    settings.autoSay = !settings.autoSay; saveSettings(); syncToggles();
    if (!settings.autoSay && 'speechSynthesis' in window) speechSynthesis.cancel();
    toast(settings.autoSay ? L('השמעה אוטומטית פועלת', 'Auto-play is on') : L('השמעה אוטומטית כבויה (אפשר ללחוץ 🔊 ליד כל מילה)', 'Auto-play is off (tap 🔊 next to any word)'));
  };
  backBtn.onclick = () => home();
  function screen(name, isHome) {
    title.textContent = name;
    title.classList.toggle('long', String(name).length > 20);
    backBtn.classList.toggle('hidden', !!isHome);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    window.scrollTo(0, 0);
  }
  // helper blocks that follow the global toggles but can be opened per question
  const autoHe = (html, cls = 'he-line') => `<div class="${cls} he" data-auto="he">${html}</div>`;
  const autoPh = (html, cls = 'ph') => `<div class="${cls} en" data-auto="ph">${html}</div>`;
  function helperBar(opts) {
    // opts: {say, he, ph}
    let h = '<div class="helpers">';
    if (opts.say) h += `<button class="help" data-say="${esc(opts.say)}">🔊 ${L('השמע', 'Play')}</button><button class="help" data-say="${esc(opts.say)}" data-slow>🐢 ${L('לאט', 'Slow')}</button>`;
    if (opts.he) h += `<button class="help" data-open="he">${L('עב תרגום', 'עב Translation')}</button>`;
    if (opts.ph) h += `<button class="help" data-open="ph">🗣 ${L('איך קוראים', 'Pronunciation')}</button>`;
    return h + '</div>';
  }
  view.addEventListener('click', e => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    const kind = b.getAttribute('data-open');
    const scope = b.closest('.card') || view;
    scope.querySelectorAll(`[data-auto="${kind}"]`).forEach(el => { el.dataset.open = '1'; el.classList.remove('hidden'); });
  });

  // ---------- pools ----------
  function scopeWords() {
    const s = settings.scope;
    let words;
    if (s === 'all') words = ALL;
    else if (s === 'newest') words = (LESSONS[0] || { words: [] }).words;
    else if (s === 'last3') { words = []; LESSONS.slice(0, 3).forEach(l => words.push(...l.words)); }
    else if (s === 'weak') words = ALL.filter(w => prog[w.id] && (prog[w.id].bad > 0 && prog[w.id].b < 3));
    else { words = []; chosenLessons().forEach(l => words.push(...l.words)); }
    const seen = {}; words = words.filter(w => !seen[w.id] && (seen[w.id] = 1)).map(w => BY_ID[w.id]);
    return words;
  }
  // lessons ticked in "choose lessons" (falls back to the newest lesson if none ticked)
  function chosenLessons() {
    const ls = LESSONS.filter(l => settings.lessons.indexOf(l.date) >= 0);
    return ls.length ? ls : LESSONS.slice(0, 1);
  }
  function scopeLabel() {
    const s = settings.scope;
    if (s === 'all') return L('כל המילים', 'All words');
    if (s === 'newest') return L('השיעור האחרון', 'Latest lesson');
    if (s === 'last3') return L('3 השיעורים האחרונים', 'Last 3 lessons');
    if (s === 'weak') return L('מילים שטעיתי בהן', 'Words I got wrong');
    return L('שיעורים נבחרים', 'Selected lessons');
  }
  // choose words for a round: due first, then new / weak, a bit of randomness
  function chooseWords(pool, n) {
    const now = Date.now();
    const scored = pool.map(w => {
      const p = prog[w.id];
      let score;
      if (!p) score = 2;                         // new
      else if (p.due <= now) score = 0 + p.b * 0.3; // due
      else score = 4 + p.b;                      // not yet due
      return { w, s: score + Math.random() * 2.5 };
    });
    scored.sort((a, b) => a.s - b.s);
    return scored.slice(0, Math.min(n, pool.length)).map(x => x.w);
  }
  function distractors(word, n, key) {
    const val = w => key(w);
    const mine = norm(val(word));
    const out = [], seen = { [mine]: 1 };
    for (const w of shuffle(ALL)) {
      const v = val(w); const k = norm(v) || v;
      if (!v || seen[k]) continue;
      seen[k] = 1; out.push(w);
      if (out.length >= n) break;
    }
    return out;
  }

  // ---------- home ----------
  const MODES = () => [
    { id: 'smart', ico: '🧠', name: L('חזרה חכמה', 'Smart review'), desc: L('שילוב של כל סוגי התרגול, לפי מה שצריך לחזור עליו', 'A mix of all exercise types, based on what you need to review'), wide: true },
    { id: 'flash', ico: '🃏', name: L('כרטיסיות', 'Flashcards'), desc: L('מילה ← הפוך לתרגום', 'Word → flip for the translation') },
    { id: 'en2he', ico: '🔤', name: L('מה הפירוש?', 'What does it mean?'), desc: L('אנגלית ← בחר בעברית', 'English → choose the Hebrew') },
    { id: 'he2en', ico: '💬', name: L('איך אומרים?', 'How do you say it?'), desc: L('עברית ← בחר באנגלית', 'Hebrew → choose the English') },
    { id: 'sentence', ico: '✏️', name: L('השלם משפט', 'Complete the sentence'), desc: L('בחר את המילה החסרה', 'Choose the missing word') },
    { id: 'sentenceType', ico: '⌨️', name: L('השלם משפט בכתיבה', 'Type the missing word'), desc: L('הקלד את המילה החסרה', 'Type the word that completes the sentence') },
    { id: 'paragraph', ico: '📄', name: L('השלם פסקה', 'Complete the paragraph'), desc: L('סיפור קצר עם מילים חסרות', 'A short story with missing words') },
    { id: 'listen', ico: '🎧', name: L('שמע וכתוב', 'Listen and write'), desc: L('הקשב ואיית את המילה', 'Listen and spell the word') },
    { id: 'match', ico: '🔗', name: L('התאמה', 'Matching'), desc: L('חבר מילה לתרגום', 'Match each word to its translation') },
    { id: 'list', ico: '📚', name: L('רשימת המילים', 'Word list'), desc: L('כל המילים לפי שיעור', 'All words by lesson') },
    { id: 'reminder', ico: '🔔', name: L('תזכורת יומית', 'Daily reminder'), desc: L('הודעה מעודדת כל ערב', 'An encouraging message every evening') },
    { id: 'settings', ico: '⚙️', name: L('הגדרות', 'Settings'), desc: L('מהירות דיבור, אורך סבב', 'Language, speech speed, round length') }
  ];
  function home() {
    screen(L('English עם גיורא', 'English with Giora'), true);
    if (curTab() === 'grammar') return grammarHome();
    if (curTab() === 'speak') return speakHome();
    if (curTab() === 'path') return pathHome();
    const total = ALL.length;
    const learned = ALL.filter(w => box(w) >= 3).length;
    const due = ALL.filter(isDue).length;
    const opts = [['all', L('כל המילים', 'All words')], ['newest', L('השיעור האחרון', 'Latest lesson')], ['last3', L('3 השיעורים האחרונים', 'Last 3 lessons')], ['weak', L('מילים שטעיתי בהן', 'Words I got wrong')], ['custom', L('בחירת שיעורים (כמה שאני רוצה)', 'Choose lessons (as many as I want)')]];
    view.innerHTML = tabsHtml() + `
      <div class="card stats">
        <div class="stat"><b>${learned}/${total}</b><span>${L('מילים שלמדתי', 'words learned')}</span></div>
        <div class="stat"><b>${due}</b><span>${L('לחזרה עכשיו', 'due for review')}</span></div>
        <div class="stat"><b>${settings.streak || 0}🔥</b><span>${L('ימים ברצף', 'day streak')}</span></div>
      </div>
      <div class="card">
        <div class="row" style="margin-bottom:6px"><span class="muted">${L('על אילו מילים לתרגל?', 'Which words to practice?')}</span><span class="spacer"></span><button class="help" id="langBtn">${settings.lang === 'en' ? '🌐 עברית' : '🌐 English'}</button></div>
        <select class="select" id="scope">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === settings.scope ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <div id="lessonPick" class="${settings.scope === 'custom' ? '' : 'hidden'}">
          <div class="row" style="margin:10px 0 4px"><span class="muted" id="pickCount"></span><span class="spacer"></span>
            <button class="help" id="pickAll">${L('סמן הכל', 'Select all')}</button><button class="help" id="pickNone">${L('נקה', 'Clear')}</button></div>
          <div class="lesson-list">${LESSONS.map(l => `<label class="lesson-item"><input type="checkbox" value="${esc(l.date)}" ${settings.lessons.indexOf(l.date) >= 0 ? 'checked' : ''}>
            <span>${L('שיעור', 'Lesson')} ${esc(l.date)}${l.src === 'claude' ? ' 🤖' : ''}</span><span class="spacer"></span><span class="muted">${l.words.length} ${L('מילים', 'words')}</span></label>`).join('')}</div>
        </div>
      </div>
      <div class="modes">${MODES().map(m => `<button class="mode ${m.wide ? 'wide' : ''}" data-mode="${m.id}"><span class="ico">${m.ico}</span><b>${m.name}</b><small>${m.desc}</small></button>`).join('')}</div>`;
    const pickBox = $('#lessonPick');
    const updateCount = () => {
      const n = settings.lessons.length;
      const words = scopeWordsCount();
      $('#pickCount').textContent = n ? L(`נבחרו ${n} שיעורים · ${words} מילים`, `${n} lessons selected · ${words} words`) : L('לא נבחר שיעור — סמן שיעור אחד או יותר', 'No lesson selected — tick one or more');
    };
    const scopeWordsCount = () => { const ids = {}; chosenLessons().forEach(l => l.words.forEach(w => ids[w.id] = 1)); return settings.lessons.length ? Object.keys(ids).length : 0; };
    $('#scope').onchange = e => {
      settings.scope = e.target.value; saveSettings();
      pickBox.classList.toggle('hidden', settings.scope !== 'custom');
      updateCount();
    };
    const readChecks = () => {
      settings.lessons = [...pickBox.querySelectorAll('input:checked')].map(c => c.value);
      saveSettings(); updateCount();
    };
    pickBox.querySelectorAll('input').forEach(c => c.onchange = readChecks);
    $('#pickAll').onclick = () => { pickBox.querySelectorAll('input').forEach(c => c.checked = true); readChecks(); };
    $('#pickNone').onclick = () => { pickBox.querySelectorAll('input').forEach(c => c.checked = false); readChecks(); };
    updateCount();
    bindTabs();
    view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => start(b.dataset.mode));
  }

  function start(mode) {
    if (mode === 'list') return listScreen();
    if (mode === 'settings') return settingsScreen();
    if (mode === 'reminder') return reminderScreen();
    if (settings.scope === 'custom' && !settings.lessons.length) { toast(L('סמן לפחות שיעור אחד', 'Tick at least one lesson')); return; }
    if (mode === 'paragraph') return paragraphScreen();
    let pool = scopeWords();
    if (pool.length < 4) {
      if (settings.scope === 'weak') toast(L('אין מספיק מילים שטעית בהן — מתרגלים את כל המילים', 'Not enough missed words — practicing all words'));
      pool = pool.length ? pool.concat(chooseWords(ALL.filter(w => pool.indexOf(w) < 0), 8)) : ALL;
    }
    if (mode === 'match') return matchScreen(pool);
    if (mode === 'speakT' || mode === 'speakR') { const ws = pool.filter(w => w.s && w.s.length); pool = ws.length >= 4 ? ws : ALL.filter(w => w.s && w.s.length); }
    runRound(mode, pool);
  }

  // ---------- round runner ----------
  const TITLES = () => Object.fromEntries(MODES().concat(SPEAK_MODES()).map(m => [m.id, m.name]));
  function runRound(mode, pool) {
    const words = chooseWords(pool, settings.round);
    let i = 0, score = 0;
    const firstCount = words.length;
    const missed = [];
    screen(TITLES()[mode]);
    const next = () => {
      if (i >= words.length) return results(mode, score, firstCount, missed, pool);
      const w = words[i];
      let type = mode;
      if (mode === 'smart') {
        const b = box(w);
        const choices = b < 1 ? ['en2he', 'he2en', 'sentence', 'flash'] : b < 3 ? ['sentence', 'he2en', 'en2he', 'listen', 'sentenceType'] : ['sentenceType', 'listen', 'sentence', 'he2en'];
        type = pick(choices);
      }
      const counter = i < firstCount
        ? L(`שאלה <b>${i + 1}</b> מתוך <b>${firstCount}</b>`, `Question <b>${i + 1}</b> of <b>${firstCount}</b>`)
        : L(`חזרה על מילים שפספסת: <b>${i - firstCount + 1}</b> מתוך <b>${words.length - firstCount}</b>`, `Reviewing missed words: <b>${i - firstCount + 1}</b> of <b>${words.length - firstCount}</b>`);
      view.innerHTML = `<div class="counter"><span>${counter}</span><span class="spacer"></span><span>✓ ${score}</span></div>
        <div class="progress"><i style="width:${(i / words.length) * 100}%"></i></div><div id="q"></div>`;
      EX[type]($('#q'), w, ok => {
        grade(w.id, ok);
        const first = i < firstCount;
        if (ok && first) score++;
        if (!ok && first) {
          missed.push(w);
          words.push(w); // ask it again at the end of this round
        }
        i++;
      }, next);
      syncToggles();
    };
    next();
  }
  function results(mode, score, total, missed, pool) {
    const pct = total ? Math.round(score / total * 100) : 0;
    const msg = pct === 100 ? L('מושלם! 🏆', 'Perfect! 🏆') : pct >= 80 ? L('כל הכבוד! 👏', 'Well done! 👏') : pct >= 50 ? L('יפה, ממשיכים להתאמן 💪', 'Nice, keep practicing 💪') : L('כל תרגול מקרב אותך 🙂', 'Every practice gets you closer 🙂');
    view.innerHTML = `
      <div class="card result"><div class="score">${score}/${total}</div><div style="font-size:20px">${msg}</div></div>
      ${missed.length ? `<div class="card"><div class="muted" style="margin-bottom:6px">${L('מילים לחזור עליהן:', 'Words to review:')}</div>${missed.map(wordRow).join('')}</div>` : ''}
      <button class="btn" id="again">${L('סבב נוסף', 'Another round')}</button>
      <button class="btn secondary" id="toHome">${L('לתפריט הראשי', 'Main menu')}</button>`;
    $('#again').onclick = () => runRound(mode, pool);
    $('#toHome').onclick = home;
    syncToggles();
  }

  // ---------- exercise types ----------
  // each: (el, word, record(ok), next)
  const nextBtn = (el, next, label = L('הבא ←', 'Next →')) => {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = label;
    b.onclick = next; el.appendChild(b); b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const wordHead = w => `
    <div class="row" style="justify-content:center">
      <div class="big en">${esc(w.en)}</div>
      <button class="speak" data-say="${esc(w.en)}">🔊</button>
    </div>`;
  function sentenceHtml(s, cls = 'blank') {
    return esc(s).replace(/\[([^\]]+)\]/g, `<span class="${cls}">&nbsp;</span>`);
  }

  // after a sentence is completed: play it once and add buttons to hear it again (normal / slow)
  function replayButtons(el, text) {
    const card = $('.card', el);
    card.insertAdjacentHTML('beforeend', `<div class="helpers"><button class="help" data-say="${esc(text)}">🔊 ${L('השמע את המשפט שוב', 'Play the sentence again')}</button><button class="help" data-say="${esc(text)}" data-slow>🐢 ${L('לאט', 'Slow')}</button></div>`);
    autoSpeak(text);
  }

  const EX = {};

  EX.flash = (el, w, record, next) => {
    const s = w.s && w.s.length ? freshPick(w.s) : null;
    el.innerHTML = `
      <div class="card flash" id="fc">
        ${wordHead(w)}
        ${autoPh(esc(w.ph))}
        <div id="back" class="hidden" style="margin-top:10px">
          <div class="he" style="font-size:24px;font-weight:700">${esc(w.he)}</div>
          <div class="note he">${esc(w.heFull)}</div>
          ${w.note ? `<div class="note en">${esc(w.note)}</div>` : ''}
          ${s ? `<div class="en" style="margin-top:12px;font-size:17px">${esc(plain(s.en))} <button class="speak small" data-say="${esc(s.en)}">🔊</button></div><div class="note he">${esc(s.he)}</div>` : ''}
        </div>
        <div class="muted" id="tapHint" style="margin-top:14px">${L('לחץ על הכרטיס כדי לראות את התרגום', 'Tap the card to see the translation')}</div>
      </div>
      <div id="act"></div>`;
    autoSpeak(w.en);
    $('#fc', el).onclick = () => {
      if (!$('#back', el).classList.contains('hidden')) return;
      $('#back', el).classList.remove('hidden');
      $('#tapHint', el).classList.add('hidden');
      el.querySelectorAll('[data-auto="ph"]').forEach(x => { x.dataset.open = 1; x.classList.remove('hidden'); });
      $('#act', el).innerHTML = `<div class="btn-row"><button class="btn bad" id="no">${L('עוד לא ✗', 'Not yet ✗')}</button><button class="btn ok" id="yes">${L('ידעתי ✓', 'I knew it ✓')}</button></div>`;
      $('#yes', el).onclick = () => { record(true); next(); };
      $('#no', el).onclick = () => { record(false); next(); };
    };
  };

  const optSay = t => `<button class="speak small opt-say" data-say="${esc(t)}" aria-label="play">🔊</button>`;
  function choiceQuestion(el, w, record, next, cfg) {
    // cfg: {prompt, head, options:[{label, word}], correctWord, after}
    el.innerHTML = `<div class="card">${cfg.head}</div><div class="options">${cfg.options.map((o, i) =>
      `<div class="opt-row"><button class="opt ${o.cls || ''}" data-i="${i}">${o.label}</button>${o.say && !cfg.revealEn ? optSay(o.say) : ''}</div>`).join('')}</div>
      <button class="btn secondary" id="idk">🤷 ${L('לא יודע — הראה לי', 'I don\'t know — show me')}</button><div id="fb"></div>`;
    const answer = b => {
      const idk = !b;
      const ok = !idk && cfg.options[+b.dataset.i].word === cfg.correctWord;
      $('#idk', el).remove();
      el.querySelectorAll('.opt').forEach(x => {
        x.disabled = true;
        const ow = cfg.options[+x.dataset.i].word;
        if (ow === cfg.correctWord) x.classList.add('ok');
        // after answering, show the translation of every option (not only the right one)
        if (cfg.revealEn) x.insertAdjacentHTML('afterend', optSay(ow.en));
        x.insertAdjacentHTML('beforeend', cfg.revealEn
          ? `<div class="note en" style="text-align:center">${esc(ow.en)}</div>`
          : `<div class="note he">${esc(ow.he)}</div>`);
      });
      if (!ok && !idk) b.classList.add('bad');
      record(ok);
      if (cfg.after) cfg.after(ok);
      const fb = $('#fb', el);
      fb.innerHTML = feedback(ok, w, '', idk);
      el.querySelectorAll('[data-auto]').forEach(x => { x.dataset.open = 1; x.classList.remove('hidden'); });
      nextBtn(fb, next);
    };
    el.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(b));
    $('#idk', el).onclick = () => answer(null);
  }
  function feedback(ok, w, extra = '', idk = false) {
    const head = ok ? L('נכון! ✓', 'Correct! ✓') : idk ? L('לא נורא — הנה התשובה. נתרגל את המילה הזאת שוב 💪', 'No problem — here\'s the answer. We\'ll practice this word again 💪') : L('לא נכון ✗ — נתרגל את המילה הזאת שוב', 'Not quite ✗ — we\'ll practice this word again');
    return `<div class="feedback ${ok ? 'ok' : 'bad'}">${head} ${extra}
      <div class="row" style="margin-top:6px"><span class="en" style="font-weight:700">${esc(w.en)}</span>
      <span class="ph en">${esc(w.ph)}</span><span class="spacer"></span>
      <button class="speak small" data-say="${esc(w.en)}">🔊</button></div>
      <div class="he" style="color:var(--ink)">${esc(w.he)}</div></div>`;
  }

  EX.en2he = (el, w, record, next) => {
    const opts = shuffle([w].concat(distractors(w, 3, x => x.he)));
    choiceQuestion(el, w, record, next, {
      head: `<div class="prompt">${L('מה הפירוש של המילה?', 'What does this word mean?')}</div>${wordHead(w)}${autoPh(esc(w.ph))}${w.note ? `<div class="note en">${esc(w.note)}</div>` : ''}${helperBar({ ph: true })}`,
      options: opts.map(o => ({ label: `<span class="he">${esc(o.he)}</span>`, word: o })),
      correctWord: w,
      revealEn: true
    });
    autoSpeak(w.en);
  };

  EX.he2en = (el, w, record, next) => {
    const opts = shuffle([w].concat(distractors(w, 3, x => x.en)));
    choiceQuestion(el, w, record, next, {
      head: `<div class="prompt">${L('איך אומרים באנגלית?', 'How do you say it in English?')}</div><div class="big he" style="text-align:center">${esc(w.he)}</div>`,
      options: opts.map(o => ({ label: `<span class="en">${esc(o.en)}</span>${autoPh(esc(o.ph), 'ph note')}`, word: o, say: o.en })),
      correctWord: w,
      after: () => autoSpeak(w.en)
    });
  };

  function pickSentence(w) { return w.s && w.s.length ? freshPick(w.s) : { en: `[${w.en}]`, he: w.he }; }
  const answerOf = s => { const m = s.en.match(/\[([^\]]+)\]/); return m ? m[1] : ''; };

  EX.sentence = (el, w, record, next) => {
    const s = pickSentence(w);
    const ans = answerOf(s);
    // distractors: answers from other words' sentences (same style of word form)
    const others = [];
    const seen = { [norm(ans)]: 1 };
    for (const o of shuffle(ALL)) {
      if (o.id === w.id || !o.s || !o.s.length) continue;
      const a = answerOf(pick(o.s));
      if (!a || seen[norm(a)]) continue;
      seen[norm(a)] = 1; others.push({ a, o });
      if (others.length === 3) break;
    }
    const opts = shuffle([{ a: ans, o: w }].concat(others));
    choiceQuestion(el, w, record, next, {
      head: `<div class="prompt">${L('בחר את המילה שחסרה במשפט:', 'Choose the missing word:')}</div>
        <div class="sentence en">${sentenceHtml(s.en)}</div>
        ${autoHe(esc(s.he))}
        ${helperBar({ he: true })}`,
      options: opts.map(x => ({ label: `<span class="en">${esc(x.a)}</span>${autoPh(esc(x.o.ph), 'ph note')}`, word: x.o, say: x.a })),
      correctWord: w,
      after: ok => {
        const b = $('.blank', el); b.textContent = ans; b.classList.add(ok ? 'ok' : 'bad');
        replayButtons(el, s.en);
      }
    });
  };

  function typeQuestion(el, w, record, next, cfg) {
    // cfg: {head, answers:[...], shown, onDone}
    el.innerHTML = `<div class="card">${cfg.head}</div>
      <input class="input" id="inp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="type here…">
      <button class="btn" id="check">${L('בדוק', 'Check')}</button>
      <button class="btn secondary" id="idk">${L('לא יודע — הראה לי', 'I don\'t know — show me')}</button>
      <div id="fb"></div>`;
    const inp = $('#inp', el);
    setTimeout(() => inp.focus(), 50);
    let done = false;
    const finish = (ok, extra, idk) => {
      if (done) return; done = true;
      record(ok);
      inp.classList.add(ok ? 'ok' : 'bad'); inp.disabled = true;
      $('#check', el).remove(); $('#idk', el).remove();
      el.querySelectorAll('[data-auto]').forEach(x => { x.dataset.open = 1; x.classList.remove('hidden'); });
      if (cfg.onDone) cfg.onDone(ok);
      const fb = $('#fb', el);
      fb.innerHTML = feedback(ok, w, extra, idk);
      nextBtn(fb, next);
    };
    const check = () => {
      const v = norm(inp.value);
      if (!v) { inp.focus(); return; }
      const answers = cfg.answers.map(norm);
      if (answers.indexOf(v) >= 0) return finish(true);
      const loose = cfg.loose ? cfg.loose.map(norm) : [];
      if (loose.indexOf(v) >= 0) return finish(true, `<div class="note">${L('הצורה המדויקת במשפט:', 'Exact form in the sentence:')} <b class="en">${esc(cfg.shown)}</b></div>`);
      const close = answers.some(a => a.length >= 5 && lev(a, v) <= 1);
      finish(false, close ? `<div class="note">${L('כמעט! שים לב לאיות:', 'Almost! Check the spelling:')} <b class="en">${esc(cfg.shown)}</b></div>`
        : `<div class="note">${L('כתבת:', 'You wrote:')} <span class="en">${esc(inp.value)}</span> · ${L('התשובה:', 'Answer:')} <b class="en">${esc(cfg.shown)}</b></div>`);
    };
    $('#check', el).onclick = check;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done ? next() : check(); } });
    $('#idk', el).onclick = () => finish(false, `<div class="note">${L('התשובה:', 'Answer:')} <b class="en">${esc(cfg.shown)}</b></div>`, true);
  }

  EX.sentenceType = (el, w, record, next) => {
    const s = pickSentence(w);
    const ans = answerOf(s);
    const first = ans.charAt(0);
    typeQuestion(el, w, record, next, {
      head: `<div class="prompt">${L('הקלד את המילה שחסרה במשפט:', 'Type the missing word:')}</div>
        <div class="sentence en">${sentenceHtml(s.en)}</div>
        ${autoHe(esc(s.he))}
        <div class="he-line he" data-auto="hint">${L(`רמז: <b>${esc(w.he)}</b> · מתחילה ב-<b class="en">${esc(first)}</b> · ${ans.length} אותיות`, `Hint: <b class="he">${esc(w.he)}</b> · starts with <b class="en">${esc(first)}</b> · ${ans.length} letters`)}</div>
        ${helperBar({ he: true })}
        <div class="helpers"><button class="help" data-open="hint">💡 ${L('רמז', 'Hint')}</button></div>`,
      answers: [ans], loose: forms(w), shown: ans,
      onDone: ok => { const b = $('.blank', el); b.textContent = ans; b.classList.add(ok ? 'ok' : 'bad'); replayButtons(el, s.en); }
    });
    el.querySelectorAll('[data-auto="hint"]').forEach(x => x.classList.add('hidden'));
  };

  EX.listen = (el, w, record, next) => {
    typeQuestion(el, w, record, next, {
      head: `<div class="prompt">${L('הקשב וכתוב את המילה באנגלית:', 'Listen and write the word in English:')}</div>
        <div class="row" style="justify-content:center;gap:14px;margin:10px 0">
          <button class="speak" style="width:64px;height:64px;font-size:30px" data-say="${esc(w.en)}">🔊</button>
          <button class="speak" style="width:64px;height:64px;font-size:30px" data-say="${esc(w.en)}" data-slow>🐢</button>
        </div>
        ${autoHe(esc(w.he))}
        ${autoPh(esc(w.ph))}
        ${helperBar({ he: true, ph: true })}`,
      answers: forms(w).concat([w.en]), shown: w.en
    });
    setTimeout(() => autoSpeak(w.en), 250);
  };

  // ---------- matching ----------
  function matchScreen(pool) {
    screen(L('התאמה', 'Matching'));
    const words = chooseWords(pool, 5);
    let left = words.length, mistakes = 0, sel = null;
    const missedIds = {};
    const enT = shuffle(words).map(w => ({ w, side: 'en' }));
    const heT = shuffle(words).map(w => ({ w, side: 'he' }));
    view.innerHTML = `<div class="card"><div class="prompt" style="margin:0">${L('לחץ על מילה באנגלית ואז על התרגום שלה', 'Tap an English word, then its translation')}</div></div>
      <div class="match">${enT.map((t, i) => `<button class="tile en" data-s="en" data-i="${i}">${esc(t.w.en)}${autoPh(esc(t.w.ph), 'ph note')}</button>
        <button class="tile he" data-s="he" data-i="${i}">${esc(heT[i].w.he)}</button>`).join('')}</div><div id="fb"></div>`;
    syncToggles();
    view.querySelectorAll('.tile').forEach(b => b.onclick = () => {
      const t = (b.dataset.s === 'en' ? enT : heT)[+b.dataset.i];
      if (b.dataset.s === 'en') autoSpeak(t.w.en);
      if (!sel || sel.t.side === t.side) {
        if (sel) sel.b.classList.remove('sel');
        sel = { b, t }; b.classList.add('sel'); return;
      }
      if (sel.t.w === t.w) {
        sel.b.classList.add('done'); b.classList.add('done');
        if (!missedIds[t.w.id]) grade(t.w.id, true);
        sel = null; left--;
        if (!left) {
          $('#fb').innerHTML = `<div class="card result"><div class="score">${mistakes === 0 ? '🏆' : '✓'}</div><div>${mistakes === 0 ? L('בלי טעויות!', 'No mistakes!') : L('טעויות: ', 'Mistakes: ') + mistakes}</div></div>
            <button class="btn" id="again">${L('עוד סבב', 'Another round')}</button><button class="btn secondary" id="toHome">${L('לתפריט הראשי', 'Main menu')}</button>`;
          $('#again').onclick = () => matchScreen(pool); $('#toHome').onclick = home;
        }
      } else {
        mistakes++;
        [sel.t.w, t.w].forEach(w => { if (!missedIds[w.id]) { missedIds[w.id] = 1; grade(w.id, false); } });
        const a = sel.b; a.classList.remove('sel'); a.classList.add('bad'); b.classList.add('bad');
        setTimeout(() => { a.classList.remove('bad'); b.classList.remove('bad'); }, 600);
        sel = null;
      }
    });
  }

  // ---------- paragraph ----------
  function paragraphScreen(lessonDate) {
    screen(L('השלם פסקה', 'Complete the paragraph'));
    let lessons = LESSONS.filter(l => l.p && l.p.length);
    const s = settings.scope;
    const chosen = chosenLessons();
    const inScope = lessons.filter(l => (s === 'custom' && chosen.indexOf(l) >= 0) || (s === 'newest' && l === LESSONS[0]) || (s === 'last3' && LESSONS.indexOf(l) < 3));
    let lesson = lessonDate ? lessons.find(l => l.date === lessonDate) : freshPick(inScope.length ? inScope : lessons, l => 'lesson ' + l.date);
    if (!lesson) { view.innerHTML = `<div class="card">${L('אין עדיין פסקאות.', 'No paragraphs yet.')}</div>`; return; }
    const para = freshPick(lesson.p);
    const targets = [];
    para.en.replace(/\[([^\]]+)\]/g, (_, a) => { targets.push(a); return _; });
    let n = 0;
    const html = esc(para.en).replace(/\[([^\]]+)\]/g, () => `<span class="blank" data-b="${n++}">&nbsp;</span>`);
    const bank = shuffle(targets.map((a, i) => ({ a, i })));
    const filled = targets.map(() => null); // index into bank
    let active = 0;
    view.innerHTML = `
      <div class="card">
        <div class="row"><div class="muted">${L('שיעור', 'Lesson')} ${esc(lesson.date)}</div><span class="spacer"></span>
          <select class="select" id="pl" style="width:auto;padding:6px 8px">${lessons.map(l => `<option value="${esc(l.date)}" ${l === lesson ? 'selected' : ''}>${esc(l.date)}</option>`).join('')}</select></div>
        <div class="prompt" style="margin-top:8px">${L('לחץ על מילה מהמחסן כדי למלא את המקום המסומן. לחיצה על מקום שמולא מנקה אותו.', 'Tap a word from the bank to fill the highlighted blank. Tap a filled blank to clear it.')}</div>
        <div class="sentence en" id="para">${html}</div>
        ${autoHe(esc(para.he))}
        ${helperBar({ he: true })}
        <div class="bank" id="bank">${bank.map((b, k) => `<button class="chip" data-k="${k}">${esc(b.a)}</button>`).join('')}</div>
      </div>
      <button class="btn" id="check">${L('בדוק', 'Check')}</button>
      <div id="fb"></div>`;
    syncToggles();
    $('#pl').onchange = e => paragraphScreen(e.target.value);
    const blanks = [...view.querySelectorAll('#para .blank')];
    const paint = () => {
      blanks.forEach((b, i) => {
        b.textContent = filled[i] == null ? ' ' : bank[filled[i]].a;
        b.classList.toggle('active', i === active);
      });
      view.querySelectorAll('#bank .chip').forEach(c => c.classList.toggle('used', filled.indexOf(+c.dataset.k) >= 0));
    };
    paint();
    blanks.forEach((b, i) => b.onclick = () => { if (checked) return; if (filled[i] != null) filled[i] = null; active = i; paint(); });
    let checked = false;
    view.querySelectorAll('#bank .chip').forEach(c => c.onclick = () => {
      if (checked) return;
      const k = +c.dataset.k;
      if (filled.indexOf(k) >= 0) return;
      filled[active] = k;
      const nextEmpty = filled.findIndex(f => f == null);
      active = nextEmpty < 0 ? active : nextEmpty;
      paint();
    });
    $('#check').onclick = () => {
      if (filled.some(f => f == null)) { toast(L('יש עוד מקומות ריקים', 'Some blanks are still empty')); return; }
      checked = true;
      let good = 0;
      blanks.forEach((b, i) => {
        const ok = norm(bank[filled[i]].a) === norm(targets[i]);
        if (ok) good++;
        b.classList.remove('active');
        b.classList.add(ok ? 'ok' : 'bad');
        if (!ok) b.textContent = targets[i];
      });
      touchStreak();
      view.querySelectorAll('[data-auto="he"]').forEach(x => { x.dataset.open = 1; x.classList.remove('hidden'); });
      $('#check').remove();
      $('#fb').innerHTML = `<div class="feedback ${good === targets.length ? 'ok' : 'bad'}">${good}/${targets.length} ${L('נכונות', 'correct')} ${good === targets.length ? '🏆' : ''}
        <div class="helpers"><button class="help" data-say="${esc(para.en)}">🔊 ${L('השמע את כל הפסקה', 'Play the whole paragraph')}</button></div></div>
        <button class="btn" id="more">${L('פסקה נוספת', 'Another paragraph')}</button><button class="btn secondary" id="toHome">${L('לתפריט הראשי', 'Main menu')}</button>`;
      $('#more').onclick = () => paragraphScreen();
      $('#toHome').onclick = home;
    };
  }

  // ---------- word list ----------
  function dots(w) { const b = Math.max(0, box(w)); return `<span class="dots">${[1, 2, 3, 4, 5].map(i => `<i class="${b >= i ? 'on' : ''}"></i>`).join('')}</span>`; }
  function wordRow(w) {
    return `<div class="word-row" data-id="${esc(w.id)}">
      <button class="speak small" data-say="${esc(w.en)}">🔊</button>
      <div class="txt"><div class="w en">${esc(w.en)} <span class="ph">${esc(w.ph)}</span></div>
      <div class="he muted">${esc(w.he)}</div>
      <div class="more hidden"></div></div>${dots(w)}</div>`;
  }
  function listScreen() {
    screen(L('רשימת המילים', 'Word list'));
    view.innerHTML = `<input class="input search" id="q" placeholder="${L('חיפוש באנגלית או בעברית', 'Search in English or Hebrew')}" dir="auto" style="direction:inherit;text-align:start;font-size:17px">
      <div id="list"></div>`;
    const stripNiqqud = s => String(s).replace(/[֑-ׇ]/g, '');
    const render = () => {
      const q = stripNiqqud($('#q').value.trim().toLowerCase());
      $('#list').innerHTML = LESSONS.map(l => {
        const ws = l.words.filter(w => !q || w.en.toLowerCase().includes(q) || stripNiqqud(w.heFull).includes(q));
        if (!ws.length) return '';
        return `<div class="lesson-h">${L('שיעור', 'Lesson')} ${esc(l.date)}${l.src === 'claude' ? ' 🤖' : ''} · ${ws.length} ${L('מילים', 'words')}</div><div class="card" style="padding:4px 12px">${ws.map(wordRow).join('')}</div>`;
      }).join('') || `<div class="card muted">${L('לא נמצאו מילים', 'No words found')}</div>`;
    };
    $('#q').oninput = render;
    render();
    $('#list').onclick = e => {
      if (e.target.closest('[data-say]')) return;
      const row = e.target.closest('.word-row'); if (!row) return;
      const more = $('.more', row); const w = BY_ID[row.dataset.id];
      if (!more.classList.contains('hidden')) { more.classList.add('hidden'); return; }
      const p = prog[w.id];
      more.innerHTML = `<div class="note he">${esc(w.heFull)}</div>${w.note ? `<div class="note en">${esc(w.note)}</div>` : ''}
        ${(w.s || []).map(s => `<div class="en" style="margin-top:8px">${esc(plain(s.en))} <button class="speak small" data-say="${esc(s.en)}">🔊</button></div><div class="note he">${esc(s.he)}</div>`).join('')}
        <div class="note">${p ? L(`תשובות נכונות: ${p.ok} · טעויות: ${p.bad}`, `Correct: ${p.ok} · Mistakes: ${p.bad}`) : L('עוד לא תרגלת את המילה הזאת', 'You haven\'t practiced this word yet')}</div>`;
      more.classList.remove('hidden');
    };
  }

  // ---------- daily reminder (iPhone Shortcuts automation) ----------
  const REMINDERS = [
    'תרגלת כבר אנגלית היום? 5 דקות זה כל מה שצריך 💪',
    'Ready for some English, Giora? 🇬🇧',
    'המילים מהשיעור האחרון מחכות לך 📚',
    'עוד יום ברצף? אל תשבור את השרשרת 🔥',
    'מילה אחת ביום — 365 מילים בשנה 🌱',
    'The best time to practice is now ⏰',
    'סבב אחד של חזרה חכמה לפני השינה? 🧠',
    'Practice makes progress, not perfect ✨',
    'המורה תשמח לשמוע שתרגלת השבוע 😉',
    'עשר שאלות. חמש דקות. יאללה! 🚀',
    'Small steps every day = big results 👣',
    'מה שלא מתרגלים — שוכחים. בוא נחזור על כמה מילים 🔁',
    'Your English is getting better every day 💙',
    'איך אומרים "תרגלתי היום" באנגלית? I practiced today ✅',
    'מוכן לאתגר? נסה את "שמע וכתוב" היום 🎧',
    'Don’t break the streak! 🔥',
    'כמה מילים אתה זוכר מהשיעור האחרון? בוא נבדוק 🤔',
    'Five minutes of English beats zero minutes 😄',
    'הזמן הכי טוב ללמוד היה אתמול. השני הכי טוב — עכשיו ⏳',
    'You’ve got this, Giora! 💪',
    'פסקה אחת קצרה עם מילים חדשות? 📄',
    'כל תרגול מקרב אותך לשיחה באנגלית בלי לחשוב פעמיים 🗣',
    'Learning a language is a marathon, not a sprint 🏃',
    'בוא נוודא שהמילים של השבוע נכנסו לראש 🧩',
    'Keep calm and practice English ☕',
    'יש מילים שטעית בהן? זה הזמן לתקן אותן 🎯',
    'One more round before bed? 🌙',
    'כמה דקות של אנגלית — ומחר יהיה קל יותר 🌟',
    'Every word you learn opens a new door 🚪',
    'גיורא, האנגלית מחכה לך 😊'
  ];
  function reminderScreen() {
    screen(L('תזכורת יומית', 'Daily reminder'));
    const text = REMINDERS.join(String.fromCharCode(10));
    view.innerHTML = settings.lang === 'en' ? reminderEn() : `
      <div class="card">
        <b>מה זה עושה?</b>
        <div class="muted" style="margin-top:6px">כל ערב ב-20:30 תקבל באייפון הודעה מעודדת — כל יום הודעה אחרת (${REMINDERS.length} הודעות מתחלפות). ההגדרה נעשית פעם אחת באפליקציית <b>קיצורים</b> <bdi dir="ltr">(Shortcuts)</bdi> של אפל.</div>
      </div>
      <div class="card">
        <b>שלב 1 — העתק את ההודעות</b>
        <button class="btn" id="copyMsgs">📋 העתק את ${REMINDERS.length} ההודעות</button>
      </div>
      <div class="card">
        <b>שלב 2 — צור קיצור בשם "תזכורת אנגלית"</b>
        <ol class="steps">
          <li>פתח את האפליקציה <b>קיצורים</b> <bdi dir="ltr">(Shortcuts)</bdi> ועבור ללשונית <b>קיצורים</b> <bdi dir="ltr">(Shortcuts)</bdi> בתחתית (לא "אוטומציה").</li>
          <li>לחץ <b>+</b> למעלה כדי ליצור קיצור חדש.</li>
          <li>בשורת החיפוש של הפעולות כתוב <b>טקסט</b> <bdi dir="ltr">(Text)</bdi> והוסף אותה. לחץ בתוכה והדבק <bdi dir="ltr">(Paste)</bdi> את ההודעות שהעתקת.</li>
          <li>חפש והוסף <b>פצל טקסט</b> <bdi dir="ltr">(Split Text)</bdi> — וודא שכתוב "לפי <b>שורות חדשות</b>" <bdi dir="ltr">(New Lines)</bdi>.</li>
          <li>חפש והוסף <b>קבל פריט מהרשימה</b> <bdi dir="ltr">(Get Item from List)</bdi> ושנה את "הפריט הראשון" ל-<b>פריט אקראי</b> <bdi dir="ltr">(Random Item)</bdi>.</li>
          <li>חפש והוסף <b>הצג הודעה</b> <bdi dir="ltr">(Show Notification)</bdi>. לחץ על הטקסט <bdi dir="ltr">Hello World</bdi>, מחק אותו, ובחר מעל המקלדת את המשתנה <b>פריט מהרשימה</b> <bdi dir="ltr">(Item from List)</bdi>.</li>
          <li>למעלה, לחץ על שם הקיצור ושנה אותו ל-<b>תזכורת אנגלית</b>.</li>
          <li>לחץ ▶ בתחתית לבדיקה — אמורה להופיע הודעה. אם מבקשים אישור להתראות, אשר. לחץ <b>סיום</b> <bdi dir="ltr">(Done)</bdi>.</li>
        </ol>
      </div>
      <div class="card">
        <b>שלב 3 — הפעל אותו כל ערב ב-20:30</b>
        <ol class="steps">
          <li>עבור ללשונית <b>אוטומציה</b> <bdi dir="ltr">(Automation)</bdi> בתחתית ולחץ <b>+</b>.</li>
          <li>בחר <b>שעה ביום</b> <bdi dir="ltr">(Time of Day)</bdi>, קבע <b>20:30</b>, סמן <b>כל יום</b> <bdi dir="ltr">(Daily)</bdi> ו-<b>הפעל מיד</b> <bdi dir="ltr">(Run Immediately)</bdi>. לחץ <b>הבא</b>.</li>
          <li>תופיע רשימת "הקיצורים שלי" <bdi dir="ltr">(My Shortcuts)</bdi> — בחר את <b>תזכורת אנגלית</b>. זהו! 🎉</li>
        </ol>
        <div class="muted">השמות המדויקים של הכפתורים יכולים להיות קצת שונים לפי גרסת ה-iOS ושפת הטלפון.</div>
      </div>
      <div class="card"><b>דוגמאות להודעות:</b>${REMINDERS.slice(0, 6).map(m => `<div class="note" style="font-size:15px;color:var(--ink)">• ${esc(m)}</div>`).join('')}</div>`;
    $('#copyMsgs').onclick = async () => {
      try { await navigator.clipboard.writeText(text); toast(L('ההודעות הועתקו ✓', 'Messages copied ✓')); }
      catch (e) {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
        ta.select(); ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy'); ta.remove();
        toast(ok ? L('ההודעות הועתקו ✓', 'Messages copied ✓') : L('ההעתקה נכשלה', 'Copy failed'));
      }
    };
  }

  // ---------- grammar & tips (the tutor's other Word files) ----------
  const GRAMMAR = (window.VOCAB && window.VOCAB.grammar) || [];
  const gprog = LS.get('gprog', {}); // topic id -> {score, total, last}
  const TABS = () => [['vocab', '📚', L('מילים', 'Words')], ['grammar', '🧩', L('דקדוק', 'Grammar')], ['speak', '🗣', L('דיבור', 'Speaking')], ['path', '🧭', L('המסלול', 'My path')]];
  const curTab = () => (TABS().some(t => t[0] === settings.tab) ? settings.tab : 'vocab');
  const tabsHtml = () => `<div class="tabs">${TABS().map(([id, ico, name]) =>
      `<button class="tab ${curTab() === id ? 'on' : ''}" data-tab="${id}"><span class="ti">${ico}</span>${name}</button>`).join('')}</div>`;
  function bindTabs() {
    view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { settings.tab = b.dataset.tab; saveSettings(); home(); });
    const lb = $('#langBtn'); if (lb) lb.onclick = () => setLang(settings.lang === 'en' ? 'he' : 'en');
  }
  const langBtnHtml = () => `<button class="help" id="langBtn">${settings.lang === 'en' ? '🌐 עברית' : '🌐 English'}</button>`;

  function grammarHome() {
    view.innerHTML = tabsHtml() + `
      <div class="card"><div class="row"><span class="muted">${L('כללים וטיפים מהמורה — הסבר קצר ותרגול לכל נושא', 'Rules and tips from the tutor — a short explanation and practice for each topic')}</span><span class="spacer"></span>${langBtnHtml()}</div></div>
      ${GRAMMAR.length ? GRAMMAR.map((g, k) => { const p = gprog[g.id]; return `
        <div class="card topic">
          <div class="topic-h"><span class="num">${k + 1}</span><div class="txt"><div class="t"><bdi>${esc(g.title)}</bdi></div>${g.he ? `<div class="muted">${esc(g.he)}</div>` : ''}</div></div>
          <div class="muted topic-meta">${g.qs.length} ${L('שאלות תרגול', 'practice questions')}${p ? ` · ${L('תוצאה אחרונה', 'last score')}: <b>${p.score}/${p.total}</b>` : ''}</div>
          <div class="btn-row"><button class="btn secondary" data-learn="${k}">📖 ${L('הסבר', 'Explanation')}</button>
            ${g.qs.length ? `<button class="btn" data-gq="${k}">✏️ ${L('תרגול', 'Practice')}</button>` : ''}</div>
        </div>`; }).join('') + (GRAMMAR.length > 1 ? `<button class="btn" id="gAll">🔀 ${L('תרגול מעורב מכל הנושאים', 'Mixed practice from all topics')}</button>` : '')
      : `<div class="card muted">${L('אין עדיין נושאים.', 'No topics yet.')}</div>`}`;
    bindTabs();
    view.querySelectorAll('[data-learn]').forEach(b => b.onclick = () => topicScreen(GRAMMAR[+b.dataset.learn]));
    view.querySelectorAll('[data-gq]').forEach(b => b.onclick = () => grammarRound([GRAMMAR[+b.dataset.gq]]));
    const ga = $('#gAll'); if (ga) ga.onclick = () => grammarRound(GRAMMAR);
  }

  // the tutor's tables, shown as one card per row (readable on a phone)
  const hasHe = t => /[֐-׿]/.test(t);
  // Hebrew text with English pieces inside: isolate each English run so punctuation stays in place
  const heMix = t => String(t).split(/([A-Za-z][A-Za-z0-9 '’.,:!?+\/-]*[A-Za-z0-9'’?!])/).map((p, i) => i % 2 ? `<bdi dir="ltr">${esc(p)}</bdi>` : esc(p)).join('');
  const cellHtml = t => esc(t).replace(/\n/g, '<br>');
  const isBadH = h => /incorrect|❌|wrong/i.test(h || '');
  const isOkH = h => !isBadH(h) && /correct|✅|✔/i.test(h || '');
  function tableHtml(b) {
    let html = '', open = false;
    b.rows.forEach(r => {
      if (r[0] || !open) {
        if (open) html += '</div>';
        html += `<div class="rcard" dir="ltr">${r[0] ? `<span class="lbl">${cellHtml(b.head[0] || '')}</span><div class="rh">${cellHtml(r[0])}</div>` : ''}`;
        open = true;
      } else html += '<div class="sep"></div>';
      html += r.slice(1).map((c, j) => {
        const h = b.head[j + 1] || '';
        if (!c) return '';
        return `<div class="fld ${isBadH(h) ? 'bad' : isOkH(h) ? 'ok' : ''}"><span class="lbl">${cellHtml(h)}</span><div class="val" ${hasHe(c) ? 'dir="rtl"' : ''}>${cellHtml(c)}</div></div>`;
      }).join('');
    });
    return html + (open ? '</div>' : '');
  }
  // headings, tables, and runs of paragraphs / bullets (bullets get a 🔊 — often speaking questions)
  function blocksHtml(blocks) {
    let html = '', box = null;
    const flush = () => { if (box) { html += `<div class="rcard gtext" dir="ltr">${box}</div>`; box = null; } };
    blocks.forEach(b => {
      if (b.p != null || b.li != null) {
        const t = b.p != null ? b.p : b.li, he = hasHe(t);
        box = (box || '') + (b.p != null
          ? `<div class="gp" ${he ? 'dir="rtl"' : ''}>${cellHtml(t)}</div>`
          : `<div class="gli" ${he ? 'dir="rtl"' : ''}><span class="dot">•</span><span class="t">${cellHtml(t)}</span>${he ? '' : `<button class="speak small" data-say="${esc(t.replace(/[✅❌✔️]/g, ''))}">🔊</button>`}</div>`);
        return;
      }
      flush();
      html += b.h != null ? `<div class="sec-h"><bdi>${esc(b.h)}</bdi></div>` : tableHtml(b);
    });
    flush();
    return html;
  }
  function topicScreen(g) {
    screen(g.title);
    view.innerHTML = `
      ${g.he || g.tips.length ? `<div class="card tips">
        ${g.he ? `<div class="he tips-h">${heMix(g.he)}</div>` : ''}
        ${g.tips.length ? `<div class="muted" style="margin-top:8px">💡 ${L('בקצרה', 'In short (Hebrew)')}</div><ul class="he">${g.tips.map(t => `<li>${heMix(t)}</li>`).join('')}</ul>` : ''}
      </div>` : ''}
      <div class="lesson-h">${g.src === 'claude' ? `🤖 ${L('הסבר מלא', 'Full explanation')}` : `📄 ${L('מהקובץ של המורה', "From the tutor's file")}`}</div>
      ${blocksHtml(g.blocks)}
      ${g.qs.length ? `<button class="btn" id="gPractice">✏️ ${L('תרגל את הנושא', 'Practice this topic')} (${g.qs.length})</button>` : ''}`;
    const gp = $('#gPractice'); if (gp) gp.onclick = () => grammarRound([g]);
  }

  function grammarRound(topics) {
    const all = [];
    topics.forEach(g => g.qs.forEach(q => all.push({ g, q })));
    // the questions not seen for the longest time, 10 per round (or the round size for mixed practice)
    const gKey = x => 'g ' + x.q.q + ' | ' + x.q.a[0];
    const items = shuffle(freshOrder(all, gKey).slice(0, topics.length > 1 ? Math.max(settings.round, 10) : 10));
    const first = items.length, per = {};
    let i = 0, score = 0;
    screen(topics.length > 1 ? L('תרגול מעורב', 'Mixed practice') : topics[0].title);
    const next = () => {
      if (i >= items.length) return grammarResults(topics, score, first, per);
      const { g, q } = items[i];
      if (i < first) markSeen(gKey(items[i]));
      const correct = q.a[0];
      const opts = shuffle(q.a);
      const counter = i < first
        ? L(`שאלה <b>${i + 1}</b> מתוך <b>${first}</b>`, `Question <b>${i + 1}</b> of <b>${first}</b>`)
        : L(`חזרה על שאלות שפספסת: <b>${i - first + 1}</b> מתוך <b>${items.length - first}</b>`, `Reviewing missed questions: <b>${i - first + 1}</b> of <b>${items.length - first}</b>`);
      const head = q.q
        ? `<div class="prompt">${L('בחר מה מתאים למקום הריק:', 'Choose what fits the blank:')}</div><div class="sentence en">${esc(q.q).replace('___', '<span class="blank">&nbsp;</span>')}</div>`
        : `<div class="prompt">${L('איזה משפט נכון?', 'Which sentence is correct?')}</div>`;
      view.innerHTML = `<div class="counter"><span>${counter}</span><span class="spacer"></span><span>✓ ${score}</span></div>
        <div class="progress"><i style="width:${(i / items.length) * 100}%"></i></div>
        <div class="card">${topics.length > 1 ? `<div class="muted" style="margin-bottom:6px"><bdi>${esc(g.title)}</bdi></div>` : ''}${head}</div>
        <div class="options">${opts.map((o, k) => `<div class="opt-row"><button class="opt" data-k="${k}"><span class="en" style="text-align:center;display:block">${esc(o)}</span></button>${optSay(q.q ? q.q.replace('___', o) : o)}</div>`).join('')}</div>
        <button class="btn secondary" id="idk">🤷 ${L('לא יודע — הראה לי', "I don't know — show me")}</button><div id="fb"></div>`;
      const answer = b => {
        const idk = !b, ok = !idk && opts[+b.dataset.k] === correct;
        $('#idk').remove();
        view.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (opts[+x.dataset.k] === correct) x.classList.add('ok'); });
        if (b && !ok) b.classList.add('bad');
        const full = q.q ? q.q.replace('___', correct) : correct;
        if (q.q) { const bl = $('.blank', view); bl.textContent = correct; bl.classList.add(ok ? 'ok' : 'bad'); }
        if (i < first) {
          const pt = per[g.id] || (per[g.id] = { score: 0, total: 0 });
          pt.total++;
          if (ok) { score++; pt.score++; } else items.push(items[i]); // missed: ask again at the end
        }
        touchStreak();
        const fb = $('#fb');
        fb.innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}">${ok ? L('נכון! ✓', 'Correct! ✓') : idk ? L('לא נורא — הנה התשובה 💪', "No problem — here's the answer 💪") : L('לא נכון ✗ — השאלה תחזור בסוף הסבב', 'Not quite ✗ — this question will come back at the end')}
          ${q.why ? `<div class="he" style="color:var(--ink);margin-top:6px">${heMix(q.why)}</div>` : ''}
          <div class="row" style="margin-top:8px"><span class="en" style="color:var(--ink);font-weight:600;flex:1">${esc(full)}</span><button class="speak small" data-say="${esc(full)}">🔊</button></div></div>`;
        autoSpeak(full);
        i++;
        nextBtn(fb, next);
      };
      view.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(b));
      $('#idk').onclick = () => answer(null);
    };
    next();
  }
  function grammarResults(topics, score, total, per) {
    Object.keys(per).forEach(id => { gprog[id] = { score: per[id].score, total: per[id].total, last: Date.now() }; });
    LS.set('gprog', gprog);
    const pct = total ? Math.round(score / total * 100) : 0;
    const msg = pct === 100 ? L('מושלם! 🏆', 'Perfect! 🏆') : pct >= 80 ? L('כל הכבוד! 👏', 'Well done! 👏') : pct >= 50 ? L('יפה, ממשיכים להתאמן 💪', 'Nice, keep practicing 💪') : L('כדאי לקרוא שוב את ההסבר ולנסות שוב 🙂', 'Read the explanation again and try once more 🙂');
    view.innerHTML = `<div class="card result"><div class="score">${score}/${total}</div><div style="font-size:20px">${msg}</div></div>
      ${topics.length === 1 ? `<button class="btn secondary" id="gLearn">📖 ${L('חזרה להסבר', 'Back to the explanation')}</button>` : ''}
      <button class="btn" id="again">${L('סבב נוסף', 'Another round')}</button>
      <button class="btn secondary" id="toHome">${L('לתפריט הראשי', 'Main menu')}</button>`;
    const gl = $('#gLearn'); if (gl) gl.onclick = () => topicScreen(topics[0]);
    $('#again').onclick = () => grammarRound(topics);
    $('#toHome').onclick = home;
  }

  // ---------- shared: copy text to the clipboard ----------
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy'); ta.remove();
      toast(ok ? okMsg : L('ההעתקה נכשלה', 'Copy failed'));
    }
  }

  // ---------- speaking tab ----------
  const SPEAK_MODES = () => [
    { id: 'speakT', ico: '🎤', name: L('תרגם ואמור', 'Translate and say'), desc: L('משפט בעברית ← אתה אומר אותו באנגלית', 'Hebrew sentence → you say it in English') },
    { id: 'speakR', ico: '🔁', name: L('חזור אחריי', 'Repeat after me'), desc: L('שומעים משפט באנגלית וחוזרים עליו', 'Hear an English sentence and repeat it') }
  ];
  const TALK_TOPICS = [
    ['💬', 'שיחה חופשית', 'Free conversation', 'anything — start by asking me about my day'],
    ['📅', 'היום שלי', 'My day', 'my day: what I did today and what I am doing tomorrow'],
    ['💼', 'העבודה שלי', 'My job', 'my job in insurance, pensions and finance — ask me to explain what I do'],
    ['🤝', 'פגישה עם לקוח', 'Client meeting', 'a role play: I am an insurance and pension agent, you are a new client who wants a pension plan. Ask real client questions'],
    ['📞', 'שיחת טלפון', 'Phone call', 'a role play phone call: you are a client calling about a problem with an insurance claim'],
    ['💰', 'משא ומתן', 'Negotiation', 'a role play: we negotiate a price (a car or an apartment). Be a tough but fair seller'],
    ['🏋️', 'חדר כושר ובריאות', 'Gym and health', 'the gym, training, food and health'],
    ['👨‍👩‍👧', 'משפחה', 'Family', 'my family, kids and weekends'],
    ['🏠', 'בית ושיפוצים', 'Home', 'my home, renovations, neighbours and the building'],
    ['✈️', 'טיול בחו"ל', 'Travel abroad', 'a role play abroad: airport check-in, hotel reception and asking for directions'],
    ['🍽️', 'מסעדה', 'Restaurant', 'a role play: you are a waiter, I order food and have a small problem with the bill'],
    ['📈', 'כסף וחיסכון', 'Money and saving', 'money, saving and investing — I explain ideas in simple words'],
    ['🕰️', 'סיפור מהעבר', 'A story from my past', 'a story from my past — help me practice past simple and past progressive'],
    ['🔮', 'תוכניות לעתיד', 'Future plans', 'my plans for the future — help me practice will and going to'],
    ['🗣', 'להביע דעה', 'Giving opinions', 'giving my opinion, agreeing and disagreeing politely on everyday topics'],
    ['📰', 'חדשות', 'News', 'simple news and current events']
  ];
  function tutorPrompt(topic) {
    const weak = GRAMMAR.map(g => g.title).join('; ');
    const how = settings.explainHe === false ? 'in simple English' : 'in Hebrew (one or two short sentences)';
    return [
      'You are my private English teacher. My name is Giora. I am Israeli (Hebrew is my first language). I work in insurance, pensions and finance, I go to the gym, and I have a family. My level is about B1. My goal is to feel comfortable speaking and understanding English.',
      '',
      'Let\'s have a spoken conversation. Topic: ' + topic + '.',
      '',
      'Rules:',
      '1. Use simple, natural English. Keep your turns short (2–3 sentences) and always end with a question, so I talk more than you.',
      '2. When I make a mistake (grammar, wrong word, word order), say the correct sentence, then explain why ' + how + '. Then continue the conversation.',
      '3. Correct only the 1–2 most important mistakes each time, so the conversation keeps flowing.',
      '4. Pay special attention to the grammar I am learning: ' + weak + '.',
      '5. Sometimes use a word I may not know and check that I understood it.',
      '6. If I say "slower", use easier words. If I say "Hebrew", explain the last thing in Hebrew.',
      '7. When I say "summary" (or after about 15 minutes), give me: my 3 most common mistakes with the correct form, 5 useful words or phrases from our talk, and one tip for next time.',
      '',
      'Start now with a short greeting and your first question.'
    ].join(String.fromCharCode(10));
  }
  function speakHome() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    view.innerHTML = tabsHtml() + `
      <div class="card">
        <b>🎤 ${L('תרגילי דיבור באפליקציה', 'Speaking drills in the app')}</b>
        <div class="muted" style="margin-top:4px">${L('על המילים שבחרת בלשונית "מילים". לוחצים על המיקרופון, מדברים, והאפליקציה מראה מה היה נכון.', 'On the words chosen in the "Words" tab. Tap the mic, speak, and the app shows what was right.')}</div>
        ${SR ? '' : `<div class="note" style="color:var(--bad)">${L('זיהוי דיבור לא זמין בדפדפן הזה — אפשר להקליד במקום.', 'Speech recognition is not available here — you can type instead.')}</div>`}
      </div>
      <div class="modes">${SPEAK_MODES().map(m => `<button class="mode" data-mode="${m.id}"><span class="ico">${m.ico}</span><b>${m.name}</b><small>${m.desc}</small></button>`).join('')}</div>
      <div class="card" style="margin-top:12px">
        <b>🤖 ${L('שיחה עם מורה – אפליקציית Claude', 'Conversation with a tutor – the Claude app')}</b>
        <ol class="steps">
          <li>${L('בחר נושא למטה – ההוראות למורה מועתקות.', 'Pick a topic below – the tutor instructions are copied.')}</li>
          <li>${L('פתח את אפליקציית Claude ← שיחה חדשה ← הדבק ושלח.', 'Open the Claude app → new chat → paste and send.')}</li>
          <li>${L('לחץ על כפתור מצב הקול (ליד שורת ההקלדה) ודבר. הוא יתקן אותך ויסביר.', 'Tap the voice-mode button (next to the input) and talk. It will correct you and explain.')}</li>
          <li>${L('בסוף תגיד "summary" – תקבל סיכום של הטעויות והמילים החדשות.', 'At the end say "summary" – you get your mistakes and new words.')}</li>
        </ol>
        <label class="lesson-item" style="border:0"><input type="checkbox" id="exHe" ${settings.explainHe === false ? '' : 'checked'}> ${L('הסברים לטעויות בעברית (בלי סימון: באנגלית פשוטה)', 'Explain mistakes in Hebrew (unticked: simple English)')}</label>
      </div>
      <div class="topics">${TALK_TOPICS.map((t, k) => `<button class="topic-btn" data-talk="${k}"><span class="ico">${t[0]}</span><span>${L(t[1], t[2])}</span></button>`).join('')}</div>`;
    bindTabs();
    view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => start(b.dataset.mode));
    $('#exHe').onchange = e => { settings.explainHe = e.target.checked; saveSettings(); };
    view.querySelectorAll('[data-talk]').forEach(b => b.onclick = () => {
      const t = TALK_TOPICS[+b.dataset.talk];
      copyText(tutorPrompt(t[3]), L('ההוראות הועתקו ✓ עכשיו פתח את Claude והדבק', 'Copied ✓ Now open Claude and paste'));
    });
  }

  // ---------- speaking drill (speech recognition) ----------
  const CONTR = { "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is', "there's": 'there is', "what's": 'what is', "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have', "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will', "he'll": 'he will', "she'll": 'she will', "i'd": 'i would', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot', "won't": 'will not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not', "let's": 'let us', "shouldn't": 'should not', "couldn't": 'could not', "wouldn't": 'would not' };
  const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  function words(text) {
    const out = [];
    String(text).toLowerCase().replace(/[’‘`]/g, "'").replace(/%/g, ' percent').split(/[^a-z0-9']+/).forEach(t => {
      t = t.replace(/^'+|'+$/g, '');
      if (!t) return;
      if (CONTR[t]) out.push(...CONTR[t].split(' '));
      else if (/^\d+$/.test(t) && +t <= 20) out.push(NUMS[+t]);
      else out.push(t);
    });
    return out;
  }
  // which words of the target sentence appear (in order) in what was said
  function matchWords(target, said) {
    const a = words(target), b = words(said);
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const hit = new Array(a.length).fill(false);
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
      if (a[i] === b[j]) { hit[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    return { a, hit, ratio: a.length ? hit.filter(Boolean).length / a.length : 0 };
  }
  // show the correct sentence word by word: green = you said it, red = missing / different
  function markSentence(target, m) {
    let k = 0;
    return String(target).split(/(\s+)/).map(tok => {
      if (/^\s+$/.test(tok) || !tok) return tok;
      const n = words(tok).length;
      const ok = n === 0 || m.hit.slice(k, k + n).every(Boolean);
      k += n;
      return `<span class="${ok ? 'w-ok' : 'w-bad'}">${esc(tok)}</span>`;
    }).join('');
  }
  let recog = null;
  function listen(onText, onEnd) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { onEnd('', 'unsupported'); return; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const r = new SR();
    r.lang = 'en-US'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let text = '', done = false;
    const end = err => { if (done) return; done = true; recog = null; onEnd(text, err); };
    r.onresult = e => { text = [...e.results].map(x => x[0].transcript).join(' '); onText(text); };
    r.onerror = e => end(e.error || 'error');
    r.onend = () => end();
    try { r.start(); recog = r; } catch (e) { end('error'); }
  }
  function speakDrill(el, w, record, next, repeat) {
    const s = pickSentence(w);
    const target = plain(s.en);
    const key = answerOf(s);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    el.innerHTML = `<div class="card">
        ${repeat
          ? `<div class="prompt">${L('הקשב וחזור על המשפט בקול:', 'Listen and repeat the sentence aloud:')}</div>
             <div class="row" style="justify-content:center;gap:14px;margin:8px 0"><button class="speak" style="width:60px;height:60px;font-size:28px" data-say="${esc(target)}">🔊</button><button class="speak" style="width:60px;height:60px;font-size:28px" data-say="${esc(target)}" data-slow>🐢</button></div>
             <div class="sentence en hidden" id="tgt">${esc(target)}</div>
             <div class="helpers"><button class="help" id="showT">👁 ${L('הצג את המשפט', 'Show the sentence')}</button></div>`
          : `<div class="prompt">${L('אמור את המשפט באנגלית:', 'Say this sentence in English:')}</div>
             <div class="big he" style="font-size:22px;line-height:1.5">${esc(s.he)}</div>
             <div class="he-line he hidden" id="hint">${L('מילת המפתח', 'Key word')}: <b class="en">${esc(key)}</b></div>
             <div class="helpers"><button class="help" id="showH">💡 ${L('רמז', 'Hint')}</button></div>`}
      </div>
      <div class="said hidden" id="said"></div>
      ${SR ? `<button class="mic" id="mic">🎤<span>${L('לחץ ודבר', 'Tap and speak')}</span></button>` : ''}
      <div class="row" style="gap:8px;margin-top:10px">
        <input class="input" id="typed" placeholder="${L('או הקלד כאן…', 'or type here…')}" autocomplete="off" autocorrect="off" spellcheck="false" style="font-size:17px">
        <button class="help" id="typedGo" style="padding:12px 14px">✓</button>
      </div>
      <button class="btn secondary" id="idk">🤷 ${L('לא יודע — הראה לי', "I don't know — show me")}</button>
      <div id="fb"></div>`;
    if (repeat) { setTimeout(() => speak(target), 300); $('#showT', el).onclick = () => $('#tgt', el).classList.remove('hidden'); }
    else $('#showH', el).onclick = () => $('#hint', el).classList.remove('hidden');
    let graded = false;
    const evaluate = (said, idk) => {
      const m = matchWords(target, said);
      const keyOk = words(key).every(k => words(said).indexOf(k) >= 0);
      const ok = !idk && m.ratio >= (repeat ? 0.8 : 0.7) && keyOk;
      if (!graded) { graded = true; record(ok); }
      const pct = Math.round(m.ratio * 100);
      const fb = $('#fb', el);
      fb.innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}">
          ${idk ? L('הנה המשפט 💪', "Here's the sentence 💪") : ok ? L(`מצוין! ✓ ${pct}% מהמילים נכונות`, `Great! ✓ ${pct}% of the words`) : L(`${pct}% מהמילים נכונות — נסה שוב`, `${pct}% of the words — try again`)}
          ${said && !idk ? `<div class="note">${L('אמרת', 'You said')}: <span class="en">${esc(said)}</span></div>` : ''}
          <div class="sentence en" style="font-size:19px;margin-top:8px">${markSentence(target, m)}</div>
          ${!repeat ? `<div class="note he">${esc(s.he)}</div>` : ''}
          ${!ok && !idk ? `<div class="note">${L('ירוק = אמרת נכון · אדום = חסר או שונה. אפשר לומר את זה גם אחרת – זו רק השוואה למשפט אחד נכון.', 'Green = you said it · red = missing or different. There may be other correct ways – this compares to one correct sentence.')}</div>` : ''}
          <div class="helpers"><button class="help" data-say="${esc(target)}">🔊 ${L('שמע', 'Play')}</button><button class="help" data-say="${esc(target)}" data-slow>🐢 ${L('לאט', 'Slow')}</button></div>
        </div>`;
      if (!fb.querySelector('.btn')) nextBtn(fb, next);
      const idkB = $('#idk', el); if (idkB) idkB.remove();
      if (SR && $('#mic', el)) $('#mic span', el).textContent = L('נסה שוב', 'Try again');
    };
    if (SR) $('#mic', el).onclick = () => {
      const mic = $('#mic', el), box = $('#said', el);
      if (recog) { recog.stop(); return; }
      mic.classList.add('on'); $('span', mic).textContent = L('מקשיב… (לחץ לסיום)', 'Listening… (tap to stop)');
      box.classList.remove('hidden'); box.textContent = '…';
      listen(t => { box.textContent = t; }, (t, err) => {
        mic.classList.remove('on'); $('span', mic).textContent = L('לחץ ודבר', 'Tap and speak');
        if (err && !t) {
          box.textContent = err === 'not-allowed' || err === 'service-not-allowed'
            ? L('אין הרשאה למיקרופון. אפשר לאשר בהגדרות האייפון, או להקליד.', 'No microphone permission. Allow it in iPhone settings, or type.')
            : L('לא שמעתי. נסה שוב, או הקלד.', "I didn't hear you. Try again, or type.");
          return;
        }
        if (t) evaluate(t);
      });
    };
    const typed = () => { const v = $('#typed', el).value.trim(); if (v) evaluate(v); };
    $('#typedGo', el).onclick = typed;
    $('#typed', el).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); typed(); } });
    $('#idk', el).onclick = () => evaluate('', true);
  }
  EX.speakT = (el, w, record, next) => speakDrill(el, w, record, next, false);
  EX.speakR = (el, w, record, next) => speakDrill(el, w, record, next, true);

  // ---------- learning path + level test ----------
  const ROAD = (window.VOCAB && window.VOCAB.roadmap) || { stages: [], test: [] };
  function topicByKey(key) { return GRAMMAR.find(g => g.file === key); }
  function pathHome() {
    const lv = LS.get('level', null);
    let nextShown = false;
    view.innerHTML = tabsHtml() + `
      <div class="card">
        <b>🎯 ${L('המטרה: להרגיש בנוח לדבר ולהבין אנגלית', 'Goal: feel comfortable speaking and understanding English')}</b>
        <div class="muted" style="margin-top:6px">${L('המסלול מתקדם שלב אחרי שלב. כל שבוע: שיעור חדש (מילים + נושא דקדוק), תרגול כאן, ושיחה עם המורה ב-Claude.', 'The path goes step by step. Every week: a new lesson (words + a grammar topic), practice here, and a talk with the Claude tutor.')}</div>
      </div>
      <div class="card">
        <div class="row"><b>📝 ${L('מבחן רמה', 'Level test')}</b><span class="spacer"></span>${lv ? `<span class="level-badge">${esc(lv.level)}</span>` : ''}</div>
        <div class="muted" style="margin-top:4px">${lv
          ? L(`תוצאה אחרונה: ${lv.level} (${new Date(lv.date).toLocaleDateString('he-IL')}). כדאי לחזור על המבחן כל חודש-חודשיים.`, `Last result: ${lv.level} (${new Date(lv.date).toLocaleDateString('en-GB')}). Retake it every month or two.`)
          : L(`${ROAD.test.length} שאלות, בערך 5 דקות. המבחן יראה מאיזה שלב להתחיל.`, `${ROAD.test.length} questions, about 5 minutes. It shows which stage to start from.`)}</div>
        ${lv && lv.miss && lv.miss.length ? `<button class="btn secondary" id="lvMiss">❌ ${L(`הטעויות שלי במבחן (${lv.miss.length})`, `My test mistakes (${lv.miss.length})`)}</button>` : ''}
        <button class="btn" id="lvTest">${lv ? L('עשה שוב את המבחן', 'Take the test again') : L('התחל מבחן רמה', 'Start the level test')}</button>
      </div>
      ${ROAD.stages.map(st => `
        <div class="lesson-h">${L('שלב', 'Stage')} ${esc(st.n)} · ${esc(st.level)} · ${esc(L(st.he, st.title))}</div>
        <div class="card" style="padding:4px 12px">${st.items.map(it => {
          const g = topicByKey(it.key), p = g && gprog[g.id];
          let cls = 'soon', badge = '🔒';
          if (g && p && p.total && p.score / p.total >= 0.7) { cls = 'done'; badge = '✅'; }
          else if (g) { cls = 'open'; badge = '📖'; }
          else if (!nextShown) { cls = 'next'; badge = '⭐'; nextShown = true; }
          return `<div class="road-item ${cls}" ${g ? `data-topic="${esc(g.id)}"` : ''}>
            <span class="badge">${badge}</span>
            <div class="txt"><div><bdi>${esc(it.title)}</bdi></div><div class="muted">${heMix(it.he)}${p ? ` · ${p.score}/${p.total}` : ''}</div>
            ${cls === 'next' ? `<div class="note">${L('הבא בתור – כתוב ל-Claude במחשב "שיעור חדש"', 'Next – ask Claude on the computer for a "new lesson"')}</div>` : ''}</div>
            ${g ? '<span class="muted">›</span>' : ''}</div>`;
        }).join('')}</div>`).join('')}
      <div class="card muted">✅ ${L('תרגלת (70% ומעלה)', 'Practiced (70%+)')} · 📖 ${L('זמין לתרגול', 'Ready to practice')} · ⭐ ${L('הבא בתור', 'Next')} · 🔒 ${L('בהמשך', 'Later')}</div>`;
    bindTabs();
    $('#lvTest').onclick = levelTest;
    if ($('#lvMiss')) $('#lvMiss').onclick = levelMistakes;
    view.querySelectorAll('[data-topic]').forEach(b => b.onclick = () => topicScreen(GRAMMAR.find(g => g.id === b.dataset.topic)));
  }
  function levelTest() {
    const items = ROAD.test.slice();
    let i = 0;
    const res = {}, miss = [];
    screen(L('מבחן רמה', 'Level test'));
    const next = () => {
      if (i >= items.length) return levelResult(res, miss);
      const q = items[i], correct = q.a[0], opts = shuffle(q.a);
      view.innerHTML = `<div class="counter"><span>${L(`שאלה <b>${i + 1}</b> מתוך <b>${items.length}</b>`, `Question <b>${i + 1}</b> of <b>${items.length}</b>`)}</span></div>
        <div class="progress"><i style="width:${(i / items.length) * 100}%"></i></div>
        <div class="card"><div class="prompt">${L('בחר מה מתאים למקום הריק:', 'Choose what fits the blank:')}</div><div class="sentence en">${esc(q.q).replace('___', '<span class="blank">&nbsp;</span>')}</div></div>
        <div class="options">${opts.map((o, k) => `<button class="opt" data-k="${k}"><span class="en" style="text-align:center;display:block">${esc(o)}</span></button>`).join('')}</div>
        <button class="btn secondary" id="idk">🤷 ${L('לא יודע', "I don't know")}</button>`;
      const answer = b => {
        const r = res[q.level] || (res[q.level] = { ok: 0, total: 0 });
        r.total++;
        const you = b ? opts[+b.dataset.k] : null;
        if (you === correct) r.ok++;
        else miss.push({ level: q.level, q: q.q, a: correct, you, why: q.why });
        i++; next(); // no feedback during the test – results at the end
      };
      view.querySelectorAll('.opt').forEach(b => b.onclick = () => answer(b));
      $('#idk').onclick = () => answer(null);
    };
    next();
  }
  function mistakesHtml(miss) {
    if (!miss || !miss.length) return `<div class="card"><b>🏆 ${L('אין טעויות – כל התשובות נכונות!', 'No mistakes – every answer was right!')}</b></div>`;
    return `<div class="lesson-h">❌ ${L(`איפה טעית (${miss.length})`, `Your mistakes (${miss.length})`)}</div>` + miss.map(m => {
      const full = m.q.replace('___', m.a);
      return `<div class="card miss">
        <div class="row"><span class="tag">${esc(m.level)}</span><span class="spacer"></span><button class="say" data-say="${esc(full)}">🔊</button></div>
        <div class="sentence en" style="font-size:18px">${esc(m.q).replace('___', `<span class="blank ok">${esc(m.a)}</span>`)}</div>
        <div class="muted" style="margin-top:6px">${L('ענית', 'You answered')}: ${m.you ? `<b class="w-bad"><bdi dir="ltr">${esc(m.you)}</bdi></b>` : L('🤷 לא יודע', "🤷 I don't know")} · ${L('נכון', 'Correct')}: <b class="w-ok"><bdi dir="ltr">${esc(m.a)}</bdi></b></div>
        ${m.why ? `<div class="why">💡 ${heMix(m.why)}</div>` : ''}
      </div>`;
    }).join('');
  }
  function bindSay() { view.querySelectorAll('[data-say]').forEach(b => b.onclick = e => { e.stopPropagation(); speak(b.dataset.say); }); }
  function levelMistakes() {
    const lv = LS.get('level', null);
    screen(L('הטעויות במבחן הרמה', 'Level test mistakes'));
    view.innerHTML = mistakesHtml(lv && lv.miss) + `<button class="btn" id="toPath">🧭 ${L('למסלול שלי', 'To my path')}</button>`;
    bindSay();
    $('#toPath').onclick = home;
  }
  function levelResult(res, miss) {
    const pass = lv => res[lv] && res[lv].ok / res[lv].total >= 0.6;
    const level = !pass('A2') ? 'A1–A2' : !pass('B1') ? 'A2' : !pass('B2') ? 'B1' : 'B2';
    const stage = { 'A1–A2': 1, A2: 1, B1: 2, B2: 3 }[level];
    LS.set('level', { level, date: Date.now(), res, miss });
    view.innerHTML = `<div class="card result"><div class="muted">${L('הרמה שלך כרגע', 'Your level now')}</div><div class="score">${level}</div>
        <div style="font-size:17px">${L(`מומלץ להתמקד בשלב ${stage} במסלול`, `Focus on stage ${stage} of the path`)}</div></div>
      <div class="card">${['A2', 'B1', 'B2'].map(lv => res[lv] ? `<div class="row" style="padding:6px 0"><b>${lv}</b><span class="spacer"></span>${res[lv].ok}/${res[lv].total}</div>` : '').join('')}</div>
      <div class="card muted">${L('A2 = בסיסי · B1 = מסתדר בשיחה יומיומית · B2 = מדבר בחופשיות על רוב הנושאים. המבחן קצר – הוא נותן כיוון, לא ציון מדויק.', 'A2 = basic · B1 = everyday conversation · B2 = speaks freely on most topics. A short test – a direction, not an exact grade.')}</div>
      ${mistakesHtml(miss)}
      <button class="btn" id="toPath">🧭 ${L('למסלול שלי', 'To my path')}</button>`;
    bindSay();
    $('#toPath').onclick = home;
  }

  function reminderEn() {
    return `
      <div class="card">
        <b>What does it do?</b>
        <div class="muted" style="margin-top:6px">Every evening at 20:30 the iPhone shows an encouraging message — a different one each day (${REMINDERS.length} rotating messages, in Hebrew). It is set up once in Apple's <b>Shortcuts</b> app.</div>
      </div>
      <div class="card">
        <b>Step 1 — Copy the messages</b>
        <button class="btn" id="copyMsgs">📋 Copy the ${REMINDERS.length} messages</button>
      </div>
      <div class="card">
        <b>Step 2 — Create a shortcut</b>
        <ol class="steps">
          <li>Open <b>Shortcuts</b> and go to the <b>Shortcuts</b> tab at the bottom (not "Automation").</li>
          <li>Tap <b>+</b> to create a new shortcut.</li>
          <li>Add a <b>Text</b> action and paste the messages into it.</li>
          <li>Add <b>Split Text</b> and make sure it splits by <b>New Lines</b>.</li>
          <li>Add <b>Get Item from List</b> and change "First Item" to <b>Random Item</b>.</li>
          <li>Add <b>Show Notification</b>, delete "Hello World" and pick the variable <b>Item from List</b>.</li>
          <li>Rename the shortcut (e.g. <b>English reminder</b>), tap ▶ to test, then <b>Done</b>.</li>
        </ol>
      </div>
      <div class="card">
        <b>Step 3 — Run it every evening at 20:30</b>
        <ol class="steps">
          <li>Go to the <b>Automation</b> tab and tap <b>+</b>.</li>
          <li>Choose <b>Time of Day</b>, set <b>20:30</b>, <b>Daily</b> and <b>Run Immediately</b>. Tap <b>Next</b>.</li>
          <li>From <b>My Shortcuts</b>, choose the shortcut you created. Done! 🎉</li>
        </ol>
        <div class="muted">Button names may differ slightly by iOS version and phone language.</div>
      </div>
      <div class="card"><b>Example messages:</b>${REMINDERS.slice(0, 6).map(m => `<div class="note he" style="font-size:15px;color:var(--ink)">• ${esc(m)}</div>`).join('')}</div>`;
  }

  function setLang(lang) {
    settings.lang = lang; saveSettings(); applyLang();
    toast(lang === 'en' ? 'Interface language: English' : 'שפת התצוגה: עברית');
    home();
  }

  // ---------- settings ----------
  function settingsScreen() {
    screen(L('הגדרות', 'Settings'));
    view.innerHTML = `<div class="card settings">
        <label>${L('שפת התצוגה', 'Interface language')} <span class="spacer"></span><select class="select" id="sLang" style="width:auto"><option value="he" ${settings.lang !== 'en' ? 'selected' : ''}>עברית</option><option value="en" ${settings.lang === 'en' ? 'selected' : ''}>English</option></select></label>
        <label><input type="checkbox" id="sHe" ${settings.showHe ? 'checked' : ''}> ${L('הצג תמיד תרגום לעברית (כמו כפתור "עב" למעלה)', 'Always show the Hebrew translation (like the "עב" button above)')}</label>
        <label><input type="checkbox" id="sPh" ${settings.showPh ? 'checked' : ''}> ${L('הצג תמיד הגייה (כמו כפתור 🗣 למעלה)', 'Always show pronunciation (like the 🗣 button above)')}</label>
        <label><input type="checkbox" id="sSay" ${settings.autoSay ? 'checked' : ''}> ${L('השמע אוטומטית מילים ומשפטים (כמו כפתור 🔊 למעלה)', 'Auto-play words and sentences (like the 🔊 button above)')}</label>
        <label>${L('מספר שאלות בסבב', 'Questions per round')} <span class="spacer"></span><select class="select" id="sRound" style="width:auto">${[5, 10, 15, 20].map(n => `<option ${n === settings.round ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>${L('מהירות דיבור', 'Speech speed')} <span class="spacer"></span><select class="select" id="sRate" style="width:auto">${[[0.6, L('איטי', 'Slow')], [0.75, L('רגוע', 'Relaxed')], [0.85, L('רגיל', 'Normal')], [1, L('מהיר', 'Fast')]].map(([v, t]) => `<option value="${v}" ${v === settings.rate ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label><button class="help" data-say="Hello Giora, let's practice English together!">🔊 ${L('בדיקת קול', 'Test voice')}</button></label>
      </div>
      <div class="card"><div class="muted">${ALL.length} ${L('מילים', 'words')} · ${LESSONS.length} ${L('שיעורים', 'lessons')} · ${L('עדכון אחרון:', 'Last update:')} ${esc((LESSONS[0] || {}).date || '')}</div></div>
      <button class="btn secondary" id="reset">${L('איפוס ההתקדמות', 'Reset progress')}</button>`;
    $('#sLang').onchange = e => setLang(e.target.value);
    $('#sHe').onchange = e => { settings.showHe = e.target.checked; saveSettings(); syncToggles(); };
    $('#sPh').onchange = e => { settings.showPh = e.target.checked; saveSettings(); syncToggles(); };
    $('#sSay').onchange = e => { settings.autoSay = e.target.checked; saveSettings(); syncToggles(); };
    $('#sRound').onchange = e => { settings.round = +e.target.value; saveSettings(); };
    $('#sRate').onchange = e => { settings.rate = +e.target.value; saveSettings(); };
    $('#reset').onclick = () => {
      if (!confirm(L('למחוק את כל ההתקדמות? אי אפשר לבטל את זה.', 'Delete all progress? This cannot be undone.'))) return;
      Object.keys(prog).forEach(k => delete prog[k]); saveProg();
      settings.streak = 0; settings.lastDay = ''; saveSettings();
      toast(L('ההתקדמות אופסה', 'Progress reset')); home();
    };
  }

  // ---------- boot ----------
  applyLang();
  syncToggles();
  home();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // when a new version (new words) is installed, reload once to show it
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return; reloaded = true; location.reload();
    });
  }
})();
