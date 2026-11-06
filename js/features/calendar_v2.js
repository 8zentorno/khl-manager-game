/* KHL Manager 11.0 — календарь регулярного чемпионата 2026/27 как в КХЛ.
   182 игровых дня (5 сентября – 20 марта) без пауз 7–14 декабря, 31 декабря – 2 января, 5–8 февраля; 748 матчей, у клуба 68 (34 дома).
   42 матча со всеми по разу дома и в гостях, 20 внутри конференции, 6 добора. Клуб не играет два дня подряд.
   До Недели звёзд календарь известен (около 53 матчей клуба). 5 февраля по таблице конференции формируется добор:
   клубы, стоящие рядом в таблице, встречаются чаще; тогда же расставляются оставшиеся матчи до 20 марта.
   Сохранения со старым календарём (без state.calendar) играются как раньше. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const START = Date.UTC(2026, 8, 3);
  const off = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - START) / 86400000);
  const PAUSES = [
    { from: off(2026, 12, 7), to: off(2026, 12, 14), name: 'Кубок Первого канала', short: '7–14 декабря' },
    { from: off(2026, 12, 31), to: off(2027, 1, 2), name: 'Новогодний перерыв', short: '31 декабря – 2 января' },
    { from: off(2027, 2, 5), to: off(2027, 2, 8), name: 'Неделя звёзд хоккея', short: '5–8 февраля' }
  ];
  const FIRST = off(2026, 9, 5), LAST = off(2027, 3, 20), TRIGGER = off(2027, 2, 5), WINDOW = off(2027, 2, 9);
  const DAYS = []; for (let d = FIRST; d <= LAST; d++) if (!PAUSES.some(p => d >= p.from && d <= p.to)) DAYS.push(d);
  const N = DAYS.length, FORM = DAYS.findIndex(d => d >= WINDOW);
  const HEAD = Math.round(62 - (68 * (N - FORM) / N - 6));      // обычных матчей клуба до Недели звёзд (53)
  const SEEDS_FROM = 1, SEEDS_TO = 200;
  const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pk = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  proto.calendarPauses = () => PAUSES.slice();
  proto.calendarInfo = () => ({ days: DAYS.slice(), first: FIRST, last: LAST, trigger: TRIGGER, window: WINDOW, form: FORM, head: HEAD });
  proto.pauseAt = function (offset) { return PAUSES.find(p => offset >= p.from && offset <= p.to) || null; };
  proto.pauseDayInfo = function (offset) { const p = this.pauseAt(offset); return p ? { name: p.name, short: p.short, day: offset - p.from + 1, total: p.to - p.from + 1, from: p.from, to: p.to } : null; };

  /* ---------- состав лиги ---------- */
  function leagueShape(app) {
    const teams = app.db.teams; if (teams.length !== 22) return null;
    const by = {}; teams.forEach(t => (by[String(t.conf).toLowerCase()] = by[String(t.conf).toLowerCase()] || []).push(t.id));
    const confs = Object.values(by); if (confs.length !== 2 || confs.some(c => c.length !== 11)) return null;
    return { confs, all: confs.flat() };
  }
  function fixtures(confs) {
    const all = confs.flat(), F = [];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) { F.push({ h: all[i], a: all[j], k: 'base' }); F.push({ h: all[j], a: all[i], k: 'base' }); }
    for (const c of confs) for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) { F.push({ h: c[i], a: c[j], k: 'conf' }); F.push({ h: c[j], a: c[i], k: 'conf' }); }
    return F;                                                      // 462 + 220 = 682
  }

  /* ---------- этап 1: известный календарь до Недели звёзд ---------- */
  function buildHead(shape, seed, strict) {
    const rnd = rng(seed), all = shape.all, F = fixtures(shape.confs), total = F.length;
    const confOf = new Map(); shape.confs.forEach((c, i) => c.forEach(t => confOf.set(t, i)));
    const T = Array(N).fill(4), w = [[2, .07], [3, .30], [4, .33], [5, .20], [6, .07], [7, .03]];
    for (let i = 0; i < FORM; i++) { const r = rnd(); let a = 0; for (const [v, p] of w) { a += p; if (r <= a) { T[i] = v; break; } } }
    T[0] = 6;
    const headTotal = all.length * HEAD / 2; let s = 0; for (let i = 0; i < FORM; i++) s += T[i]; let g = 0;
    while (s !== headTotal && g++ < 200000) { const i = 1 + Math.floor(rnd() * (FORM - 1)); if (s < headTotal && T[i] < 7) { T[i]++; s++; } else if (s > headTotal && T[i] > 2) { T[i]--; s--; } }
    const played = new Map(all.map(t => [t, 0])), last = new Map(all.map(t => [t, -9])), hist = new Map(all.map(t => [t, []])), pairLast = new Map();
    const pool = F.map(f => ({ ...f, day: -1 }));
    let left = pool.slice();
    const pairRem = new Map(); for (const f of pool) pairRem.set(pk(f.h, f.a), (pairRem.get(pk(f.h, f.a)) || 0) + 1);
    for (let d = 0; d < FORM; d++) {
      const elig = new Set(all.filter(t => d - last.get(t) >= 2 && played.get(t) < HEAD));
      const urg = t => (HEAD - played.get(t)) / Math.max(1, Math.ceil((FORM - d) / 2));
      const used = new Set(), today = [];
      const run = (h, v) => { let n = 0; for (let k = h.length - 1; k >= 0 && h[k] === v; k--) n++; return n; };
      const score = f => {
        let sc = urg(f.h) + urg(f.a); const hh = hist.get(f.h), ha = hist.get(f.a);
        if (run(hh, 'H') >= 2) sc -= .9; if (run(ha, 'A') >= 2) sc -= .9;
        if (hh.length && hh[hh.length - 1] === 'A') sc += .15; if (ha.length && ha[ha.length - 1] === 'H') sc += .15;
        const pl = pairLast.get(pk(f.h, f.a)); if (pl != null && d - pl < 30) sc -= (d - pl < 12 ? 4 : 1.5) * (30 - (d - pl)) / 30;
        sc += .07 * Math.min(5, d - last.get(f.h)) + .07 * Math.min(5, d - last.get(f.a));
        if (pairRem.get(pk(f.h, f.a)) >= 2) sc += .5;      // 11.3.0: последняя игра пары остаётся в хвосте, соперники остатка не повторяются
        if (strict && confOf.get(f.h) === confOf.get(f.a)) sc += 1.6;   // матчи внутри конференции играем до Недели звёзд, в хвосте остаются межконференционные
        return sc + rnd() * .35;
      };
      const cand = left.filter(f => elig.has(f.h) && elig.has(f.a));
      const sorted = () => cand.filter(f => !used.has(f.h) && !used.has(f.a)).map(f => [score(f), f]).sort((a, b) => b[0] - a[0]);
      const pick = f => { today.push(f); used.add(f.h); used.add(f.a); };
      for (const t of [...elig].filter(t => urg(t) >= .999)) { if (used.has(t)) continue; const c = sorted().filter(x => x[1].h === t || x[1].a === t)[0]; if (c) pick(c[1]); }
      while (today.length < T[d]) { const c = sorted()[0]; if (!c) break; pick(c[1]); }
      for (const f of today) { f.day = d; pairRem.set(pk(f.h, f.a), pairRem.get(pk(f.h, f.a)) - 1); played.set(f.h, played.get(f.h) + 1); played.set(f.a, played.get(f.a) + 1); last.set(f.h, d); last.set(f.a, d); hist.get(f.h).push('H'); hist.get(f.a).push('A'); pairLast.set(pk(f.h, f.a), d); }
      left = left.filter(f => f.day < 0);
    }
    const head = pool.filter(f => f.day >= 0), pending = left;
    // приёмка: первый день 6 матчей, у каждого клуба 52–54 матча до паузы, не больше 8 матчей в день, остаток для хвоста 8–10
    const per = Array(N).fill(0); head.forEach(f => per[f.day]++);
    if (per[0] !== 6 || Math.max(...per) > 8) return null;
    for (const t of all) { const n = played.get(t); if (n < HEAD - 1 || n > HEAD + 1) return null; }
    if (strict) {   // остаток: только игры с другой конференцией, у каждого клуба все соперники разные
      const seen = new Set();
      for (const f of pending) { const k = pk(f.h, f.a); if (confOf.get(f.h) === confOf.get(f.a) || seen.has(k)) return null; seen.add(k); }
    }
    return { head, pending, seed };
  }

  /* ---------- этап 2: добор по таблице и хвост сезона ---------- */
  // зигзаг 1,3,5,…,11,…,6,4,2 и три ближайших соседа по кругу: клуб играет с соседями по таблице
  function addonPairs(order, K, flip) {
    const n = order.length, ord = flip ? order.slice().reverse() : order, z = []; for (let i = 0; i < n; i += 2) z.push(ord[i]); for (let i = (n % 2 ? n - 2 : n - 1); i > 0; i -= 2) z.push(ord[i]);
    const E = []; for (let i = 0; i < n; i++) for (const k of (K || [1, 2, 3])) E.push([z[i], z[(i + k) % n]]);
    return E;
  }
  // 11.3.0: из вариантов «соседей по кругу» выбираем тот, где меньше всего пар совпадает с остатком матчей до добора (остальное ограничено разрывом в хвосте)
  function bestAddon(order, pendingKeys) {
    const n = order.length, ks = []; for (let a = 1; a <= 5; a++) for (let b = a + 1; b <= 5; b++) for (let c = b + 1; c <= 5; c++) ks.push([a, b, c]);
    let best = null;
    for (const K of ks) for (const flip of [false, true]) {
      if (K.some(k => k * 2 === n)) continue;
      const E = addonPairs(order, K, flip); let over = 0; for (const e of E) if (pendingKeys.has(pk(e[0], e[1]))) over++;
      const cost = over * 10 + K[0] + K[1] + K[2] + (flip ? .5 : 0);
      if (!best || cost < best.cost) best = { E, cost, over };
    }
    return best;
  }
  function orientEuler(E, teams) {              // у каждого 3 дома и 3 в гостях
    const adj = new Map(teams.map(t => [t, []])); E.forEach((e, i) => { adj.get(e[0]).push(i); adj.get(e[1]).push(i); });
    const used = new Uint8Array(E.length), out = [];
    for (const s of teams) { const st = [s]; while (st.length) { const cur = st[st.length - 1], ed = adj.get(cur); while (ed.length && used[ed[ed.length - 1]]) ed.pop(); if (!ed.length) { st.pop(); continue; } const i = ed.pop(); used[i] = 1; const o = E[i][0] === cur ? E[i][1] : E[i][0]; out.push({ h: cur, a: o, k: 'addon' }); st.push(o); } }
    return out;
  }
  function placeTail(shape, head, pending, X, seed, maxRun, gap) {
    const rnd = rng(seed), all = shape.all, tailLast = new Map();
    const last = new Map(all.map(t => [t, -9])), hist = new Map(all.map(t => [t, []])), pairLast = new Map();
    head.slice().sort((a, b) => a.day - b.day).forEach(f => { last.set(f.h, f.day); last.set(f.a, f.day); hist.get(f.h).push('H'); hist.get(f.a).push('A'); pairLast.set(pk(f.h, f.a), f.day); });
    let left = [...pending.map(f => ({ h: f.h, a: f.a, k: f.k, day: -1 })), ...X.map(f => ({ ...f, day: -1 }))];
    const rem = new Map(all.map(t => [t, left.filter(f => f.h === t || f.a === t).length]));
    const placed = [];
    for (let d = FORM; d < N; d++) {
      const daysLeft = N - d, elig = new Set(all.filter(t => d - last.get(t) >= 2 && rem.get(t) > 0));
      const urg = t => rem.get(t) / Math.max(1, Math.ceil(daysLeft / 2));
      const run = (h, v) => { let n = 0; for (let k = h.length - 1; k >= 0 && h[k] === v; k--) n++; return n; };
      const score = f => {
        let sc = urg(f.h) + urg(f.a); const hh = hist.get(f.h), ha = hist.get(f.a);
        if (run(hh, 'H') >= 2) sc -= .9; if (run(ha, 'A') >= 2) sc -= .9;
        if (hh.length && hh[hh.length - 1] === 'A') sc += .15; if (ha.length && ha[ha.length - 1] === 'H') sc += .15;
        const pl = pairLast.get(pk(f.h, f.a)); if (pl != null && d - pl < 30) sc -= (d - pl < 12 ? 4 : 1.5) * (30 - (d - pl)) / 30;
        sc += .07 * Math.min(5, d - last.get(f.h)) + .07 * Math.min(5, d - last.get(f.a)); return sc + rnd() * .35;
      };
      const used = new Set(), today = [], cand = left.filter(f => elig.has(f.h) && elig.has(f.a) && !(gap && tailLast.has(pk(f.h, f.a)) && d - tailLast.get(pk(f.h, f.a)) < gap));
      const sorted = () => cand.filter(f => !used.has(f.h) && !used.has(f.a)).map(f => [score(f), f]).sort((a, b) => b[0] - a[0]);
      const pick = f => { today.push(f); used.add(f.h); used.add(f.a); };
      for (const t of [...elig].filter(t => urg(t) >= .999)) { if (used.has(t)) continue; const c = sorted().filter(x => x[1].h === t || x[1].a === t)[0]; if (c) pick(c[1]); }
      const want = Math.min(7, Math.max(2, Math.round(left.length / daysLeft + (rnd() - .5) * 2)));
      while (today.length < want) { const c = sorted()[0]; if (!c) break; pick(c[1]); }
      for (const f of today) { f.day = d; placed.push(f); rem.set(f.h, rem.get(f.h) - 1); rem.set(f.a, rem.get(f.a) - 1); last.set(f.h, d); last.set(f.a, d); hist.get(f.h).push('H'); hist.get(f.a).push('A'); pairLast.set(pk(f.h, f.a), d); tailLast.set(pk(f.h, f.a), d); }
      left = left.filter(f => f.day < 0);
    }
    if (left.length) return null;
    // приёмка: матчей в день не больше 8 и не больше двух 8-матчевых дней за сезон, серии дома/в гостях не длиннее maxRun, в каждый игровой день хвоста от 2 матчей
    const per = Array(N).fill(0); head.forEach(f => per[f.day]++); placed.forEach(f => per[f.day]++);
    if (Math.max(...per) > 8 || per.filter(v => v === 8).length > 2 || per.slice(FORM).some(v => v < 2)) return null;
    const full = [...head, ...placed];
    for (const t of all) {
      const gs = full.filter(f => f.h === t || f.a === t).sort((a, b) => a.day - b.day); if (gs.length !== 68) return null;
      let sh = 0, sa = 0; for (let i = 0; i < gs.length; i++) { if (i && DAYS[gs[i].day] - DAYS[gs[i - 1].day] < 2) return null; if (gs[i].h === t) { sh++; sa = 0; } else { sa++; sh = 0; } if (sh > maxRun || sa > maxRun) return null; }
      if (full.filter(f => f.h === t).length !== 34) return null;
    }
    return placed;
  }

  /* ---------- сборка матчей ---------- */
  const mk = (f, dayNo, idx, extra) => Object.assign({
    id: `m${dayNo + 1}_${idx}`, round: dayNo + 1, dateOffset: DAYS[dayNo], homeId: f.h, awayId: f.a, played: false, homeScore: null, awayScore: null, ot: false, so: false, homeShots: 0, awayShots: 0, events: []
  }, extra || {});
  function toMatches(list, startIdx) {
    const cnt = Object.assign({}, startIdx || {}), out = [];
    list.slice().sort((a, b) => a.day - b.day).forEach(f => { cnt[f.day] = (cnt[f.day] || 0) + 1; out.push(mk(f, f.day, cnt[f.day], f.k === 'addon' ? { addon: true } : null)); });
    return out;
  }

  let cache = null;
  proto.calendarV2Possible = function () { return !!leagueShape(this) && FORM > 0; };
  const baseCreate = proto.createSchedule;
  proto.createSchedule = function () {
    const shape = leagueShape(this);
    if (!shape) return baseCreate.apply(this, arguments);
    const sig = shape.all.join(',');
    if (!cache || cache.sig !== sig) {
      let r = null;
      for (let s = SEEDS_FROM; s <= SEEDS_TO && !r; s++) r = buildHead(shape, s, true);
      for (let s = SEEDS_FROM; s <= SEEDS_TO && !r; s++) r = buildHead(shape, s, false);
      if (!r) return baseCreate.apply(this, arguments);
      cache = { sig, head: r.head, pending: r.pending, seed: r.seed };
    }
    this._calV2Pending = { seed: cache.seed, pending: cache.pending.map(f => [f.h, f.a, f.k]) };
    return toMatches(cache.head.map(f => ({ ...f })));
  };
  const baseCreateState = proto.createState;
  proto.createState = function () {
    this._calV2Pending = null;
    const st = baseCreateState.apply(this, arguments);
    const p = this._calV2Pending; this._calV2Pending = null;
    if (st && p) { st.calendar = { v: 2, formed: false, seed: p.seed, pending: p.pending, addon: [] }; st.scheduleOptimizationVersion = 1; }
    return st;
  };

  /* ---------- формирование добора ---------- */
  proto.calendarUnformed = function () { const c = this.state && this.state.calendar; return !!(c && c.v === 2 && !c.formed); };
  proto.formCalendar = function () {
    const st = this.state; if (!this.calendarUnformed()) return false;
    const shape = leagueShape(this); if (!shape) return false;
    const cal = st.calendar, my = st.teamId;
    const order = shape.confs.map(c => this.standingsFor(String(this.teamById(c[0]).conf).toLowerCase()).map(r => r.id));
    const pendKeys = new Set((cal.pending || []).map(a => pk(a[0], a[1])));
    const b0 = bestAddon(order[0], pendKeys), b1 = bestAddon(order[1], pendKeys);
    const E = [...b0.E, ...b1.E]; cal.addonOverlap = b0.over + b1.over;
    const X = orientEuler(E, shape.all);
    const head = st.matches.filter(m => !m.playoff && !m.cancelled).map(m => ({ h: m.homeId, a: m.awayId, k: 'head', day: DAYS.indexOf(m.dateOffset) })).filter(f => f.day >= 0);
    const pending = cal.pending.map(a => ({ h: a[0], a: a[1], k: a[2] }));
    let placed = null, used = 0;
    for (let a = 0; a < 3000 && !placed; a++) { used = a; placed = placeTail(shape, head, pending, X, (cal.seed * 7919 + a * 104729 + 17) >>> 0, a < 400 ? 5 : a < 1200 ? 6 : 8, a < 600 ? 12 : a < 1400 ? 9 : a < 2200 ? 6 : 0); }
    if (!placed) { console.warn('calendar_v2: не удалось собрать добор'); return false; }
    const newMatches = toMatches(placed);
    st.matches = st.matches.concat(newMatches).sort((a, b) => a.dateOffset - b.dateOffset || a.id.localeCompare(b.id, undefined, { numeric: true }));
    cal.formed = true; cal.formedAt = Number(st.dayIndex || 0); cal.attempts = used + 1;
    cal.addon = X.map(x => [x.h, x.a]); cal.pending = [];
    try {
      const mine = X.filter(x => x.h === my || x.a === my).map(x => { const o = this.teamById(x.h === my ? x.a : x.h); return `${o.name} (${x.h === my ? 'дома' : 'в гостях'})`; });
      this.publishNews && this.publishNews({ key: 'calendar:formed', category: 'press', icon: '📅', tag: 'Лига', headline: 'Лига утвердила добор', body: `Ваши шесть матчей добора: ${mine.join(', ')}. Календарь до 20 марта опубликован.`, dateOffset: Number(st.dayIndex || 0), teamIds: [my], scope: 'club' });
    } catch (e) { }
    this.persistQuietly && this.persistQuietly();
    return true;
  };
  // Дожить до формирования: доиграть матчи лиги до Недели звёзд и сформировать календарь
  proto.ensureCalendarFormed = function (force) {
    if (!this.calendarUnformed()) return false;
    const st = this.state, my = st.teamId;
    if (!force && Number(st.dayIndex || 0) < TRIGGER) return false;
    if (this._calFormBusy) return false; this._calFormBusy = true;
    try {
      const todo = st.matches.filter(m => !m.playoff && !m.played && !m.cancelled && m.dateOffset < TRIGGER && m.homeId !== my && m.awayId !== my).sort((a, b) => a.dateOffset - b.dateOffset);
      if (force) for (const m of todo) {
        if (m.played) continue;
        const days = Math.max(0, m.dateOffset - Number(st.dayIndex || 0)); if (days) { this.advancePlayerDays(days); st.dayIndex = m.dateOffset; }
        this.simulateMatch(m);
      }
      const gap = Math.max(0, TRIGGER - Number(st.dayIndex || 0)); if (gap) { this.advancePlayerDays(gap); st.dayIndex = TRIGGER; }
      return this.formCalendar();
    } finally { this._calFormBusy = false; }
  };
  const userHeadLeft = a => a.state.matches.some(m => !m.playoff && !m.played && !m.cancelled && (m.homeId === a.state.teamId || m.awayId === a.state.teamId));

  // таблица и цели считают сезон полным только после формирования
  const baseComplete = proto.regularSeasonComplete;
  proto.regularSeasonComplete = function () { if (this.calendarUnformed()) return false; return baseComplete.apply(this, arguments); };
  const baseTotal = proto.userRegularTotal;
  if (typeof baseTotal === 'function') proto.userRegularTotal = function () { return this.state && this.state.calendar && this.state.calendar.v === 2 ? 68 : baseTotal.apply(this, arguments); };

  /* 11.3.0: добор формируется, когда дата сама доходит до 5 февраля. Дата больше не перескакивает после последнего матча головы. */
  proto.rollToCalendarFormation = function () {
    const st = this.state; if (!st || !this.calendarUnformed()) return false;
    for (let d = Number(st.dayIndex || 0) + 1; d <= TRIGGER; d++) { st.dayIndex = d; this.advancePlayerDays(1); this.simulateMatchesAt(d, false); }
    this.ensureCalendarFormed(false);
    this._calFormedToday = Number(st.dayIndex || 0);
    if (this.renderDayDigest) this.renderDayDigest(); else this.setNotice && this.setNotice(`${this.formatDate(st.dayIndex)} — лига утвердила добор. Календарь до 20 марта опубликован.`);
    this.persistQuietly && this.persistQuietly(); this.renderAll && this.renderAll();
    return true;
  };
  ['advanceDay', 'playNextMatch', 'finishRegularSeasonTransition'].forEach(name => {
    const base = proto[name]; if (typeof base !== 'function') return;
    proto[name] = function () {
      try {
        if (this.calendarUnformed()) {
          if (name === 'playNextMatch' && !userHeadLeft(this)) { this.rollToCalendarFormation(); return; }
          if (name === 'finishRegularSeasonTransition') { if (Number(this.state.dayIndex || 0) >= TRIGGER) this.ensureCalendarFormed(false); if (this.calendarUnformed()) return false; }
        }
      } catch (e) { console.warn('calendar_v2', e); }
      const before = this.state ? Number(this.state.dayIndex || 0) : 0;
      const r = base.apply(this, arguments);
      try {
        if (this.state && name === 'advanceDay') {
          if (this.calendarUnformed() && Number(this.state.dayIndex || 0) >= TRIGGER) { this.ensureCalendarFormed(false); this._calFormedToday = Number(this.state.dayIndex || 0); }
          const d = Number(this.state.dayIndex || 0), p = this.pauseAt(d);
          if (p && d > before) {
            this.publishNews && this.publishNews({ key: 'pause:' + p.from, category: 'press', icon: '⏸', tag: 'Лига', headline: `Пауза в чемпионате: ${p.name}`, body: `Матчей лиги не будет ${p.short}. Игроки отдыхают, тренировки продолжаются.`, dateOffset: p.from, teamIds: [], scope: 'league' });
          }
        }
      } catch (e) { console.warn('calendar_v2', e); }
      return r;
    };
  });
  // загрузка сохранения в момент без своих матчей
  const baseRepair = proto.repairSave;
  proto.repairSave = function () {
    const r = baseRepair.apply(this, arguments);
    try { if (this.calendarUnformed() && Number(this.state.dayIndex || 0) >= TRIGGER) this.ensureCalendarFormed(false); } catch (e) { }
    return r;
  };

  /* ---------- календарь клуба: пометка о формировании ---------- */
  const baseSched = proto.renderSchedule;
  if (typeof baseSched === 'function') proto.renderSchedule = function () {
    const r = baseSched.apply(this, arguments);
    try {
      const box = document.querySelector('#view-schedule .cal-list, #schedule-list .cal-list, .cal-list');
      if (box && this.calendarUnformed()) box.insertAdjacentHTML('beforeend', '<div class="cal-note">С 9 февраля календарь формируется на Неделе звёзд (5–8 февраля) по таблице конференции: тогда определятся шесть матчей добора и все матчи до 20 марта.</div>');
    } catch (e) { }
    return r;
  };
})();
