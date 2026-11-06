/* KHL Manager 10.1.0 — своя цель игрока на сезон.
   Тип цели выбирается как раньше, число можно менять стрелками: от 1 до 2,5× рекомендуемого (рост рейтинга: до 6).
   Награда зависит от трудности: цель до 75 % рекомендуемой — лёгкая, свыше 125 % — сложная. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const REW = { easy: { label: 'лёгкая', morale: 3, exp: 10, xp: 2 }, mid: { label: 'обычная', morale: 7, exp: 20, xp: 4 }, hard: { label: 'сложная', morale: 10, exp: 30, xp: 6 } };

  const baseMake = proto.makePlayerGoal;
  proto.makePlayerGoal = function (p, type) {
    const g = baseMake.apply(this, arguments);
    if (g && g.type !== 'none') g.rec = g.target;
    return g;
  };
  proto.goalRec = function (p, g) {
    if (!g || g.type === 'none') return 0;
    if (g.rec > 0) return g.rec;
    try { const f = baseMake.call(this, p, g.type); return f.target || g.target; } catch (e) { return g.target; }
  };
  proto.goalLimits = function (p, g) {
    const rec = this.goalRec(p, g);
    return { rec, min: 1, max: g.type === 'growth' ? 6 : Math.max(rec, Math.round(rec * 2.5)) };
  };
  proto.goalTier = function (p, g) {
    const r = g.target / Math.max(1, this.goalRec(p, g));
    return r <= 0.75 ? 'easy' : r > 1.25 ? 'hard' : 'mid';
  };
  proto.setGoalTarget = function (playerId, value) {
    if (!this.state) return;
    const p = this.db.players.find(x => x.id === playerId); if (!p || p.teamId !== this.state.teamId) return;
    const d = this.playerDev(p), g = d && d.goal; if (!g || g.type === 'none' || g.achieved) return;
    const lim = this.goalLimits(p, g);
    g.rec = lim.rec; g.target = clamp(Math.round(Number(value) || lim.rec), lim.min, lim.max);
    g.auto = false; g.custom = g.target !== lim.rec;
    this.checkPlayerObjective(p);
    this.persistQuietly && this.persistQuietly(); this.renderDevelopment();
  };
  proto.adjustGoal = function (playerId, delta) {
    const p = this.db.players.find(x => x.id === playerId), d = p && this.playerDev(p), g = d && d.goal; if (!g) return;
    this.setGoalTarget(playerId, g.target + delta);
  };
  proto.resetGoalTarget = function (playerId) {
    const p = this.db.players.find(x => x.id === playerId), d = p && this.playerDev(p), g = d && d.goal; if (!g) return;
    this.setGoalTarget(playerId, this.goalRec(p, g));
  };

  // награда по трудности цели
  proto.checkPlayerObjective = function (p) {
    const d = this.playerDev(p), g = d && d.goal;
    if (!d || !g || g.type === 'none' || g.achieved) return;
    if (this.playerGoalValue(p, d) >= g.target) {
      const r = REW[this.goalTier(p, g)];
      g.achieved = true; g.tier = this.goalTier(p, g);
      d.morale = clamp(d.morale + r.morale, 0, 100); d.experience = (d.experience || 0) + r.exp; d.growthXP = (d.growthXP || 0) + r.xp;
    }
  };

  // интерфейс: число цели рядом с выбором типа
  const baseDetails = proto.devDetails;
  proto.devDetails = function (p, d, f) {
    let h = baseDetails.apply(this, arguments);
    try {
      const g = d.goal; if (!g || g.type === 'none') return h;
      const lim = this.goalLimits(p, g), tier = REW[this.goalTier(p, g)], done = !!g.achieved, id = p.id;
      const ctl = `<div class="dev-control gl-ctl"><label>Значение цели</label><div class="gl-row"><div class="gl-stp"><button type="button" aria-label="Меньше" ${done || g.target <= lim.min ? 'disabled' : ''} onclick="app.adjustGoal('${id}',-1)">−</button><output>${g.target}</output><button type="button" aria-label="Больше" ${done || g.target >= lim.max ? 'disabled' : ''} onclick="app.adjustGoal('${id}',1)">+</button></div><span class="gl-rec">рекомендуем ${lim.rec}</span>${!done && g.target !== lim.rec ? `<button type="button" class="btn btn-quiet gl-reset" onclick="app.resetGoalTarget('${id}')">Сбросить</button>` : ''}</div><div class="small muted">${done ? 'Цель выполнена.' : `${tier.label[0].toUpperCase() + tier.label.slice(1)} цель · награда: мораль +${tier.morale}, опыт +${tier.exp}`}</div></div>`;
      h = h.replace(/(<label>Цель на сезон<\/label><select[\s\S]*?<\/select><\/div>)/, '$1' + ctl);
    } catch (e) { console.warn('player_goals', e); }
    return h;
  };
})();
