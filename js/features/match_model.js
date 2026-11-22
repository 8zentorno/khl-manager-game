/* KHL Manager 7.36 — shot-based match model.
 * One source of truth for "how many shots does a team make and how likely is a shot to become a goal".
 * Used by: quick simulation (regular season + playoffs, seeded per match) and by the live engine.
 * Calibration targets (KHL, see README 7.36): regular ~5.4 goals/game, ~29 SOG per team, sv% ~.907;
 * playoffs ~4.5 goals/game, ~28 SOG, sv% ~.92; ~22% of regular games go beyond 60 minutes.
 */
(function(){
  'use strict';
  const proto = KHLManagerApp.prototype;

  const PARAMS = {
    reg:  { shots: 29.0, p: 0.0970, home: 1.2, homeP: 0.018 },   // 14.7.9: 0.0970 (после сжатия рейтингов вратарей голов было 5,44); 14.7.7: было 0.0910 (вратари стали сильнее: голы за матч вернулись к ~5,3)
    po:   { shots: 28.0, p: 0.1005, home: 0.9, homeP: 0.02 },
    coef: { attShots: 0.012, defShots: 0.009, ovrShots: 0.009, attP: 0.02175, gkP: 0.021 }, // 9.12: ×1,5 к прежним — сильные клубы чаще побеждают слабых; p пересчитано, чтобы голов за матч осталось столько же
    poMult: 1.4,                   // 9.14: в плей-офф сила состава влияет сильнее (8-й номер проходит 1-го ~22%, было ~30%)
    pace: 0.10,
    pickScale: 17,                 // 8.17: меньше разрыв между звёздами и остальными при выборе автора гола/передачи
    assist: { a1: 0.94, a2: 0.86 }, // 8.17: ~1,75 передачи на гол
    dShare: { ev: 0.13, pp: 0.17 }, // 8.17: доля голов защитников                    // game-level sd of the shared "tempo" factor
    scoreEffect: [0.97, 0.985, 1, 1.025, 1.05], // shot-rate multiplier by own lead: <=-2..>=+2 mapped below
    ot3v3: { shotMul: 1.43, pMul: 1.8 },      // regular season 3-on-3 overtime
    otPo:  { shotMul: 0.92, pMul: 1.0 },       // playoff 5-on-5 overtime
    otFatigue: { start: 5, k: 0.06 },          // 9.40.0: после 5-й минуты овертайма плей-офф шанс гола растёт на 6 % за минуту (усталость)
    pull:  { equalize: 0.11, emptyNet: 0.30 },  // goalie pulled when trailing by one goal in the last minute
    // 9.34.0: «сценарий матча». Показатели статистики (владение, опасные моменты, потери/перехваты) становятся причиной,
    // а не следствием. Все рычаги сохраняют среднее по лиге: положительное и отрицательное отклонения симметричны.
    scn: {
      on: true,
      k1: 0.40,        // ход игры (контроль, владение) — «Мягко»
      k2: 0.50,        // доля эффекта «атака», перенесённая в опасные моменты
      k3: 0.40,        // потери и перехваты → быстрые атаки
      ctrlSd: 0.06,    // разброс контроля игры за матч (доля от объёма бросков при k1 = 1)
      ctrlCap: 0.08,
      condCtrl: 0.012, // добавка за разницу формы/усталости составов
      hi: 2.0, lo: 0.75, // множители шанса гола: опасный бросок / обычный (при доле опасных 20% среднее = 1)
      shiftPerNet: 0.5, shiftCap: 1.5,
      giveBase: 10.5,
      disc: 0.35       // дисциплина: связь потерь с долей удалений
    }
  };
  proto.MATCH_MODEL_PARAMS = PARAMS;

  function hashStr(s){ let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function poisson(rnd, lambda){ if (lambda <= 0) return 0; const L = Math.exp(-lambda); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 12); return k - 1; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Deterministic RNG per match (the save keeps matchSeed, so a replayed/reloaded fixture gives the same score).
  proto.matchRng = function(match, salt){
    if (!this.state) return Math.random;
    if (!this.state.matchSeed) this.state.matchSeed = Math.floor(Math.random() * 2147483646) + 1;
    return mulberry32(hashStr(`${this.state.matchSeed}:${match?.id ?? 'x'}:${salt || ''}`));
  };


  // 11.1.1: между двумя голами в основное время проходит не меньше 15 секунд (вбрасывание, выход в зону), иначе голы шли «подряд за секунду»
  const MIN_GOAL_GAP = 0.25;
  function spreadGoals(out){
    const all = [...out.goalsH.map(t => ({ t, h: true })), ...out.goalsA.map(t => ({ t, h: false }))].sort((a, b) => a.t - b.t);
    for (let i = 1; i < all.length; i++) if (all[i].t < all[i - 1].t + MIN_GOAL_GAP) all[i].t = all[i - 1].t + MIN_GOAL_GAP;
    for (let i = all.length - 1; i >= 0; i--) { const cap = i === all.length - 1 ? 59.98 : all[i + 1].t - MIN_GOAL_GAP; if (all[i].t > cap) all[i].t = cap; }
    out.goalsH = all.filter(x => x.h).map(x => x.t); out.goalsA = all.filter(x => !x.h).map(x => x.t);
  }
  const gauss = rnd => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
  // Сценарий матча: контроль игры, доля опасных бросков, потери и перехваты, склонность к удалениям.
  proto.matchScenario = function(match, sh, sa, playoff){
    const S = PARAMS.scn; if (!S.on) return null;
    const rnd = this.matchRng(match, 'scn'), k = playoff ? PARAMS.poMult : 1;
    const cnd = st => { try { const L = [...((st && st.topForwards) || []), ...((st && st.topDefense) || [])]; let f = 0, t = 0, n = 0; for (const p of L) { const d = this.playerDev(p); if (!d) continue; f += d.form == null ? 50 : d.form; t += d.fatigue || 0; n++; } return n ? clamp((f / n - 50) / 25 - Math.max(0, t / n - 35) / 35, -1.5, 1.5) : 0; } catch (e) { return 0; } };
    const cH = cnd(sh), cA = cnd(sa), cd = cH - cA;
    const F = clamp(S.k1 * (S.ctrlSd * gauss(rnd) + S.condCtrl * cd), -S.ctrlCap, S.ctrlCap);
    const qOf = st => clamp((Math.exp(S.k2 * PARAMS.coef.attP * k * ((st.attack || 80) - 80)) - S.lo) / (S.hi - S.lo), 0.05, 0.6);
    const J = w => 1 + (rnd() - 0.5) * w;
    const give = (c, own, opp) => Math.max(3, Math.round(S.giveBase * (1 - 0.06 * c) * clamp(1 + 0.01 * ((opp.overall || 80) - (own.overall || 80)), 0.8, 1.2) * J(0.3)));
    const giveH = give(cH, sh, sa), giveA = give(cA, sa, sh);
    const take = (gv, own, opp) => Math.round(gv * clamp(0.55 + 0.004 * ((own.defense || 80) - (opp.attack || 80)), 0.4, 0.75) * J(0.2));
    const takeH = take(giveA, sh, sa), takeA = take(giveH, sa, sh);
    const netH = takeH - giveH, netA = takeA - giveA;
    const shift = clamp(S.shiftPerNet * S.k3 * (netH - netA) / 2, -S.shiftCap, S.shiftCap);
    const sd = (giveH - giveA) / (giveH + giveA + 4);
    return { F, shift, qH: qOf(sh), qA: qOf(sa), giveH, giveA, takeH, takeA, cd,
      pHomeGuilty: clamp(0.5 + S.disc * sd, 0.4, 0.6), dangH: 0, dangA: 0, xgH: 0, xgA: 0 };
  };
  // Живой матч: сценарий создаётся один раз при первом обращении, вместе с интенсивностью бросков.
  proto.liveScenario = function(live, m){
    if (live.scn !== undefined) return live.scn;
    const sh = this.getStrength(live.homeId), sa = this.getStrength(live.awayId), po = !!m.playoff;
    live.scn = this.matchScenario(m, sh, sa, po) || null;
    live.rates = this.matchRates(sh, sa, po, live.scn);
    if (live.scn) m.scn = live.scn;
    return live.scn;
  };

  // Per-60 shot volume and goal probability per shot for both sides (5v5 baseline).
  proto.matchRates = function(sh, sa, playoff, scn){
    const base = playoff ? PARAMS.po : PARAMS.reg, k = playoff ? PARAMS.poMult : 1, c0 = PARAMS.coef;
    const c = { attShots: c0.attShots * k, defShots: c0.defShots * k, ovrShots: c0.ovrShots * k, attP: c0.attP * k * (scn ? 1 - PARAMS.scn.k2 : 1), gkP: c0.gkP * k };
    const side = (x, y, sign) => ({
      shots: clamp(base.shots * (1 + c.attShots * (x.attack - 80) - c.defShots * (y.defense - 80) + c.ovrShots * (x.overall - y.overall)) + sign * base.home, 21, 38),
      p: clamp(base.p * (1 + sign * base.homeP) * Math.exp(c.attP * (x.attack - 80) - c.gkP * (y.goalie - 80)), 0.05, 0.16)
    });
    return { h: side(sh, sa, +1), a: side(sa, sh, -1) };
  };

  // Full game: regulation, then overtime (3v3 5 min in the regular season, 5v5 sudden death in playoffs).
  // Returns goal times (minutes, fractional) so events, scorers and live feed share one timeline.
  proto.shotModelGame = function(match, home, away, sh, sa, playoff){
    const rnd = this.matchRng(match, playoff ? 'po' : 'reg');
    const scn = this.matchScenario(match, sh, sa, playoff), S = PARAMS.scn;
    const R = this.matchRates(sh, sa, playoff, scn);
    const tempo = Math.exp((rnd() + rnd() + rnd() - 1.5) * 2 * PARAMS.pace);
    const rateH = scn ? Math.max(8, R.h.shots * (1 + scn.F) + scn.shift) : R.h.shots, rateA = scn ? Math.max(8, R.a.shots * (1 - scn.F) - scn.shift) : R.a.shots;
    const out = { scn, goalsH: [], goalsA: [], shotsH: 0, shotsA: 0, shotsPH: [0, 0, 0, 0], shotsPA: [0, 0, 0, 0], ot: false, otWinner: null, otTime: 0, otClock: null };
    const se = PARAMS.scoreEffect, TC = this.tacSim ? this.tacSim(match, home, away) : null;
    for (let m = 0; m < 60; m++) {
      const diff = out.goalsH.length - out.goalsA.length; // + = home leads
      const mulH = se[clamp(2 + (-diff), 0, 4)], mulA = se[clamp(2 + diff, 0, 4)];
      const tf = TC ? TC.step(m, diff) : null, pH = tf ? tf.hP : 1, pA = tf ? tf.aP : 1;
      const kH = poisson(rnd, rateH / 60 * tempo * mulH * (tf ? tf.hS : 1)), kA = poisson(rnd, rateA / 60 * tempo * mulA * (tf ? tf.aS : 1));
      out.shotsH += kH; out.shotsA += kA; out.shotsPH[Math.floor(m / 20)] += kH; out.shotsPA[Math.floor(m / 20)] += kA;
      if (scn) {
        for (let i = 0; i < kH; i++) { const dg = rnd() < scn.qH, pp = R.h.p * pH * (dg ? S.hi : S.lo); if (dg) scn.dangH++; scn.xgH += pp; if (rnd() < pp) out.goalsH.push(m + rnd()); }
        for (let i = 0; i < kA; i++) { const dg = rnd() < scn.qA, pp = R.a.p * pA * (dg ? S.hi : S.lo); if (dg) scn.dangA++; scn.xgA += pp; if (rnd() < pp) out.goalsA.push(m + rnd()); }
      } else {
        for (let i = 0; i < kH; i++) if (rnd() < R.h.p * pH) out.goalsH.push(m + rnd());
        for (let i = 0; i < kA; i++) if (rnd() < R.a.p * pA) out.goalsA.push(m + rnd());
      }
    }
    if (TC) TC.finish();
    // Goalie pulled at 59:00 when trailing by exactly one.
    const d = out.goalsH.length - out.goalsA.length;
    if (Math.abs(d) === 1) {
      const trailH = d < 0, add = (arr, t) => arr.push(t);
      if (trailH) { out.shotsH += 2; out.shotsPH[2] += 2; } else { out.shotsA += 2; out.shotsPA[2] += 2; }
      if (rnd() < PARAMS.pull.equalize) add(trailH ? out.goalsH : out.goalsA, 59.2 + rnd() * 0.75);
      else if (rnd() < PARAMS.pull.emptyNet) add(trailH ? out.goalsA : out.goalsH, 59.3 + rnd() * 0.69);
      out.emptyNetGoal = out.goalsH.length - out.goalsA.length;
    }
    out.goalsH.sort((x, y) => x - y); out.goalsA.sort((x, y) => x - y);
    spreadGoals(out);
    if (out.goalsH.length === out.goalsA.length) {
      const o = playoff ? PARAMS.otPo : PARAMS.ot3v3;
      const maxMin = playoff ? 100 : 5;
      for (let step = 0; step < maxMin * 2 && !out.otWinner; step++) {
        const order = rnd() < 0.5 ? ['h', 'a'] : ['a', 'h'];
        for (const s of order) {
          const k = poisson(rnd, R[s].shots / 60 * tempo * o.shotMul / 2);
          if (s === 'h') { out.shotsH += k; out.shotsPH[3] += k; } else { out.shotsA += k; out.shotsPA[3] += k; }
          for (let i = 0; i < k && !out.otWinner; i++) if (rnd() < R[s].p * o.pMul * (playoff ? 1 + PARAMS.otFatigue.k * Math.max(0, step / 2 - PARAMS.otFatigue.start) : 1)) { out.otWinner = s === 'h' ? home.id : away.id; out.otTime = step / 2 + rnd() / 2; }
        }
      }
      if (!out.otWinner && playoff) { out.otWinner = rnd() < 0.5 ? home.id : away.id; out.otTime = maxMin; }
      if (out.otWinner) { out.ot = true; if (out.otTime < 0.25) out.otTime = 0.25 + rnd() * 0.25; const mm = Math.floor(out.otTime), ss = Math.floor((out.otTime % 1) * 60); out.otClock = `${String(Math.max(0, mm)).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }
    }
    return out;
  };
})();
