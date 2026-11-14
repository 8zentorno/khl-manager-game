/* KHL Manager 14.0 — журнал игрока: штраф и время на льду, последние матчи, помесячный рейтинг.
   Считается для всех игроков лиги (не только вашей команды). Время на льду моделируется по звену,
   движок матча отдельно его не считает. Хранится в state.plog; старые сохранения открываются как раньше. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const KEEP = 400; // 14.3: журнал хранит все матчи сезона (регулярка + плей-офф)
  // секунд за матч: звено нападающих 1-4, пара защитников 1-3
  const TOI_F = [0, 20.5 * 60, 18 * 60, 14.5 * 60, 10 * 60], TOI_D = [0, 24 * 60, 20.5 * 60, 15.5 * 60];
  const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  proto.plog = function () {
    const st = this.state; if (!st) return null;
    if (!st.plog) st.plog = { v: 1, j: {}, mo: {}, moKey: null };
    return st.plog;
  };

  /* ---------- журнал матчей ---------- */
  proto.toiSeconds = function (p, match, ot) {
    if (p.pos === 'G') return 3600;
    const line = Math.max(1, Math.min(p.pos === 'D' ? 3 : 4, Number(this.playerLine(p)) || (p.pos === 'D' ? 3 : 4)));
    let s = p.pos === 'D' ? TOI_D[line] : TOI_F[line];
    if (ot && line <= 2) s += 150;
    return Math.max(300, s + (hash(match.id + '|' + p.id) % 91) - 45);
  };

  proto.recordMatchLog = function (match, activeH, activeA) {
    const st = this.state; if (!st || !match || match.plogDone || !match.played) return;
    if (!activeH || !activeA) return;
    const lg = this.plog(); if (!lg) return;
    match.plogDone = true;
    try { this.applyPlusMinus(match, activeH, activeA); } catch (e) { console.warn('pm', e); }
    const ev = match.events || [], g = {}, a = {}, pm = {}, pim = {}, seen = new Set();
    const sides = { [match.homeId]: activeH, [match.awayId]: activeA };
    for (const e of ev) {
      if (e.kind === 'goal') {
        if (e.scorerId) { g[e.scorerId] = (g[e.scorerId] || 0) + 1; pm[e.scorerId] = (pm[e.scorerId] || 0) + 1; }
        for (const id of [e.assist1Id, e.assist2Id]) if (id) { a[id] = (a[id] || 0) + 1; pm[id] = (pm[id] || 0) + 1; }
        const opp = e.teamId === match.homeId ? activeA : activeH;
        for (const p of opp.skaters || []) if (p) pm[p.id] = (pm[p.id] || 0) - 1;
      } else if (e.kind === 'penalty' && e.playerId) {
        const key = e.penaltyId || e.id;
        if (key && seen.has(key)) continue; if (key) seen.add(key);
        pim[e.playerId] = (pim[e.playerId] || 0) + (Number(e.penaltyMinutes) || Number(e.minutes) || 2);
      }
    }
    const flag = (match.so ? 2 : match.ot ? 1 : 0) + (match.playoff ? 8 : 0);
    for (const [tid, act] of [[match.homeId, activeH], [match.awayId, activeA]]) {
      const home = tid === match.homeId, opp = home ? match.awayId : match.homeId;
      const gf = home ? match.homeScore : match.awayScore, ga = home ? match.awayScore : match.homeScore;
      const sa = home ? match.awayShots : match.homeShots;
      const list = [...(act.skaters || []), act.goalie].filter(Boolean);
      for (const p of list) {
        const toi = this.toiSeconds(p, match, !!match.ot);
        const row = [match.dateOffset == null ? (st.dayIndex || 0) : match.dateOffset, opp, home ? 1 : 0, gf, ga, flag,
          g[p.id] || 0, a[p.id] || 0, p.pos === 'G' ? 0 : (pm[p.id] || 0), toi, pim[p.id] || 0,
          ...(p.pos === 'G' ? [sa || 0, Math.max(0, (sa || 0) - (ga || 0))] : [])];
        const j = lg.j[p.id] || (lg.j[p.id] = []);
        j.push(row); if (j.length > KEEP) j.shift();
        if (!match.playoff && st.playerStats[p.id]) {
          const ps = (match.playoff && st.playoff && st.playoff.playerStats ? st.playoff.playerStats : st.playerStats)[p.id];
          if (ps) { ps.toi = (ps.toi || 0) + toi; ps.pim = (ps.pim || 0) + (pim[p.id] || 0); }
        }
      }
    }
  };
  /* Состав и события готовы не сразу: удаления дописываются после основной симуляции.
     Поэтому в applyMatchDevelopment только запоминаем составы, а запись делаем по завершении матча. */
  const pending = new WeakMap();
  const flush = match => {
    if (!match || !pending.has(match)) return;
    const [h, a] = pending.get(match); pending.delete(match);
    try { app_recordMatchLog(match, h, a); } catch (e) { console.warn('plog', e); }
  };
  let app_recordMatchLog = () => {};
  const baseAMD = proto.applyMatchDevelopment;
  proto.applyMatchDevelopment = function (match, activeH, activeA) {
    const r = baseAMD.apply(this, arguments);
    if (match && !match.plogDone && activeH && activeA) { pending.set(match, [activeH, activeA]); app_recordMatchLog = (m, h, a) => this.recordMatchLog(m, h, a); }
    return r;
  };
  const baseSim = proto.simulateMatch;
  proto.simulateMatch = function (match) {
    if (match && !match.played) { try { pmSnapshot(this, match); } catch (e) { } }
    const r = baseSim.apply(this, arguments);
    flush(r || match);
    return r;
  };
  const baseLive = proto.completeLiveMatch;
  if (baseLive) proto.completeLiveMatch = function (live) {
    const r = baseLive.apply(this, arguments);
    try { const t = this.state && this.state.matches.find(x => x.id === (live && live.matchId)); flush(t); } catch (e) { }
    return r;
  };


  /* ---------- плюс-минус по правилам (14.2) ----------
     Движок раньше давал минус всем соперникам при каждом голе. Теперь для каждого гола в равных составах
     выбирается пятёрка на льду (звено нападающих и пара защитников, вес по времени на льду, без случайных чисел движка).
     Не считаются голы в большинстве и меньшинстве, в пустые ворота и со штрафного броска. Вратари без плюс-минуса. */
  const snaps = new Map();
  const pmSnapshot = (app, match) => {
    if (!match || snaps.has(match.id) || !app.state) return;
    const o = {}, po = app.state.playoff && app.state.playoff.playerStats;
    for (const tid of [match.homeId, match.awayId]) for (const p of app.teamPlayers(tid)) {
      const r = app.state.playerStats[p.id], q = po && po[p.id];
      o[p.id] = [r ? r.plusMinus || 0 : 0, q ? q.plusMinus || 0 : 0];
    }
    snaps.set(match.id, o);
  };
  const unitsOf = (app, act) => {
    const F = {}, D = {};
    for (const p of (act && act.skaters) || []) {
      if (!p || p.pos === 'G') continue;
      const ln = Number(app.playerLine(p)) || (p.pos === 'D' ? 3 : 4);
      const m = p.pos === 'D' ? D : F; (m[ln] = m[ln] || []).push(p);
    }
    return { F, D };
  };
  const pickUnit = (map, tbl, h) => {
    const keys = Object.keys(map); if (!keys.length) return [];
    const w = keys.map(k => tbl[k] || 600), tot = w.reduce((a, b) => a + b, 0);
    let x = (h % 10000) / 10000 * tot;
    for (let i = 0; i < keys.length; i++) { x -= w[i]; if (x < 0) return map[keys[i]]; }
    return map[keys[keys.length - 1]];
  };
  proto.goalOnIce = function (match, idx, e, act, scoring) {
    const U = unitsOf(this, act), key = match.id + '|' + idx + '|' + (scoring ? 'S' : 'C');
    const lnOf = p => Number(this.playerLine(p)) || (p.pos === 'D' ? 3 : 4);
    let involved = [];
    if (scoring) { const by = id => (act.skaters || []).find(p => p && p.id === id); involved = [by(e.scorerId), by(e.assist1Id), by(e.assist2Id)].filter(Boolean); }
    const f0 = involved.find(p => p.pos !== 'D'), d0 = involved.find(p => p.pos === 'D');
    const F = f0 ? (U.F[lnOf(f0)] || [f0]) : pickUnit(U.F, TOI_F, hash(key + 'F'));
    const D = d0 ? (U.D[lnOf(d0)] || [d0]) : pickUnit(U.D, TOI_D, hash(key + 'D'));
    const set = new Map(); [...F, ...D].forEach(p => set.set(p.id, p));
    for (const p of involved) {
      if (set.has(p.id)) continue;
      const victim = [...set.values()].find(q => (q.pos === 'D') === (p.pos === 'D') && !involved.includes(q));
      if (victim) set.delete(victim.id); set.set(p.id, p);
    }
    let list = [...set.values()].sort((x, y) => involved.includes(y) - involved.includes(x));
    if (e.period === 'ОТ') list = list.slice(0, 3);
    return list;
  };
  proto.applyPlusMinus = function (match, activeH, activeA) {
    const snap = snaps.get(match.id); if (!snap) return;
    const st = this.state, po = !!match.playoff;
    const stats = po ? (st.playoff && st.playoff.playerStats) : st.playerStats; if (!stats) return;
    for (const id in snap) { const row = stats[id]; if (row) row.plusMinus = snap[id][po ? 1 : 0]; }
    snaps.delete(match.id);
    let idx = 0;
    for (const e of match.events || []) {
      if (e.kind !== 'goal') continue; idx++;
      if (e.powerPlay || e.shortHanded || e.emptyNet || e.penaltyShot || e.text === 'Гол в пустые ворота') continue;
      const home = e.teamId === match.homeId, actS = home ? activeH : activeA, actC = home ? activeA : activeH;
      let gs = this.goalOnIce(match, idx, e, actS, true), gc = this.goalOnIce(match, idx, e, actC, false); const n = Math.min(gs.length, gc.length); gs = gs.slice(0, n); gc = gc.slice(0, n);
      for (const p of gs) { const r = stats[p.id]; if (r) r.plusMinus = (r.plusMinus || 0) + 1; }
      for (const p of gc) { const r = stats[p.id]; if (r) r.plusMinus = (r.plusMinus || 0) - 1; }
    }
  };
  const baseSave = proto.saveLineupAndStart;
  if (baseSave) proto.saveLineupAndStart = function () {
    const r = baseSave.apply(this, arguments);
    try { const live = this.liveMatch; if (live && !live.finished) { const m = this.state.matches.find(x => x.id === live.matchId); if (m && !m.played) pmSnapshot(this, m); } } catch (e) { console.warn('pm snap', e); }
    return r;
  };

  /* ---------- журнал травм (14.2) ---------- */
  const baseInj = proto.assignInjury;
  if (baseInj) proto.assignInjury = function (player, match) {
    const r = baseInj.apply(this, arguments);
    try {
      const lg = this.plog(), inj = r && player && this.playerDev(player) && this.playerDev(player).injury;
      if (lg && inj) {
        lg.inj = lg.inj || {};
        const day = match && match.dateOffset != null ? match.dateOffset : (this.state.dayIndex || 0), sev = inj.severity || 'light';
        const amount = sev === 'severe' ? Number(inj.daysRemaining) || 0 : sev === 'medium' ? Number(inj.gamesRemaining) || 0 : 0;
        const list = lg.inj[player.id] = lg.inj[player.id] || [];
        if (!list.length || list[list.length - 1][0] !== day) list.push([day, inj.injuryType || 'травма', sev, amount]);
      }
    } catch (e) { console.warn('inj log', e); }
    return r;
  };
  proto.playerInjuries = function (id) { const lg = this.state && this.state.plog; return ((lg && lg.inj && lg.inj[id]) || []).slice().reverse(); };

  // последние матчи игрока, новые сверху
  proto.playerAllMatches = function (id) { return this.playerLastMatches(id, KEEP); };
  proto.playerLastMatches = function (id, n) {
    const lg = this.state && this.state.plog, j = lg && lg.j[id] || [];
    return j.slice(-(n || KEEP)).reverse().map(r => ({
      day: r[0], oppId: r[1], home: !!r[2], gf: r[3], ga: r[4], ot: (r[5] & 3) === 1, so: (r[5] & 3) === 2, po: !!(r[5] & 8),
      win: r[3] > r[4], g: r[6], a: r[7], pm: r[8], toi: r[9], pim: r[10], sa: r[11] || 0, sv: r[12] || 0
    }));
  };

  /* ---------- помесячный рейтинг ---------- */
  proto.monthKeyNow = function () {
    const d = new Date(this.currentDateMs());
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  };
  proto.snapshotRatings = function () {
    const lg = this.plog(); if (!lg || !this.db) return;
    const key = this.monthKeyNow(); if (lg.moKey === key) return;
    lg.moKey = key;
    for (const p of this.db.players) {
      const arr = lg.mo[p.id] || (lg.mo[p.id] = []);
      arr.push([key, Math.round(this.permanentOVR(p) * 10) / 10, Math.round(this.effectiveOVR(p) * 10) / 10]);
    }
  };
  proto.monthLabel = key => MONTHS[Number(String(key).slice(5, 7)) - 1] || key;
  proto.ratingHistory = function (id) { this.snapshotRatings(); const lg = this.state.plog; return (lg.mo[id] || []).slice(); };

  const baseAdv = proto.advancePlayerDays;
  proto.advancePlayerDays = function () {
    const r = baseAdv.apply(this, arguments);
    try { if (this.state) this.snapshotRatings(); } catch (e) { console.warn('plog snap', e); }
    return r;
  };
})();
