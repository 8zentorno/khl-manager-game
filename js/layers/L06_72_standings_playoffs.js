/* ================= KHL MANAGER 7.2 — standings, playoff readability and delayed objectives ================= */
(function(){
  // In overtime, keep the extra-time face-off count plausible: 4–6 across both teams combined.
  const baseEnsureMatchStats = KHLManagerApp.prototype.ensureMatchStats;
  KHLManagerApp.prototype.ensureMatchStats = function(match){
    const stats = baseEnsureMatchStats.call(this, match);
    if (!match || !stats || !(match.ot || match.so) || !stats.home?.faceoffs || !stats.away?.faceoffs) return stats;
    if (match.matchStats.faceoffOvertimeAdjustedV71) return stats;
    stats.periodCount = 4;
    const total = 4 + Math.floor(Math.random() * 3);
    // Keep at least one face-off for each side, with a combined total of 4–6.
    const homeOT = 1 + Math.floor(Math.random() * (total - 1));
    const awayOT = total - homeOT;
    for (const [side, extra] of [[stats.home, homeOT], [stats.away, awayOT]]) {
      if (!Array.isArray(side.faceoffs.periods)) side.faceoffs.periods = [0,0,0];
      while (side.faceoffs.periods.length < 4) side.faceoffs.periods.push(0);
      side.faceoffs.periods = side.faceoffs.periods.slice(0,4);
      side.faceoffs.periods[3] = extra;
      side.faceoffs.total = side.faceoffs.periods.reduce((sum,n)=>sum+(Number(n)||0),0);
    }
    match.matchStats.faceoffOvertimeAdjustedV71 = true;
    match.matchStats.faceoffsOvertimeCombined = total;
    this.persistQuietly();
    return stats;
  };

  // Build a league-wide table once every regular-season game has been completed.
  KHLManagerApp.prototype.renderOverallStandingsV71 = function(){
    const section = document.getElementById('overall-standings-section');
    const root = document.getElementById('full-overall');
    if (!section || !root || !this.state) return;
    const complete = this.regularSeasonComplete();
    if (!complete) { section.hidden = true; root.innerHTML = ''; return; }
    /* видимость «Лиги» задаёт renderStandingsTabs (только вкладка «Лига») */
    const rows = this.db.teams.map(team => ({...team, ...(this.state.standings?.[team.id] || {})})).sort((a,b)=>
      (Number(b.pts)||0)-(Number(a.pts)||0) ||
      (Number(b.regw)||0)-(Number(a.regw)||0) ||
      (((Number(b.gf)||0)-(Number(b.ga)||0))-((Number(a.gf)||0)-(Number(a.ga)||0))) ||
      (Number(b.gf)||0)-(Number(a.gf)||0) || a.name.localeCompare(b.name,'ru')
    );
    root.innerHTML = `<div class="table-wrap"><table class="data-table" style="min-width:850px"><thead><tr><th>#</th><th>Клуб</th><th>Конференция</th><th class="numeric">И</th><th class="numeric">В</th><th class="numeric">ВО</th><th class="numeric">ВБ</th><th class="numeric">П</th><th class="numeric">ПО</th><th class="numeric">ПБ</th><th class="numeric" style="text-align:center">Ш</th><th class="numeric" style="text-align:center">+/−</th><th class="numeric">О</th></tr></thead><tbody>${rows.map((team,i)=>`<tr class="${team.id===this.state.teamId?'user-row':''}"><td class="rank">${i+1}</td><td class="team-cell">${this.escape(team.name)}${team.id===this.state.teamId?' ◀':''}</td><td>${team.conf==='West'?'Запад':'Восток'}</td><td class="numeric">${Number(team.gp)||0}</td><td class="numeric">${Number(team.regw)||0}</td><td class="numeric">${Number(team.otw)||0}</td><td class="numeric">${Number(team.sow)||0}</td><td class="numeric">${Number(team.l)||0}</td><td class="numeric">${Number(team.otl)||0}</td><td class="numeric">${Number(team.sol)||0}</td><td class="numeric" style="text-align:center">${Number(team.gf)||0}:${Number(team.ga)||0}</td><td class="numeric" style="text-align:center">${(d=>d>0?'+'+d:d<0?'−'+Math.abs(d):'0')((Number(team.gf)||0)-(Number(team.ga)||0))}</td><td class="numeric"><b>${Number(team.pts)||0}</b></td></tr>`).join('')}</tbody></table></div>`;
  };
  const baseRenderStandings = KHLManagerApp.prototype.renderStandings;
  KHLManagerApp.prototype.renderStandings = function(){
    baseRenderStandings.call(this);
    this.renderOverallStandingsV71();
  };

  // Playoff previews name the round and the actual advancement at stake, not generic standings prose.
  KHLManagerApp.prototype.publishMatchPreviewNews = function(match){
    if(!this.state||!match||match.played||match.cancelled)return;
    const home=this.teamById(match.homeId),away=this.teamById(match.awayId);if(!home||!away)return;
    const matchRound=m=>Number(m.round)||Number((String(m.id||'').match(/^m(\d+)_/)||[])[1]||0);
    const openingRounds=(this.state.matches||[]).filter(m=>!m.playoff&&!m.cancelled&&matchRound(m)>0&&matchRound(m)<=2);
    const firstTwoRoundsComplete=openingRounds.length>0&&openingRounds.every(m=>m.played||m.cancelled);
    const scorersForTeam=(teamId,limit=2,playoff=false)=>this.teamPlayers(teamId).filter(p=>p.pos!=='G').map(p=>{
      const st=(playoff?this.state.playoff?.playerStats:this.state.playerStats)?.[p.id]||{};
      const g=Number(st.g)||0,a=Number(st.a)||0;return {p,g,a,pts:g+a};
    }).sort((x,y)=>y.pts-x.pts||y.g-x.g||y.a-x.a||x.p.name.localeCompare(y.p.name,'ru')).slice(0,limit)
      .map(x=>`${x.p.name} (${x.pts} оч.: ${x.g} гол. + ${x.a} пас.)`);
    let angle='';
    if(match.playoff){
      const stage=Number(match.playoffStage||this.state.playoff?.stage||1);
      const roundLabel=this.playoffStageName(stage);
      const nextStage=({1:'в четвертьфинал',2:'в полуфинал',3:'в финал Кубка Гагарина',4:'к завоеванию Кубка Гагарина'})[stage]||'в следующий раунд';
      const all=[...(this.state.playoff?.series||[]),...(this.state.playoff?.history||[]).flatMap(h=>h.series||[])];
      const series=all.find(x=>x.id===match.seriesId)||all.find(x=>(x.teamA===home.id&&x.teamB===away.id)||(x.teamA===away.id&&x.teamB===home.id));
      const score=series?`Текущий счёт в серии — ${(series.winsA||0)}:${(series.winsB||0)}.`:'';
      angle=`Матч раунда «${roundLabel}» Кубка Гагарина. Победитель серии продолжит борьбу ${nextStage}. ${score}`.trim();
    }else{
      const rh=this.conferenceRank(home.id),ra=this.conferenceRank(away.id);const gpH=Number(this.state.standings?.[home.id]?.gp)||0,gpA=Number(this.state.standings?.[away.id]?.gp)||0,gpMin=Math.min(gpH,gpA);
      if(gpH===0&&gpA===0)angle='Стартовый матч сезона 2026/27 для обеих команд.';else if(gpMin<3)angle='Начало сезона: турнирная таблица ещё формируется, каждое очко на счету.';else if(rh<=8&&ra<=8)angle='Обе команды находятся в зоне плей-офф и борются за более выгодную позицию.';
      else if(rh<=8&&ra>8)angle=`${this.tn(away,'dat')} нужна серия удачных результатов, чтобы вернуться в борьбу за топ-8.`;
      else if(ra<=8&&rh>8)angle=`${this.tn(home,'dat')} нужна серия удачных результатов, чтобы вернуться в борьбу за топ-8.`;
      else angle='Командам важно набирать очки, чтобы сократить отставание в турнирной таблице.';
    }
    if(!match.playoff&&firstTwoRoundsComplete){
      const topHome=scorersForTeam(home.id,2,false),topAway=scorersForTeam(away.id,2,false);
      if(topHome.length&&topAway.length)angle+=` Лучшие в командах по системе «гол+пас»: ${home.name} — ${topHome.join('; ')}. ${away.name} — ${topAway.join('; ')}.`;
    }
    if(match.playoff){
      const topHome=scorersForTeam(home.id,2,true),topAway=scorersForTeam(away.id,2,true);
      if(topHome.some(x=>!x.includes('(0 оч.:'))||topAway.some(x=>!x.includes('(0 оч.:'))){
        angle+=` Лидеры плей-офф по системе «гол+пас»: ${home.name} — ${topHome.join('; ')}. ${away.name} — ${topAway.join('; ')}.`;
      }
    }
    const item={key:`preview:${match.id}`,category:'preview',icon:'📣',headline:`Анонс: ${home.name} — ${away.name}`,body:`${match.playoff?'Кубок Гагарина':'Ближайшая игра регулярного чемпионата'} · ${this.formatDate(Number(match.dateOffset)||this.state.dayIndex)}. ${angle}`,dateOffset:Number(match.dateOffset)||this.state.dayIndex,teamIds:[home.id,away.id],matchId:match.id};
    const existing=(this.state.news||[]).find(n=>n.key===item.key);
    if(existing){Object.assign(existing,{category:item.category,icon:item.icon,headline:item.headline,body:item.body,dateOffset:item.dateOffset,teamIds:item.teamIds,matchId:item.matchId});return existing;}
    return this.publishNews(item);
  };

  // Make the series score easy to read from the perspective of the two teams displayed in the card.

  // Delay objective congratulations/failed-goal popups until the user has had 10 seconds to see the final score.
  const baseEvaluatePlayoffObjective=KHLManagerApp.prototype.evaluatePlayoffObjective;
  KHLManagerApp.prototype.evaluatePlayoffObjective=function(success,reason=''){
    const previous=this.state?.objectiveModal;
    baseEvaluatePlayoffObjective.call(this,success,reason);
    if(this.state?.objectiveModal?.kind==='playoff'){
      const modal={...this.state.objectiveModal};
      this.state.objectiveModal=null;
      this.state.pendingObjectiveModalV71={modal,dueAt:Date.now()+10000};
      this.persistQuietly();
      this.ensurePendingObjectiveModalV71();
    } else if(previous && !this.state?.objectiveModal) {
      // A separate regular-season modal must not be delayed by this playoff-only override.
    }
  };
  /* removed 8.0: overridden later */
  const baseRenderAllV71=KHLManagerApp.prototype.renderAll;
  KHLManagerApp.prototype.renderAll=function(){
    baseRenderAllV71.call(this);
    if(this.state){this.renderOverallStandingsV71();this.ensurePendingObjectiveModalV71();}
  };
  const baseRepairSaveV71=KHLManagerApp.prototype.repairSave;
  if(typeof baseRepairSaveV71==='function')KHLManagerApp.prototype.repairSave=function(){baseRepairSaveV71.call(this);this.ensurePendingObjectiveModalV71();};
})();
