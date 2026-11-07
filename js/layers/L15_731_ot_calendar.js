/* KHL Manager Mobile 7.31 — OT faceoffs, calendar focus, end-of-regular-season flow and playoff schedule clarity. */
(function(){
  const proto=KHLManagerApp.prototype;

  // OT face-offs are derived from the actual event stream, not a fixed random 4–6 per game.
  const baseEnsureMatchStats731=proto.ensureMatchStats;
  proto.ensureMatchStats=function(match){
    const stats=baseEnsureMatchStats731.call(this,match);
    if(!match||!stats||!match.matchStats)return stats;
    const mstats=match.matchStats;
    const events=Array.isArray(match.events)?match.events:[];
    const isOT=e=>/^(ОТ|OT|4)$/i.test(String(e?.period||''));
    const eventHasOT=events.some(isOT);
    const hasOT=!!(match.ot||eventHasOT);

    // Shootout-only games end after regulation in this simulator: discard the old random OT row.
    // Older saves may already carry the v7.1 4–6 face-off estimate, so explicitly clear it once.
    if(!hasOT){
      if(match.so&&!mstats.faceoffOvertimeNoOTV731){
        stats.periodCount=3;
        for(const side of [stats.home,stats.away]){
          if(!side.faceoffs)side.faceoffs={total:0,periods:[0,0,0,0]};
          const periods=Array.isArray(side.faceoffs.periods)?side.faceoffs.periods.slice():[0,0,0,0];
          while(periods.length<4)periods.push(0);
          periods[3]=0;
          side.faceoffs.periods=periods.slice(0,4).map(n=>Math.max(0,Number(n)||0));
          side.faceoffs.total=side.faceoffs.periods.reduce((sum,n)=>sum+n,0);
        }
        mstats.faceoffOvertimeNoOTV731=true;
        mstats.faceoffOvertimeAdjustedV731=true;
        mstats.faceoffsOvertimeCombinedV731=0;
        this.persistQuietly();
      }
      return stats;
    }
    if(mstats.faceoffOvertimeAdjustedV731)return stats;

    const otEvents=[];
    for(const e of events){
      if(!isOT(e))continue;
      if(e.kind==='goal'){
        // Golden goal ends the OT event stream immediately.
        break;
      }
      if(e.kind==='shootout'||e.kind==='shootoutAttempt')break;
      if(e.kind==='faceoff')otEvents.push(e);
    }

    const validIds=[String(match.homeId),String(match.awayId)];
    let homeOT=0,awayOT=0;
    let faceoffCount=0;
    for(const e of otEvents){
      // The opening center-ice face-off used to be attributed to the home team by default.
      // Assign it once to a random winner and persist that attribution with the match.
      const opening=/начинается|начался|начало овертайма|начинается овертайм/i.test(String(e.text||'')) && /^00:00$/.test(String(e.time||''));
      let owner=String(e.teamId??'');
      if(opening){
        if(!validIds.includes(String(mstats.faceoffOvertimeOpeningWinnerV731||''))){
          mstats.faceoffOvertimeOpeningWinnerV731=Math.random()<0.5?String(match.homeId):String(match.awayId);
        }
        owner=String(mstats.faceoffOvertimeOpeningWinnerV731);
        e.teamId=owner;
      }else if(!validIds.includes(owner)){
        owner=Math.random()<0.5?String(match.homeId):String(match.awayId);
        e.teamId=owner;
      }
      if(owner===String(match.homeId))homeOT++;
      else if(owner===String(match.awayId))awayOT++;
      faceoffCount++;
    }
    // Legacy simulated matches sometimes have an OT goal but no explicit opening face-off event.
    // A match cannot reach a golden-goal overtime with fewer than one face-off.
    if(faceoffCount===0){
      const savedOwner=String(mstats.faceoffOvertimeOpeningWinnerV731||'');
      const owner=validIds.includes(savedOwner)?savedOwner:(Math.random()<0.5?String(match.homeId):String(match.awayId));
      mstats.faceoffOvertimeOpeningWinnerV731=owner;
      if(owner===String(match.homeId))homeOT=1;else awayOT=1;
    }

    stats.periodCount=Math.max(4,Number(stats.periodCount)||4);
    for(const [side,extra] of [[stats.home,homeOT],[stats.away,awayOT]]){
      if(!side.faceoffs)side.faceoffs={total:0,periods:[0,0,0,0]};
      const periods=Array.isArray(side.faceoffs.periods)?side.faceoffs.periods.slice():[];
      while(periods.length<4)periods.push(0);
      side.faceoffs.periods=periods.slice(0,4).map(n=>Math.max(0,Number(n)||0));
      side.faceoffs.periods[3]=extra;
      side.faceoffs.total=side.faceoffs.periods.reduce((sum,n)=>sum+n,0);
    }
    mstats.faceoffOvertimeAdjustedV731=true;
    mstats.faceoffsOvertimeCombinedV731=homeOT+awayOT;
    this.persistQuietly();
    return stats;
  };

  // Keep the upcoming fixture visible and show the current round/stage in the calendar header.
  const baseRenderSchedule731=proto.renderSchedule;
  proto.renderSchedule=function(){
    baseRenderSchedule731.call(this);
    if(!this.state)return;
    const all=(this.state.matches||[])
      .filter(m=>!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId)&&(typeof this.poGameVisible!=='function'||this.poGameVisible(m)))
      .sort((a,b)=>Number(a.dateOffset||0)-Number(b.dateOffset||0));
    const played=all.filter(m=>m.played).length;
    const next=all.find(m=>!m.played)||null;
    const getRound=m=>Number(m?.round)||Number((String(m?.id||'').match(/^m(\d+)_/)||[])[1]||0);
    const progress=document.getElementById('schedule-progress');
    if(progress){
      let current='Сезон завершён';
      if(next){
        if(next.playoff)current=`Кубок Гагарина · ${this.playoffStageName(Number(next.playoffStage||this.state.playoff?.stage||1))}`;
        else current=`Регулярный чемпионат · тур ${getRound(next)}`;
      }else if(this.state.playoff?.started&&!this.state.playoff.completed)current=`Кубок Гагарина · ${this.playoffStageName(this.state.playoff.stage)}`;
      let nextLabel='';
      if(next){
        const mine=String(next.homeId)===String(this.state.teamId);
        const opponent=this.teamById(mine?next.awayId:next.homeId);
        nextLabel=` · Далее: ${this.formatDate(next.dateOffset)} · ${opponent?.name||'соперник'} (${mine?'дома':'в гостях'})`;
      }
      progress.textContent=`${current} · сыграно ${played} из ${all.length}${nextLabel}`;
    }
    const scrollToUpcoming=()=>{
      const view=document.getElementById('view-schedule');
      if(!view?.classList.contains('active'))return;
      const scroller=document.querySelector('#schedule-list .schedule-history-scroll');
      const row=document.querySelector('#schedule-list .next-scheduled-match');
      if(!scroller||!row)return;
      const rowRect=row.getBoundingClientRect(),scrollRect=scroller.getBoundingClientRect();
      scroller.scrollTop+=rowRect.top-scrollRect.top-(scroller.clientHeight-row.clientHeight)/2;
    };
    if(document.getElementById('view-schedule')?.classList.contains('active'))setTimeout(scrollToUpcoming,0);
  };

  // The final regular-season match stays in Match Center. The user chooses when to open the Cup tab.
  const baseSwitchTab731=proto.switchTab;
  proto.switchTab=function(name,button){
    if(name==='playoffs'&&this._khl731KeepFinalRegularMatch)return;
    const pending=this.state?.pendingRegularObjectiveModal725;
    const armRegularGoalTimer=name==='playoffs'&&!!pending&&!!pending.waitForPlayoffsTab;
    const result=baseSwitchTab731.call(this,name,button);
    if(armRegularGoalTimer&&this.state?.pendingRegularObjectiveModal725===pending){
      pending.waitForPlayoffsTab=false;
      pending.dueAt=Date.now()+5000;
      this.persistQuietly();
      if(typeof this.objCountdown==='function')this.objCountdown(5000);
      this.ensurePendingRegularObjectiveModal725();
    }
    return result;
  };

  const baseEnsureRegularGoalTimer731=proto.ensurePendingRegularObjectiveModal725;
  if(typeof baseEnsureRegularGoalTimer731==='function')proto.ensurePendingRegularObjectiveModal725=function(){
    if(this.state?.pendingRegularObjectiveModal725?.waitForPlayoffsTab)return;
    return baseEnsureRegularGoalTimer731.call(this);
  };

  const baseFinishRegularSeason731=proto.finishRegularSeasonTransition;
  proto.finishRegularSeasonTransition=function(){
    if(!this.state)return baseFinishRegularSeason731.apply(this,arguments);
    const userRegularLeft=(this.state.matches||[]).some(m=>!m.playoff&&!m.played&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId));
    if(userRegularLeft)return baseFinishRegularSeason731.apply(this,arguments);
    this._khl731KeepFinalRegularMatch=true;
    let result=false;
    try{result=baseFinishRegularSeason731.apply(this,arguments);}
    finally{this._khl731KeepFinalRegularMatch=false;}
    if(result){
      let pending=this.state.pendingRegularObjectiveModal725;
      if(!pending&&this.state.objectiveModal?.kind==='regular'){
        pending={modal:{...this.state.objectiveModal},waitForPlayoffsTab:true};
        this.state.pendingRegularObjectiveModal725=pending;
        this.state.objectiveModal=null;
      }
      if(pending){
        if(this._khl725RegularModalTimer){clearTimeout(this._khl725RegularModalTimer);this._khl725RegularModalTimer=null;}
        pending.waitForPlayoffsTab=true;
        delete pending.dueAt;
        this.state.objectiveModal=null;
        this.persistQuietly();
        this.renderAll();
      }
    }
    return result;
  };

  // Add the requested standings shortcut beside the normal match controls after the regular season ends.
  const baseRenderMatchCenter731=proto.renderMatchCenter;
  proto.renderMatchCenter=function(){
    baseRenderMatchCenter731.call(this);
    const old=document.getElementById('go-standings-after-regular-731');
    if(old)old.remove();
    if(!this.state)return;
    const current=(this.state.matches||[]).find(m=>m.id===this.currentMatchId);
    const userHasRegularLeft=(this.state.matches||[]).some(m=>!m.playoff&&!m.played&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId));
    let regularDone=false;
    try{regularDone=typeof this.regularSeasonComplete==='function'&&this.regularSeasonComplete();}catch(_){regularDone=false;}
    if(!regularDone||userHasRegularLeft||!current||!current.played||current.playoff)return;
    const toolbars=Array.from(document.querySelectorAll('#view-match .toolbar'));
    const toolbar=toolbars.find(el=>el.querySelector('button[onclick*="finishMatchSim"]'));
    if(!toolbar)return;
    const button=document.createElement('button');
    button.type='button';button.id='go-standings-after-regular-731';button.className='btn';
    button.textContent='📊 Перейти во вкладку Турнирная таблица';
    button.addEventListener('click',()=>this.switchTab('standings'));
    toolbar.appendChild(button);
  };

  // Rebuild every stage card from the actual game number: seven fixed pips and four scheduled games at first.
  proto.renderPlayoffStagesHtml=function(){
    const po=this.state?.playoff;if(!po)return '';
    if(typeof this.auditPlayoffSeriesResults728==='function')this.auditPlayoffSeriesResults728(true);
    if(typeof this.__poReseedPlayoffCards729==='function')this.__poReseedPlayoffCards729(true);
    const byStage=new Map();
    const addSeries=(stage,name,series)=>{
      if(!byStage.has(stage))byStage.set(stage,{stage,name:name||this.playoffStageName(stage),series:[]});
      if(!byStage.get(stage).series.some(x=>x.id===series.id))byStage.get(stage).series.push(series);
    };
    for(const entry of (po.history||[]))for(const series of (entry.series||[]))addSeries(Number(entry.stage),entry.name,series);
    if(po.started&&po.series?.length)for(const series of po.series)addSeries(Number(po.stage),this.playoffStageName(po.stage),series);
    const stages=[...byStage.values()].sort((a,b)=>b.stage-a.stage);
    if(!stages.length)return '';
    return stages.map(stageInfo=>{
      const expected=typeof this.__poExpectedSeriesCount723==='function'?this.__poExpectedSeriesCount723(stageInfo.stage):0;
      const completeCount=stageInfo.series.filter(s=>s.complete).length;
      const full=stageInfo.series.length>=expected&&expected>0;
      const status=full&&completeCount===expected?'Завершённый раунд':full?'Серии продолжаются':`Определяются пары · ${stageInfo.series.length} из ${expected}`;
      const sorted=stageInfo.series.slice().sort((a,b)=>Number(a.seedA||999)-Number(b.seedA||999)||String(a.teamA).localeCompare(String(b.teamA)));
      const cards=sorted.map(series=>{
        const matchList=(this.state.matches||[]).filter(m=>m.playoff&&String(m.seriesId)===String(series.id)&&!m.cancelled).sort((x,y)=>Number(x.gameNo)-Number(y.gameNo));
        const matchByNo=new Map(matchList.map(m=>[Number(m.gameNo),m]));
        let data={winsA:Number(series.winsA)||0,winsB:Number(series.winsB)||0,complete:!!series.complete,winnerId:series.winnerId||null,results:series.gameResults||[]};
        if(typeof this.__poCanonicalizeSeries729==='function')data=this.__poCanonicalizeSeries729(series,false)||data;
        const a=this.teamById(series.teamA),b=this.teamById(series.teamB);
        const nameA=a?.name||series.teamA,nameB=b?.name||series.teamB;
        const winsA=Math.max(0,Number(data.winsA)||0),winsB=Math.max(0,Number(data.winsB)||0);
        const complete=!!data.complete||!!series.complete||winsA>=4||winsB>=4;
        const rawResults=Array.isArray(data.results)?data.results:(Array.isArray(series.gameResults)?series.gameResults:[]);
        const results=rawResults.map((game,index)=>{
          const no=Number(game.gameNo)||index+1;const match=matchByNo.get(no);
          if(match&&(!match.played||match.cancelled))return null;
          const homeId=game.homeId||match?.homeId||series.teamA;
          const awayId=game.awayId||match?.awayId||(homeId===series.teamA?series.teamB:series.teamA);
          const homeScore=Number(game.homeScore??match?.homeScore),awayScore=Number(game.awayScore??match?.awayScore);
          if(!Number.isFinite(homeScore)||!Number.isFinite(awayScore)||homeScore===awayScore)return null;
          return {...game,gameNo:no,homeId,awayId,homeScore,awayScore};
        }).filter(Boolean).sort((x,y)=>x.gameNo-y.gameNo);
        const resultMap=new Map(results.map(g=>[Number(g.gameNo),g]));
        const dots=teamId=>Array.from({length:7},(_,i)=>{
          const gameNo=i+1,game=resultMap.get(gameNo);
          if(!game)return `<span class="series-modern-dot is-empty" title="Игра ${gameNo}: ещё не сыграна" aria-label="Игра ${gameNo}: ещё не сыграна"></span>`;
          const winnerId=game.homeScore>game.awayScore?game.homeId:game.awayId;
          const won=String(winnerId)===String(teamId);
          const color=String(teamId)===String(series.teamA)?'green':'red';
          return `<span class="series-modern-dot ${won?`is-${color}`:'is-empty'}" title="Игра ${gameNo}: ${won?'победа':'поражение'}" aria-label="Игра ${gameNo}: ${won?'победа':'поражение'}"></span>`;
        }).join('');
        const teamLabel=(name,seed,id)=>`${this.escape(name)}${Number(seed)>0?` <span class="series-modern-seed">(#${Number(seed)})</span>`:''}${String(id)===String(this.state.teamId)?' <span class="series-modern-you" aria-label="Твоя команда">◀</span>':''}`;
        const resultChips=results.map(game=>{
          const winnerId=game.homeScore>game.awayScore?game.homeId:game.awayId;
          const isTeamAWin=String(winnerId)===String(series.teamA);
          const location=String(game.homeId)===String(series.teamA)?'Д':'Г';
          const extra=game.so?'Б':game.ot?'ОТ':'';
          const homeName=this.teamById(game.homeId)?.name||game.homeId,awayName=this.teamById(game.awayId)?.name||game.awayId;
          const outcome=isTeamAWin?nameA:nameB;
          return `<div class="series-modern-chip ${isTeamAWin?'win':'loss'}" title="Игра ${game.gameNo}: ${this.escape(homeName)} — ${this.escape(awayName)}, счёт хозяев ${game.homeScore}:${game.awayScore}. Победа: ${this.escape(outcome)}"><div class="series-modern-chip-top"><span>И${game.gameNo}</span><span class="series-modern-location">${location}</span></div><strong class="series-modern-score">${game.homeScore}:${game.awayScore}</strong>${extra?`<span class="series-modern-extra">${extra}</span>`:'<span class="series-modern-extra series-modern-extra-empty">&nbsp;</span>'}</div>`;
        }).join('');
        const upcoming=(this.state.matches||[]).filter(m=>m.playoff&&String(m.seriesId)===String(series.id)&&!m.played&&!m.cancelled).sort((x,y)=>Number(x.gameNo)-Number(y.gameNo));
        const playedCount=results.length;
        const scheduledToShow=complete?[]:(playedCount<4?upcoming.filter(m=>Number(m.gameNo)<=4):upcoming.slice(0,1));
        const scheduledChips=scheduledToShow.map(m=>{
          const location=String(m.homeId)===String(series.teamA)?'Д':'Г';
          const date=typeof this.playoffShortDate726==='function'?this.playoffShortDate726(m.dateOffset):this.formatDate(m.dateOffset);
          const homeName=this.teamById(m.homeId)?.name||m.homeId,awayName=this.teamById(m.awayId)?.name||m.awayId;
          return `<div class="series-modern-chip next" title="Игра ${Number(m.gameNo)}: ${this.escape(homeName)} — ${this.escape(awayName)}. ${this.escape(date)}"><div class="series-modern-chip-top"><span>И${Number(m.gameNo)}</span><span class="series-modern-location">${location}</span></div><strong class="series-modern-next-date">${this.escape(date||'Далее')}</strong></div>`;
        }).join('');
        const winnerId=data.winnerId||series.winnerId||(winsA>=4?series.teamA:winsB>=4?series.teamB:null);
        let summary='';
        if(complete){
          const winnerName=String(winnerId)===String(series.teamA)?nameA:nameB;
          const winnerWins=String(winnerId)===String(series.teamA)?winsA:winsB;
          const loserWins=String(winnerId)===String(series.teamA)?winsB:winsA;
          summary=`Серия завершена · ${this.escape(winnerName)} выиграл ${winnerWins}:${loserWins}`;
        }else if(winsA===0&&winsB===0)summary='Серия начинается · счёт 0:0';
        else if(winsA>winsB)summary=`Серия продолжается · ${this.escape(nameA)} ведёт ${winsA}:${winsB}`;
        else if(winsB>winsA)summary=`Серия продолжается · ${this.escape(nameB)} ведёт ${winsB}:${winsA}`;
        else summary=`Серия продолжается · счёт ${winsA}:${winsB}`;
        const nextMatch=upcoming[0];
        if(nextMatch&&!complete){
          const homeName=this.teamById(nextMatch.homeId)?.name||nextMatch.homeId,awayName=this.teamById(nextMatch.awayId)?.name||nextMatch.awayId;
          const date=typeof this.playoffShortDate726==='function'?this.playoffShortDate726(nextMatch.dateOffset):this.formatDate(nextMatch.dateOffset);
          summary+=` · И${Number(nextMatch.gameNo)} — ${this.escape(homeName)} дома, ${this.escape(awayName)} в гостях${date?`, ${this.escape(date)}`:''}`;
        }
        return `<article class="series-modern-card"><div class="series-modern-teams"><div class="series-modern-teamline"><div class="series-modern-team">${teamLabel(nameA,series.seedA,series.teamA)}</div><div class="series-modern-dots" aria-label="Победы ${this.escape(nameA)}">${dots(series.teamA)}</div></div><div class="series-modern-teamline"><div class="series-modern-team">${teamLabel(nameB,series.seedB,series.teamB)}</div><div class="series-modern-dots" aria-label="Победы ${this.escape(nameB)}">${dots(series.teamB)}</div></div></div><div class="series-modern-status ${complete?'complete':''}">${summary}</div><div class="series-modern-games">${resultChips}${scheduledChips}${!results.length&&!scheduledChips?'<span class="tiny muted">Расписание серии ещё не сформировано.</span>':''}</div></article>`;
      }).join('');
      const note=stageInfo.series.length<expected?'<p class="tiny muted">Пары добавляются по мере того, как определяются участники следующих раундов.</p>':'';
      return `<section class="playoff-stage"><div class="section-head"><div><h3>${this.escape(stageInfo.name||this.playoffStageName(stageInfo.stage))}</h3><p class="tiny muted">${status} · каждая серия до четырёх побед</p></div></div>${note}<div class="playoff-grid">${cards}</div></section>`;
    }).join('');
  };

  // Use the requested post-Cup message without the old regular-season-points sentence.
  const baseRenderPlayoffs731=proto.renderPlayoffs;
  proto.renderPlayoffs=function(){
    baseRenderPlayoffs731.call(this);
    if(this.state?.playoff?.completed){
      const banner=document.getElementById('playoffs-banner');
      if(banner)banner.textContent='Кубок Гагарина разыгран. Ознакомиться со статистикой можно, перейдя в соответствующую вкладку.';
    }
  };

  // Final render refresh: install the new controls and recalculate legacy overtime stats once.
  if(typeof app!=='undefined'&&app.state){
    try{app.renderAll();}catch(error){console.warn('KHL Manager 7.31 initial refresh:',error);}
  }
})();
