/* KHL Manager Mobile Edition 6.10: goalie-pull delay and stable shootout selection UI. */
const __khl66BaseRenderRoster = KHLManagerApp.prototype.renderRoster;
const __khl66BaseAssignSlot = KHLManagerApp.prototype.assignSlot;
const __khl66BaseSaveLineupAndStart = KHLManagerApp.prototype.saveLineupAndStart;
const __khl66BaseAdvancePlayerDays = KHLManagerApp.prototype.advancePlayerDays;
const __khl66BaseApplyMatchDevelopment = KHLManagerApp.prototype.applyMatchDevelopment;

KHLManagerApp.prototype.hasActiveInjury = function(player){
  return !!(player && this.playerDev(player)?.injury);
};

KHLManagerApp.prototype.playerRosterSlotStatus = function(player,includeInjury=true){
  const slots=this.state?.slotAssignments||{};
  const slot=this.slotDefinitions().find(x=>slots[x.id]===player?.id);
  let status='Резерв';
  if(slot){
    if(slot.type==='F')status=`${slot.line}-е звено`;
    else if(slot.type==='D')status=`${slot.line}-я пара`;
    else if(slot.type==='G')status='Стартовый вратарь';
  }
  if(includeInjury&&this.hasActiveInjury(player))status+=' · 🩹 ТРАВМА';
  return status;
};

KHLManagerApp.prototype.playerConditionShort = function(player){
  const d=this.playerDev(player)||{};
  return `Ф ${Math.round(Number(d.form??50))} · У ${Math.round(Number(d.fatigue??0))}% · М ${Math.round(Number(d.morale??60))}`;
};

// Closed select labels stay concise; the expanded picker shows line/bench status.
KHLManagerApp.prototype.expandSlotSelect = function(select){
  if(!select)return;
  Array.from(select.options).forEach(option=>{
    if(!option.value)return;
    const player=this.db.players.find(p=>p.id===option.value);
    if(!player)return;
    option.textContent=option.dataset.menuLabel||`${player.name} · ${this.positionLabel(player.pos)} · ${this.playerRosterSlotStatus(player)} · OVR ${Math.round(this.effectiveOVR(player))}`;
  });
};
KHLManagerApp.prototype.collapseSlotSelect = function(select){
  if(!select)return;
  Array.from(select.options).forEach(option=>{
    if(!option.value)return;
    const player=this.db.players.find(p=>p.id===option.value);
    if(!player)return;
    option.textContent=option.value===select.value
      ? `${player.name} · ${this.positionLabel(player.pos)} · OVR ${Math.round(this.effectiveOVR(player))}`
      : (option.dataset.menuLabel||`${player.name} · ${this.positionLabel(player.pos)} · ${this.playerRosterSlotStatus(player)} · OVR ${Math.round(this.effectiveOVR(player))}`);
  });
};


KHLManagerApp.prototype.resetLineup = function(){
  if(!this.state)return;
  this.state.slotAssignments=this.buildRecommendedHealthySlots(this.state.teamId);
  this.syncLineAssignmentsFromSlots();
  this.persistQuietly();
  this.renderRoster();
  const injured=this.teamPlayers(this.state.teamId).filter(p=>this.hasActiveInjury(p)).length;
  this.setNotice(injured?`Рекомендуемый состав восстановлен. ${injured} травмированных игрок(а/ов) исключено из заявки; выбран лучший доступный игрок по естественной позиции.`:'Рекомендуемый состав восстановлен по текущему рейтингу игроков.');
  this.renderAll();
};

KHLManagerApp.prototype.assignSlot = function(slotId,playerId){
  const player=this.db.players.find(p=>p.id===playerId);
  if(player&&player.teamId===this.state?.teamId&&this.hasActiveInjury(player)){
    this.setNotice(`${player.name} травмирован(а) и не может быть включён(а) в звено до окончания восстановления.`);
    this.renderRoster();
    return;
  }
  return __khl66BaseAssignSlot.call(this,slotId,playerId);
};

KHLManagerApp.prototype.renderRoster = function(){
  __khl66BaseRenderRoster.call(this);
  if(!this.state)return;
  const roster=this.teamPlayers(this.state.teamId);
  const playerById=id=>roster.find(p=>p.id===id);
  const addInjuryMarker=(el,p)=>{
    if(!el)return;
    el.querySelectorAll('.injury-mark').forEach(mark=>mark.remove());
    if(!p||!this.hasActiveInjury(p))return;
    const marker=document.createElement('span');
    marker.className='injury-mark';marker.textContent='🩹';
    marker.title=this.injuryDescription(p)||'Игрок травмирован';
    marker.setAttribute('aria-label','Травма');
    const firstBadge=Array.from(el.children).find(n=>n.classList?.contains('badge'));
    el.insertBefore(marker,firstBadge||null);
  };
  document.querySelectorAll('#line-editor .line-slot[data-slot]').forEach(slotEl=>{
    const slotId=slotEl.dataset.slot;
    const player=playerById((this.state.slotAssignments||{})[slotId]);
    const nameEl=slotEl.querySelector('.slot-player');
    if(!nameEl)return;
    slotEl.querySelectorAll('.slot-dev-values').forEach(x=>x.remove());
    if(!player){nameEl.removeAttribute('data-player-id');return;}
    // Replace the old rating row and display permanent/current OVR inline beside the name.
    slotEl.querySelectorAll('.slot-ovr').forEach(x=>x.remove());
    nameEl.dataset.playerId=player.id;
    const injuryMark=this.hasActiveInjury(player)?' <span class="injury-mark" title="Травма">🩹</span>':'';
    nameEl.innerHTML=`<span class="slot-player-name">${this.escape(player.name)}${injuryMark}</span><span class="slot-ovr slot-inline-rating">OVR ${this.permanentOVR(player)} · сейчас ${Math.round(this.effectiveOVR(player))}</span>`;
    nameEl.title=this.hasActiveInjury(player)?this.injuryDescription(player):'';
    const values=document.createElement('div');values.className='slot-dev-values';values.textContent=this.playerConditionShort(player);
    nameEl.insertAdjacentElement('afterend',values);
  });
  document.querySelectorAll('#line-editor .bench-player[data-player-id]').forEach(el=>{
    const player=playerById(el.dataset.playerId);if(!player)return;
    const nameEl=el.querySelector('b');
    addInjuryMarker(nameEl,player);
    el.querySelectorAll('.bench-dev-values').forEach(x=>x.remove());
    const values=document.createElement('div');values.className='bench-dev-values';values.textContent=this.playerConditionShort(player);
    el.appendChild(values);
    el.title=this.playerRosterSlotStatus(player);
  });
  document.querySelectorAll('#roster-groups .player-row[data-player-id]').forEach(el=>{
    const player=playerById(el.dataset.playerId);if(!player)return;
    addInjuryMarker(el.querySelector('.player-name'),player);
    const name=el.querySelector('.player-name');if(name)name.title=this.hasActiveInjury(player)?this.injuryDescription(player):'';
    const positionBadge=el.querySelector('.player-name .badge');
    if(positionBadge)positionBadge.textContent=`${this.positionLabel(player.pos)} · ${this.playerRosterSlotStatus(player,false)}`;
  });
  document.querySelectorAll('#line-editor .slot-controls select').forEach(select=>{
    Array.from(select.options).forEach(option=>{
      if(!option.value)return;
      const player=playerById(option.value);if(!player)return;
      const injured=this.hasActiveInjury(player);
      option.dataset.menuLabel=`${player.name} · ${this.positionLabel(player.pos)} · ${this.playerRosterSlotStatus(player)} · OVR ${Math.round(this.effectiveOVR(player))}`;
      option.dataset.closedLabel=`${player.name} · ${this.positionLabel(player.pos)} · OVR ${Math.round(this.effectiveOVR(player))}`;
      option.textContent=option.dataset.menuLabel;
      option.disabled=injured;
    });
    this.collapseSlotSelect(select);
  });
};

KHLManagerApp.prototype.saveLineupAndStart = function(){
  if(this.liveMatch&&!this.liveMatch.finished)return __khl66BaseSaveLineupAndStart.call(this);
  const match=this.state?.matches.find(x=>x.id===(this.pendingMatchId||this.currentMatchId));
  if(match&&!match.played){
    const injured=[];
    for(const [slot,id] of Object.entries(this.state.slotAssignments||{})){
      const p=this.db.players.find(x=>x.id===id);
      if(p&&p.teamId===this.state.teamId&&this.hasActiveInjury(p))injured.push({p,slot});
    }
    if(injured.length){
      this.pendingMatchId=match.id;this.currentMatchId=match.id;this.switchTab('roster');this.renderRoster();
      alert('В стартовой заявке остались травмированные игроки:\n'+injured.map(x=>`${x.p.name} (${x.slot}) — ${this.injuryDescription(x.p)||'травма'}`).join('\n')+'\n\nНажми «Рекомендуемый состав» или замени каждого травмированного здоровым игроком.');
      return;
    }
  }
  return __khl66BaseSaveLineupAndStart.call(this);
};

// The unassigned bench recovers fatigue faster on each day away from the active lineup.
KHLManagerApp.prototype.advancePlayerDays = function(days=1){
  const numeric=Number(days);
  if(!this.state||!Number.isFinite(numeric)||numeric<=0)return __khl66BaseAdvancePlayerDays.call(this,days);
  const n=Math.min(400,Math.max(1,Math.round(numeric)));
  const teamId=this.state.teamId;
  const assigned=new Set(Object.values(this.state.slotAssignments||{}).filter(Boolean));
  __khl66BaseAdvancePlayerDays.call(this,n);
  if(!this.state||this.state.teamId!==teamId)return;
  for(const player of this.teamPlayers(teamId)){
    if(assigned.has(player.id))continue;
    const d=this.playerDev(player);if(!d)continue;
    d.fatigue=this.clamp(Number(d.fatigue||0)-n*1.35,0,100);
  }
};

// Results influence the whole roster, while meaningful ice time gives a small morale lift.
// High-rated healthy players repeatedly left out of the game lose a little morale over time.
KHLManagerApp.prototype.applyMatchDevelopment = function(match,activeH,activeA){
  const alreadyDone=!!match?.developmentApplied;
  __khl66BaseApplyMatchDevelopment.call(this,match,activeH,activeA);
  if(!this.state||!match||alreadyDone||!match.developmentApplied||match.moraleIceTimeApplied)return;
  for(const side of [
    {teamId:match.homeId,active:activeH},
    {teamId:match.awayId,active:activeA}
  ]){
    const playedIds=new Set([...(side.active?.skaters||[]).map(p=>p?.id),side.active?.goalie?.id].filter(Boolean));
    for(const player of this.teamPlayers(side.teamId)){
      const d=this.playerDev(player);if(!d)continue;
      if(playedIds.has(player.id)){
        d.morale=this.clamp(Number(d.morale||0)+0.25,0,100);
      }else if(!this.hasActiveInjury(player)&&this.permanentOVR(player)>=84){
        d.morale=this.clamp(Number(d.morale||0)-0.35,0,100);
      }
    }
  }
  match.moraleIceTimeApplied=true;
};

// Keep inline player-state indicators in sync with ordinary tab navigation as well.
const __khl66BaseRenderAll = KHLManagerApp.prototype.renderAll;
KHLManagerApp.prototype.renderAll = function(){__khl66BaseRenderAll.call(this);if(this.state)this.decorateConditionHelp();};
KHLManagerApp.prototype.decorateConditionHelp=function(){}; // 8.7: explanatory block moved into the tab description
