/* KHL Manager Mobile Edition 7.28 — playoff result / series tally consistency audit. */
(function(){
  const proto=KHLManagerApp.prototype;
  proto.auditPlayoffSeriesResults728=function(repair=false){
    const state=this.state,po=state?.playoff;
    const seriesList=[...(po?.series||[]),...(po?.history||[]).flatMap(h=>h.series||[])];
    const seenSeries=new Set(),report={checked:0,mismatches:[],matchMismatches:[],repaired:0,skipped:0};
    for(const series of seriesList){
      if(!series||!series.id||seenSeries.has(series.id))continue;
      seenSeries.add(series.id);
      const stored=Array.isArray(series.gameResults)?series.gameResults:[];
      const matches=(state.matches||[]).filter(m=>m.playoff&&m.seriesId===series.id&&!m.cancelled&&m.homeScore!=null&&m.awayScore!=null&&Number(m.homeScore)!==Number(m.awayScore)).sort((a,b)=>Number(a.gameNo)-Number(b.gameNo));
      const source=matches.length?matches:stored;
      if(!source.length){report.skipped++;continue;}
      const storedByNo=new Map();
      for(const g of stored){const no=Number(g.gameNo);if(Number.isFinite(no)&&!storedByNo.has(no))storedByNo.set(no,g);}
      const seenGames=new Set();let winsA=0,winsB=0,valid=0;const canonical=[];
      for(const game of source){
        const no=Number(game.gameNo);
        if(!Number.isFinite(no)||seenGames.has(no))continue;
        seenGames.add(no);
        const hs=Number(game.homeScore),as=Number(game.awayScore),homeId=game.homeId,awayId=game.awayId;
        if(!Number.isFinite(hs)||!Number.isFinite(as)||hs===as||!homeId||!awayId)continue;
        const winner=hs>as?homeId:awayId;
        if(winner===series.teamA)winsA++;else if(winner===series.teamB)winsB++;else continue;
        valid++;
        canonical.push({gameNo:no,homeId,awayId,homeScore:hs,awayScore:as,ot:!!game.ot,so:!!game.so});
        if(matches.length){
          const rec=storedByNo.get(no);
          if(!rec||String(rec.homeId)!==String(homeId)||String(rec.awayId)!==String(awayId)||Number(rec.homeScore)!==hs||Number(rec.awayScore)!==as||!!rec.ot!==!!game.ot||!!rec.so!==!!game.so){
            report.matchMismatches.push({seriesId:series.id,gameNo:no,match:{homeId,awayId,homeScore:hs,awayScore:as,ot:!!game.ot,so:!!game.so},recorded:rec?{homeId:rec.homeId,awayId:rec.awayId,homeScore:rec.homeScore,awayScore:rec.awayScore,ot:!!rec.ot,so:!!rec.so}:null});
          }
        }
      }
      if(!valid){report.skipped++;continue;}
      report.checked++;
      const storedA=Number(series.winsA)||0,storedB=Number(series.winsB)||0;
      const derivedComplete=winsA>=4||winsB>=4;
      const derivedWinner=winsA>=4?series.teamA:winsB>=4?series.teamB:null;
      const mismatch=storedA!==winsA||storedB!==winsB||(!!series.complete!==derivedComplete)||(derivedComplete&&series.winnerId!==derivedWinner);
      if(mismatch){
        report.mismatches.push({seriesId:series.id,teamA:series.teamA,teamB:series.teamB,stored:{winsA:storedA,winsB:storedB,complete:!!series.complete,winnerId:series.winnerId||null},derived:{winsA,winsB,complete:derivedComplete,winnerId:derivedWinner},validGames:valid});
      }
      if(repair&&(mismatch||report.matchMismatches.some(x=>x.seriesId===series.id))){
        if(matches.length)series.gameResults=canonical;
        series.winsA=winsA;series.winsB=winsB;series.complete=derivedComplete;series.winnerId=derivedWinner;
        if(derivedComplete){
          const lastGame=Math.max(...canonical.map(g=>Number(g.gameNo)||0));
          for(const id of (series.gameIds||[])){
            const future=(state.matches||[]).find(m=>m.id===id);
            if(future&&Number(future.gameNo)>lastGame&&!future.played){future.cancelled=true;future.played=true;}
          }
        }
        report.repaired++;
      }
    }
    if(repair&&report.repaired)this.persistQuietly();
    return report;
  };
})();
