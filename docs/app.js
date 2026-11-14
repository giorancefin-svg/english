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
  const settings = Object.assign({ showHe: false, showPh: false, scope: 'all', round: 10, rate: 0.85, streak: 0, lastDay: '' },
    LS.get('settings', {}));
  const prog = LS.get('progress', {});
  const saveSettings = () => LS.set('settings', settings);
  if (!Array.isArray(settings.lessons)) settings.lessons = [];
  if (/^\d/.test(settings.scope)) { settings.lessons = [settings.scope]; settings.scope = 'custom'; }
  const saveProg = () => LS.set('progress', prog);

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
    if (!('speechSynthesis' in window)) { toast('אין תמיכה בהשמעה במכשיר'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain(text).replace(/\s*\/\s*/g, ', '));
    u.lang = voice ? voice.lang : 'en-US';
    if (voice) u.voice = voice;
    u.rate = slow ? Math.max(0.45, settings.rate - 0.35) : settings.rate;
    speechSynthesis.speak(u);
  }
  // delegate all speak buttons
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) { e.stopPropagation(); speak(b.getAttribute('data-say'), b.hasAttribute('data-slow')); }
  });

  // ---------- top bar ----------
  const tglHe = $('#tglHe'), tglPh = $('#tglPh'), backBtn = $('#backBtn'), title = $('#title');
  function syncToggles() {
    tglHe.classList.toggle('on', settings.showHe);
    tglPh.classList.toggle('on', settings.showPh);
    document.body.classList.toggle('show-he', settings.showHe);
    document.body.classList.toggle('show-ph', settings.showPh);
    document.querySelectorAll('[data-auto="he"]').forEach(el => el.classList.toggle('hidden', !settings.showHe && !el.dataset.open));
    document.querySelectorAll('[data-auto="ph"]').forEach(el => el.classList.toggle('hidden', !settings.showPh && !el.dataset.open));
  }
  tglHe.onclick = () => { settings.showHe = !settings.showHe; saveSettings(); syncToggles(); toast(settings.showHe ? 'תרגום לעברית מוצג' : 'תרגום לעברית מוסתר'); };
  tglPh.onclick = () => { settings.showPh = !settings.showPh; saveSettings(); syncToggles(); toast(settings.showPh ? 'הגייה מוצגת' : 'הגייה מוסתרת'); };
  backBtn.onclick = () => home();
  function screen(name, isHome) {
    title.textContent = name;
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
    if (opts.say) h += `<button class="help" data-say="${esc(opts.say)}">🔊 השמע</button><button class="help" data-say="${esc(opts.say)}" data-slow>🐢 לאט</button>`;
    if (opts.he) h += `<button class="help" data-open="he">עב תרגום</button>`;
    if (opts.ph) h += `<button class="help" data-open="ph">🗣 איך קוראים</button>`;
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
    if (s === 'all') return 'כל המילים';
    if (s === 'newest') return 'השיעור האחרון';
    if (s === 'last3') return '3 השיעורים האחרונים';
    if (s === 'weak') return 'מילים שטעיתי בהן';
    return 'שיעורים נבחרים';
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
  const MODES = [
    { id: 'smart', ico: '🧠', name: 'חזרה חכמה', desc: 'שילוב של כל סוגי התרגול, לפי מה שצריך לחזור עליו', wide: true },
    { id: 'flash', ico: '🃏', name: 'כרטיסיות', desc: 'מילה ← הפוך לתרגום' },
    { id: 'en2he', ico: '🔤', name: 'מה הפירוש?', desc: 'אנגלית ← בחר בעברית' },
    { id: 'he2en', ico: '💬', name: 'איך אומרים?', desc: 'עברית ← בחר באנגלית' },
    { id: 'sentence', ico: '✏️', name: 'השלם משפט', desc: 'בחר את המילה החסרה' },
    { id: 'sentenceType', ico: '⌨️', name: 'השלם משפט בכתיבה', desc: 'הקלד את המילה החסרה' },
    { id: 'paragraph', ico: '📄', name: 'השלם פסקה', desc: 'סיפור קצר עם מילים חסרות' },
    { id: 'listen', ico: '🎧', name: 'שמע וכתוב', desc: 'הקשב ואיית את המילה' },
    { id: 'match', ico: '🔗', name: 'התאמה', desc: 'חבר מילה לתרגום' },
    { id: 'list', ico: '📚', name: 'רשימת המילים', desc: 'כל המילים לפי שיעור' },
    { id: 'settings', ico: '⚙️', name: 'הגדרות', desc: 'מהירות דיבור, אורך סבב' }
  ];
  function home() {
    screen('English עם גיורא', true);
    const total = ALL.length;
    const learned = ALL.filter(w => box(w) >= 3).length;
    const due = ALL.filter(isDue).length;
    const opts = [['all', 'כל המילים'], ['newest', 'השיעור האחרון'], ['last3', '3 השיעורים האחרונים'], ['weak', 'מילים שטעיתי בהן'], ['custom', 'בחירת שיעורים (כמה שאני רוצה)']];
    view.innerHTML = `
      <div class="card stats">
        <div class="stat"><b>${learned}/${total}</b><span>מילים שלמדתי</span></div>
        <div class="stat"><b>${due}</b><span>לחזרה עכשיו</span></div>
        <div class="stat"><b>${settings.streak || 0}🔥</b><span>ימים ברצף</span></div>
      </div>
      <div class="card">
        <div class="muted" style="margin-bottom:6px">על אילו מילים לתרגל?</div>
        <select class="select" id="scope">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === settings.scope ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <div id="lessonPick" class="${settings.scope === 'custom' ? '' : 'hidden'}">
          <div class="row" style="margin:10px 0 4px"><span class="muted" id="pickCount"></span><span class="spacer"></span>
            <button class="help" id="pickAll">סמן הכל</button><button class="help" id="pickNone">נקה</button></div>
          <div class="lesson-list">${LESSONS.map(l => `<label class="lesson-item"><input type="checkbox" value="${esc(l.date)}" ${settings.lessons.indexOf(l.date) >= 0 ? 'checked' : ''}>
            <span>שיעור ${esc(l.date)}</span><span class="spacer"></span><span class="muted">${l.words.length} מילים</span></label>`).join('')}</div>
        </div>
      </div>
      <div class="modes">${MODES.map(m => `<button class="mode ${m.wide ? 'wide' : ''}" data-mode="${m.id}"><span class="ico">${m.ico}</span><b>${m.name}</b><small>${m.desc}</small></button>`).join('')}</div>`;
    const pickBox = $('#lessonPick');
    const updateCount = () => {
      const n = settings.lessons.length;
      const words = scopeWordsCount();
      $('#pickCount').textContent = n ? `נבחרו ${n} שיעורים · ${words} מילים` : 'לא נבחר שיעור — סמן שיעור אחד או יותר';
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
    view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => start(b.dataset.mode));
  }

  function start(mode) {
    if (mode === 'list') return listScreen();
    if (mode === 'settings') return settingsScreen();
    if (settings.scope === 'custom' && !settings.lessons.length) { toast('סמן לפחות שיעור אחד'); return; }
    if (mode === 'paragraph') return paragraphScreen();
    let pool = scopeWords();
    if (pool.length < 4) {
      if (settings.scope === 'weak') toast('אין מספיק מילים שטעית בהן — מתרגלים את כל המילים');
      pool = pool.length ? pool.concat(chooseWords(ALL.filter(w => pool.indexOf(w) < 0), 8)) : ALL;
    }
    if (mode === 'match') return matchScreen(pool);
    runRound(mode, pool);
  }

  // ---------- round runner ----------
  const TITLES = { smart: 'חזרה חכמה', flash: 'כרטיסיות', en2he: 'מה הפירוש?', he2en: 'איך אומרים?', sentence: 'השלם משפט', sentenceType: 'השלם משפט בכתיבה', listen: 'שמע וכתוב' };
  function runRound(mode, pool) {
    const words = chooseWords(pool, settings.round);
    let i = 0, score = 0;
    const firstCount = words.length;
    const missed = [];
    screen(TITLES[mode]);
    const next = () => {
      if (i >= words.length) return results(mode, score, firstCount, missed, pool);
      const w = words[i];
      let type = mode;
      if (mode === 'smart') {
        const b = box(w);
        const choices = b < 1 ? ['en2he', 'he2en', 'sentence', 'flash'] : b < 3 ? ['sentence', 'he2en', 'en2he', 'listen', 'sentenceType'] : ['sentenceType', 'listen', 'sentence', 'he2en'];
        type = pick(choices);
      }
      view.innerHTML = `<div class="progress"><i style="width:${(i / words.length) * 100}%"></i></div><div id="q"></div>`;
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
    const msg = pct === 100 ? 'מושלם! 🏆' : pct >= 80 ? 'כל הכבוד! 👏' : pct >= 50 ? 'יפה, ממשיכים להתאמן 💪' : 'כל תרגול מקרב אותך 🙂';
    view.innerHTML = `
      <div class="card result"><div class="score">${score}/${total}</div><div style="font-size:20px">${msg}</div></div>
      ${missed.length ? `<div class="card"><div class="muted" style="margin-bottom:6px">מילים לחזור עליהן:</div>${missed.map(wordRow).join('')}</div>` : ''}
      <button class="btn" id="again">סבב נוסף</button>
      <button class="btn secondary" id="toHome">לתפריט הראשי</button>`;
    $('#again').onclick = () => runRound(mode, pool);
    $('#toHome').onclick = home;
    syncToggles();
  }

  // ---------- exercise types ----------
  // each: (el, word, record(ok), next)
  const nextBtn = (el, next, label = 'הבא ←') => {
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
    card.insertAdjacentHTML('beforeend', `<div class="helpers"><button class="help" data-say="${esc(text)}">🔊 השמע את המשפט שוב</button><button class="help" data-say="${esc(text)}" data-slow>🐢 לאט</button></div>`);
    speak(text);
  }

  const EX = {};

  EX.flash = (el, w, record, next) => {
    const s = w.s && w.s.length ? pick(w.s) : null;
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
        <div class="muted" id="tapHint" style="margin-top:14px">לחץ על הכרטיס כדי לראות את התרגום</div>
      </div>
      <div id="act"></div>`;
    speak(w.en);
    $('#fc', el).onclick = () => {
      if (!$('#back', el).classList.contains('hidden')) return;
      $('#back', el).classList.remove('hidden');
      $('#tapHint', el).classList.add('hidden');
      el.querySelectorAll('[data-auto="ph"]').forEach(x => { x.dataset.open = 1; x.classList.remove('hidden'); });
      $('#act', el).innerHTML = `<div class="btn-row"><button class="btn bad" id="no">עוד לא ✗</button><button class="btn ok" id="yes">ידעתי ✓</button></div>`;
      $('#yes', el).onclick = () => { record(true); next(); };
      $('#no', el).onclick = () => { record(false); next(); };
    };
  };

  function choiceQuestion(el, w, record, next, cfg) {
    // cfg: {prompt, head, options:[{label, word}], correctWord, after}
    el.innerHTML = `<div class="card">${cfg.head}</div><div class="options">${cfg.options.map((o, i) =>
      `<button class="opt ${o.cls || ''}" data-i="${i}">${o.label}</button>`).join('')}</div>
      <button class="btn secondary" id="idk">🤷 לא יודע — הראה לי</button><div id="fb"></div>`;
    const answer = b => {
      const idk = !b;
      const ok = !idk && cfg.options[+b.dataset.i].word === cfg.correctWord;
      $('#idk', el).remove();
      el.querySelectorAll('.opt').forEach(x => {
        x.disabled = true;
        const ow = cfg.options[+x.dataset.i].word;
        if (ow === cfg.correctWord) x.classList.add('ok');
        // after answering, show the translation of every option (not only the right one)
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
    const head = ok ? 'נכון! ✓' : idk ? 'לא נורא — הנה התשובה. נתרגל את המילה הזאת שוב 💪' : 'לא נכון ✗ — נתרגל את המילה הזאת שוב';
    return `<div class="feedback ${ok ? 'ok' : 'bad'}">${head} ${extra}
      <div class="row" style="margin-top:6px"><span class="en" style="font-weight:700">${esc(w.en)}</span>
      <span class="ph en">${esc(w.ph)}</span><span class="spacer"></span>
      <button class="speak small" data-say="${esc(w.en)}">🔊</button></div>
      <div class="he" style="color:var(--ink)">${esc(w.he)}</div></div>`;
  }

  EX.en2he = (el, w, record, next) => {
    const opts = shuffle([w].concat(distractors(w, 3, x => x.he)));
    choiceQuestion(el, w, record, next, {
      head: `<div class="prompt">מה הפירוש של המילה?</div>${wordHead(w)}${autoPh(esc(w.ph))}${w.note ? `<div class="note en">${esc(w.note)}</div>` : ''}${helperBar({ ph: true })}`,
      options: opts.map(o => ({ label: `<span class="he">${esc(o.he)}</span>`, word: o })),
      correctWord: w,
      revealEn: true
    });
    speak(w.en);
  };

  EX.he2en = (el, w, record, next) => {
    const opts = shuffle([w].concat(distractors(w, 3, x => x.en)));
    choiceQuestion(el, w, record, next, {
      head: `<div class="prompt">איך אומרים באנגלית?</div><div class="big he" style="text-align:center">${esc(w.he)}</div>`,
      options: opts.map(o => ({ label: `<span class="en">${esc(o.en)}</span>${autoPh(esc(o.ph), 'ph note')}`, word: o })),
      correctWord: w,
      after: () => speak(w.en)
    });
  };

  function pickSentence(w) { return w.s && w.s.length ? pick(w.s) : { en: `[${w.en}]`, he: w.he }; }
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
      head: `<div class="prompt">בחר את המילה שחסרה במשפט:</div>
        <div class="sentence en">${sentenceHtml(s.en)}</div>
        ${autoHe(esc(s.he))}
        ${helperBar({ he: true })}`,
      options: opts.map(x => ({ label: `<span class="en">${esc(x.a)}</span>${autoPh(esc(x.o.ph), 'ph note')}`, word: x.o })),
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
      <button class="btn" id="check">בדוק</button>
      <button class="btn secondary" id="idk">לא יודע — הראה לי</button>
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
      if (loose.indexOf(v) >= 0) return finish(true, `<div class="note">הצורה המדויקת במשפט: <b class="en">${esc(cfg.shown)}</b></div>`);
      const close = answers.some(a => a.length >= 5 && lev(a, v) <= 1);
      finish(false, close ? `<div class="note">כמעט! שים לב לאיות: <b class="en">${esc(cfg.shown)}</b></div>`
        : `<div class="note">כתבת: <span class="en">${esc(inp.value)}</span> · התשובה: <b class="en">${esc(cfg.shown)}</b></div>`);
    };
    $('#check', el).onclick = check;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done ? next() : check(); } });
    $('#idk', el).onclick = () => finish(false, `<div class="note">התשובה: <b class="en">${esc(cfg.shown)}</b></div>`, true);
  }

  EX.sentenceType = (el, w, record, next) => {
    const s = pickSentence(w);
    const ans = answerOf(s);
    const first = ans.charAt(0);
    typeQuestion(el, w, record, next, {
      head: `<div class="prompt">הקלד את המילה שחסרה במשפט:</div>
        <div class="sentence en">${sentenceHtml(s.en)}</div>
        ${autoHe(esc(s.he))}
        <div class="he-line he" data-auto="hint">רמז: <b>${esc(w.he)}</b> · מתחילה ב-<b class="en">${esc(first)}</b> · ${ans.length} אותיות</div>
        ${helperBar({ he: true })}
        <div class="helpers"><button class="help" data-open="hint">💡 רמז</button></div>`,
      answers: [ans], loose: forms(w), shown: ans,
      onDone: ok => { const b = $('.blank', el); b.textContent = ans; b.classList.add(ok ? 'ok' : 'bad'); replayButtons(el, s.en); }
    });
    el.querySelectorAll('[data-auto="hint"]').forEach(x => x.classList.add('hidden'));
  };

  EX.listen = (el, w, record, next) => {
    typeQuestion(el, w, record, next, {
      head: `<div class="prompt">הקשב וכתוב את המילה באנגלית:</div>
        <div class="row" style="justify-content:center;gap:14px;margin:10px 0">
          <button class="speak" style="width:64px;height:64px;font-size:30px" data-say="${esc(w.en)}">🔊</button>
          <button class="speak" style="width:64px;height:64px;font-size:30px" data-say="${esc(w.en)}" data-slow>🐢</button>
        </div>
        ${autoHe(esc(w.he))}
        ${autoPh(esc(w.ph))}
        ${helperBar({ he: true, ph: true })}`,
      answers: forms(w).concat([w.en]), shown: w.en
    });
    setTimeout(() => speak(w.en), 250);
  };

  // ---------- matching ----------
  function matchScreen(pool) {
    screen('התאמה');
    const words = chooseWords(pool, 5);
    let left = words.length, mistakes = 0, sel = null;
    const missedIds = {};
    const enT = shuffle(words).map(w => ({ w, side: 'en' }));
    const heT = shuffle(words).map(w => ({ w, side: 'he' }));
    view.innerHTML = `<div class="card"><div class="prompt" style="margin:0">לחץ על מילה באנגלית ואז על התרגום שלה</div></div>
      <div class="match">${enT.map((t, i) => `<button class="tile en" data-s="en" data-i="${i}">${esc(t.w.en)}${autoPh(esc(t.w.ph), 'ph note')}</button>
        <button class="tile he" data-s="he" data-i="${i}">${esc(heT[i].w.he)}</button>`).join('')}</div><div id="fb"></div>`;
    syncToggles();
    view.querySelectorAll('.tile').forEach(b => b.onclick = () => {
      const t = (b.dataset.s === 'en' ? enT : heT)[+b.dataset.i];
      if (b.dataset.s === 'en') speak(t.w.en);
      if (!sel || sel.t.side === t.side) {
        if (sel) sel.b.classList.remove('sel');
        sel = { b, t }; b.classList.add('sel'); return;
      }
      if (sel.t.w === t.w) {
        sel.b.classList.add('done'); b.classList.add('done');
        if (!missedIds[t.w.id]) grade(t.w.id, true);
        sel = null; left--;
        if (!left) {
          $('#fb').innerHTML = `<div class="card result"><div class="score">${mistakes === 0 ? '🏆' : '✓'}</div><div>${mistakes === 0 ? 'בלי טעויות!' : 'טעויות: ' + mistakes}</div></div>
            <button class="btn" id="again">עוד סבב</button><button class="btn secondary" id="toHome">לתפריט הראשי</button>`;
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
    screen('השלם פסקה');
    let lessons = LESSONS.filter(l => l.p && l.p.length);
    const s = settings.scope;
    const chosen = chosenLessons();
    const inScope = lessons.filter(l => (s === 'custom' && chosen.indexOf(l) >= 0) || (s === 'newest' && l === LESSONS[0]) || (s === 'last3' && LESSONS.indexOf(l) < 3));
    let lesson = lessonDate ? lessons.find(l => l.date === lessonDate) : pick(inScope.length ? inScope : lessons);
    if (!lesson) { view.innerHTML = '<div class="card">אין עדיין פסקאות.</div>'; return; }
    const para = pick(lesson.p);
    const targets = [];
    para.en.replace(/\[([^\]]+)\]/g, (_, a) => { targets.push(a); return _; });
    let n = 0;
    const html = esc(para.en).replace(/\[([^\]]+)\]/g, () => `<span class="blank" data-b="${n++}">&nbsp;</span>`);
    const bank = shuffle(targets.map((a, i) => ({ a, i })));
    const filled = targets.map(() => null); // index into bank
    let active = 0;
    view.innerHTML = `
      <div class="card">
        <div class="row"><div class="muted">שיעור ${esc(lesson.date)}</div><span class="spacer"></span>
          <select class="select" id="pl" style="width:auto;padding:6px 8px">${lessons.map(l => `<option value="${esc(l.date)}" ${l === lesson ? 'selected' : ''}>${esc(l.date)}</option>`).join('')}</select></div>
        <div class="prompt" style="margin-top:8px">לחץ על מילה מהמחסן כדי למלא את המקום המסומן. לחיצה על מקום שמולא מנקה אותו.</div>
        <div class="sentence en" id="para">${html}</div>
        ${autoHe(esc(para.he))}
        ${helperBar({ he: true })}
        <div class="bank" id="bank">${bank.map((b, k) => `<button class="chip" data-k="${k}">${esc(b.a)}</button>`).join('')}</div>
      </div>
      <button class="btn" id="check">בדוק</button>
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
      if (filled.some(f => f == null)) { toast('יש עוד מקומות ריקים'); return; }
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
      $('#fb').innerHTML = `<div class="feedback ${good === targets.length ? 'ok' : 'bad'}">${good}/${targets.length} נכונות ${good === targets.length ? '🏆' : ''}
        <div class="helpers"><button class="help" data-say="${esc(para.en)}">🔊 השמע את כל הפסקה</button></div></div>
        <button class="btn" id="more">פסקה נוספת</button><button class="btn secondary" id="toHome">לתפריט הראשי</button>`;
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
    screen('רשימת המילים');
    view.innerHTML = `<input class="input search" id="q" placeholder="חיפוש באנגלית או בעברית" style="direction:rtl;text-align:right;font-size:17px">
      <div id="list"></div>`;
    const stripNiqqud = s => String(s).replace(/[֑-ׇ]/g, '');
    const render = () => {
      const q = stripNiqqud($('#q').value.trim().toLowerCase());
      $('#list').innerHTML = LESSONS.map(l => {
        const ws = l.words.filter(w => !q || w.en.toLowerCase().includes(q) || stripNiqqud(w.heFull).includes(q));
        if (!ws.length) return '';
        return `<div class="lesson-h">שיעור ${esc(l.date)} · ${ws.length} מילים</div><div class="card" style="padding:4px 12px">${ws.map(wordRow).join('')}</div>`;
      }).join('') || '<div class="card muted">לא נמצאו מילים</div>';
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
        <div class="note">${p ? `תשובות נכונות: ${p.ok} · טעויות: ${p.bad}` : 'עוד לא תרגלת את המילה הזאת'}</div>`;
      more.classList.remove('hidden');
    };
  }

  // ---------- settings ----------
  function settingsScreen() {
    screen('הגדרות');
    view.innerHTML = `<div class="card settings">
        <label><input type="checkbox" id="sHe" ${settings.showHe ? 'checked' : ''}> הצג תמיד תרגום לעברית (כמו כפתור "עב" למעלה)</label>
        <label><input type="checkbox" id="sPh" ${settings.showPh ? 'checked' : ''}> הצג תמיד הגייה (כמו כפתור 🗣 למעלה)</label>
        <label>מספר שאלות בסבב <span class="spacer"></span><select class="select" id="sRound" style="width:auto">${[5, 10, 15, 20].map(n => `<option ${n === settings.round ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>מהירות דיבור <span class="spacer"></span><select class="select" id="sRate" style="width:auto">${[[0.6, 'איטי'], [0.75, 'רגוע'], [0.85, 'רגיל'], [1, 'מהיר']].map(([v, t]) => `<option value="${v}" ${v === settings.rate ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label><button class="help" data-say="Hello Giora, let's practice English together!">🔊 בדיקת קול</button></label>
      </div>
      <div class="card"><div class="muted">${ALL.length} מילים · ${LESSONS.length} שיעורים · עדכון אחרון: ${esc((LESSONS[0] || {}).date || '')}</div></div>
      <button class="btn secondary" id="reset">איפוס ההתקדמות</button>`;
    $('#sHe').onchange = e => { settings.showHe = e.target.checked; saveSettings(); syncToggles(); };
    $('#sPh').onchange = e => { settings.showPh = e.target.checked; saveSettings(); syncToggles(); };
    $('#sRound').onchange = e => { settings.round = +e.target.value; saveSettings(); };
    $('#sRate').onchange = e => { settings.rate = +e.target.value; saveSettings(); };
    $('#reset').onclick = () => {
      if (!confirm('למחוק את כל ההתקדמות? אי אפשר לבטל את זה.')) return;
      Object.keys(prog).forEach(k => delete prog[k]); saveProg();
      settings.streak = 0; settings.lastDay = ''; saveSettings();
      toast('ההתקדמות אופסה'); home();
    };
  }

  // ---------- boot ----------
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
