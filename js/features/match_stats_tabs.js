/* KHL Manager 9.33.0 — «Статистика матча» на трёх вкладках и новые показатели.
   Новые числа расчётные: считаются из уже имеющихся счётчиков (броски, блоки, приёмы, вбрасывания), голов и событий удаления,
   поэтому есть у любого матча, в том числе сыгранного раньше, и совпадают при просмотре прошлых минут. На исход матча не влияют. */
(function () {
  const proto = (typeof KHLManagerApp !== 'undefined' && KHLManagerApp.prototype);
  if (!proto) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const zeros = n => Array(n).fill(0);
  const TABS = [['main', 'Главное'], ['puck', 'Шайба'], ['sp', 'Спецбригады и штрафы']];

  // стабильное «случайное» число 0..1 для матча и ключа (не меняется между перерисовками)
  const hash01 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10007) / 10007; };
  const fmtX = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  const fmtT = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const pctText = (a, b) => (b > 0 ? Math.round(a / b * 100) + '%' : '—');

  /* Время в большинстве (секунды) на момент minNow: по событиям удаления и возвращения */
  proto.mcPowerPlaySeconds = function (match, events, minNow) {
    const lim = Math.min(Number.isFinite(minNow) ? minNow : 1000, 140) * 60;
    const size = Math.ceil(lim) + 2;
    const cnt = { h: new Int8Array(size), a: new Int8Array(size) };
    const side = id => (String(id) === String(match.homeId) ? 'h' : String(id) === String(match.awayId) ? 'a' : null);
    const at = e => this.eventMinute(e) * 60;
    const ends = (events || []).filter(e => e.kind === 'penaltyEnd');
    const used = new Set();
    // удаления лежат не только в событиях «penalty», но и в penaltyDetails других событий (вбрасывание и т.п.)
    const recs = new Map(), starts = new Map();
    (events || []).forEach(e => {
      const dets = (e.penaltyDetails && e.penaltyDetails.length) ? e.penaltyDetails : (e.kind === 'penalty' || e.kind === 'penaltyStart') ? [e] : [];
      dets.forEach((d, i) => {
        const id = d.id || d.penaltyId || (e.id ? e.id + ':' + i : null) || (d.teamId + ':' + d.playerId + ':' + (d.period || e.period) + (d.time || e.time));
        if (e.kind === 'penaltyStart') starts.set(id, e);
        if (!recs.has(id)) recs.set(id, { d, e });
      });
    });
    recs.forEach(({ d, e }, id) => {
      if (d.affectsManpower === false) return;
      const s = side(d.teamId); if (!s) return;
      const st = starts.get(id);
      const stamp = st ? { period: st.period, time: st.time } : (d.period && d.time ? { period: d.period, time: d.time } : e);
      const start = at(stamp);
      if (!Number.isFinite(start)) return;
      const dur = (Number(d.minutes) || Number(d.penaltyMinutes) || 2) * 60;
      let end = start + dur;
      // 9.36.2: событие о сокращении первого отрезка двойного малого штрафа (без номера штрафа, «Вторые 2 минуты продолжаются») концом штрафа не считается
      const SEG = /Вторые|продолж/i, own = x => !x.penaltyId && x.teamId === d.teamId && x.playerId === d.playerId && at(x) >= start - 1;
      let hit = ends.find((x, i) => !used.has(i) && x.penaltyId && x.penaltyId === id && at(x) >= start - 1);
      if (!hit) hit = ends.find((x, i) => !used.has(i) && own(x) && !SEG.test(x.text || ''));
      if (hit) { used.add(ends.indexOf(hit)); end = Math.min(end, Math.max(start, at(hit))); }
      const lo = Math.max(0, Math.floor(start)), hi = Math.min(size - 1, Math.floor(Math.min(end, lim)));
      for (let t = lo; t < hi; t++) cnt[s][t]++;
    });
    const res = { h: 0, a: 0 };
    for (let t = 0; t < size; t++) { if (cnt.a[t] > cnt.h[t]) res.h++; else if (cnt.h[t] > cnt.a[t]) res.a++; }
    return res;
  };

  /* Расчётные показатели из счётчиков */
  proto.mcDerivedStats = function (match, stats, events, minNow, scn, src) {
    const H = String(match.homeId), A = String(match.awayId);
    const goals = { h: 0, a: 0 }, en = { h: 0, a: 0 };
    (events || []).forEach(e => { if (e.kind !== 'goal' || e.period === 'Б') return; const s = String(e.teamId) === H ? 'h' : 'a'; goals[s]++; if (e.emptyNet) en[s]++; });
    const sh = { h: stats.home.shots.total, a: stats.away.shots.total };
    const bl = { h: stats.home.blocks.total, a: stats.away.blocks.total };
    const hi = { h: stats.home.hits.total, a: stats.away.hits.total };
    const fo = { h: stats.home.faceoffs.total, a: stats.away.faceoffs.total };
    const ppS = this.mcPowerPlaySeconds(match, events, minNow), ppM = { h: ppS.h / 60, a: ppS.a / 60 };
    let st = { h: { attack: 80, defense: 80, overall: 80 }, a: { attack: 80, defense: 80, overall: 80 } };
    try { st = { h: this.getStrength(match.homeId), a: this.getStrength(match.awayId) }; } catch (e) {}
    const J = (k, w) => 1 + (hash01(String(match.id) + k) - 0.5) * w;
    // владение шайбой, %
    const poss = clamp(50 + 24 * (sh.h - sh.a) / (sh.h + sh.a + 6) + 0.18 * (st.h.overall - st.a.overall) + 1.6 * (ppM.h - ppM.a) + 6 * (fo.h - fo.a) / (fo.h + fo.a + 6) + (scn ? 60 * scn.F : (hash01(String(match.id) + 'poss') - 0.5) * 3), 35, 65);
    const ph = Math.round(poss);
    // опасные моменты: голы, моменты в большинстве и бросок из «выгодной» позиции
    const dang = k => { const q = clamp(0.2 + 0.003 * (st[k].attack - 80), 0.12, 0.32) * J('dq' + k, 0.3); return goals[k] + Math.round(q * Math.max(0, sh[k] - goals[k]) + 0.5 * ppM[k]); };
    // потери и перехваты
    const give = k => { const o = k === 'h' ? 'a' : 'h'; return Math.round((0.18 * (sh[o] + bl[k]) + 0.15 * hi[o]) * J('gv' + k, 0.3) * clamp(1 + 0.01 * (st[o].overall - st[k].overall), 0.8, 1.2)); };
    let gv = { h: give('h'), a: give('a') };
    const take = k => { const o = k === 'h' ? 'a' : 'h'; return Math.round(gv[o] * clamp(0.55 + 0.004 * (st[k].defense - st[o].attack), 0.4, 0.75) * J('tk' + k, 0.2)); };
    const gaH = goals.a - en.a, gaA = goals.h - en.h;
    let dg = { h: dang('h'), a: dang('a') }, tk = { h: take('h'), a: take('a') }, xg = null;
    if (scn) {
      // 9.34.0: значения берутся из сценария матча, который и вёл игру
      const tot = { h: Number(src && src.homeShots) || sh.h, a: Number(src && src.awayShots) || sh.a };
      const rh = Math.min(1, sh.h / Math.max(1, tot.h)), ra = Math.min(1, sh.a / Math.max(1, tot.a));
      const fr = minNow >= 1000 ? 1 : Math.min(1, Math.max(0, minNow / 60));
      dg = { h: Math.round(scn.dangH * rh), a: Math.round(scn.dangA * ra) };
      gv = { h: Math.round(scn.giveH * fr), a: Math.round(scn.giveA * fr) };
      tk = { h: Math.round(scn.takeH * fr), a: Math.round(scn.takeA * fr) };
      xg = { h: scn.xgH * rh, a: scn.xgA * ra };
    }
    return {
      goals, sh, poss: { h: ph, a: 100 - ph }, dang: dg, give: gv, take: tk, xg,
      real: { h: sh.h ? goals.h / sh.h : 0, a: sh.a ? goals.a / sh.a : 0 },
      save: { h: sh.a ? clamp((sh.a - gaH) / sh.a, 0, 1) : 0, a: sh.h ? clamp((sh.h - gaA) / sh.h, 0, 1) : 0 },
      pp: ppS
    };
  };

  proto.renderMatchStatistics = function (match) {
    const panel = document.getElementById('match-statistics');
    if (!panel) return;
    const live = this.liveMatch && this.liveMatch.matchId === match?.id && !this.liveMatch.finished ? this.liveMatch : null;
    if (!match || (!match.played && !live)) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    panel._lastMatch = match;
    let src = match, stats;
    if (live) {
      src = live.simulatedMatch;
      const per0 = (live.visibleMinute > 60 || src.ot) ? 4 : 3, c = live.cnt;
      const side = k => {
        const mk = key => { const a = ((c && c[k][key]) || zeros(4)).slice(0, per0); return { total: a.reduce((x, y) => x + y, 0), periods: a }; };
        return { shots: mk('shots'), faceoffs: mk('faceoffs'), blocks: mk('blocks'), hits: mk('hits'), penalties: { total: 0, periods: zeros(per0) } };
      };
      src.matchStats = { home: side('h'), away: side('a'), periodCount: per0, penaltyStatsVersion: 3 };
      stats = this.ensureMatchStats(src);
    } else {
      const hadSaved = !!match.matchStats, prev = Number(match.matchStats?.penaltyStatsVersion) || 0;
      stats = this.ensureMatchStats(match);
      if (!hadSaved || prev !== 3) this.persistQuietly();
    }
    const home = this.teamById(match.homeId), away = this.teamById(match.awayId);
    const per = stats.periodCount, esc = s => this.escape(s);
    const vmin = this._mcViewNow != null ? this._mcViewNow : (live ? live.visibleMinute : null);
    const minNow = vmin != null ? vmin : 1000;
    const events = (src.events || []).filter(e => e.kind !== 'final' && (Number.isFinite(e.visibleAtMinute) ? e.visibleAtMinute <= minNow + 0.001 : this.eventMinute(e) <= minNow + 0.001));
    const pp = { h: zeros(per), a: zeros(per) };
    events.forEach(e => {
      if (e.kind !== 'goal' || !e.powerPlay) return;
      const i = e.period === 'ОТ' ? Math.min(3, per - 1) : Math.max(0, Math.min(2, (parseInt(e.period, 10) || 1) - 1));
      pp[String(e.teamId) === String(match.homeId) ? 'h' : 'a'][i]++;
    });
    const sum = a => a.reduce((x, y) => x + y, 0);
    const d = this.mcDerivedStats(match, stats, events, minNow, (src && src.scn) || match.scn || null, src);
    const curP = vmin != null ? Math.min(per - 1, Math.max(0, Math.floor((Math.max(1, vmin || 1) - 1) / 20))) : -1;
    const perHtml = arr => arr.map((x, i) => `<em${i === curP ? ' class="cur"' : ''}>${x}</em>`).join('');
    const cnt = (label, h, a, low, tab, hp, ap) => ({ label, h: h.total ?? h, a: a.total ?? a, ht: h.total ?? h, at: a.total ?? a, low, tab, per: hp ? [h.periods, a.periods] : null });
    const rows = [
      { label: 'Владение шайбой', h: d.poss.h, a: d.poss.a, ht: d.poss.h + '%', at: d.poss.a + '%', tab: 'main' },
      cnt('Броски в створ', stats.home.shots, stats.away.shots, false, 'main', true),
      { label: 'Опасные моменты', h: d.dang.h, a: d.dang.a, ht: d.dang.h, at: d.dang.a, tab: 'main' },
      { label: 'Реализация бросков', h: d.real.h, a: d.real.a, ht: pctText(d.goals.h, d.sh.h), at: pctText(d.goals.a, d.sh.a), tab: 'main' },
      { label: 'Отражено бросков', h: d.save.h, a: d.save.a, ht: d.sh.a ? Math.round(d.save.h * 100) + '%' : '—', at: d.sh.h ? Math.round(d.save.a * 100) + '%' : '—', tab: 'main' },
      cnt('Вбрасывания выиграно', stats.home.faceoffs, stats.away.faceoffs, false, 'main', true),
      ...(d.xg ? [{ label: 'Ожидаемые голы (xG)', h: d.xg.h, a: d.xg.a, ht: fmtX(d.xg.h), at: fmtX(d.xg.a), tab: 'puck' }] : []),
      { label: 'Потери шайбы', h: d.give.h, a: d.give.a, ht: d.give.h, at: d.give.a, low: true, tab: 'puck' },
      { label: 'Перехваты', h: d.take.h, a: d.take.a, ht: d.take.h, at: d.take.a, tab: 'puck' },
      cnt('Блокированные броски', stats.home.blocks, stats.away.blocks, false, 'puck', true),
      cnt('Силовые приёмы', stats.home.hits, stats.away.hits, false, 'puck', true),
      cnt('Штраф, мин.', stats.home.penalties, stats.away.penalties, true, 'sp', true),
      { label: 'Время в большинстве', h: d.pp.h, a: d.pp.a, ht: fmtT(d.pp.h), at: fmtT(d.pp.a), tab: 'sp' },
      { label: 'Голы в большинстве', h: sum(pp.h), a: sum(pp.a), ht: sum(pp.h), at: sum(pp.a), tab: 'sp', per: [pp.h, pp.a] }
    ];
    const ds = panel.dataset || (panel.dataset = {});
    let tab = ds.tab || 'main'; if (!TABS.some(t => t[0] === tab)) tab = 'main';
    const prevV = panel._prevV && panel._prevV.id === match.id ? panel._prevV.v : null, now = {}, dirty = (panel._dirty && panel._dirty.id === match.id ? panel._dirty.d : {});
    const html = rows.map(r => {
      const tot = (Number(r.h) + Number(r.a)) || 0, hw = tot ? 100 * r.h / tot : 50;
      const hl = r.h !== r.a && (r.low ? r.h < r.a : r.h > r.a), al = r.h !== r.a && (r.low ? r.a < r.h : r.a > r.h);
      now[r.label] = r.ht + '|' + r.at;
      const ch = prevV && prevV[r.label] && prevV[r.label] !== now[r.label];
      if (ch && r.tab !== tab) dirty[r.tab] = true;
      if (r.tab !== tab) return '';
      const fh = ch && prevV[r.label].split('|')[0] !== String(r.ht) ? ' flash' : '', fa = ch && prevV[r.label].split('|')[1] !== String(r.at) ? ' flash' : '';
      const perRow = r.per ? `<div class="mst-per"><span>${perHtml(r.per[0])}</span><span>${perHtml(r.per[1])}</span></div>` : '';
      return `<div class="mst-row"><div class="mst-n h${hl ? ' lead' : ''}${fh}">${r.ht}</div><div class="mst-c"><div class="mst-name">${r.label}</div>` +
        `<div class="mst-bar" role="img" aria-label="${esc(home?.name)} ${r.ht}, ${esc(away?.name)} ${r.at}"><i class="h" style="width:${hw}%"></i><i class="a" style="width:${100 - hw}%"></i></div>${perRow}</div><div class="mst-n a${al ? ' lead' : ''}${fa}">${r.at}</div></div>`;
    }).join('');
    dirty[tab] = false;
    panel._prevV = { id: match.id, v: now }; panel._dirty = { id: match.id, d: dirty };
    if (panel.classList.remove) panel.classList.remove('mst-compact');
    const tabsH = TABS.map(([k, l]) => `<button type="button" class="mst-tab${k === tab ? ' on' : ''}" role="tab" aria-selected="${k === tab}" data-mst-tab="${k}">${l}${dirty[k] ? '<i class="mst-dot" aria-label="есть изменения"></i>' : ''}</button>`).join('');
    panel.innerHTML = `<h3 class="mst-title">📊 Статистика матча</h3>` +
      `<div class="mst-vs"><span class="mst-pill h">${esc(home?.name || 'Хозяева')}</span><span class="mst-mid">${this._mcViewNow != null ? 'на ' + this._mcViewNow + '-й минуте' : live ? 'сейчас' : ''}</span><span class="mst-pill a">${esc(away?.name || 'Гости')}</span></div>` +
      `<div class="mst-tabs" role="tablist">${tabsH}</div>` + html;
    if (!panel._tabBound) {
      panel._tabBound = true;
      panel.addEventListener('click', ev => {
        const b = ev.target.closest && ev.target.closest('[data-mst-tab]'); if (!b) return;
        panel.dataset.tab = b.dataset.mstTab; if (panel._dirty) panel._dirty.d[b.dataset.mstTab] = false;
        if (panel._lastMatch) this.renderMatchStatistics(panel._lastMatch);
      });
    }
    panel.classList.remove('hidden');
  };
})();
