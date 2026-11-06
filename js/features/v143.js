/* KHL Manager 14.3 — ссылки на клубы и игроков в новостях, переходы из карточки клуба в таблицу,
   кнопка «Вернуться к своему клубу» в матч-центре. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const CASES = ['nom', 'gen', 'dat', 'acc', 'ins', 'prep'];
  const LET = 'А-Яа-яЁёA-Za-z';

  /* ---------- ссылки в новостях ---------- */
  let IDX = null, IDX_KEY = '';
  function build(app) {
    const key = app.db.teams.length + ':' + app.db.players.length;
    if (IDX && IDX_KEY === key) return IDX;
    const forms = new Map();
    for (const t of app.db.teams) {
      for (const c of CASES) { let f = ''; try { f = app.tn(t, c); } catch (e) { } if (f && !forms.has(f)) forms.set(f, t.id); }
      if (!forms.has(t.name)) forms.set(t.name, t.id);
    }
    const keys = [...forms.keys()].sort((a, b) => b.length - a.length);
    const clRx = new RegExp('(^|[^' + LET + '])(' + keys.map(rx).join('|') + ')(?![' + LET + '])', 'g');
    const full = new Map(), sur = new Map();
    for (const p of app.db.players) {
      for (const c of CASES) {
        let f = '', s = '';
        try { f = app.pn(p, c); s = app.sn(p, c); } catch (e) { continue; }
        const lf = f.toLowerCase();
        if (lf) { if (full.has(lf) && full.get(lf) !== p.id) full.set(lf, -1); else full.set(lf, p.id); }
        if (s) { if (!sur.has(s)) sur.set(s, new Set()); sur.get(s).add(p.id); }
      }
    }
    IDX_KEY = key;
    return (IDX = { forms, clRx, full, sur });
  }
  const tagP = (id, t) => `<span class="nm" data-pl="${E(id)}">${E(t)}</span>`;
  function linkPlayers(ix, text) {
    const re = /[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?/g, toks = []; let m;
    while ((m = re.exec(text))) toks.push({ t: m[0], i: m.index });
    let out = '', pos = 0;
    for (let k = 0; k < toks.length; k++) {
      const a = toks[k], b = toks[k + 1];
      if (b && text.slice(a.i + a.t.length, b.i) === ' ') {
        const id = ix.full.get((a.t + ' ' + b.t).toLowerCase());
        if (id && id !== -1) { out += E(text.slice(pos, a.i)) + tagP(id, a.t + ' ' + b.t); pos = b.i + b.t.length; k++; continue; }
      }
      const set = ix.sur.get(a.t);
      if (set && set.size === 1) { out += E(text.slice(pos, a.i)) + tagP([...set][0], a.t); pos = a.i + a.t.length; }
    }
    return out + E(text.slice(pos));
  }
  proto.newsLinkHtml = function (text) {
    text = String(text == null ? '' : text);
    if (!this.db || !this.db.teams) return E(text);
    const ix = build(this);
    let out = '', last = 0, m; ix.clRx.lastIndex = 0;
    while ((m = ix.clRx.exec(text))) {
      const start = m.index + m[1].length, name = m[2];
      out += linkPlayers(ix, text.slice(last, start)) + `<span class="nm" data-cl="${E(ix.forms.get(name))}">${E(name)}</span>`;
      last = start + name.length;
    }
    return out + linkPlayers(ix, text.slice(last));
  };
  function linkTextNodes(app, root) {
    const w = document.createTreeWalker(root, 4), nodes = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue && n.nodeValue.trim() && !(n.parentElement && n.parentElement.closest('[data-pl],[data-cl],button'))) nodes.push(n);
    for (const n of nodes) {
      const html = app.newsLinkHtml(n.nodeValue);
      if (html.indexOf('data-') < 0) continue;
      const tpl = document.createElement('span'); tpl.innerHTML = html;
      const frag = document.createDocumentFragment(); while (tpl.firstChild) frag.appendChild(tpl.firstChild);
      n.parentNode.replaceChild(frag, n);
    }
  }
  const baseNews = proto.renderNews;
  proto.renderNews = function () {
    const r = baseNews.apply(this, arguments);
    try {
      if (typeof document !== 'undefined' && document.querySelectorAll)
        document.querySelectorAll('#news-feed .news-title, #news-feed .news-body, #news-feed .news-teams').forEach(el => linkTextNodes(this, el));
    } catch (e) { console.warn('news links', e); }
    return r;
  };
  const baseOv = proto.renderOverview;
  if (baseOv) proto.renderOverview = function () {
    const r = baseOv.apply(this, arguments);
    try { const host = document.getElementById('ov-news'); if (host) host.querySelectorAll('.ov-news-item').forEach(el => linkTextNodes(this, el)); } catch (e) { }
    return r;
  };

  /* ---------- переход из карточки клуба в «Турнирную таблицу» ---------- */
  proto.openStandings = function (kind, value) {
    const btn = document.querySelector('.nav button[data-view="standings"]');
    this.switchTab('standings', btn);
    if (btn) { document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b === btn)); }
    if (kind === 'conf') { this._stTab = 'conf'; this._stxConf = value === 'east' ? 'east' : 'west'; this._divFocus = null; }
    else { this._stTab = 'div'; this._divFocus = value; }
    this.renderStandingsTabs();
    if (kind === 'conf' && this.stxConfSet) this.stxConfSet(this._stxConf);
    try { window.scrollTo(0, 0); } catch (e) { }
  };
  const baseDiv = proto.renderDivisionStandings;
  proto.renderDivisionStandings = function () {
    const r = baseDiv.apply(this, arguments);
    try {
      const f = this._divFocus, root = document.getElementById('full-divisions');
      if (f && root) {
        const name = 'Дивизион ' + this.divisionName(f);
        const card = [...root.querySelectorAll(':scope > .card')].find(c => (c.querySelector('.st-dh') || {}).textContent === name);
        if (card && card !== root.firstElementChild) root.insertBefore(card, root.firstElementChild);
      }
    } catch (e) { }
    return r;
  };

  /* ---------- «Вернуться к своему клубу» в матч-центре ---------- */
  proto.lastOwnPlayedMatch = function () {
    const my = this.state.teamId;
    return this.state.matches.filter(x => x.played && !x.cancelled && (x.homeId === my || x.awayId === my)).sort((a, b) => b.dateOffset - a.dateOffset || String(b.id).localeCompare(String(a.id)))[0] || null;
  };
  proto.backToOwnMatch = function () {
    const m = this.lastOwnPlayedMatch(); if (!m) return;
    this.currentMatchId = m.id; this.renderMatchCenter();
  };
  const baseMc = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = baseMc.apply(this, arguments);
    try {
      const b = document.getElementById('mc-back-own'); if (!b || !this.state) return r;
      const cur = this.state.matches.find(x => x.id === this.currentMatchId), my = this.state.teamId;
      b.hidden = !(cur && cur.homeId !== my && cur.awayId !== my && this.lastOwnPlayedMatch());
    } catch (e) { }
    return r;
  };
})();

/* 14.4.1 — на широком экране «Таблица конференции», «Три звезды» и «Травмы» стоят под «Статистикой матча» */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  let home = null;
  const wide = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width:1001px)').matches;
  proto.mcPlaceTour = function () {
    const tour = document.getElementById('mc-tour'), col = document.getElementById('mc-statcol'), log = document.getElementById('match-log');
    if (!tour) return;
    if (!home && log && tour.previousElementSibling === log) home = log;
    if (wide() && col) { if (tour.parentNode !== col) col.appendChild(tour); }
    else if (home && tour.previousElementSibling !== home) home.insertAdjacentElement('afterend', tour);
  };
  const base = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = base.apply(this, arguments);
    try { this.mcPlaceTour(); } catch (e) { }
    return r;
  };
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', () => { try { if (typeof app !== 'undefined' && app.mcPlaceTour) app.mcPlaceTour(); } catch (e) { } });
})();
