/* ================= KHL MANAGER 7.0 — match stats and late timeout ================= */
(function(){
  const splitTotal = (total, count) => {
    total = Math.max(0, Math.round(Number(total) || 0));
    if (!count) return [];
    if (count === 1) return [total];
    const weights = Array.from({length: count}, () => 0.72 + Math.random() * 0.56);
    const weightSum = weights.reduce((a,b)=>a+b,0);
    const exact = weights.map(w => total*w/weightSum);
    const values = exact.map(Math.floor);
    let left = total-values.reduce((a,b)=>a+b,0);
    exact.map((v,i)=>({i,frac:v-values[i]})).sort((a,b)=>b.frac-a.frac).slice(0,left).forEach(x=>values[x.i]++);
    return values;
  };
  const periodIndex = (period, hasOT) => {
    if (period === 'ОТ') return hasOT ? 3 : 2;
    const n = Number.parseInt(String(period||''),10);
    return Number.isFinite(n) ? Math.max(0,Math.min(2,n-1)) : 0;
  };
  KHLManagerApp.prototype.ensureMatchStats = function(match){
    if(!match)return null;
    const hasSaved=!!(match.matchStats?.home&&match.matchStats?.away);
    const hasOT=!!(match.ot||match.so||(match.events||[]).some(e=>e.period==='ОТ'||e.period==='Б'));
    const periodCount=Math.max(hasOT?4:3,Number(match.matchStats?.periodCount)||0);
    const mkSide=()=>({
      shots:{total:0,periods:[]},faceoffs:{total:0,periods:[]},blocks:{total:0,periods:[]},hits:{total:0,periods:[]},penalties:{total:0,periods:Array(periodCount).fill(0)}
    });
    let home=hasSaved?match.matchStats.home:mkSide();
    let away=hasSaved?match.matchStats.away:mkSide();
    const sides={[String(match.homeId)]:home,[String(match.awayId)]:away};
    const prepare=(side,key,total)=>{
      if(!side[key])side[key]={total:0,periods:[]};
      if(!Array.isArray(side[key].periods)||(!hasSaved&&side[key].periods.length!==periodCount)){
        side[key].total=Math.max(0,Math.round(Number(total)||0));
        side[key].periods=splitTotal(side[key].total,periodCount);
      }
    };
    if(!hasSaved){
      prepare(home,'shots',match.homeShots||0);prepare(away,'shots',match.awayShots||0);
      const homeFaceoffs=23+Math.floor(Math.random()*10),awayFaceoffs=23+Math.floor(Math.random()*10);
      prepare(home,'faceoffs',homeFaceoffs);prepare(away,'faceoffs',awayFaceoffs);
      prepare(home,'blocks',Math.max(3,Math.round((Number(match.awayShots)||0)*(.23+Math.random()*.15))));
      prepare(away,'blocks',Math.max(3,Math.round((Number(match.homeShots)||0)*(.23+Math.random()*.15))));
      prepare(home,'hits',18+Math.floor(Math.random()*17));prepare(away,'hits',18+Math.floor(Math.random()*17));
    }else{
      for(const [side,key,total] of [[home,'shots',match.homeShots],[away,'shots',match.awayShots]])prepare(side,key,total||0);
      for(const side of [home,away])for(const key of ['faceoffs','blocks','hits'])prepare(side,key,side[key]?.total||0);
    }
    const resetPenalty=side=>{side.penalties={total:0,periods:Array(periodCount).fill(0)};};
    resetPenalty(home);resetPenalty(away);
    const addPenalty=(teamId,period,minutes)=>{
      const side=sides[String(teamId)];if(!side)return;
      const ix=periodIndex(period,periodCount===4);
      side.penalties.periods[Math.min(side.penalties.periods.length-1,ix)]+=Math.max(0,Number(minutes)||0);
    };
    const minutesByType=type=>({minor:2,doubleMinor:4,major:5,majorDkm:5,misconduct:10,gameMisconduct:0,penaltyShot:0}[String(type||'minor')]??2);
    const seen=new Set(),seenSemantic=new Set();
    const addRecord=(record,fallbackPeriod=null,fallbackId=null,fallbackTime=null)=>{
      if(!record)return;
      const id=String(record.penaltyId||record.id||fallbackId||'');
      if(id&&seen.has(id))return;
      const teamId=record.teamId;
      if(teamId==null)return;
      const period=record.period||fallbackPeriod||'1П';
      const minutesRaw=record.penaltyMinutes??record.minutes;
      const minutes=minutesRaw!==undefined&&minutesRaw!==null&&Number.isFinite(Number(minutesRaw))?Math.max(0,Number(minutesRaw)):minutesByType(record.type);
      const playerId=record.playerId==null?'':String(record.playerId);
      const playerName=String(record.playerName||'').trim().toLocaleLowerCase('ru-RU');
      const time=String(record.time||fallbackTime||'');
      const identity=playerId?`id:${playerId}`:playerName?`name:${playerName}`:'unknown';
      const signature=[String(teamId),identity,String(period),time,String(minutes)].join('|');
      if(seenSemantic.has(signature))return;
      seenSemantic.add(signature);
      if(id)seen.add(id);
      addPenalty(teamId,period,minutes);
    };
    const teamIdFromName=name=>{
      const value=String(name||'').trim();
      for(const tid of [match.homeId,match.awayId]){
        const team=this.teamById(tid);
        if(team&&String(team.name||'').trim()===value)return tid;
      }
      return null;
    };
    const inferLegacyRecords=(event,index)=>{
      const text=String(event.text||'');
      const found=[];
      const patterns=[
        /([^;.!]+?)\s*\(([^()]+)\)\s*удал[её]н(?:а)?\s+на\s+(\d+)\s+минут(?:а|ы|у)?(?:\s*\([^)]*\))?\s+за\s+([^;.!]+)/giu,
        /([^;.!]+?)\s*\(([^()]+)\)\s*получил(?:а)?\s+дисциплинарный штраф\s+на\s+(\d+)\s+минут(?:а|ы|у)?(?:\s+за\s+([^;.!]+))?/giu
      ];
      for(const regex of patterns){
        let matchText;
        while((matchText=regex.exec(text))!==null){
          const playerName=String(matchText[1]||'').trim(),teamName=String(matchText[2]||'').trim(),minutes=Number(matchText[3])||0;
          const teamId=teamIdFromName(teamName);
          if(teamId==null||!minutes)continue;
          const id=Array.isArray(event.penaltyIds)?event.penaltyIds[found.length]:null;
          const type=Array.isArray(event.penaltyTypes)?event.penaltyTypes[found.length]:minutes===5?'major':minutes===4?'doubleMinor':minutes===10?'misconduct':'minor';
          const player=this.db.players.find(p=>String(p.name||'').trim()===playerName&&String(p.teamId)===String(teamId))||this.db.players.find(p=>String(p.name||'').trim()===playerName);
          found.push({id:id||`legacy:${index}:${teamId}:${playerName}:${minutes}`,penaltyId:id||`legacy:${index}:${teamId}:${playerName}:${minutes}`,teamId,playerId:player?.id??null,playerName,type,minutes,penaltyMinutes:minutes,period:event.period||'1П',time:event.time||null});
        }
      }
      return found;
    };
    (match.events||[]).forEach((event,index)=>{
      const records=Array.isArray(event.penaltyDetails)?event.penaltyDetails:[];
      if(records.length)records.forEach((record,i)=>addRecord(record,event.period,event.penaltyIds?.[i],event.time));
      // Some stoppages carry details for one player but text for both mutually assessed players.
      // Read both sources and use semantic dedupe so the missing second penalty is not lost or double-counted.
      const inferred=inferLegacyRecords(event,index);
      if(inferred.length)inferred.forEach(record=>addRecord(record,event.period,null,event.time));
      if(records.length||inferred.length) return;
      if(event.kind==='penalty'){
        addRecord({id:event.penaltyId||event.id,teamId:event.teamId,playerId:event.playerId,period:event.period,time:event.time,type:event.type,minutes:event.penaltyMinutes??event.minutes,penaltyMinutes:event.penaltyMinutes??event.minutes},event.period,null,event.time);
      }else if(event.kind==='fight'){
        // A fight gives each participant a five-minute major; DКМ does not add another 20 PIM.
        addPenalty(event.teamId,event.period,5);
        const opponent=this.db.players.find(p=>String(p.id)===String(event.opponentPlayerId));
        const oppTeam=opponent?.teamId!=null?opponent.teamId:(String(event.teamId)===String(match.homeId)?match.awayId:match.homeId);
        if(oppTeam!=null)addPenalty(oppTeam,event.period,5);
      }
    });
    for(const side of [home,away]){
      for(const key of ['shots','faceoffs','blocks','hits']){
        if(!Array.isArray(side[key].periods))side[key].periods=splitTotal(Number(side[key].total)||0,periodCount);
        side[key].total=side[key].periods.reduce((a,b)=>a+(Number(b)||0),0);
      }
      side.penalties.total=side.penalties.periods.reduce((a,b)=>a+b,0);
    }
    match.matchStats={...(match.matchStats||{}),home,away,periodCount,penaltyStatsVersion:3,generatedAt:match.matchStats?.generatedAt||Date.now()};
    return match.matchStats;
  };
  
  const baseRender=KHLManagerApp.prototype.renderMatchCenter;
  KHLManagerApp.prototype.renderMatchCenter=function(){
    baseRender.call(this);
    let match=null;
    if(this.currentMatchId)match=this.state?.matches.find(m=>m.id===this.currentMatchId)||null;
    if(!match&&this.liveMatch?.simulatedMatch)match=this.liveMatch.simulatedMatch;
    this.renderMatchStatistics(match);
  };
})();
