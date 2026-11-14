/* KHL Manager Mobile Edition 7.24 — goalie rotation and statistics. */
(function(){
  const proto=KHLManagerApp.prototype;

  proto.goalieRatingForMatch724=function(goalie){
    if(!goalie)return 72;
    return this.effectiveOVR(goalie)+(this.playerSkill(goalie,'goalkeeping')-75)*.16;
  };

  proto.chooseGoalieForMatch724=function(teamId,match){
    const teamGoalies=this.teamPlayers(teamId).filter(p=>p.pos==='G'&&!(this.isPlayerUnavailable&&this.isPlayerUnavailable(p)));
    if(!teamGoalies.length)return null;
    const base=this.activeSkaters(teamId);
    let starter=base?.goalie&&teamGoalies.find(p=>String(p.id)===String(base.goalie.id));
    const isMyTeam=teamId===this.state?.teamId;
    if(!starter&&isMyTeam){
      starter=teamGoalies.find(p=>String(p.id)===String(this.state.starterGoalieId));
    }
    if(!starter)starter=teamGoalies.slice().sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a))[0];
    // 14.7.22: свой клуб выбирает вратаря на каждую игру вручную — ротация (ниже) здесь не
    // применяется, кто выбран, тот и играет. Для ИИ-клубов ротация остаётся прежней.
    if(isMyTeam)return starter;
    const backups=teamGoalies.filter(p=>String(p.id)!==String(starter.id)).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
    const backup=backups[0];
    if(!backup)return starter;

    const playoff=!!match?.playoff;
    const phaseStats=playoff?(this.state.playoff?.playerStats||{}):(this.state.playerStats||{});
    const mainGP=Number(phaseStats[starter.id]?.goalieGP)||0;
    const backupGP=Number(phaseStats[backup.id]?.goalieGP)||0;
    const teamGP=playoff
      ? (this.state.matches||[]).filter(m=>m.playoff&&m.played&&!m.cancelled&&(m.homeId===teamId||m.awayId===teamId)).length
      : Number(this.state.standings?.[teamId]?.gp)||0;
    const fatigue=Number(this.playerDev(starter)?.fatigue)||0;

    // 14.7.30: доля игр бэкапа зависит от разрыва в классе между вратарями (effectiveOVR,
    // пересчитывается на каждый матч — поэтому прокачка/спад формы сами сдвигают баланс со
    // временем). Плавная шкала без резкой границы: gap≈0 — почти тандем (~30 игр из сезона
    // ~68 у бэкапа), gap>=gapCap — бэкап остаётся вторым номером (~20 игр).
    const gap=Math.max(0,this.effectiveOVR(starter)-this.effectiveOVR(backup));
    const gapCap=6,highGames=30,lowGames=20;
    const gapFactor=this.clamp(gap/gapCap,0,1);
    const targetBackupGames=highGames-(highGames-lowGames)*gapFactor;
    const seasonTotal=playoff?null:((this.state.matches||[]).filter(m=>!m.playoff&&(m.homeId===teamId||m.awayId===teamId)).length||68);
    const backupShare=playoff?(.16-.08*gapFactor):this.clamp(targetBackupGames/seasonTotal,.05,.6);

    let chance=backupShare;
    chance+=this.clamp((fatigue-25)*.0065,0,.22);
    if(fatigue>=55)chance=Math.max(chance,.62);
    if(fatigue>=70)chance=Math.max(chance,.84);
    if(mainGP-backupGP>=4)chance+=.08;
    if(mainGP-backupGP>=7)chance+=.14;

    const phaseMatches=(this.state.matches||[]).filter(m=>m.played&&!m.cancelled&&!!m.playoff===playoff&&(m.homeId===teamId||m.awayId===teamId)&&Number(m.dateOffset)<Number(match?.dateOffset));
    phaseMatches.sort((a,b)=>Number(b.dateOffset)-Number(a.dateOffset));
    const previous=phaseMatches[0];
    if(previous&&Number(match?.dateOffset)-Number(previous.dateOffset)<=2)chance+=.20;

    let losingStreak=0;
    for(const m of phaseMatches.slice(0,4)){
      const scoreFor=String(m.homeId)===String(teamId)?Number(m.homeScore)||0:Number(m.awayScore)||0;
      const scoreAgainst=String(m.homeId)===String(teamId)?Number(m.awayScore)||0:Number(m.homeScore)||0;
      if(scoreFor<scoreAgainst)losingStreak++;else break;
    }
    if(losingStreak>=2)chance+=.05;
    if(losingStreak>=3)chance+=.05;
    // Жёсткий потолок в конце (после всех бонусов усталости/серии) — иначе они сами по себе
    // разгоняют бэкапа к паритету со стартёром за сезон. Пороги привязаны не к абсолютной цели
    // на весь сезон, а к ожидаемому числу игр «по текущему темпу» (teamGP+1)*backupShare —
    // иначе бэкап набирает весь лимит ещё в первой трети сезона и дальше просто не играет.
    if(!playoff){
      const expectedByNow=Math.max(1,Math.ceil((teamGP+1)*backupShare));
      if(backupGP>=expectedByNow+3)chance=fatigue>=82?.58:.01;
      else if(backupGP>=expectedByNow+1)chance=Math.min(chance,fatigue>=72?.48:.10);
      else if(backupGP>=expectedByNow-1)chance=Math.min(chance,fatigue>=60?.52:.18);
    }
    chance=this.clamp(chance,.01,.88);
    return Math.random()<chance?backup:starter;
  };

  proto.withGoalieRotationForMatch724=function(match,callback){
    if(!this.state||!match||typeof callback!=='function')return callback();
    const oldContext=this._goalieRotationContext724;
    const originalGetStrength=this.getStrength;
    // Cache the default starters, then choose both goalies before overriding activeSkaters.
    this._goalieRotationContext724=null;
    let chosen,defaultHome,defaultAway;
    try{
      defaultHome=this.activeSkaters(match.homeId)?.goalie||null;
      defaultAway=this.activeSkaters(match.awayId)?.goalie||null;
      chosen={};
      chosen[match.homeId]=this.chooseGoalieForMatch724(match.homeId,match);
      chosen[match.awayId]=this.chooseGoalieForMatch724(match.awayId,match);
    }catch(e){this._goalieRotationContext724=oldContext;throw e;}
    this._goalieRotationContext724=chosen;
    match.goalieHomeId=chosen[match.homeId]?.id||null;
    match.goalieAwayId=chosen[match.awayId]?.id||null;
    match.goalieRotatedHome=String(chosen[match.homeId]?.id||'')!==String(defaultHome?.id||'');
    match.goalieRotatedAway=String(chosen[match.awayId]?.id||'')!==String(defaultAway?.id||'');
    this.getStrength=function(teamId){
      const result=originalGetStrength.call(this,teamId);
      const goalie=this._goalieRotationContext724?.[teamId];
      if(!goalie)return result;
      const actual=this.goalieRatingForMatch724(goalie),delta=actual-(Number(result.goalie)||72);
      return {...result,goalie:actual,overall:this.clamp((Number(result.overall)||75)+delta*.27,45,99)};
    };
    try{return callback();}
    finally{this.getStrength=originalGetStrength;this._goalieRotationContext724=oldContext;}
  };

  const baseActiveSkaters724=proto.activeSkaters;
  proto.activeSkaters=function(teamId){
    const active=baseActiveSkaters724.call(this,teamId);
    const context=this._goalieRotationContext724;
    if(context&&Object.prototype.hasOwnProperty.call(context,teamId)&&context[teamId])return {...active,goalie:context[teamId]};
    return active;
  };

  const baseSimulateMatch724=proto.simulateMatch;
  proto.simulateMatch=function(match){
    if(match?.playoff)return baseSimulateMatch724.call(this,match);
    if(!match||match.played||match.cancelled)return baseSimulateMatch724.call(this,match);
    return this.withGoalieRotationForMatch724(match,()=>baseSimulateMatch724.call(this,match));
  };

  const baseSimulatePlayoffGame724=proto.simulatePlayoffGame;
  proto.simulatePlayoffGame=function(match){
    if(!match||match.played||match.cancelled)return baseSimulatePlayoffGame724.call(this,match);
    return this.withGoalieRotationForMatch724(match,()=>baseSimulatePlayoffGame724.call(this,match));
  };

  const baseSaveLineupAndStart724=proto.saveLineupAndStart;
  proto.saveLineupAndStart=function(){
    if(!this.state||this.liveMatch&&!this.liveMatch.finished)return baseSaveLineupAndStart724.call(this);
    const match=(this.state.matches||[]).find(m=>m.id===(this.pendingMatchId||this.currentMatchId));
    if(!match||match.played||match.cancelled)return baseSaveLineupAndStart724.call(this);
    return this.withGoalieRotationForMatch724(match,()=>baseSaveLineupAndStart724.call(this));
  };

  const baseCompleteLiveMatch724=proto.completeLiveMatch;
  if(typeof baseCompleteLiveMatch724==='function')proto.completeLiveMatch=function(live){
    const match=(this.state?.matches||[]).find(m=>m.id===(live?.matchId||live?.simulatedMatch?.id));
    if(!match||(!match.goalieHomeId&&!match.goalieAwayId))return baseCompleteLiveMatch724.call(this,live);
    const old=this._goalieRotationContext724;
    const players=this.db.players;
    this._goalieRotationContext724={
      [match.homeId]:players.find(p=>String(p.id)===String(match.goalieHomeId)&&p.pos==='G')||null,
      [match.awayId]:players.find(p=>String(p.id)===String(match.goalieAwayId)&&p.pos==='G')||null
    };
    try{return baseCompleteLiveMatch724.call(this,live);}
    finally{this._goalieRotationContext724=old;}
  };

  // Add compatibility defaults for old saves, without resetting existing statistics.
  const baseRepairSave724=proto.repairSave;
  if(typeof baseRepairSave724==='function')proto.repairSave=function(){
    const result=baseRepairSave724.apply(this,arguments);
    for(const stats of [this.state?.playerStats,this.state?.playoff?.playerStats])if(stats)for(const rec of Object.values(stats))if(rec&&rec.shutouts==null)rec.shutouts=0;
    return result;
  };
})();
