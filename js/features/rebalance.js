/* KHL Manager 9.27.0 — перебалансировка развития (усталость, тренировки, форма, мораль, потенциал).
 * Файл подключается после всех слоёв и переопределяет итоговые значения. Формулы утверждены в концепте:
 *  - усталость: ежедневно f = f·(1−k) + T, в день матча + нагрузка роли × режим × выносливость; штраф рейтинга max(0, f−25)·0,10;
 *  - тренировки: скорость роста, навыки (порог 25), возрастной спад, риск травмы, влияние усталости на рост;
 *  - форма: от результативности относительно роли; мораль возвращается к 60 на 1,5% в день;
 *  - потенциал: по возрастным полосам (до 25 подвижный, 25–28 ±1, 29+ равен постоянному OVR).
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  /* ---------- параметры ---------- */
  const REG = {
    k: { balanced: .12, focus: .11, conditioning: .13, recovery: .22 },     // доля усталости, снимаемая за день
    T: { balanced: .6, focus: 1.2, conditioning: 1.3, recovery: 0 },        // нагрузка тренировки в день
    LM: { balanced: 1, focus: 1, conditioning: .88, recovery: 1 },          // множитель нагрузки матча
    load: { F1: 11, F2: 9.5, F3: 8, F4: 6.5, D1: 12.5, D2: 10.5, D3: 8, G: 13 },
    ot: { F: 1.5, D: 1.8, G: 2 },
    pen0: 25, penK: .10,
    growthMul: { balanced: 1, conditioning: .9, recovery: .45 },
    injury: { focus: 1.1, recovery: .8 },
    exp: { F1: [.30, .40], F2: [.22, .30], F3: [.14, .20], F4: [.09, .12], D1: [.10, .30], D2: [.06, .20], D3: [.04, .12], G: [0, 0] },
    moraleBase: 60, moraleReturn: .012, winM: 1.6, lossM: -1.4, playedM: .2,
    formPull: .05, winF: .8, lossF: -.7
  };
  proto.REBALANCE = REG;
  const W = {
    F: { shooting: .10, passing: .12, skating: .10, stamina: .05, defense: .02 },
    D: { defense: .10, passing: .08, skating: .08, stamina: .05, shooting: .02 },
    G: { goalkeeping: .10 }
  };
  const group = p => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');
  const cls = t => (t === 'balanced' || t === 'conditioning' || t === 'recovery') ? t : 'focus';
  const focusMul = age => (age < 25 ? 1.35 : age < 29 ? 1.15 : 1);
  const growthMul = (c, age) => c === 'focus' ? focusMul(age) : REG.growthMul[c];
  const fatGrowth = f => (f < 20 ? 1.1 : f > 70 ? .75 : 1);
  const roleKey = (app, p) => {
    if (p.pos === 'G') return 'G';
    const line = Number(app.playerLine(p)) || 4;
    return p.pos === 'D' ? 'D' + clamp(line, 1, 3) : 'F' + clamp(line, 1, 4);
  };

  /* овертайм плей-офф: нагрузка по минутам (9.40.0): нападающие .35, защитники .45, вратарь .25 за минуту */
  const OT_PER_MIN = { F: .35, D: .45, G: .25 };
  const otMinutes = match => {
    const ev = match.events || [], fin = ev.filter(e => e.kind === 'final').pop();
    if (fin && Number(fin.finalMinute) > 60) return Math.max(1, fin.finalMinute - 60.8);
    const g = ev.filter(e => e.kind === 'goal' && e.period === 'ОТ').pop();
    if (g) { const [m, s2] = String(g.time || '0:0').split(':'); return Math.max(1, Number(m) + (Number(s2) || 0) / 60); }
    return 8;
  };
  const otLoad = (match, g0) => otMinutes(match) * OT_PER_MIN[g0];
  proto.playoffOtMinutes = otMinutes;

  /* ---------- динамический рейтинг ---------- */
  proto.fatiguePenalty = function (f) { return Math.max(0, (Number(f) || 0) - REG.pen0) * REG.penK; };
  proto.ratingParts = function (p) {
    const d = this.playerDev(p);
    const perm = this.permanentOVR(p);
    if (!d) return { perm, form: 0, fatigue: 0, morale: 0, skills: 0, total: perm };
    const form = clamp(((d.form == null ? 50 : d.form) - 50) * .06, -3, 3);
    const morale = clamp(((d.morale == null ? 60 : d.morale) - 60) * .03, -1.5, 1.5);
    const fatigue = -this.fatiguePenalty(d.fatigue);
    let skills = 0;
    if (d.skills && d.sb) { const w = W[group(p)]; for (const k in w) skills += ((d.skills[k] || 0) - (d.sb[k] == null ? d.skills[k] || 0 : d.sb[k])) * w[k]; }
    return { perm, form, fatigue, morale, skills, total: clamp(perm + form + fatigue + morale + skills, 42, 99) };
  };
  proto.effectiveOVR = function (p) {
    if (!p) return 70;
    if (!this.state || !this.playerDev(p)) return Number(p.ovr) || 70;
    return this.ratingParts(p).total;
  };

  /* ---------- прогресс: скорость роста и навыков ---------- */
  const baseResolve = proto.resolvePlayerProgress;
  proto.resolvePlayerProgress = function (p, d, matchPlayed) {
    try {
      const age = this.playerAge(p), c = cls(d.training);
      if (d.gxs == null) d.gxs = d.growthXP || 0;
      const inc = (d.growthXP || 0) - d.gxs;
      if (inc > 0) {
        let s;
        if (matchPlayed) s = growthMul(c, age) / (c === 'conditioning' ? .72 / .88 : c === 'recovery' ? .55 / .88 : 1);
        else s = .16 * growthMul(c, age) / (c === 'recovery' ? .07 : c === 'conditioning' ? .13 : c === 'balanced' ? .16 : .20);
        s *= fatGrowth(d.fatigue || 0);
        d.growthXP += inc * (s - 1);
      }
      if (!d.sxr) d.sxr = Object.assign({}, d.skillXP);
      const focus = this.trainingSkill(d.training);
      for (const k of Object.keys(d.skillXP || {})) {
        const i2 = (d.skillXP[k] || 0) - (d.sxr[k] == null ? d.skillXP[k] : d.sxr[k]);
        if (i2 > 0) d.skillXP[k] += i2 * ((d.training === 'balanced' ? 1.7 : k === focus ? 1.5 : 1.2) - 1);   // баланс: около +1 к каждому навыку за сезон; профиль заметно быстрее
      }
    } catch (e) { console.warn('KHL Manager 9.27 progress:', e); }
    const r = baseResolve.call(this, p, d, matchPlayed);
    d.gxs = d.growthXP || 0; d.sxr = Object.assign({}, d.skillXP);
    return r;
  };

  /* ---------- дни: усталость, спад, мораль ---------- */
  const baseAdv = proto.advancePlayerDays;
  proto.advancePlayerDays = function (days) {
    if (!this.state || !(Number(days) > 0)) return baseAdv.apply(this, arguments);
    const n = Math.min(400, Math.max(1, Math.round(Number(days))));
    const snap = new Map();
    for (const p of this.db.players) {
      const d = this.playerDev(p); if (!d) continue;
      snap.set(p.id, { f: Number(d.fatigue) || 0, dpd: d.declinePerDay });
      if (d.declinePerDay > 0 && this.playerAge(p) >= 29) {
        const c = cls(d.training);
        d.declinePerDay *= c === 'conditioning' ? .6 : c === 'focus' ? .85 : 1;
      }
    }
    const r = baseAdv.apply(this, arguments);
    if (!this.state) return r;
    for (const p of this.db.players) {
      const d = this.playerDev(p), s = snap.get(p.id); if (!d || !s) continue;
      d.declinePerDay = s.dpd;
      const c = cls(d.training), k = REG.k[c], T = REG.T[c] + (d.boost ? 1.2 : 0), q = Math.pow(1 - k, n);
      d.fatigue = clamp(s.f * q + T * (1 - q) / k, 0, 100);
      const pull = 1 - Math.pow(1 - REG.moraleReturn, n);
      d.morale = clamp((d.morale || 0) + (REG.moraleBase - (d.morale || 0)) * pull, 0, 100);
    }
    return r;
  };

  /* ---------- матч: нагрузка, форма, мораль, потенциал ---------- */
  const rnd = () => Math.random();
  const baseAMD = proto.applyMatchDevelopment;
  proto.applyMatchDevelopment = function (match, activeH, activeA) {
    if (!this.state || !match || match.developmentApplied) return baseAMD.apply(this, arguments);
    const snap = new Map();
    for (const tid of [match.homeId, match.awayId]) for (const p of this.teamPlayers(tid)) {
      const d = this.playerDev(p); if (!d) continue;
      snap.set(p.id, { tid, f: Number(d.fatigue) || 0, form: d.form == null ? 50 : d.form, m: d.morale, gp: d.gamesPlayed || 0, inj: !!d.injury,
        pot: d.potential, px: d.potXP || 0, role: roleKey(this, p), ach: !!(d.goal && d.goal.achieved) });
    }
    const r = baseAMD.apply(this, arguments);
    if (!match.developmentApplied || match.rebalanceApplied) return r;
    match.rebalanceApplied = true;
    const report = [];
    const winner = match.homeScore === match.awayScore ? null : match.homeScore > match.awayScore ? match.homeId : match.awayId;
    const goals = (match.events || []).filter(e => e.kind === 'goal'), gc = {}, ac = {};
    goals.forEach(e => { if (e.scorerId) gc[e.scorerId] = (gc[e.scorerId] || 0) + 1; for (const id of [e.assist1Id, e.assist2Id]) if (id) ac[id] = (ac[id] || 0) + 1; });
    for (const [pid, s] of snap) {
      const p = this.db.players.find(x => x.id === pid), d = p && this.playerDev(p); if (!d) continue;
      const win = winner === s.tid, loss = winner && winner !== s.tid;
      const played = (d.gamesPlayed || 0) > s.gp, c = cls(d.training), age = this.playerAge(p);
      /* мораль: меняем веса победы/поражения и игрового времени */
      d.morale = clamp((d.morale || 0) + (win ? REG.winM - 1.15 : loss ? REG.lossM + .7 : 0) + (played ? REG.playedM - .25 : 0), 0, 100);
      if (!s.inj) {
        if (played) {
          const shotsAgainst = s.tid === match.homeId ? (match.awayShots || 0) : (match.homeShots || 0);
          const goalsAgainst = goals.filter(e => e.teamId !== s.tid).length;
          const st = this.playerSkill(p, 'stamina'), sf = clamp(1 - (st - 70) * .004, .8, 1.15), g0 = s.role[0];
          let load = REG.load[s.role] + (match.ot ? (match.playoff ? otLoad(match, g0) : REG.ot[g0]) : 0);
          if (g0 === 'G') load += Math.max(0, shotsAgainst - 28) * .11;
          d.fatigue = clamp(s.f + load * REG.LM[c] * sf, 0, 100);
          if (s.tid === this.state.teamId) report.push({ id: pid, name: p.name, pos: p.pos, before: Math.round(s.f), after: Math.round(d.fatigue) });
          const ex = REG.exp[s.role], exp = 4 * ex[0] + 2 * ex[1];
          const pts = (gc[pid] || 0) * 4 + (ac[pid] || 0) * 2;
          let perf = g0 === 'G' ? 0 : 1.1 * (pts - exp);
          if (g0 === 'G') { const sv = shotsAgainst > 0 ? 1 - goalsAgainst / shotsAgainst : .92; perf += (sv >= .93 ? 2 : sv < .86 ? -2 : 0); }
          perf += win ? REG.winF : loss ? REG.lossF : 0;
          perf += (rnd() - .5) * .8;
          d.form = clamp(s.form + perf - (s.form - 50) * REG.formPull, 15, 100);
        } else {
          d.form = clamp(s.form + (50 - s.form) * REG.formPull, 15, 100);
        }
        if (d.goal && d.goal.achieved && !s.ach) d.form = clamp(d.form + 4, 15, 100);
      }
      /* потенциал по возрастным полосам */
      d.potential = s.pot; d.potXP = s.px;
      if (d.pot0 == null) d.pot0 = s.pot;
      if (age < 29) {
        const cap = age < 25 ? 3 : 1, rate = age < 25 ? .04 : .015;
        if (played) { if (d.form >= 58) d.potXP += rate; else if (d.form <= 42) d.potXP -= rate; }
        else d.potXP -= age < 23 ? .03 : age < 25 ? .015 : 0;
        const hi = Math.min(99, d.pot0 + cap), lo = Math.max(this.permanentOVR(p), d.pot0 - cap);
        while (d.potXP >= 1) { d.potXP -= 1; if (d.potential < hi) d.potential++; else d.potXP = 0; }
        while (d.potXP <= -1) { d.potXP += 1; if (d.potential > lo) d.potential--; else d.potXP = 0; }
      }
    }
    match.fatigueReport = report;
    return r;
  };

  /* ---------- риск травмы ---------- */
  proto.injuryWeight = function (p) {
    const d = this.playerDev(p); if (!d) return 1;
    const f = Number(d.fatigue) || 0, c = cls(d.training);
    return (1 + Math.max(0, f - 60) * .015) * (REG.injury[c] || 1);
  };
  proto.injuryPick = function (pool) {
    const w = pool.map(p => this.injuryWeight(p)), sum = w.reduce((a, b) => a + b, 0);
    let x = Math.random() * sum;
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 1];
  };
  proto.injuryTeamMul = function (pool) {
    if (!pool.length) return 1;
    return pool.reduce((s, p) => s + this.injuryWeight(p), 0) / pool.length;
  };
  /* ---------- интерфейс ---------- */
  const esc = (app, x) => app.escape(String(x));
  const sg = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  const zoneCls = f => (f < 25 ? 'ok' : f < 60 ? 'mid' : f < 80 ? 'risk' : 'crit');
  const zoneName = f => (f < 25 ? 'свежий' : f < 60 ? 'рабочая зона' : f < 80 ? 'риск травмы' : 'критично');
  proto.projectedFatigue = function (p) {
    const d = this.playerDev(p); if (!d) return 0;
    const role = roleKey(this, p), sf = clamp(1 - (this.playerSkill(p, 'stamina') - 70) * .004, .8, 1.15);
    return clamp((Number(d.fatigue) || 0) + REG.load[role] * REG.LM[cls(d.training)] * sf, 0, 100);
  };
  proto.ratingBreakdownHtml = function (p) {
    const q = this.ratingParts(p), r = Math.round, S = x => (r(x) > 0 ? '+' : r(x) < 0 ? '−' : '') + Math.abs(r(x));
    const d = this.playerDev(p), f = Number(d.fatigue) || 0;
    const part = (n, v, hint) => `<span title="${hint}">${n} <b class="${r(v) > 0 ? 'up' : r(v) < 0 ? 'down' : ''}">${S(v)}</b></span>`;
    return `<div class="rb-box"><div class="rb-line"><b>Рейтинг сейчас ${r(q.total)}</b> = постоянный ${r(q.perm)} ${part('форма', q.form, 'Форма: ' + r(d.form))} ${part('мораль', q.morale, 'Мораль: ' + r(d.morale))} ${part('усталость', q.fatigue, 'Усталость ' + r(f) + '%: до 25% штрафа нет, дальше −0,1 за пункт')} ${part('навыки', q.skills, 'Прирост навыков с начала сезона')}</div>`
      + `<div class="small muted">Усталость ${r(f)}% — <span class="rb-z ${zoneCls(f)}">${zoneName(f)}</span>${f >= 60 ? '; риск травмы выше обычного' : ''}${f > 70 ? ', рост замедлен' : ''}.</div></div>`;
  };
  proto.potentialStage = function (p) {
    const d = this.playerDev(p), age = this.ageYears(p), perm = this.permanentOVR(p);
    const gap = Math.max(0, d.potential - perm), start = d.pot0 == null ? d.potential : d.pot0, trend = d.potential - start;
    if (age < 25) return { stage: 'Рост', text: `запас роста +${gap}` + (trend > 0 ? ', растёт: хорошая форма и игровая практика' : trend < 0 ? ', падает: мало игровой практики' : '') };
    if (age < 29) return { stage: 'Пик формы', text: `запас роста +${gap}` };
    if (age < 33) return { stage: 'Пик', text: 'держит уровень' };
    return { stage: 'Спад', text: 'возраст' };
  };
  const baseDetails = proto.devDetails;
  proto.devDetails = function (p, d, f) {
    let html = baseDetails.apply(this, arguments);
    try {
      const st = this.potentialStage(p);
      html = html.replace(/потенциал \d+( \([▲▼+\d−-]+\))?/, `потенциал ${d.potential} · <span class="tag-st">${st.stage}: ${st.text}</span>`);
      html = html.replace('<div class="dv-more">', '<div class="dv-more">' + this.ratingBreakdownHtml(p));
      html = html.replace(/прогресс навыка (\d+)\/30/, (m, n) => `прогресс навыка ${n}/25`);
    } catch (e) { console.warn('KHL Manager 9.27 details:', e); }
    return html;
  };

  /* Предматчевое окно: готовность состава */
  proto.fatigueReadyHtml = function () {
    const ids = [...(this.lineupIds ? this.lineupIds() : new Set())];
    const players = ids.map(id => this.db.players.find(x => x.id === id)).filter(p => p && this.playerDev(p) && !this.isPlayerUnavailable(p));
    if (!players.length) return '';
    const rows = players.map(p => { const d = this.playerDev(p), now = Number(d.fatigue) || 0, after = this.projectedFatigue(p);
      return { p, now, after, dr: -(this.fatiguePenalty(after) - this.fatiguePenalty(now)) }; }).sort((a, b) => b.after - a.after);
    const avg = k => rows.reduce((s, r) => s + r[k], 0) / rows.length;
    const tired = rows.filter(r => r.now >= 60).length;
    const top = rows.slice(0, 5).map(r => `<tr><td>${esc(this, r.p.name.split(' ').slice(-1)[0])}</td><td class="${zoneCls(r.now)}">${Math.round(r.now)}%</td><td class="${zoneCls(r.after)}">${Math.round(r.after)}%</td><td>${Math.round(r.dr) === 0 ? '0' : sg(Math.round(r.dr))}</td></tr>`).join('');
    return `<div class="pg-ready rb-ready"><div class="ln"><b>Готовность состава</b><span class="mu">сейчас ${Math.round(avg('now'))}% · после матча ≈ ${Math.round(avg('after'))}%${tired ? ` · уставших: ${tired}` : ''}</span></div>`
      + `<table class="rb-tbl"><thead><tr><th>Самые уставшие</th><th>Сейчас</th><th>После матча</th><th>Рейтинг</th></tr></thead><tbody>${top}</tbody></table></div>`;
  };
  /* 9.32.0: блок «Готовность состава» в окне подготовки больше не показывается (функция fatigueReadyHtml оставлена для тестов). */

  /* Матч-центр: итог по усталости после матча */
  proto.fatigueReportHtml = function (match) {
    const rep = match && match.fatigueReport; if (!rep || !rep.length) return '';
    const rows = rep.slice().sort((a, b) => (b.after - b.before) - (a.after - a.before)).slice(0, 6)
      .map(r => `<tr><td>${esc(this, r.name)}</td><td>${sg(r.after - r.before)}</td><td class="${zoneCls(r.after)}">${r.after}%</td></tr>`).join('');
    const avgA = Math.round(rep.reduce((s, r) => s + r.after, 0) / rep.length);
    return `<div class="rb-after"><b>Усталость после матча</b><span class="mu"> средняя ${avgA}%</span><table class="rb-tbl"><thead><tr><th>Больше всего устали</th><th>За матч</th><th>Итого</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  /* 9.32.0: отчёт об усталости под статистикой матча убран (функция fatigueReportHtml оставлена для тестов). */
})();
