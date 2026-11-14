/* ================= KHL MANAGER 6.13 — staged club objectives & automatic phase transitions ================= */


KHLManagerApp.prototype.playoffObjectiveTargetStage = function(type){return ({quarterfinals:2,semifinal:3,final:4,champion:5})[type]||3;};

KHLManagerApp.prototype.userRegularGamesPlayed = function(){return (this.state?.matches||[]).filter(m=>!m.playoff&&!m.cancelled&&m.played&&(m.homeId===this.state?.teamId||m.awayId===this.state?.teamId)).length;};
KHLManagerApp.prototype.userQualifiedForPlayoffs = function(){return !!this.state&&this.regularSeasonComplete()&&this.conferenceRank(this.state.teamId)<=8;};
KHLManagerApp.prototype.evaluateTeamObjective = function(){
  if(!this.state||this.state.teamObjective?.evaluated||!this.regularSeasonComplete())return;
  const info=this.teamObjectiveInfo(),success=!!info.success,obj=this.state.teamObjective||(this.state.teamObjective={type:'playoffs'});
  obj.evaluated=true;obj.completed=success;obj.evaluatedAfterGames=this.userRegularGamesPlayed();
  const delta=success?4:-8;
  this.teamPlayers(this.state.teamId).forEach(p=>{const d=this.playerDev(p);d.morale=this.clamp(Number(d.morale||0)+delta,0,100);});
  const qualified=this.conferenceRank(this.state.teamId)<=8;
  if(qualified&&!this.state.playoffObjective){this.state.playoffObjective={type:'semifinal',selected:false,evaluated:false,completed:null,moraleCheckpointRound:0};}
  this.state.objectiveModal={kind:'regular',success,title:info.title,status:info.status,qualified,shownAtGp:obj.evaluatedAfterGames};
  this.notice=success?`Цель регулярного чемпионата выполнена: ${info.title}. Мораль команды получила итоговый бонус.`:`Цель регулярного чемпионата провалена: ${info.title}. Мораль команды заметно снизилась.`;
  this.persistQuietly();
};

KHLManagerApp.prototype.playoffObjectiveInfo = function(){
  const obj=this.state?.playoffObjective||{type:'semifinal',selected:false},po=this.state?.playoff||this.emptyPlayoffState(),target=this.playoffObjectiveTargetStage(obj.type),teamId=this.state?.teamId;
  const allSeries=[...(po.history||[]).flatMap(h=>h.series||[]),...(po.series||[])];let bestStage=0,eliminated=false;
  for(const series of allSeries){if(series.teamA!==teamId&&series.teamB!==teamId)continue;bestStage=Math.max(bestStage,series.stage||0);if(series.complete){if(series.winnerId===teamId)bestStage=Math.max(bestStage,(series.stage||0)+1);else eliminated=true;}}
  if(po.started&&po.series.some(s=>(s.teamA===teamId||s.teamB===teamId)&&!s.complete))bestStage=Math.max(bestStage,po.stage||1);
  if(po.completed&&po.championId===teamId)bestStage=5;
  let progress=target===5?Math.min(95,Math.round(Math.max(0,bestStage-1)/4*100)):Math.min(100,Math.round(Math.max(0,bestStage-1)/(target-1)*100));
  let status=obj.selected?`Текущий этап: ${this.playoffStageName(Math.max(1,po.stage||1))}. Цель: ${this.playoffObjectiveName(obj.type)}.`:'Выбери задачу команды на Кубок Гагарина.';
  if(obj.evaluated)status=obj.completed?`✅ Цель выполнена: ${this.playoffObjectiveName(obj.type)}.`:`❌ Цель провалена: ${this.playoffObjectiveName(obj.type)}.`;
  else if(eliminated)status='Команда завершила выступление в плей-офф.';
  return {type:obj.type,selected:!!obj.selected,title:this.playoffObjectiveName(obj.type),targetStage:target,bestStage,progress,status,success:target===5?!!po.completed&&po.championId===teamId:bestStage>=target};
};
KHLManagerApp.prototype.evaluatePlayoffObjective = function(success,reason=''){
  if(!this.state||!this.state.playoffObjective?.selected||this.state.playoffObjective.evaluated)return;
  const obj=this.state.playoffObjective;obj.evaluated=true;obj.completed=!!success;
  const delta=success?4.5:-8;
  this.teamPlayers(this.state.teamId).forEach(p=>{const d=this.playerDev(p);d.morale=this.clamp(Number(d.morale||0)+delta,0,100);});
  const title=this.playoffObjectiveName(obj.type);
  this.state.objectiveModal={kind:'playoff',success:!!success,title,reason:reason||title};
  this.notice=success?`Цель плей-офф выполнена: ${title}. Мораль команды повышена.`:`Цель плей-офф провалена: ${title}. Мораль команды значительно снизилась.`;
  this.persistQuietly();
};
KHLManagerApp.prototype.assessPlayoffObjectiveSeries = function(series){
  if(!this.state||!series||!series.complete||!this.state.playoffObjective?.selected||this.state.playoffObjective.evaluated)return;
  const teamId=this.state.teamId;if(series.teamA!==teamId&&series.teamB!==teamId)return;
  if(series.objectiveMoraleApplied)return;
  series.objectiveMoraleApplied=true;
  const won=series.winnerId===teamId;
  this.teamPlayers(teamId).forEach(p=>{const d=this.playerDev(p);d.morale=this.clamp(Number(d.morale||0)+(won?1.5:-2.5),0,100);});
  const target=this.playoffObjectiveTargetStage(this.state.playoffObjective.type);
  if(won&&target<5&&(series.stage+1)>=target)this.evaluatePlayoffObjective(true,`Команда прошла этап «${this.playoffStageName(series.stage)}» и достигла цели «${this.playoffObjectiveName(this.state.playoffObjective.type)}».`);
  else if(!won)this.evaluatePlayoffObjective(false,`Команда выбыла на этапе «${this.playoffStageName(series.stage)}», не достигнув цели «${this.playoffObjectiveName(this.state.playoffObjective.type)}».`);
  this.persistQuietly();
};
KHLManagerApp.prototype.closeObjectiveModal = function(){if(!this.state)return;this.state.objectiveModal=null;this.persistQuietly();const overlay=document.getElementById('objective-modal-overlay');if(overlay)overlay.remove();this.renderDevelopment();};
KHLManagerApp.prototype.renderObjectivePhasePanel = function(){
  if(!this.state)return;const root=document.getElementById('playoff-objective-panel'),sel=document.getElementById('team-objective-select');if(!root)return;
  const locked=this.userRegularGamesPlayed()>0||!!this.state.teamObjective?.evaluated||!!this.state.playoff?.started;
  if(sel){sel.disabled=locked;sel.title=locked?'Цель зафиксирована после первого матча регулярного чемпионата':'';}
  const obj=this.state.teamObjective||{};const tracking=document.getElementById('team-objective-status');
  if(tracking){tracking.querySelector('.objective-lock-note')?.remove();if(locked&&!obj.evaluated)tracking.insertAdjacentHTML('beforeend','<div class="tiny muted objective-lock-note">🔒 Цель закреплена до конца регулярного чемпионата. Мораль команды корректируется каждые 4 матча в зависимости от выполнения плана.</div>');}
  if(!this.state.playoff?.started||!this.userQualifiedForPlayoffs()){
    root.innerHTML=this.state.teamObjective?.evaluated&&!this.userQualifiedForPlayoffs()?'<div class="notice warn">Команда не прошла в плей-офф, поэтому цель на Кубок Гагарина не назначается.</div>':'';return;
  }
  const po=this.state.playoffObjective||(this.state.playoffObjective={type:'semifinal',selected:false,evaluated:false,completed:null,moraleCheckpointRound:0});
  const info=this.playoffObjectiveInfo();
  const selector= !po.selected&&!po.evaluated?`<div class="objective-phase-controls"><select id="playoff-objective-select" class="field">${this.playoffObjectiveOptions().map(([v,l])=>`<option value="${v}" ${v===po.type?'selected':''}>${this.escape(l)}</option>`).join('')}</select><button class="btn btn-primary" onclick="app.setPlayoffObjective(document.getElementById('playoff-objective-select').value)">Выбрать цель</button></div>`:'';
  root.innerHTML=`<div class="objective-phase-card"><div class="objective-phase-head"><strong>🏆 Цель на Кубок Гагарина</strong><span class="badge ${po.evaluated?(po.completed?'green':'red'):'gold'}">${po.evaluated?(po.completed?'Выполнена':'Провалена'):po.selected?'Цель зафиксирована':'Требуется выбор'}</span></div>${po.selected||po.evaluated?`<div style="margin-top:.55rem;font-weight:800">${this.escape(info.title)}</div><div class="objective-bar" style="margin-top:.6rem"><span style="width:${info.progress}%;${po.evaluated&&!po.completed?'background:#fb7185':''}"></span></div>`:''}<div class="objective-phase-sub">${this.escape(info.status)}${po.selected&&!po.evaluated?' Мораль меняется после завершения каждой серии.':''}</div>${selector}</div>`;
};
const __khl612BaseRenderDevelopment=KHLManagerApp.prototype.renderDevelopment;
KHLManagerApp.prototype.renderDevelopment=function(){__khl612BaseRenderDevelopment.call(this);this.renderObjectivePhasePanel();};
const __khl612BaseRenderAll=KHLManagerApp.prototype.renderAll;
KHLManagerApp.prototype.renderAll=function(){__khl612BaseRenderAll.call(this);if(this.state){this.renderObjectivePhasePanel();this.renderObjectiveModal();}};
const __khl612BaseSimulateMatch=KHLManagerApp.prototype.simulateMatch;
KHLManagerApp.prototype.simulateMatch=function(match){const before=!!match?.played;const result=__khl612BaseSimulateMatch.call(this,match);if(this.state&&match&&!before&&match.played&&!match.playoff&&(match.homeId===this.state.teamId||match.awayId===this.state.teamId)){this.updateRegularObjectiveMorale();}return result;};
const __khl612BaseCompleteLive=KHLManagerApp.prototype.completeLiveMatch;
KHLManagerApp.prototype.completeLiveMatch=function(live){const m=live?.simulatedMatch;const isUserRegular=!!(m&&!m.playoff&&(m.homeId===this.state?.teamId||m.awayId===this.state?.teamId));__khl612BaseCompleteLive.call(this,live);if(isUserRegular){this.updateRegularObjectiveMorale();this.persistQuietly();this.renderDevelopment();}};
const __khl612BaseRepairSave=KHLManagerApp.prototype.repairSave;
KHLManagerApp.prototype.repairSave=function(){__khl612BaseRepairSave.call(this);if(!this.state.teamObjective)this.state.teamObjective={type:'playoffs',evaluated:false,completed:null};if(this.state.teamObjective.moraleCheckpointGp==null){const gp=Number(this.state.standings?.[this.state.teamId]?.gp||0);this.state.teamObjective.moraleCheckpointGp=gp-(gp%4);this.state.teamObjective.moraleCheckpointReady=false;}if(this.state.playoff?.started&&this.conferenceRank(this.state.teamId)<=8&&!this.state.playoffObjective){this.state.playoffObjective={type:'semifinal',selected:false,evaluated:false,completed:null,moraleCheckpointRound:0,needsInitialPrompt:true};}if(this.state.playoffObjective&&!this.state.playoffObjective.type)this.state.playoffObjective.type='semifinal';};




/* ================= KHL MANAGER 6.13 — mandatory objectives and season navigation ================= */


KHLManagerApp.prototype.ensureObjectiveStateForCurrentSave = function(){
  if(!this.state)return;
  const played=this.userRegularGamesPlayed();
  if(!this.state.teamObjective){this.state.teamObjective={type:'playoffs',evaluated:false,completed:null,selected:false,moraleCheckpointGp:0,moraleCheckpointReady:true};}
  const obj=this.state.teamObjective;
  // A legacy save that has already played regular-season games gets locked to its existing target.
  if(played>0&&!obj.selected){obj.selected=true;obj.migratedAndLocked=true;this.persistQuietly();}
  // Prompt users who reached the playoffs on a pre-6.13 save but never got the missing objective dialog.
  const po=this.state.playoff;
  if(po?.started&&!po.completed&&!this.state.objectiveModal&&!obj.regularObjectiveModalHandled){
    const qualified=this.userQualifiedForPlayoffs();
    const needsPlayoffGoal=qualified&&!this.state.playoffObjective?.selected;
    const missingRegularResult=!obj.evaluated&&this.regularSeasonComplete();
    if(missingRegularResult)this.evaluateTeamObjective();
    if(qualified&&!this.state.playoffObjective)this.state.playoffObjective={type:'semifinal',selected:false,evaluated:false,completed:null,moraleCheckpointRound:0,needsInitialPrompt:true};
    if(!this.state.objectiveModal&&(needsPlayoffGoal||obj.evaluated)){
      const info=this.teamObjectiveInfo();
      this.state.objectiveModal={kind:'regular',success:!!obj.completed,title:info.title,status:info.status,qualified,allowLatePlayoffGoal:needsPlayoffGoal,shownAtGp:played};
      obj.regularObjectiveModalHandled=true;
      this.persistQuietly();
    }
  }
  // New careers and legacy saves with no regular games cannot proceed until one goal is chosen.
  if(played===0&&!obj.selected&&!obj.evaluated&&!po?.started&&!this.state.objectiveModal){
    this.state.objectiveModal={kind:'regular-choice',title:'Цель регулярного чемпионата'};
  }
};

KHLManagerApp.prototype.setTeamObjective = function(value){
  if(!this.state||!this.regularObjectiveOptions().some(([v])=>v===value))return false;
  const obj=this.state.teamObjective||{};
  if(obj.selected||this.userRegularGamesPlayed()>0||obj.evaluated||this.state.playoff?.started||this.state.objectiveModal?.kind==='regular-choice'){
    this.setNotice('Цель регулярного чемпионата выбирается один раз перед первым матчем и затем не меняется.');
    this.renderDevelopment();return false;
  }
  this.state.teamObjective={...obj,type:value,selected:true,evaluated:false,completed:null,moraleCheckpointGp:0,moraleCheckpointReady:true};
  this.persistQuietly();this.renderDevelopment();this.setNotice(`Цель регулярного чемпионата зафиксирована: ${this.regularObjectiveName(value)}.`);return true;
};

KHLManagerApp.prototype.confirmRegularObjectiveChoice = function(){
  if(!this.state)return;
  const current=this.state.teamObjective||{};
  if(this.userRegularGamesPlayed()>0){
    current.selected=true;this.state.teamObjective=current;this.state.objectiveModal=null;this.persistQuietly();this.renderAll();return;
  }
  const value=document.getElementById('regular-start-objective')?.value||current.type||'playoffs';
  if(!this.regularObjectiveOptions().some(([v])=>v===value))return;
  this.state.teamObjective={...current,type:value,selected:true,evaluated:false,completed:null,moraleCheckpointGp:0,moraleCheckpointReady:true,chosenBeforeFirstMatch:true};
  this.state.objectiveModal=null;
  this.persistQuietly();this.setNotice(`Цель регулярного чемпионата выбрана: ${this.regularObjectiveName(value)}. Она закреплена до конца регулярки.`);this.renderAll();
};

KHLManagerApp.prototype.renderObjectiveModal = function(){
  if(!this.state){document.getElementById('objective-modal-overlay')?.remove();return;}
  const modal=this.state.objectiveModal;
  let root=document.getElementById('objective-modal-overlay');
  if(!modal){if(root)root.remove();return;}
  const key=[modal.kind,modal.success?'1':'0',modal.qualified?'1':'0',modal.title||'',modal.shownAtGp||''].join('|');
  if(root&&root.dataset.modalKey===key)return;
  if(root)root.remove();
  let headline='',eyebrow='',body='',action='';
  if(modal.kind==='regular-choice'){
    eyebrow='Перед началом сезона';headline='Выбери цель на регулярный чемпионат';
    body='Цель будет закреплена до окончания регулярного чемпионата. Менять её после первого матча нельзя. Результаты команды будут постепенно влиять на мораль игроков.';
    const current=this.state.teamObjective?.type||'playoffs';
    action=`<label class="small" for="regular-start-objective">Цель клуба</label><select id="regular-start-objective" class="field">${this.regularObjectiveOptions().map(([v,l])=>`<option value="${v}" ${v===current?'selected':''}>${this.escape(l)}</option>`).join('')}</select><div class="toolbar"><button class="btn btn-primary" onclick="app.confirmRegularObjectiveChoice()">🏒 Зафиксировать цель</button></div>`;
  }else if(modal.kind==='regular'){
    eyebrow='Итоги регулярного чемпионата';headline=modal.success?'Вы выполнили цель на регулярный чемпионат!':'Вы провалили цель регулярного чемпионата!';
    body=modal.success?'Команда выполнила поставленную задачу. Мораль игроков получает итоговый бонус.':'Задача не достигнута. Мораль команды заметно снижается — её предстоит вернуть результатами в плей-офф.';
    if(modal.qualified){
      const current=this.state.playoffObjective?.type||'semifinal';
      action=`<p class="small">Теперь выбери задачу на Кубок Гагарина. Она закрепится после подтверждения.</p><label class="small" for="regular-end-playoff-goal">Цель плей-офф</label><select id="regular-end-playoff-goal" class="field">${this.playoffObjectiveOptions().map(([v,l])=>`<option value="${v}" ${v===current?'selected':''}>${this.escape(l)}</option>`).join('')}</select><div class="toolbar"><button class="btn btn-primary" onclick="app.confirmRegularObjective()">🏆 Подтвердить цель и открыть сетку</button></div>`;
    }else action='<div class="toolbar"><button class="btn btn-primary" onclick="app.confirmRegularObjective()">Перейти к плей-офф</button></div>';
  }else{
    eyebrow='Кубок Гагарина';headline=modal.success?'Вы выполнили цель плей-офф!':'Вы провалили цель плей-офф!';
    body=modal.success?'Команда достигла поставленной задачи. Мораль игроков повышена.':'Команда выбыла раньше намеченного этапа. Мораль состава значительно снизилась.';
    action=`<div class="toolbar"><button class="btn btn-primary" onclick="app.confirmRegularObjective()">${this.state.playoff?.completed?'Открыть итоги Кубка Гагарина':modal.success?'Продолжить плей-офф':'Перейти к плей-офф'}</button></div>`;
  }
  root=document.createElement('div');root.id='objective-modal-overlay';root.className='objective-modal-overlay';root.dataset.modalKey=key;
  root.innerHTML=`<section class="objective-modal" role="dialog" aria-modal="true" aria-labelledby="objective-modal-title"><div class="eyebrow">${this.escape(eyebrow)}</div><h2 id="objective-modal-title">${this.escape(headline)}</h2><div class="objective-modal-result">${this.escape(modal.title||'Цель клуба')}</div><p>${this.escape(body)}</p>${modal.status||modal.reason?`<p class="small muted">${this.escape(modal.status||modal.reason)}</p>`:''}${action}</section>`;
  document.body.appendChild(root);
};

const __khl613BaseRenderObjectivePhasePanel = KHLManagerApp.prototype.renderObjectivePhasePanel;
KHLManagerApp.prototype.renderObjectivePhasePanel = function(){
  if(typeof __khl613BaseRenderObjectivePhasePanel==='function')__khl613BaseRenderObjectivePhasePanel.call(this);
  if(!this.state)return;
  const sel=document.getElementById('team-objective-select');
  if(sel){sel.value=this.state.teamObjective?.type||'playoffs';sel.disabled=true;sel.title='Цель выбирается один раз в обязательном окне перед первым матчем';}
  const root=document.getElementById('playoff-objective-panel');
  if(root){
    const po=this.state.playoffObjective;
    root.querySelector('.playoff-goal-required')?.remove();
    if(this.state.playoff?.started&&!this.state.playoff.completed&&this.userQualifiedForPlayoffs()&&!po?.selected){
      root.insertAdjacentHTML('afterbegin','<div class="notice warn playoff-goal-required" style="margin-bottom:.7rem">Перед продолжением плей-офф подтверди цель Кубка Гагарина в открывшемся окне.</div>');
    }
  }
};

KHLManagerApp.prototype.isUserEliminatedFromPlayoffs = function(){
  if(!this.state?.playoff?.started||this.state.playoff.completed)return false;
  const id=this.state.teamId,po=this.state.playoff;
  const all=[...(po.history||[]).flatMap(h=>h.series||[]),...(po.series||[])];
  const lost=all.some(s=>(s.teamA===id||s.teamB===id)&&s.complete&&s.winnerId!==id);
  const next=this.state.matches.some(m=>m.playoff&&!m.played&&!m.cancelled&&(m.homeId===id||m.awayId===id));
  return lost&&!next;
};

KHLManagerApp.prototype.simulateCupToChampion = function(){
  if(!this.state)return false;
  this.ensurePlayoffsStarted();
  const prevFlag=this._khl613FinishingCup;this._khl613FinishingCup=true;
  try{
    for(let guard=0;guard<240&&!this.state.playoff?.completed;guard++){
      const next=this.state.matches.filter(m=>m.playoff&&!m.played&&!m.cancelled).sort((a,b)=>a.dateOffset-b.dateOffset)[0];
      if(!next){this.ensurePlayoffsStarted();if(this.state.playoff?.completed)break;return false;}
      const days=Math.max(0,Number(next.dateOffset||0)-Number(this.state.dayIndex||0));
      if(days){this.advancePlayerDays(days);this.state.dayIndex=next.dateOffset;}
      const count=this.simulateMatchesAt(next.dateOffset,false);
      if(!count&&!next.played&&!next.cancelled)this.simulateMatch(next);
      this.ensurePlayoffsStarted();
    }
  }finally{this._khl613FinishingCup=prevFlag;}
  if(this.state.playoff?.completed){this.state.seasonFinished=true;this.persistQuietly();return true;}
  return false;
};

KHLManagerApp.prototype.finishRegularSeasonTransition = function(){
  if(!this.state||this._khl613FinishingRegular)return false;
  const id=this.state.teamId;
  const userRegularLeft=this.state.matches.some(m=>!m.playoff&&!m.played&&!m.cancelled&&(m.homeId===id||m.awayId===id));
  if(userRegularLeft)return false;

  this._khl613FinishingRegular=true;
  try{
    // Once our team's regular schedule is finished, complete any remaining league games first.
    // The core renderer may create the playoff bracket as soon as the final regular game is marked played,
    // so this must also handle an already-started bracket below.
    if(!this.regularSeasonComplete()){
      const allLeft=this.state.matches.filter(m=>!m.playoff&&!m.played&&!m.cancelled).sort((a,b)=>a.dateOffset-b.dateOffset);
      if(!allLeft.length)return false;
      for(const m of allLeft){
        if(m.played||m.cancelled)continue;
        const days=Math.max(0,Number(m.dateOffset||0)-Number(this.state.dayIndex||0));
        if(days){this.advancePlayerDays(days);this.state.dayIndex=Number(m.dateOffset||this.state.dayIndex||0);}
        this.simulateMatch(m);
      }
    }
    if(!this.regularSeasonComplete())return false;

    // Evaluate the regular-season goal exactly once and ensure the bracket exists.
    if(!this.state.teamObjective?.evaluated)this.evaluateTeamObjective();
    if(!this.state.playoff?.started&&!this.state.playoff?.completed)this.ensurePlayoffsStarted();

    const qualified=this.conferenceRank(id)<=8;
    const obj=this.state.teamObjective||(this.state.teamObjective={type:'playoffs',selected:true,evaluated:false,completed:null});
    // Mark the regular-season result as handled so ordinary renders do not reopen it.
    // If the core transition already created the result modal, preserve its authoritative result.
    if(!this.state.objectiveModal||this.state.objectiveModal.kind==='regular-choice'){
      const info=this.teamObjectiveInfo();
      this.state.objectiveModal={kind:'regular',success:!!obj.completed,title:info.title,status:info.status,qualified,shownAtGp:this.userRegularGamesPlayed()};
    }
    obj.regularObjectiveModalHandled=true;

    // Non-playoff teams should still see the completed Cup bracket and the real champion.
    // The regular-goal result remains in front and is dismissed by its dedicated button.
    // 9.20.0: кубок для не прошедших в плей-офф тоже идёт по дням (кнопки «День вперёд» / «До финала»).

    if(this.state.playoff?.completed){
      this.state.seasonFinished=true;
      this.setNotice(`🏆 Кубок Гагарина завершён. Обладатель: ${this.teamById(this.state.playoff.championId)?.name||'—'}.`);
    }else if(qualified){
      this.setNotice('Регулярный чемпионат завершён. Подтверди результат цели и выбери задачу на Кубок Гагарина.');
    }else{
      this.setNotice('Регулярный чемпионат завершён. Команда не прошла в плей-офф. Кубок Гагарина идёт без неё: листай дни или переходи сразу к финалу.');
    }
    this.persistQuietly();
    this.switchTab('playoffs');
    this.renderAll();
    this.switchTab('playoffs');
    this.renderObjectiveModal();
    return true;
  }finally{
    this._khl613FinishingRegular=false;
  }
};
KHLManagerApp.prototype.confirmRegularObjective = function(){
  if(!this.state)return;
  const modal=this.state.objectiveModal;
  if(!modal)return;
  if(modal.kind==='regular'){
    if(modal.qualified){
      const type=document.getElementById('regular-end-playoff-goal')?.value||this.state.playoffObjective?.type||'semifinal';
      this.state.playoffObjective={...(this.state.playoffObjective||{}),type,selected:true,evaluated:false,completed:null,moraleCheckpointRound:0,needsInitialPrompt:false};
      this.state.objectiveModal=null;this.persistQuietly();this.renderAll();this.switchTab('playoffs');this.setNotice(`Цель Кубка Гагарина зафиксирована: ${this.playoffObjectiveName(type)}.`);this.renderAll();this.switchTab('playoffs');return;
    }
    this.state.objectiveModal=null;this.persistQuietly();
    this.renderAll();this.switchTab('playoffs');this.renderObjectiveModal();return;
  }
  if(modal.kind==='playoff'){
    this.state.objectiveModal=null;this.persistQuietly();
    this.renderAll();this.switchTab('playoffs');this.renderObjectiveModal();return;
  }
  this.state.objectiveModal=null;this.persistQuietly();this.renderAll();
};

KHLManagerApp.prototype.setPlayoffObjective = function(value){
  if(!this.state||!this.playoffObjectiveOptions().some(([v])=>v===value))return false;
  const obj=this.state.playoffObjective||{};
  const played=(this.state.matches||[]).some(m=>m.playoff&&m.played&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId));
  if(obj.selected||obj.evaluated||played){this.setNotice('Цель Кубка Гагарина фиксируется один раз и не меняется после начала плей-офф.');this.renderDevelopment();return false;}
  this.state.playoffObjective={...obj,type:value,selected:true,evaluated:false,completed:null,moraleCheckpointRound:0};
  this.persistQuietly();this.renderDevelopment();this.setNotice(`Цель Кубка Гагарина выбрана: ${this.playoffObjectiveName(value)}.`);return true;
};

const __khl613BaseRepairSave = KHLManagerApp.prototype.repairSave;
KHLManagerApp.prototype.repairSave = function(){
  if(typeof __khl613BaseRepairSave==='function')__khl613BaseRepairSave.call(this);
  if(!this.state)return;
  if(!this.state.teamObjective)this.state.teamObjective={type:'playoffs',selected:false,evaluated:false,completed:null,moraleCheckpointGp:0,moraleCheckpointReady:true};
  const played=this.userRegularGamesPlayed();
  if(played>0&&!this.state.teamObjective.selected)this.state.teamObjective.selected=true;
  if(this.state.playoff?.started&&!this.state.playoffObjective){this.state.playoffObjective={type:'semifinal',selected:false,evaluated:false,completed:null,moraleCheckpointRound:0,needsInitialPrompt:true};}
  if(this.state.playoffObjective&&!this.state.playoffObjective.type)this.state.playoffObjective.type='semifinal';
  if(this.state.playoff?.started&&!this.state.playoff.completed&&this.userQualifiedForPlayoffs()&&!this.state.playoffObjective?.selected&&!this.state.objectiveModal&&!(this.isUserEliminatedFromPlayoffs())){
    if(!this.state.teamObjective.evaluated&&this.regularSeasonComplete())this.evaluateTeamObjective();
    const info=this.teamObjectiveInfo();
    this.state.objectiveModal={kind:'regular',success:!!this.state.teamObjective.completed,title:info.title,status:info.status,qualified:true,allowLatePlayoffGoal:true,shownAtGp:played};
  }
  this.persistQuietly();
};

const __khl613BaseSimulatePlayoffGame=KHLManagerApp.prototype.simulatePlayoffGame;
KHLManagerApp.prototype.simulatePlayoffGame=function(match){
  const result=__khl613BaseSimulatePlayoffGame.call(this,match);
  if(this.state&&result?.played&&result.playoff){
    const po=this.state.playoff,series=[...(po?.history||[]).flatMap(h=>h.series||[]),...(po?.series||[])].find(s=>s.id===result.seriesId);
    if(series)this.assessPlayoffObjectiveSeries(series);
    if(po?.completed&&po.championId===this.state.teamId&&!this.state.playoffObjective?.evaluated&&this.state.playoffObjective?.selected)this.evaluatePlayoffObjective(true,'Команда выиграла Кубок Гагарина!');
  }
  return result;
};

const __khl613BaseRenderAll=KHLManagerApp.prototype.renderAll;
KHLManagerApp.prototype.renderAll=function(){
  __khl613BaseRenderAll.call(this);
  if(!this.state){document.getElementById('objective-modal-overlay')?.remove();return;}
  // The base renderer starts the playoff bracket as soon as all regular games are marked played.
  // Route through the season-transition handler before the migration/prompt logic can consume the result.
  if(!this._khl613FinishingRegular&&this.regularSeasonComplete()&&!this.state.teamObjective?.regularObjectiveModalHandled){
    this.finishRegularSeasonTransition();
  }
  this.ensureObjectiveStateForCurrentSave();
  this.renderObjectivePhasePanel();
  this.renderObjectiveModal();
};


const __khl613BaseSaveLineupAndStart=KHLManagerApp.prototype.saveLineupAndStart;
KHLManagerApp.prototype.saveLineupAndStart=function(){
  this.ensureObjectiveStateForCurrentSave();
  if(this.state?.objectiveModal?.kind==='regular-choice'){this.renderObjectiveModal();return;}
  return __khl613BaseSaveLineupAndStart.call(this);
};

const __khl613BaseCompleteLiveMatch=KHLManagerApp.prototype.completeLiveMatch;
KHLManagerApp.prototype.completeLiveMatch=function(live){
  const m=live?.simulatedMatch,wasRegular=!!(m&&!m.playoff&&(m.homeId===this.state?.teamId||m.awayId===this.state?.teamId)),wasPlayoff=!!(m&&m.playoff&&(m.homeId===this.state?.teamId||m.awayId===this.state?.teamId));
  __khl613BaseCompleteLiveMatch.call(this,live);
  if(!this.state||this._khl613FinishingCup||this._khl613FinishingRegular)return;
  if(wasRegular){this.finishRegularSeasonTransition();return;}
  if(wasPlayoff){
    if(this.state.playoff?.completed||this.isUserEliminatedFromPlayoffs()){
      // 9.20.0: после вылета кубок не доигрывается мгновенно; игрок остаётся на дате матча и сам листает дни.
      this.persistQuietly();this.renderAll();
    }
  }
};

const __khl613BaseAdvanceDay=KHLManagerApp.prototype.advanceDay;
KHLManagerApp.prototype.advanceDay=function(){
  if(this.state?.objectiveModal?.kind==='regular-choice'){this.renderObjectiveModal();return;}
  const result=__khl613BaseAdvanceDay.call(this);
  if(this.state&&!this._khl613FinishingRegular&&!this.state.playoff?.started)this.finishRegularSeasonTransition();
  return result;
};



/* 6.16: richer club and league news desk. */
KHLManagerApp.prototype.ensureNewsState = function(){
  if(!this.state)return;
  if(!Array.isArray(this.state.news))this.state.news=[];
  if(!this.state.newsMeta||typeof this.state.newsMeta!=='object')this.state.newsMeta={topScorerId:null,formThresholds:{},lastGeneratedAt:0};
  if(!this.state.newsMeta.formThresholds)this.state.newsMeta.formThresholds={};
  const existingWelcome=this.state.news.find(n=>n.key===`welcome:${this.state.teamId}`);
  if(existingWelcome)existingWelcome.body='Новый сезон открыт. Здесь будут появляться новости клуба, а также события всей лиги — от результатов матчей до травм, серий и борьбы бомбардиров.';
  if(!this.state.news.length){
    this.state.news.push({id:'news-welcome-'+this.state.teamId,key:'welcome:'+this.state.teamId,category:'press',icon:'📰',headline:'Пресс-служба начинает работу',body:`Новый сезон открыт. Здесь будут появляться новости клуба, а также события всей лиги — от результатов матчей до травм, серий и борьбы бомбардиров.`,dateOffset:Number(this.state.dayIndex||0),createdAt:Date.now(),teamIds:[this.state.teamId],matchId:null,read:false});
    const played=(this.state.matches||[]).filter(m=>m.played&&!m.cancelled).sort((a,b)=>(b.dateOffset||0)-(a.dateOffset||0)).slice(0,5).reverse();
    played.forEach(m=>this.publishMatchResultNews(m,null,true));
  }
};


KHLManagerApp.prototype.markAllNewsRead=function(){if(!this.state)return;this.ensureNewsState();this.state.news.forEach(n=>n.read=true);this.persistQuietly();this.renderNews();};

KHLManagerApp.prototype.currentTopLeagueScorer=function(){
  if(!this.state)return null;
  return this.db.players.map(p=>({player:p,stats:this.state.playerStats?.[p.id]||{}})).filter(x=>(x.stats.pts||0)>0).sort((a,b)=>(b.stats.pts||0)-(a.stats.pts||0)||(b.stats.g||0)-(a.stats.g||0)||(b.stats.a||0)-(a.stats.a||0)||a.player.name.localeCompare(b.player.name,'ru'))[0]||null;
};
KHLManagerApp.prototype.teamMatchStreak=function(teamId,playoff){
  const games=(this.state.matches||[]).filter(m=>m.played&&!m.cancelled&&!!m.playoff===!!playoff&&(m.homeId===teamId||m.awayId===teamId)).sort((a,b)=>(a.dateOffset||0)-(b.dateOffset||0)||String(a.id).localeCompare(String(b.id),undefined,{numeric:true}));
  if(!games.length)return null;const resultOf=m=>{if(Number(m.homeScore)===Number(m.awayScore))return 'D';return (m.homeScore>m.awayScore?m.homeId:m.awayId)===teamId?'W':'L';};
  const last=resultOf(games[games.length-1]);if(last==='D')return {type:'D',count:1};let count=0;for(let i=games.length-1;i>=0;i--){const r=resultOf(games[i]);if(r!==last)break;count++;}return {type:last,count};
};

KHLManagerApp.prototype.publishCoachComments=function(match,ctx={}){
  if(!this.state||!match)return;
  const home=ctx.home||this.teamById(match.homeId),away=ctx.away||this.teamById(match.awayId);
  if(!home||!away)return;
  const h=Number(match.homeScore)||0,a=Number(match.awayScore)||0;
  const winner=ctx.winner||(h===a?null:this.teamById(h>a?home.id:away.id));
  const loser=ctx.loser||(winner?this.teamById(winner.id===home.id?away.id:home.id):null);
  if(!winner||!loser)return;
  const surname=(p,c)=>this.sn(p,c||'nom');
  const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
  const coachLabel=club=>club?.coach?`Главный тренер «${club.name}» (${club.coach})`:`Главный тренер «${club?.name||'команды'}»`;
  const streakFor=tid=>this.teamMatchStreak(tid,!!match.playoff);
  let speaker=Math.random()<0.55?winner:loser;
  const speakerStreak=streakFor(speaker.id);
  if(speakerStreak?.type==='L'&&speakerStreak.count>=5)speaker=loser;
  if(streakFor(winner.id)?.type==='W'&&streakFor(winner.id).count>=3&&Math.random()<0.28)speaker=winner;
  const isWin=speaker.id===winner.id;
  let pool;
  if(match.so){
    pool=isWin?[
      'Буллиты — это всегда немного цирк, но наши исполнители сегодня молодцы.',
      'Вратарь вытащил матч. Решение доверить ему решающие попытки оказалось правильным.',
      'Кого выпускать на буллиты, решаем по тренировкам. Сегодня ребята подтвердили доверие.'
    ]:[
      'Довести матч до буллитов — уже результат, но, конечно, хотели забрать два очка.',
      'В серии буллитов многое решают нервы. Сегодня чуть крепче оказались соперники.',
      'Вратарь отработал отлично, но свои попытки мы не реализовали. Что тут скажешь.'
    ];
  }else if(match.ot){
    pool=isWin?[
      'Сердце уже не в порядке, но характер у команды есть. Смогли дожать.',
      'Овертайм — лотерея, но сегодня мы хорошо распорядились своими моментами.',
      'Ребята показали характер в концовке. Отыгрались — и это дорогого стоит.',
      'В дополнительное время старались чаще менять звенья. Свежие ноги помогли решить исход.'
    ]:[
      'По игре мы вели, но пропустили в решающий момент. Такие матчи надо закрывать раньше.',
      'В овертайме всё решает один эпизод. Сегодня он сложился не в нашу пользу, но очко мы взяли.',
      'Играли на победу, рискнули в дополнительное время — не сложилось. Голову не опускаем.'
    ];
  }else{
    pool=isWin?[
      'Выкладка была стопроцентной. Ребята выполнили установку — заслуженно взяли очки.',
      'Хорошо, что контролировали ход матча. Пропустили немного, а в нужные моменты сыграли надёжно.',
      'Сегодня мы были быстрее соперника на два шага. Именно над этим работали всю неделю.',
      'Трибуны нас поддержали, спасибо болельщикам. Команда шла вперёд всю игру.',
      'Важные два очка, но не забегаем вперёд — впереди сложный выезд.',
      ...(Math.abs(h-a)>=3?['Счёт льстит сопернику — могли забить больше.']:[])
    ]:[
      'Не было темпа в первых двадцати минутах. Проснулись только после 0:2 — поздно.',
      'Пропустили в большинстве — за такие вещи наказывают. Сами виноваты.',
      'Соперник сыграл дисциплинированно, а мы не создали столько моментов, сколько планировали.',
      'Усталость не оправдание. Плотный график у всех одинаковый.',
      'Раздевалка расстроена, но сезон длинный. Разберём видео и двигаемся дальше.',
      'Проиграли борьбу у бортов. В этой лиге за такие мелочи платишь очками.'
    ];
  }
  const speakerStreakNow=streakFor(speaker.id);
  if(!isWin&&speakerStreakNow?.type==='L'&&speakerStreakNow.count>=5&&Math.random()<0.65)
    pool=['Знаю, что болельщики недовольны. Мы тоже. Надо честно разобрать ошибки и начать отвечать результатом.'];
  if(isWin&&streakFor(speaker.id)?.type==='W'&&streakFor(speaker.id).count>=3&&Math.random()<0.6)
    pool=['Серия побед радует, но не зазнаёмся. Каждый следующий матч начинается с нуля.'];
  this.publishNews({key:`coach-quote:${match.id}:${speaker.id}:result`,category:'press',icon:'🎙️',headline:`Пресс-конференция: ${speaker.name}`,body:`${coachLabel(speaker)}: «${pick(pool)}»`,dateOffset:Number(match.dateOffset)||this.state.dayIndex,teamIds:[speaker.id],matchId:match.id});

  const events=(match.events||[]).filter(e=>e.kind==='goal');
  const pointMap=new Map();
  const addPoint=(pid,teamId,kind)=>{if(!pid)return;const p=this.db.players.find(x=>x.id===pid);if(!p)return;const row=pointMap.get(pid)||{p,teamId:p.teamId||teamId,pts:0,g:0,a:0};row.pts++;if(kind==='goal')row.g++;else row.a++;pointMap.set(pid,row);};
  events.forEach(e=>{addPoint(e.scorerId,e.teamId,'goal');addPoint(e.assist1Id,e.teamId,'assist');addPoint(e.assist2Id,e.teamId,'assist');});
  const playerCandidates=[];
  const rankedPoints=[...pointMap.values()].sort((x,y)=>y.pts-x.pts||y.g-x.g||String(x.p.name).localeCompare(String(y.p.name),'ru'));
  if(rankedPoints[0]?.pts>=2){
    const top=rankedPoints[0],pl=top.p,club=this.teamById(top.teamId);
    const quote=top.pts>=3?`Сегодня ${surname(pl)} показал, почему он один из лучших в лиге. Три очка — это его уровень.`:`${surname(pl)} тащил команду на себе весь матч. Это ответственность лидера.`;
    playerCandidates.push({teamId:top.teamId,headline:`Тренер отметил игру ${surname(pl,'gen')}`,quote,icon:'⭐'});
  }
  // A prospect is inferred from development potential and recent appearances; the database does not store ages.
  const prospects=rankedPoints.filter(x=>x.p.pos!=='G'&&(Number(this.playerDev(x.p)?.potential||x.p.ovr)-Number(x.p.ovr||0)>=6)&&(Number(this.state.playerStats?.[x.p.id]?.gp)||0)<=6);
  if(prospects.length){const pr=prospects[0],club=this.teamById(pr.teamId);playerCandidates.push({teamId:pr.teamId,headline:`Тренер отметил прогресс ${surname(pr.p,'gen')}`,quote:`Перспективный игрок ${surname(pr.p)} получает больше игрового времени и использует его. Прогресс очевиден.`,icon:'🌱'});}
  for(const tid of [home.id,away.id]){
    const otherId=tid===home.id?away.id:home.id;
    const againstShots=tid===home.id?Number(match.awayShots)||0:Number(match.homeShots)||0;
    const againstGoals=events.filter(e=>e.teamId===otherId).length;
    if(againstShots>=30&&againstGoals<=2){
      let goalie=null;try{goalie=this.activeSkaters(tid)?.goalie||null;}catch(e){}
      if(!goalie)goalie=this.teamPlayers(tid).filter(p=>p.pos==='G').sort((x,y)=>this.effectiveOVR(y)-this.effectiveOVR(x))[0];
      if(goalie)playerCandidates.push({teamId:tid,headline:`Тренер выделил игру вратаря ${surname(goalie,'gen')}`,quote:`Вратарская позиция сегодня была ключевой. ${surname(goalie)} держал команду в игре, когда соперник прижимал нас.`,icon:'🧤'});
    }
    const teamPlayers=this.teamPlayers(tid);
    const pointsByLine=new Map();
    rankedPoints.filter(x=>x.teamId===tid).forEach(x=>{const p=x.p;const line=tid===this.state.teamId?this.playerLine(p):Number(p.line)||4;pointsByLine.set(line,(pointsByLine.get(line)||0)+x.pts);});
    const bestLine=[...pointsByLine.entries()].sort((x,y)=>y[1]-x[1])[0];
    if(bestLine&&bestLine[1]>=2){
      const lineNo=bestLine[0];
      const quote=lineNo===2?'Второе звено сегодня переехало игру. Они создавали момент на каждой смене.':lineNo===4&&tid===winner.id?'Наша четвёртая тройка выдержала тяжёлые смены и не дала сопернику пространства. Это важный вклад в победу.':`Мы меняли сочетания и искали баланс. Сегодня ${lineNo}-е звено помогло найти нужный ритм.`;
      playerCandidates.push({teamId:tid,headline:`Тренер отметил работу ${lineNo}-го звена`,quote,icon:'🔄'});
    }
    const allEvents=match.events||[];
    const penaltiesAgainst=allEvents.filter(e=>e.kind==='penalty'&&e.teamId!==tid).length;
    const penaltiesFor=allEvents.filter(e=>e.kind==='penalty'&&e.teamId===tid).length;
    const ppGoals=events.filter(e=>e.teamId===tid&&e.powerPlay).length;
    const ppAgainst=events.filter(e=>e.teamId===otherId&&e.powerPlay).length;
    if(ppGoals>0)playerCandidates.push({teamId:tid,headline:`Тренер доволен большинством ${this.tn(tid,'gen')}`,quote:'Большинство сработало. Моменты, которые мы нарабатывали на тренировках, воплощаются в голы.',icon:'⚡'});
    else if(penaltiesAgainst>=3)playerCandidates.push({teamId:tid,headline:`Тренер указал на проблемы реализации ${this.tn(tid,'gen')}`,quote:'Три шанса в большинстве и ноль голов — это проблема реализации. Работаем.',icon:'⚡'});
    if(ppAgainst===0&&penaltiesFor>=2)playerCandidates.push({teamId:tid,headline:`Тренер похвалил игру в меньшинстве ${this.tn(tid,'gen')}`,quote:'Играли в меньшинстве — соперник не реализовал свои шансы. Это заслуга всей команды.',icon:'🛡️'});
    else if(ppAgainst>=2)playerCandidates.push({teamId:tid,headline:`Тренер раскритиковал игру в меньшинстве ${this.tn(tid,'gen')}`,quote:'Пропустили в меньшинстве дважды. Это недопустимо, будем разбирать схему.',icon:'🛡️'});
  }
  // Sportsmanship and opponent-coach comments are also eligible, but stay non-mechanical.
  if(Math.abs(h-a)<=1){playerCandidates.push({teamId:winner.id,headline:`Тренер высоко оценил игру ${this.tn(loser,'gen')}`,quote:`${loser.name} — организованная команда. Они не дают свободных зон, пришлось повозиться.`,icon:'🤝'});}
  if(!isWin)playerCandidates.push({teamId:speaker.id,headline:`Тренер признал подготовку соперника`,quote:`Скажу честно: план на матч у ${winner.coach||'тренерского штаба соперника'} сработал лучше нашего. Это вопрос к нам, не к ним.`,icon:'🎙️'});
  else if(loser.coach)playerCandidates.push({teamId:speaker.id,headline:`Тренер высказался о сопернике`,quote:`${loser.coach} — классный специалист. Его команда хорошо подготовлена. Сегодня нам, возможно, повезло чуть больше.`,icon:'🤝'});
  if(Math.abs(h-a)>=3)playerCandidates.push({teamId:winner.id,headline:`Тренер прокомментировал игру соперника`,quote:'Мы ожидали более агрессивной игры от соперника. Но пусть это останется на их совести.',icon:'🗣️'});
  const latePenalties=(match.events||[]).filter(e=>e.kind==='penalty'&&(e.period==='3П'||e.period===3||e.period==='3'));
  if(latePenalties.length)playerCandidates.push({teamId:speaker.id,headline:'Тренер высказался о судействе',quote:Math.random()<0.5?'Мнение о работе судей я высказал напрямую. Дальше — зона ответственности лиги.':'Пусть каждый смотрит повторы сам. Я своё мнение о некоторых эпизодах знаю.',icon:'🧑‍⚖️'});
  if(!isWin){
    const involvedIds=new Set(events.flatMap(e=>[e.scorerId,e.assist1Id,e.assist2Id]).filter(Boolean));
    const quietStar=this.teamPlayers(speaker.id).filter(p=>p.pos!=='G'&&!involvedIds.has(p.id)).sort((x,y)=>this.effectiveOVR(y)-this.effectiveOVR(x))[0];
    if(quietStar)playerCandidates.push({teamId:speaker.id,headline:`Тренер поддержал ${surname(quietStar,'acc')} после матча`,quote:`У ${surname(quietStar,'gen')} был тяжёлый вечер. Такое случается — верим в него и дальше.`,icon:'🤝'});
  }
  if(playerCandidates.length&&Math.random()<0.46){
    const c=pick(playerCandidates);
    this.publishNews({key:`coach-quote:${match.id}:${c.teamId}:context:${c.headline}`,category:'press',icon:c.icon,headline:c.headline,body:`${coachLabel(this.teamById(c.teamId))}: «${c.quote}»`,dateOffset:Number(match.dateOffset)||this.state.dayIndex,teamIds:[c.teamId],matchId:match.id});
  }
};


KHLManagerApp.prototype.renderAll = (function(base){return function(){base.call(this);if(this.state){this.ensureNewsState();this.renderNews();}};})(KHLManagerApp.prototype.renderAll);
KHLManagerApp.prototype.switchTab = (function(base){return function(name,button){base.call(this,name,button);if(name==='news')this.renderNews();};})(KHLManagerApp.prototype.switchTab);
KHLManagerApp.prototype.openPregame = (function(base){return function(matchId){if(this.state){this.ensureNewsState();const m=this.state.matches.find(x=>x.id===matchId);this.publishMatchPreviewNews(m);this.persistQuietly();}const r=base.call(this,matchId);this.renderNews();return r;};})(KHLManagerApp.prototype.openPregame);
KHLManagerApp.prototype.repairSave = (function(base){return function(){base.call(this);if(this.state){this.ensureNewsState();this.state.news=this.state.news.slice(0,600);this.persistQuietly();}};})(KHLManagerApp.prototype.repairSave);
KHLManagerApp.prototype.simulateMatch = (function(base){return function(match){if(!this.state||!match)return base.call(this,match);const wasPlayed=!!match.played;let priorTop=null;try{priorTop=this.currentTopLeagueScorer();}catch(e){}if(!wasPlayed)this.publishMatchPreviewNews(match);const result=base.call(this,match);if(!wasPlayed&&result?.played){this.publishMatchResultNews(result,priorTop,false);this.state.newsMeta.lastGeneratedAt=Date.now();this.persistQuietly();}return result;};})(KHLManagerApp.prototype.simulateMatch);
KHLManagerApp.prototype.completeLiveMatch = (function(base){return function(live){const id=live?.matchId||live?.simulatedMatch?.id;const before=this.state?.matches.find(m=>m.id===id)?.played;let priorTop=null;try{priorTop=this.currentTopLeagueScorer();}catch(e){}if(live?.simulatedMatch)this.publishMatchPreviewNews(live.simulatedMatch);const result=base.call(this,live);if(this.state&&id){const completed=this.state.matches.find(m=>m.id===id)||live.simulatedMatch;if(completed?.played&&!before){this.publishMatchResultNews(completed,priorTop,false);this.persistQuietly();this.renderNews();}}return result;};})(KHLManagerApp.prototype.completeLiveMatch);
KHLManagerApp.prototype.advanceDay = (function(base){return function(){const result=base.call(this);if(this.state){const tomorrow=Number(this.state.dayIndex||0)+1;for(const m of this.state.matches||[])if(!m.played&&!m.cancelled&&Number(m.dateOffset)===tomorrow)this.publishMatchPreviewNews(m);this.persistQuietly();this.renderNews();}return result;};})(KHLManagerApp.prototype.advanceDay);
