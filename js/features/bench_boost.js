/* KHL Manager 9.6.0 — «Усиленные тренировки» для запасных.
   Запасной игрок, которого тренер перевёл в этот режим, растёт почти как основной (≈85%).
   До 6 игроков одновременно; при выходе в состав режим снимается, при травме и высокой усталости не действует. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const MAX = 6, GROWTH_PER_DAY = 0.21, SKILL_ALL = 0.045, SKILL_FOCUS = 0.17, FATIGUE_PER_DAY = 2.0, FATIGUE_STOP = 80;
  const $ = id => document.getElementById(id);

  proto.benchBoostMax = () => MAX;
  proto.lineupIds = function () { return new Set(Object.values((this.state && this.state.slotAssignments) || {}).filter(Boolean)); };
  proto.benchBoostPlayers = function () {
    if (!this.state) return [];
    return this.teamPlayers(this.state.teamId).filter(p => { const d = this.playerDev(p); return d && d.boost; });
  };
  proto.benchBoostState = function (p) {
    const d = this.playerDev(p); if (!d) return { can: false, on: false, reason: '' };
    const on = !!d.boost, inLineup = this.lineupIds().has(p.id), hurt = !!this.isPlayerUnavailable(p) || !!d.injury;
    const used = this.benchBoostPlayers().length;
    let reason = '';
    if (inLineup) reason = 'Игрок в заявке на матч: режим доступен только запасным.';
    else if (hurt && !on) reason = 'Игрок травмирован.';
    else if (!on && used >= MAX) reason = `Уже занято ${used} из ${MAX} мест.`;
    return { can: !reason, on, reason, used, inLineup, hurt };
  };
  proto.setBenchBoost = function (playerId, on) {
    if (!this.state) return;
    const p = this.db.players.find(x => x.id === playerId), d = p && this.playerDev(p); if (!d) return;
    if (!on) delete d.boost;
    else { const s = this.benchBoostState(p); if (!s.can) { this.setNotice && this.setNotice(s.reason); return; } d.boost = true; }
    this.persistQuietly && this.persistQuietly();
    this.renderDevelopment && this.renderDevelopment();
  };

  const _adv = proto.advancePlayerDays;
  proto.advancePlayerDays = function (days) {
    const r = _adv.apply(this, arguments);
    if (!this.state || !(Number(days) > 0)) return r;
    const n = Math.min(400, Math.max(1, Math.round(Number(days))));
    try {
      const inLineup = this.lineupIds();
      for (const p of this.teamPlayers(this.state.teamId)) {
        const d = this.playerDev(p); if (!d || !d.boost) continue;
        if (inLineup.has(p.id)) { delete d.boost; continue; }       // вышел в состав — режим снят
        if (d.injury || this.isPlayerUnavailable(p)) continue;        // травма: усиленных тренировок нет
        if ((d.fatigue || 0) >= FATIGUE_STOP) continue;               // слишком устал
        d.growthXP = (d.growthXP || 0) + n * GROWTH_PER_DAY * (d.profileRate || 1);
        if (d.training === 'balanced') Object.keys(d.skills || {}).forEach(k => { d.skillXP[k] = (d.skillXP[k] || 0) + n * SKILL_ALL; });
        else { const key = this.trainingSkill(d.training); if (key) d.skillXP[key] = (d.skillXP[key] || 0) + n * SKILL_FOCUS; }
        d.fatigue = Math.min(100, (d.fatigue || 0) + n * FATIGUE_PER_DAY);
        this.resolvePlayerProgress(p, d);
      }
    } catch (e) { console.warn('KHL Manager 9.6 bench boost:', e); }
    return r;
  };

  /* ---- интерфейс: блок в раскрытой строке игрока ---- */
  const _details = proto.devDetails;
  proto.devDetails = function (p, d, f) {
    const html = _details.apply(this, arguments);
    try {
      const s = this.benchBoostState(p); if (s.inLineup) return html;
      const sw = (on, label, act) => `<button type="button" class="dv-sw${on ? ' on' : ''}" ${act ? `onclick="app.setBenchBoost('${p.id}',${act === 'on'})"` : 'disabled'}>${label}</button>`;
      const capped = this.permanentOVR(p) >= d.potential;
      const hint = capped ? 'У игрока нет запаса роста до потенциала, усиленные тренировки почти ничего не дадут. Лучше занять место молодым.' : s.on ? 'Рост почти как у основного игрока. Усталость выше, чем у остальных запасных. Режим снимется, когда игрок попадёт в состав.' : (s.reason || 'Рост почти как у основного, но усталость выше. Не более ' + MAX + ' игроков.');
      const box = `<div class="dv-boost"><b>⚡ Режим запасного</b><span class="small muted">Занято ${s.used} из ${MAX}</span><div class="dv-swrow">${sw(!s.on, 'Обычный', s.on ? 'off' : null)}${sw(s.on, 'Усиленные тренировки', !s.on && s.can ? 'on' : null)}</div><div class="small muted">${hint}</div></div>`;
      return html.replace('<div class="dv-more">', '<div class="dv-more">' + box);
    } catch (e) { return html; }
  };
})();
