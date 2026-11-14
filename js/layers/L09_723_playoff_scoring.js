/* KHL Manager Mobile Edition 7.23 — playoff scoring, staggered rounds and bracket progress. */
KHLManagerApp.prototype.playoffGoalVariationFactor723=function(){
  const r=Math.random();
  return r<0.25?0.96:r<0.75?0.98:1.00;
};

KHLManagerApp.prototype.__poAllSeries723=function(stage){
  const po=this.state?.playoff;if(!po)return [];
  const found=[];
  for(const entry of (po.history||[]))if(Number(entry.stage)===Number(stage))for(const s of (entry.series||[]))found.push(s);
  if(Number(po.stage)===Number(stage))for(const s of (po.series||[]))if(!found.some(x=>x.id===s.id))found.push(s);
  return found;
};
KHLManagerApp.prototype.__poFindSeriesPair723=function(stage,a,b){
  return this.__poAllSeries723(stage).find(s=>(s.teamA===a&&s.teamB===b)||(s.teamA===b&&s.teamB===a))||null;
};
KHLManagerApp.prototype.__poExpectedSeriesCount723=function(stage){return ({1:8,2:4,3:2,4:1})[Number(stage)]||0;};
KHLManagerApp.prototype.__poCartOptions723=function(options){
  let out=[[]];
  for(const option of options){const next=[];for(const partial of out)for(const id of option)next.push([...partial,id]);out=next;if(out.length>40000)out=out.slice(0,40000);}
  return out;
};
KHLManagerApp.prototype.__poDeduplicateOutcomeSets723=function(sets){
  const map=new Map();
  for(const ids of sets){const clean=[...new Set(ids.filter(Boolean))];const key=clean.slice().sort((a,b)=>String(a).localeCompare(String(b))).join('|');if(!map.has(key))map.set(key,clean);}
  return [...map.values()];
};
KHLManagerApp.prototype.__poPossibleResultsAfterStage723=function(stage){
  if(stage<1||stage>3)return [];
  if(stage===1){
    const series=this.__poAllSeries723(1);if(!series.length)return [];
    const options=series.map(s=>s.complete&&s.winnerId?[s.winnerId]:[s.teamA,s.teamB]);
    return this.__poDeduplicateOutcomeSets723(this.__poCartOptions723(options));
  }
  const prior=this.__poPossibleResultsAfterStage723(stage-1),all=[];
  for(const winners of prior){
    const pairs=this.__poPairWinners723(winners);
    const options=pairs.map(p=>{const s=this.__poFindSeriesPair723(stage,p.teamA,p.teamB);return s?.complete&&s.winnerId?[s.winnerId]:[p.teamA,p.teamB];});
    if(options.length)all.push(...this.__poCartOptions723(options));
  }
  return this.__poDeduplicateOutcomeSets723(all);
};
KHLManagerApp.prototype.__poCompletedSourceWinner723=function(stage,teamId){
  return this.__poAllSeries723(stage).some(s=>s.complete&&s.winnerId===teamId);
};
KHLManagerApp.prototype.__poStablePairsForStage723=function(stage){
  const possibilities=this.__poPossibleResultsAfterStage723(stage-1);if(!possibilities.length)return [];
  const counts=new Map(),pairsByKey=new Map();
  for(const winners of possibilities){
    const pairs=this.__poPairWinners723(winners),seen=new Set();
    for(const pair of pairs){
      const ordered=[pair.teamA,pair.teamB].slice().sort((a,b)=>String(a).localeCompare(String(b))),key=ordered.join('|');
      seen.add(key);if(!pairsByKey.has(key))pairsByKey.set(key,pair);counts.set(key,(counts.get(key)||0)+1);
    }
  }
  const stable=[];
  for(const [key,count] of counts){if(count!==possibilities.length)continue;const p=pairsByKey.get(key);if(!p)continue;
    if(!this.__poCompletedSourceWinner723(stage-1,p.teamA)||!this.__poCompletedSourceWinner723(stage-1,p.teamB))continue;
    stable.push(p);
  }
  return stable.sort((a,b)=>a.seedA-b.seedA||a.seedB-b.seedB);
};
KHLManagerApp.prototype.__poStageContainer723=function(stage,create=false){
  const po=this.state?.playoff;if(!po)return null;
  if(Number(po.stage)===Number(stage))return po.series||(po.series=[]);
  let entry=(po.history||[]).find(x=>Number(x.stage)===Number(stage));
  if(!entry&&create){if(!po.history)po.history=[];entry={stage,name:this.playoffStageName(stage),series:[]};po.history.push(entry);}
  return entry?entry.series:(create?[]:null);
};
KHLManagerApp.prototype.__poLastSeriesDate723=function(stage,teamId){
  const series=this.__poAllSeries723(stage).find(s=>s.complete&&s.winnerId===teamId);if(!series)return Number(this.state?.dayIndex||0);
  const played=(this.state.matches||[]).filter(m=>m.playoff&&m.playoffStage===stage&&m.seriesId===series.id&&m.played&&!m.cancelled);
  return played.length?Math.max(...played.map(m=>Number(m.dateOffset||0))):Number(this.state?.dayIndex||0);
};
KHLManagerApp.prototype.__poAddSeries723=function(stage,pair,stagger=0){
  const po=this.state.playoff;
  if(this.__poFindSeriesPair723(stage,pair.teamA,pair.teamB))return null;
  if(stage>Number(po.stage||0)){
    const oldStage=Number(po.stage||0);
    if(oldStage>0&&po.series?.length&&!((po.history||[]).some(h=>Number(h.stage)===oldStage)))po.history.push({stage:oldStage,name:this.playoffStageName(oldStage),series:po.series});
    po.stage=stage;po.series=[];
  }
  let target=this.__poStageContainer723(stage,true);
  if(Number(po.stage)!==Number(stage))target=this.__poStageContainer723(stage,true);
  if(!target)return null;
  const sid=`po${stage}_${pair.teamA}_${pair.teamB}`;
  const series={id:sid,stage,name:this.playoffStageName(stage),teamA:pair.teamA,teamB:pair.teamB,seedA:pair.seedA,seedB:pair.seedB,conference:pair.conference||'overall',winsA:0,winsB:0,complete:false,winnerId:null,gameIds:[],gameResults:[]};
  let readyBase;
  if(stage===1)readyBase=Number(this.state.playoff.startDateOffset??(Math.max(...this.regularMatches().map(m=>m.dateOffset),Number(this.state.dayIndex||0))+3));
  else readyBase=Math.max(Number(this.state.dayIndex||0),this.__poLastSeriesDate723(stage-1,pair.teamA),this.__poLastSeriesDate723(stage-1,pair.teamB))+3;
  const seriesStart=readyBase+Math.max(0,Number(stagger)||0);
  for(let gameNo=1;gameNo<=7;gameNo++){
    const homeId=[1,2,5,7].includes(gameNo)?series.teamA:series.teamB,awayId=homeId===series.teamA?series.teamB:series.teamA;
    const match={id:`${sid}_g${gameNo}`,round:(this.state&&this.state.calendar?182:68)+stage*7+gameNo,dateOffset:seriesStart+(gameNo-1)*2,homeId,awayId,played:false,homeScore:null,awayScore:null,ot:false,so:false,homeShots:0,awayShots:0,events:[],playoff:true,playoffStage:stage,seriesId:sid,gameNo};
    this.state.matches.push(match);series.gameIds.push(match.id);
  }
  target.push(series);po.started=true;po.completed=false;this.state.seasonFinished=false;
  return series;
};
KHLManagerApp.prototype.createPlayoffStage=function(stage,participantIds=null){
  if(!this.state)return false;
  if(!this.state.playoff)this.state.playoff=this.emptyPlayoffState();
  const po=this.state.playoff;
  if(Number(stage)!==1){this.refreshPlayoffStages723();return true;}
  if(po.started&&this.__poAllSeries723(1).length)return true;
  po.started=true;po.completed=false;po.stage=1;po.history=[];po.series=[];
  const pairs=[];
  for(const conf of ['west','east']){
    const ranked=this.standingsFor(conf).slice(0,8);
    for(let i=0;i<4;i++)if(ranked[i]&&ranked[7-i])pairs.push({teamA:ranked[i].id,teamB:ranked[7-i].id,seedA:i+1,seedB:8-i,conference:conf});
  }
  const base=po.startDateOffset!=null&&Number.isFinite(Number(po.startDateOffset))?Number(po.startDateOffset):Math.max(...this.regularMatches().map(m=>m.dateOffset),Number(this.state.dayIndex||0))+3;
  po.stageStartOffset=base;
  pairs.forEach((pair,i)=>this.__poAddSeries723(1,pair,i%3));
  this.state.seasonFinished=false;this.persistQuietly();return true;
};
KHLManagerApp.prototype.recordPlayoffResult=function(match){
  if(!this.state||!match?.playoff||match.playoffRecorded||match.cancelled)return;
  const po=this.state.playoff;if(!po?.started||po.completed)return;
  const series=[...(po.series||[]),...(po.history||[]).flatMap(h=>h.series||[])].find(s=>s.id===match.seriesId);
  if(!series||series.complete||match.homeScore==null||match.awayScore==null||match.homeScore===match.awayScore)return;
  if((series.gameResults||[]).some(g=>Number(g.gameNo)===Number(match.gameNo))){match.playoffRecorded=true;return;}
  const winner=match.homeScore>match.awayScore?match.homeId:match.awayId;
  if(winner===series.teamA)series.winsA=(series.winsA||0)+1;else if(winner===series.teamB)series.winsB=(series.winsB||0)+1;
  series.gameResults=series.gameResults||[];
  series.gameResults.push({gameNo:match.gameNo,homeId:match.homeId,awayId:match.awayId,homeScore:match.homeScore,awayScore:match.awayScore,ot:!!match.ot,so:!!match.so});
  match.playoffRecorded=true;
  let seriesFinished=false;
  if(series.winsA>=4||series.winsB>=4){
    seriesFinished=true;series.complete=true;series.winnerId=series.winsA>=4?series.teamA:series.teamB;
    for(const id of (series.gameIds||[])){const future=this.state.matches.find(m=>m.id===id);if(future&&Number(future.gameNo)>Number(match.gameNo)&&!future.played){future.cancelled=true;future.played=true;}}
    if(typeof this.assessPlayoffObjectiveSeries==='function')this.assessPlayoffObjectiveSeries(series);
  }
  if(seriesFinished)this.refreshPlayoffStages723();
  const finalSeries=this.__poAllSeries723(4).find(s=>s.complete);
  if(finalSeries){
    po.completed=true;po.championId=finalSeries.winnerId;this.state.seasonFinished=true;
    for(const m of this.state.matches)if(m.playoff&&!m.played&&!m.cancelled){m.cancelled=true;m.played=true;}
    if(!this.state.teamObjective?.evaluated&&typeof this.evaluateTeamObjective==='function')this.evaluateTeamObjective();
    if(po.championId===this.state.teamId&&!this.state.playoffObjective?.evaluated&&this.state.playoffObjective?.selected&&typeof this.evaluatePlayoffObjective==='function')this.evaluatePlayoffObjective(true,'Команда выиграла Кубок Гагарина!');
    this.setNotice(`🏆 ${this.teamById(po.championId)?.name||'Клуб'} — обладатель Кубка Гагарина!`);
  }
  this.persistQuietly();
};

KHLManagerApp.prototype.renderPlayoffs=function(){
  const root=document.getElementById('playoffs-content'),banner=document.getElementById('playoffs-banner');if(!root||!this.state)return;
  const po=this.state.playoff||this.emptyPlayoffState();
  if(!po.started){banner.textContent='Плей-офф начнётся автоматически после того, как будут сыграны все матчи регулярного чемпионата.';root.innerHTML='<div class="card"><div class="empty">🏒 Регулярный чемпионат ещё продолжается. В Кубок Гагарина выйдут восемь лучших команд Запада и восемь лучших Востока.</div></div>';return;}
  if(po.completed){banner.textContent='Кубок Гагарина разыгран. Регулярные очки не меняются после завершения чемпионата.';const champ=this.teamById(po.championId);root.innerHTML=`<div class="playoff-champion"><div class="cup">🏆</div><div class="eyebrow">Кубок Гагарина</div><h2>${this.escape(champ?.name||'Чемпион не определён')}</h2><p class="muted">Чемпион Кубка Гагарина сезона 2026/27</p></div>${this.renderPlayoffStagesHtml()}`;return;}
  const next=this.state.matches.filter(m=>m.playoff&&!m.played&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId)).sort((a,b)=>a.dateOffset-b.dateOffset)[0];
  if(next)banner.innerHTML=`<b>${this.playoffStageName(next.playoffStage)}</b> · Серии до четырёх побед. Следующая игра твоей команды: ${this.formatDate(next.dateOffset)} — ${this.escape(this.teamById(next.homeId)?.name||'')} — ${this.escape(this.teamById(next.awayId)?.name||'')}. <button class="btn btn-primary" style="margin-left:.5rem" onclick="app.playNextMatch()">▶ Играть следующую игру</button>`;
  else banner.innerHTML=`<b>Кубок Гагарина</b> · Твоя серия завершена либо следующая пара ещё определяется. Остальные серии продолжаются, сетка обновится после подтверждения участников. <button class="btn btn-primary" style="margin-left:.5rem" onclick="app.playNextMatch()">▶ Продолжить турнир</button>`;
  root.innerHTML=this.renderPlayoffStagesHtml();
};

KHLManagerApp.prototype.playNextMatch=function(){
  if(!this.state)return;
  if(typeof this.ensureObjectiveStateForCurrentSave==='function')this.ensureObjectiveStateForCurrentSave();
  if(this.state.objectiveModal?.kind==='regular-choice'){this.renderObjectiveModal();return;}
  this.ensurePlayoffsStarted();
  let nextUser=()=>this.state.matches.filter(m=>!m.played&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId)).sort((a,b)=>a.dateOffset-b.dateOffset)[0]||null;
  let next=nextUser();
  const userRegularLeft=this.state.matches.some(m=>!m.playoff&&!m.played&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId));
  if(!next&&!userRegularLeft&&!this.state.playoff?.started){if(typeof this.finishRegularSeasonTransition==='function')this.finishRegularSeasonTransition();return;}
  if(!next&&!this.state.playoff?.started){const left=this.regularMatches().filter(m=>!m.played&&!m.cancelled).sort((a,b)=>a.dateOffset-b.dateOffset);for(const m of left){for(let d=(this.state.dayIndex||0)+1;d<=m.dateOffset;d++){this.state.dayIndex=d;this.advancePlayerDays(1);this.simulateMatchesAt(d,false);}if(!m.played&&!m.cancelled)this.simulateMatch(m);}this.ensurePlayoffsStarted();next=nextUser();}
  let guard=0;
  while(!next&&this.state.playoff?.started&&!this.state.playoff.completed&&guard++<1500){
    this.refreshPlayoffStages723();
    let global=this.state.matches.filter(m=>m.playoff&&!m.played&&!m.cancelled).sort((a,b)=>a.dateOffset-b.dateOffset)[0];
    if(!global){this.refreshPlayoffStages723();global=this.state.matches.filter(m=>m.playoff&&!m.played&&!m.cancelled).sort((a,b)=>a.dateOffset-b.dateOffset)[0];if(!global)break;}
    const target=Math.max(Number(this.state.dayIndex||0),Number(global.dateOffset||0));
    if(target<=Number(this.state.dayIndex||0)){const count=this.simulateMatchesAt(target,false);if(!count&&!global.played&&!global.cancelled)this.simulateMatch(global);}
    else for(let d=Number(this.state.dayIndex||0)+1;d<=target;d++){this.state.dayIndex=d;this.advancePlayerDays(1);this.simulateMatchesAt(d,false);}
    this.refreshPlayoffStages723();next=nextUser();
  }
  if(!next){
    if(this.state.playoff?.completed){this.state.seasonFinished=true;this.setNotice(`🏆 Кубок Гагарина завоёван командой ${this.teamById(this.state.playoff.championId)?.name||'—'}.`);this.switchTab('playoffs');}
    else this.setNotice('Пока не определилась следующая пара твоей команды. Симулируются оставшиеся серии Кубка Гагарина.');
    this.persistQuietly();this.renderAll();return;
  }
  const target=Number(next.dateOffset||this.state.dayIndex||0);
  if(target>Number(this.state.dayIndex||0)){
    for(let d=Number(this.state.dayIndex||0)+1;d<target;d++){this.state.dayIndex=d;this.advancePlayerDays(1);this.simulateMatchesAt(d,false);}
    if(this.state.dayIndex<target){this.state.dayIndex=target;this.advancePlayerDays(1);this.simulateMatchesAt(target,true);}
  }else this.simulateMatchesAt(Number(this.state.dayIndex||0),true);
  if(next.played||next.cancelled){next=nextUser();if(!next){this.persistQuietly();this.renderAll();return;}}
  this.openPregame(next.id);this.persistQuietly();
  if(this.state.playoff?.completed){this.switchTab('playoffs');this.renderAll();}
};

const __khl723BaseRenderAll=KHLManagerApp.prototype.renderAll;
KHLManagerApp.prototype.renderAll=function(){
  __khl723BaseRenderAll.call(this);
  if(!this.state||!this.state.playoff?.started||this.state.playoff.completed)return;
  const head=document.getElementById('dash-headline');if(!head)return;
  const next=this.state.matches.filter(m=>m.playoff&&!m.played&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId)).sort((a,b)=>a.dateOffset-b.dateOffset)[0];
  head.textContent=next?`Кубок Гагарина · ${this.playoffStageName(next.playoffStage)}`:'Кубок Гагарина · ожидание следующей пары';
};
