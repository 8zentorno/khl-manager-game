/* KHL Manager 8.17 — лента и статистика матча из одних и тех же бросков.
 * Живой движок: каждый бросок учитывается по периодам, сейвы / блоки / силовые попадают в ленту с именами игроков,
 * а блоки, вбрасывания и силовые считаются счётчиками и зависят от силы команд.
 * Быстрая симуляция (ИИ, плей-офф): та же логика, но детерминированно, от зерна матча.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const FEED = proto.FEED_PARAMS = {
    saveLog: 0.17, blockLog: 0.22, hitLog: 0.09,   // доля учтённых эпизодов, попадающих в ленту
    blockRate: 0.47,                               // блокированных бросков на один бросок в створ соперника
    hitBase: 24,                                   // силовых приёмов на команду за матч
    foTotal: 60,                                   // вбрасываний за матч
    liveShotCal: 1.06, liveGoalCal: 0.96                               // поправка числа бросков живого движка (калибруется тестом)
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nm = p => p ? ((p.number != null && p.number !== '' ? '№' + p.number + ' ' : '') + p.name + ((typeof app !== 'undefined' && app.kaText) ? app.kaText(p) : '')) : '';
  const pois = (l, rnd) => { if (l <= 0) return 0; const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 40); return k - 1; };
  const norm = rnd => (rnd() + rnd() + rnd() - 1.5) * 2; // ~N(0, 1)
  const pidxOfMinute = m => m <= 20 ? 0 : m <= 40 ? 1 : m <= 60 ? 2 : 3;
  const zeros = n => Array(n).fill(0);
  function splitWeighted(total, weights, rnd) {
    total = Math.max(0, Math.round(total));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const exact = weights.map(w => total * w / sum);
    const out = exact.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    exact.map((v, i) => ({ i, f: v - out[i] + rnd() * 0.01 })).sort((a, b) => b.f - a.f).slice(0, left).forEach(x => out[x.i]++);
    return out;
  }
  const pickW = (list, rnd, wf) => {
    if (!list || !list.length) return null;
    const w = list.map(wf); let t = w.reduce((a, b) => a + b, 0), r = rnd() * t;
    for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  };

  /* ---------- живой движок ---------- */
  proto.liveScoreFx = function (live, m, isHome) {
    if (live.tempo == null) { const r = Math.random; live.tempo = Math.exp((r() + r() + r() - 1.5) * 2 * this.MATCH_MODEL_PARAMS.pace); }
    const diff = (isHome ? 1 : -1) * ((m.homeScore || 0) - (m.awayScore || 0)); // > 0: команда ведёт
    const se = this.MATCH_MODEL_PARAMS.scoreEffect;
    return live.tempo * se[clamp(2 - diff, 0, 4)] * FEED.liveShotCal;
  };
  const cnt = live => live.cnt || (live.cnt = {
    h: { shots: zeros(4), blocks: zeros(4), hits: zeros(4), faceoffs: zeros(4) },
    a: { shots: zeros(4), blocks: zeros(4), hits: zeros(4), faceoffs: zeros(4) },
    sogMin: { h: 0, a: 0 }, foBias: (Math.random() - 0.5) * 0.07
  });
  proto.liveShotNote = function (live, isHome, minute) {
    const c = cnt(live), k = isHome ? 'h' : 'a';
    c[k].shots[pidxOfMinute(minute)]++; c.sogMin[k]++;
  };
  proto.liveShotNoGoal = function (live, side, shooter, opponentId, stamp, push, activeFn) {
    if (Math.random() >= FEED.saveLog || !shooter) return;
    const goalie = activeFn(opponentId).goalie;
    const text = goalie
      ? `${nm(shooter)} бросает в створ, ${nm(goalie)} отражает бросок.`
      : `${nm(shooter)} бросает в створ, шайба остаётся в игре.`;
    push({ kind: 'save', teamId: side.id, actorId: shooter.id, targetId: goalie ? goalie.id : null, period: stamp.period, time: stamp.time, text });
  };
  proto.liveMinuteCounters = function (live, m, minute, push, stamp, eligible) {
    if (live.inShootout || minute > 120) return;
    const c = cnt(live), str = live.str || (live.str = { h: this.getStrength(live.homeId), a: this.getStrength(live.awayId) });
    const idx = pidxOfMinute(minute);
    const teams = { h: { id: live.homeId, name: this.teamById(live.homeId)?.name }, a: { id: live.awayId, name: this.teamById(live.awayId)?.name } };
    const rnd = Math.random;
    const ot3 = !m.playoff && minute > 60;
    for (const X of ['h', 'a']) {
      const Y = X === 'h' ? 'a' : 'h';
      const oppShots = c.sogMin[Y];
      const blocks = pois(FEED.blockRate * oppShots * (1 + 0.006 * (str[X].defense - 80)), rnd);
      const hits = pois(FEED.hitBase / 60 * (ot3 ? 0.7 : 1) * clamp(1 + 0.012 * (str[Y].overall - str[X].overall), 0.7, 1.35), rnd);
      c[X].blocks[idx] += blocks; c[X].hits[idx] += hits;
      const own = eligible(teams[X].id), opp = eligible(teams[Y].id);
      for (let i = 0; i < blocks; i++) if (rnd() < FEED.blockLog) {
        const blocker = pickW(own, rnd, p => p.pos === 'D' ? 1.6 : 1), shooter = pickW(opp, rnd, p => p.pos === 'D' ? 0.6 : 1);
        if (!blocker || !shooter) continue;
        const st = stamp(); push({ kind: 'block', teamId: teams[X].id, actorId: blocker.id, targetId: shooter.id, period: st.period, time: st.time, text: `${nm(blocker)} блокирует бросок ${nm(shooter)}.` });
      }
      for (let i = 0; i < hits; i++) if (rnd() < FEED.hitLog) {
        const hitter = pickW(own, rnd, p => p.pos === 'D' ? 1.3 : 1), victim = pickW(opp, rnd, () => 1);
        if (!hitter || !victim) continue;
        const st = stamp(); push({ kind: 'hit', teamId: teams[X].id, actorId: hitter.id, targetId: victim.id, period: st.period, time: st.time, text: `${nm(hitter)} проводит силовой приём против ${nm(victim)}.` });
      }
    }
    const fo = pois(FEED.foTotal / 60 * (ot3 ? 0.5 : 1), rnd);
    const pH = clamp(0.5 + 0.004 * (str.h.overall - str.a.overall) + c.foBias, 0.36, 0.64);
    for (let i = 0; i < fo; i++) c[rnd() < pH ? 'h' : 'a'].faceoffs[idx]++;
    c.sogMin.h = 0; c.sogMin.a = 0;
  };
  const baseComplete = proto.completeLiveMatch;
  proto.completeLiveMatch = function (live) {
    const r = baseComplete.apply(this, arguments);
    try {
      const t = this.state && live && this.state.matches.find(x => x.id === live.matchId);
      if (t && live.cnt && !t.matchStats) {
        const per = (t.ot || t.so) ? 4 : 3, c = live.cnt;
        const fit = (arr, total) => { const a = arr.slice(0, per); const diff = total - a.reduce((x, y) => x + y, 0); if (diff) a[Math.min(2, per - 1)] = Math.max(0, a[Math.min(2, per - 1)] + diff); return a; };
        const side = (k, shots) => {
          const mk = a => ({ total: a.reduce((x, y) => x + y, 0), periods: a });
          return { shots: mk(fit(c[k].shots, shots)), faceoffs: mk(c[k].faceoffs.slice(0, per)), blocks: mk(c[k].blocks.slice(0, per)), hits: mk(c[k].hits.slice(0, per)), penalties: { total: 0, periods: zeros(per) } };
        };
        t.matchStats = { home: side('h', t.homeShots || 0), away: side('a', t.awayShots || 0), periodCount: per, penaltyStatsVersion: 3, generatedAt: Date.now() };
      }
    } catch (e) { console.error('matchStats from live failed', e); }
    return r;
  };

  /* ---------- быстрая симуляция ---------- */
  const decorate = fn => function (match) {
    const was = !!(match && match.played);
    const r = fn.apply(this, arguments);
    const m = (r && r.played) ? r : (match && match.played ? match : null);
    if (!was && m && m.__shotsP && !m.feedLinked) {
      try { this.linkQuickMatch(m); } catch (e) { console.error('linkQuickMatch failed', e); }
    }
    if (m && m.__shotsP) delete m.__shotsP;
    return r;
  };
  proto.simulateMatch = decorate(proto.simulateMatch);
  if (typeof proto.simulatePlayoffGame === 'function') proto.simulatePlayoffGame = decorate(proto.simulatePlayoffGame);

  proto.linkQuickMatch = function (m) {
    const rnd = this.matchRng(m, 'feed');
    const sp = m.__shotsP, per = (m.ot || m.so) ? 4 : 3;
    const sh = this.getStrength(m.homeId), sa = this.getStrength(m.awayId);
    const fitShots = (arr, total) => {
      const a = (arr || []).slice(0, per); while (a.length < per) a.push(0);
      const diff = total - a.reduce((x, y) => x + y, 0); if (diff) a[1] = Math.max(0, a[1] + diff); return a;
    };
    const hs = fitShots(sp.h, m.homeShots || 0), as = fitShots(sp.a, m.awayShots || 0);
    const w = i => (hs[i] + as[i] + 1);
    const weights = Array.from({ length: per }, (_, i) => w(i));
    const blocksH = Math.max(3, Math.round(FEED.blockRate * (m.awayShots || 0) * (1 + 0.006 * (sh.defense - 80)) * (1 + norm(rnd) * 0.08)));
    const blocksA = Math.max(3, Math.round(FEED.blockRate * (m.homeShots || 0) * (1 + 0.006 * (sa.defense - 80)) * (1 + norm(rnd) * 0.08)));
    const hitsH = Math.max(8, Math.round(FEED.hitBase * clamp(1 + 0.012 * (sa.overall - sh.overall), 0.7, 1.35) + norm(rnd) * 3.2));
    const hitsA = Math.max(8, Math.round(FEED.hitBase * clamp(1 + 0.012 * (sh.overall - sa.overall), 0.7, 1.35) + norm(rnd) * 3.2));
    const foT = Math.round(FEED.foTotal + norm(rnd) * 4);
    const foH = Math.round(foT * clamp(0.5 + 0.004 * (sh.overall - sa.overall) + norm(rnd) * 0.035, 0.36, 0.64));
    const mk = (arr, total) => { const a = splitWeighted(total, weights, rnd); return { total: a.reduce((x, y) => x + y, 0), periods: a }; };
    const shotsObj = a => ({ total: a.reduce((x, y) => x + y, 0), periods: a });
    m.matchStats = {
      home: { shots: shotsObj(hs), faceoffs: mk(null, foH), blocks: mk(null, blocksH), hits: mk(null, hitsH), penalties: { total: 0, periods: zeros(per) } },
      away: { shots: shotsObj(as), faceoffs: mk(null, foT - foH), blocks: mk(null, blocksA), hits: mk(null, hitsA), penalties: { total: 0, periods: zeros(per) } },
      periodCount: per, penaltyStatsVersion: 3, generatedAt: 0
    };
    // лента: сейвы, блоки и силовые с именами игроков
    const act = { [m.homeId]: this.activeSkaters(m.homeId), [m.awayId]: this.activeSkaters(m.awayId) };
    const goals = { [m.homeId]: 0, [m.awayId]: 0 };
    (m.events || []).forEach(e => { if (e.kind === 'goal' && goals[e.teamId] != null) goals[e.teamId]++; });
    const stamp = () => { // момент в основное время, чаще в периодах с большим числом бросков
      let r = rnd() * weights.slice(0, 3).reduce((a, b) => a + b, 0), p = 0;
      for (; p < 2; p++) { r -= weights[p]; if (r <= 0) break; }
      const sec = Math.floor(rnd() * 1200);
      return { period: (p + 1) + 'П', time: String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0') };
    };
    const add = (kind, teamId, actor, target, text) => { const s = stamp(); m.events.push({ kind, teamId, actorId: actor ? actor.id : null, targetId: target ? target.id : null, period: s.period, time: s.time, text }); };
    const sk = id => (act[id].skaters || []).filter(Boolean);
    const teams = [[m.homeId, m.awayId, m.homeShots, blocksA, m.matchStats.home.hits.total], [m.awayId, m.homeId, m.awayShots, blocksH, m.matchStats.away.hits.total]];
    for (const [tid, oid, shots, oppBlocks, hits] of teams) {
      const saves = Math.max(0, Math.round((shots - goals[tid]) * FEED.saveLog + norm(rnd) * 0.8));
      for (let i = 0; i < saves; i++) {
        const shooter = pickW(sk(tid), rnd, p => Math.exp((this.effectiveOVR(p) - 75) / 16) * (p.pos === 'D' ? 0.5 : 1)), goalie = act[oid].goalie;
        if (shooter) add('save', tid, shooter, goalie, goalie ? `${nm(shooter)} бросает в створ, ${nm(goalie)} отражает бросок.` : `${nm(shooter)} бросает в створ.`);
      }
      const nb = Math.round(oppBlocks * FEED.blockLog);
      for (let i = 0; i < nb; i++) {
        const blocker = pickW(sk(oid), rnd, p => p.pos === 'D' ? 1.6 : 1), shooter = pickW(sk(tid), rnd, p => p.pos === 'D' ? 0.6 : 1);
        if (blocker && shooter) add('block', oid, blocker, shooter, `${nm(blocker)} блокирует бросок ${nm(shooter)}.`);
      }
      const nh = Math.round(hits * FEED.hitLog);
      for (let i = 0; i < nh; i++) {
        const hitter = pickW(sk(tid), rnd, p => p.pos === 'D' ? 1.3 : 1), victim = pickW(sk(oid), rnd, () => 1);
        if (hitter && victim) add('hit', tid, hitter, victim, `${nm(hitter)} проводит силовой приём против ${nm(victim)}.`);
      }
    }
    const final = m.events.find(e => e.kind === 'final');
    m.events.sort((a, b) => this.eventMinute(a) - this.eventMinute(b));
    if (final) { m.events = m.events.filter(e => e !== final); m.events.push(final); }
    m.feedLinked = true;
  };
})();
