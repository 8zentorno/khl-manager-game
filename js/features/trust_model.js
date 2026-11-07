/* KHL Manager 8.28.0 — доверие руководства: результат против ожиданий, цель клуба, плей-офф; сообщения совета директоров в новостях. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const K = 2.4, START = 60, OTL_VALUE = 0.35;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ZONES = [
    { max: 20, name: 'Под угрозой', cls: 'bad' }, { max: 40, name: 'Недовольство', cls: 'warn' },
    { max: 70, name: 'Спокойно', cls: 'calm' }, { max: 101, name: 'Полное доверие', cls: 'good' }];
  proto.trustZoneOf = function (v) { const i = ZONES.findIndex(z => v < z.max); return { i, ...ZONES[i] }; };

  proto.ensureTrust = function () {
    const s = this.state; if (!s) return null;
    if (!s.trust) s.trust = { value: START, done: {}, streakW: 0, streakL: 0, reg: 0, log: [], zone: this.trustZoneOf(START).i };
    return s.trust;
  };

  const BOARD = {
    0: ['Совет директоров обеспокоен', 'Руководство клуба недовольно результатами и ждёт перелома. Доверие упало до {v} из 100.'],
    1: ['У руководства появились вопросы к тренеру', 'Совет директоров отмечает, что команда играет ниже ожиданий. Доверие: {v} из 100.'],
    2: ['Руководство клуба снова спокойно', 'Совет директоров доволен тем, как команда выправила игру. Доверие: {v} из 100.'],
    3: ['Полное доверие совета директоров', 'Руководство клуба высоко оценивает работу тренерского штаба. Доверие: {v} из 100.']
  };

  proto.trustAdd = function (d, why) {
    const t = this.ensureTrust(); if (!t || !Number.isFinite(d) || Math.abs(d) < 0.005) return;
    const before = t.value;
    t.value = clamp(t.value + d, 0, 100);
    const real = t.value - before;
    t.log.push({ d: real, why, day: this.state.dayIndex || 0 });
    if (t.log.length > 40) t.log.shift();
    const z = this.trustZoneOf(t.value).i;
    if (z !== t.zone) {
      const up = z > t.zone; t.zone = z; t.cross = (t.cross || 0) + 1;
      const [headline, body] = BOARD[z];
      try {
        this.publishNews({ key: `board:${t.cross}:${z}`, category: 'press', icon: up ? '📈' : '📉', tag: 'Совет директоров', headline, body: body.replace('{v}', Math.round(t.value)), dateOffset: this.state.dayIndex || 0, teamIds: [this.state.teamId], scope: 'club' });
      } catch (e) { /* новости не должны ломать расчёт */ }
    }
  };

  // Ожидаемый шанс победы в матче. Для большого числа необработанных матчей (старое сохранение) — быстрая оценка.
  proto.trustExpectedWin = function (m, fast) {
    const my = this.state.teamId;
    if (!fast) { const o = this.matchOdds(m, my, 300); return (o.w + o.ow) / 100; }
    const sm = this.getStrength(my).overall, so = this.getStrength(m.homeId === my ? m.awayId : m.homeId).overall;
    return clamp(0.5 + (sm - so) * 0.03 + (m.homeId === my ? 0.04 : -0.04), 0.2, 0.8);
  };

  proto.userPlayedMatches = function () {
    const my = this.state.teamId;
    return this.state.matches.filter(m => m.played && !m.cancelled && (m.homeId === my || m.awayId === my))
      .sort((a, b) => a.dateOffset - b.dateOffset || String(a.id).localeCompare(String(b.id)));
  };

  proto.processTrust = function () {
    const s = this.state; if (!s || !s.matches) return;
    const t = this.ensureTrust(), my = s.teamId;
    const pending = this.userPlayedMatches().filter(m => !t.done['m' + m.id]);
    const fast = pending.length > 8;
    for (const m of pending) {
      t.done['m' + m.id] = 1;
      const mine = m.homeId === my, g = mine ? m.homeScore : m.awayScore, o = mine ? m.awayScore : m.homeScore;
      const win = g > o, otl = !win && (m.ot || m.so) && !m.overtimeEmptyNet;
      const res = win ? 1 : otl ? OTL_VALUE : 0;
      const p = this.trustExpectedWin(m, fast);
      this.trustAdd(K * (res - p), `${win ? 'Победа' : 'Поражение'} (ожидали ${Math.round(p * 100)}%)`);
      if (win) { t.streakW++; t.streakL = 0; if (t.streakW >= 5) { t.streakW = 0; this.trustAdd(2, 'Пять побед подряд'); } }
      else { t.streakL++; t.streakW = 0; if (t.streakL >= 5) { t.streakL = 0; this.trustAdd(-3, 'Пять поражений подряд'); } }
      if (!m.playoff) {
        t.reg = (t.reg || 0) + 1;
        if (t.reg % 10 === 0) {
          const conf = String(this.teamById(my).conf || '').toLowerCase();
          const place = this.standingsFor(conf).findIndex(x => x.id === my) + 1, exp = this.objectivePowerRank ? this.objectivePowerRank() : place;
          this.trustAdd(clamp((exp - place) * 1.5, -6, 6), `Место ${place} при ожидаемом ${exp}`);
        }
      }
    }
    this.processTrustSeason(t, my);
  };

  proto.processTrustSeason = function (t, my) {
    const s = this.state, po = s.playoff || {};
    if (po.started && !t.done.q) {
      const first = (po.series || []).concat(...(po.history || []).map(h => h.series || []));
      const stage1 = first.filter(x => Number(x.stage) === 1);
      if (stage1.length) { t.done.q = 1; this.trustAdd(stage1.some(x => x.teamA === my || x.teamB === my) ? 4 : -12, stage1.some(x => x.teamA === my || x.teamB === my) ? 'Выход в плей-офф' : 'Мимо плей-офф'); }
    }
    const all = [...(po.history || []), ...(po.series && po.series.length ? [{ series: po.series }] : [])];
    for (const st of all) for (const x of (st.series || [])) {
      if (!x.winnerId || (x.teamA !== my && x.teamB !== my) || t.done['s' + x.id]) continue;
      t.done['s' + x.id] = 1;
      if (x.winnerId === my) this.trustAdd(5, 'Серия выиграна');
      else if (this.objectivePower(x.winnerId) < this.objectivePower(my)) this.trustAdd(-4, 'Вылет от более слабого');
    }
    if (po.championId === my && !t.done.cup) { t.done.cup = 1; this.trustAdd(25, 'Кубок Гагарина'); }
    const obj = s.teamObjective;
    if (obj && obj.evaluated && !t.done.obj) { t.done.obj = 1; this.trustAdd(obj.completed ? 8 : -8, obj.completed ? 'Цель клуба выполнена' : 'Цель клуба провалена'); }
  };

  const _render = proto.renderAll;
  proto.renderAll = function () {
    const r = _render.apply(this, arguments);
    if (this.state) { try { this.processTrust(); } catch (e) { /* доверие не должно ломать игру */ } }
    return r;
  };
})();
