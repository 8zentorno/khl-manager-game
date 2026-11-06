/* KHL Manager 8.10 — модель спецбригад.
   1) Сила бригады большинства/меньшинства влияет на броски и шанс гола (живой матч).
   2) Быстрая симуляция получает штрафы, голы в большинстве и в меньшинстве.
   3) Частота штрафов близка к КХЛ (≈3 удаления на команду за игру). */
(function(){
  const proto=KHLManagerApp.prototype;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const F_POS=['LW','C','RW'];
  const P=proto.SPECIAL_MODEL_PARAMS={
    penaltyCallPerMinute:.107,      // живой матч: шанс свистка за минуту (регулярка)
    penaltyCallPerMinutePlayoff:.088,
    quickPenaltiesPerTeam:3.2,      // быстрая симуляция: удалений на команду
    quickPenaltiesPerTeamPlayoff:2.6,
    ppShotMul:1.45, ppChanceMul:1.38, // базовое усиление большинства (было 1.3 / 1.14)
    ppUnitK:.020,                    // изменение за 1 пункт отклонения силы бригады
    pkUnitK:.016,
    shKill:.24,                      // доля голов в меньшинстве от обычной (быстрая симуляция)
    shShotMul:.6, shChanceMul:.40,   // живой матч: броски и шанс гола в меньшинстве (вместе ≈ .24 от обычного)
    quickDouble:.035, quickMajor:.025, // быстрая симуляция: доли двойных малых и больших штрафов
    fightBlowoutPerMin:.01,          // живой матч: драка при разнице от 3 голов (раз за матч), в минуту
    fightBasePerMin:.0008,           // живой матч: прочие драки, в минуту
    quickFightBlowout:.30, quickFightBase:.035, quickScuffle:0, // быстрая симуляция
    fightSerious:.12                 // доля драк с удалением обоих до конца матча
  };

  // Рейтинг игрока в бригаде: общий уровень + профильные навыки.
  proto.spPlayerMetric=function(p,kind){
    if(!p)return 0;
    const eff=this.effectiveOVR(p),sk=k=>this.playerSkill(p,k);
    if(kind==='pp')return p.pos==='D'?eff*.5+sk('passing')*.4+sk('shooting')*.1:eff*.5+sk('shooting')*.35+sk('passing')*.15;
    return p.pos==='D'?eff*.5+sk('defense')*.4+sk('skating')*.1:eff*.5+sk('defense')*.35+sk('skating')*.15;
  };
  // Взвешенный рейтинг набора игроков (защитники меньшинства — ключевые, вес 1.25).
  proto.spUnitRating=function(players,kind){
    const list=(players||[]).filter(Boolean);if(!list.length)return 0;
    let s=0,w=0;for(const p of list){const k=kind==='pk'&&p.pos==='D'?1.25:1;s+=this.spPlayerMetric(p,kind)*k;w+=k;}
    return s/w;
  };
  // Средний уровень «обычного» скейтера клуба (база для сравнения).
  proto.spTeamBase=function(teamId,kind){
    const key=`${teamId}|${kind}|${this.state?.dayIndex||0}|${this.state?.seasonNumber||1}`;
    const cache=this._spBase||(this._spBase=new Map());
    if(cache.has(key))return cache.get(key);
    const a=this.activeSkaters(teamId);
    const v=this.spUnitRating([...(a?.forwards||[]),...(a?.defense||[])],kind)||0;
    if(cache.size>300)cache.clear();cache.set(key,v);return v;
  };
  // Множители для большинства: свои игроки в атаке против меньшинства соперника.
  proto.specialPowerFactors=function(teamId,ppPlayers,oppTeamId,pkPlayers){
    const P=this.SPECIAL_MODEL_PARAMS;
    const dPP=this.spUnitRating(ppPlayers,'pp')-this.spTeamBase(teamId,'pp');
    const dPK=this.spUnitRating(pkPlayers,'pk')-this.spTeamBase(oppTeamId,'pk');
    const a=clamp(1+dPP*P.ppUnitK,.80,1.22),d=clamp(1-dPK*P.pkUnitK,.82,1.18);
    return {shots:a*d,p:a*d,pp:a,pk:d};
  };

  // Оценка бригады для интерфейса: рейтинг, база клуба и эффект в процентах.
  proto.specialUnitEffect=function(teamId,kind,players){
    const P=this.SPECIAL_MODEL_PARAMS,list=(players||[]).filter(Boolean);
    const rating=this.spUnitRating(list,kind),base=this.spTeamBase(teamId,kind),d=list.length?rating-base:0;
    let pct;
    if(kind==='pp'){const a=clamp(1+d*P.ppUnitK,.80,1.22);pct=(a*a-1)*100;}
    else{const q=clamp(1-d*P.pkUnitK,.82,1.18);pct=(1-q*q)*100;}
    return {rating,base,d,pct:Math.round(pct)};
  };
  // ---------- Быстрая симуляция ----------
  const poisson=(rnd,l)=>{const L=Math.exp(-l);let k=0,p=1;do{k++;p*=rnd();}while(p>L&&k<14);return k-1;};
  const toMin=e=>{
    const per=parseInt(e.period,10);if(!(per>=1&&per<=3))return null;
    const [m='0',s='0']=String(e.time||'00:00').split(':');return (per-1)*20+Number(m)+Number(s)/60;
  };
  const stampOf=min=>{
    const t=clamp(min,0,59.98),per=Math.floor(t/20)+1,loc=t-(per-1)*20,mm=Math.floor(loc),ss=Math.min(59,Math.floor((loc-mm)*60));
    return {period:`${per}П`,time:`${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`};
  };
  const VIOL=proto.PENALTY_MINOR_VIOLATIONS=['Задержка соперника','Подножка','Задержка соперника клюшкой','Удар клюшкой','Задержка чужой клюшки','Помеха','Высокая клюшка без травмы','Атака игрока без шайбы','Атака вратаря / контакт с голкипером','Толчок на борт без травмы','Задержка руками клюшки'];
  proto.PENALTY_DOUBLE_VIOLATIONS=['Высокая клюшка с кровью','Удар клюшкой, приведший к порезу','Порез коньком в борьбе у ворот'];
  proto.PENALTY_MAJOR_VIOLATIONS=['Опасный толчок на борт','Атака с разбега (чарджинг)','Грубая атака игрока без шайбы'];

  proto.decorateQuickSpecialTeams=function(match){
    if(!match||!match.played||match.spDecorated||match.cancelled)return match;
    const ev=match.events||[];
    if(ev.some(e=>e.kind==='penaltyStart'||e.penaltyDetails))return match;
    match.spDecorated=true;
    const P=this.SPECIAL_MODEL_PARAMS,rnd=this.matchRng?this.matchRng(match,'special8.10'):Math.random;
    const sides=[match.homeId,match.awayId];
    // убрать декоративные «штрафы» без привязки к игрокам
    match.events=ev.filter(e=>!(e.kind==='penalty'&&!e.id));
    const lam=(match.playoff?P.quickPenaltiesPerTeamPlayoff:P.quickPenaltiesPerTeam)*(this.derbyHeat?this.derbyHeat(match.homeId,match.awayId):1);
    const active={};for(const t of sides)active[t]=this.activeSkaters(t);
    const pen=[];
    for(const guilty of sides){
      const attacker=guilty===match.homeId?match.awayId:match.homeId;
      const n=Math.min(7,poisson(rnd,lam*(this.coachPenMul?this.coachPenMul(guilty):1))),pool=(active[guilty]?.skaters||[]).filter(Boolean);
      for(let i=0;i<n&&pool.length;i++){
        const start=1+rnd()*56,kr=rnd(),major=kr<P.quickMajor,dbl=!major&&kr<P.quickMajor+P.quickDouble,dur=major?5:dbl?4:2,player=pool[Math.floor(rnd()*pool.length)];
        const list=major?proto.PENALTY_MAJOR_VIOLATIONS:dbl?proto.PENALTY_DOUBLE_VIOLATIONS:VIOL;
        pen.push({id:`qp_${match.id}_${guilty}_${i}`,guilty,attacker,start,end:Math.min(60,start+dur),dbl,major,dur,player,
          ppKey:rnd()<.72?'pp1':'pp2',pkKey:rnd()<.72?'pk1':'pk2',violation:list[Math.floor(rnd()*list.length)]});
      }
    }
    pen.sort((a,b)=>a.start-b.start);
    for(const w of pen){
      const st=stampOf(w.start);
      match.events.push({kind:'penalty',id:w.id,penaltyId:w.id,teamId:w.guilty,playerId:w.player.id,period:st.period,time:st.time,stoppage:true,
        type:w.major?'major':w.dbl?'doubleMinor':'minor',minutes:w.dur,penaltyMinutes:w.dur,violation:w.violation,affectsManpower:true,
        ppUnitKey:w.ppKey,pkUnitKey:w.pkKey,text:`Удаление: ${w.player.name} (${w.violation}) — ${w.dur} мин`});
    }
    // Голы регулярного времени
    const goals=match.events.filter(e=>e.kind==='goal'&&toMin(e)!==null);
    const unitOf=(team,key)=>this.specialUnitPlayers(team,key,null)||{skaters:[]};
    const timeInWindow=(g,w)=>{const t=toMin(g);return t>=w.start&&t<w.end;};
    // Усиление/ослабление относительно естественного распределения
    for(const w of pen){
      const ppU=unitOf(w.attacker,w.ppKey),pkU=unitOf(w.guilty,w.pkKey);
      const fx=this.specialPowerFactors(w.attacker,ppU.skaters,w.guilty,pkU.skaters);
      w.m=P.ppShotMul*P.ppChanceMul*fx.shots*fx.p;w.fx=fx;
    }
    const outside=(team,t)=>!pen.some(w=>w.guilty===team&&t>=w.start&&t<w.end);
    const randomFree=team=>{for(let i=0;i<20;i++){const t=.5+rnd()*58;if(outside(team,t))return t;}return .5+rnd()*58;};
    const moveGoal=(g,t)=>{const s=stampOf(t);g.period=s.period;g.time=s.time;};
    // 1) голы в меньшинстве: часть уходит из окна своего удаления
    for(const g of goals){
      const t=toMin(g);if(t===null)continue;
      const w=pen.find(x=>x.guilty===g.teamId&&t>=x.start&&t<x.end);
      if(w&&rnd()<1-P.shKill)moveGoal(g,randomFree(g.teamId));
    }
    // 2) добавить голы в большинстве (перенос из игры 5 на 5)
    for(const w of pen){
      const ownGoals=goals.filter(g=>g.teamId===w.attacker);if(!ownGoals.length)continue;
      const inWin=ownGoals.some(g=>timeInWindow(g,w));
      const dur=w.end-w.start,rate=ownGoals.length/60;
      const extra=(w.m-1)*rate*dur;
      if(!inWin&&extra>0&&rnd()<extra){
        const cand=ownGoals.filter(g=>!pen.some(x=>x.attacker===w.attacker&&timeInWindow(g,x)));
        const g=cand[Math.floor(rnd()*cand.length)];if(g)moveGoal(g,w.start+.15+rnd()*(dur-.3));
      }else if(inWin&&w.m<1){
        const g=ownGoals.find(x=>timeInWindow(x,w));if(g&&rnd()<1-w.m)moveGoal(g,randomFree(w.guilty===g.teamId?g.teamId:g.teamId));
      }
    }
    // 3) разметка: первый гол в окне — гол в большинстве, гол штрафуемой команды — в меньшинстве
    let ppH=0,ppA=0;
    for(const w of pen){
      const inside=goals.filter(g=>{const t=toMin(g);return t!==null&&t>=w.start&&t<w.end;}).sort((a,b)=>toMin(a)-toMin(b));
      const first=inside.find(g=>g.teamId===w.attacker);
      const cut=first&&!w.dbl?toMin(first):w.end;
      if(first){
        const wasPP=!!first.powerPlay;
        first.powerPlay=true;first.ppUnitKey=w.ppKey;first.pkUnitKeyAgainst=w.pkKey;first.ppOpportunityId=w.id;first.pkOpportunityId=w.id;first.text='Гол в большинстве';
        if(!wasPP){if(w.attacker===match.homeId)ppH++;else ppA++;}
      }
      for(const g of inside){
        if(g.teamId!==w.guilty||g.powerPlay)continue;
        if(toMin(g)>=cut)continue;
        g.shortHanded=true;g.pkUnitKeyFor=w.pkKey;g.ppUnitKeyAgainst=w.ppKey;g.text='Гол в меньшинстве';
      }
    }
    match.ppGoalsHome=ppH;match.ppGoalsAway=ppA;
    match.events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));
    const final=match.events.find(e=>e.kind==='final');if(final){match.events=match.events.filter(e=>e!==final);match.events.push(final);}
    return match;
  };

  const baseSim=proto.simulateMatch;
  proto.simulateMatch=function(match){
    const was=!!match?.played;
    const r=baseSim.call(this,match);
    if(!was&&r&&r.played&&!r.spDecorated)this.decorateQuickSpecialTeams(r);
    return r;
  };
  const basePO=proto.simulatePlayoffGame;
  if(typeof basePO==='function')proto.simulatePlayoffGame=function(match){
    const was=!!match?.played;
    const r=basePO.call(this,match);
    const m=(r&&r.played)?r:(match&&match.played?match:null);
    if(!was&&m&&!m.spDecorated)this.decorateQuickSpecialTeams(m);
    return r;
  };
})();
