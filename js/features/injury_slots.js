/* KHL Manager 10.1.0 — травма на несколько матчей освобождает место в звене и в спецбригадах.
   Игрок уходит в «Недоступные», место остаётся пустым, замену выбирает игрок. Начать матч нельзя, пока пусто место,
   на которое есть здоровый кандидат (если замены физически нет, матч можно начать с меньшим составом).
   У выздоровевшего игрока, пока его место пусто, появляется кнопка «Вернуть на место». */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const UN = { pp1: 'Большинство 1', pp2: 'Большинство 2', pk1: 'Меньшинство 1', pk2: 'Меньшинство 2' };
  const isF = p => ['LW', 'C', 'RW'].includes(p.pos);
  const fits = (type, p) => type === 'F' ? isF(p) : p.pos === type;
  const sname = (a, s) => a.schemeLineSlotName ? a.schemeLineSlotName(s) : s;
  const spName = (key, slot) => `${UN[key]} (${slot[0] === 'F' ? 'Н' : 'З'}${slot.slice(1)})`;
  const clone = o => JSON.parse(JSON.stringify(o || {}));

  proto.isLongInjured = function (p) {
    const d = p && this.playerDev && this.playerDev(p);
    return !!(d && d.injury && d.injury.severity !== 'light');
  };
  const live = a => !!(a.liveMatch && !a.liveMatch.finished);

  /* ---- освобождение мест ---- */
  proto.vacateInjured = function () {
    const st = this.state; if (!st || !st.slotAssignments || live(this)) return 0;
    st.vacant = st.vacant || {}; st.vacantSp = st.vacantSp || {};
    const mine = new Map(this.teamPlayers(st.teamId).map(p => [p.id, p]));
    let n = 0;
    const slots = st.slotAssignments;
    for (const sid of Object.keys(slots)) {
      const id = slots[sid];
      if (!id) { continue; }
      const p = mine.get(id);
      if (p && this.isLongInjured(p) && this.isPlayerUnavailable(p)) { slots[sid] = ''; st.vacant[sid] = id; n++; }
    }
    for (const sid of Object.keys(st.vacant)) if (slots[sid]) delete st.vacant[sid];
    const draft = this._specialTeamsDraft76 && this._specialTeamsDraftTeamId76 === st.teamId ? this._specialTeamsDraft76 : null;
    for (const src of [st.specialTeams, draft]) {
      if (!src) continue;
      for (const key of Object.keys(UN)) {
        const u = src[key]; if (!u) continue;
        for (const slot of Object.keys(u)) {
          const p = mine.get(u[slot]);
          if (p && this.isLongInjured(p) && this.isPlayerUnavailable(p)) { u[slot] = ''; st.vacantSp[key + '.' + slot] = p.id; if (src === st.specialTeams) n++; }
        }
      }
    }
    for (const k of Object.keys(st.vacantSp)) { const [key, slot] = k.split('.'); const u = (st.specialTeams || {})[key]; if (u && u[slot]) delete st.vacantSp[k]; }
    if (n) {
      try { this.syncLineAssignmentsFromSlots(); } catch (e) { }
      try { this.persistQuietly && this.persistQuietly(); } catch (e) { }
    }
    return n;
  };

  ['completeLiveMatch', 'simulateMatch', 'switchTab'].forEach(name => {
    const base = proto[name]; if (typeof base !== 'function') return;
    proto[name] = function () {
      const r = base.apply(this, arguments);
      try { this.vacateInjured(); } catch (e) { console.warn('injury_slots', e); }
      return r;
    };
  });
  // освобождаем до отрисовки редакторов
  ['renderLineScheme', 'renderSpecialTeams'].forEach(name => {
    const base = proto[name]; if (typeof base !== 'function') return;
    proto[name] = function () { try { this.vacateInjured(); } catch (e) { } return base.apply(this, arguments); };
  });

  // загрузка сохранения: базовый ремонт заполняет пустые места, возвращаем освобождённые обратно в «пусто»
  const baseRepair = proto.repairSave;
  proto.repairSave = function () {
    const r = baseRepair.apply(this, arguments);
    try {
      const st = this.state;
      if (st && st.slotAssignments && st.vacant) for (const sid of Object.keys(st.vacant)) st.slotAssignments[sid] = '';
      if (st && st.specialTeams && st.vacantSp) for (const k of Object.keys(st.vacantSp)) { const [key, slot] = k.split('.'); if (st.specialTeams[key]) st.specialTeams[key][slot] = ''; }
      if (st && st.slotAssignments) this.syncLineAssignmentsFromSlots();
      this.vacateInjured();
    } catch (e) { console.warn('injury_slots repair', e); }
    return r;
  };

  // ручная постановка игрока или «Рекомендуемый состав» снимают отметку «освобождено»
  const baseAssign = proto.assignSlot;
  proto.assignSlot = function (slotId, playerId) {
    const r = baseAssign.apply(this, arguments);
    try { const st = this.state; if (st && st.vacant && st.slotAssignments && st.slotAssignments[slotId]) delete st.vacant[slotId]; } catch (e) { }
    return r;
  };
  const baseSp = proto.assignSpecialPlayer;
  if (typeof baseSp === 'function') proto.assignSpecialPlayer = function (unit, slot, playerId) {
    const r = baseSp.apply(this, arguments);
    try { const st = this.state, d = this._specialTeamsDraft76; if (st && st.vacantSp && d && d[unit] && d[unit][slot]) delete st.vacantSp[unit + '.' + slot]; } catch (e) { }
    return r;
  };
  ['resetLineup', 'resetSpecialTeams'].forEach(name => {
    const base = proto[name]; if (typeof base !== 'function') return;
    proto[name] = function () { const r = base.apply(this, arguments); try { if (this.state) { if (name === 'resetLineup') this.state.vacant = {}; else this.state.vacantSp = {}; } } catch (e) { } return r; };
  });

  /* ---- пустые места и допуск к матчу ---- */
  proto.emptySlotsInfo = function () {
    const st = this.state, out = [];
    if (!st || !st.slotAssignments) return out;
    const mine = this.teamPlayers(st.teamId).filter(p => !this.isPlayerUnavailable(p));
    const slots = st.slotAssignments, used = new Set(Object.values(slots).filter(Boolean));
    for (const s of this.slotDefinitions()) {
      if (slots[s.id]) continue;
      const cand = mine.some(p => !used.has(p.id) && fits(s.type, p));
      out.push({ kind: 'line', slot: s.id, label: sname(this, s.id), block: cand });
    }
    const draft = this._specialTeamsDraft76 && this._specialTeamsDraftTeamId76 === st.teamId ? this._specialTeamsDraft76 : (st.specialTeams || {});
    const inLine = new Set(Object.values(slots).filter(Boolean));
    for (const key of Object.keys(UN)) {
      const u = draft[key] || {}, slotsList = key.startsWith('pp') ? ['F1', 'F2', 'F3', 'D1', 'D2'] : ['F1', 'F2', 'D1', 'D2'];
      const here = new Set(Object.values(u).filter(Boolean));
      for (const slot of slotsList) {
        if (u[slot]) continue;
        const cand = mine.some(p => (inLine.has(p.id) || !Object.keys(slots).length) && !here.has(p.id) && (slot[0] === 'F' ? isF(p) : p.pos === 'D'));
        out.push({ kind: 'sp', key, slot, label: spName(key, slot), block: cand });
      }
    }
    return out;
  };
  proto.blockingEmpties = function () { return this.emptySlotsInfo().filter(x => x.block); };
  const emptiesLine = list => `Не заполнены места: ${list.map(x => x.label).join(', ')}. Выберите игроков из запаса.`;

  const basePg = proto.pgReadiness;
  if (typeof basePg === 'function') proto.pgReadiness = function (m) {
    const r = basePg.apply(this, arguments);
    try { r.empty = this.blockingEmpties(); if (r.empty.length) r.ok = false; } catch (e) { r.empty = []; }
    return r;
  };
  const basePgHtml = proto.pgReadinessHtml;
  if (typeof basePgHtml === 'function') proto.pgReadinessHtml = function (m) {
    let h = basePgHtml.apply(this, arguments);
    try { const e = this.blockingEmpties(); if (e.length) h = h.replace('<div class="pg-tm">', `<div class="ln"><span class="pg-bad">${this.escape(emptiesLine(e))}</span></div><div class="pg-tm">`); } catch (e) { }
    return h;
  };
  const basePgModal = proto.pgModalHtml;
  if (typeof basePgModal === 'function') proto.pgModalHtml = function (m) {
    let h = basePgModal.apply(this, arguments);
    try {
      const e = this.blockingEmpties();
      if (e.length) h = h.replace(/(<b class="pg-bad">⛑️ Нельзя начинать матч<\/b><\/div>)/, `$1<div class="ln pg-bad">${this.escape(emptiesLine(e))}</div>`);
    } catch (e) { }
    return h;
  };

  const baseStart = proto.saveLineupAndStart;
  proto.saveLineupAndStart = function () {
    if (this.state && !live(this)) {
      const m = (this.state.matches || []).find(x => x.id === (this.pendingMatchId || this.currentMatchId));
      if (m && !m.played) {
        const e = this.blockingEmpties();
        if (e.length) {
          this.setNotice && this.setNotice('Нельзя начать матч. ' + emptiesLine(e));
          this.toast && this.toast('⛑️ Не заполнены места: ' + e.length);
          if (this._pgOpen && this.renderPregame) this.renderPregame(); else if (this.switchTab) this.switchTab('roster');
          return;
        }
      }
    }
    return baseStart.apply(this, arguments);
  };

  /* 14.7.1: «Исправить состав» ведёт туда, где реально остались пустые места:
     есть дыры в звеньях → «Состав»; только в спецбригадах → «Спецбригады». */
  const basePgEdit = proto.pgEdit;
  if (typeof basePgEdit === 'function') proto.pgEdit = function () {
    let target = 'roster';
    try { const e = this.blockingEmpties(); if (e.length && !e.some(x => x.kind === 'line') && e.some(x => x.kind === 'sp')) target = 'specialteams'; } catch (err) { }
    if (target === 'roster') return basePgEdit.apply(this, arguments);
    this._pgOpen = false;
    const btn = document.querySelector('[data-view="specialteams"]');
    this.switchTab('specialteams', btn || undefined);
    if (this.renderPregame) this.renderPregame();
  };

  /* ---- «Вернуть на место» ---- */
  proto.returnToSlot = function (sid) {
    const st = this.state, id = st && st.vacant && st.vacant[sid]; if (!id) return;
    this.assignSlot(sid, id);
    if (st.slotAssignments[sid] === id) delete st.vacant[sid];
    this.persistQuietly && this.persistQuietly(); this.renderRoster && this.renderRoster(); if (this.renderLineScheme) this.renderLineScheme(); if (this.renderPregame) this.renderPregame();
  };
  proto.returnToSpecial = function (key, slot) {
    const st = this.state, id = st && st.vacantSp && st.vacantSp[key + '.' + slot]; if (!id) return;
    this.assignSpecialPlayer(key, slot, id);
    const d = this._specialTeamsDraft76; if (d && d[key] && d[key][slot] === id) delete st.vacantSp[key + '.' + slot];
    this.renderSpecialTeams();
  };
  const returnBox = (a, items) => items.length ? `<div class="sch-card ret-box"><h3>Выздоровели</h3>${items.map(x => `<div class="ret-row"><span>${a.escape(x.name)} · ${a.escape(x.label)}</span><button class="btn btn-quiet" type="button" onclick="${x.act}">Вернуть на место</button></div>`).join('')}</div>` : '';
  proto.returnItems = function () {
    const st = this.state, out = { lines: [], sp: [] }; if (!st) return out;
    const byId = id => this.db.players.find(p => p.id === id), used = new Set(Object.values(st.slotAssignments || {}).filter(Boolean));
    for (const [sid, id] of Object.entries(st.vacant || {})) {
      const p = byId(id); if (!p || st.slotAssignments[sid] || this.isPlayerUnavailable(p) || used.has(id)) continue;
      out.lines.push({ name: p.name, label: sname(this, sid), act: `app.returnToSlot('${sid}')` });
    }
    const d = this._specialTeamsDraft76 || st.specialTeams || {};
    for (const [k, id] of Object.entries(st.vacantSp || {})) {
      const [key, slot] = k.split('.'), p = byId(id); if (!p || (d[key] || {})[slot] || this.isPlayerUnavailable(p)) continue;
      out.sp.push({ name: p.name, label: spName(key, slot), act: `app.returnToSpecial('${key}','${slot}')` });
    }
    return out;
  };
  const rs = proto.renderLineScheme;
  if (typeof rs === 'function') proto.renderLineScheme = function () {
    const r = rs.apply(this, arguments);
    try { const items = this.returnItems().lines, host = document.querySelector('#line-scheme-root, [data-dnd-bench]'); const bench = document.querySelector('.sch-card[data-dnd-bench]'); if (bench && items.length) bench.insertAdjacentHTML('beforebegin', returnBox(this, items)); } catch (e) { }
    return r;
  };
  const rsp = proto.renderSpecialTeams;
  if (typeof rsp === 'function') proto.renderSpecialTeams = function () {
    const r = rsp.apply(this, arguments);
    try { const items = this.returnItems().sp, root = $('specialteams-content'); if (root && items.length) root.insertAdjacentHTML('afterbegin', returnBox(this, items)); } catch (e) { }
    return r;
  };
})();
