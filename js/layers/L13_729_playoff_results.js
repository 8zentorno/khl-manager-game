/* KHL Manager Mobile Edition 7.29 — single-source playoff results, seven-slot pips and reseeding. */
(function(){
  const proto=KHLManagerApp.prototype;

  proto.__poSeriesAtStage729=function(stage){
    const po=this.state?.playoff;
    if(!po)return [];
    const out=[],seen=new Set();
    for(const h of (po.history||[]))if(Number(h.stage)===Number(stage))for(const s of (h.series||[]))if(s&&!seen.has(s.id)){seen.add(s.id);out.push(s);}
    if(Number(po.stage)===Number(stage))for(const s of (po.series||[]))if(s&&!seen.has(s.id)){seen.add(s.id);out.push(s);}
    return out;
  };

  proto.__poCanonicalizeSeries729=function(series,repair=false){
    if(!series)return {results:[],winsA:0,winsB:0,complete:false,winnerId:null,changed:false,hasSource:false};
    const state=this.state||{};
    const scoredMatches=(state.matches||[])
      .filter(m=>m.playoff&&String(m.seriesId)===String(series.id)&&!m.cancelled&&m.homeScore!=null&&m.awayScore!=null)
      .sort((a,b)=>Number(a.gameNo)-Number(b.gameNo));
    const stored=Array.isArray(series.gameResults)?series.gameResults.slice().sort((a,b)=>Number(a.gameNo)-Number(b.gameNo)):[];
    const useMatches=scoredMatches.length>0;
    const source=useMatches?scoredMatches:stored;
    const results=[],seen=new Set();
    let winsA=0,winsB=0;
    for(const item of source){
      const gameNo=Number(item.gameNo),homeId=item.homeId,awayId=item.awayId;
      const homeScore=Number(item.homeScore),awayScore=Number(item.awayScore);
      if(!Number.isFinite(gameNo)||seen.has(gameNo)||!homeId||!awayId||!Number.isFinite(homeScore)||!Number.isFinite(awayScore)||homeScore===awayScore)continue;
      const winnerId=homeScore>awayScore?homeId:awayId;
      if(winnerId!==series.teamA&&winnerId!==series.teamB)continue;
      seen.add(gameNo);
      results.push({gameNo,homeId,awayId,homeScore,awayScore,ot:!!item.ot,so:!!item.so});
      if(winnerId===series.teamA)winsA++;else winsB++;
      // A best-of-seven series ends the instant one team earns its fourth win.
      if(winsA>=4||winsB>=4)break;
    }
    let complete=results.length>0&&(winsA>=4||winsB>=4);
    let winnerId=winsA>=4?series.teamA:winsB>=4?series.teamB:null;
    // If an imported/legacy save has no individual match records at all, don't erase its summary.
    if(!results.length&&!useMatches){
      winsA=Math.max(0,Number(series.winsA)||0);winsB=Math.max(0,Number(series.winsB)||0);
      complete=!!series.complete||winsA>=4||winsB>=4;
      winnerId=series.winnerId||(winsA>=4?series.teamA:winsB>=4?series.teamB:null);
    }
    const sameResults=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((g,i)=>{
      const h=b[i];return !!h&&Number(g.gameNo)===Number(h.gameNo)&&String(g.homeId)===String(h.homeId)&&String(g.awayId)===String(h.awayId)&&Number(g.homeScore)===Number(h.homeScore)&&Number(g.awayScore)===Number(h.awayScore)&&!!g.ot===!!h.ot&&!!g.so===!!h.so;
    });
    const changed=!sameResults(series.gameResults,results)||Number(series.winsA||0)!==winsA||Number(series.winsB||0)!==winsB||!!series.complete!==complete||String(series.winnerId||'')!==String(winnerId||'');
    if(repair&&changed){
      series.gameResults=results;
      series.winsA=winsA;series.winsB=winsB;series.complete=complete;series.winnerId=winnerId;
      if(complete&&results.length){
        const lastGame=Math.max(...results.map(g=>Number(g.gameNo)||0));
        for(const m of (state.matches||[]))if(m.playoff&&String(m.seriesId)===String(series.id)&&Number(m.gameNo)>lastGame&&!m.cancelled){m.cancelled=true;m.played=true;}
      }
    }
    return {results,winsA,winsB,complete,winnerId,changed,hasSource:useMatches||stored.length>0};
  };


  // Pairing uses regular-season rank, but displayed seeds are re-numbered among the survivors.
  proto.__poPairWinners723=function(winners){
    const ids=[...new Set((winners||[]).filter(Boolean))]
      .sort((a,b)=>this.overallRegularRank(a)-this.overallRegularRank(b)||String(a).localeCompare(String(b)));
    const pairs=[];
    for(let i=0;i<Math.floor(ids.length/2);i++)pairs.push({teamA:ids[i],teamB:ids[ids.length-1-i],seedA:i+1,seedB:ids.length-i,conference:'overall'});
    return pairs;
  };

  proto.__poReseedPlayoffCards729=function(repair=false){
    if(!this.state?.playoff||this._poStandSwapped)return false;
    let changed=false;
    for(let stage=2;stage<=4;stage++){
      const expected=typeof this.__poExpectedSeriesCount723==='function'?this.__poExpectedSeriesCount723(stage):({2:4,3:2,4:1})[stage];
      const series=this.__poSeriesAtStage729(stage);
      if(!expected||series.length<expected)continue;
      const ids=[...new Set(series.flatMap(s=>[s.teamA,s.teamB]).filter(Boolean))];
      if(ids.length!==expected*2)continue;
      ids.sort((a,b)=>this.overallRegularRank(a)-this.overallRegularRank(b)||String(a).localeCompare(String(b)));
      const rank=new Map(ids.map((id,i)=>[id,i+1]));
      for(const s of series){
        const seedA=rank.get(s.teamA),seedB=rank.get(s.teamB);
        if(!seedA||!seedB)continue;
        if(Number(s.seedA)!==seedA||Number(s.seedB)!==seedB){
          if(repair){s.seedA=seedA;s.seedB=seedB;changed=true;}
        }
      }
    }
    if(repair&&changed)this.persistQuietly();
    return changed;
  };

  // Re-seed only after the whole previous round is decided; this avoids premature/global-rank labels.
  proto.refreshPlayoffStages723=function(){
    const po=this.state?.playoff;
    if(!po?.started||po.completed)return false;
    let made=false;
    for(let stage=2;stage<=4;stage++){
      const previous=this.__poSeriesAtStage729(stage-1);
      const expectedPrevious=typeof this.__poExpectedSeriesCount723==='function'?this.__poExpectedSeriesCount723(stage-1):({1:8,2:4,3:2})[stage-1];
      if(!expectedPrevious||previous.length<expectedPrevious||!previous.every(s=>s.complete&&s.winnerId))continue;
      const pairs=this.__poPairWinners723(previous.map(s=>s.winnerId));
      const expectedCurrent=typeof this.__poExpectedSeriesCount723==='function'?this.__poExpectedSeriesCount723(stage):({2:4,3:2,4:1})[stage];
      if(pairs.length!==expectedCurrent)continue;
      if(this.__poSeriesAtStage729(stage).length>=expectedCurrent)continue; // стадия уже создана: пары не пересчитываем
      pairs.forEach((pair,i)=>{
        if(this.__poFindSeriesPair723(stage,pair.teamA,pair.teamB))return;
        const added=this.__poAddSeries723(stage,pair,i%3);
        if(added)made=true;
      });
    }
    this.__poReseedPlayoffCards729(true);
    if(made)this.persistQuietly();
    return made;
  };

  const baseRepairSave729=proto.repairSave;
  if(typeof baseRepairSave729==='function')proto.repairSave=function(){
    const result=baseRepairSave729.apply(this,arguments);
    if(this.state){this.auditPlayoffSeriesResults728(true);this.__poReseedPlayoffCards729(true);}
    return result;
  };

  const baseRecordPlayoffResult729=proto.recordPlayoffResult;
  if(typeof baseRecordPlayoffResult729==='function')proto.recordPlayoffResult=function(){
    const result=baseRecordPlayoffResult729.apply(this,arguments);
    if(this.state){this.auditPlayoffSeriesResults728(true);this.__poReseedPlayoffCards729(true);}
    return result;
  };

})();
