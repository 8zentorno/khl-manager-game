/* KHL Manager 14.6.0 — тактика: стили игры, давление, силовая борьба, схема большинства,
 * тренеры соперников меняют стиль по ходу матча, химия звеньев, запас (усталость).
 * Все эффекты идут через те же рычаги, что и сила состава: число бросков и шанс гола за бросок.
 * Нейтральные настройки (сбалансированный стиль, давление 3, борьба 3) не меняют модель.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = s => { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

  /* sf — свои броски, sa — изменение бросков соперника, q — качество своих моментов, qa — качество моментов соперника,
     fat — усталость. Положительные sf/q и отрицательные sa/qa/fat выгодны. */
  const STYLES = proto.TAC_STYLES = {
    att: { n: 'Атакующий', sf: .14, sa: 0, q: 0, qa: .10, fat: .08, d: 'Больше бросков и давления, но соперник получает опасные контратаки.' },
    bal: { n: 'Сбалансированный', sf: 0, sa: 0, q: 0, qa: 0, fat: 0, d: 'Без крайностей: игра по силе состава.' },
    def: { n: 'Оборонительный', sf: -.10, sa: -.13, q: 0, qa: -.04, fat: -.04, d: 'Мало бросков в обе стороны и надёжная оборона.' },
    cnt: { n: 'Контратакующий', sf: -.06, sa: -.04, q: .12, qa: 0, fat: 0, d: 'Отдаёт шайбу, но быстрые выходы дают опасные моменты.' }
  };
  const PPS = proto.TAC_PP = {
    std: { n: 'Стандартное', ppg: 0, risk: 0, d: 'Без риска.' },
    umb: { n: 'Зонтик', ppg: .06, risk: .10, d: '+6% к голам в большинстве, +10% к риску гола в меньшинстве.' },
    ovl: { n: 'Перегруз', ppg: .10, risk: .18, d: '+10% к голам в большинстве, +18% к риску гола в меньшинстве.' }
  };
  const PKS = proto.TAC_PK = {
    std: { n: 'Стандартное', shots: 0, goals: 0, sh: 1, d: 'Без изменений.' },
    box: { n: 'Коробка', shots: -.08, goals: 0, sh: .6, d: 'На 8% меньше бросков соперника в большинстве, но почти нет шансов забить в меньшинстве.' },
    agr: { n: 'Агрессивное', shots: 0, goals: .10, sh: 1.3, d: 'Давление на владеющего шайбой: +30% голов в меньшинстве, но +10% голов соперника в большинстве.' }
  };
  const PRESS_LABEL = ['Пассивное', 'Умеренное', 'Среднее', 'Высокое', 'Максимальное'];
  const PHYS_LABEL = ['Чистая игра', 'Аккуратно', 'Обычная', 'Жёсткая', 'Грубая'];
  proto.TAC_PRESS_LABEL = PRESS_LABEL; proto.TAC_PHYS_LABEL = PHYS_LABEL;
  const CHEM_MAX = .03, CHEM_NEUTRAL = .015; // бонус до +3%; центр 50 не меняет калибровку лиги
  proto.TAC_PARAMS = { chemMax: CHEM_MAX, pairStart: 50, pairNew: 25, growth: .045, decay: .985, ramp: 4, fatMul: 20, drag: .12, lineK: .009 };

  const defaults = () => ({ style: 'bal', press: 3, phys: 3, pp: 'std', pk: 'std' });
  proto.tacDefault = defaults;
  const skill = (app, teamId, k) => { try { const c = app.coachOf(teamId); const v = c && c.skills && c.skills[k]; return Number.isFinite(v) ? v : 65; } catch (e) { return 65; } };
  proto.tacSkill = function (teamId, k) { return skill(this, teamId, k); };

  /* ---------- базовая тактика команды ---------- */
  /* тактика команды по умолчанию (вкладка «Тактика») */
  proto.tacTabConfig = function () { if (!this.state.tactics) this.state.tactics = defaults(); return this.state.tactics; };
  proto.tacConfig = function (teamId) {
    if (this.state && String(teamId) === String(this.state.teamId)) {
      if (this.state.preMatchTac) return this.state.preMatchTac;   // тактика только на ближайший матч
      return this.tacTabConfig();
    }
    const h = hash('tac:' + teamId), r = h % 100;
    const style = r < 45 ? 'bal' : r < 65 ? 'att' : r < 85 ? 'def' : 'cnt';
    const pick = n => (Math.floor(h / n) % 3) - 1;
    const pp = ['std', 'std', 'umb', 'ovl'][Math.floor(h / 97) % 4];
    const pk = ['std', 'std', 'box', 'agr'][Math.floor(h / 193) % 4];
    return { style, press: clamp(3 + pick(7), 2, 4), phys: clamp(3 + pick(31), 2, 4), pp, pk };
  };

  /* ---------- параметры стиля ---------- */
  proto.tacParams = function (cfg, teamId) {
    const s = STYLES[cfg.style] || STYLES.bal, k = 1 + (skill(this, teamId, 'tactics') - 65) / 200;
    const gain = v => v * k, cost = v => v / k; // сильный тренер усиливает плюсы стиля и смягчает минусы
    const pr = (cfg.press || 3) - 3, ph = (cfg.phys || 3) - 3;
    return {
      sf: (s.sf > 0 ? gain(s.sf) : cost(s.sf)) + .025 * pr,
      sa: (s.sa < 0 ? gain(s.sa) : cost(s.sa)) - .015 * pr,
      q: (s.q > 0 ? gain(s.q) : cost(s.q)),
      qa: (s.qa < 0 ? gain(s.qa) : cost(s.qa)) - .012 * ph,
      pen: .05 * pr + .08 * ph, fat: s.fat + .04 * pr + .02 * ph, inj: .10 * ph
    };
  };
  const lerpP = (a, b, t) => { const o = {}; for (const k in a) o[k] = a[k] + (b[k] - a[k]) * t; return o; };

  /* ---------- химия звеньев ---------- */
  const pairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;
  const FL = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
  function userLines(app) {
    const s = (app.state && app.state.slotAssignments) || {}, F = [], D = [];
    for (let i = 1; i <= 4; i++) F.push(['LW', 'C', 'RW'].map(p => s['F' + i + p]).filter(Boolean));
    for (let i = 1; i <= 3; i++) D.push(['L', 'R'].map(p => s['D' + i + p]).filter(Boolean));
    return { F, D };
  }
  proto.tacChemState = function () {
    const st = this.state; if (!st) return null;
    if (!st.chem) {
      st.chem = { pairs: {}, gp: 0 };
      const L = userLines(this); [...L.F, ...L.D].forEach(l => pairsOf(l).forEach(k => { st.chem.pairs[k] = this.TAC_PARAMS.pairStart; }));
    }
    return st.chem;
  };
  function pairsOf(line) { const o = []; for (let i = 0; i < line.length; i++) for (let j = i + 1; j < line.length; j++) o.push(pairKey(line[i], line[j])); return o; }
  proto.tacLineChem = function (line) {
    const ch = this.tacChemState(); const ps = pairsOf(line); if (!ps.length) return this.TAC_PARAMS.pairNew;
    return ps.reduce((s, k) => s + (ch.pairs[k] != null ? ch.pairs[k] : this.TAC_PARAMS.pairNew), 0) / ps.length;
  };
  /* химия команды 0..100: звенья нападения и защиты с весами по игровому времени */
  proto.tacTeamChem = function (teamId) {
    if (this.state && String(teamId) === String(this.state.teamId)) {
      const L = userLines(this), wF = [.34, .30, .22, .14], wD = [.40, .35, .25];
      const f = L.F.reduce((s, l, i) => s + this.tacLineChem(l) * wF[i], 0), d = L.D.reduce((s, l, i) => s + this.tacLineChem(l) * wD[i], 0);
      return .6 * f + .4 * d;
    }
    return clamp(50 + (skill(this, teamId, 'lines') - 60) * .25, 35, 70);
  };
  proto.tacChemFactor = function (teamId) { return (1 + CHEM_MAX * this.tacTeamChem(teamId) / 100) / (1 + CHEM_NEUTRAL); };
  /* после матча: растут пары в игровых звеньях, остальные затухают */
  proto.tacChemAfterMatch = function () {
    const ch = this.tacChemState(); if (!ch) return;
    const P = this.TAC_PARAMS, rate = P.growth * (1 + (skill(this, this.state.teamId, 'lines') - 60) / 100), g = 1 - Math.exp(-rate);
    const L = userLines(this), live = new Set();
    for (const l of [...L.F, ...L.D]) for (const k of pairsOf(l)) {
      const [a, b] = k.split('|'), pa = this.playerById(a), pb = this.playerById(b);
      if (!pa || !pb || this.isPlayerUnavailable(pa) || this.isPlayerUnavailable(pb)) continue;
      live.add(k); const v = ch.pairs[k] != null ? ch.pairs[k] : P.pairNew; ch.pairs[k] = Math.min(100, v + (100 - v) * g);
    }
    for (const k of Object.keys(ch.pairs)) if (!live.has(k)) { ch.pairs[k] *= P.decay; if (ch.pairs[k] < 5) delete ch.pairs[k]; }
    ch.gp = (ch.gp || 0) + 1;
  };

  /* ---------- состояние стороны в матче ---------- */
  function newSide(app, teamId, isUser) {
    const base = Object.assign({}, app.tacConfig(teamId));
    return { teamId, user: isUser, cfg: Object.assign({}, base), base, prev: null, at: 0, ramp: 1, pendWant: null, pendAt: 0, lastChange: -99, changes: 0, pens: 0, queue: null };
  }
  const rampOf = (app, teamId) => Math.max(1, Math.round(app.TAC_PARAMS.ramp - (skill(app, teamId, 'ingame') - 40) / 55 * 3));
  function sideParams(app, side, minute) {
    const cur = app.tacParams(side.cfg, side.teamId);
    if (!side.prev) return cur;
    const t = clamp((minute - side.at) / side.ramp, 0, 1);
    return t >= 1 ? (side.prev = null, cur) : lerpP(app.tacParams(side.prev, side.teamId), cur, t);
  }
  function setCfg(app, side, cfg, minute) {
    side.prev = Object.assign({}, side.cfg); side.cfg = Object.assign({}, cfg); side.at = minute; side.ramp = rampOf(app, side.teamId);
    side.lastChange = minute; side.changes++;
  }
  /* решение тренера ИИ: стиль по счёту и времени, с задержкой и ошибками по навыку «В игре» */
  function aiWant(side, minute, diff) {
    const b = side.base.style; let want = b;
    if (minute >= 40) { if (diff < 0) want = 'att'; else if (diff > 0) want = minute >= 48 ? 'def' : 'cnt'; }
    else if (minute >= 20) { if (diff <= -2) want = 'att'; else if (diff >= 2) want = 'def'; }
    return want;
  }
  function aiStep(app, side, minute, diff, rnd, log, sk) {
    if (side.user) return;
    const react = Math.round(8 - (sk - 40) / 55 * 6.5), err = (95 - sk) / 55 * .12;
    let want = aiWant(side, minute, diff);
    if (rnd() < err) want = ['att', 'bal', 'def', 'cnt'][Math.floor(rnd() * 4)];
    if (want === side.cfg.style) { side.pendWant = null; return; }
    if (side.pendWant !== want) { side.pendWant = want; side.pendAt = minute; return; }
    if (minute - side.pendAt < react || minute - side.lastChange < 3) return;
    const press = clamp(side.base.press + (want === 'att' ? 1 : want === 'def' ? -1 : 0), 1, 5);
    const why = diff < 0 ? `проигрывает ${Math.abs(diff)} шайб${Math.abs(diff) === 1 ? 'у' : 'ы'}` : diff > 0 ? `ведёт на ${diff}` : 'счёт равный';
    setCfg(app, side, Object.assign({}, side.cfg, { style: want, press }), minute);
    side.pendWant = null; log(side, minute, `стиль «${STYLES[want].n}»: ${why}`);
  }

  /* эффективность стороны: множители бросков и шанса гола */
  function sideFx(app, me, opp, minute, tm) {
    const a = sideParams(app, me, minute), b = sideParams(app, opp, minute);
    const drag = Math.max(0, a.fat) * (minute / 60) * app.TAC_PARAMS.drag * (1 - (skill(app, me.teamId, 'bench') - 60) / 150);
    const lf = tm && tm.lineF ? tm.lineF(me.teamId) : 1;
    return {
      shots: clamp((1 + a.sf) * (1 + b.sa) * (1 - drag) * lf, .6, 1.5),
      p: clamp((1 + a.q) * (1 + b.qa) * (1 - drag * .8) * lf * app.tacChemFactor(me.teamId), .6, 1.5)
    };
  }

  /* ---------- быстрая симуляция (ИИ против ИИ, плей-офф, быстрый итог пользователя без живого матча) ---------- */
  proto.tacSim = function (match, home, away) {
    const rnd = this.matchRng ? this.matchRng(match, 'tac') : Math.random;
    const uid = this.state && this.state.teamId;
    const H = newSide(this, home.id, home.id === uid), A = newSide(this, away.id, away.id === uid), log = [];
    const lg = (side, minute, text) => log.push({ min: Math.round(minute), teamId: side.teamId, text });
    const self = this;
    const out = {
      step(minute, diffHome) {
        aiStep(self, H, minute, diffHome, rnd, lg, skill(self, home.id, 'ingame'));
        aiStep(self, A, minute, -diffHome, rnd, lg, skill(self, away.id, 'ingame'));
        const fh = sideFx(self, H, A, minute), fa = sideFx(self, A, H, minute);
        return { hS: fh.shots, hP: fh.p, aS: fa.shots, aP: fa.p };
      },
      finish() {
        match.tacLog = log;
        match.tac = { h: { style: H.base.style, last: H.cfg.style, press: H.base.press, phys: H.base.phys, pp: H.base.pp, changes: H.changes }, a: { style: A.base.style, last: A.cfg.style, press: A.base.press, phys: A.base.phys, pp: A.base.pp, changes: A.changes } };
      }
    };
    return out;
  };

  /* ---------- штрафы, травмы, большинство ---------- */
  const penOf = (app, teamId) => { const c = app.tacConfig(teamId); return .05 * (c.press - 3) + .08 * (c.phys - 3); };
  const baseCPM = proto.coachPenMul;
  proto.coachPenMul = function (teamId) { const b = baseCPM ? baseCPM.apply(this, arguments) : 1; return b * (1 + penOf(this, teamId)); };
  const baseCGS = proto.coachGuiltyShift;
  proto.coachGuiltyShift = function (homeId, awayId) {
    const b = baseCGS ? baseCGS.apply(this, arguments) : 0;
    return b + clamp(.25 * (penOf(this, homeId) - penOf(this, awayId)), -.06, .06);
  };
  proto.tacInjMul = function (teamId) { return 1 + .10 * (this.tacConfig(teamId).phys - 3); };
  const baseITM = proto.injuryTeamMul;
  proto.injuryTeamMul = function (pool) {
    const b = baseITM ? baseITM.apply(this, arguments) : 1;
    const tid = pool && pool[0] && pool[0].teamId; return tid ? b * this.tacInjMul(tid) : b;
  };
  proto.tacPpRisk = function (ppTeamId) { return 1 + (PPS[this.tacConfig(ppTeamId).pp] || PPS.std).risk; };
  /* множитель шанса гола в меньшинстве: риск схемы большинства соперника и схема меньшинства своей команды */
  proto.tacShMul = function (pkTeamId, ppTeamId) { return this.tacPpRisk(ppTeamId) * (PKS[this.tacConfig(pkTeamId).pk] || PKS.std).sh; };
  const baseSP = proto.specialPowerFactors;
  proto.specialPowerFactors = function (teamId, ppP, oppId) {
    const fx = baseSP.apply(this, arguments); if (!fx) return fx;
    const g = 1 + (PPS[this.tacConfig(teamId).pp] || PPS.std).ppg, pk = PKS[this.tacConfig(oppId).pk] || PKS.std;
    return Object.assign({}, fx, { p: fx.p * g * (1 + pk.goals), shots: fx.shots * (1 + pk.shots) });
  };

  /* ---------- живой матч ---------- */
  const stampOf = minute => { const t = clamp(minute, 0, 59.98), per = Math.floor(t / 20) + 1, loc = t - (per - 1) * 20, mm = Math.floor(loc), ss = Math.min(59, Math.floor((loc - mm) * 60)); return { period: per + 'П', time: String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') }; };
  function initLive(app, live, m) {
    if (live.tac) return live.tac;
    const uid = app.state.teamId;
    const tac = live.tac = { h: newSide(app, live.homeId, live.homeId === uid), a: newSide(app, live.awayId, live.awayId === uid), lastMin: -1, baseP: null, base: {} };
    tac.slots = clone(app.state.slotAssignments); tac.units = clone(app.state.specialTeams);
    for (const tid of [live.homeId, live.awayId]) tac.base[tid] = lineMean(app, live, tid, true);
    return tac;
  }
  /* уровень игроков на льду: 12 нападающих + 6 защитников, отсутствующие считаются как 60 */
  function lineMean(app, live, tid, forBase) {
    const act = tid === live.homeId ? live.activeH : live.activeA; if (!act) return 70;
    const off = new Set([...(live.sentOff && live.sentOff[tid] || []), ...(live.injured && live.injured[tid] || [])]);
    const list = [...(act.forwards || []), ...(act.defense || [])]; let sum = 0, n = 0;
    const cold = 3 * (1 - (skill(app, tid, 'bench') - 40) / 55);
    for (const p of list) {
      if (!p) continue; if (!forBase && off.has(p.id)) continue; n++;
      let v = app.effectiveOVR ? app.effectiveOVR(p) : p.ovr;
      if (!forBase && live.tac && live.tac.subs && live.tac.subs[p.id]) v -= clamp(cold, 0, 3);
      sum += v;
    }
    return (sum + Math.max(0, 18 - n) * 60) / 18;
  }
  const baseFx = proto.liveScoreFx;
  proto.liveScoreFx = function (live, m, isHome) {
    const base = baseFx.apply(this, arguments);
    if (!this.state || !live || !m || !live.rates) return base;
    const tac = initLive(this, live, m), minute = Math.max(0, Math.floor(live.visibleMinute || 0));
    if (minute !== tac.lastMin) {
      tac.lastMin = minute;
      const diffH = (m.homeScore || 0) - (m.awayScore || 0), sk = t => skill(this, t, 'ingame');
      const lg = (side, mn, text) => {
        const tm = this.teamById(side.teamId), name = tm ? tm.name : side.teamId;
        const st = stampOf(mn);
        (m.events = m.events || []).push({ kind: 'tactic', teamId: side.teamId, period: st.period, time: st.time, visibleAtMinute: mn, text: `Тренер «${name}» меняет ${text}` });
        live.forceUiRender = true;
      };
      aiStep(this, tac.h, minute, diffH, Math.random, lg, sk(live.homeId));
      aiStep(this, tac.a, minute, -diffH, Math.random, lg, sk(live.awayId));
    }
    if (!tac.baseP) tac.baseP = { h: live.rates.h.p, a: live.rates.a.p };
    const me = isHome ? tac.h : tac.a, opp = isHome ? tac.a : tac.h;
    const tm = { lineF: tid => { const cur = lineMean(this, live, tid, false), b = tac.base[tid] || cur; return 1 + this.TAC_PARAMS.lineK * (cur - b); } };
    const fx = sideFx(this, me, opp, minute, tm);
    (isHome ? live.rates.h : live.rates.a).p = (isHome ? tac.baseP.h : tac.baseP.a) * fx.p;
    return base * fx.shots;
  };

  /* пользователь меняет тактику и состав в матче: изменения ждут ближайшей остановки игры.
     Состав и спецбригады матча живут отдельно (live.tac.slots, live.tac.units): вкладки «Состав» и «Спецбригады» не меняются. */
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  const mySide = (app, live) => { const tac = live.tac || initLive(app, live, live.simulatedMatch); return live.homeId === app.state.teamId ? tac.h : tac.a; };
  proto.tacLiveQueue = function (patch) {
    const live = this.liveMatch; if (!live || live.finished) return false;
    const side = mySide(this, live);
    side.queue = Object.assign({}, side.queue || side.cfg, patch);
    return true;
  };
  proto.tacLiveQueueLines = function (slots, units) {
    const live = this.liveMatch; if (!live || live.finished) return false;
    const tac = live.tac || initLive(this, live, live.simulatedMatch);
    if (slots) tac.slotsQ = clone(slots); if (units) tac.unitsQ = clone(units);
    return true;
  };
  /* движок видит состав и бригады матча: подменяем их на время вызова */
  proto.tacWithLive = function (live, fn) {
    const st = this.state, tac = live && live.tac;
    if (!st || !tac || !tac.slots) return fn();
    const s0 = st.slotAssignments, u0 = st.specialTeams, t0 = st.tactics, p0 = st.preMatchTac;
    const me = live.homeId === st.teamId ? tac.h : live.awayId === st.teamId ? tac.a : null;
    st.slotAssignments = tac.slots; if (tac.units) st.specialTeams = tac.units;
    if (me) { st.tactics = me.cfg; st.preMatchTac = null; }   // в матче действует тактика матча, вкладка не меняется
    try { return fn(); } finally { st.slotAssignments = s0; st.specialTeams = u0; st.tactics = t0; st.preMatchTac = p0; }
  };
  proto.tacRebuildActive = function (live) {
    const uid = this.state.teamId, mine = live.homeId === uid ? 'activeH' : 'activeA';
    const old = live[mine], fresh = this.tacWithLive(live, () => this.activeSkaters(uid));
    fresh.goalie = (old && old.goalie) || fresh.goalie; live[mine] = fresh;
  };
  proto.tacLiveFlush = function (live, reason) {
    const tac = live.tac; if (!tac) return false;
    const side = mySide(this, live), m = live.simulatedMatch, minute = Math.max(0, Math.floor(live.visibleMinute || 0)), st = stampOf(minute), tm = this.teamById(side.teamId);
    const ev = text => { (m.events = m.events || []).push({ kind: 'tactic', teamId: side.teamId, period: st.period, time: st.time, visibleAtMinute: minute, text }); live.forceUiRender = true; };
    let done = false;
    if (side.queue) {
      const q = side.queue, cfg = side.cfg; side.queue = null;
      if (q.style !== cfg.style || q.press !== cfg.press || q.phys !== cfg.phys || q.pp !== cfg.pp || q.pk !== cfg.pk) {
        setCfg(this, side, q, minute);
        ev(`Тренер «${tm ? tm.name : ''}» меняет тактику: «${STYLES[q.style].n}», давление ${q.press}, борьба ${q.phys}, большинство «${PPS[q.pp].n}», меньшинство «${PKS[q.pk || 'std'].n}»${reason ? ' (' + reason + ')' : ''}`); done = true;
      }
    }
    if (tac.slotsQ) { tac.slots = tac.slotsQ; tac.slotsQ = null; this.tacRebuildActive(live); ev(`«${tm ? tm.name : ''}»: изменения в составе на матч${reason ? ' (' + reason + ')' : ''}`); done = true; }
    if (tac.unitsQ) { tac.units = tac.unitsQ; tac.unitsQ = null; ev(`«${tm ? tm.name : ''}»: изменения в спецбригадах на матч${reason ? ' (' + reason + ')' : ''}`); done = true; }
    return done;
  };
  const STOP = new Set(['faceoff', 'icing', 'offside', 'intermission', 'timeout', 'goal', 'penalty', 'fight', 'injury']);
  const baseAdv = proto.advanceLiveMatch;
  const pending = tac => !!(tac && (tac.slotsQ || tac.unitsQ));
  if (baseAdv) proto.advanceLiveMatch = function (live) {
    const m = live && live.simulatedMatch, n0 = m && m.events ? m.events.length : 0;
    const self = this, args = arguments;
    const r = this.tacWithLive(live, () => baseAdv.apply(self, args));
    try {
      if (live.tac) {
        const us2 = mySide(this, live), evs = (m.events || []).slice(n0);
        if ((us2.queue || pending(live.tac)) && evs.some(e => e.stoppage || STOP.has(e.kind))) this.tacLiveFlush(live, 'на остановке игры');
        if (this.tacCheckForced) this.tacCheckForced(live);
      }
    } catch (e) { /* тактика не должна ронять матч */ }
    return r;
  };

  /* ---------- снятие вратаря ---------- */
  proto.tacPullDecision = function (live, m, trailingId, minute, diff) {
    const sk = skill(this, trailingId, 'ingame');
    if (live.tacManualPull && String(live.tacManualPull) === String(trailingId)) return { pull: true, at: minute, diff };
    if (this.state && String(trailingId) === String(this.state.teamId)) return { pull: minute === 57 && diff === 1, at: 58, diff };
    if (diff === 1) { const start = sk >= 75 ? 56 : sk < 50 ? 58 : 57; return { pull: minute === start, at: sk >= 75 ? 58 : 59, diff }; }
    if (diff === 2 && sk >= 85) return { pull: minute === 58, at: 59, diff };
    return { pull: false };
  };
  proto.tacPullNow = function () {
    const live = this.liveMatch; if (!live || live.finished) return false;
    const m = live.simulatedMatch, minute = Math.floor(live.visibleMinute || 0), diff = Math.abs((m.homeScore || 0) - (m.awayScore || 0));
    const my = this.state.teamId, trailing = (live.homeId === my ? (m.homeScore || 0) - (m.awayScore || 0) : (m.awayScore || 0) - (m.homeScore || 0)) < 0;
    if (!trailing || diff < 1 || diff > 2 || minute < 54 || minute >= 60 || live.pendingLateGoaliePull || live.goaliePullProcessed) return false;
    live.tacManualPull = my; return true;
  };

  /* ---------- после матча: химия, усталость от стиля ---------- */
  const baseAMD = proto.applyMatchDevelopment;
  proto.applyMatchDevelopment = function (match) {
    baseAMD.apply(this, arguments);
    if (!this.state || !match || !match.played || match.tacApplied) return;
    match.tacApplied = true;
    try {
      const mine = match.homeId === this.state.teamId || match.awayId === this.state.teamId;
      if (mine) this.tacChemAfterMatch();
      const P = this.TAC_PARAMS;
      for (const tid of [match.homeId, match.awayId]) {
        const cfg = this.tacConfig(tid); const fat = this.tacParams(cfg, tid).fat, bm = 1 - (skill(this, tid, 'bench') - 60) / 150;
        const extra = P.fatMul * fat * bm; if (!extra) continue;
        const a = this.activeSkaters(tid), W = [1.2, 1.1, .9, .7];
        (a.forwards || []).forEach((p, i) => bump(this, p, extra * W[Math.floor(i / 3)]));
        (a.defense || []).forEach((p, i) => bump(this, p, extra * [1.2, 1, .8][Math.floor(i / 2)]));
      }
    } catch (e) { /* не ломаем завершение матча */ }
  };
  function bump(app, p, v) { const d = p && app.playerDev && app.playerDev(p); if (d && typeof d.fatigue === 'number') d.fatigue = clamp(d.fatigue + v, 0, 100); }

  /* краткая сводка по матчу для Матч-центра */
  proto.tacSummary = function (match) {
    const t = match && (match.tac || (this.liveMatch && this.liveMatch.matchId === match.id && this.liveMatch.tac && {
      h: { style: this.liveMatch.tac.h.base.style, last: this.liveMatch.tac.h.cfg.style, changes: this.liveMatch.tac.h.changes },
      a: { style: this.liveMatch.tac.a.base.style, last: this.liveMatch.tac.a.cfg.style, changes: this.liveMatch.tac.a.changes } }));
    return t || null;
  };
  const baseComplete = proto.completeLiveMatch;
  if (baseComplete) proto.completeLiveMatch = function (live) {
    try {
      if (live && live.tac) {
        const mk = s => ({ style: s.base.style, last: s.cfg.style, press: s.cfg.press, phys: s.cfg.phys, pp: s.cfg.pp, changes: s.changes });
        const tac = { h: mk(live.tac.h), a: mk(live.tac.a) };
        live.simulatedMatch.tac = tac;
        const target = this.state.matches.find(x => x.id === live.matchId); if (target) target.tac = tac;
      }
    } catch (e) { /* без сводки */ }
    const self = this, args = arguments;
    const r = this.tacWithLive(live, () => baseComplete.apply(self, args));
    if (this.state) this.state.preMatchTac = null;
    return r;
  };
  const baseSim = proto.simulateMatch;
  if (baseSim) proto.simulateMatch = function (match) {
    const r = baseSim.apply(this, arguments);
    if (match && this.state && (match.homeId === this.state.teamId || match.awayId === this.state.teamId) && match.played) this.state.preMatchTac = null;
    return r;
  };
})();
