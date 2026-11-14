/* KHL Manager Mobile Edition 7.16 — fix callback context in live penalty expiry, guard ticker and quick result. */
(function(){
  const proto=KHLManagerApp.prototype;
  proto.positionLabel=function(pos){return ({LW:'ЛН',RW:'ПН',C:'Ц',CF:'Ц',D:'З',DF:'З',G:'В',GK:'В'})[String(pos||'').toUpperCase()]||pos||'—';};
  proto.isForeignQuotaExemptTeamV75=function(teamId){return ['barys','shanghai','dinamo_mn'].includes(String(teamId||''));};

  // Creates a match lineup with at most five foreign players in total for Russian clubs.
  // Internal position codes remain LW/C/RW/D/G to keep old save files and simulation logic compatible.
  proto.buildQuotaSlotAssignmentsV75=function(teamId, enforceLimit=true, ignoreInjuries=false){
    const exempt=this.isForeignQuotaExemptTeamV75(teamId);
    if(exempt){
      const src=this.teamPlayers(teamId);
      const own=this.state?.teamId===teamId;
      // 14.7.24: игрок, отправленный в ВХЛ/МХЛ, не травмирован — но «Рекомендуемый состав»
      // всё равно не должен ставить его в стартовую заявку (он там мгновенно подсвечивался
      // бы красным как недоступный).
      const roster=src.filter(p=>(ignoreInjuries||!this.hasActiveInjury(p))&&!(this.isInFarm&&this.isInFarm(p)));
      const rating=p=>(this._quotaBuildingNewStateId===teamId)?(Number(p.ovr)||70):(own?this.effectiveOVR(p):(Number(p.ovr)||70));
      const rated=(a,b)=>rating(b)-rating(a);
      const out=Object.fromEntries(this.slotDefinitions().map(s=>[s.id,'']));
      const used=new Set();
      const take=(pool)=>{const p=pool.filter(x=>!used.has(x.id)).sort(rated)[0];if(p)used.add(p.id);return p;};
      const goalie=take(roster.filter(p=>p.pos==='G'));if(goalie)out.G=goalie.id;
      for(let i=1;i<=4;i++)for(const pos of ['LW','C','RW']){const p=take(roster.filter(x=>x.pos===pos))||take(roster.filter(x=>['LW','C','RW'].includes(x.pos)));if(p)out[`F${i}${pos}`]=p.id;}
      for(let i=1;i<=3;i++)for(const side of ['L','R']){const p=take(roster.filter(x=>x.pos==='D'));if(p)out[`D${i}${side}`]=p.id;}
      return out;
    }
    const own=this.state?.teamId===teamId;
    const roster=this.teamPlayers(teamId).filter(p=>(ignoreInjuries||!this.hasActiveInjury(p))&&!(this.isInFarm&&this.isInFarm(p)));
    const rating=p=>(this._quotaBuildingNewStateId===teamId)?(Number(p.ovr)||70):(own?this.effectiveOVR(p):(this.state?this.effectiveOVR(p):(Number(p.ovr)||70)));
    const rated=(a,b)=>rating(b)-rating(a);
    const out=Object.fromEntries(this.slotDefinitions().map(s=>[s.id,'']));
    const used=new Set();let foreignCount=0;
    const canUse=(p,foreignCeiling=5)=>!used.has(p.id)&&(!enforceLimit||!p.foreign||foreignCount<foreignCeiling);
    const take=(pool,foreignCeiling=5)=>{const p=pool.filter(x=>canUse(x,foreignCeiling)).sort(rated)[0];if(p){used.add(p.id);if(p.foreign)foreignCount++;}return p;};
    // Select the goalkeeper first because a foreign starter uses one of the five foreign slots.
    const goalie=take(roster.filter(p=>p.pos==='G'));if(goalie)out.G=goalie.id;
    // Reserve enough foreign slots for defense if the club has fewer than six domestic defenders.
    const domesticDefenders=roster.filter(p=>p.pos==='D'&&!p.foreign).length;
    const foreignDefenseNeeded=Math.max(0,6-domesticDefenders);
    const forwardForeignCeiling=enforceLimit?Math.max(0,5-foreignDefenseNeeded):Infinity;
    for(let i=1;i<=4;i++){
      for(const pos of ['LW','C','RW']){
        const exact=take(roster.filter(p=>p.pos===pos),forwardForeignCeiling);
        const p=exact||take(roster.filter(x=>['LW','C','RW'].includes(x.pos)),forwardForeignCeiling);
        if(p)out[`F${i}${pos}`]=p.id;
      }
    }
    for(let i=1;i<=3;i++)for(const side of ['L','R']){const p=take(roster.filter(x=>x.pos==='D'));if(p)out[`D${i}${side}`]=p.id;}
    return out;
  };

  proto.foreignQuotaInfoV75=function(teamId, slotsOverride=null, specialOverride=null){
    const exempt=this.isForeignQuotaExemptTeamV75(teamId);
    const slots=slotsOverride||(this.state?.teamId===teamId?this.state.slotAssignments:null)||this.buildQuotaSlotAssignmentsV75(teamId,!exempt);
    const ids=new Set(Object.values(slots||{}).filter(Boolean));
    let special=specialOverride;
    if(!special){
      if(this.state?.teamId===teamId&&this.state.specialTeams)special=this.state.specialTeams;
      else special=this.defaultSpecialTeams(teamId);
    }
    Object.values(special||{}).forEach(unit=>Object.values(unit||{}).forEach(id=>{if(id)ids.add(id);}));
    const roster=this.teamPlayers(teamId);
    const selected=[...ids].map(id=>roster.find(p=>p.id===id)).filter(Boolean);
    const foreigners=selected.filter(p=>p.foreign);
    const foreignGoalies=foreigners.filter(p=>p.pos==='G');
    return {exempt,count:foreigners.length,goalies:foreignGoalies.length,valid:exempt||(foreigners.length<=5&&foreignGoalies.length<=1),players:foreigners};
  };

  proto.buildDefaultSlots=function(teamId){return this.buildQuotaSlotAssignmentsV75(teamId,true,this._quotaBuildingNewStateId===teamId);};
  proto.buildRecommendedHealthySlots=function(teamId){return this.buildQuotaSlotAssignmentsV75(teamId,true);};

  // Restrict default special-team units to players actually selected for this match. Reserve foreign players
  // may be chosen manually later, in which case the same five-player roster limit is checked.

  // A new career must build both its main lineup and its default special teams against that same roster.
  const baseCreateState=proto.createState;
  proto.createState=function(teamId){
    const previous=this.state;
    this._quotaBuildingNewStateId=teamId;
    const state=baseCreateState.call(this,teamId);
    this._quotaBuildingNewStateId=null;
    this.state=state;
    state.slotAssignments=this.buildQuotaSlotAssignmentsV75(teamId,true);
    this.syncLineAssignmentsFromSlots();
    state.specialTeams=this.defaultSpecialTeams(teamId);
    this.state=previous;
    return state;
  };

  // AI match lineups also respect the limit; clubs exempted by the user retain their full eligible roster.
  const baseActiveSkaters=proto.activeSkaters;
  proto.activeSkaters=function(teamId){
    if(!this.state||teamId===this.state.teamId||this.isForeignQuotaExemptTeamV75(teamId))return baseActiveSkaters.call(this,teamId);
    const slots=this.buildQuotaSlotAssignmentsV75(teamId,true);
    const byId=id=>this.db.players.find(p=>p.id===id&&p.teamId===teamId&&!this.hasActiveInjury(p));
    const defs=this.slotDefinitions();
    const forwards=defs.filter(s=>s.type==='F').map(s=>byId(slots[s.id])).filter(Boolean);
    const defense=defs.filter(s=>s.type==='D').map(s=>byId(slots[s.id])).filter(Boolean);
    const goalie=byId(slots.G)||null;
    return {forwards,defense,goalie,skaters:[...forwards,...defense]};
  };

  // Keep older/saved lineups intact but prevent starting a match with an invalid foreign-player application.
  const baseSaveAndStart=proto.saveLineupAndStart;
  proto.saveLineupAndStart=function(){
    if(this.state&&!this.liveMatch?.finished){
      const match=this.state.matches?.find(m=>m.id===(this.pendingMatchId||this.currentMatchId));
      if(match&&!match.played&&!this.isForeignQuotaExemptTeamV75(this.state.teamId)){
        const info=this.foreignQuotaInfoV75(this.state.teamId);
        if(!info.valid){
          this.switchTab('roster');this.renderRoster();
          const goalies=info.goalies>1?`Иностранных вратарей: ${info.goalies}; допускается не более 1.`:'';
          alert(`Нельзя начать матч: в заявке ${info.count} легионеров, допустимо не более 5.${goalies}

Убери лишних иностранцев из звеньев или спецбригад. В полном составе клуба может оставаться любое число легионеров.`);
          return;
        }
      }
    }
    return baseSaveAndStart.call(this);
  };

  // Reject an edit to special teams only when it would make the match application exceed the foreign-player limit.

  // Add an explicit quota status to the pre-game report for both clubs.
  const baseRenderPregame=proto.renderPregame;
  proto.renderPregame=function(){
    baseRenderPregame.call(this);
    if(!this.state)return;
    const root=document.getElementById('pregame-editor');
    const match=this.state.matches?.find(m=>m.id===(this.pendingMatchId||this.currentMatchId));
    if(!root||!match||match.played)return;
    root.querySelector('#foreign-quota-report-v75')?.remove();
    const renderStatus=teamId=>{
      const team=this.teamById(teamId),info=this.foreignQuotaInfoV75(teamId);
      if(info.exempt)return `<div class="pregame-quota-team"><b>${this.escape(team?.name||'Клуб')}</b><br><span class="muted small">Иностранные игроки: лимит не применяется.</span></div>`;
      return `<div class="pregame-quota-team"><b>${this.escape(team?.name||'Клуб')}</b><br><span class="small" style="color:${info.valid?'var(--t-fg-93c5fd)':'var(--t-fg-fca5a5)'}">Легионеры в заявке: ${info.count}/5 · иностранные вратари: ${info.goalies}/1${info.valid?'':' · лимит превышен'}</span></div>`;
    };
    const block=document.createElement('div');block.id='foreign-quota-report-v75';block.className='notice';block.style.margin='.65rem 0';
    block.innerHTML=`<b>🌍 Лимит легионеров на матч</b><div class="grid grid-two" style="gap:.55rem;margin-top:.4rem">${renderStatus(match.homeId)}${renderStatus(match.awayId)}</div><p class="tiny muted" style="margin:.45rem 0 0">Для российских клубов — не более 5 легионеров в заявке, включая максимум одного иностранного вратаря. Для «Барыса», «Шанхайских драконов» и «Динамо Мн» ограничение не действует. Вне заявки лимита нет.</p>`;
    const start=root.querySelector('.pregame-start-actions');if(start)start.insertAdjacentElement('beforebegin',block);else root.appendChild(block);
  };

  // Refresh position labels after the roster editor renders. Internal codes and slot IDs remain unchanged.
  const baseRenderRoster=proto.renderRoster;
  proto.renderRoster=function(){
    baseRenderRoster.call(this);
    if(!this.state)return;
    document.querySelectorAll('#line-editor .line-slot[data-slot] .slot-label').forEach(label=>{
      const slot=label.closest('.line-slot')?.dataset.slot||'';
      if(/^F\d+C$/.test(slot))label.textContent='Ц';else if(slot==='G')label.textContent='В';
    });
    document.querySelectorAll('#line-editor .bench-player[data-player-id]').forEach(el=>{
      const p=this.db.players.find(x=>x.id===el.dataset.playerId);const span=el.querySelector('span.muted');
      if(p&&span)span.textContent=`${this.positionLabel(p.pos)} · ${this.permanentOVR(p)}`;
    });
    document.querySelectorAll('#line-editor .slot-controls select').forEach(select=>{
      Array.from(select.options).forEach(option=>{if(!option.value)return;const p=this.db.players.find(x=>x.id===option.value);if(!p)return;
        option.dataset.menuLabel=`${p.name} · ${this.positionLabel(p.pos)} · ${this.playerRosterSlotStatus(p)} · OVR ${Math.round(this.effectiveOVR(p))}`;
        option.dataset.closedLabel=`${p.name} · ${this.positionLabel(p.pos)} · OVR ${Math.round(this.effectiveOVR(p))}`;
      });
    });
    this.renderPregame();
  };
})();
