/* 14.7.8: согласование спецбригад и состава на матч.
   Игрок в спецбригаде, которого нет в составе на матч (запас), — ошибка: вместо него встаёт тот, кто занял его место в составе
   (та же позиция), а если такого нет — лучший по специализации игрок той же позиции из состава, которого ещё нет в этой бригаде.
   Проверка идёт при ручной расстановке, «Рекомендуемом составе», применении спецбригад, перед стартом матча и при замене по ходу матча;
   матчи ИИ и быстрый итог защищены в specialUnitPlayers (game.js). */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const KEYS = ['pp1', 'pp2', 'pk1', 'pk2'];
  const TITLE = { pp1: 'Большинство 1', pp2: 'Большинство 2', pk1: 'Меньшинство 1', pk2: 'Меньшинство 2' };
  const FW = ['LW', 'C', 'RW'];
  const posOk = (p, slot) => slot.charAt(0) === 'F' ? FW.includes(p.pos) : p.pos === 'D';

  proto.spDressedIds = function (teamId, live) {
    const act = live ? live[teamId === live.homeId ? 'activeH' : 'activeA'] : this.activeSkaters(teamId);
    return new Set(((act && act.skaters) || []).filter(Boolean).map(p => p.id));
  };

  // Меняет units на месте, возвращает список замен [{unit, slot, outId, inId}]. opts: {live, replace:{outId:inId}}
  proto.spNormalizeUnits = function (units, teamId, opts) {
    opts = opts || {}; const changes = [];
    if (!units) return changes;
    const dressed = this.spDressedIds(teamId, opts.live);
    if (dressed.size < 10) return changes;                       // состав не собран — не вмешиваемся
    const roster = this.teamPlayers(teamId), byId = id => roster.find(p => p.id === id);
    const free = p => p && dressed.has(p.id) && !this.isPlayerUnavailable(p);
    for (const key of KEYS) {
      const unit = units[key]; if (!unit) continue;
      const kind = key.startsWith('pp') ? 'pp' : 'pk';
      const inUnit = new Set(Object.values(unit).filter(Boolean));
      for (const slot of Object.keys(unit)) {
        const id = unit[slot]; if (!id) continue;
        if (free(byId(id))) continue;
        let rep = null;
        const hp = opts.replace && opts.replace[id] ? byId(opts.replace[id]) : null;
        if (hp && free(hp) && !inUnit.has(hp.id) && posOk(hp, slot)) rep = hp;
        if (!rep) {
          rep = roster.filter(p => free(p) && !inUnit.has(p.id) && posOk(p, slot))
            .sort((a, b) => this.spPlayerMetric(b, kind) - this.spPlayerMetric(a, kind))[0] || null;
        }
        inUnit.delete(id);
        if (rep) { unit[slot] = rep.id; inUnit.add(rep.id); } else unit[slot] = '';
        changes.push({ unit: key, slot, outId: id, inId: rep ? rep.id : null });
      }
    }
    return changes;
  };

  proto.spChangeText = function (c) {
    const o = this.playerById(c.outId), i = c.inId ? this.playerById(c.inId) : null;
    return `${o ? o.name : '—'} — в запасе (или выбыл) → ${i ? 'заменён на ' + i.name : 'замены нет, слот пуст'} (${TITLE[c.unit] || c.unit})`;
  };

  // Применить к сохранённым спецбригадам клуба игрока (и к черновику в интерфейсе)
  proto.spSyncUnits = function (opts) {
    const st = this.state; if (!st || !st.specialTeams) return [];
    const tid = st.teamId, all = [];
    const run = units => { const ch = this.spNormalizeUnits(units, tid, opts); return ch; };
    const ch = run(st.specialTeams); all.push(...ch);
    if (this._specialTeamsDraft76 && this._specialTeamsDraftTeamId76 === tid) {
      // в черновике — те же замены (черновик мог отличаться от сохранённого: нормализуем его отдельно)
      run(this._specialTeamsDraft76);
    }
    if (all.length) {
      st.spNotes = all.map(c => this.spChangeText(c));
      try { this.persistQuietly && this.persistQuietly(); } catch (e) { }
    }
    return all;
  };

  const notice = (app, ch) => { if (ch && ch.length && app.setNotice) app.setNotice('Спецбригады: ' + app.spChangeText(ch[0]) + (ch.length > 1 ? ` и ещё ${ch.length - 1}` : '') + '.'); };

  // ручная расстановка
  const _assign = proto.assignSlot;
  proto.assignSlot = function (slotId, playerId) {
    const st = this.state, old = st && st.slotAssignments ? st.slotAssignments[slotId] : null;
    const r = _assign.apply(this, arguments);
    try {
      const opts = old && playerId && old !== playerId ? { replace: { [old]: playerId } } : {};
      notice(this, this.spSyncUnits(opts));
    } catch (e) { console.warn('KHL 14.7.8 spSync assign:', e); }
    return r;
  };
  // «Рекомендуемый состав»
  const _reset = proto.resetLineup;
  if (_reset) proto.resetLineup = function () {
    const r = _reset.apply(this, arguments);
    try { notice(this, this.spSyncUnits({})); } catch (e) { console.warn('KHL 14.7.8 spSync reset:', e); }
    return r;
  };
  // перед стартом матча
  const _start = proto.saveLineupAndStart;
  if (_start) proto.saveLineupAndStart = function () {
    try { this.spSyncUnits({}); } catch (e) { console.warn('KHL 14.7.8 spSync start:', e); }
    return _start.apply(this, arguments);
  };
  // «Применить» спецбригады: запасные заменяются до проверки дублей
  const _apply = proto.applySpecialTeamsDraft76;
  if (_apply) proto.applySpecialTeamsDraft76 = function () {
    try {
      const d = this.ensureSpecialTeamsDraft76 && this.ensureSpecialTeamsDraft76();
      if (d) { const ch = this.spNormalizeUnits(d, this.state.teamId, {}); if (ch.length) { this.state.spNotes = ch.map(c => this.spChangeText(c)); notice(this, ch); } }
    } catch (e) { console.warn('KHL 14.7.8 spSync apply:', e); }
    return _apply.apply(this, arguments);
  };

  // замена по ходу матча: заменённый уходит из бригад, на его место встаёт вышедший вместо него
  const _sub = proto.tacApplySub;
  if (_sub) proto.tacApplySub = function (live, pick) {
    const f = live && live.forcedSub;
    this._spHint = f && pick ? { [f.playerId]: pick.id } : null;
    try { return _sub.apply(this, arguments); } finally { this._spHint = null; }
  };
  const _rebuild = proto.tacRebuildActive;
  if (_rebuild) proto.tacRebuildActive = function (live) {
    const r = _rebuild.apply(this, arguments);
    try {
      const tid = this.state.teamId, units = live && live.tac && live.tac.units;
      if (units) {
        const ch = this.spNormalizeUnits(units, tid, { live, replace: this._spHint || {} });
        if (ch.length) {
          // то же — в сохранённые спецбригады и в черновик, чтобы расстановка в интерфейсе обновилась
          ch.forEach(c => { [this.state.specialTeams, this._specialTeamsDraft76].forEach(u => { if (u && u[c.unit] && u[c.unit][c.slot] === c.outId) u[c.unit][c.slot] = c.inId || ''; }); });
          this.state.spNotes = ch.map(c => this.spChangeText(c));
          const m = live.simulatedMatch, minute = Math.floor(live.visibleMinute || 0), t = Math.max(0, Math.min(59.98, minute)), per = Math.floor(t / 20) + 1, loc = t - (per - 1) * 20;
          (m.events = m.events || []).push({ kind: 'tactic', teamId: tid, period: per + 'П', time: String(Math.floor(loc)).padStart(2, '0') + ':00', visibleAtMinute: minute, text: 'Спецбригады: ' + ch.map(c => this.spChangeText(c)).join('; ') });
          live.forceUiRender = true;
        }
      }
    } catch (e) { console.warn('KHL 14.7.8 spSync live:', e); }
    return r;
  };

  // интерфейс спецбригад: пометка «в запасе → будет заменён на …» под каждой бригадой
  const _rep = proto.specialTeamsLiveReplacement76;
  proto.specialTeamsLiveReplacement76 = function (key, draft) {
    const base = _rep ? _rep.apply(this, arguments) : '';
    try {
      if (!draft || !draft[key]) return base;
      const clone = { [key]: Object.assign({}, draft[key]) };
      const ch = this.spNormalizeUnits(clone, this.state.teamId, {});
      if (!ch.length) return base;
      return base + `<div class="special-live-replacement"><b>⚠️ В запасе</b><br>${ch.map(c => this.escape(this.spChangeText(c).replace(' — в запасе (или выбыл) → ', ' в запасе → ').replace(/ \([^)]*\)$/, ''))).join('<br>')}<br><small>Замена произойдёт автоматически при применении или перед матчем.</small></div>`;
    } catch (e) { return base; }
  };
})();
