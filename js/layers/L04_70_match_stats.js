/* ================= KHL MANAGER 7.0 — match statistics and timeout =================
   Injury severity continues to control availability: light = current game only,
   medium = 2–4 own-team games, severe = 30–60 calendar days.
*/
(function(){
  const baseAssignInjury = KHLManagerApp.prototype.assignInjury;
  const baseInjuryDescription = KHLManagerApp.prototype.injuryDescription;
  const injuryTypes = {
    light: [
      { label: 'ушиб плеча', positions: ['D','G'] },
      { label: 'ушиб бедра', positions: ['LW','C','RW'] },
      { label: 'ушиб кисти', positions: ['LW','C','RW','D'] },
      { label: 'болезненный удар шайбой по голени', positions: ['D','LW','C','RW'] },
      { label: 'рассечение над бровью', positions: ['LW','C','RW','D','G'] },
      { label: 'ушиб колена', positions: ['LW','C','RW','D','G'] }
    ],
    medium: [
      { label: 'растяжение связок голеностопа', positions: ['LW','C','RW','D'] },
      { label: 'растяжение мышцы бедра', positions: ['LW','C','RW'] },
      { label: 'повреждение кисти', positions: ['LW','C','RW','D'] },
      { label: 'ушиб плечевого сустава', positions: ['D','G','LW','C','RW'] },
      { label: 'растяжение паховых мышц', positions: ['G','LW','C','RW'] },
      { label: 'ушиб рёбер после силового приёма', positions: ['D','LW','C','RW'] }
    ],
    severe: [
      { label: 'повреждение связок колена', positions: ['LW','C','RW','D'] },
      { label: 'перелом кисти', positions: ['LW','C','RW','D'] },
      { label: 'серьёзное повреждение плечевого сустава', positions: ['D','G','LW','C','RW'] },
      { label: 'сотрясение после столкновения', positions: ['LW','C','RW','D','G'] },
      { label: 'повреждение паховой области', positions: ['G'] },
      { label: 'повреждение связок голеностопа', positions: ['LW','C','RW','D'] }
    ]
  };
  function chooseType(severity, pos){
    const list=injuryTypes[severity]||injuryTypes.light;
    const suited=list.filter(x=>x.positions.includes(pos));
    const pool=suited.length?suited:list;
    return pool[Math.floor(Math.random()*pool.length)].label;
  }
  KHLManagerApp.prototype.assignInjury=function(player,match,teamId,period,time,forcedSeverity=null){
    const result=baseAssignInjury.call(this,player,match,teamId,period,time,forcedSeverity);
    if(!result||!player||!match)return result;
    const severity=result.severity||this.playerDev(player)?.injury?.severity||'light';
    const dev=this.playerDev(player);
    if(!dev||!dev.injury)return result;
    const type=chooseType(severity,player.pos);
    dev.injury.injuryType=type;
    dev.injury.typeCode=severity+'-'+type.toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'-');
    const matchInjury=(match.injuries||[]).slice().reverse().find(x=>x.playerId===player.id&&x.teamId===teamId);
    if(matchInjury){matchInjury.injuryType=type;matchInjury.typeCode=dev.injury.typeCode;}
    const event=result.event||(match.events||[]).slice().reverse().find(e=>e.kind==='injury'&&e.playerId===player.id&&e.teamId===teamId);
    if(event){
      if(severity==='light'){
        event.text=dev.injury.fromScuffle
          ?`После стычки ${player.name} получил лёгкое повреждение — ${type}. Он покидает матч, но будет доступен к следующей игре.`
          :`${player.name} получил лёгкое повреждение — ${type}. Он покидает текущий матч и будет доступен к следующей игре.`;
      }else if(severity==='medium'){
        event.text=`${player.name} получил травму средней степени — ${type}. Хоккеист пропустит ${Number(dev.injury.gamesRemaining)||2} следующих матча своей команды.`;
      }else{
        event.text=`${player.name} получил тяжёлую травму — ${type}. Ожидаемый срок восстановления составляет около ${Number(dev.injury.daysRemaining)||30} дней.`;
      }
      result.event=event;
    }
    return result;
  };
  KHLManagerApp.prototype.injuryDescription=function(player){
    const injury=this.playerDev(player)?.injury;
    if(!injury)return baseInjuryDescription.call(this,player);
    const type=injury.injuryType?` · ${injury.injuryType}`:'';
    if(injury.severity==='light')return `Лёгкое повреждение${type} · готов к следующему матчу`;
    if(injury.severity==='medium')return `Травма средней степени${type} · пропустит ещё ${Math.max(0,Number(injury.gamesRemaining)||0)} матч(а)`;
    if(injury.severity==='severe')return `Тяжёлая травма${type} · восстановление около ${Math.max(0,Number(injury.daysRemaining)||0)} дн.`;
    return baseInjuryDescription.call(this,player);
  };
})();
