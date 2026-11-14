// 14.7.24: снимок составов команд на момент матча (для вкладки "Составы" в Матч-центре
// и для подписи "сейчас на льду: Звено N"/журнала замен). Работает как для матчей
// пользователя (в т.ч. текущий live-матч), так и для матчей ИИ-ИИ, которые считаются
// пакетно через simulateMatch. Матчи, сыгранные ДО появления этой версии, снимка не
// имеют — для них интерфейс должен показывать "нет данных", а не текущий состав.
(function(){
  const proto = KHLManagerApp.prototype;

  function packActive(active){
    if(!active) return null;
    const forwards=(active.forwards||[]).map(p=>p.id);
    const defense=(active.defense||[]).map(p=>p.id);
    const goalieId=active.goalie?active.goalie.id:null;
    return {forwards,defense,goalieId};
  }

  // Снимок обеих команд матча, построенный из ТЕКУЩЕГО состояния состава (используется
  // непосредственно в момент начала/симуляции матча — до того как состав мог измениться).
  proto.buildLineupSnapshot = function(homeId, awayId){
    return {
      [homeId]: packActive(this.activeSkaters(homeId)),
      [awayId]: packActive(this.activeSkaters(awayId))
    };
  };

  // Группы "Звено 1-4"/"Пара 1-3"/"Вратарь" по снимку ОДНОЙ команды (для рендера
  // вкладки "Составы" и для определения текущего звена на льду).
  proto.lineupGroups = function(teamSnap){
    if(!teamSnap) return [];
    const groups=[];
    const fw=teamSnap.forwards||[];
    for(let i=0,n=0;i<fw.length;i+=3){n++;groups.push({label:'Звено '+n,kind:'forward',n,ids:fw.slice(i,i+3)});}
    const df=teamSnap.defense||[];
    for(let i=0,n=0;i<df.length;i+=2){n++;groups.push({label:'Пара '+n,kind:'defense',n,ids:df.slice(i,i+2)});}
    if(teamSnap.goalieId) groups.push({label:'Вратарь',kind:'goalie',n:1,ids:[teamSnap.goalieId]});
    return groups;
  };

  // Найти группу (звено/пару), к которой принадлежит игрок — для живой подписи во время матча.
  proto.lineupGroupFor = function(teamSnap, playerId){
    if(!teamSnap||!playerId) return null;
    const groups=this.lineupGroups(teamSnap);
    return groups.find(g=>g.ids.includes(playerId))||null;
  };

  // --- Захват снимка в момент старта СОБСТВЕННОГО live-матча пользователя ---
  const __lsSaveLineupAndStart = proto.saveLineupAndStart;
  proto.saveLineupAndStart = function(){
    __lsSaveLineupAndStart.apply(this, arguments);
    const live=this.liveMatch;
    if(live && !live.lineupSnapshot){
      live.lineupSnapshot = {
        [live.homeId]: packActive(live.activeH),
        [live.awayId]: packActive(live.activeA)
      };
    }
  };

  // --- Захват снимка для матчей ИИ-ИИ и любых матчей, обрабатываемых через simulateMatch
  // (включая плей-офф — обёртка стоит СНАРУЖИ всей цепочки simulateMatch/simulatePlayoffGame) ---
  // Снимок строится ПОСЛЕ вызова базовой симуляции, а не до неё: построение "до" дёргает
  // effectiveOVR/playerDev для составов заранее и тем самым смещает порядок потребления
  // Math.random() внутри самого матч-движка (ломает детерминизм regress.js). После вызова
  // базовой функции все те же ленивые инициализации уже выполнены самим движком, так что
  // повторное чтение activeSkaters ничего не потребляет и не меняет исход.
  const __lsSimulateMatch = proto.simulateMatch;
  proto.simulateMatch = function(match){
    const alreadyDone = !!(match && (match.played || match.cancelled));
    const result = __lsSimulateMatch.call(this, match);
    if(!alreadyDone && result && result.played && !result.lineupSnapshot && result.homeId!=null && result.awayId!=null){
      try{ result.lineupSnapshot = this.buildLineupSnapshot(result.homeId, result.awayId); }catch(e){}
    }
    return result;
  };

  // --- Перенос снимка живого матча пользователя на итоговую запись матча в state.matches ---
  const __lsCompleteLiveMatch = proto.completeLiveMatch;
  proto.completeLiveMatch = function(live){
    __lsCompleteLiveMatch.call(this, live);
    const m=live && live.simulatedMatch;
    if(m && this.state && live && live.lineupSnapshot){
      const target=this.state.matches.find(x=>x.id===m.id);
      if(target && !target.lineupSnapshot){ target.lineupSnapshot = live.lineupSnapshot; this.persistQuietly(); }
    }
  };
})();
