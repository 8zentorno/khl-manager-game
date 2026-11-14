/* KHL Manager 8.8 — meaningful development: skills, goals, dynamic potential, neutral season start.
 *  - Every player starts the season neutral: form 50, morale 60, fatigue 0  =>  dynamic OVR == permanent OVR.
 *  - Skill gains (vs. the start of the season) change the dynamic rating, so pass / skating / endurance matter too.
 *  - Focused training grows its skill 1.6x faster; players aged 29+ learn slower.
 *  - Goal reached: morale +12, form +6, faster growth. Falling behind the goal's pace lowers morale, staying ahead raises it.
 *  - Potential is dynamic: good form of a young player raises it (at most +4 over the start), sitting out lowers it (at most -3).
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const W = {
    F: { shooting: .10, passing: .12, skating: .10, stamina: .05, defense: .02 },
    D: { defense: .10, passing: .08, skating: .08, stamina: .05, shooting: .02 },
    G: { goalkeeping: .10 }
  };
  const FOCUS_MUL = 1.6, MORALE_EXTRA = .02;

  function ext(d) {
    if (!d.sb) d.sb = Object.assign({}, d.skills);
    if (!d.sxs) d.sxs = Object.assign({}, d.skillXP);
    if (d.pot0 == null) d.pot0 = d.potential;
    if (d.potXP == null) d.potXP = 0;
    if (d.gpSeen == null) d.gpSeen = d.gamesPlayed || 0;
    return d;
  }
  const group = p => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');

  /* neutral start for every new development record */
  const baseCreate = proto.createPlayerDevelopment;
  proto.createPlayerDevelopment = function (p) {
    const d = baseCreate.call(this, p);
    d.form = 50; d.morale = 60; d.fatigue = 0;
    /* 13.0: навыки зафиксированы в базе (p.skills); без поля считаются от OVR, как раньше */
    if (p && p.skills && d.skills) { for (const k in d.skills) if (p.skills[k] != null) d.skills[k] = p.skills[k]; }
    return d;
  };

  /* dynamic rating: skill gains + stronger morale */
  const baseEff = proto.effectiveOVR;
  proto.effectiveOVR = function (p) {
    const v = baseEff.call(this, p);
    if (!p || !this.state) return v;
    const d = this.playerDev(p);
    if (!d || !d.skills) return v;
    ext(d);
    const w = W[group(p)];
    let b = ((d.morale == null ? 60 : d.morale) - 60) * MORALE_EXTRA;
    for (const k in w) b += ((d.skills[k] || 0) - (d.sb[k] == null ? d.skills[k] || 0 : d.sb[k])) * w[k];
    return clamp(v + b, 42, 99);
  };

  /* training speed: focus skill x1.6, age slows learning */
  const baseResolve = proto.resolvePlayerProgress;
  proto.resolvePlayerProgress = function (p, d, matchPlayed) {
    ext(d);
    const age = this.playerAge(p);
    const af = age < 23 ? 1 : age < 29 ? .85 : age < 33 ? .6 : .4;
    const focus = this.trainingSkill(d.training);
    for (const k of Object.keys(d.skillXP || {})) {
      const inc = (d.skillXP[k] || 0) - (d.sxs[k] || 0);
      if (inc > 0) d.skillXP[k] += inc * (af * (k === focus ? FOCUS_MUL : 1) - 1);
    }
    baseResolve.call(this, p, d, matchPlayed);
    d.sxs = Object.assign({}, d.skillXP);
  };

  proto.teamSeasonGames = function (teamId) {
    const ms = this.state.matches;
    if (!this._tsg || this._tsg.n !== ms.length || this._tsg.s !== this.state) this._tsg = { n: ms.length, s: this.state, v: {} };
    if (this._tsg.v[teamId] == null) this._tsg.v[teamId] = ms.filter(m => !m.playoff && (m.homeId === teamId || m.awayId === teamId)).length || 1;
    return this._tsg.v[teamId];
  };

  /* after each match: goal pace -> morale, performance -> potential */
  const baseAMD = proto.applyMatchDevelopment;
  proto.applyMatchDevelopment = function (match) {
    baseAMD.apply(this, arguments);
    if (!this.state || !match || !match.developmentApplied || match.devExtApplied) return;
    match.devExtApplied = true;
    for (const teamId of [match.homeId, match.awayId]) {
      const gp = (this.state.standings[teamId] || {}).gp || 0, total = this.teamSeasonGames(teamId), prog = Math.min(1, gp / total);
      for (const p of this.teamPlayers(teamId)) {
        const d = this.playerDev(p); if (!d) continue; ext(d);
        const played = (d.gamesPlayed || 0) > d.gpSeen; d.gpSeen = d.gamesPlayed || 0;
        const young = this.playerAge(p) < 29;
        if (played) {
          if (young) d.potXP += (d.form - 50) / 50 * .05;
          const g = d.goal;
          if (g && g.type !== 'none' && !g.achieved && g.target > 0 && prog >= .25) {
            const expected = g.target * prog, value = this.playerGoalValue(p, d);
            if (value < expected * .65) d.morale = clamp(d.morale - .25, 0, 100);
            else if (value >= expected) d.morale = clamp(d.morale + .15, 0, 100);
          }
        } else if (this.playerAge(p) < 25) d.potXP -= .01;
        const hi = Math.min(99, d.pot0 + 4), lo = Math.max(this.permanentOVR(p), d.pot0 - 3);
        while (d.potXP >= 1) { d.potXP -= 1; if (d.potential < hi) d.potential++; else { d.potXP = 0; } }
        while (d.potXP <= -1) { d.potXP += 1; if (d.potential > lo) d.potential--; else { d.potXP = 0; } }
      }
    }
  };

  /* ---- UI hints in the development cards ---- */
  const TRAIN_HINT = {
    balanced: 'Понемногу растут все навыки, примерно по +1 за сезон. Умеренная усталость.',
    shooting: 'Бросок растёт заметно быстрее, рост рейтинга до 25 лет быстрее в 1,35 раза. Усталость выше обычной.',
    passing: 'Пас растёт заметно быстрее, рост рейтинга до 25 лет быстрее в 1,35 раза. Усталость выше обычной.',
    skating: 'Катание растёт заметно быстрее, рост рейтинга до 25 лет быстрее в 1,35 раза. Усталость выше обычной.',
    defense: 'Оборона растёт заметно быстрее, рост рейтинга до 25 лет быстрее в 1,35 раза. Усталость выше обычной.',
    goalkeeping: 'Вратарская техника растёт заметно быстрее, рост рейтинга до 25 лет быстрее в 1,35 раза. Усталость выше обычной.',
    conditioning: 'Выносливость растёт быстрее, матчи утомляют на 12% меньше, у игроков 29+ возрастной спад медленнее.',
    recovery: 'Усталость снимается в разы быстрее и меньше травм, но навыки и рост рейтинга почти стоят.'
  };
  const baseRenderDev = proto.renderDevelopment;
  proto.renderDevelopment = function () {
    baseRenderDev.apply(this, arguments);
    if (!this.state) return;
    try {
      document.querySelectorAll('#development-list .dev-card').forEach(card => {
        const m = /setPlayerTraining\('([^']+)'/.exec(card.innerHTML);
        const p = m && this.db.players.find(x => x.id === m[1]);
        if (!p) return;
        const d = ext(this.playerDev(p));
        const sub = card.querySelector('.dev-sub');
        const trend = d.potential - d.pot0;
        if (sub && !sub.dataset.pot) {
          sub.dataset.pot = '1';
          sub.innerHTML = sub.innerHTML.replace('потенциал ' + d.potential, 'потенциал ' + d.potential + (trend > 0 ? ' <span style="color:var(--t-fg-34d399)">▲+' + trend + '</span>' : trend < 0 ? ' <span style="color:var(--t-fg-fb7185)">▼' + trend + '</span>' : ''));
          sub.title = 'Потенциал: до 25 лет меняется от игровой практики (до ±3 за сезон), 25–28 лет до ±1, с 29 лет равен постоянному рейтингу. Старт сезона: ' + d.pot0;
        }
        const ctl = card.querySelector('.dev-controls');
        if (ctl && !card.querySelector('.dev-hint')) {
          const h = document.createElement('div');
          h.className = 'dev-hint tiny muted';
          h.style.marginTop = '.4rem';
          h.textContent = (TRAIN_HINT[d.training] || '') + ' Цель: выполнение даёт мораль +8 и форму +4, отставание от графика снижает мораль.';
          ctl.insertAdjacentElement('afterend', h);
        }
      });
    } catch (e) { console.warn('KHL Manager 8.8 dev hints:', e); }
  };
})();
