/* 14.7.8: лечение сохранений, испорченных ошибкой записи матча плей-офф (нули в таблице у двух клубов серии,
   статистика сезона подменена статистикой плей-офф). Причина устранена в game.js; здесь — восстановление уже испорченных сохранений.
   Таблица пересчитывается по сыгранным матчам регулярного чемпионата (так же считается обычная таблица),
   статистика игроков — по журналу матчей (state.plog; не восстанавливаются только броски игроков). */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const blank = () => ({ gp: 0, g: 0, a: 0, pts: 0, shots: 0, plusMinus: 0, goalieGP: 0, goalieW: 0, goalieShots: 0, goalieSaves: 0, goalieGA: 0, shutouts: 0 });

  proto.standingsFromMatches = function (tid) {
    const r = { gp: 0, w: 0, l: 0, otl: 0, sol: 0, pp: 0, pts: 0, gf: 0, ga: 0, regw: 0, otw: 0, sow: 0 };
    (this.state.matches || []).forEach(m => {
      if (m.playoff || !m.played || m.cancelled || (m.homeId !== tid && m.awayId !== tid)) return;
      const home = m.homeId === tid, gf = home ? m.homeScore : m.awayScore, ga = home ? m.awayScore : m.homeScore;
      r.gp++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.w++; if (m.so) r.sow++; else if (m.ot) r.otw++; else r.regw++; }
      else if (m.so) r.sol++; else if (m.ot) r.otl++; else r.l++;
    });
    r.pts = 2 * r.w + r.otl + r.sol;
    return r;
  };

  // у каждого игрока клуба/лиги должна быть строка статистики и в чемпионате, и в плей-офф (подписанные позже начала сезона
  // игроки раньше её не получали — карточка падала с «Cannot read properties of undefined (reading 'pts')»)
  proto.ensureStatEntries = function () {
    const st = this.state; if (!st) return 0;
    let n = 0;
    const fix = obj => { if (!obj) return; for (const p of this.db.players || []) if (!obj[p.id]) { obj[p.id] = blank(); n++; } };
    fix(st.playerStats);
    if (st.playoff) { if (!st.playoff.playerStats) st.playoff.playerStats = {}; fix(st.playoff.playerStats); }
    return n;
  };

  proto.repairPlayoffSwap = function () {
    const st = this.state; if (!st || !st.playoff || !st.playoff.started || st.repairV148) return null;
    st.repairV148 = true;
    const done = [];
    // 1) таблица: клубы с нулевой строкой при сыгранных матчах регулярного чемпионата
    (this.db.teams || []).forEach(t => {
      const s = st.standings[t.id];
      if (s && !(s.gp > 0)) {
        const r = this.standingsFromMatches(t.id);
        if (r.gp > 0) { st.standings[t.id] = r; done.push(t.id); }
      }
    });
    // 2) статистика игроков: если «обычная» совпала со статистикой плей-офф — это подмена
    let ps = false;
    const A = st.playerStats, B = st.playoff.playerStats;
    if (A && B && (A === B || (() => {
      const ids = Object.keys(A).filter(id => (A[id].gp || 0) > 0).slice(0, 40); if (!ids.length) return false;
      return ids.every(id => B[id] && A[id].gp === B[id].gp && A[id].g === B[id].g && A[id].a === B[id].a && A[id].shots === B[id].shots);
    })())) {
      const R = {}; Object.keys(A).forEach(id => { R[id] = blank(); }); (this.db.players || []).forEach(p => { if (!R[p.id]) R[p.id] = blank(); });
      const j = (st.plog && st.plog.j) || {};
      if (Object.keys(j).length) {
        // журнал матчей игрока хранит каждую сыгранную игру регулярного чемпионата: игры, голы, передачи, вратари
        Object.keys(j).forEach(id => {
          const x = R[id]; if (!x) return;
          (j[id] || []).forEach(r => {
            if (r[5] & 8) return;
            x.gp++; x.g += r[6] || 0; x.a += r[7] || 0; x.plusMinus += r[8] || 0; x.toi = (x.toi || 0) + (r[9] || 0); x.pim = (x.pim || 0) + (r[10] || 0);
            if (r.length > 11) { x.goalieGP++; const sa = r[11] || 0, sv = r[12] || 0; x.goalieShots += sa; x.goalieSaves += sv; x.goalieGA += Math.max(0, sa - sv); if (r[3] > r[4]) x.goalieW++; if (r[4] === 0) x.shutouts++; }
          });
        });
      } else {
        (st.matches || []).forEach(m => {
          if (m.playoff || !m.played) return;
          (m.events || []).forEach(e => {
            if (e.kind !== 'goal') return;
            if (e.scorerId && R[e.scorerId]) R[e.scorerId].g++;
            [e.assist1Id, e.assist2Id].forEach(x => { if (x && R[x]) R[x].a++; });
          });
        });
      }
      Object.values(R).forEach(x => { x.pts = x.g + x.a; });
      st.playerStats = R; if (A === B) st.playoff.playerStats = Object.assign({}, B);
      ps = true;
    }
    if (done.length || ps) {
      try { this.persistQuietly && this.persistQuietly(); } catch (e) { }
      return { teams: done, players: ps };
    }
    return null;
  };


  /* 14.7.8 (сборка 7): финальную серию мог закрыть аудит при отрисовке раньше recordPlayoffResult — тогда блок
     «Кубок завершён» не выполнялся (нет чемпиона, окна итогов и оценки цели). Страховка завершает Кубок по закрытому финалу. */
  proto.poFinalizeCup = function () {
    const st = this.state, po = st && st.playoff;
    if (!po || !po.started || po.completed || !this.__poAllSeries723) return false;
    const fin = this.__poAllSeries723(4).find(s => s && s.complete && s.winnerId);
    if (!fin) return false;
    po.completed = true; po.championId = fin.winnerId; st.seasonFinished = true;
    for (const m of st.matches) if (m.playoff && !m.played && !m.cancelled) { m.cancelled = true; m.played = true; }
    try { if (!st.teamObjective?.evaluated && this.evaluateTeamObjective) this.evaluateTeamObjective(); } catch (e) { console.warn('finalize objective', e); }
    try { if (st.playoffObjective?.selected && !st.playoffObjective.evaluated && po.championId === st.teamId && this.evaluatePlayoffObjective) this.evaluatePlayoffObjective(true, 'Команда выиграла Кубок Гагарина!'); } catch (e) { console.warn('finalize po objective', e); }
    try { if (this.poSyncObjective) this.poSyncObjective(); } catch (e) { }
    try { if (this.setNotice) this.setNotice(`🏆 ${(this.teamById(po.championId) || {}).name || 'Клуб'} — обладатель Кубка Гагарина!`); } catch (e) { }
    try { this.persistQuietly && this.persistQuietly(); } catch (e) { }
    return true;
  };
  const _rpr = proto.recordPlayoffResult;
  if (typeof _rpr === 'function') proto.recordPlayoffResult = function () {
    const r = _rpr.apply(this, arguments);
    try { this.poFinalizeCup(); } catch (e) { console.warn('finalize cup', e); }
    return r;
  };

  const _ra = proto.renderAll;
  proto.renderAll = function () {
    try {
      const r = this.repairPlayoffSwap();
      this.poFinalizeCup();
      this.ensureStatEntries();
      if (this.state) this.state.build = (typeof KHL_BUILD !== 'undefined' ? KHL_BUILD : this.state.build);
      if (r && this.setNotice) this.setNotice('Сохранение исправлено: таблица регулярного чемпионата восстановлена' + (r.players ? '; статистика игроков за регулярный сезон восстановлена по журналу матчей (кроме бросков)' : '') + '.');
    } catch (e) { console.warn('KHL 14.7.8 repair:', e); }
    return _ra.apply(this, arguments);
  };

  /* 14.7.8: матчи плей-офф, сыгранные «за кадром», не попадали в журнал игрока (в карточке пустой список матчей плей-офф).
     Журнал пишется после всех надстроек над симуляцией, когда счёт и события окончательны. */
  const _spg = proto.simulatePlayoffGame;
  if (typeof _spg === 'function') proto.simulatePlayoffGame = function (match) {
    const was = !!(match && match.played);
    const r = _spg.apply(this, arguments);
    try {
      const m = r || match;
      if (!was && m && m.played && m.playoff && !m.plogDone && this.recordMatchLog && this.activeSkaters) {
        this.recordMatchLog(m, this.activeSkaters(m.homeId), this.activeSkaters(m.awayId));
      }
    } catch (e) { console.warn('KHL 14.7.8 plog playoff:', e); }
    return r;
  };
})();
