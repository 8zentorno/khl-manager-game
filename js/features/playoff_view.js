/* 9.21.0 — новый вид вкладки «Плей-офф»: сетка по стадиям, карточки серий, шторка серии, лента результатов.
 * Меняет только отображение: логика кубка (серии, посев, расписание) не затрагивается. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const CONF = { west: 'Запад', east: 'Восток' };
  const EXPECT = { 1: 8, 2: 4, 3: 2, 4: 1 };
  const SHORT = { 1: '1/8 финала', 2: '1/4 финала', 3: 'Полуфинал', 4: 'Финал' };
  const STAGE_IDX = [1, 2, 3, 4];

  const seriesAll = app => {
    const po = app.state && app.state.playoff; if (!po) return [];
    const seen = new Set(), out = [];
    [...(po.history || []).flatMap(h => h.series || []), ...(po.series || [])].forEach(s => { if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); } });
    return out;
  };
  const hue = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const code = n => String(n || '?').replace(/[^A-Za-zА-Яа-яЁё ]/g, '').split(' ').map((w, i, a) => a.length > 1 ? w[0] : w.slice(0, 3)).join('').slice(0, 3).toUpperCase();

  // единая сводка по серии: победы, результаты по играм, следующая игра
  proto.poSeriesInfo = function (series) {
    let data = { winsA: Number(series.winsA) || 0, winsB: Number(series.winsB) || 0, complete: !!series.complete, winnerId: series.winnerId || null, results: series.gameResults || [] };
    if (typeof this.__poCanonicalizeSeries729 === 'function') { try { data = this.__poCanonicalizeSeries729(series, false) || data; } catch (e) {} }
    const matches = (this.state.matches || []).filter(m => m.playoff && String(m.seriesId) === String(series.id) && !m.cancelled).sort((x, y) => Number(x.gameNo) - Number(y.gameNo));
    const byNo = new Map(matches.map(m => [Number(m.gameNo), m]));
    const results = (Array.isArray(data.results) ? data.results : []).map((g, i) => {
      const no = Number(g.gameNo) || i + 1, m = byNo.get(no);
      if (m && (!m.played || m.cancelled)) return null;
      const homeId = g.homeId || (m && m.homeId) || series.teamA, awayId = g.awayId || (m && m.awayId) || (homeId === series.teamA ? series.teamB : series.teamA);
      const hs = Number(g.homeScore != null ? g.homeScore : m && m.homeScore), as = Number(g.awayScore != null ? g.awayScore : m && m.awayScore);
      if (!Number.isFinite(hs) || !Number.isFinite(as) || hs === as) return null;
      return { gameNo: no, homeId, awayId, homeScore: hs, awayScore: as, ot: !!(g.ot || g.so), winnerId: hs > as ? homeId : awayId, match: m };
    }).filter(Boolean).sort((x, y) => x.gameNo - y.gameNo);
    const winsA = Math.max(0, Number(data.winsA) || 0), winsB = Math.max(0, Number(data.winsB) || 0);
    const complete = !!data.complete || !!series.complete || winsA >= 4 || winsB >= 4;
    const upcoming = matches.filter(m => !m.played && (typeof this.poGameVisible !== 'function' || this.poGameVisible(m)));
    return { winsA, winsB, complete, winnerId: data.winnerId || series.winnerId || (winsA >= 4 ? series.teamA : winsB >= 4 ? series.teamB : null), results, byNo, next: complete ? null : upcoming[0] || null, matches };
  };

  proto.poCardHtml = function (series, stage, conf) {
    const e = s => this.escape(s);
    if (!series) return `<div class="pv-card tbd" data-st="${stage}" data-conf="${e(conf || '')}"><div class="pv-ch"><span>${e(SHORT[stage])}</span><span>ждёт пару</span></div><div class="pv-row"><span class="pv-crest" style="background:var(--line)">?</span><div class="pv-nm"><b class="muted">Победитель серии</b><small>определится</small></div></div></div>`;
    const info = this.poSeriesInfo(series), my = this.state.teamId;
    const you = series.teamA === my || series.teamB === my;
    const nameOf = id => (this.teamById(id) || {}).name || id;
    const row = (id, seed, wins, home1) => {
      const win = info.complete && info.winnerId === id, lose = info.complete && !win;
      const pips = Array.from({ length: 7 }, (_, i) => {
        const no = i + 1, r = info.results.find(g => g.gameNo === no);
        const on = r && r.winnerId === id;
        const far = !r && no > 4;
        return `<i class="${on ? 'on' : ''}${far ? ' far' : ''}" title="Игра ${no}: ${r ? (on ? 'победа' : 'поражение') : 'не сыграна'}"></i>`;
      }).join('');
      return `<div class="pv-row${win ? ' win' : ''}${lose ? ' lose' : ''}"><span class="pv-crest kit" style="${this.kitCrestStyle(id)}">${e(code(nameOf(id)))}</span><div class="pv-nm"><b>${e(nameOf(id))}${id === my ? ' ◀' : ''}</b><small>${Number(seed) > 0 ? 'посев ' + Number(seed) : ''}</small></div><span class="pv-pips" aria-label="Победы: ${wins}">${pips}</span><span class="pv-sc">${wins}</span></div>`;
    };
    const lead = info.winsA === info.winsB ? null : info.winsA > info.winsB ? series.teamA : series.teamB;
    let foot;
    if (info.complete) foot = `<span><b>${e(nameOf(info.winnerId))}</b> выиграл ${Math.max(info.winsA, info.winsB)}:${Math.min(info.winsA, info.winsB)}</span>`;
    else {
      const left = info.winsA === 0 && info.winsB === 0 ? 'Серия начинается · 0:0' : lead ? `<b>${e(nameOf(lead))}</b> ведёт ${Math.max(info.winsA, info.winsB)}:${Math.min(info.winsA, info.winsB)}` : `Равенство ${info.winsA}:${info.winsB}`;
      let right = '';
      if (info.next) { const d = typeof this.playoffShortDate726 === 'function' ? this.playoffShortDate726(info.next.dateOffset) : this.formatDate(info.next.dateOffset); right = `<span>И${Number(info.next.gameNo)} · ${e(d)} · у ${e(nameOf(info.next.homeId))}</span>`; }
      foot = `<span>${left}</span>${right}`;
    }
    const tag = you ? '<span class="tag">Твоя серия</span>' : info.complete ? '<span>Завершена</span>' : info.results.length ? '<span>Идёт</span>' : '<span>Скоро</span>';
    return `<button type="button" class="pv-card${you ? ' you' : ''}" data-st="${stage}" data-sid="${e(series.id)}" onclick="app.poOpenSeries('${e(series.id)}')" aria-label="${e(nameOf(series.teamA))} — ${e(nameOf(series.teamB))}: игры серии"><div class="pv-ch"><span>${e(CONF[series.conference] || SHORT[stage])}</span>${tag}</div>${row(series.teamA, series.seedA, info.winsA, true)}${row(series.teamB, series.seedB, info.winsB, false)}<div class="pv-cf">${foot}</div></button>`;
  };

  proto.poStageSeries = function (stage) {
    const list = seriesAll(this).filter(s => Number(s.stage) === stage).sort((a, b) => (a.conference === b.conference ? 0 : a.conference === 'east' ? -1 : b.conference === 'east' ? 1 : 0) || Number(a.seedA || 99) - Number(b.seedA || 99));
    return list;
  };

  proto.poSetStage = function (i) { this._poView = 'l'; this._poStage = i; this.renderPlayoffs(); };
  proto.poSetView = function (v) { this._poView = v; this.renderPlayoffs(); };

  proto.renderPlayoffStagesHtml = function () {
    const po = this.state && this.state.playoff; if (!po) return '';
    if (typeof this.auditPlayoffSeriesResults728 === 'function') this.auditPlayoffSeriesResults728(true);
    if (typeof this.__poReseedPlayoffCards729 === 'function') this.__poReseedPlayoffCards729(true);
    const view = this._poView || (typeof window !== 'undefined' && window.innerWidth < 700 ? 'l' : 'b');
    const cur = Math.min(4, Math.max(1, Number(po.stage) || 1));
    const stage = this._poStage != null ? this._poStage : cur;
    const cols = STAGE_IDX.map(st => { const list = this.poStageSeries(st), exp = EXPECT[st]; return { st, list, exp, done: list.length >= exp && list.every(s => s.complete) }; });
    const tabs = cols.map(c => `<button type="button" role="tab" aria-selected="${view === 'l' && stage === c.st}" onclick="app.poSetStage(${c.st})"><span class="pv-dot ${c.done ? 'done' : c.list.length ? 'live' : ''}"></span>${this.escape(SHORT[c.st])}</button>`).join('');
    const views = `<button type="button" aria-pressed="${view === 'b'}" onclick="app.poSetView('b')">Сетка</button><button type="button" aria-pressed="${view === 'l'}" onclick="app.poSetView('l')">Стадия</button>`;
    const cards = c => { const out = c.list.map(s => this.poCardHtml(s, c.st)); while (out.length < c.exp) out.push(this.poCardHtml(null, c.st)); return out; };
    let main;
    if (view === 'b') {
      // сетка лесенкой: карточки ставит poLayoutBracket (по источникам серий), линии рисуются только от победителей.
      // Заголовки колонок остаются в разметке, но скрыты стилем (.pv-heads).
      const heads = `<div class="pv-heads" aria-hidden="true">${cols.map(c => `<h3><span>${this.escape(SHORT[c.st])}</span><span>${c.list.length}/${c.exp}</span></h3>`).join('')}</div>`;
      const next = cols.find(c => c.list.length < c.exp && c.st > 1 && cols[c.st - 2].list.length);
      let html = '';
      cols.forEach(c => c.list.forEach(s => { html += this.poCardHtml(s, c.st); }));
      if (next) {
        const per = { 1: 4, 2: 2, 3: 1, 4: 0 }[next.st], have = { east: 0, west: 0 };
        next.list.forEach(s => { if (have[s.conference] != null) have[s.conference]++; });
        if (per) ['east', 'west'].forEach(k => { for (let n = have[k]; n < per; n++) html += this.poCardHtml(null, next.st, k); });
        else for (let n = next.list.length; n < next.exp; n++) html += this.poCardHtml(null, next.st, '');
      }
      main = `<div class="pv-bracket" id="pv-bracket">${heads}<div class="pv-bk" id="pv-bk">${html}<svg class="pv-lines" id="pv-lines" aria-hidden="true"></svg></div></div>`;
    } else {
      const c = cols.find(x => x.st === stage) || cols[0];
      if (c.st >= 3) main = `<div class="pv-list">${cards(c).join('')}</div>`;
      else {
        const groups = ['east', 'west'].map(k => ({ k, ss: c.list.filter(s => s.conference === k) }));
        const known = groups.reduce((n, g) => n + g.ss.length, 0);
        let html = '<div class="pv-list">';
        if (known === 0) html += cards(c).join('');
        else groups.forEach(g => { if (g.ss.length) html += `<div class="pv-grp">${CONF[g.k]}</div>` + g.ss.map(s => this.poCardHtml(s, c.st)).join(''); });
        if (known && known < c.exp) html += `<div class="pv-grp">Ждут пару</div>` + Array.from({ length: c.exp - known }, () => this.poCardHtml(null, c.st)).join('');
        main = html + '</div>';
      }
    }
    // лента последних результатов
    const feed = [];
    seriesAll(this).forEach(s => {
      const info = this.poSeriesInfo(s); let a = 0, b = 0;
      info.results.forEach(g => { if (g.winnerId === s.teamA) a++; else b++; feed.push({ s, g, a, b, d: g.match ? Number(g.match.dateOffset) : 0 }); });
    });
    feed.sort((x, y) => y.d - x.d || y.g.gameNo - x.g.gameNo);
    const nm = id => this.escape((this.teamById(id) || {}).name || id);
    const feedHtml = feed.slice(0, 10).map(({ s, g, a, b, d }) => `<div class="pv-fi"><small>${this.escape(SHORT[s.stage])} · И${g.gameNo}${d ? ' · ' + this.escape(typeof this.playoffShortDate726 === 'function' ? this.playoffShortDate726(d) : this.formatDate(d)) : ''}</small><div class="l"><span>${this.kitDot(g.homeId, true, 's')} ${nm(g.homeId)}</span><b>${g.homeScore}</b></div><div class="l"><span>${this.kitDot(g.awayId, false, 's')} ${nm(g.awayId)}</span><b>${g.awayScore}</b></div><small>${g.ot ? 'ОТ · ' : ''}серия ${a}:${b}</small></div>`).join('');
    return `<div class="pv"><div class="pv-bar"><div class="pv-seg" role="tablist" aria-label="Стадия">${tabs}</div><div class="pv-seg pv-views">${views}</div></div><div class="pv-main">${main}</div>${feedHtml ? `<section><div class="pv-eyebrow">Последние результаты</div><div class="pv-feed">${feedHtml}</div></section>` : ''}</div>`;
  };

  proto.poOpenSeries = function (id) {
    const s = seriesAll(this).find(x => String(x.id) === String(id)); if (!s) return;
    this.poCloseSeries();
    const e = x => this.escape(x), nameOf = t => (this.teamById(t) || {}).name || t;
    const info = this.poSeriesInfo(s); let a = 0, b = 0;
    const fmt = off => typeof this.playoffShortDate726 === 'function' ? this.playoffShortDate726(off) : this.formatDate(off);
    const rows = info.results.map(g => {
      if (g.winnerId === s.teamA) a++; else b++;
      return `<tr><td>И${g.gameNo}</td><td>${g.match ? e(fmt(g.match.dateOffset)) : ''}</td><td>${this.kitDot(g.homeId, true, 's')} ${e(nameOf(g.homeId))} — ${this.kitDot(g.awayId, false, 's')} ${e(nameOf(g.awayId))}</td><td class="sc">${g.homeScore}:${g.awayScore}${g.ot ? ' ОТ' : ''}</td><td>${a}:${b}</td></tr>`;
    }).join('');
    const up = info.next ? `<tr class="up"><td>И${Number(info.next.gameNo)}</td><td>${e(fmt(info.next.dateOffset))}</td><td>${this.kitDot(info.next.homeId, true, 's')} ${e(nameOf(info.next.homeId))} — ${this.kitDot(info.next.awayId, false, 's')} ${e(nameOf(info.next.awayId))}</td><td class="sc">—</td><td></td></tr>` : '';
    const el = document.createElement('div'); el.id = 'po-sheet'; el.className = 'pv-sheetbg';
    el.onclick = ev => { if (ev.target === el) this.poCloseSeries(); };
    el.innerHTML = `<div class="pv-sheet" role="dialog" aria-modal="true"><div class="pv-eyebrow">${e(SHORT[s.stage])}${CONF[s.conference] ? ' · ' + CONF[s.conference] : ''}</div><h2>${e(nameOf(s.teamA))} ${info.winsA}:${info.winsB} ${e(nameOf(s.teamB))}</h2><div class="pv-tbl"><table><thead><tr><th>Игра</th><th>Дата</th><th>Матч</th><th>Счёт</th><th>Серия</th></tr></thead><tbody>${rows || ''}${up}</tbody></table></div>${!rows && !up ? '<p class="small muted">Игры серии ещё не начались.</p>' : ''}<div class="pv-sheetact"><button type="button" class="btn" onclick="app.poCloseSeries()">Закрыть</button></div></div>`;
    document.body.appendChild(el);
  };
  proto.poCloseSeries = function () { const el = document.getElementById('po-sheet'); if (el) el.remove(); };

  /* ---- сетка лесенкой ---- */
  const CW = 285, CG = 64, GAP = 14, CONFGAP = 26, FALLBACK_H = 200;
  proto.poLayoutBracket = function () {
    const bk = document.getElementById('pv-bk'); if (!bk || !this.state || !this.state.playoff) return;
    const cards = [...bk.querySelectorAll('.pv-card')];
    cards.forEach(c => { c.style.position = 'static'; c.style.height = 'auto'; c.style.width = CW + 'px'; });
    let H = 0; cards.forEach(c => { H = Math.max(H, c.offsetHeight); });
    if (!H) H = FALLBACK_H;
    const lists = STAGE_IDX.map(st => this.poStageSeries(st)), infos = lists.map(l => l.map(s => this.poSeriesInfo(s)));
    const el = new Map(); cards.forEach(c => { if (c.dataset.sid) el.set(c.dataset.sid, c); });
    const Y = [[], [], [], []], src = [[], [], [], []], place = (items, top0) => { let prev = top0; const out = []; items.sort((p, q) => p.c - q.c || p.i - q.i).forEach(it => { let t = it.c - H / 2; if (t < prev + H + GAP) t = prev + H + GAP; out[it.i] = t; prev = t; }); return out; };
    let y = 0;
    lists[0].forEach((s, i) => { if (i > 0 && lists[0][i - 1].conference !== s.conference) y += CONFGAP; Y[0][i] = y; y += H + GAP; });
    const total = Math.max(H, y - GAP);
    const srcOf = (k, team) => lists[k - 1].findIndex((p, pi) => (p.teamA === team || p.teamB === team) && infos[k - 1][pi].complete && infos[k - 1][pi].winnerId === team);
    for (let k = 1; k < 4; k++) {
      const n = lists[k].length; if (!n) continue;
      const items = lists[k].map((s, i) => {
        const sa = srcOf(k, s.teamA), sb = srcOf(k, s.teamB), ca = sa >= 0 ? Y[k - 1][sa] + H / 2 : null, cb = sb >= 0 ? Y[k - 1][sb] + H / 2 : null;
        src[k][i] = [sa, sb];
        return { i, c: ca != null && cb != null ? (ca + cb) / 2 : ca != null ? ca : cb != null ? cb : total * (i + .5) / n };
      });
      Y[k] = place(items, -1e9);
    }
    let maxB = 0;
    STAGE_IDX.forEach((st, k) => lists[k].forEach((s, i) => {
      const c = el.get(String(s.id)); if (!c || Y[k][i] == null) return;
      Object.assign(c.style, { position: 'absolute', left: k * (CW + CG) + 'px', top: Y[k][i] + 'px', width: CW + 'px', height: H + 'px' });
      maxB = Math.max(maxB, Y[k][i] + H);
    }));
    // заглушки ближайшей стадии: по конференциям, на высоте источников
    const ph = cards.filter(c => c.classList.contains('tbd')), phSt = ph.length ? Number(ph[0].dataset.st) : 0;
    if (phSt > 1) {
      const k = phSt - 1, items = ph.map((c, i) => {
        const cs = lists[k - 1].map((s, j) => ({ s, y: Y[k - 1][j] + H / 2 })).filter(o => !c.dataset.conf || o.s.conference === c.dataset.conf).map(o => o.y);
        return { i, c: cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : total / 2 };
      });
      const ys = place(items, -1e9);
      ph.forEach((c, i) => { Object.assign(c.style, { position: 'absolute', left: k * (CW + CG) + 'px', top: ys[i] + 'px', width: CW + 'px', height: H + 'px' }); maxB = Math.max(maxB, ys[i] + H); });
    }
    // линии: только от победителя серии к серии, куда он попал
    const my = this.state.teamId; let paths = '';
    for (let k = 1; k < 4; k++) lists[k].forEach((s, i) => [s.teamA, s.teamB].forEach((t, j) => {
      const si = src[k][i] && src[k][i][j]; if (si == null || si < 0 || Y[k][i] == null) return;
      const x1 = (k - 1) * (CW + CG) + CW, x2 = k * (CW + CG), n = lists[k].length, xm = x1 + CG * (n > 1 ? .18 + .64 * (i / (n - 1)) : .5);
      paths += `<path class="${t === my ? 'me' : ''}" d="M${x1} ${Y[k - 1][si] + H / 2} H${xm} V${Y[k][i] + H / 2} H${x2}"/>`;
    }));
    const W = 3 * (CW + CG) + CW, HH = Math.max(maxB, total) + 4;
    bk.style.width = W + 'px'; bk.style.height = HH + 'px';
    const svg = bk.querySelector('#pv-lines'); if (svg) { svg.setAttribute('width', W); svg.setAttribute('height', HH); svg.innerHTML = paths; }
    // прокрутка: на телефоне открываем сетку на стадии, где играет твоя команда; дальше запоминаем положение
    const sc = document.getElementById('pv-bracket'); if (!sc) return;
    let userStage = 0; lists.forEach((l, k) => l.forEach(s => { if (s.teamA === my || s.teamB === my) userStage = k + 1; }));
    const key = (userStage || 1) + ':' + (this._poView || '');
    if (this._poBkKey !== key) {
      this._poBkKey = key;
      const narrow = typeof window !== 'undefined' && window.innerWidth < 760;
      this._poBkScroll = narrow && userStage > 1 ? (userStage - 1) * (CW + CG) - 8 : 0;
    }
    sc.scrollLeft = this._poBkScroll || 0;
    if (!sc._pvBound) { sc._pvBound = true; sc.addEventListener('scroll', () => { this._poBkScroll = sc.scrollLeft; }, { passive: true }); }
  };
  const baseRPV = proto.renderPlayoffs;
  proto.renderPlayoffs = function () {
    const r = baseRPV.apply(this, arguments);
    try { this.poLayoutBracket(); if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { try { this.poLayoutBracket(); } catch (e) { } }); } catch (e) { console.warn('bracket layout', e); }
    return r;
  };
  const baseSTV = proto.switchTab;
  proto.switchTab = function (name) {
    const r = baseSTV.apply(this, arguments);
    if (name === 'playoffs') { try { this.poLayoutBracket(); } catch (e) { } }
    return r;
  };
})();
