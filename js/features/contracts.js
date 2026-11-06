/* KHL Manager 7.38 — contract types: one-way / two-way / three-way.
 * Rules (KHL regulations, simplified for the game while VHL/MHL are not simulated yet):
 *  - 17–20 year olds cannot sign one-way contracts (checked on the database and shown in Finances).
 *  - A club may have at most 25 players on one-way contracts.
 *  - One-way: full salary wherever the player plays; sending to the second team requires waivers
 *    (another club may claim the player) except right after an injury.
 *  - Two-way / three-way: the second team pays 10–60 % of the main salary (not below the minimum wage);
 *    no consent and no waivers needed. Three-way adds the youth team (MHL) for under-21 players.
 *  - A player in the second team is not available for KHL matches; the club pays his second-team salary.
 */
(function(){
  'use strict';
  const proto = KHLManagerApp.prototype;
  const RULES = { oneWayLimit: 25, minWage: 1000000, minShare: 0.10, maxShare: 0.60, maxOneWayAge: 20 };
  proto.CONTRACT_RULES = RULES;
  proto.CONTRACT_NAMES = { '1-way': 'Односторонний', '2-way': 'Двусторонний', '3-way': 'Трёхсторонний' };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  proto.contractName = function(p){ return this.CONTRACT_NAMES[p?.contract] || p?.contract || '—'; };

  /* ----- second team ------------------------------------------------------------------------ */
  proto.farmLeague = function(p){
    if (!p || p.contract === '1-way') return 'ВХЛ';
    if (p.contract === '3-way' && this.ageYears(p) <= 20) return 'МХЛ';
    return 'ВХЛ';
  };
  // Share of the main salary paid while the player is in the second team (10–60 %, higher for stronger players).
  proto.farmShare = function(p){
    if (!p || p.contract === '1-way') return 1;
    const ovr = Number(p.ovr) || 70;
    return clamp(Math.round((RULES.minShare + (ovr - 66) / 14 * 0.5) * 20) / 20, RULES.minShare, RULES.maxShare);
  };
  proto.farmSalary = function(p){
    if (!p) return 0;
    if (p.contract === '1-way') return p.salary;
    return Math.min(p.salary, Math.max(RULES.minWage, Math.round(p.salary * this.farmShare(p) / 100000) * 100000));
  };
  proto.farmMap = function(){ if (!this.state) return {}; return this.state.farm || (this.state.farm = {}); };
  proto.isInFarm = function(p){ return !!(p && this.state && this.state.farm && this.state.farm[p.id]); };
  proto.payrollOf = function(p){ return this.isInFarm(p) ? this.farmSalary(p) : p.salary; };

  proto.contractSummary = function(teamId){
    const ps = this.teamPlayers(teamId);
    const c = { oneWay: 0, twoWay: 0, threeWay: 0, farm: 0, illegalYoung: [] };
    ps.forEach(p => {
      if (p.contract === '1-way') { c.oneWay++; if (this.ageYears(p) <= RULES.maxOneWayAge) c.illegalYoung.push(p); }
      else if (p.contract === '3-way') c.threeWay++; else c.twoWay++;
      if (this.isInFarm(p)) c.farm++;
    });
    c.overLimit = c.oneWay > RULES.oneWayLimit;
    return c;
  };

  /* ----- availability ----------------------------------------------------------------------- */
  const baseUnavailable = proto.isPlayerUnavailable;
  proto.isPlayerUnavailable = function(player){
    if (player && this.state && this.state.farm && this.state.farm[player.id]) return true;
    return baseUnavailable.call(this, player);
  };
  const baseSlotStatus = proto.playerRosterSlotStatus;
  proto.playerRosterSlotStatus = function(player, includeInjury){
    if (this.isInFarm(player)) return `Во второй команде (${this.farmLeague(player)})`;
    return baseSlotStatus.call(this, player, includeInjury);
  };

  /* ----- moves ------------------------------------------------------------------------------ */
  proto.waiverClaimChance = function(p){
    const ovr = Number(this.permanentOVR ? this.permanentOVR(p) : p.ovr) || 70;
    return clamp((ovr - 68) / 22 * 0.8, 0.03, 0.8);
  };
  proto.contractFarmCheck = function(p){
    const team = this.teamPlayers(this.state.teamId).filter(x => x.id !== p.id && !this.isInFarm(x));
    const g = team.filter(x => x.pos === 'G').length, d = team.filter(x => x.pos === 'D').length,
          f = team.filter(x => ['LW', 'C', 'RW'].includes(x.pos)).length;
    if (p.pos === 'G' && g < 2) return 'В заявке должно остаться минимум 2 вратаря.';
    if (p.pos === 'D' && d < 6) return 'В заявке должно остаться минимум 6 защитников.';
    if (['LW', 'C', 'RW'].includes(p.pos) && f < 12) return 'В заявке должно остаться минимум 12 нападающих.';
    return null;
  };
  proto.refillSlotsWithout = function(playerId){
    const slots = this.state.slotAssignments; if (!slots) return;
    const defs = this.slotDefinitions();
    const used = new Set(Object.values(slots).filter(Boolean));
    for (const s of defs) {
      if (slots[s.id] !== playerId) continue;
      used.delete(playerId);
      const ok = x => !used.has(x.id) && !this.isPlayerUnavailable(x) && (s.type === 'F' ? ['LW', 'C', 'RW'].includes(x.pos) : x.pos === s.type);
      const cand = this.teamPlayers(this.state.teamId).filter(ok).sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a))[0];
      slots[s.id] = cand ? cand.id : '';
      if (cand) used.add(cand.id);
    }
    if (this.syncLineAssignmentsFromSlots) this.syncLineAssignmentsFromSlots();
  };
  proto.pickWaiverClaimer = function(p){
    const exempt = t => this.isForeignQuotaExemptTeamV75 && this.isForeignQuotaExemptTeamV75(t);
    const cands = this.db.teams.filter(t => t.id !== this.state.teamId).filter(t => {
      if (!p.foreign || exempt(t.id)) return true;
      const f = this.teamPlayers(t.id).filter(x => x.foreign);
      return f.length < 5 && !(p.pos === 'G' && f.some(x => x.pos === 'G'));
    });
    if (!cands.length) return null;
    const need = t => this.teamPlayers(t.id).filter(x => x.pos === p.pos || (['LW', 'C', 'RW'].includes(p.pos) && ['LW', 'C', 'RW'].includes(x.pos))).length;
    const min = Math.min(...cands.map(need));
    const best = cands.filter(t => need(t) <= min + 1);
    return best[Math.floor(Math.random() * best.length)];
  };

  proto.sendToFarm = function(playerId){
    if (!this.state) return;
    const p = this.db.players.find(x => x.id === playerId);
    if (!p || p.teamId !== this.state.teamId || this.isInFarm(p)) return;
    const block = this.contractFarmCheck(p);
    if (block) { this.setNotice(block); return; }
    const league = this.farmLeague(p), injured = this.hasActiveInjury(p);
    if (p.contract === '1-way' && !injured) {
      const pct = Math.round(this.waiverClaimChance(p) * 100);
      const ok = confirm(`${p.name}: односторонний контракт.\nДля перевода во вторую команду игрока выставят на драфт отказов — другой клуб может его забрать (шанс ≈ ${pct}%).\nЗарплата сохранится полностью (${(p.salary / 1e6).toFixed(1)} млн ₽).\n\nВыставить на отказы?`);
      if (!ok) return;
      if (Math.random() < this.waiverClaimChance(p)) {
        const t = this.pickWaiverClaimer(p);
        if (t) {
          const wasSlot = Object.values(this.state.slotAssignments || {}).includes(p.id);
          p.teamId = t.id;
          if (wasSlot) this.refillSlotsWithout(p.id);
          this.persistQuietly(); this.renderAll();
          this.setNotice(`${p.name} выставлен на отказы: ${t.name} забрал игрока.`);
          return;
        }
      }
    } else if (p.contract !== '1-way') {
      const ok = confirm(`${p.name}: ${this.contractName(p).toLowerCase()} контракт.\nПеревод в ${league} без согласия игрока. Зарплата во второй команде: ${(this.farmSalary(p) / 1e6).toFixed(1)} млн ₽ (${Math.round(this.farmShare(p) * 100)}% оклада).\n\nОтправить?`);
      if (!ok) return;
    }
    this.farmMap()[p.id] = { since: this.state.dayIndex || 0, league };
    this.refillSlotsWithout(p.id);
    this.persistQuietly(); this.renderAll();
    this.setNotice(`${p.name} переведён во вторую команду (${league}).${injured && p.contract === '1-way' ? ' После травмы отказы не нужны.' : ''}`);
  };
  proto.recallFromFarm = function(playerId){
    if (!this.state || !this.state.farm || !this.state.farm[playerId]) return;
    const p = this.db.players.find(x => x.id === playerId);
    delete this.state.farm[playerId];
    this.persistQuietly(); this.renderAll();
    this.setNotice(`${p ? p.name : 'Игрок'} возвращён в основную команду. В заявку его можно поставить во вкладке «Состав».`);
  };

  /* ----- save repair: roster updates (new/removed players) must not break an existing career ------ */
  const baseRepair = proto.repairSave;
  proto.repairSave = function(){
    baseRepair.apply(this, arguments);
    if (!this.state) return;
    if (this.applyNumberOverrides) { this.applyNumberOverrides(); this.autoAssignNumbers(false); }
    const ids = new Set(this.db.players.map(p => p.id));
    if (this.state.farm) Object.keys(this.state.farm).forEach(id => { if (!ids.has(id) || this.db.players.find(p => p.id === id).teamId !== this.state.teamId) delete this.state.farm[id]; });
    const slots = this.state.slotAssignments; if (!slots) return;
    const mine = this.teamPlayers(this.state.teamId), mineIds = new Set(mine.map(p => p.id));
    const used = new Set(Object.values(slots).filter(id => id && mineIds.has(id)));
    let changed = false;
    for (const s of this.slotDefinitions()) {
      if (slots[s.id] && mineIds.has(slots[s.id])) continue;
      const ok = x => !used.has(x.id) && !this.isPlayerUnavailable(x) && (s.type === 'F' ? ['LW', 'C', 'RW'].includes(x.pos) : x.pos === s.type);
      const cand = mine.filter(ok).sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a))[0];
      slots[s.id] = cand ? cand.id : ''; if (cand) used.add(cand.id); changed = true;
    }
    if (changed && this.syncLineAssignmentsFromSlots) this.syncLineAssignmentsFromSlots();
  };
})();
