/* ================= KHL MANAGER 6.11 — league-wide injury management =================
   Injuries are tracked for every club, affect simulated lineups and team strength,
   and medium-term recovery advances only when that player's own team plays.
*/
const __khl611BaseAssignInjury = KHLManagerApp.prototype.assignInjury;
KHLManagerApp.prototype.assignInjury = function(player, match, teamId, period, time, forcedSeverity=null){
  if(forcedSeverity!=='light') return __khl611BaseAssignInjury.call(this,player,match,teamId,period,time);
  if(!player||!this.state||!match)return null;
  const d=this.playerDev(player);
  if(!d||(d.injury&&this.isPlayerUnavailable(player)))return null;
  d.injury={severity:'light',gamesRemaining:0,daysRemaining:0,createdMatchId:match.id,createdDay:this.state.dayIndex||0,fromScuffle:true};
  const event={kind:'injury',teamId,playerId:player.id,severity:'light',period,time,text:`После стычки ${player.name} получил лёгкую травму и покидает текущий матч. К следующей игре хоккеист будет готов.`};
  match.injuries=(match.injuries||[]).concat([{playerId:player.id,teamId,severity:'light',gamesRemaining:0,daysRemaining:0,createdMatchId:match.id,fromScuffle:true}]);
  match.events=match.events||[];match.events.push(event);
  return {event,severity:'light',gamesRemaining:0,daysRemaining:0};
};

KHLManagerApp.prototype.maybeAddSimulatedInjury = function(match){
  if(!match||match.injuryApplied||!this.state)return;
  match.injuryApplied=true;
  match.injuries=match.injuries||[];
  match.events=match.events||[];
  const randomStamp=()=>{
    const n=Math.floor(Math.random()*60),period=Math.min(3,Math.floor(n/20)+1),minute=n%20;
    return {period:`${period}П`,time:`${String(minute).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`};
  };
  // Each club has its own injury chance; this covers every AI-vs-AI league match too.
  for(const teamId of [match.homeId,match.awayId]){
    const active=this.activeSkaters(teamId);
    const pool=[...(active.skaters||[]),active.goalie].filter(p=>p&&!this.isPlayerUnavailable(p)&&!this.playerDev(p)?.injury);
    if(Math.random()>=.11*(this.injuryTeamMul?this.injuryTeamMul(pool):1))continue;
    if(!pool.length)continue;
    const player=this.injuryPick?this.injuryPick(pool):pool[Math.floor(Math.random()*pool.length)],stamp=randomStamp();
    this.assignInjury(player,match,teamId,stamp.period,stamp.time);
  }
  // Other simulated games can also feature a scuffle, occasionally with a minor injury.
  if(Math.random()<this.SPECIAL_MODEL_PARAMS.quickScuffle){
    const home=this.activeSkaters(match.homeId),away=this.activeSkaters(match.awayId);
    const poolH=(home.skaters||[]).filter(p=>p&&!this.isPlayerUnavailable(p)&&!this.playerDev(p)?.injury);
    const poolA=(away.skaters||[]).filter(p=>p&&!this.isPlayerUnavailable(p)&&!this.playerDev(p)?.injury);
    if(poolH.length&&poolA.length){
      const p1=poolH[Math.floor(Math.random()*poolH.length)],p2=poolA[Math.floor(Math.random()*poolA.length)],serious=Math.random()<this.SPECIAL_MODEL_PARAMS.fightSerious,stamp=randomStamp();
      match.fights=(match.fights||[]).concat([{playerId:p1.id,opponentPlayerId:p2.id,teamId:match.homeId,serious}]);
      match.events.push({kind:'fight',teamId:match.homeId,playerId:p1.id,opponentPlayerId:p2.id,serious,gameMisconduct:serious,period:stamp.period,time:stamp.time,text:serious?`Серьёзная стычка между ${p1.name} и ${p2.name}. Судьи удаляют игроков до конца матча.`:`Стычка у борта между ${p1.name} и ${p2.name}. Игроки получают большие штрафы.`});
      if(Math.random()<.18){
        const candidates=[[match.homeId,p1],[match.awayId,p2]].filter(([tid,p])=>!this.playerDev(p)?.injury&&!this.isPlayerUnavailable(p));
        if(candidates.length){const [tid,p]=candidates[Math.floor(Math.random()*candidates.length)];this.assignInjury(p,match,tid,stamp.period,stamp.time,'light');}
      }
    }
  }
  match.events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));
  const final=match.events.find(e=>e.kind==='final');
  if(final){match.events=match.events.filter(e=>e!==final);match.events.push(final);}
};

// Decrease medium injury duration only when the injured player's own club plays.
KHLManagerApp.prototype.decrementInjuriesAfterMatch = function(match){
  if(!this.state||!match||match.injuryProcessed)return;
  const playingTeams=new Set([match.homeId,match.awayId]);
  for(const player of this.db.players){
    if(!playingTeams.has(player.teamId))continue;
    const d=this.playerDev(player),injury=d?.injury;
    if(!injury||injury.createdMatchId===match.id)continue;
    if(injury.severity==='medium'){
      const remaining=Number(injury.gamesRemaining||0);
      if(remaining>0){injury.gamesRemaining=Math.max(0,remaining-1);if(injury.gamesRemaining===0)delete d.injury;}
      else delete d.injury;
    }
    // Severe injuries recover through calendar days in advancePlayerDays().
  }
  match.injuryProcessed=true;
};

// Injured players must reduce the strength of AI as well as the user's team.
KHLManagerApp.prototype.getStrength = function(teamId){
  const roster=this.teamPlayers(teamId).filter(p=>!this.isPlayerUnavailable(p));
  const forwards=roster.filter(p=>['LW','C','RW'].includes(p.pos)&&this.playerLine(p)>=1&&this.playerLine(p)<=4).sort((a,b)=>this.playerLine(a)-this.playerLine(b)||this.effectiveOVR(b)-this.effectiveOVR(a)).slice(0,12);
  const defense=roster.filter(p=>p.pos==='D'&&this.playerLine(p)>=1&&this.playerLine(p)<=3).sort((a,b)=>this.playerLine(a)-this.playerLine(b)||this.effectiveOVR(b)-this.effectiveOVR(a)).slice(0,6);
  // 8.27.0: на место травмированного встаёт лучший здоровый запасной (раньше звено просто сокращалось, и сила считалась по оставшимся).
  {
    const used=new Set([...forwards,...defense].map(p=>p.id));
    const reserve=pos=>roster.filter(p=>pos(p)&&!used.has(p.id)).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
    for(const p of reserve(x=>['LW','C','RW'].includes(x.pos))){if(forwards.length>=12)break;forwards.push(p);used.add(p.id);}
    for(const p of reserve(x=>x.pos==='D')){if(defense.length>=6)break;defense.push(p);used.add(p.id);}
  }
  const goalies=roster.filter(p=>p.pos==='G').sort((a,b)=>{
    if(teamId===this.state?.teamId){if(a.id===this.state.starterGoalieId)return -1;if(b.id===this.state.starterGoalieId)return 1;}
    return this.effectiveOVR(b)-this.effectiveOVR(a);
  });
  const weighted=(arr,skill)=>arr.length?arr.reduce((sum,p)=>sum+(this.effectiveOVR(p)+(this.playerSkill(p,skill)-75)*.14)*(this.playerLine(p)===1?1.08:this.playerLine(p)===2?1.02:this.playerLine(p)===3?.96:.9),0)/arr.reduce((sum,p)=>sum+(this.playerLine(p)===1?1.08:this.playerLine(p)===2?1.02:this.playerLine(p)===3?.96:.9),0):75;
  const goalieRating=goalies.length?this.effectiveOVR(goalies[0])+(this.playerSkill(goalies[0],'goalkeeping')-75)*.16:72;
  const backupRating=goalies.length?this.effectiveOVR(goalies[1]||goalies[0])+(this.playerSkill(goalies[1]||goalies[0],'goalkeeping')-75)*.16:72;
  return {attack:weighted(forwards,'shooting'),defense:weighted(defense,'defense'),goalie:goalies.length?goalieRating*.72+backupRating*.28:72,goaliePlayers:goalies,topForwards:forwards,topDefense:defense,overall:forwards.length&&defense.length&&goalies.length?weighted(forwards,'shooting')*.43+weighted(defense,'defense')*.3+(goalieRating*.72+backupRating*.28)*.27:75};
};

// Show unavailable players for both teams before puck drop, based on actual league-wide injury state.
const __khl611BaseRenderPregame = KHLManagerApp.prototype.renderPregame;
KHLManagerApp.prototype.renderPregame = function(){
  __khl611BaseRenderPregame.call(this);
  if(!this.state)return;
  const match=this.state.matches.find(x=>x.id===(this.pendingMatchId||this.currentMatchId));
  const root=document.getElementById('pregame-editor');
  if(!match||match.played||!root||!root.querySelector('.pregame-banner'))return;
  root.querySelector('.pregame-injury-grid')?.remove();
  const renderTeam=(teamId)=>{
    const team=this.teamById(teamId);
    const unavailable=this.teamPlayers(teamId).filter(p=>this.isPlayerUnavailable(p)).sort((a,b)=>{
      const rank=p=>this.playerDev(p)?.injury?.severity==='severe'?0:1;
      return rank(a)-rank(b)||this.effectiveOVR(b)-this.effectiveOVR(a);
    });
    const list=unavailable.length?`<div class="pregame-injury-list">${unavailable.map(p=>`<div class="pregame-injury-player"><b>🩹 ${this.escape(p.name)}</b> · ${this.escape(this.positionLabel(p.pos))}<br><span class="muted">${this.escape(this.injuryDescription(p))}</span></div>`).join('')}</div>`:'<div class="pregame-injury-none">Все игроки доступны.</div>';
    return `<div class="pregame-injury-team"><h4>${this.escape(team?.name||'Команда')}</h4>${list}</div>`;
  };
  const report=`<div class="pregame-injury-grid" aria-label="Недоступные игроки обеих команд">${renderTeam(match.homeId)}${renderTeam(match.awayId)}</div>`;
  const start=root.querySelector('.pregame-start-actions');
  if(start)start.insertAdjacentHTML('beforebegin',report);else root.insertAdjacentHTML('beforeend',report);
};
