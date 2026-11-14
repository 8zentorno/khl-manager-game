'use strict';

const KHL_STADIUMS = {
  ska:{name:'СКА Арена',capacity:22500,city:'Санкт-Петербург'}, shanghai:{name:'СКА Арена',capacity:22500,city:'Санкт-Петербург'},
  spartak:{name:'Мегаспорт',capacity:11748,city:'Москва'}, torpedo:{name:'VOLGA Арена',capacity:12164,city:'Нижний Новгород'},
  lada:{name:'Лада-Арена',capacity:6000,city:'Тольятти'}, sochi:{name:'Большой',capacity:12000,city:'Сочи'},
  dinamo_mn:{name:'Минск-Арена',capacity:15086,city:'Минск'}, dinamo_msk:{name:'ВТБ Арена',capacity:11478,city:'Москва'},
  lokomotiv:{name:'Арена 2000',capacity:7990,city:'Ярославль'}, severstal:{name:'Ледовый дворец',capacity:5685,city:'Череповец'},
  cska:{name:'ЦСКА Арена',capacity:12100,city:'Москва'}, avtomobilist:{name:'УГМК-Арена',capacity:12588,city:'Екатеринбург'},
  akbars:{name:'Татнефть Арена',capacity:8890,city:'Казань'}, metallurg:{name:'Арена Металлург',capacity:7500,city:'Магнитогорск'},
  neftekhimik:{name:'Нефтехим Арена',capacity:5500,city:'Нижнекамск'}, traktor:{name:'Трактор',capacity:7500,city:'Челябинск'},
  avangard:{name:'G-Drive Арена',capacity:12011,city:'Омск'}, sibir:{name:'Сибирь-Арена',capacity:11650,city:'Новосибирск'},
  admiral:{name:'Фетисов Арена',capacity:6000,city:'Владивосток'}, amur:{name:'Платинум Арена',capacity:7100,city:'Хабаровск'},
  barys:{name:'Барыс Арена',capacity:11626,city:'Астана'}, salavat:{name:'Уфа-Арена',capacity:8522,city:'Уфа'}
};

class KHLManagerApp {
  constructor() {
    this.liveMatch = null; this.liveTimer = null;
    if (typeof KHL_DATABASE === 'undefined' || !Array.isArray(KHL_DATABASE.teams) || !Array.isArray(KHL_DATABASE.players)) {
      this.db = {teams:[],players:[]};
      document.getElementById('db-player-count').textContent = 'База не загружена';
      alert('Не удалось загрузить db.js. Помести файл db.js в ту же папку, что и khl_manager_v2.html.');
    } else {
      this.db = {teams: KHL_DATABASE.teams.map(t=>({...t})), players: KHL_DATABASE.players.map(p=>({...p}))};
      document.getElementById('db-player-count').textContent = `${this.db.players.length} игроков`;
    }
    this.state = null;
    this.currentMatchId = null;
    this.notice = '';
    this.loadTeamOptions();
    this.updateContinueButton();
    this.drawRink();
  }
  get storageKey(){return 'khl_manager_save_v2';}
  showScreen(id){['screen-menu','screen-wizard','screen-game'].forEach(x=>document.getElementById(x).classList.toggle('hidden',x!==id));}
  startNewGameWizard(){if(!this.db.teams.length){alert('База команд недоступна. Проверь db.js.');return;}this.loadTeamOptions();this.previewTeam();this.showScreen('screen-wizard');}
    persistQuietly(){if(!this.state)return;if(this.writeAutosave){this.writeAutosave();return;}try{localStorage.setItem(this.storageKey,JSON.stringify(this.state));}catch(e){}}
  loadTeamOptions(){const sel=document.getElementById('select-team');if(!sel)return;const old=sel.value;sel.innerHTML='';this.db.teams.forEach(t=>{const opt=document.createElement('option');opt.value=t.id;opt.textContent=t.name;sel.appendChild(opt);});if(this.db.teams.some(t=>t.id===old))sel.value=old;}
  
  teamById(id){return this.db.teams.find(t=>t.id===id);}
  teamPlayers(id){return this.db.players.filter(p=>p.teamId===id);}
  avg(list, fallback=75){return list.length?list.reduce((s,p)=>s+(Number(p.ovr)||70),0)/list.length:fallback;}
  playerLine(p){return Number(this.state?.lineAssignments?.[p.id]??p.line??4);}
  
  divisionName(key){return ({Bobrov:'Боброва',Tarasov:'Тарасова',Kharlamov:'Харламова',Chernyshev:'Чернышёва'})[key]||key||'—';}
  strengthBar(label,value){return `<div style="display:grid;grid-template-columns:65px 1fr 28px;gap:.5rem;align-items:center;margin:.42rem 0"><span class="tiny muted">${label}</span><div class="progress"><span style="width:${Math.max(0,Math.min(100,(value-55)*2.5))}%"></span></div><b class="small" style="text-align:right">${Math.round(value)}</b></div>`;}
  initNewCareer(){const teamId=document.getElementById('select-team').value;if(!this.teamById(teamId)){alert('Выбери клуб.');return;}this.state=this.createState(teamId);this.currentMatchId=null;this.notice='Карьера началась. Первый игровой день — через 3 дня после старта сезона.';this.showScreen('screen-game');this.switchTab('dashboard');this.renderAll();}
  createState(teamId){const standings={};this.db.teams.forEach(t=>standings[t.id]={gp:0,w:0,l:0,otl:0,sol:0,pp:0,pts:0,gf:0,ga:0,regw:0,otw:0,sow:0});const playerStats={};this.db.players.forEach(p=>playerStats[p.id]={gp:0,g:0,a:0,pts:0,shots:0,plusMinus:0,goalieGP:0,goalieW:0,goalieShots:0,goalieSaves:0,goalieGA:0,shutouts:0});const lineAssignments={};this.teamPlayers(teamId).forEach(p=>lineAssignments[p.id]=p.line||(p.pos==='G'?1:4));const starterGoalieId=this.teamPlayers(teamId).filter(p=>p.pos==='G').sort((a,b)=>b.ovr-a.ovr)[0]?.id||null;const slotAssignments=this.buildDefaultSlots(teamId);Object.entries(slotAssignments).forEach(([slot,id])=>{if(id){const m=slot.match(/^F(\d)/)||slot.match(/^D(\d)/);if(m)lineAssignments[id]=Number(m[1]);}});const playerDevelopment={};this.db.players.forEach(p=>playerDevelopment[p.id]=this.createPlayerDevelopment(p));return {version:2,teamId,dayIndex:0,seasonStart:'2026-09-03',standings,playerStats,playerDevelopment,teamObjective:{type:'playoffs',selected:false,evaluated:false,completed:null,moraleCheckpointGp:0,moraleCheckpointReady:true},matches:this.createSchedule(),scheduleOptimizationVersion:1,lineAssignments,slotAssignments,starterGoalieId,createdAt:new Date().toISOString(),lastMatchId:null,seasonFinished:false};}
  slotDefinitions(){const slots=[];for(let i=1;i<=4;i++)for(const pos of ['LW','C','RW'])slots.push({id:`F${i}${pos}`,label:({LW:'ЛН',C:'Ц',RW:'ПН'})[pos],line:i,type:'F'});for(let i=1;i<=3;i++)for(const side of ['L','R'])slots.push({id:`D${i}${side}`,label:side==='L'?'ЛЗ':'ПЗ',line:i,type:'D'});slots.push({id:'G',label:'В',line:1,type:'G'});return slots;}
  syncLineAssignmentsFromSlots(){if(!this.state)return;const defs=this.slotDefinitions();const assigned=this.state.slotAssignments||{};for(const p of this.teamPlayers(this.state.teamId)){const slot=defs.find(s=>assigned[s.id]===p.id);if(slot)this.state.lineAssignments[p.id]=slot.line;else if(p.pos==='G')this.state.lineAssignments[p.id]=5;else this.state.lineAssignments[p.id]=p.pos==='D'?4:5;}this.state.starterGoalieId=assigned.G||this.state.starterGoalieId;}
  assignSlot(slotId,playerId){if(!this.state)return;const defs=this.slotDefinitions(),target=defs.find(s=>s.id===slotId),player=this.db.players.find(p=>p.id===playerId);if(!target||!player)return;const compatible=target.type==='F'?['LW','C','RW'].includes(player.pos):player.pos===target.type;if(!compatible){this.setNotice(`На позицию ${target.label} можно поставить только ${target.type==='F'?'нападающего':target.type==='D'?'защитника':'вратаря'}.`);return;}if(!this.state.slotAssignments)this.state.slotAssignments=this.buildDefaultSlots(this.state.teamId);const old=this.state.slotAssignments[slotId]||'';const from=defs.find(s=>this.state.slotAssignments[s.id]===playerId);if(from&&from.id!==slotId){const fromCompatible=from.type===target.type;if(fromCompatible)this.state.slotAssignments[from.id]=old;else this.state.slotAssignments[from.id]='';}this.state.slotAssignments[slotId]=playerId;this.syncLineAssignmentsFromSlots();this.renderRoster();this.persistQuietly();}
  makeStableHash(value){return [...String(value)].reduce((n,ch)=>(n*31+ch.charCodeAt(0))>>>0,7);}
  trainingLabel(value){return ({balanced:'Сбалансированная',shooting:'Бросок',passing:'Пас',skating:'Катание',defense:'Оборона',conditioning:'Физподготовка',goalkeeping:'Вратарская техника',recovery:'Восстановление'})[value]||'Сбалансированная';}
  trainingSkill(value){return ({shooting:'shooting',passing:'passing',skating:'skating',defense:'defense',conditioning:'stamina',goalkeeping:'goalkeeping'})[value]||null;}
  trainingOptions(p){const common=[['balanced','Сбалансированная'],['conditioning','Физподготовка'],['recovery','Восстановление']];if(p.pos==='G')return [['balanced','Сбалансированная'],['goalkeeping','Вратарская техника'],...common.slice(1)];if(p.pos==='D')return [['balanced','Сбалансированная'],['defense','Оборона'],['passing','Пас'],['skating','Катание'],...common.slice(1)];return [['balanced','Сбалансированная'],['shooting','Бросок'],['passing','Пас'],['skating','Катание'],...common.slice(1)];}
  createPlayerDevelopment(p){const h=this.makeStableHash(p.id),ovr=Number(p.ovr)||70,position=p.pos;const bias=(n)=>((h>>>n)%9)-4;const skillBase=(key,mod=0)=>this.clamp(ovr+mod+bias(({shooting:0,passing:3,skating:6,defense:9,stamina:12,goalkeeping:15})[key]||0),40,99);const skills={shooting:skillBase('shooting',position==='G'?-18:position==='D'?-3:4),passing:skillBase('passing',position==='G'?-12:position==='D'?3:1),skating:skillBase('skating',position==='G'?-12:position==='F'?3:0),defense:skillBase('defense',position==='D'?7:position==='G'?-4:-2),stamina:skillBase('stamina',position==='G'?2:0),goalkeeping:skillBase('goalkeeping',position==='G'?7:-20)};const potential=this.clamp(ovr+(ovr>=91?1+h%4:ovr>=84?2+h%5:4+h%8),ovr,99);const defaultTraining=position==='G'?'goalkeeping':position==='D'?'defense':'shooting';const d={form:46+h%10,fatigue:h%4,morale:62+h%13,potential,growth:0,growthXP:(h%10)*.35,experience:0,training:defaultTraining,trainingDays:0,gamesPlayed:0,profileRate:.86+(h%7)*.06,skills,skillXP:{shooting:0,passing:0,skating:0,defense:0,stamina:0,goalkeeping:0},goal:null};d.goal=this.makePlayerGoal(p,'auto');return d;}
  playerDev(playerOrId){if(!this.state)return null;const id=typeof playerOrId==='string'?playerOrId:playerOrId?.id;if(!id)return null;if(!this.state.playerDevelopment)this.state.playerDevelopment={};if(!this.state.playerDevelopment[id]){const p=this.db.players.find(x=>x.id===id);if(p)this.state.playerDevelopment[id]=this.createPlayerDevelopment(p);}return this.state.playerDevelopment[id]||null;}
  permanentOVR(p){const d=this.playerDev(p);return this.clamp((Number(p?.ovr)||70)+(d?.growth||0),40,99);}
  effectiveOVR(p){if(!p)return 70;const d=this.playerDev(p);if(!d)return Number(p.ovr)||70;const form=(d.form-50)*.075;const tired=d.fatigue*.055;const spirit=(d.morale-60)*.025;return this.clamp(this.permanentOVR(p)+form-tired+spirit,42,99);}
  playerSkill(p,key){const d=this.playerDev(p);const value=d?.skills?.[key];return value==null?(Number(p?.ovr)||70):value;}
  makePlayerGoal(p,type='auto'){const pos=p.pos,line=Number(this.state?.lineAssignments?.[p.id]??p.line??(pos==='G'?1:4)),ovr=Number(p.ovr)||70;let actual=type;if(actual==='auto')actual=pos==='G'?'goalie_wins':'points';if(actual==='none')return {type:'none',target:0,achieved:false};let target=1;if(actual==='points'){target=pos==='G'?0:pos==='D'?(line<=1?15:line===2?10:6):(line<=1?30:line===2?21:line===3?12:6);target=Math.max(3,Math.round(target*(.78+ovr/360)));}else if(actual==='goals'){target=pos==='G'?0:Math.max(2,Math.round((line<=1?18:line===2?12:line===3?7:3)*(.8+ovr/400)));}else if(actual==='goalie_wins'){target=Math.max(4,Math.round((line<=1?22:9)*(.7+ovr/380)));}else if(actual==='growth'){target=ovr<86?2:1;}return {type:actual,target,achieved:false,auto:type==='auto'};}
  goalTypeLabel(goal){if(!goal||goal.type==='none')return 'Без индивидуальной цели';return ({points:'Набрать очки',goals:'Забросить шайбы',goalie_wins:'Одержать победы',growth:'Повысить рейтинг'})[goal.type]||'Цель';}
  playerGoalValue(p,d){const st=this.state?.playerStats?.[p.id]||{};switch(d?.goal?.type){case'points':return st.pts||0;case'goals':return st.g||0;case'goalie_wins':return st.goalieW||0;case'growth':return d.growth||0;default:return 0;}}
  
  setPlayerTraining(playerId,value){if(!this.state)return;const p=this.db.players.find(x=>x.id===playerId);if(!p||p.teamId!==this.state.teamId)return;if(!this.trainingOptions(p).some(x=>x[0]===value))return;const d=this.playerDev(p);d.training=value;this.persistQuietly();this.renderDevelopment();this.renderRoster();this.setNotice(`Тренировка игрока ${p.name}: ${this.trainingLabel(value).toLowerCase()}.`);}
  setPlayerGoal(playerId,value){if(!this.state)return;const p=this.db.players.find(x=>x.id===playerId);if(!p||p.teamId!==this.state.teamId)return;const allowed=p.pos==='G'?['auto','goalie_wins','growth','none']:['auto','points','goals','growth','none'];if(!allowed.includes(value))return;const d=this.playerDev(p);d.goal=this.makePlayerGoal(p,value);this.persistQuietly();this.renderDevelopment();this.setNotice(`Индивидуальная цель игрока ${p.name} обновлена.`);}
  teamObjectiveInfo(){const obj=this.state?.teamObjective||{type:'playoffs'},type=obj.type||'playoffs',rank=this.conferenceRank(this.state.teamId),confTeams=this.db.teams.filter(t=>t.conf===this.teamById(this.state.teamId)?.conf).length,played=this.state.standings[this.state.teamId]?.gp||0,pts=this.state.standings[this.state.teamId]?.pts||0;let title='',status='',progress=0,success=false;const grown=this.teamPlayers(this.state.teamId).filter(p=>(this.playerDev(p)?.growth||0)>=1).length;if(type==='top4'){title='Занять топ-4 конференции';status=`Текущее место: ${rank}-е из ${confTeams}.`;progress=this.clamp((confTeams+1-rank)/(confTeams-4+1)*100,0,100);success=rank<=4;}else if(type==='points90'){title='Набрать 90 очков';status=`${pts} из 90 очков в регулярном сезоне.`;progress=this.clamp(pts/90*100,0,100);success=pts>=90;}else if(type==='develop3'){title='Развить 3 игроков';status=`Игроков с постоянным ростом рейтинга: ${grown} из 3.`;progress=this.clamp(grown/3*100,0,100);success=grown>=3;}else{title='Попасть в плей-офф';status=`Текущее место: ${rank}-е из ${confTeams}; необходимо попасть в топ-8.`;progress=rank<=8?100:this.clamp((confTeams+1-rank)/(confTeams-7)*100,0,99);success=rank<=8;}if(!played&&type!=='develop3'&&type!=='points90')status='Сезон только начинается. После первых матчей появится актуальное положение в конференции.';if(obj.evaluated)status=obj.completed?`✅ Цель выполнена. ${status}`:`⚠️ Цель не выполнена. ${status}`;return {type,title,status,progress:Math.round(progress),success,played,grown,points:pts,rank};}
  advancePlayerDays(days=1){if(!this.state||days<=0)return;days=Math.min(400,Math.max(1,Math.round(days)));for(const p of this.db.players){const d=this.playerDev(p);if(!d)continue;const recovery=d.training==='recovery'?5.5:d.training==='conditioning'?4.5:3.6;d.fatigue=this.clamp(d.fatigue-days*recovery,0,100);d.trainingDays=(d.trainingDays||0)+days;const gap=Math.max(0,d.potential-this.permanentOVR(p));const learn=d.profileRate*(gap>5?1.12:gap>0?1:.2);d.growthXP+=days*(d.training==='recovery'?.07:d.training==='conditioning'?.13:d.training==='balanced'?.16:.20)*learn;d.experience+=days*(d.training==='recovery'?.025:.055);if(d.training==='balanced'){Object.keys(d.skills).forEach(k=>{d.skillXP[k]=(d.skillXP[k]||0)+days*.055;});}else{const key=this.trainingSkill(d.training);if(key)d.skillXP[key]=(d.skillXP[key]||0)+days*(d.training==='conditioning'?.30:.26);}d.morale+=((64-d.morale)*.0015*days);this.resolvePlayerProgress(p,d);}}
  resolvePlayerProgress(p,d,matchPlayed=false){for(const key of Object.keys(d.skills||{})){while((d.skillXP[key]||0)>=30&&d.skills[key]<99){d.skillXP[key]-=30;d.skills[key]++;d.growthXP+=1.5;}}while(d.growthXP>=58&&this.permanentOVR(p)<d.potential&&d.growth<99-(Number(p.ovr)||70)){d.growthXP-=58;d.growth=(d.growth||0)+1;d.morale=this.clamp(d.morale+1.5,0,100);}if(this.permanentOVR(p)>=d.potential)d.growthXP=Math.min(d.growthXP,57.9);if(matchPlayed)d.experience=(d.experience||0)+1;this.checkPlayerObjective(p);}
  checkPlayerObjective(p){const d=this.playerDev(p),g=d?.goal;if(!d||!g||g.type==='none'||g.achieved)return;const value=this.playerGoalValue(p,d);if(value>=g.target){g.achieved=true;d.morale=this.clamp(d.morale+7,0,100);d.experience=(d.experience||0)+20;d.growthXP=(d.growthXP||0)+4;}}
  applyMatchDevelopment(match,activeH,activeA){if(!this.state||match.developmentApplied)return;const winner=match.homeScore===match.awayScore?null:match.homeScore>match.awayScore?match.homeId:match.awayId;const goals=(match.events||[]).filter(e=>e.kind==='goal');const goalCounts={},assistCounts={};goals.forEach(e=>{if(e.scorerId)goalCounts[e.scorerId]=(goalCounts[e.scorerId]||0)+1;for(const id of [e.assist1Id,e.assist2Id])if(id)assistCounts[id]=(assistCounts[id]||0)+1;});for(const side of [{id:match.homeId,active:activeH,shotsFor:match.homeShots||0,shotsAgainst:match.awayShots||0,goalsAgainst:goals.filter(e=>e.teamId===match.awayId).length},{id:match.awayId,active:activeA,shotsFor:match.awayShots||0,shotsAgainst:match.homeShots||0,goalsAgainst:goals.filter(e=>e.teamId===match.homeId).length}]){const win=winner===side.id,loss=winner&&winner!==side.id,activeIds=new Set([...(side.active?.skaters||[]).map(p=>p.id),side.active?.goalie?.id].filter(Boolean));for(const p of this.teamPlayers(side.id)){const d=this.playerDev(p);if(!d)continue;d.morale=this.clamp(d.morale+(win?1.15:loss?-.7:0),0,100);const played=activeIds.has(p.id);if(!played){d.form=this.clamp(d.form+(50-d.form)*.025,15,100);this.checkPlayerObjective(p);continue;}const isGoalie=p.pos==='G';const gp=goalCounts[p.id]||0,ap=assistCounts[p.id]||0;let load;if(isGoalie){const stamina=this.playerSkill(p,'stamina');load=(match.ot?15.5:13.5)+Math.max(0,side.shotsAgainst-28)*.11;load*=this.clamp(1-(stamina-70)*.003,.78,1.12);}else if(p.pos==='D'){const line=this.playerLine(p);load=(line===1?12:line===2?10:8)+(match.ot?1.8:0);load*=this.clamp(1-(this.playerSkill(p,'stamina')-70)*.003,.78,1.12);}else{const line=this.playerLine(p);load=(line===1?10.5:line===2?9:line===3?8:7)+(match.ot?1.5:0);load*=this.clamp(1-(this.playerSkill(p,'stamina')-70)*.003,.78,1.12);}d.fatigue=this.clamp(d.fatigue+load,0,100);d.gamesPlayed=(d.gamesPlayed||0)+1;d.experience=(d.experience||0)+1;const teamResult=win?1.25:loss?-1.05:0;let performance=gp*4+ap*2+teamResult+(gp===0&&ap===0?-.15:0);if(isGoalie){const savePct=side.shotsAgainst>0?1-side.goalsAgainst/side.shotsAgainst:.92;performance+=(savePct>=.93?2:savePct<.86?-2:0)+(win?1:0);}performance-=(d.form-50)*.035;performance+=(Math.random()-.5)*1.1;d.form=this.clamp(d.form+performance,15,100);d.growthXP+=(d.training==='recovery'?.55:d.training==='conditioning'?.72:.88)*d.profileRate;if(d.training==='balanced'){Object.keys(d.skills).forEach(k=>d.skillXP[k]=(d.skillXP[k]||0)+.16);}else{const key=this.trainingSkill(d.training);if(key)d.skillXP[key]=(d.skillXP[key]||0)+.62;}this.resolvePlayerProgress(p,d,true);}}
    match.developmentApplied=true;}
  renderDevelopment(){if(!this.state)return;const team=this.teamById(this.state.teamId),players=this.teamPlayers(team.id).slice().sort((a,b)=>({LW:0,C:1,RW:2,D:3,G:4}[a.pos]-({LW:0,C:1,RW:2,D:3,G:4}[b.pos]))||this.playerLine(a)-this.playerLine(b)||this.effectiveOVR(b)-this.effectiveOVR(a));const ds=players.map(p=>this.playerDev(p));const avgForm=ds.length?Math.round(ds.reduce((n,d)=>n+d.form,0)/ds.length):50,avgFatigue=ds.length?Math.round(ds.reduce((n,d)=>n+d.fatigue,0)/ds.length):0,highFatigue=ds.filter(d=>d.fatigue>=65).length,grown=ds.filter(d=>d.growth>0).length;document.getElementById('development-summary').innerHTML=[['Средняя форма',avgForm+'/100',avgForm>=60?'Команда на подъёме':avgForm<=40?'Форма просела':'Стабильный уровень'],['Средняя усталость',avgFatigue+'%',avgFatigue>=55?'Стоит дать отдых':'Нагрузка под контролем'],['Уставшие игроки',highFatigue,'усталость от 65%'],['Прирост рейтинга','+'+ds.reduce((n,d)=>n+d.growth,0),'постоянный рост OVR за сезон']].map(([a,b,c])=>`<div class="metric"><div class="label">${a}</div><div class="value">${b}</div><div class="sub">${c}</div></div>`).join('');const info=this.teamObjectiveInfo(),sel=document.getElementById('team-objective-select');if(sel)sel.value=info.type;document.getElementById('team-objective-status').innerHTML=`<strong>${this.escape(info.title)}</strong><div class="objective-bar"><span style="width:${info.progress}%"></span></div><div class="muted small">${this.escape(info.status)}${this.state.teamObjective?.evaluated?'':''}</div>`;const root=document.getElementById('development-list');if(!root)return;root.innerHTML=players.map(p=>{const d=this.playerDev(p),st=this.state.playerStats[p.id]||{},current=this.permanentOVR(p),now=Math.round(this.effectiveOVR(p)),trainingOptions=this.trainingOptions(p),goal=d.goal||this.makePlayerGoal(p,'auto'),allowedGoals=p.pos==='G'?[['auto','Авто: победы'],['goalie_wins','Победы вратаря'],['growth','Рост рейтинга'],['none','Без цели']]:[['auto','Авто: очки'],['points','Набрать очки'],['goals','Забросить шайбы'],['growth','Рост рейтинга'],['none','Без цели']],goalValue=this.playerGoalValue(p,d),goalProgress=goal.target>0?this.clamp(goalValue/goal.target*100,0,100):0;const formColor=d.form>=65?'var(--t-fg-34d399)':d.form<=35?'var(--t-fg-fb7185)':'var(--t-fg-38bdf8)';const focus=this.trainingSkill(d.training);const focusProgress=focus?Math.round((d.skillXP[focus]||0)/30*100):Math.round(d.growthXP/58*100);return `<article class="dev-card"><div class="dev-head"><div><div class="dev-name">${this.escape(p.name)} <span class="dev-flag">${this.positionLabel(p.pos)} · ${this.playerLine(p)<=4?this.playerLine(p)+' звено':'запас'}</span></div><div class="dev-sub">${st.gp||0} матчей · ${st.g||0} Г · ${st.a||0} П · потенциал ${d.potential}</div></div><div class="dev-rating"><strong>${current}</strong><span>пост. OVR · сейчас ${now}</span>${d.growth?`<span style="color:var(--t-fg-34d399)">+${d.growth} за сезон</span>`:''}</div></div><div class="dev-meters"><div class="dev-meter"><div class="dev-meter-head"><span>⚡ Форма</span><b>${Math.round(d.form)}</b></div><div class="dev-bar"><span style="width:${d.form}%;background:${formColor}"></span></div></div><div class="dev-meter"><div class="dev-meter-head"><span>🔋 Усталость</span><b>${Math.round(d.fatigue)}%</b></div><div class="dev-bar fatigue"><span style="width:${d.fatigue}%"></span></div></div><div class="dev-meter"><div class="dev-meter-head"><span>🙂 Мораль</span><b>${Math.round(d.morale)}</b></div><div class="dev-bar morale"><span style="width:${d.morale}%"></span></div></div></div><div class="dev-controls"><div class="dev-control"><label>Индивидуальная тренировка</label><select onchange="app.setPlayerTraining('${p.id}',this.value)">${trainingOptions.map(([v,l])=>`<option value="${v}" ${d.training===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="dev-control"><label>Цель на сезон</label><select onchange="app.setPlayerGoal('${p.id}',this.value)">${allowedGoals.map(([v,l])=>`<option value="${v}" ${(v==='auto'&&goal.auto)||goal.type===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="dev-skills"><span>Бросок ${d.skills.shooting}</span><span>Пас ${d.skills.passing}</span><span>Катание ${d.skills.skating}</span><span>Оборона ${d.skills.defense}</span><span>Выносл. ${d.skills.stamina}</span>${p.pos==='G'?`<span>Вратарь ${d.skills.goalkeeping}</span>`:''}</div><div class="dev-foot"><span>${this.escape(this.trainingLabel(d.training))} · опыт ${Math.round(d.experience||0)} · ${focus?`прогресс навыка ${Math.round(d.skillXP[focus]||0)}/30`:`прогресс развития ${Math.round(d.growthXP||0)}/58`}</span><span class="objective-progress" style="${goal.achieved?'color:var(--t-fg-34d399)':''}">${goal.type==='none'?'Цель не назначена':`${this.escape(this.goalTypeLabel(goal))}: ${goalValue}/${goal.target}${goal.achieved?' ✓':''}`}</span></div><div class="dev-bar" style="margin-top:.25rem"><span style="width:${goalProgress}%;background:${goal.achieved?'#34d399':'#fbbf24'}"></span></div></article>`;}).join('');}
    
  createSchedule(){
    const teams=this.db.teams.map(t=>t.id);
    if(teams.length<4||teams.length%2!==0)throw new Error('Для генератора календаря нужно чётное число команд не меньше четырёх.');
    const teamCount=teams.length;let ring=[...teams];const rounds=[];
    for(let r=0;r<teamCount-1;r++){
      const pairs=[];
      for(let i=0;i<Math.floor(teamCount/2);i++)pairs.push({a:ring[i],b:ring[teamCount-1-i]});
      rounds.push(pairs);ring=[ring[0],ring[ring.length-1],...ring.slice(1,-1)];
    }
    const n=rounds.length,scheduledRounds=68,fullCycles=Math.floor(scheduledRounds/n),extraCount=scheduledRounds%n;
    const makeOrder=(step,offset)=>{
      while(gcd(step,n)!==1)step++;
      return Array.from({length:n},(_,i)=>(i*step+offset)%n);
    };
    const gcd=(a,b)=>{while(b){const t=a%b;a=b;b=t;}return Math.abs(a);};
    const cycleOrders=[Array.from({length:n},(_,i)=>i),makeOrder(8,7),makeOrder(10,3)];
    for(let c=3;c<fullCycles;c++)cycleOrders.push(makeOrder(7+c*2,(c*5+3)%n));
    const lastCycle=cycleOrders[Math.max(0,fullCycles-1)]||Array.from({length:n},(_,i)=>i);
    const blocked=new Set(lastCycle.slice(-extraCount));
    const extraCandidates=Array.from({length:n},(_,i)=>i).filter(i=>!blocked.has(i));
    const extraOrder=[];
    if(extraCount){
      for(let i=0;i<extraCount;i++)extraOrder.push(extraCandidates[Math.min(extraCandidates.length-1,Math.floor((i+.5)*extraCandidates.length/extraCount))]);
    }
    const matches=[];
    for(let round=0;round<scheduledRounds;round++){
      const cycle=Math.floor(round/n),slot=round%n;
      const base=cycle<fullCycles?(cycleOrders[cycle]||Array.from({length:n},(_,i)=>i))[slot]:extraOrder[round-fullCycles*n];
      const pairs=rounds[base];
      pairs.forEach((pair,i)=>{
        matches.push({id:`m${round+1}_${i+1}`,round:round+1,dateOffset:(round+1)*3,homeId:pair.a,awayId:pair.b,played:false,homeScore:null,awayScore:null,ot:false,so:false,homeShots:0,awayShots:0,events:[]});
      });
    }
    // Orient every fixture as an Eulerian tour. Every club has degree 68, so this
    // gives exactly 34 home and 34 away games without changing any pairings.
    const adjacency=new Map(teams.map(id=>[id,[]]));
    matches.forEach((m,index)=>{adjacency.get(m.homeId).push(index);adjacency.get(m.awayId).push(index);});
    const used=new Uint8Array(matches.length);
    for(const start of teams){
      const incident=adjacency.get(start)||[];
      if(!incident.some(index=>!used[index]))continue;
      const stack=[start];
      while(stack.length){
        const current=stack[stack.length-1],edges=adjacency.get(current)||[];
        while(edges.length&&used[edges[edges.length-1]])edges.pop();
        if(!edges.length){stack.pop();continue;}
        const index=edges.pop();if(used[index])continue;used[index]=1;
        const match=matches[index],other=match.homeId===current?match.awayId:match.homeId;
        match.homeId=current;match.awayId=other;stack.push(other);
      }
    }
    // Optimise home/away runs without changing the pairings or the 34/34 balance.
    this.optimizeScheduleHomeAway(matches,teams);
    const homeCount=new Map(teams.map(id=>[id,0])),gameCount=new Map(teams.map(id=>[id,0]));
    matches.forEach(m=>{homeCount.set(m.homeId,(homeCount.get(m.homeId)||0)+1);gameCount.set(m.homeId,(gameCount.get(m.homeId)||0)+1);gameCount.set(m.awayId,(gameCount.get(m.awayId)||0)+1);});
    if(teams.length===22&&matches.length!==748)throw new Error('Календарь КХЛ должен содержать 748 матчей.');
    if(teams.length===22&&teams.some(id=>homeCount.get(id)!==34||gameCount.get(id)!==68))throw new Error('Не удалось сбалансировать календарь: проверь распределение домашних и гостевых матчей.');
    return matches.sort((a,b)=>a.dateOffset-b.dateOffset||a.id.localeCompare(b.id,undefined,{numeric:true}));
  }
  formatDate(offset){const date=new Date(`${this.state?.seasonStart||'2026-09-03'}T12:00:00`);date.setDate(date.getDate()+offset);return date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});}
  
  /* removed 8.0: overridden later */
  validateSave(s){return !!(s&&s.version===2&&this.teamById(s.teamId)&&Array.isArray(s.matches)&&s.standings&&s.playerStats);}
  repairSave(){for(const t of this.db.teams){if(!this.state.standings[t.id])this.state.standings[t.id]={gp:0,w:0,l:0,otl:0,sol:0,pp:0,pts:0,gf:0,ga:0,regw:0,otw:0,sow:0};}for(const p of this.db.players){if(!this.state.playerStats[p.id])this.state.playerStats[p.id]={gp:0,g:0,a:0,pts:0,shots:0,plusMinus:0,goalieGP:0,goalieW:0,goalieShots:0,goalieSaves:0,goalieGA:0,shutouts:0};}this.state.matches.forEach(m=>{m.events=m.events||[];});Object.values(this.state.standings).forEach(x=>{if(x.pp==null)x.pp=0;if(x.otl==null)x.otl=0;if(x.sol==null)x.sol=0;});if(!this.state.lineAssignments)this.state.lineAssignments={};this.teamPlayers(this.state.teamId).forEach(p=>{if(this.state.lineAssignments[p.id]==null)this.state.lineAssignments[p.id]=p.line||(p.pos==='G'?1:4);});if(!this.state.slotAssignments)this.state.slotAssignments=this.buildDefaultSlots(this.state.teamId);if(!this.state.starterGoalieId||!this.teamPlayers(this.state.teamId).some(p=>p.id===this.state.starterGoalieId&&p.pos==='G'))this.state.starterGoalieId=this.teamPlayers(this.state.teamId).filter(p=>p.pos==='G').sort((a,b)=>b.ovr-a.ovr)[0]?.id||null;if(!this.state.slotAssignments.G)this.state.slotAssignments.G=this.state.starterGoalieId;if(!this.state.playerDevelopment)this.state.playerDevelopment={};for(const p of this.db.players){const fresh=this.createPlayerDevelopment(p);const old=this.state.playerDevelopment[p.id];if(!old)this.state.playerDevelopment[p.id]=fresh;else{this.state.playerDevelopment[p.id]={...fresh,...old,skills:{...fresh.skills,...(old.skills||{})},skillXP:{...fresh.skillXP,...(old.skillXP||{})}};if(!this.state.playerDevelopment[p.id].goal)this.state.playerDevelopment[p.id].goal=fresh.goal;}}if(!this.state.teamObjective)this.state.teamObjective={type:'playoffs',evaluated:false,completed:null};if(!this.state.teamObjective.type)this.state.teamObjective.type='playoffs';this.syncLineAssignmentsFromSlots();}
  saveGame(){if(!this.state){alert('Сначала начни карьеру.');return;}try{localStorage.setItem(this.storageKey,JSON.stringify(this.state));this.updateContinueButton();this.setNotice('Игра сохранена в этом браузере. Для резервной копии используй «Экспортировать сохранение в файл» в главном меню.');alert('Карьера сохранена!');}catch(e){alert('Браузер не разрешил локальное сохранение. Вернись в главное меню и выбери «Экспортировать сохранение в файл».');}}
  updateContinueButton(){const btn=document.getElementById('continue-btn');try{const s=JSON.parse(localStorage.getItem(this.storageKey)||'null');btn.disabled=!(s&&this.validateSave(s));btn.style.opacity=btn.disabled?'.5':'1';}catch{btn.disabled=true;}}
  exportSave(){let save=this.state;try{if(!save){const raw=localStorage.getItem(this.storageKey);if(raw)save=JSON.parse(raw);}}catch(e){}if(!save||!this.validateSave(save)){alert('Нет сохранённой карьеры для экспорта. Сначала начни или загрузи карьеру.');return;}const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`khl-manager-save-${save.teamId}-${new Date().toISOString().slice(0,10)}.json`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);alert('Файл сохранения подготовлен. Если браузер спросит, подтверди скачивание и выбери папку «Загрузки» или другое место во внутренней памяти телефона.');}
  /* removed 8.0: overridden later */
  /* removed 8.0: overridden later */
  switchTab(name,button){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(button&&button.dataset.view!==name)button.classList.add('active');if(name==='match')this.renderMatchCenter();if(name==='roster')this.renderRoster();if(name==='development')this.renderDevelopment();if(name==='stats')this.renderStats();if(name==='schedule')this.renderSchedule();if(name==='stadiums')this.renderStadiums();}
  openPregame(matchId){this.pendingMatchId=matchId;this.currentMatchId=matchId;this._pgOpen=true;this.renderPregame();this.setNotice('Подготовка к матчу: проверьте готовность и начинайте.');}
  saveLineupOnly(){if(!this.state)return;this.syncLineAssignmentsFromSlots();this.persistQuietly();this.setNotice('Состав сохранён.');this.renderRoster();this.renderAll();}
    simulateMatchesAt(offset,excludeUserMatch=false){let count=0;const todays=this.state.matches.filter(m=>!m.played&&m.dateOffset===offset&&!(excludeUserMatch&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId)));todays.forEach(m=>{this.simulateMatch(m);count++;});return count;}
  
  clamp(v,min,max){return Math.min(max,Math.max(min,v));}
  
  activeSkaters(teamId){const p=this.teamPlayers(teamId);if(teamId===this.state.teamId&&this.state.slotAssignments){const byId=id=>p.find(x=>x.id===id);const slots=this.state.slotAssignments;const forwards=this.slotDefinitions().filter(s=>s.type==='F').map(s=>byId(slots[s.id])).filter(Boolean);const defense=this.slotDefinitions().filter(s=>s.type==='D').map(s=>byId(slots[s.id])).filter(Boolean);const goalies=p.filter(x=>x.pos==='G');const goalie=byId(slots.G)||goalies.find(x=>x.id===this.state.starterGoalieId)||goalies.sort((a,b)=>b.ovr-a.ovr)[0];return {forwards,defense,goalie,skaters:[...forwards,...defense]};}const forwards=p.filter(x=>['LW','C','RW'].includes(x.pos)&&this.playerLine(x)>=1&&this.playerLine(x)<=4).sort((a,b)=>this.playerLine(a)-this.playerLine(b)||this.effectiveOVR(b)-this.effectiveOVR(a)).slice(0,12);const defense=p.filter(x=>x.pos==='D'&&this.playerLine(x)>=1&&this.playerLine(x)<=3).sort((a,b)=>this.playerLine(a)-this.playerLine(b)||this.effectiveOVR(b)-this.effectiveOVR(a)).slice(0,6);const goalies=p.filter(x=>x.pos==='G');const goalie=goalies.sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a))[0];return {forwards,defense,goalie,skaters:[...forwards,...defense]};}
  weightedPick(players,skill=null){if(!players?.length)return null;const weights=players.map(p=>{const skillBonus=skill?(this.playerSkill(p,skill)-75)*.10:0;const score=this.effectiveOVR(p)+skillBonus;return Math.exp((score-75)/this.MATCH_MODEL_PARAMS.pickScale)*(p.pos==='D'?.48:1)*(this.playerLine(p)===1?1.32:this.playerLine(p)===2?1.08:this.playerLine(p)===3?.86:.68);});let total=weights.reduce((sum,w)=>sum+w,0),r=Math.random()*total;for(let i=0;i<players.length;i++){r-=weights[i];if(r<=0)return players[i];}return players[players.length-1];}
  simulateMatch(match){if(match.played)return match;const home=this.teamById(match.homeId),away=this.teamById(match.awayId);this.calculateAttendance(match);const sh=this.getStrength(home.id),sa=this.getStrength(away.id);let expH=this.clamp(2.68+(sh.attack-80)*.055+(sh.defense-80)*.012-(sa.goalie-80)*.060+(sh.overall-sa.overall)*.012+.13,0.9,4.4);let expA=this.clamp(2.53+(sa.attack-80)*.055+(sa.defense-80)*.012-(sh.goalie-80)*.060+(sa.overall-sh.overall)*.012,0.85,4.2);
    const __sm=this.shotModelGame(match,home,away,sh,sa,false);match.__shotsP={h:__sm.shotsPH,a:__sm.shotsPA};match.scn=__sm.scn||null;let gH=__sm.goalsH.length,gA=__sm.goalsA.length;const activeH=this.activeSkaters(home.id),activeA=this.activeSkaters(away.id);match.events=[];
    const goalsH=gH,goalsA=gA;const goalEvents=[];__sm.goalsH.forEach(t=>goalEvents.push({teamId:home.id,time:t}));__sm.goalsA.forEach(t=>goalEvents.push({teamId:away.id,time:t}));goalEvents.sort((a,b)=>a.time-b.time);const regulationGoals={home:0,away:0};
    goalEvents.forEach(g=>{const isHome=g.teamId===home.id;const active=isHome?activeH:activeA,opponent=isHome?activeA:activeH;const shooter=this.pickScorer(active);const assPool=active.skaters.filter(x=>x&&shooter&&x.id!==shooter.id);const assist1=Math.random()<this.assistProb(1)?this.weightedPick(assPool,'passing'):null;const assist2=assist1&&Math.random()<this.assistProb(2)?this.weightedPick(assPool.filter(x=>x.id!==assist1?.id),'passing'):null;const minute=Math.min(59,Math.floor(g.time));const period=Math.min(3,Math.floor(minute/20)+1);const timeInPeriod=minute%20;const event={teamId:g.teamId,scorerId:shooter?.id||null,assist1Id:assist1?.id||null,assist2Id:assist2?.id||null,period:`${period}П`,time:`${String(timeInPeriod).padStart(2,'0')}:${String(Math.floor((g.time%1)*60)).padStart(2,'0')}`,kind:'goal'};match.events.push(event);if(isHome)regulationGoals.home++;else regulationGoals.away++;this.addPlayerPoint(shooter,'g');this.addPlayerPoint(assist1,'a');this.addPlayerPoint(assist2,'a');if(shooter)this.state.playerStats[shooter.id].shots++;if(shooter){this.state.playerStats[shooter.id].plusMinus++;opponent.skaters.forEach(x=>this.state.playerStats[x.id].plusMinus--);}if(assist1)this.state.playerStats[assist1.id].plusMinus++;if(assist2)this.state.playerStats[assist2.id].plusMinus++;});
    const eventKinds=[{kind:'penalty',text:'Удаление за задержку клюшкой — 2 минуты большинства сопернику'},{kind:'save',text:'Вратарь ловит шайбу после опасного броска'},{kind:'hit',text:'Силовой приём у борта, шайба остаётся в игре'},{kind:'icing',text:'Проброс. Вбрасывание в зоне команды'},{kind:'offside',text:'Положение вне игры — свисток судьи'},{kind:'chance',text:'Опасный момент! Бросок рядом со штангой'},{kind:'faceoff',text:'Выиграно важное вбрасывание в нейтральной зоне'},{kind:'block',text:'Защитник блокирует бросок на себя'}];const extraCount=0;for(let i=0;i<extraCount;i++){const minute=Math.floor(Math.random()*60),period=Math.min(3,Math.floor(minute/20)+1),tm=minute%20,kind=eventKinds[Math.floor(Math.random()*eventKinds.length)],teamId=Math.random()<.5?home.id:away.id;match.events.push({kind:kind.kind,text:kind.text,teamId,period:`${period}П`,time:`${String(tm).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`});}
    let ot=false,so=false,winnerId=null;if(gH===gA){const pHome=this.clamp(.5+(sh.overall-sa.overall)*.025, .25,.75);if(__sm.otWinner){winnerId=__sm.otWinner;match.otClock=__sm.otClock;}else if(Math.random()<pHome){winnerId=home.id;}else winnerId=away.id;if(__sm.otWinner){ot=true;match.overtimeEmptyNet=Math.random()<.035;if(winnerId===home.id){gH++;const goal=this.createExtraTimeGoal(match,home.id,activeH,activeA,'ОТ');if(match.overtimeEmptyNet)goal.text='Победная шайба в пустые ворота';match.events.push(goal);}else{gA++;const goal=this.createExtraTimeGoal(match,away.id,activeA,activeH,'ОТ');if(match.overtimeEmptyNet)goal.text='Победная шайба в пустые ворота';match.events.push(goal);}}else{so=true;const shoot=this.shootoutWinner(home.id,away.id,activeH,activeA,match.events);winnerId=shoot.winnerId;if(winnerId===home.id)gH++;else gA++;match.events.push({teamId:winnerId,scorerId:null,assist1Id:null,assist2Id:null,period:'Б',time:'00:00',virtualMinute:65+shoot.total*.01+.02,kind:'shootout',text:`со счётом ${shoot.score[home.id]}:${shoot.score[away.id]}`});}}
    match.homeScore=gH;match.awayScore=gA;match.ot=ot;match.so=so;const goalShotsH=regulationGoals.home+(ot&&winnerId===home.id?1:0);const goalShotsA=regulationGoals.away+(ot&&winnerId===away.id?1:0);match.homeShots=Math.max(goalShotsH,__sm.shotsH);match.awayShots=Math.max(goalShotsA,__sm.shotsA);match.played=true;
    // Distribute non-goal shots between active skaters to make individual shot stats useful.
    for(let i=0;i<Math.max(0,match.homeShots-goalShotsH);i++){const shooter=this.weightedPick(activeH.skaters);if(shooter)this.state.playerStats[shooter.id].shots++;}
    for(let i=0;i<Math.max(0,match.awayShots-goalShotsA);i++){const shooter=this.weightedPick(activeA.skaters);if(shooter)this.state.playerStats[shooter.id].shots++;}
    // Player and goaltender appearances/stats.
    [...activeH.skaters,...activeA.skaters].forEach(p=>{this.state.playerStats[p.id].gp++;});if(activeH.goalie){const st=this.state.playerStats[activeH.goalie.id];st.gp++;st.goalieGP++;st.goalieShots+=match.awayShots;st.goalieSaves+=Math.max(0,match.awayShots-goalShotsA);st.goalieGA+=goalShotsA;if(gA===0)st.shutouts++;}if(activeA.goalie){const st=this.state.playerStats[activeA.goalie.id];st.gp++;st.goalieGP++;st.goalieShots+=match.homeShots;st.goalieSaves+=Math.max(0,match.homeShots-goalShotsH);st.goalieGA+=goalShotsH;if(gH===0)st.shutouts++;}
    const hs=this.state.standings[home.id],as=this.state.standings[away.id];hs.gp++;as.gp++;hs.gf+=gH;hs.ga+=gA;as.gf+=gA;as.ga+=gH;
    if(gH>gA){hs.w++;hs.pts+=2;if(so){hs.sow++;as.sol++;as.pts++;}else if(ot){hs.otw++;if(match.overtimeEmptyNet)as.pp=(as.pp||0)+1;else{as.otl++;as.pts++;}}else{hs.regw++;as.l++;}winnerId=home.id;}else{as.w++;as.pts+=2;if(so){as.sow++;hs.sol++;hs.pts++;}else if(ot){as.otw++;if(match.overtimeEmptyNet)hs.pp=(hs.pp||0)+1;else{hs.otl++;hs.pts++;}}else{as.regw++;hs.l++;}winnerId=away.id;}
    // Goalie win and save totals only for the winning club's starter.
    if(winnerId===home.id&&activeH.goalie)this.state.playerStats[activeH.goalie.id].goalieW++;if(winnerId===away.id&&activeA.goalie)this.state.playerStats[activeA.goalie.id].goalieW++;
    match.events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));match.events.push({kind:'intermission',time:'20:00',period:'1П',teamId:home.id,text:'Первый период завершён. Перерыв.'},{kind:'intermission',time:'20:00',period:'2П',teamId:home.id,text:'Второй период завершён. Команды готовятся к заключительной двадцатиминутке.'});match.events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));match.events.push({kind:'final',time:so?'65:00':ot?'61:00':'60:00',period:'Итог',teamId:winnerId,text:so?'Победа в серии буллитов':ot?'Победа в овертайме':'Матч завершён'});this.applyMatchDevelopment(match,activeH,activeA);return match;
  }
  createExtraTimeGoal(match,teamId,active,opponent,period){const shooter=this.pickScorer(active);const pool=active.skaters.filter(x=>x.id!==shooter?.id);const a1=Math.random()<this.assistProb(1)?this.weightedPick(pool,'passing'):null;this.addPlayerPoint(shooter,'g');this.addPlayerPoint(a1,'a');if(shooter){this.state.playerStats[shooter.id].shots++;this.state.playerStats[shooter.id].plusMinus++;opponent.skaters.forEach(x=>this.state.playerStats[x.id].plusMinus--);}if(a1)this.state.playerStats[a1.id].plusMinus++;return {teamId,scorerId:shooter?.id||null,assist1Id:a1?.id||null,assist2Id:null,period,time:match.otClock||'01:00',kind:'goal'};}
  addPlayerPoint(player,type){if(!player)return;const s=this.state.playerStats[player.id];if(!s)return;s[type]++;s.pts=s.g+s.a;}
  eventMinute(e){if(e.kind==='intermission')return e.period==='1П'?20:e.period==='2П'?40:60;const [m='0',s='0']=(e.time||'00:00').split(':');if(e.period==='ОТ')return 60+Number(m)+Number(s)/60;if(e.period==='Б')return 65;const p=Number.parseInt(e.period,10)||1;return (p-1)*20+Number(m)+Number(s)/60;}
  matchSummary(m){const h=this.teamById(m.homeId),a=this.teamById(m.awayId);return `${h.name} ${m.homeScore}:${m.awayScore} ${a.name}${m.so?' (Б)':m.ot?' (ОТ)':''}`;}
  matchTime(event){return event.period==='ОТ'?'ОТ '+event.time:event.period==='Б'?'БУЛЛ.':`${event.period} ${event.time}`;}
  setNotice(msg){this.notice=msg;const el=document.getElementById('last-result-note');if(el){el.textContent=msg;el.classList.remove('hidden');}}
  
  
  liveStamp(minute,second){let period,elapsed;if(minute<=20){period='1П';elapsed=minute-1;}else if(minute<=40){period='2П';elapsed=minute-21;}else if(minute<=60){period='3П';elapsed=minute-41;}else{period='ОТ';elapsed=minute-61;}return {period,time:`${String(Math.max(0,elapsed)).padStart(2,'0')}:${String(second).padStart(2,'0')}`};}
  completeLiveMatch(live){const m=live.simulatedMatch,target=this.state.matches.find(x=>x.id===live.matchId);if(!target)return;const events=[...m.events].sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));Object.assign(target,{homeScore:m.homeScore,awayScore:m.awayScore,homeShots:m.homeShots,awayShots:m.awayShots,events,played:true,ot:!!m.ot,so:!!m.so,overtimeEmptyNet:!!m.overtimeEmptyNet,attendance:m.attendance,attendancePercent:m.attendancePercent,attendanceAwayRank:m.attendanceAwayRank,arenaName:m.arenaName,arenaCapacity:m.arenaCapacity,ppGoalsHome:m.ppGoalsHome||0,ppGoalsAway:m.ppGoalsAway||0,fights:m.fights||[],expulsions:m.expulsions||[],scn:m.scn||live.scn||null});const goals=events.filter(e=>e.kind==='goal');for(const [id,count] of Object.entries(live.shotStats)){if(this.state.playerStats[id])this.state.playerStats[id].shots+=count;}for(const g of goals){const shooter=this.db.players.find(p=>p.id===g.scorerId),a1=this.db.players.find(p=>p.id===g.assist1Id),a2=this.db.players.find(p=>p.id===g.assist2Id);if(shooter){this.addPlayerPoint(shooter,'g');this.state.playerStats[shooter.id].plusMinus++;}for(const a of [a1,a2])if(a){this.addPlayerPoint(a,'a');this.state.playerStats[a.id].plusMinus++;}const opp=g.teamId===live.homeId?live.activeA:live.activeH;opp.skaters.forEach(p=>{if(this.state.playerStats[p.id])this.state.playerStats[p.id].plusMinus--;});}for(const p of [...live.activeH.skaters,...live.activeA.skaters])if(this.state.playerStats[p.id])this.state.playerStats[p.id].gp++;const homeGoals=goals.filter(g=>g.teamId===live.homeId).length,awayGoals=goals.filter(g=>g.teamId===live.awayId).length;for(const side of [{id:live.homeId,active:live.activeH,shots:m.awayShots,goals:awayGoals,againstTeam:live.awayId},{id:live.awayId,active:live.activeA,shots:m.homeShots,goals:homeGoals,againstTeam:live.homeId}]){const records=Object.values(live.goaliePerformance||{}).filter(r=>String(r.teamId)===String(side.id));if(records.length){for(const rec of records){const st=this.state.playerStats[rec.goalieId];if(!st)continue;const faced=Math.max(0,Number(rec.shots)||0),allowed=Math.max(0,Number(rec.goalsAgainst)||0);st.gp++;st.goalieGP++;st.goalieShots+=faced;st.goalieSaves+=Math.max(0,faced-allowed);st.goalieGA+=allowed;if(side.goals===0&&records.length===1&&allowed===0)st.shutouts++;}}else{const goalie=side.active.goalie;if(!goalie)continue;const st=this.state.playerStats[goalie.id];st.gp++;st.goalieGP++;st.goalieShots+=side.shots;st.goalieSaves+=Math.max(0,side.shots-side.goals);st.goalieGA+=side.goals;if(side.goals===0)st.shutouts++;}}
    const home=this.teamById(live.homeId),away=this.teamById(live.awayId),hs=this.state.standings[live.homeId],as=this.state.standings[live.awayId];hs.gp++;as.gp++;hs.gf+=m.homeScore;hs.ga+=m.awayScore;as.gf+=m.awayScore;as.ga+=m.homeScore;let winnerId;if(m.homeScore>m.awayScore){winnerId=home.id;hs.w++;hs.pts+=2;if(m.so){hs.sow++;as.sol++;as.pts++;}else if(m.ot){hs.otw++;if(m.overtimeEmptyNet)as.pp=(as.pp||0)+1;else{as.otl++;as.pts++;}}else{hs.regw++;as.l++;}}else{winnerId=away.id;as.w++;as.pts+=2;if(m.so){as.sow++;hs.sol++;hs.pts++;}else if(m.ot){as.otw++;if(m.overtimeEmptyNet)hs.pp=(hs.pp||0)+1;else{hs.otl++;hs.pts++;}}else{as.regw++;hs.l++;}}const winningGoalie=(winnerId===home.id?live.activeH:live.activeA).goalie;if(winningGoalie&&this.state.playerStats[winningGoalie.id])this.state.playerStats[winningGoalie.id].goalieW++;this.applyMatchDevelopment(target,live.activeH,live.activeA);this.state.lastMatchId=target.id;this.currentMatchId=target.id;this.liveMatch=null;this.setNotice(this.matchSummary(target));this.persistQuietly();this.renderAll();}
    periodScores(match,events){const out={home:[0,0,0,0,0],away:[0,0,0,0,0]};for(const e of events){const side=e.teamId===match.homeId?'home':'away';if(e.kind==='goal'){const p=e.period==='ОТ'?3:Math.max(0,Math.min(2,(Number.parseInt(e.period,10)||1)-1));out[side][p]++;}}if((match.ot||match.so)&&match.homeScore!==match.awayScore){const winner=match.homeScore>match.awayScore?'home':'away';if(match.so)out[winner][4]=1;else out[winner][3]=Math.max(1,out[winner][3]);}return out;}
  finishMatchSim(){if(this.liveMatch){this.revealFullMatch();return;}if(!this.state)return;let match=this.currentMatchId&&this.state.matches.find(m=>m.id===this.currentMatchId);if(!match||!match.played){this.playNextMatch();return;}this.renderMatchCenter();this.setNotice(this.matchSummary(match));}
  renderAll(){if(!this.state)return;const user=this.teamById(this.state.teamId),ss=this.state.standings[user.id],maxDate=Math.max(...this.state.matches.map(m=>m.dateOffset));const poS=this.state.playoff;if(this.state.seasonFinished&&!(poS&&(poS.started||poS.completed))&&this.regularSeasonComplete&&!this.regularSeasonComplete())this.state.seasonFinished=false;const seasonDone=this.state.dayIndex>=maxDate&&!this.state.matches.some(m=>!m.played)&&!(this.calendarUnformed&&this.calendarUnformed());if(seasonDone&&!this.state.seasonFinished){this.evaluateTeamObjective();this.state.seasonFinished=true;this.persistQuietly();}document.getElementById('header-team').textContent=user.name;document.getElementById('header-date').textContent=this.formatDate(this.state.dayIndex);document.getElementById('header-coach').textContent=`Тренер: ${user.coach||'—'}`;document.getElementById('header-record').textContent=`${ss.w}В · ${ss.l}П · ${ss.otl}ОТ · ${ss.pts} очков`;document.getElementById('dash-headline').textContent=this.state.seasonFinished?'Регулярный чемпионат завершён':`Сезон идёт: ${Math.round(ss.gp/68*100)}% матчей сыграно`;document.getElementById('dash-subtitle').textContent=`${user.name} · ${this.teamPlayers(user.id).length} игроков в базе · текущая форма и усталость учитываются при расчёте матчей.`;document.getElementById('last-result-note').classList.toggle('hidden',!this.notice);document.getElementById('last-result-note').textContent=this.notice;this.renderNextMatch();this.renderMetrics();this.renderStandings();this.renderSchedule();this.renderRoster();this.renderFinances();this.renderStats();this.renderMatchCenter();this.renderStadiums();this.renderDevelopment();this.updateContinueButton();}
  standingsFor(conf){return this.db.teams.filter(t=>t.conf.toLowerCase()===conf).map(t=>({...t,...this.state.standings[t.id]})).sort((a,b)=>b.pts-a.pts||b.regw-a.regw||b.otw-a.otw||b.sow-a.sow||(b.gf-b.ga)-(a.gf-a.ga)||b.gf-a.gf||a.name.localeCompare(b.name,'ru'));}
  standingsTable(conf,preview=false){const rows=this.standingsFor(conf);return `<div class="table-wrap standings-compact-wrap"><table class="data-table standings-compact"><thead><tr><th>#</th><th>Клуб</th><th class="numeric" title="Сыграно матчей">И</th><th class="numeric" title="Победы в основное время">В</th><th class="numeric" title="Победы в овертайме">ВО</th><th class="numeric" title="Победы по буллитам">ВБ</th><th class="numeric" title="Поражения в основное время">П</th><th class="numeric" title="Поражения в овертайме">ПО</th><th class="numeric" title="Поражения по буллитам">ПБ</th><th class="numeric" title="Забитые:пропущенные шайбы">Ш</th><th class="numeric">О</th></tr></thead><tbody>${rows.map((t,i)=>`<tr class="${t.id===this.state.teamId?'user-row':''}${i===7?' po-cut':''}"><td class="rank">${i+1}</td><td class="team-cell">${this.escape(t.name)}${t.id===this.state.teamId?' ◀':''}</td><td class="numeric">${t.gp}</td><td class="numeric">${t.regw||0}</td><td class="numeric">${t.otw||0}</td><td class="numeric">${t.sow||0}</td><td class="numeric">${t.l||0}</td><td class="numeric">${t.otl||0}</td><td class="numeric">${t.sol||0}</td><td class="numeric" title="Забитые:пропущенные шайбы">${t.gf||0}:${t.ga||0}</td><td class="numeric"><b>${t.pts}</b></td></tr>`).join('')}</tbody></table></div>`;}
  renderStandings(){for(const c of ['west','east']){const w=document.getElementById(`preview-${c}`),f=document.getElementById(`full-${c}`);if(w)w.innerHTML=this.standingsTable(c,true);if(f)f.innerHTML=this.standingsTable(c,false);}}
  shortName(name){const tm=this.db&&this.db.teams&&this.db.teams.find(x=>x.name===name);if(tm&&this.clubAbbr)return this.clubAbbr(tm.id);return name.replace('Шанхайские Драконы','ШД').replace('Салават Юлаев','СЮ').replace('Металлург Мг','ММ').split(' ').map(x=>x[0]).join('').slice(0,3).toUpperCase();}
  
  renderRoster(){if(!this.state)return;const id=this.state.teamId;let players=this.teamPlayers(id).map(p=>({...p,...this.state.playerStats[p.id]}));const filter=document.getElementById('roster-filter')?.value||'all';if(filter==='F')players=players.filter(p=>['LW','C','RW'].includes(p.pos));else if(filter!=='all')players=players.filter(p=>p.pos===filter);const all=this.teamPlayers(id),forwards=all.filter(p=>['LW','C','RW'].includes(p.pos)),def=all.filter(p=>p.pos==='D'),goalies=all.filter(p=>p.pos==='G');document.getElementById('roster-summary').innerHTML=[['Нападающие',forwards.length],['Защитники',def.length],['Вратари',goalies.length],['Игроки в базе',all.length]].map(([a,b])=>`<div class="metric"><div class="label">${a}</div><div class="value">${b}</div></div>`).join('');const lineEl=document.getElementById('line-editor');if(lineEl){if(!this.state.slotAssignments)this.state.slotAssignments=this.buildDefaultSlots(id);const defs=this.slotDefinitions(),slots=this.state.slotAssignments,assigned=new Set(Object.values(slots).filter(Boolean));const slotHtml=(slot)=>{const current=all.find(p=>p.id===slots[slot.id]);const candidates=all.filter(p=>slot.type==='F'?['LW','C','RW'].includes(p.pos):p.pos===slot.type).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));return `<div class="line-slot" data-slot="${slot.id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="event.preventDefault();this.classList.remove('drag-over');app.assignSlot('${slot.id}',event.dataTransfer.getData('text/player-id'))"><div class="slot-label">${slot.label}</div><div><div class="slot-player" ${current?`draggable="true" ondragstart="event.dataTransfer.setData('text/player-id','${current.id}')`:""}>${current?this.escape(current.name):'<span class="muted">Перетащи игрока</span>'}</div><div class="slot-ovr">${current?`OVR ${this.permanentOVR(current)} · сейчас ${Math.round(this.effectiveOVR(current))}`:'Свободная позиция'}</div></div><div class="slot-controls"><select aria-label="Игрок на позиции ${slot.label}" onfocus="app.expandSlotSelect(this)" onpointerdown="app.expandSlotSelect(this)" onblur="app.collapseSlotSelect(this)" onchange="app.assignSlot('${slot.id}',this.value)"><option value="">— выбрать —</option>${candidates.map(p=>`<option value="${p.id}" ${p.id===slots[slot.id]?'selected':''}>${this.escape(p.name)} · ${this.permanentOVR(p)}</option>`).join('')}</select></div></div>`;};const forwardUnits=[1,2,3,4].map(i=>`<div class="lineup-unit"><h3>${i}-е звено нападения</h3><div class="lineup-slots">${['LW','C','RW'].map(pos=>slotHtml(defs.find(x=>x.id===`F${i}${pos}`))).join('')}</div></div>`).join('');const defenseUnits=[1,2,3].map(i=>`<div class="lineup-unit"><h3>${i}-я пара защитников</h3><div class="lineup-slots">${['L','R'].map(side=>slotHtml(defs.find(x=>x.id===`D${i}${side}`))).join('')}</div></div>`).join('');const goalieHtml=`<div class="lineup-unit"><h3>Стартовый вратарь</h3><div class="lineup-slots">${slotHtml(defs.find(x=>x.id==='G'))}</div></div>`;const bench=all.filter(p=>!assigned.has(p.id)).sort((a,b)=>({LW:0,C:1,RW:2,D:3,G:4}[a.pos]-({LW:0,C:1,RW:2,D:3,G:4}[b.pos]))||this.effectiveOVR(b)-this.effectiveOVR(a));lineEl.innerHTML=`<div class="lineup-board">${forwardUnits}${defenseUnits}${goalieHtml}<div class="lineup-unit"><h3>Запас · перетащи игрока на нужную позицию</h3><p class="tiny muted">Можно также выбрать фамилию в выпадающем списке каждой позиции. Нападающие, защитники и вратари назначаются только на подходящие позиции.</p><div class="bench-list">${bench.map(p=>`<div class="bench-player" data-player-id="${p.id}" draggable="true" ondragstart="event.dataTransfer.setData('text/player-id','${p.id}')"><b>${this.escape(p.name)}</b><span class="muted">${this.positionLabel(p.pos)} · ${this.permanentOVR(p)}</span></div>`).join('')||'<span class="small muted">Все игроки назначены в схему.</span>'}</div></div><div class="toolbar lineup-actions"><button class="btn btn-primary" onclick="app.saveLineupOnly()">💾 Сохранить состав</button><button class="btn btn-quiet" onclick="app.resetLineup()">↺ Рекомендуемый состав</button></div></div>`;}const groups=[{title:'Нападающие',players:players.filter(p=>['LW','C','RW'].includes(p.pos))},{title:'Защитники',players:players.filter(p=>p.pos==='D')},{title:'Вратари',players:players.filter(p=>p.pos==='G')}];document.getElementById('roster-groups').innerHTML=groups.filter(g=>g.players.length).map(g=>{const sorted=g.players.sort((a,b)=>this.playerLine(a)-this.playerLine(b)||b.ovr-a.ovr);return `<div class="roster-group"><h3>${g.title} <span class="badge">${sorted.length}</span></h3>${sorted.map(p=>`<div class="player-row" data-player-id="${p.id}"><div><div class="player-name">${this.escape(p.name)} <span class="badge">${this.positionLabel(p.pos)}${this.playerLine(p)<=4?` · ${this.playerLine(p)} звено`:' · запас'}</span>${p.foreign?' <span class="badge gold">Лег.</span>':''}</div><div class="player-sub">${p.gp} матчей · ${p.g} Г · ${p.a} П · ${p.pts} О · форма ${Math.round(this.playerDev(p)?.form||50)} · усталость ${Math.round(this.playerDev(p)?.fatigue||0)}% · ${this.money(p.salary)} млн ₽${this.injuryDescription(p)?` · <span style="color:var(--t-fg-fbbf24)">${this.escape(this.injuryDescription(p))}</span>`:''}</div></div><div class="ovr ${this.permanentOVR(p)>=87?'high':this.permanentOVR(p)<74?'low':''}" title="Постоянный рейтинг; сейчас ${Math.round(this.effectiveOVR(p))}">${this.permanentOVR(p)}</div></div>`).join('')}</div>`;}).join('');this.renderPregame();}
  
  setStarterGoalie(playerId){if(!this.state)return;this.state.starterGoalieId=playerId;if(this.state.slotAssignments)this.state.slotAssignments.G=playerId;this.persistQuietly();this.renderRoster();}
  renderPregame(){const el=document.getElementById('pregame-editor');if(!el)return;const m=this.state&&this.state.matches.find(x=>x.id===(this.pendingMatchId||this.currentMatchId));if(!m||m.played){el.innerHTML='';return;}const opp=this.teamById(m.homeId===this.state.teamId?m.awayId:m.homeId);el.innerHTML=`<div class="pregame-banner"><div class="eyebrow">Предматчевая подготовка</div><h3 style="margin:.35rem 0">${this.escape(this.teamById(this.state.teamId).name)} — ${this.escape(opp.name)}</h3><p class="small muted">${this.formatDate(m.dateOffset)} · ${m.homeId===this.state.teamId?'Играем дома':'Выездной матч'}. Состав можно изменить перед стартом.</p></div>`;}
  renderMatchCenter(){if(!this.state)return;let m=this.liveMatch&&this.liveMatch.matchId===this.currentMatchId?this.liveMatch.simulatedMatch:(this.currentMatchId?this.state.matches.find(x=>x.id===this.currentMatchId):null);if(!m||(!m.played&&this.liveMatch?.matchId!==m.id))m=this.state.matches.filter(x=>x.played&&(x.homeId===this.state.teamId||x.awayId===this.state.teamId)).sort((a,b)=>b.dateOffset-a.dateOffset)[0];const score=document.getElementById('match-scoreboard'),log=document.getElementById('match-log'),sub=document.getElementById('match-center-subtitle');if(!m){score.innerHTML='<div class="empty">Первый матч ещё не сыгран. Нажми «Играть следующий матч».</div>';log.innerHTML='<div class="empty">После матча здесь появятся голы, передачи и игровые события.</div>';sub.textContent='Ожидается первый матч';this.drawRink();return;}this.currentMatchId=m.id;const home=this.teamById(m.homeId),away=this.teamById(m.awayId),live=this.liveMatch?.matchId===m.id;const allEvents=m.events||[],events=live?allEvents.filter(e=>Number.isFinite(e.visibleAtMinute)?e.visibleAtMinute<=this.liveMatch.visibleMinute+0.001:this.eventMinute(e)<=this.liveMatch.visibleMinute+0.001):allEvents;const goals=events.filter(e=>e.kind==='goal');let homeNow=goals.filter(e=>e.teamId===m.homeId).length,awayNow=goals.filter(e=>e.teamId===m.awayId).length;if(!live||events.some(e=>e.kind==='final')){homeNow=m.homeScore;awayNow=m.awayScore;}const ps=this.periodScores(m,events);const showOT=!!(m.ot||m.so||events.some(e=>e.period==='ОТ'));const showSO=!!(m.so||events.some(e=>e.period==='Б'||e.kind==='shootout'||e.kind==='shootoutAttempt'));const periodColumns=[0,1,2,...(showOT?[3]:[]),...(showSO?[4]:[])];const periodCell=(arr)=>periodColumns.map(i=>{const n=arr[i]||0;const decisive=(i===3&&m.ot&&!m.so)||(i===4&&m.so);return `<td>${n?(decisive?`<b>${n}*</b>`:n):0}</td>`;}).join('');const currentEvent=events[events.length-1];const clock=live?this.liveClock(this.liveMatch.visibleMinute,m,this.mcLiveSeconds?this.mcLiveSeconds():0):'';const arena=this.stadiumFor(home.id);const attendance=(m.attendance||0).toLocaleString('ru-RU');sub.textContent=`${this.formatDate(m.dateOffset)} · ${m.playoff?this.playoffStageName(m.playoffStage)+' · игра '+m.gameNo+' серии':m.round+'-й игровой раунд'} · ${live?'LIVE — '+clock:'матч завершён'}`;score.innerHTML=`<div class="arena-live arena-live-top">🏟️ <span class="arena-name">${this.escape(m.arenaName||arena.name)}</span><span>👥 ${attendance} / ${(m.arenaCapacity||arena.capacity).toLocaleString('ru-RU')}</span><span>${this.escape(this.attendanceExplanation(m))}</span></div><div class="match-hero"><div><div class="club-badge">${this.escape(this.shortName(home.name))}</div><div class="club-name">${this.escape(home.name)}</div></div><div><div class="score">${homeNow} : ${awayNow}</div><div class="pill-row" style="margin-top:.4rem"><span class="badge ${live?'gold':'green'}">${live?'🔴 LIVE':'Матч завершён'}</span>${live?`<span class="live-clock" id="mc-clock-main">${clock}</span>`:''}</div><table class="period-table"><thead><tr><th></th><th>1П</th><th>2П</th><th>3П</th>${showOT?'<th>ОТ</th>':''}${showSO?'<th>Б</th>':''}<th>И</th></tr></thead><tbody><tr><th>${this.escape(home.name)}</th>${periodCell(ps.home)}<td><b>${homeNow}</b></td></tr><tr><th>${this.escape(away.name)}</th>${periodCell(ps.away)}<td><b>${awayNow}</b></td></tr></tbody></table></div><div><div class="club-badge">${this.escape(this.shortName(away.name))}</div><div class="club-name">${this.escape(away.name)}</div></div></div><div id="live-ticker" class="live-ticker" aria-live="polite"></div>`;const followLiveLog=!!live&&(log.scrollHeight-log.scrollTop-log.clientHeight<64);log.innerHTML=events.map(e=>{if(e.kind==='final')return `<div class="event"><div class="event-time">ИТОГ</div><div><b>Матч завершён</b></div></div>`;if(e.kind==='shootoutAttempt'){const shooter=this.db.players.find(p=>p.id===e.scorerId),goalie=this.db.players.find(p=>p.id===e.goalieId);const outcome=e.outcome==='goal'?'✅ ЗАБИЛ':e.outcome==='save'?'🧤 ВРАТАРЬ СПАС':'↗ МИМО ВОРОТ';return `<div class="event ${e.outcome==='goal'?'goal':''}"><div class="event-time">БУЛЛ. ${e.round||''}</div><div><b>${this.escape(this.teamById(e.teamId)?.name||'Команда')}</b><div style="margin-top:.15rem">${shooter?`<span class="nm" data-pl="${this.escape(shooter.id)}">${this.escape(shooter.name)}</span>`:'Игрок'} — <b>${outcome}</b></div><div class="tiny muted">${goalie?`Вратарь: <span class="nm" data-pl="${this.escape(goalie.id)}">${this.escape(goalie.name)}</span>`:''}${e.scoreText?` · Счёт серии: ${this.escape(e.scoreText)}`:''}</div></div></div>`;}if(e.kind==='shootout')return `<div class="event goal"><div class="event-time">БУЛЛ.</div><div><b>${this.escape(this.teamById(e.teamId)?.name||'Команда')}</b> выигрывает серию буллитов${e.text?` ${this.escape(e.text)}`:''}.</div></div>`;if(e.kind==='intermission')return `<div class="event"><div class="event-time">ПЕРЕРЫВ</div><div>🛎️ <b>${this.escape(e.text)}</b></div></div>`;const team=this.teamById(e.teamId),scorer=this.db.players.find(p=>p.id===e.scorerId),a1=this.db.players.find(p=>p.id===e.assist1Id),a2=this.db.players.find(p=>p.id===e.assist2Id);if(e.kind==='goal'){const upto=events.slice(0,events.indexOf(e)+1).filter(x=>x.kind==='goal');const liveHomeScore=upto.filter(x=>x.teamId===m.homeId).length,liveAwayScore=upto.filter(x=>x.teamId===m.awayId).length;return `<div class="event goal"><div class="event-time">${this.matchTime(e)}</div><div><b>${this.escape(team?.name||'Команда')}</b><div style="margin-top:.18rem">🥅 ${this.goalNoHtml(scorer)}${scorer?`<span class="nm" data-pl="${this.escape(scorer.id)}">${this.escape(scorer.name)}</span>`:'Автор не указан'} <span class="goal-assists">(${this.goalAssistHtml(a1,a2)})</span> <b class="goal-score-inline">· ${liveHomeScore}:${liveAwayScore}</b></div>${this.goalFlags(e).length?`<div class="tiny muted">${this.goalFlags(e).join(' · ')}</div>`:''}</div></div>`;}const icons={injury:'🩹',delayedPenalty:'🟨',penalty:'🟨',penaltyStart:'🟨',penaltySegmentEnd:'✅',penaltyCancelled:'🏁',penaltyReduced:'🟨',penaltyReturn:'✅',penaltyEnd:'✅',misconductEnd:'✅',penaltyShot:'🎯',penaltyShotAttempt:'🎯',fight:'🥊',save:'🧤',hit:'💥',icing:'🚫',offside:'🚩',chance:'🔥',faceoff:'🔵',block:'🛡️',emptyNet:'🥅',goalieReturn:'🧤',goalieChange:'🔄',timeout:'⏱️'};return `<div class="event ${e.kind==='fight'?'fight-event':''}"><div class="event-time">${this.matchTime(e)}</div><div>${icons[e.kind]||'🏒'} <b>${this.escape(team?.name||'Команда')}</b>${e.powerPlay?'<span class="powerplay-tag">БОЛЬШИНСТВО</span>':''}${e.serious?'<span class="disciplinary-tag">5+20</span>':''}<div class="tiny muted" style="margin-top:.18rem">${this.linkNames(e.text||'Игровой эпизод',[e.actorId,e.targetId,e.playerId,e.opponentPlayerId,e.goalieId])}</div></div></div>`;}).join('')||(live?'<div class="empty">🏒 Судья вбрасывает шайбу. Команды начинают матч…</div>':'<div class="empty">В этом матче голов не было.</div>');this.drawRink({...m,homeScore:homeNow,awayScore:awayNow});if(live&&followLiveLog){log.scrollTop=log.scrollHeight;}}
  drawRink(match){if(this.rkBase&&this.rkBase(match))return;const canvas=document.getElementById('rink-canvas');if(!canvas)return;const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0d1827';ctx.fillRect(0,0,w,h);ctx.lineCap='round';ctx.lineJoin='round';const left=42,top=38,right=w-42,bottom=h-38,cx=w/2,cy=h/2,rinkW=right-left,rinkH=bottom-top;/* Stands around the ice: a small, consistent audience band */for(let r=0;r<3;r++){for(let i=0;i<64;i++){const x=left+8+i*(rinkW-16)/63;for(const y of [top-19+r*5,bottom+8+r*5]){ctx.fillStyle=['#3b7094','#d4a451','#a34c61','#4b9b86'][(i+r)%4];ctx.globalAlpha=.4+((i*7+r*3)%6)/10;ctx.beginPath();ctx.arc(x,y,1.8,0,Math.PI*2);ctx.fill();}}}ctx.globalAlpha=1;const radius=Math.min(56,rinkH*.22);ctx.fillStyle='#dcecf4';ctx.strokeStyle='#88a9c6';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(left,top,rinkW,rinkH,radius);ctx.fill();ctx.stroke();/* goal lines, blue lines and centre red line are aligned to the rink */const blueL=left+rinkW*.333,blueR=left+rinkW*.667,goalL=left+rinkW*.17,goalR=left+rinkW*.83;ctx.strokeStyle='#d94358';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,top+4);ctx.lineTo(cx,bottom-4);ctx.stroke();ctx.strokeStyle='#347bb0';ctx.lineWidth=4;for(const x of [blueL,blueR]){ctx.beginPath();ctx.moveTo(x,top+5);ctx.lineTo(x,bottom-5);ctx.stroke();}ctx.strokeStyle='#d94358';ctx.lineWidth=2.5;for(const x of [goalL,goalR]){ctx.beginPath();ctx.moveTo(x,top+8);ctx.lineTo(x,bottom-8);ctx.stroke();}/* centre circle and neutral-zone spot */ctx.strokeStyle='#3b79a9';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(cx,cy,Math.min(54,rinkH*.22),0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d94358';ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fill();/* four faceoff circles and hash marks */const circleR=Math.min(37,rinkH*.15);for(const x of [left+rinkW*.22,left+rinkW*.78])for(const y of [top+rinkH*.29,top+rinkH*.71]){ctx.strokeStyle='#347bb0';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,circleR,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d94358';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();for(const dy of [-1,1])for(const dx of [-1,1]){ctx.strokeStyle='#347bb0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+dx*(circleR+4),y+dy*8);ctx.lineTo(x+dx*(circleR+11),y+dy*8);ctx.stroke();}}/* goal creases and nets are placed on the correct goal line */for(const side of ['left','right']){const gx=side==='left'?goalL:goalR,dir=side==='left'?1:-1;ctx.fillStyle='#b9d8ef';ctx.strokeStyle='#347bb0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(gx,cy-25);ctx.arc(gx,cy,25,-Math.PI/2,Math.PI/2,side==='right');ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle='#c52d42';ctx.lineWidth=3;ctx.strokeRect(gx-4,cy-12,8,24);ctx.strokeStyle='#ffffff';ctx.lineWidth=1;for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(gx-3,cy+k*4);ctx.lineTo(gx+3,cy+k*4);ctx.stroke();}}/* live score pucks: one marker per visible goal */if(match){const total=Math.min(12,Math.max(0,(match.homeScore||0)+(match.awayScore||0)));for(let i=0;i<total;i++){const isHome=i<(match.homeScore||0),x=isHome?left+rinkW*.26:left+rinkW*.74,y=top+rinkH*.34+(i%5)*rinkH*.08;ctx.fillStyle=isHome?'#0e7490':'#c2415b';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=1.5;ctx.stroke();}}}

  stadiumFor(teamId){return KHL_STADIUMS[teamId]||{name:'Домашняя арена',capacity:7000,city:'—'};}
  conferenceRank(teamId){const team=this.teamById(teamId);if(!team)return 11;const list=this.standingsFor(team.conf.toLowerCase());const i=list.findIndex(t=>t.id===teamId);return i<0?list.length:i+1;}
  calculateAttendance(match){if(match.attendance&&match.arenaCapacity)return match.attendance;const arena=this.stadiumFor(match.homeId);const awayRank=this.conferenceRank(match.awayId);let fill=.59+Math.random()*.12;if(awayRank<=7)fill+=.17+Math.random()*.08;else fill-=.13+Math.random()*.08;fill=this.clamp(fill,.28,.98);match.attendance=Math.min(arena.capacity,Math.round(arena.capacity*fill/10)*10);match.attendancePercent=Math.round(match.attendance/arena.capacity*100);match.attendanceAwayRank=awayRank;match.arenaName=arena.name;match.arenaCapacity=arena.capacity;return match.attendance;}
  crowdArt(teamId,fill=.66){const rows=3,cols=34;let rowsHtml='';for(let r=0;r<rows;r++){const on=Math.round(cols*this.clamp(fill+(r-1)*.035,0,1));rowsHtml+=`<div class="stadium-fan-row">${Array.from({length:cols},(_,i)=>`<i class="stadium-fan ${((i*17+r*11+teamId.length*13)%cols)<on?'occupied':''}" style="--fan-color:${['#42a5d7','#e76c78','#e9bc55','#a6d97b'][(i+r+(teamId.length%4))%4]}"></i>`).join('')}</div>`;}return `<div class="stadium-art"><div class="stadium-roof"></div><div class="stadium-stands">${rowsHtml}</div><div class="stadium-ice"></div></div>`;}
  

  money(n){return (n/1e6).toFixed(1);}
  escape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
}


/* KHL Manager 5.0: playoffs, special teams, penalties and fights */
KHLManagerApp.prototype.emptyPlayerSeasonStats = function(){
  const out={};
  for(const p of this.db.players) out[p.id]={gp:0,g:0,a:0,pts:0,shots:0,plusMinus:0,goalieGP:0,goalieW:0,goalieShots:0,goalieSaves:0,goalieGA:0,shutouts:0};
  return out;
};
KHLManagerApp.prototype.ensureSpecialTeams = function(){
  if(!this.state)return;
  const fresh=this.defaultSpecialTeams(this.state.teamId),old=this.state.specialTeams||{};
  for(const unit of ['pp1','pp2','pk1','pk2']) this.state.specialTeams[unit]={...fresh[unit],...(old[unit]||{})};
};
KHLManagerApp.prototype.specialUnitPlayers = function(teamId,unitKey,live){
  const userTeam=teamId===this.state.teamId;
  const unit=userTeam?(this.state.specialTeams||{})[unitKey]:this.defaultSpecialTeams(teamId)[unitKey];
  const roster=this.teamPlayers(teamId),ids=unit?Object.values(unit).filter(Boolean):[];
  const sent=new Set(live?.sentOff?.[teamId]||[]);
  const serving=new Set([...(live?.penalties||[]).filter(x=>x.teamId===teamId&&(x.queued||x.expiresAt>(live?.visibleMinute||0))).map(x=>x.playerId),...(live?.waitingReturns||[]).filter(x=>x.teamId===teamId).map(x=>x.playerId)]);
  const active=live?.[teamId===live.homeId?'activeH':'activeA']||this.activeSkaters(teamId);
  const usable=(active?.skaters||[]).filter(p=>p&&!sent.has(p.id)&&!serving.has(p.id));
  const isPP=unitKey.startsWith('pp'),maxF=isPP?3:2,maxD=2;
  // 14.7.8: в бригаду попадают только игроки из состава на матч (запас не играет)
  const dressedIds=new Set((active?.skaters||[]).filter(Boolean).map(p=>p.id)),dressedOk=dressedIds.size>=10;
  let forwards=ids.map(id=>roster.find(p=>p.id===id)).filter(p=>p&&(!dressedOk||dressedIds.has(p.id))&&!sent.has(p.id)&&!serving.has(p.id)&&['LW','C','RW'].includes(p.pos)).slice(0,maxF);
  let defense=ids.map(id=>roster.find(p=>p.id===id)).filter(p=>p&&(!dressedOk||dressedIds.has(p.id))&&!sent.has(p.id)&&!serving.has(p.id)&&p.pos==='D').slice(0,maxD);
  const used=new Set([...forwards,...defense].map(p=>p.id));
  const fill=[...usable].filter(p=>!used.has(p.id)).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
  for(const p of fill){
    if(['LW','C','RW'].includes(p.pos)&&forwards.length<maxF){forwards.push(p);used.add(p.id);}
    else if(p.pos==='D'&&defense.length<maxD){defense.push(p);used.add(p.id);}
    if(forwards.length>=maxF&&defense.length>=maxD)break;
  }
  // If a roster is thin, retain every available skater rather than leaving the unit empty.
  if(forwards.length+defense.length<maxF+maxD){for(const p of fill){if(!used.has(p.id)){(p.pos==='D'?defense:forwards).push(p);used.add(p.id);if(forwards.length+defense.length>=maxF+maxD)break;}}}
  const skaters=[...forwards,...defense];
  return {forwards,defense,skaters,goalie:active?.goalie};
};
KHLManagerApp.prototype.emptyPlayoffState = function(){return {started:false,completed:false,stage:0,series:[],history:[],championId:null,playerStats:this.emptyPlayerSeasonStats(),startDateOffset:null};};
KHLManagerApp.prototype.regularMatches = function(){return (this.state?.matches||[]).filter(m=>!m.playoff);};
KHLManagerApp.prototype.regularSeasonComplete = function(){const games=this.regularMatches();return games.length>0&&games.every(m=>m.played);};
KHLManagerApp.prototype.playoffStageName = function(stage){return ({1:'1/8 финала',2:'1/4 финала',3:'Полуфинал Кубка Гагарина',4:'Финал Кубка Гагарина'})[stage]||`Раунд ${stage}`;};
KHLManagerApp.prototype.overallRegularRank = function(teamId){
  const teams=this.db.teams.map(t=>({...t,...(this.state.standings[t.id]||{})})).sort((a,b)=>(b.pts||0)-(a.pts||0)||(b.regw||0)-(a.regw||0)||((b.gf||0)-(b.ga||0))-((a.gf||0)-(a.ga||0))||(b.gf||0)-(a.gf||0)||a.name.localeCompare(b.name,'ru'));
  return teams.findIndex(t=>t.id===teamId)+1;
};
KHLManagerApp.prototype.ensurePlayoffsStarted = function(){
  if(!this.state)return false;
  if(!this.state.playoff)this.state.playoff=this.emptyPlayoffState();
  if(this.state.playoff.started||this.state.playoff.completed)return false;
  if(!this.regularSeasonComplete())return false;
  if(!this.state.teamObjective?.evaluated)this.evaluateTeamObjective();
  this.state.seasonFinished=false;
  const maxRegular=Math.max(...this.regularMatches().map(m=>m.dateOffset),this.state.dayIndex||0);
  this.state.playoff.startDateOffset=maxRegular+3;
  this.createPlayoffStage(1);
  this.setNotice('Регулярный чемпионат завершён! Определены 16 участников Кубка Гагарина. Начинается первый раунд.');
  this.persistQuietly();return true;
};
KHLManagerApp.prototype.simulatePlayoffGame = function(match){
  if(match.played||match.cancelled)return match;
  const home=this.teamById(match.homeId),away=this.teamById(match.awayId);this.calculateAttendance(match);
  const sh=this.getStrength(home.id),sa=this.getStrength(away.id);
  const expH=this.clamp(2.40+(sh.attack-80)*.055+(sh.defense-80)*.012-(sa.goalie-80)*.060+(sh.overall-sa.overall)*.012+.05,.85,4.0);
  const expA=this.clamp(2.20+(sa.attack-80)*.052+(sa.defense-80)*.014-(sh.goalie-80)*.065+(sa.overall-sh.overall)*.012+.01,.8,3.9);
  // Playoff scoring has a slightly higher league baseline and mild independent game-to-game variability.
  const __sm=this.shotModelGame(match,home,away,sh,sa,true);match.__shotsP={h:__sm.shotsPH,a:__sm.shotsPA};match.scn=__sm.scn||null;let gh=__sm.goalsH.length,ga=__sm.goalsA.length;const ah=this.activeSkaters(home.id),aa=this.activeSkaters(away.id);const events=[];
  const addGoal=(teamId,period='1П',minute=null)=>{const own=teamId===home.id?ah:aa;const shooter=this.pickScorer(own);const pool=own.skaters.filter(p=>p&&p.id!==shooter?.id);const a1=Math.random()<this.assistProb(1)?this.weightedPick(pool,'passing'):null;const a2=a1&&Math.random()<this.assistProb(2)?this.weightedPick(pool.filter(p=>p.id!==a1?.id),'passing'):null;const min=minute==null?Math.floor(Math.random()*60):minute;const per=period==='ОТ'?'ОТ':`${Math.min(3,Math.floor(min/20)+1)}П`,tm=period==='ОТ'?String(Math.max(1,Math.floor(__sm.otTime||1))).padStart(2,'0'):String(min%20).padStart(2,'0');events.push({kind:'goal',teamId,scorerId:shooter?.id||null,assist1Id:a1?.id||null,assist2Id:a2?.id||null,period:per,time:`${tm}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`});
    const stats= this.state.playoff.playerStats||(this.state.playoff.playerStats=this.emptyPlayerSeasonStats());
    if(shooter&&stats[shooter.id]){stats[shooter.id].g++;stats[shooter.id].pts=stats[shooter.id].g+stats[shooter.id].a;}
    for(const a of [a1,a2])if(a&&stats[a.id]){stats[a.id].a++;stats[a.id].pts=stats[a.id].g+stats[a.id].a;}
  };
  __sm.goalsH.forEach(t=>addGoal(home.id,'1П',Math.min(59,Math.floor(t))));__sm.goalsA.forEach(t=>addGoal(away.id,'1П',Math.min(59,Math.floor(t))));
  let ot=false;
  if(gh===ga){ot=true;const winner=__sm.otWinner;if(winner===home.id)gh++;else ga++;addGoal(winner,'ОТ',61);events.push({kind:'intermission',period:'ОТ',time:'00:00',teamId:home.id,text:'Основное время завершено вничью. Начинается овертайм до первой шайбы.'});}
  const goalsH=events.filter(e=>e.kind==='goal'&&e.teamId===home.id).length,goalsA=events.filter(e=>e.kind==='goal'&&e.teamId===away.id).length;
  match.homeScore=gh;match.awayScore=ga;match.ot=ot;match.so=false;match.homeShots=Math.max(goalsH,__sm.shotsH);match.awayShots=Math.max(goalsA,__sm.shotsA);
  events.push({kind:'intermission',time:'20:00',period:'1П',teamId:home.id,text:'Первый период завершён. Перерыв.'},{kind:'intermission',time:'20:00',period:'2П',teamId:home.id,text:'Второй период завершён. Команды готовятся к заключительной двадцатиминутке.'});
  const expulsion=this.generateCompletedFight(match,events);
  events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));events.push({kind:'final',time:ot?'61:00':'60:00',period:'Итог',teamId:gh>ga?home.id:away.id,text:ot?'Победа в овертайме':'Матч завершён'});
  match.events=events;match.played=true;match.playoff=true;match.ppGoalsHome=0;match.ppGoalsAway=0;
  for(const side of [{team:home.id,active:ah,against:match.awayShots,againstGoals:goalsA},{team:away.id,active:aa,against:match.homeShots,againstGoals:goalsH}]){
    const players=[...side.active.skaters,side.active.goalie].filter(Boolean);for(const p of players){const st=this.state.playoff.playerStats[p.id]||(this.state.playoff.playerStats[p.id]={gp:0,g:0,a:0,pts:0,shots:0,plusMinus:0,goalieGP:0,goalieW:0,goalieShots:0,goalieSaves:0,goalieGA:0,shutouts:0});st.gp++;if(p.pos==='G'){st.goalieGP++;st.goalieShots+=side.against;st.goalieSaves+=Math.max(0,side.against-side.againstGoals);st.goalieGA+=side.againstGoals;if(side.againstGoals===0)st.shutouts++;}}
  }
  const w=gh>ga?home.id:away.id;const goalie=(w===home.id?ah:aa).goalie;if(goalie&&this.state.playoff.playerStats[goalie.id])this.state.playoff.playerStats[goalie.id].goalieW++;
  this.recordPlayoffResult(match);return match;
};
KHLManagerApp.prototype.generateCompletedFight = function(match,events=null){
  const diff=(match.homeScore||0)-(match.awayScore||0);let initiator=null;
  const __SP=this.SPECIAL_MODEL_PARAMS,__FM=this.penaltyFightMul?this.penaltyFightMul(match):1;
  if(Math.abs(diff)>=3){if(Math.random()<Math.min(.9,__SP.quickFightBlowout*__FM))initiator=diff>0?match.awayId:match.homeId;}
  else if(Math.random()<__SP.quickFightBase*__FM)initiator=Math.random()<.5?match.homeId:match.awayId;
  if(!initiator)return null;
  const other=initiator===match.homeId?match.awayId:match.homeId;
  const rosterA=this.activeSkaters(initiator).skaters.filter(p=>p.pos!=='G'),rosterB=this.activeSkaters(other).skaters.filter(p=>p.pos!=='G');
  if(!rosterA.length||!rosterB.length)return null;
  const a=rosterA[Math.floor(Math.random()*rosterA.length)],b=rosterB[Math.floor(Math.random()*rosterB.length)],serious=Math.random()<this.SPECIAL_MODEL_PARAMS.fightSerious;
  let minute=Math.floor(Math.random()*60);
  if(Math.abs(diff)>=3){const sign=Math.sign(diff);let h=0,v=0,found=null;const goalEvents=(events||match.events||[]).filter(e=>e.kind==='goal').slice().sort((x,y)=>this.eventMinute(x)-this.eventMinute(y));for(const ge of goalEvents){if(ge.teamId===match.homeId)h++;else if(ge.teamId===match.awayId)v++;const d=h-v;if(Math.sign(d)===sign&&Math.abs(d)>=3){found=this.eventMinute(ge);break;}}minute=found==null?Math.floor(36+Math.random()*24):this.clamp(Math.floor(found)+1,0,59);}
  const period=`${Math.min(3,Math.floor(minute/20)+1)}П`,time=`${String(minute%20).padStart(2,'0')}:${String(Math.floor(Math.random()*60)).padStart(2,'0')}`;
  const ev={kind:'fight',teamId:initiator,playerId:a.id,opponentPlayerId:b.id,serious,gameMisconduct:serious,period,time,text:serious?`Драка между ${a.name} и ${b.name}! Серьёзная стычка: оба хоккеиста удалены до конца матча (5+20).`:`Драка между ${a.name} и ${b.name}. Судьи разнимают хоккеистов; оба получают большой штраф.`};
  match.fights=(match.fights||[]).concat([{playerId:a.id,opponentPlayerId:b.id,serious,teamId:initiator}]);match.expulsions=(match.expulsions||[]).concat(serious?[a.id,b.id]:[]);
  if(events){events.push(ev);return ev;}
  match.events=match.events||[];const finalIdx=match.events.findIndex(e=>e.kind==='final');if(finalIdx>=0)match.events.splice(finalIdx,0,ev);else match.events.push(ev);match.events.sort((x,y)=>this.eventMinute(x)-this.eventMinute(y));const final=match.events.find(e=>e.kind==='final');if(final){match.events=match.events.filter(e=>e!==final);match.events.push(final);}return ev;
};

const __khlCreateState50=KHLManagerApp.prototype.createState;
KHLManagerApp.prototype.createState=function(teamId){const s=__khlCreateState50.call(this,teamId);s.specialTeams=this.defaultSpecialTeams(teamId);s.playoff=this.emptyPlayoffState();return s;};
const __khlRepairSave50=KHLManagerApp.prototype.repairSave;
KHLManagerApp.prototype.repairSave=function(){__khlRepairSave50.call(this);if(!this.state.specialTeams)this.state.specialTeams=this.defaultSpecialTeams(this.state.teamId);this.ensureSpecialTeams();if(!this.state.playoff)this.state.playoff=this.emptyPlayoffState();else{this.state.playoff={...this.emptyPlayoffState(),...this.state.playoff};if(!this.state.playoff.playerStats)this.state.playoff.playerStats=this.emptyPlayerSeasonStats();if(!Array.isArray(this.state.playoff.history))this.state.playoff.history=[];if(!Array.isArray(this.state.playoff.series))this.state.playoff.series=[];}};
const __khlSimulateMatch50=KHLManagerApp.prototype.simulateMatch;
KHLManagerApp.prototype.simulateMatch=function(match){if(match?.playoff)return this.simulatePlayoffGame(match);const result=__khlSimulateMatch50.call(this,match);if(result&&!result.playoff)this.generateCompletedFight(result);return result;};
const __khlSwitchTab50=KHLManagerApp.prototype.switchTab;
KHLManagerApp.prototype.switchTab=function(name,button){__khlSwitchTab50.call(this,name,button);if(name==='playoffs')this.renderPlayoffs();if(name==='specialteams')this.renderSpecialTeams();};
const __khlRenderAll50=KHLManagerApp.prototype.renderAll;
KHLManagerApp.prototype.renderAll=function(){if(this.state){this.ensureSpecialTeams();this.ensurePlayoffsStarted();}__khlRenderAll50.call(this);if(this.state){this.renderPlayoffs();this.renderSpecialTeams();const head=document.getElementById('dash-headline');if(head&&this.state.playoff?.started&&!this.state.playoff.completed)head.textContent=`Кубок Гагарина · ${this.playoffStageName(this.state.playoff.stage)}`;if(head&&this.state.playoff?.completed)head.textContent=`🏆 Обладатель Кубка Гагарина: ${this.teamById(this.state.playoff.championId)?.name||'—'}`;}};
const __khlCompleteLive50=KHLManagerApp.prototype.completeLiveMatch;
KHLManagerApp.prototype.completeLiveMatch=function(live){
  const m=live?.simulatedMatch;
  if(!m?.playoff){__khlCompleteLive50.call(this,live);return;}
  const regularStandings=this.state.standings,regularStats=this.state.playerStats;
  if(!this.state.playoff.playerStats)this.state.playoff.playerStats=this.emptyPlayerSeasonStats();
  // 14.7.8: игроки, пришедшие с рынка после старта сезона, могли не попасть в статистику плей-офф — без записи матч падал
  // с ошибкой и таблица навсегда оставалась «подменённой» (нули у двух клубов серии).
  for(const p of this.db.players)if(!this.state.playoff.playerStats[p.id])this.state.playoff.playerStats[p.id]={gp:0,g:0,a:0,pts:0,shots:0,plusMinus:0,goalieGP:0,goalieW:0,goalieShots:0,goalieSaves:0,goalieGA:0,shutouts:0};
  this.state.standings=JSON.parse(JSON.stringify(regularStandings));
  for(const tid of [m.homeId,m.awayId])this.state.standings[tid]={gp:0,w:0,l:0,otl:0,sol:0,pp:0,pts:0,gf:0,ga:0,regw:0,otw:0,sow:0};
  this.state.playerStats=this.state.playoff.playerStats;
  this._poStandSwapped=true;
  try{__khlCompleteLive50.call(this,live);}finally{
    this._poStandSwapped=false;
    // всегда возвращаем обычную таблицу и статистику, даже если запись матча упала с ошибкой
    this.state.playoff.playerStats=this.state.playerStats;this.state.playerStats=regularStats;this.state.standings=regularStandings;
  }
  const target=this.state.matches.find(x=>x.id===m.id);if(target)this.recordPlayoffResult(target);
  this.persistQuietly();this.renderAll();
};
KHLManagerApp.prototype.renderNextMatch=function(){
  const user=this.state.teamId;const m=this.state.matches.filter(x=>!x.played&&!x.cancelled&&(x.homeId===user||x.awayId===user)).sort((a,b)=>a.dateOffset-b.dateOffset)[0];const box=document.getElementById('next-match-card');if(!m){box.innerHTML=this.state.playoff?.completed?`<div class="empty">🏆 Кубок Гагарина завершён. Чемпион: ${this.escape(this.teamById(this.state.playoff.championId)?.name||'—')}.</div>`:'<div class="empty">У команды пока нет следующего матча. Если серия завершена, дождись завершения остальных игр раунда.</div>';return;}const home=this.teamById(m.homeId),away=this.teamById(m.awayId),diff=m.dateOffset-this.state.dayIndex;box.innerHTML=`<div class="match-hero" style="padding:.35rem 0"><div><div class="club-badge">${this.escape(this.shortName(home.name))}</div><div class="club-name">${this.escape(home.name)}</div><div class="tiny muted">${m.homeId===user?'Дома':'Гости'}</div></div><div><div class="score" style="font-size:1.5rem">VS</div><div class="small muted" style="margin-top:.5rem">${this.formatDate(m.dateOffset)}</div><div class="badge" style="margin-top:.4rem">${m.playoff?`Кубок Гагарина · Игра ${m.gameNo}`:diff===0?'Сегодня':`через ${diff} дн.`}</div></div><div><div class="club-badge">${this.escape(this.shortName(away.name))}</div><div class="club-name">${this.escape(away.name)}</div><div class="tiny muted">${m.awayId===user?'Дома':'Гости'}</div></div></div>`;
};
KHLManagerApp.prototype.renderSchedule=function(){
  if(!this.state)return;
  const all=this.state.matches.filter(m=>!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId)&&(typeof this.poGameVisible!=='function'||this.poGameVisible(m))).sort((a,b)=>a.dateOffset-b.dateOffset);
  const next=all.findIndex(m=>!m.played);
  document.getElementById('schedule-progress').textContent=`Сыграно ${all.filter(m=>m.played).length} из ${all.length} матчей · показан весь календарь`;
  const getRound=m=>Number(m.round)||Number((String(m.id||'').match(/^m(\d+)_/)||[])[1]||0);
  const outcomeLabel=(m,won)=>{
    if(!m.played)return 'Запланирован';
    if(m.so)return won?'Победа по буллитам':'Поражение по буллитам';
    if(m.ot)return won?'Победа ОТ':'Поражение ОТ';
    return won?'Победа':'Поражение';
  };
  document.getElementById('schedule-list').innerHTML=`<div class="table-wrap schedule-history-scroll"><table class="data-table" style="min-width:590px"><thead><tr><th>Дата</th><th>Этап</th><th>Статус</th><th>Матч</th><th class="numeric">Счёт</th></tr></thead><tbody>${all.map((m,i)=>{
    const mine=m.homeId===this.state.teamId,opp=this.teamById(mine?m.awayId:m.homeId);
    const result=m.played?(mine?Number(m.homeScore)>Number(m.awayScore):Number(m.awayScore)>Number(m.homeScore)):null;
    const outcome=outcomeLabel(m,!!result);
    const stage=m.playoff?this.playoffStageName(m.playoffStage):`Регулярка ${getRound(m)} тур`;
    return `<tr class="${i===next?'next-scheduled-match':''}"><td>${this.formatDate(m.dateOffset)}</td><td>${this.escape(stage)}</td><td><span class="badge ${m.played?(result?'green':'red'):''}">${outcome}</span></td><td>${mine?'Дома':'В гостях'} · <b>${this.escape(opp?.name||'Неизвестный соперник')}</b></td><td class="numeric"><b>${m.played?`${m.homeScore}:${m.awayScore}`:'—'}</b></td></tr>`;
  }).join('')}</tbody></table></div>`;
};
KHLManagerApp.prototype.advanceDay=function(){
  if(!this.state)return;this.ensurePlayoffsStarted();
  if(this.state.playoff?.completed){this.setNotice(`🏆 Кубок Гагарина завершён. Чемпион — ${this.teamById(this.state.playoff.championId)?.name||'—'}.`);this.renderAll();return;}
  const nextDate=(this.state.dayIndex||0)+1;this.state.dayIndex=nextDate;this.advancePlayerDays(1);
  const userMatch=this.state.matches.find(m=>!m.played&&!m.cancelled&&m.dateOffset===nextDate&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId));
  const count=this.simulateMatchesAt(nextDate,!!userMatch);
  if(userMatch){this.setNotice(`Сегодня матч против ${this.teamById(userMatch.homeId===this.state.teamId?userMatch.awayId:userMatch.homeId).name}. Проверь состав и спецбригады!`);this.renderAll();this.openPregame(userMatch.id);return;}
  this.ensurePlayoffsStarted();this.setNotice(count?`Сыграно матчей лиги/плей-офф: ${count}. Дата: ${this.formatDate(this.state.dayIndex)}.`:`${this.formatDate(this.state.dayIndex)} — игровой день без матчей.`);this.renderAll();
};

/* ================= KHL MANAGER DEVELOPMENT EDITION 6.0 =================
   Season quality update: injuries, fatigue balance, shootout logs, late goalie pull,
   opponent pre-game report, playoff attendance, season summary and season archive.
*/
KHLManagerApp.prototype.isPlayerUnavailable = function(player){
  if(!player || !this.state) return false;
  const injury=this.playerDev(player)?.injury;
  if(!injury) return false;
  if(injury.severity==='light') return false; // leaves the current match, available next match
  return Number(injury.gamesRemaining||0)>0 || Number(injury.daysRemaining||0)>0;
};
KHLManagerApp.prototype.injuryDescription = function(player){
  const injury=this.playerDev(player)?.injury;
  if(!injury) return '';
  if(injury.severity==='light') return 'Лёгкая травма · готов к следующему матчу';
  if(injury.severity==='medium') return `Травма средней степени · пропустит ещё ${Math.max(0,injury.gamesRemaining||0)} матч(а)`;
  if(injury.severity==='severe') return `Тяжёлая травма · восстановление около ${Math.max(0,injury.daysRemaining||0)} дн.`;
  return 'Травма';
};
KHLManagerApp.prototype.injuryBlocksSelection = function(player){return this.isPlayerUnavailable(player);};

const __v6AdvanceDays = KHLManagerApp.prototype.advancePlayerDays;
KHLManagerApp.prototype.advancePlayerDays = function(days=1){
  if(!Number.isFinite(Number(days)) || Number(days)<=0) return __v6AdvanceDays.call(this,days);
  const n=Math.min(400,Math.max(1,Math.round(days||1)));
  const before={};
  if(this.state) for(const p of this.db.players){const d=this.playerDev(p);before[p.id]={fatigue:Number(d.fatigue||0),training:d.training};}
  __v6AdvanceDays.call(this,n);
  if(!this.state)return;
  for(const p of this.db.players){
    const d=this.playerDev(p),snap=before[p.id];
    if(snap){
      const rate=snap.training==='recovery'?3.4:snap.training==='conditioning'?2.25:snap.training==='balanced'?1.45:1.25;
      d.fatigue=this.clamp(snap.fatigue-rate*n,0,100);
    }
    if(d.injury){
      if(d.injury.severity==='light'&&n>0){delete d.injury;}
      else if(Number(d.injury.daysRemaining||0)>0){d.injury.daysRemaining=Math.max(0,d.injury.daysRemaining-n);if(d.injury.daysRemaining===0&&d.injury.severity==='severe')delete d.injury;}
    }
  }
};

const __v6ActiveSkaters = KHLManagerApp.prototype.activeSkaters;
KHLManagerApp.prototype.activeSkaters = function(teamId){
  const base=__v6ActiveSkaters.call(this,teamId);
  const roster=this.teamPlayers(teamId).filter(p=>!this.isPlayerUnavailable(p));
  const available=p=>p&&!this.isPlayerUnavailable(p);
  let forwards=(base.forwards||[]).filter(available),defense=(base.defense||[]).filter(available);
  const used=new Set([...forwards,...defense].map(p=>p.id));
  const candidates=roster.filter(p=>!used.has(p.id)).sort((a,b)=>this.playerLine(a)-this.playerLine(b)||this.effectiveOVR(b)-this.effectiveOVR(a));
  for(const p of candidates){
    if(['LW','C','RW'].includes(p.pos)&&forwards.length<12){forwards.push(p);used.add(p.id);}
    else if(p.pos==='D'&&defense.length<6){defense.push(p);used.add(p.id);}
    if(forwards.length>=12&&defense.length>=6)break;
  }
  let goalie=available(base.goalie)?base.goalie:roster.filter(p=>p.pos==='G').sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a))[0]||null;
  return {...base,forwards,defense,goalie,skaters:[...forwards,...defense]};
};

const __v6SpecialUnit = KHLManagerApp.prototype.specialUnitPlayers;
KHLManagerApp.prototype.specialUnitPlayers = function(teamId,unitKey,live){
  const base=__v6SpecialUnit.call(this,teamId,unitKey,live);
  const forwards=(base.forwards||[]).filter(p=>!this.isPlayerUnavailable(p));
  const defense=(base.defense||[]).filter(p=>!this.isPlayerUnavailable(p));
  const active=live?.[teamId===live.homeId?'activeH':'activeA']||this.activeSkaters(teamId);
  const unavailable=new Set([...(live?.sentOff?.[teamId]||[]),...(live?.injured?.[teamId]||[]),...(live?.penalties||[]).filter(x=>x.teamId===teamId&&x.expiresAt>(live?.visibleMinute||0)).map(x=>x.playerId)]);
  const used=new Set([...forwards,...defense].map(p=>p.id));
  const ff=forwards.slice(),dd=defense.slice();
  const isPP=unitKey.startsWith('pp'),maxF=isPP?3:2;
  const pool=(active.skaters||[]).filter(p=>p&&!unavailable.has(p.id)&&!this.isPlayerUnavailable(p)&&!used.has(p.id)).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
  for(const p of pool){if(['LW','C','RW'].includes(p.pos)&&ff.length<maxF){ff.push(p);used.add(p.id);}else if(p.pos==='D'&&dd.length<2){dd.push(p);used.add(p.id);}if(ff.length>=maxF&&dd.length>=2)break;}
  const skaters=[...ff,...dd];return {...base,forwards:ff,defense:dd,skaters};
};

const __v6Attendance = KHLManagerApp.prototype.calculateAttendance;



const __v6CreateState = KHLManagerApp.prototype.createState;
KHLManagerApp.prototype.createState = function(teamId){
  const s=__v6CreateState.call(this,teamId);
  let pastSeasons=(this._carryHistory||[]).length;s.initialTeamId=teamId;s.seasonNumber=pastSeasons+1;s.seasonHistoryArchived=false;
  return s;
};
const __v6RepairSave = KHLManagerApp.prototype.repairSave;
KHLManagerApp.prototype.repairSave = function(){
  __v6RepairSave.call(this);
  if(this.state){
    if(!this.state.initialTeamId)this.state.initialTeamId=this.state.teamId;
    if(!Number.isFinite(this.state.seasonNumber))this.state.seasonNumber=1;
    if(!this.state.playoff)this.state.playoff=this.emptyPlayoffState();
    for(const p of this.db.players){const d=this.playerDev(p);if(d.injury&&!['light','medium','severe'].includes(d.injury.severity))delete d.injury;}
  }
};

// Display a full opponent form report and make injuries impossible to ignore before puck drop.
const __v6RenderPregame = KHLManagerApp.prototype.renderPregame;
KHLManagerApp.prototype.renderPregame = function(){
  __v6RenderPregame.call(this);
  if(!this.state)return;
  const m=this.state.matches.find(x=>x.id===(this.pendingMatchId||this.currentMatchId));
  if(m&&this.liveMatch?.matchId===m.id&&!this.liveMatch.finished){const root=document.getElementById('pregame-editor');if(root)root.innerHTML='';return;}
  const banner=document.querySelector('#pregame-editor .pregame-banner');
  if(!m||!banner||m.played)return;
  const opponentId=m.homeId===this.state.teamId?m.awayId:m.homeId;
  const opponent=this.teamById(opponentId);
  const last=this.state.matches.filter(x=>x.played&&!x.cancelled&&(x.homeId===opponentId||x.awayId===opponentId)).sort((a,b)=>b.dateOffset-a.dateOffset)[0];
  const recent=this.state.matches.filter(x=>x.played&&!x.cancelled&&(x.homeId===opponentId||x.awayId===opponentId)).sort((a,b)=>b.dateOffset-a.dateOffset).slice(0,5);
  const form=recent.map(x=>{const isHome=x.homeId===opponentId;const own=isHome?x.homeScore:x.awayScore,opp=isHome?x.awayScore:x.homeScore;return `${own>opp?'В': 'П'} ${own}:${opp}${x.so?' (Б)':x.ot?' (ОТ)':''}`;}).join(' · ');
  let report='';
  if(last){const isHome=last.homeId===opponentId;const oppTeam=this.teamById(isHome?last.awayId:last.homeId);const own=isHome?last.homeScore:last.awayScore,other=isHome?last.awayScore:last.homeScore;const goals=(last.events||[]).filter(e=>e.kind==='goal');const finalScorer=goals.slice(-1)[0]?.scorerId?this.db.players.find(p=>p.id===goals.slice(-1)[0].scorerId)?.name:null;
    report=`<div class="notice" style="margin-top:.7rem"><b>Последний матч соперника — ${this.escape(opponent.name)}</b><br>${this.formatDate(last.dateOffset)} · ${this.escape(oppTeam?.name||'Соперник')} ${other}:${own} ${this.escape(opponent.name)}${last.so?' (буллиты)':last.ot?' (овертайм)':''}${finalScorer?`<br><span class="tiny">Последний автор гола: ${this.escape(finalScorer)}</span>`:''}<br><span class="tiny">Последние ${recent.length} матчей: ${this.escape(form||'нет данных')}</span></div>`;
  }else report=`<div class="notice" style="margin-top:.7rem">У соперника пока нет завершённых матчей в сохранённом журнале.</div>`;
  const slots=this.state.slotAssignments||{};
  const injured=[];
  for(const [slot,id] of Object.entries(slots)){if(!id)continue;const p=this.db.players.find(x=>x.id===id);if(p&&p.teamId===this.state.teamId&&this.isPlayerUnavailable(p))injured.push(`${p.name} (${slot})`);}
  if(injured.length)report+=`<div class="notice warn" style="margin-top:.7rem"><b>⛑️ Нельзя начинать матч!</b><br>В стартовом составе есть травмированные игроки: ${this.escape(injured.join(', '))}. Замени каждого на доступного хоккеиста той же группы позиции, затем запускай матч.</div>`;
  banner.insertAdjacentHTML('beforeend',report);
  const pregameRoot=document.getElementById('pregame-editor');
  if(pregameRoot)pregameRoot.insertAdjacentHTML('beforeend',`<div class="toolbar pregame-start-actions" style="margin:.7rem 0 1rem"><button class="btn btn-primary" style="width:100%" onclick="app.saveLineupAndStart()">🏒 Начать матч</button></div>`);
};

KHLManagerApp.prototype.saveLineupAndStart = function(){
  if(!this.state)return;
  if(this.liveMatch&&!this.liveMatch.finished){this.switchTab('match');return;}
  const m=this.state.matches.find(x=>x.id===(this.pendingMatchId||this.currentMatchId));
  if(!m||m.played){this.switchTab('match');return;}
  this.syncLineAssignmentsFromSlots();
  const bad=[];
  for(const [slot,id] of Object.entries(this.state.slotAssignments||{})){
    if(!id)continue;const p=this.db.players.find(x=>x.id===id);
    if(p&&p.teamId===this.state.teamId&&this.isPlayerUnavailable(p))bad.push({p,slot});
  }
  if(bad.length){this.pendingMatchId=m.id;this.currentMatchId=m.id;this.switchTab('roster');this.renderRoster();this.setNotice('Матч не начат: в заявке есть травмированные игроки. Замени их и повтори запуск.');alert('Нельзя начать матч с травмированными игроками в стартовой заявке:\n'+bad.map(x=>`${x.p.name} (${x.slot}) — ${this.injuryDescription(x.p)}`).join('\n')+'\n\nЗамени каждого доступным игроком той же группы позиции.');return;}
  this.calculateAttendance(m);this.persistQuietly();
  this.state.matches.filter(x=>!x.played&&!x.cancelled&&x.dateOffset===m.dateOffset&&x.id!==m.id).forEach(x=>this.simulateMatch(x));
  this.currentMatchId=m.id;this.state.lastMatchId=m.id;this.pendingMatchId=null;
  const home=this.teamById(m.homeId),away=this.teamById(m.awayId),sh=this.getStrength(home.id),sa=this.getStrength(away.id);
  const expectedHome=this.clamp((m.playoff?2.24:2.68)+(sh.attack-80)*.055+(sh.defense-80)*.012-(sa.goalie-80)*.055+(sh.overall-sa.overall)*.012+(m.playoff ? .05 : .13),.85,m.playoff?4.0:4.4)*(m.playoff?this.playoffGoalVariationFactor723():1);
  const expectedAway=this.clamp((m.playoff?2.04:2.53)+(sa.attack-80)*.055+(sa.defense-80)*.012-(sh.goalie-80)*.055+(sa.overall-sh.overall)*.012+(m.playoff ? .01 : 0),.8,m.playoff?3.9:4.2)*(m.playoff?this.playoffGoalVariationFactor723():1);
  const simulatedMatch={...m,events:[],homeScore:0,awayScore:0,homeShots:0,awayShots:0,played:false,ot:false,so:false,injuries:[],fights:[],expulsions:[]};
  const live={matchId:m.id,simulatedMatch,visibleMinute:0,totalMinutes:60,homeId:home.id,awayId:away.id,activeH:this.activeSkaters(home.id),activeA:this.activeSkaters(away.id),expectedHome,expectedAway,shotStats:{},finished:false,startedAt:Date.now(),penalties:[],sentOff:{[home.id]:[],[away.id]:[]},injured:{[home.id]:[],[away.id]:[]},injuryOccurred:{[home.id]:false,[away.id]:false},fightOccurred:false,goaliePullProcessed:false,forcedLateTie:false,inShootout:false,shootoutGoals:{home:0,away:0},shootoutAttempts:{home:0,away:0},shootoutNextTeamId:home.id,shootoutAttemptCount:0};
  this.liveMatch=live;this.renderAll();this.switchTab('match');this.startLiveTicker();
};

// Event time sorting distinguishes live shootout tries and ensures the final horn is always last.
const __v6EventMinute = KHLManagerApp.prototype.eventMinute;
KHLManagerApp.prototype.eventMinute = function(e){
  if(e?.kind==='final')return Number.isFinite(e.finalMinute)?e.finalMinute:1000;
  if(e?.kind==='shootoutAttempt')return Number.isFinite(e.virtualMinute)?e.virtualMinute:65+(Number(e.round)||1);
  if(e?.kind==='shootout')return Number.isFinite(e.virtualMinute)?e.virtualMinute:900;
  return __v6EventMinute.call(this,e);
};
const __v6MatchTime = KHLManagerApp.prototype.matchTime;

KHLManagerApp.prototype.liveClock = function(minute,match,sec){
  const ss=String(Math.max(0,Math.min(59,sec|0))).padStart(2,'0');
  if(match?.so&&minute>=65)return 'БУЛЛИТЫ';
  if(minute<=20)return `1П ${String(minute).padStart(2,'0')}:${ss}`;
  if(minute<=40)return `2П ${String(minute-20).padStart(2,'0')}:${ss}`;
  if(minute<=60)return `3П ${String(minute-40).padStart(2,'0')}:${ss}`;
  return `ОТ ${String(minute-60).padStart(2,'0')}:${ss}`;
};

KHLManagerApp.prototype.shootoutWinner = function(homeId,awayId,activeH,activeA,events){
  const score={[homeId]:0,[awayId]:0},attempts={[homeId]:0,[awayId]:0},used={[homeId]:[],[awayId]:[]};
  let next=homeId,total=0,winnerId=null;
  while(!winnerId){
    total++;
    const teamId=next,otherId=teamId===homeId?awayId:homeId;next=otherId;
    const active=teamId===homeId?activeH:activeA,opp=teamId===homeId?activeA:activeH;
    const pool=(active.skaters||[]).filter(p=>p&&p.pos!=='G'&&!this.isPlayerUnavailable(p));
    let candidates=pool.filter(p=>!used[teamId].includes(p.id));
    if(!candidates.length&&pool.length){used[teamId]=[];candidates=pool.slice();}
    const shooter=this.weightedPick(candidates,'shooting')||candidates[0]||null;
    const goalie=opp.goalie||null;attempts[teamId]++;
    if(shooter&&!used[teamId].includes(shooter.id))used[teamId].push(shooter.id);
    const outcome=this.shootoutOutcome(shooter,goalie);
    if(outcome==='goal')score[teamId]++;
    const round=Math.max(attempts[homeId],attempts[awayId]);
    const e={kind:'shootoutAttempt',teamId,scorerId:shooter?.id||null,goalieId:goalie?.id||null,outcome,round,attemptNumber:attempts[teamId],period:'Б',time:'00:00',virtualMinute:65+total*.01,scoreText:`${score[homeId]}:${score[awayId]}`,text:outcome==='goal'?'Буллит реализован':outcome==='save'?'Вратарь отразил буллит':'Бросок мимо ворот'};
    events.push(e);
    // The first three attempts must be completed by both sides. Then any unequal score after a paired round wins.
    if(this.shootoutDecided(attempts[homeId],attempts[awayId],score[homeId],score[awayId]))winnerId=score[homeId]>score[awayId]?homeId:awayId;
  }
  return {winnerId,score,attempts,total};
};

// Injury model: light = leaves this match only, medium = 2–4 team matches, severe = 30–60 calendar days.
KHLManagerApp.prototype.assignInjury = function(player,match,teamId,period,time){
  if(!player||!this.state)return null;
  const d=this.playerDev(player);if(d.injury&&this.isPlayerUnavailable(player))return null;
  const r=Math.random();let severity,gamesRemaining=0,daysRemaining=0;
  if(r<.54)severity='light';else if(r<.88){severity='medium';gamesRemaining=2+Math.floor(Math.random()*3);}else{severity='severe';daysRemaining=30+Math.floor(Math.random()*31);}
  d.injury={severity,gamesRemaining,daysRemaining,createdMatchId:match.id,createdDay:this.state.dayIndex||0};
  const msg=severity==='light'?'Лёгкая травма: хоккеист покинул игру и будет доступен к следующему матчу.':severity==='medium'?`Травма средней степени: игрок пропустит ${gamesRemaining} следующих матч(а).`:`Сложная травма: ориентировочный срок восстановления ${daysRemaining} дней (1–2 месяца).`;
  const event={kind:'injury',teamId,playerId:player.id,severity,period,time,text:`${player.name}: ${msg}`};
  match.injuries=(match.injuries||[]).concat([{playerId:player.id,teamId,severity,gamesRemaining,daysRemaining,createdMatchId:match.id}]);
  match.events=match.events||[];match.events.push(event);
  return {event,severity,gamesRemaining,daysRemaining};
};

KHLManagerApp.prototype.applyGoalToCompletedMatch = function(match,teamId,period,time,text=''){
  const own=this.activeSkaters(teamId),otherId=teamId===match.homeId?match.awayId:match.homeId,opp=this.activeSkaters(otherId);
  const candidates=(own.forwards||[]).filter(p=>!this.isPlayerUnavailable(p));
  const shooter=this.weightedPick(candidates,'shooting')||this.weightedPick(own.skaters||[],'shooting');
  const pool=(own.skaters||[]).filter(p=>p&&p.id!==shooter?.id&&!this.isPlayerUnavailable(p));
  const a1=Math.random()<.65?this.weightedPick(pool,'passing'):null;
  const a2=Math.random()<.22?this.weightedPick(pool.filter(p=>p.id!==a1?.id),'passing'):null;
  const event={kind:'goal',teamId,scorerId:shooter?.id||null,assist1Id:a1?.id||null,assist2Id:a2?.id||null,period,time,text};
  match.events.push(event);
  if(teamId===match.homeId)match.homeScore++;else match.awayScore++;
  if(teamId===match.homeId)match.homeShots++;else match.awayShots++;
  const stats=match.playoff?(this.state.playoff.playerStats||(this.state.playoff.playerStats=this.emptyPlayerSeasonStats())):this.state.playerStats;
  const add=(p,key)=>{if(!p||!stats[p.id])return;stats[p.id][key]=(stats[p.id][key]||0)+1;stats[p.id].pts=(stats[p.id].g||0)+(stats[p.id].a||0);};
  add(shooter,'g');add(a1,'a');add(a2,'a');
  if(shooter&&stats[shooter.id]){stats[shooter.id].shots=(stats[shooter.id].shots||0)+1;stats[shooter.id].plusMinus=(stats[shooter.id].plusMinus||0)+1;}
  for(const a of [a1,a2])if(a&&stats[a.id])stats[a.id].plusMinus=(stats[a.id].plusMinus||0)+1;
  for(const p of opp.skaters||[])if(stats[p.id])stats[p.id].plusMinus=(stats[p.id].plusMinus||0)-1;
  const oppGoalie=opp.goalie;if(oppGoalie&&stats[oppGoalie.id]){stats[oppGoalie.id].goalieShots=(stats[oppGoalie.id].goalieShots||0)+1;stats[oppGoalie.id].goalieGA=(stats[oppGoalie.id].goalieGA||0)+1;}
  return event;
};
KHLManagerApp.prototype.removeRegularStandingsResult = function(match,oldH,oldA){
  if(match.playoff)return;
  const hs=this.state.standings[match.homeId],as=this.state.standings[match.awayId];
  if(!hs||!as)return;
  hs.gp=Math.max(0,hs.gp-1);as.gp=Math.max(0,as.gp-1);hs.gf-=oldH;hs.ga-=oldA;as.gf-=oldA;as.ga-=oldH;
  if(oldH>oldA){hs.w=Math.max(0,hs.w-1);hs.regw=Math.max(0,(hs.regw||0)-1);hs.pts=Math.max(0,hs.pts-2);as.l=Math.max(0,as.l-1);}
  else{as.w=Math.max(0,as.w-1);as.regw=Math.max(0,(as.regw||0)-1);as.pts=Math.max(0,as.pts-2);hs.l=Math.max(0,hs.l-1);}
};
KHLManagerApp.prototype.addRegularStandingsResult = function(match){
  if(match.playoff)return;
  const hs=this.state.standings[match.homeId],as=this.state.standings[match.awayId];
  hs.gp++;as.gp++;hs.gf+=match.homeScore;hs.ga+=match.awayScore;as.gf+=match.awayScore;as.ga+=match.homeScore;
  if(match.homeScore>match.awayScore){hs.w++;hs.pts+=2;if(match.ot){hs.otw++;as.otl++;as.pts++;}else{hs.regw++;as.l++;}}
  else{as.w++;as.pts+=2;if(match.ot){as.otw++;hs.otl++;hs.pts++;}else{as.regw++;hs.l++;}}
};

const __v6SimulateMatchPrevious = KHLManagerApp.prototype.simulateMatch;
KHLManagerApp.prototype.simulateMatch = function(match){
  if(match?.played||match?.cancelled)return match;
  const result=__v6SimulateMatchPrevious.call(this,match);
  if(result&&result.played){
    this.applyLateGoaliePullCompleted(result);
    this.maybeAddSimulatedInjury(result);
    this.decrementInjuriesAfterMatch(result);
    result.injuryProcessed=true;
    result.events=result.events||[];result.events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));
    const final=result.events.find(e=>e.kind==='final');if(final){result.events=result.events.filter(e=>e!==final);result.events.push(final);}
  }
  return result;
};

// Real-time game engine: late goalie pull, in-game injuries, timed penalties, golden-goal overtime and shot-by-shot shootout.
KHLManagerApp.prototype.advanceLiveMatch = function(live){
  if(!live||live.finished)return true;
  if(live.pendingShootoutPick&&!live.autoResolveShootouts)return false;
  live.penalties=live.penalties||[];live.sentOff=live.sentOff||{[live.homeId]:[],[live.awayId]:[]};live.injured=live.injured||{[live.homeId]:[],[live.awayId]:[]};live.injuryOccurred=live.injuryOccurred||{[live.homeId]:false,[live.awayId]:false};
  const m=live.simulatedMatch,minute=live.visibleMinute+1;
  live.visibleMinute=minute;
  live.waitingReturns=live.waitingReturns||[];
  const tickStartSeconds=(minute-1)*60,tickEndSeconds=minute*60;
  let penaltyEvalSeconds=tickStartSeconds;
  let lastStampSecond=-1;
  let processingPenaltyExpiries=false;
  let processPenaltyExpiriesUntil=null;
  const stamp=()=>{
    let second=Math.floor(Math.random()*60);
    if(second<=lastStampSecond)second=Math.min(59,lastStampSecond+1);
    lastStampSecond=second;
    const st=this.liveStamp(minute,second);
    if(typeof processPenaltyExpiriesUntil==='function'){
      const atSeconds=secondsForStamp(st);
      processPenaltyExpiriesUntil(atSeconds);
      penaltyEvalSeconds=atSeconds;
    }
    return st;
  };
  const secondsForStamp=st=>{
    const bases={'1П':0,'2П':1200,'3П':2400,'ОТ':3600,'Б':3900};
    const [mm='0',ss='0']=String(st?.time||'00:00').split(':');
    return (bases[st?.period]??0)+(Number(mm)||0)*60+(Number(ss)||0);
  };
  const stampForSeconds=seconds=>{
    const sec=Math.max(0,Math.floor(Number(seconds)||0));
    let period,local;
    if(sec<1200){period='1П';local=sec;}
    else if(sec<2400){period='2П';local=sec-1200;}
    else if(sec<3600){period='3П';local=sec-2400;}
    else {period='ОТ';local=sec-3600;}
    return {period,time:`${String(Math.floor(local/60)).padStart(2,'0')}:${String(local%60).padStart(2,'0')}`};
  };
  const penaltyExpirySeconds=p=>{
    const exact=p?.expiresAtSeconds;
    if(exact!==null&&exact!==undefined&&exact!==''&&Number.isFinite(Number(exact)))return Number(exact);
    const legacy=p?.expiresAt;
    if(legacy!==null&&legacy!==undefined&&legacy!==''&&Number.isFinite(Number(legacy)))return Number(legacy)*60;
    return Infinity;
  };
  const isActualWhistle=e=>!!e&&(!!e.stoppage||['faceoff','icing','offside','intermission'].includes(e.kind))&&!['goal','delayedPenalty','penalty','penaltyStart','penaltyEnd','penaltySegmentEnd','penaltyCancelled','penaltyReduced','penaltyShotAttempt','shootoutAttempt'].includes(e.kind);
  const push=(event)=>{
    // Resolve expiries chronologically up to this event. A penalty ending at 02:51 must still
    // count for an event at 02:25 in the same simulated minute.
    if(!processingPenaltyExpiries&&typeof processPenaltyExpiriesUntil==='function'&&event?.period&&event?.time){
      const atSeconds=secondsForStamp(event);
      processPenaltyExpiriesUntil(atSeconds);
      penaltyEvalSeconds=atSeconds;
    }
    // Resolve the pending call on this exact whistle, attaching the infraction to the same log entry.
    m.events.push(event);
    if(live.pendingPenaltyCall&&isActualWhistle(event)){
      const atStamp={period:event.period||stamp().period,time:event.time||stamp().time};
      resolvePendingPenaltyCall(live.pendingPenaltyCall,atStamp,null,event);
    }
    // Keep the visible event feed chronological, even when an exact penalty-expiry timestamp
    // falls earlier within the current simulated minute.
    m.events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));
    const finalIndex=m.events.findIndex(e=>e.kind==='final');
    if(finalIndex>=0){const finalEvent=m.events.splice(finalIndex,1)[0];m.events.push(finalEvent);}
    // A player whose penalty expired while his team already had five skaters on a power play
    // returns at the next stoppage, never in the middle of a shift.
    if((['faceoff','icing','offside','intermission'].includes(event?.kind)||event?.stoppage)&&live.waitingReturns.length){
      const waiting=live.waitingReturns.splice(0);
      waiting.forEach(r=>{const name=this.db.players.find(x=>String(x.id)===String(r.playerId))?.name||'Игрок';const goalieName=r.goalieId?this.db.players.find(x=>String(x.id)===String(r.goalieId))?.name||'вратарь':'';m.events.push({kind:'penaltyReturn',teamId:r.teamId,playerId:r.playerId,servedByPlayerId:r.goaliePenalty?r.playerId:null,goaliePenalty:!!r.goaliePenalty,period:event.period||stamp().period,time:event.time||stamp().time,text:r.goaliePenalty?`Вратарь ${goalieName} отбыл штраф; ${name} возвращается на лёд после ближайшей остановки.`:`${name} возвращается на лёд после ближайшей остановки.`});});
      m.events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));
    }
    return event;
  };
  const sent=tid=>live.sentOff[tid]||[];
  const active=tid=>tid===live.homeId?live.activeH:live.activeA;
  live.goaliePerformance=live.goaliePerformance||{};
  live.goalieChangeAttempted=live.goalieChangeAttempted||{};
  live.goalieChangeCheckedGap=live.goalieChangeCheckedGap||{};
  live.goalieStartingRating=live.goalieStartingRating||{};
  const goalieRating=goalie=>goalie?this.effectiveOVR(goalie)+(this.playerSkill(goalie,'goalkeeping')-75)*.16:72;
  const ensureGoaliePerformance=(teamId,goalie=active(teamId).goalie)=>{
    if(!goalie)return null;
    const key=String(goalie.id);
    if(!live.goaliePerformance[key])live.goaliePerformance[key]={teamId,goalieId:goalie.id,shots:0,goalsAgainst:0,enteredMinute:minute};
    if(!Number.isFinite(Number(live.goalieStartingRating[teamId])))live.goalieStartingRating[teamId]=goalieRating(goalie);
    return live.goaliePerformance[key];
  };
  const recordGoalieShot=teamId=>{const rec=ensureGoaliePerformance(teamId);if(rec)rec.shots=(Number(rec.shots)||0)+1;};
  const recordGoalieGoalAgainst=teamId=>{const rec=ensureGoaliePerformance(teamId);if(rec)rec.goalsAgainst=(Number(rec.goalsAgainst)||0)+1;};
  [live.homeId,live.awayId].forEach(tid=>ensureGoaliePerformance(tid));
  const maybeReplaceGoalie=(scoringTeamId,atStamp,visibleAtMinute)=>{
    const margin=Math.abs(m.homeScore-m.awayScore);if(margin<4||m.homeScore===m.awayScore)return;
    const trailingId=m.homeScore<m.awayScore?live.homeId:live.awayId;
    if(String(trailingId)===String(scoringTeamId)||live.goalieChangeAttempted[trailingId]||live.goaliePulledTeamId===trailingId)return;
    const checkedGap=Number(live.goalieChangeCheckedGap[trailingId]||0);
    // Try only when the losing margin reaches a new high (4, then possibly 5, etc.),
    // rather than rolling 85% on every goal while the score remains lopsided.
    if(margin<=checkedGap)return;
    live.goalieChangeCheckedGap[trailingId]=margin;
    const side=active(trailingId),current=side.goalie;
    if(!current){live.goalieChangeAttempted[trailingId]=true;return;}
    const backups=this.teamPlayers(trailingId).filter(p=>p.pos==='G'&&String(p.id)!==String(current.id)&&!this.isPlayerUnavailable(p)).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
    if(!backups.length){live.goalieChangeAttempted[trailingId]=true;return;}
    if(Math.random()>=.85)return;
    live.goalieChangeAttempted[trailingId]=true;
    const replacement=backups[0];ensureGoaliePerformance(trailingId,current);side.goalie=replacement;ensureGoaliePerformance(trailingId,replacement);
    const teamName=this.teamById(trailingId)?.name||'Команда',gap=margin;
    push({kind:'goalieChange',teamId:trailingId,previousGoalieId:current.id,newGoalieId:replacement.id,period:atStamp.period,time:atStamp.time,visibleAtMinute,text:`Тренерский штаб меняет вратаря: ${current.name} покидает ворота, вместо него выходит запасной голкипер ${replacement.name}. ${teamName} проигрывает с разницей в ${gap} ${gap===1?'шайбу':gap>=2&&gap<=4?'шайбы':'шайб'}.`});
    live.forceUiRender=true;
    return replacement;
  };
  // Defensive check at the opening of periods 2 and 3 in case a lopsided score
  // existed before normal goal-trigger handling (e.g. restored/continued live state).
  if((minute===21||minute===41)&&Math.abs(m.homeScore-m.awayScore)>=4&&m.homeScore!==m.awayScore){
    const leaderId=m.homeScore>m.awayScore?live.homeId:live.awayId;
    maybeReplaceGoalie(leaderId,{period:minute===21?'2П':'3П',time:'00:00'},minute);
  }
  const penaltyIsActive=(p,atSeconds=penaltyEvalSeconds)=>!!p&&!p.queued&&p.affectsManpower!==false&&penaltyExpirySeconds(p)>atSeconds;
  const activePenalties=(tid,atSeconds=penaltyEvalSeconds)=>live.penalties.filter(p=>String(p.teamId)===String(tid)&&penaltyIsActive(p,atSeconds));
  const penaltyBlocksPlayer=(tid,pid)=>live.penalties.some(q=>String(q.teamId)===String(tid)&&((String(q.playerId)===String(pid)&&(q.queued||penaltyIsActive(q)||(q.type==='misconduct'&&penaltyExpirySeconds(q)>penaltyEvalSeconds)||(Number(q.benchUntilMinute)>minute)))||(q.servedByPlayerId!=null&&String(q.servedByPlayerId)===String(pid)&&!q.queued&&(penaltyIsActive(q)||(q.type==='misconduct'&&penaltyExpirySeconds(q)>penaltyEvalSeconds)||(Number(q.benchUntilMinute)>minute)))))||live.waitingReturns.some(q=>String(q.teamId)===String(tid)&&String(q.playerId)===String(pid));
  const eligible=tid=>active(tid).skaters.filter(p=>p&&!sent(tid).includes(p.id)&&!(live.injured[tid]||[]).includes(p.id)&&!this.isPlayerUnavailable(p)&&!penaltyBlocksPlayer(tid,p.id));
  const chooseGoalie=tid=>active(tid).goalie;
  // Coincidental penalties count for penalty minutes and player availability, but do not create a man advantage.
  const countPenalty=(tid,atSeconds=penaltyEvalSeconds)=>activePenalties(tid,atSeconds).filter(p=>!p.coincidental).length;
  // Always derive both sides from the complete active penalty list; never increment/decrement a cached manpower value.
  const isThreeOnThreeOvertime=()=>!m.playoff&&live.visibleMinute>60&&!live.inShootout;
  const manpowerCounts=(atSeconds=penaltyEvalSeconds)=>{
    const homePenalties=countPenalty(live.homeId,atSeconds),awayPenalties=countPenalty(live.awayId,atSeconds);
    const pulledHome=live.goaliePulledTeamId===live.homeId?1:0,pulledAway=live.goaliePulledTeamId===live.awayId?1:0;
    if(isThreeOnThreeOvertime()){
      // KHL regular-season OT is 3-on-3. A penalty gives the opponent an extra skater;
      // when the penalty expires (or penalties are coincidental), the game returns to 3-on-3.
      return {home:3+Math.max(0,awayPenalties-homePenalties)+pulledHome,away:3+Math.max(0,homePenalties-awayPenalties)+pulledAway};
    }
    return {home:Math.max(3,5-homePenalties)+pulledHome,away:Math.max(3,5-awayPenalties)+pulledAway};
  };
  const manpowerSummary=(atSeconds=penaltyEvalSeconds)=>{
    const n=manpowerCounts(atSeconds),hn=this.teamById(live.homeId)?.name||'Хозяева',an=this.teamById(live.awayId)?.name||'Гости';
    if(n.home===n.away)return `Команды играют ${n.home} на ${n.away}.`;
    if(n.home>n.away)return `${hn} играет в большинстве — ${n.home} на ${n.away}. ${an} играет в меньшинстве — ${n.away} на ${n.home}.`;
    return `${an} играет в большинстве — ${n.away} на ${n.home}. ${hn} играет в меньшинстве — ${n.home} на ${n.away}.`;
  };
  const teamManpowerSummary=(tid,atSeconds=penaltyEvalSeconds)=>{
    const n=manpowerCounts(atSeconds),own=tid===live.homeId?n.home:n.away,opp=tid===live.homeId?n.away:n.home,ownName=this.teamById(tid)?.name||'Команда';
    if(own>opp)return ` ${ownName} играет в большинстве — ${own} на ${opp}.`;
    if(own<opp)return ` ${ownName} играет в меньшинстве — ${own} на ${opp}.`;
    return ` Команды играют ${own} на ${opp}.`;
  };
  const penaltyDuration=p=>p.type==='gameMisconduct'||p.type==='penaltyShot'?0:(p.type==='major'||p.type==='majorDkm')?5:p.type==='misconduct'?10:p.type==='doubleMinor'?4:2;
  const penaltyRecord=entry=>({
    id:entry.id,penaltyId:entry.id,teamId:entry.teamId,playerId:entry.playerId,
    type:entry.type,minutes:Number(entry.minutes)||0,penaltyMinutes:Number(entry.minutes)||0,
    period:entry.period||null,time:entry.time||null,violation:entry.violation||'',
    affectsManpower:entry.affectsManpower!==false,coincidental:!!entry.coincidental,
    queued:!!entry.queued,coincidenceId:entry.coincidenceId||null,
    ppUnitKey:entry.ppUnitKey||null,pkUnitKey:entry.pkUnitKey||null,
    goaliePenalty:!!entry.goaliePenalty,servedByPlayerId:entry.servedByPlayerId||null
  });
  const activateQueuedPenalties=(tid,startedAtSeconds=null)=>{
    const previousEval=penaltyEvalSeconds;
    let startSeconds=Number.isFinite(Number(startedAtSeconds))?Number(startedAtSeconds):secondsForStamp(stamp());
    penaltyEvalSeconds=startSeconds;
    while(countPenalty(tid,startSeconds)<2){
      const q=live.penalties.filter(p=>String(p.teamId)===String(tid)&&p.queued).sort((a,b)=>(Number(a.assessedMinute)||0)-(Number(b.assessedMinute)||0))[0];
      if(!q)break;
      const startStamp=stampForSeconds(startSeconds),duration=penaltyDuration(q),firstSegment=q.type==='doubleMinor'?120:duration*60;
      q.queued=false;q.activeStartedAt=minute;q.activeStartedAtSeconds=startSeconds;q.expiresAtSeconds=startSeconds+firstSegment;q.expiresAt=Math.ceil(q.expiresAtSeconds/60);
      push({kind:'penaltyStart',id:q.id,penaltyId:q.id,teamId:tid,playerId:q.playerId,period:startStamp.period,time:startStamp.time,type:q.type,minutes:(q.type==='major'||q.type==='majorDkm')?5:q.type==='doubleMinor'?4:2,violation:q.violation||'нарушение правил',affectsManpower:q.affectsManpower!==false,coincidental:!!q.coincidental,ppUnitKey:q.ppUnitKey||null,pkUnitKey:q.pkUnitKey||null,queued:false,text:`${this.db.players.find(x=>String(x.id)===String(q.playerId))?.name||'Игрок'} начинает отбывать штраф из очереди (${(q.type==='major'||q.type==='majorDkm')?'5 минут':q.type==='doubleMinor'?'двойной малый штраф':'2 минуты'}) за ${q.violation||'нарушение правил'}.${teamManpowerSummary(tid,startSeconds)}`});
    }
    penaltyEvalSeconds=previousEval;
  };
  const assessPenalty=(a,options={})=>{
    const type=a.type||'minor',isNonManpower=['misconduct','gameMisconduct'].includes(type)||a.affectsManpower===false;
    const assessedAt=options.atStamp||stamp(),assessedAtSeconds=secondsForStamp(assessedAt);
    const current=activePenalties(a.teamId,assessedAtSeconds).length,queued=!isNonManpower&&current>=2;
    const player=this.db.players.find(x=>String(x.id)===String(a.playerId));
    const name=player?.name||'Игрок',teamName=this.teamById(a.teamId)?.name||'Команда';
    const duration=penaltyDuration({type});
    const firstSegmentSeconds=type==='doubleMinor'?120:duration*60;
    const entry={...a,id:a.id||`pen_${minute}_${a.playerId}_${Math.random().toString(36).slice(2,6)}`,type,minutes:duration,penaltyMinutes:duration,period:assessedAt.period,time:assessedAt.time,segmentNo:1,segmentsRemaining:type==='doubleMinor'?2:1,assessedMinute:minute,assessedAtSeconds,activeStartedAt:queued?null:minute,activeStartedAtSeconds:queued?null:assessedAtSeconds,queued,expiresAt:['gameMisconduct','penaltyShot'].includes(type)?null:(queued?null:Math.ceil((assessedAtSeconds+firstSegmentSeconds)/60)),expiresAtSeconds:['gameMisconduct','penaltyShot'].includes(type)||queued?null:assessedAtSeconds+firstSegmentSeconds,affectsManpower:a.affectsManpower===false?false:!['misconduct','gameMisconduct','penaltyShot'].includes(type)};
    if(type==='misconduct'){entry.expiresAt=Math.ceil((assessedAtSeconds+600)/60);entry.expiresAtSeconds=assessedAtSeconds+600;}
    if(a.temporaryBench)entry.benchUntilMinute=minute+(Number(a.temporaryBenchMinutes)||5);
    live.penalties.push(entry);
    if(type==='gameMisconduct'||type==='majorDkm'||a.gameMisconduct){
      live.sentOff[a.teamId]=live.sentOff[a.teamId]||[];
      if(!live.sentOff[a.teamId].includes(a.playerId))live.sentOff[a.teamId].push(a.playerId);
      m.expulsions=(m.expulsions||[]).concat([a.playerId]);
    }
    const detail=type==='majorDkm'?'на 5 минут с удалением до конца матча (ДКМ)':type==='major'?'на 5 минут (большой штраф)':type==='doubleMinor'?'на 4 минуты (двойной малый штраф, 2+2)':type==='misconduct'?'получает дисциплинарный штраф на 10 минут':type==='gameMisconduct'?'удалён до конца матча (ДКМ)':'на 2 минуты';
    entry.description=a.goaliePenalty?`${name} (${teamName}, вратарь) удалён на ${duration} минуты за ${a.violation||'нарушение правил'}; штраф отбывает ${this.db.players.find(x=>String(x.id)===String(a.servedByPlayerId))?.name||'полевой игрок'}`:type==='gameMisconduct'?`${name} (${teamName}) удалён до конца матча (ДКМ)`:type==='misconduct'?`${name} (${teamName}) получает дисциплинарный штраф на 10 минут`:`${name} (${teamName}) удалён ${detail} за ${a.violation||'нарушение правил'}`;
    if(options.emitEvent!==false){
      const suffix=entry.queued?' Штраф поставлен в очередь: команда не может играть менее чем с тремя полевыми игроками.':'';
      push({kind:'penalty',id:entry.id,penaltyId:entry.id,teamId:a.teamId,playerId:a.playerId,period:assessedAt.period,time:assessedAt.time,type,violation:a.violation||'нарушение правил',minutes:entry.minutes,penaltyMinutes:entry.minutes,affectsManpower:entry.affectsManpower,coincidental:!!a.coincidental,coincidenceId:a.coincidenceId||null,queued,goaliePenalty:!!a.goaliePenalty,servedByPlayerId:a.servedByPlayerId||null,ppUnitKey:a.ppUnitKey||null,pkUnitKey:a.pkUnitKey||null,penaltyDetails:[penaltyRecord(entry)],text:`${entry.description}.${suffix}${teamManpowerSummary(a.teamId,assessedAtSeconds)}`});
    }
    return entry;
  };
  const resolvePendingPenaltyCall=(call,atStamp,scoringTeamId=null,whistleEvent=null)=>{
    if(!call||!Array.isArray(call.assessments)||!call.assessments.length)return;
    live.pendingPenaltyCall=null;
    let assessments=call.assessments.map(a=>({...a}));
    if(assessments.length===1&&!call.coincidental&&scoringTeamId!=null&&String(scoringTeamId)!==String(assessments[0].teamId)){
      const a=assessments[0];
      if(a.type==='minor'||a.type==='penaltyShot'){
        push({kind:'penaltyCancelled',teamId:scoringTeamId,period:atStamp.period,time:atStamp.time,stoppage:true,text:a.type==='penaltyShot'?'Гол до свистка отменил назначение штрафного броска.':'Гол до свистка отменил отложенный малый штраф.'});
        return;
      }
      if(a.type==='doubleMinor'){
        a.type='minor';
        a.violation=`${a.violation} (после гола назначен один отрезок 2 минуты)`;
      }
    }
    if(assessments.length===1&&assessments[0].type==='penaltyShot'){
      const a=assessments[0],beneficiary=a.teamId===live.homeId?live.awayId:live.homeId;
      const offenderName=this.db.players.find(x=>String(x.id)===String(a.playerId))?.name||'Игрок';
      const awardText=a.goaliePenalty?`Вратарь ${offenderName} (${this.teamById(a.teamId)?.name||'команда'}) нарушил правила: ${a.violation}. Назначен штрафной бросок команде ${this.teamById(beneficiary)?.name||'соперника'}.`:`За ${a.violation} назначен штрафной бросок команде ${this.teamById(beneficiary)?.name||'соперника'}.`;
      if(whistleEvent){whistleEvent.text=`${whistleEvent.text||'Свисток судьи.'} ${awardText}`;whistleEvent.penaltyAssessed=true;}
      else push({kind:'penaltyShot',teamId:beneficiary,playerId:a.playerId,period:atStamp.period,time:atStamp.time,stoppage:true,violation:a.violation,text:`Свисток судьи. ${awardText}`});
      const pool=eligible(beneficiary).filter(p=>p.pos!=='G').sort((x,y)=>this.effectiveOVR(y)-this.effectiveOVR(x));
      const shooter=pool[0]||null;
      if(shooter){live.shotStats[shooter.id]=(live.shotStats[shooter.id]||0)+1;if(beneficiary===live.homeId)m.homeShots++;else m.awayShots++;recordGoalieShot(beneficiary===live.homeId?live.awayId:live.homeId);}
      if(shooter&&Math.random()<.32)addGoal(beneficiary,shooter,{period:atStamp.period,time:atStamp.time},{penaltyShot:true,shotAlreadyCounted:true,text:'Гол со штрафного броска!'});
      else push({kind:'penaltyShotAttempt',teamId:beneficiary,playerId:shooter?.id||null,period:atStamp.period,time:atStamp.time,text:shooter?`Штрафной бросок ${shooter.name}: вратарь отразил попытку.`:'Штрафной бросок не реализован.'});
      return;
    }
    const entries=assessments.map(a=>assessPenalty(a,{emitEvent:false,atStamp}));
    const details=entries.map((entry,i)=>{
      const a=assessments[i],name=this.db.players.find(x=>String(x.id)===String(a.playerId))?.name||'Игрок',teamName=this.teamById(a.teamId)?.name||'Команда';
      if(a.goaliePenalty){const server=this.db.players.find(x=>String(x.id)===String(a.servedByPlayerId))?.name||'полевой игрок';if(a.type==='penaltyShot')return `${name} (${teamName}, вратарь) нарушил правила: ${a.violation}; назначен штрафной бросок`;return `${name} (${teamName}, вратарь) удалён на 2 минуты за ${a.violation||'нарушение правил'}; штраф отбывает ${server}`;}
      if(a.type==='gameMisconduct')return `${name} (${teamName}) удалён до конца матча (ДКМ) за ${a.violation||'серьёзное нарушение'}`;
      if(a.type==='misconduct')return `${name} (${teamName}) получил дисциплинарный штраф на 10 минут за ${a.violation||'неспортивное поведение'}`;
      const detail=a.type==='majorDkm'?'5 минут + ДКМ':a.type==='major'?'5 минут':a.type==='doubleMinor'?'4 минуты (2+2)':'2 минуты';
      return `${name} (${teamName}) удалён на ${detail} за ${a.violation||'нарушение правил'}`;
    });
    const first=assessments[0];
    const mutualMinorCall=assessments.length===2&&assessments.every(a=>a.coincidental)&&String(assessments[0].teamId)!==String(assessments[1].teamId);
    const assessedText=mutualMinorCall?`Назначены обоюдные удаления: ${details.join('; ')}. ${manpowerSummary(secondsForStamp(atStamp))}`:`Отложенное удаление зафиксировано: ${details.join('; ')}. ${manpowerSummary(secondsForStamp(atStamp))}`;
    const records=entries.map((entry,i)=>({...penaltyRecord(entry),period:atStamp.period,time:atStamp.time,teamId:assessments[i].teamId,playerId:assessments[i].playerId,type:assessments[i].type,minutes:entry.minutes,penaltyMinutes:entry.minutes,violation:assessments[i].violation||''}));
    if(whistleEvent){
      whistleEvent.text=`${whistleEvent.text||'Свисток судьи.'} ${assessedText}`;
      whistleEvent.penaltyAssessed=true;
      whistleEvent.penaltyIds=entries.map(e=>e.id);
      whistleEvent.penaltyTypes=entries.map(e=>e.type);
      whistleEvent.penaltyDetails=records;
    }else{
      push({kind:'penalty',id:entries[0]?.id,penaltyId:entries[0]?.id,teamId:first.teamId,playerId:first.playerId,period:atStamp.period,time:atStamp.time,stoppage:true,type:first.type,violation:first.violation,minutes:entries[0]?.minutes,penaltyMinutes:entries[0]?.minutes,affectsManpower:entries[0]?.affectsManpower,ppUnitKey:first.ppUnitKey||null,pkUnitKey:first.pkUnitKey||null,coincidental:assessments.some(a=>a.coincidental),penaltyIds:entries.map(e=>e.id),penaltyDetails:records,text:assessedText});
    }
  };
  const syncPenaltyUnitKey=(penalty,field,key)=>{
    if(!penalty||!key||!['ppUnitKey','pkUnitKey'].includes(field))return;
    penalty[field]=key;
    const pid=String(penalty.id||penalty.penaltyId||'');
    if(!pid)return;
    for(const event of (m.events||[])){
      const rootId=String(event.penaltyId||event.id||'');
      if(rootId===pid)event[field]=key;
      if(Array.isArray(event.penaltyDetails))for(const record of event.penaltyDetails){
        if(String(record.penaltyId||record.id||'')===pid)record[field]=key;
      }
    }
  };
  const selectUnitForManpower=(teamId,unitKey,manpower)=>{
    const limit=Math.max(3,Math.min(5,Number(manpower)||5));
    const targetF=limit-2,targetD=2;
    const eligiblePlayers=eligible(teamId),eligibleIds=new Set(eligiblePlayers.map(p=>String(p.id)));
    const base=this.specialUnitPlayers(teamId,unitKey,live)||{};
    let forwards=(base.forwards||[]).filter(p=>eligibleIds.has(String(p.id))).slice(0,targetF);
    let defense=(base.defense||[]).filter(p=>eligibleIds.has(String(p.id))).slice(0,targetD);
    const used=new Set([...forwards,...defense].map(p=>String(p.id)));
    const pool=eligiblePlayers.filter(p=>!used.has(String(p.id))).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a));
    for(const p of pool){
      if(['LW','C','RW'].includes(p.pos)&&forwards.length<targetF){forwards.push(p);used.add(String(p.id));}
      else if(p.pos==='D'&&defense.length<targetD){defense.push(p);used.add(String(p.id));}
      if(forwards.length>=targetF&&defense.length>=targetD)break;
    }
    return {forwards,defense,skaters:[...forwards,...defense],goalie:active(teamId).goalie};
  };
  const addGoal=(tid,shooter,periodStamp,opts={})=>{
    const pool=eligible(tid).filter(p=>p.id!==shooter?.id);
    const a1=Math.random()<this.assistProb(1)?this.weightedPick(pool,'passing'):null;
    const a2=a1&&Math.random()<this.assistProb(2)?this.weightedPick(pool.filter(p=>p.id!==a1?.id),'passing'):null;
    const ev={kind:'goal',teamId:tid,scorerId:shooter?.id||null,assist1Id:a1?.id||null,assist2Id:a2?.id||null,period:periodStamp.period,time:periodStamp.time,powerPlay:!!opts.powerPlay,ppUnitKey:opts.ppUnitKey||null,ppUnitKeyAgainst:opts.ppUnitKeyAgainst||null,pkUnitKeyFor:opts.pkUnitKeyFor||null,pkUnitKeyAgainst:opts.pkUnitKeyAgainst||null,ppOpportunityId:opts.ppOpportunityId||null,pkOpportunityId:opts.pkOpportunityId||null,emptyNet:!!opts.emptyNet,sixOnFive:!!opts.sixOnFive,shortHanded:!!opts.shortHanded,penaltyShot:!!opts.penaltyShot,stoppage:true};
    if(Number.isFinite(opts.visibleAtMinute))ev.visibleAtMinute=opts.visibleAtMinute;
    // PP/PK units are selected internally, but their full player lists are intentionally not logged.
    if(opts.text)ev.text=opts.text;
    if(opts.powerPlay)ev.text=ev.text||'Гол в большинстве';
    if(opts.shortHanded)ev.text=ev.text||'Гол в меньшинстве';
    push(ev);if(tid===live.homeId)m.homeScore++;else m.awayScore++;
    if(!opts.emptyNet){const defendingTeamId=tid===live.homeId?live.awayId:live.homeId;if(!opts.shotAlreadyCounted)recordGoalieShot(defendingTeamId);recordGoalieGoalAgainst(defendingTeamId);}
    // A goal is itself a stoppage: cancel a delayed minor for the benefiting team, or assess other penalties at this same timestamp.
    if(live.pendingPenaltyCall)resolvePendingPenaltyCall(live.pendingPenaltyCall,periodStamp,tid);
    // A goal while the goalie is pulled stops play and brings the netminder back,
    // whether it was an empty-net goal against or a 6-on-5 goal for the trailing team.
    const pulledTeamId=live.goaliePulledTeamId;
    if(pulledTeamId){
      let returnText;
      if(opts.emptyNet)returnText='После гола соперника в пустые ворота вратарь возвращается в ворота.';
      else if(tid===pulledTeamId)returnText='Команда забивает при игре 6 на 5. Вратарь возвращается в ворота.';
      else returnText='После заброшенной шайбы игра останавливается, вратарь возвращается в ворота.';
      push({kind:'goalieReturn',teamId:pulledTeamId,period:periodStamp.period,time:periodStamp.time,visibleAtMinute:Number.isFinite(opts.visibleAtMinute)?opts.visibleAtMinute:minute,text:returnText});
      live.goaliePulledTeamId=null;live.pendingLateGoaliePull=null;
    }
    if(!opts.emptyNet)maybeReplaceGoalie(tid,periodStamp,Number.isFinite(opts.visibleAtMinute)?opts.visibleAtMinute:minute);
    return ev;
  };
  // Process penalty expiries in chronological order up to an actual game timestamp.
  // Never expire every penalty at the end of a whole minute before simulating earlier events in that minute.
  processPenaltyExpiriesUntil=(targetSeconds)=>{
    const target=Math.max(0,Number(targetSeconds)||0);
    if(processingPenaltyExpiries)return;
    processingPenaltyExpiries=true;
    try{
      let guard=0;
      while(guard++<40){
        const due=live.penalties.filter(p=>{
          if(p.queued)return false;
          if(p.affectsManpower===false){
            const misconductDue=p.type==='misconduct'&&penaltyExpirySeconds(p)<=target;
            const benchDue=Number.isFinite(Number(p.benchUntilMinute))&&Number(p.benchUntilMinute)*60<=target;
            return misconductDue||benchDue;
          }
          return penaltyExpirySeconds(p)<=target;
        }).map(p=>({p,at:p.type==='misconduct'?penaltyExpirySeconds(p):(p.affectsManpower===false&&Number.isFinite(Number(p.benchUntilMinute))?Math.min(penaltyExpirySeconds(p),Number(p.benchUntilMinute)*60):penaltyExpirySeconds(p))})).sort((a,b)=>a.at-b.at);
        if(!due.length)break;
        const {p,at}=due[0];
        if(!Number.isFinite(at)||at>target)break;
        const exSeconds=Math.max(0,at),exStamp=stampForSeconds(exSeconds);
        penaltyEvalSeconds=exSeconds;
        if(exSeconds>=tickStartSeconds&&exSeconds<=tickEndSeconds)lastStampSecond=Math.max(lastStampSecond,exSeconds-tickStartSeconds);
        const expelled=sent(p.teamId).some(id=>String(id)===String(p.playerId));
        const penalizedName=this.db.players.find(x=>String(x.id)===String(p.playerId))?.name||'Игрок';
        const servingId=p.servedByPlayerId||p.playerId;
        const name=this.db.players.find(x=>String(x.id)===String(servingId))?.name||'Игрок';
        if(p.affectsManpower===false){
          live.penalties=live.penalties.filter(x=>x.id!==p.id);
          if(p.type==='misconduct'||Number.isFinite(Number(p.benchUntilMinute))){
            const text=expelled?`${name} завершил временный отрезок, но остаётся удалён до конца матча (ДКМ).${teamManpowerSummary(p.teamId,exSeconds)}`:
              p.type==='misconduct'?`${name} отбыл дисциплинарный штраф на 10 минут и доступен для ротации.${teamManpowerSummary(p.teamId,exSeconds)}`:`${name} завершил временное наказание и доступен для ротации.${teamManpowerSummary(p.teamId,exSeconds)}`;
            push({kind:expelled?'penaltyEnd':'misconductEnd',teamId:p.teamId,playerId:p.playerId,period:exStamp.period,time:exStamp.time,text});
          }
          continue;
        }
        if(p.type==='doubleMinor'&&Number(p.segmentNo||1)===1){
          p.segmentNo=2;p.segmentsRemaining=1;p.activeStartedAt=minute;p.activeStartedAtSeconds=exSeconds;p.expiresAtSeconds=exSeconds+120;p.expiresAt=Math.ceil(p.expiresAtSeconds/60);
          push({kind:'penaltySegmentEnd',teamId:p.teamId,playerId:p.playerId,period:exStamp.period,time:exStamp.time,penaltyId:p.id,violation:p.violation,text:`Первый 2-минутный отрезок двойного малого штрафа завершён. Второй отрезок продолжается.${teamManpowerSummary(p.teamId,exSeconds)}`});
          continue;
        }
        live.penalties=live.penalties.filter(x=>x.id!==p.id);
        activateQueuedPenalties(p.teamId,exSeconds);
        const other=p.teamId===live.homeId?live.awayId:live.homeId;
        const afterExpiry=manpowerCounts(exSeconds);
        const ownMen=p.teamId===live.homeId?afterExpiry.home:afterExpiry.away,otherMen=other===live.homeId?afterExpiry.home:afterExpiry.away;
        const wait=!expelled&&ownMen>=5&&(ownMen>otherMen||live.goaliePulledTeamId===p.teamId);
        if(wait&&!live.waitingReturns.some(r=>String(r.teamId)===String(p.teamId)&&String(r.playerId)===String(servingId)))live.waitingReturns.push({teamId:p.teamId,playerId:servingId,goaliePenalty:!!p.goaliePenalty,goalieId:p.goaliePenalty?p.playerId:null});
        const text=p.goaliePenalty?(wait?`Вратарь ${penalizedName} отбыл штраф; ${name} продолжает отбывать его до ближайшей остановки.${teamManpowerSummary(p.teamId,exSeconds)}`:`Вратарь ${penalizedName} отбыл штраф. Полевой игрок ${name}, отбывавший его вместо вратаря, возвращается на лёд.${teamManpowerSummary(p.teamId,exSeconds)}`):expelled?`${name} отбыл большой штраф на 5 минут, но остаётся удалён до конца матча (ДКМ).${teamManpowerSummary(p.teamId,exSeconds)}`:
          wait?`${name} отбыл штраф. Команда уже играет в большинстве впятером; игрок выйдет при ближайшей остановке.${teamManpowerSummary(p.teamId,exSeconds)}`:
          `${name} возвращается после удаления.${teamManpowerSummary(p.teamId,exSeconds)}`;
        push({kind:'penaltyEnd',teamId:p.teamId,playerId:p.playerId,servedByPlayerId:p.servedByPlayerId||null,goaliePenalty:!!p.goaliePenalty,period:exStamp.period,time:exStamp.time,waitingForStoppage:wait,penaltyId:p.id,violation:p.violation,text});
      }
    }finally{
      processingPenaltyExpiries=false;
      penaltyEvalSeconds=target;
    }
  };
  // At the start of a simulated minute, only expiries that happened before this minute are processed.
  // Later expiries are processed by stamp()/push() at their exact timestamp.
  processPenaltyExpiriesUntil(tickStartSeconds);
  penaltyEvalSeconds=tickStartSeconds;

  // Shootout: three attempts per side, then sudden death after each equal pair.
  // Each skater shoots once before a team starts a new rotation through its lineup.
  if(live.inShootout){
    const tid=live.shootoutNextTeamId||live.homeId,other=tid===live.homeId?live.awayId:live.homeId;
    const sideKey=tid===live.homeId?'home':'away',otherKey=other===live.homeId?'home':'away';
    live.shootoutAttempts=live.shootoutAttempts||{home:0,away:0};
    live.shootoutGoals=live.shootoutGoals||{home:0,away:0};
    live.shootoutUsedPlayerIds=live.shootoutUsedPlayerIds||{home:[],away:[]};
    live.shootoutUsedPlayerIds[sideKey]=live.shootoutUsedPlayerIds[sideKey]||[];
    const pool=eligible(tid).filter(p=>p&&p.pos!=='G');
    let candidates=pool.filter(p=>!live.shootoutUsedPlayerIds[sideKey].includes(p.id));
    if(!candidates.length&&pool.length){
      live.shootoutUsedPlayerIds[sideKey]=[];
      candidates=pool.slice();
      push({kind:'faceoff',teamId:tid,period:'Б',time:'00:00',virtualMinute:minute+.001,text:`${this.teamById(tid)?.name||'Команда'}: все доступные полевые игроки уже исполнили буллит. Начинается следующий круг, повторы теперь разрешены.`});
    }
    if(tid===this.state?.teamId&&!live.autoResolveShootouts&&!live.pendingShootoutShooterId&&candidates.length){
      live.pendingShootoutPick={teamId:tid,candidateIds:candidates.map(p=>p.id),attemptNumber:(live.shootoutAttempts[sideKey]||0)+1,suddenDeath:(live.shootoutAttempts[sideKey]||0)>=3};
      return false;
    }
    let shooter=null;
    if(tid===this.state?.teamId&&live.pendingShootoutShooterId){
      shooter=candidates.find(p=>String(p.id)===String(live.pendingShootoutShooterId))||null;
      if(!shooter&&pool.length){live.pendingShootoutUsedPlayerFallback=true;shooter=this.weightedPick(candidates,'shooting')||candidates[0]||null;}
    }else{
      shooter=this.weightedPick(candidates,'shooting')||candidates[0]||null;
    }
    live.pendingShootoutShooterId=null;
    live.pendingShootoutPick=null;
    if(!shooter){
      // A team with no eligible field player must not freeze the match forever.
      shooter=this.weightedPick(pool,'shooting')||pool[0]||null;
    }
    live.shootoutNextTeamId=other;
    live.shootoutAttemptCount=(live.shootoutAttemptCount||0)+1;
    live.shootoutAttempts[sideKey]++;
    if(shooter&&!live.shootoutUsedPlayerIds[sideKey].includes(shooter.id))live.shootoutUsedPlayerIds[sideKey].push(shooter.id);
    const goalie=chooseGoalie(other),outcome=this.shootoutOutcome(shooter,goalie);
    if(outcome==='goal')live.shootoutGoals[sideKey]++;
    const round=Math.max(live.shootoutAttempts.home,live.shootoutAttempts.away),sc=`${live.shootoutGoals.home}:${live.shootoutGoals.away}`;
    push({kind:'shootoutAttempt',teamId:tid,scorerId:shooter?.id||null,goalieId:goalie?.id||null,outcome,round,attemptNumber:live.shootoutAttempts[sideKey],period:'Б',time:'00:00',virtualMinute:minute,scoreText:sc,text:outcome==='goal'?'Буллит реализован':outcome==='save'?'Вратарь отразил буллит':'Бросок мимо ворот'});
    const attemptsBalanced=live.shootoutAttempts.home===live.shootoutAttempts.away;
    const goalDiff=live.shootoutGoals.home-live.shootoutGoals.away;
    const winnerDecided=this.shootoutDecided(live.shootoutAttempts.home,live.shootoutAttempts.away,live.shootoutGoals.home,live.shootoutGoals.away);
    if(winnerDecided){
      const winnerId=goalDiff>0?live.homeId:live.awayId;
      m.so=true;live.shootoutWinnerId=winnerId;
      if(winnerId===live.homeId)m.homeScore++;else m.awayScore++;
      push({kind:'shootout',teamId:winnerId,period:'Б',time:'00:00',virtualMinute:minute+.02,text:`со счётом ${live.shootoutGoals.home}:${live.shootoutGoals.away} (попыток: ${live.shootoutAttempts.home} и ${live.shootoutAttempts.away})`});
      this.endLiveMatch(live,minute);return true;
    }
    return false;
  }

  // Injury chances are low enough to make them meaningful rather than routine, at most one per club per game.
  for(const tid of [live.homeId,live.awayId]){
    if(live.injuryOccurred[tid]||Math.random()>=.0022*(this.tacInjMul?this.tacInjMul(tid):1))continue;
    const side=active(tid),pool=[...eligible(tid),side.goalie].filter(p=>p&&!this.isPlayerUnavailable(p));
    if(!pool.length)continue;
    const player=pool[Math.floor(Math.random()*pool.length)],inj=this.assignInjury(player,m,tid,stamp().period,stamp().time);
    if(!inj)continue;
    live.injuryOccurred[tid]=true;live.injured[tid].push(player.id);live.sentOff[tid].push(player.id);
    if(player.pos==='G'){
      const backup=this.teamPlayers(tid).filter(p=>p.pos==='G'&&p.id!==player.id&&!this.isPlayerUnavailable(p)).sort((a,b)=>this.effectiveOVR(b)-this.effectiveOVR(a))[0];
      if(tid===live.homeId)live.activeH.goalie=backup||null;else live.activeA.goalie=backup||null;
      if(backup)push({kind:'save',teamId:tid,period:stamp().period,time:stamp().time,text:`${player.name} получил травму. Ворота защищает запасной вратарь ${backup.name}.`});
    }
  }

  // Delayed penalty signal: play continues until a real whistle. Puck over glass is an immediate stoppage;
  // goalie freezing the puck is a whistle, not a player infraction.
  if(minute<60&&!live.pendingPenaltyCall&&Math.random()<(m.playoff?this.SPECIAL_MODEL_PARAMS.penaltyCallPerMinutePlayoff:this.SPECIAL_MODEL_PARAMS.penaltyCallPerMinute)*(this.penaltyHeat?this.penaltyHeat(m,minute):1)){
    const __sc=this.liveScenario(live,m),__nerv=this.penaltyNerves?this.penaltyNerves(m):0,guilty=Math.random()<Math.max(.1,Math.min(.9,(__sc?__sc.pHomeGuilty:.5)+__nerv+(this.coachGuiltyShift?this.coachGuiltyShift(live.homeId,live.awayId):0)))?live.homeId:live.awayId,other=guilty===live.homeId?live.awayId:live.homeId;
    const pool=eligible(guilty),regularPlayer=pool[Math.floor(Math.random()*Math.max(1,pool.length))],keeper=active(guilty).goalie;
    const recentPressure=(m.events||[]).slice(-8).filter(e=>String(e.teamId)===String(other)&&['chance','goal','block','save'].includes(e.kind)).length;
    const goalieOffenceChance=recentPressure>=2?.045:.018;
    const goalieViolation=!!(keeper&&regularPlayer&&Math.random()<goalieOffenceChance);
    const player=goalieViolation?keeper:regularPlayer,servingPlayer=goalieViolation?regularPlayer:null;
    if(player){
      const coincidence=!goalieViolation&&Math.random()<.18,assessments=[];
      const unitKeys=()=>({ppUnitKey:Math.random()<.72?'pp1':'pp2',pkUnitKey:Math.random()<.72?'pk1':'pk2'});
      const selectOffence=()=>{
        const roll=Math.random();let type,violation;
        if(roll<.84){
          type='minor';
          const minorRoll=Math.random();
          if(minorRoll<.008)violation='Задержка игры — выброс шайбы за стекло';
          else {const minorViolations=['Задержка соперника','Подножка','Задержка соперника клюшкой','Удар клюшкой','Задержка чужой клюшки','Помеха','Высокая клюшка без травмы','Атака игрока без шайбы','Атака вратаря / контакт с голкипером','Толчок на борт без травмы','Задержка руками клюшки'];violation=minorViolations[Math.floor(Math.random()*minorViolations.length)];}
        }
        else if(roll<.875){type='doubleMinor';violation=['Высокая клюшка с кровью','Удар клюшкой, приведший к порезу','Порез коньком в борьбе у ворот'][Math.floor(Math.random()*3)];}
        else if(roll<.90){type='major';violation=['Опасный толчок на борт','Атака с разбега (чарджинг)','Грубая атака игрока без шайбы'][Math.floor(Math.random()*3)];}
        else if(roll<.92){type='misconduct';violation='Неспортивное поведение после свистка';}
        else if(roll<.935){type='majorDkm';violation=['Тычок клюшкой (спиринг)','Удар коньком','Опасный толчок с травмоопасным контактом'][Math.floor(Math.random()*3)];}
        else if(roll<.94){type='penaltyShot';violation=['Задержка при выходе один на один','Подножка при явной возможности забить','Нарушение против игрока на явном голевом моменте'][Math.floor(Math.random()*3)];}
        else return {type:'noCall',violation:''};
        return {type,violation};
      };
      const selectGoalieOffence=()=>{
        const roll=Math.random(),clearBreakaway=recentPressure>=2&&Math.random()<.12;
        if(roll<.45){const options=['Задержка игры — вратарь умышленно заморозил шайбу','Задержка игры — вратарь умышленно задержал шайбу вне зоны','Задержка игры — вратарь умышленно сдвинул штангу'];return {type:'minor',violation:options[Math.floor(Math.random()*options.length)]};}
        if(roll<.70){if(clearBreakaway)return {type:'penaltyShot',violation:'Вратарь умышленно накрыл шайбу за пределами площади ворот при явной возможности забить'};return {type:'minor',violation:'Умышленно накрыл шайбу за пределами площади ворот'};}
        if(roll<.85)return {type:'minor',violation:'Помеха / столкновение с соперником в площади ворот'};
        if(roll<.97){const options=['Подножка вратаря','Задержка соперника вратарём','Удар клюшкой вратаря'];return {type:'minor',violation:options[Math.floor(Math.random()*options.length)]};}
        if(Math.random()<.66)return {type:'minor',violation:'Грубость / толчок соперника без шайбы'};
        return clearBreakaway?{type:'penaltyShot',violation:'Умышленно сдвинул ворота вратарём в момент явной голевой атаки'}:{type:'minor',violation:'Умышленно сдвинул ворота в момент атаки'};
      };
      const picked=goalieViolation?selectGoalieOffence():selectOffence();
      if(picked.type!=='noCall'){
        if(picked.violation==='Задержка игры — выброс шайбы за стекло'){
          // The puck is already out of play: assess the minor immediately at this whistle.
          const at=stamp(),entry=assessPenalty({teamId:guilty,playerId:player.id,type:'minor',violation:picked.violation,coincidental:false,...unitKeys()},{emitEvent:false,atStamp:at});
          push({kind:'penalty',id:entry.id,penaltyId:entry.id,teamId:guilty,playerId:player.id,period:at.period,time:at.time,type:'minor',minutes:2,penaltyMinutes:2,stoppage:true,violation:picked.violation,ppUnitKey:entry.ppUnitKey||null,pkUnitKey:entry.pkUnitKey||null,penaltyDetails:[penaltyRecord(entry)],text:`Свисток судьи: шайба выброшена за пределы площадки. ${entry.description}.${teamManpowerSummary(guilty,secondsForStamp(at))}`});
        }else if(picked.type==='penaltyShot'){
          assessments.push({teamId:guilty,playerId:player.id,type:'penaltyShot',violation:picked.violation,coincidental:false,goaliePenalty:goalieViolation,servedByPlayerId:servingPlayer?.id||null,...unitKeys()});
        }else if(coincidence&&picked.type==='minor'){
          const otherPool=eligible(other),otherPlayer=otherPool[Math.floor(Math.random()*Math.max(1,otherPool.length))];
          if(otherPlayer){const otherOffence=['Задержка соперника','Подножка','Задержка соперника клюшкой','Помеха'][Math.floor(Math.random()*4)],coincidenceId=`coinc_${minute}_${player.id}_${otherPlayer.id}`;assessments.push({teamId:guilty,playerId:player.id,type:'minor',violation:picked.violation,coincidental:true,coincidenceId,...unitKeys()});assessments.push({teamId:other,playerId:otherPlayer.id,type:'minor',violation:otherOffence,coincidental:true,coincidenceId,...unitKeys()});}
        }
        if(!assessments.length&&picked.violation!=='Задержка игры — выброс шайбы за стекло')assessments.push({teamId:guilty,playerId:player.id,type:picked.type,violation:picked.violation,coincidental:false,gameMisconduct:picked.type==='majorDkm',goaliePenalty:goalieViolation,servedByPlayerId:servingPlayer?.id||null,...unitKeys()});
        if(assessments.length){
          live.pendingPenaltyCall={id:`delayed_${minute}_${player.id}`,createdAtMinute:minute,coincidental:assessments.length>1,assessments};
          const signal=assessments.map(a=>{const n=this.db.players.find(x=>String(x.id)===String(a.playerId))?.name||'Игрок';return `${n} (${this.teamById(a.teamId)?.name||'Команда'}) — ${a.violation}`;}).join('; ');
          const signalStamp=stamp();
          push({kind:'delayedPenalty',teamId:guilty,playerId:player.id,period:signalStamp.period,time:signalStamp.time,coincidental:assessments.length>1,violation:picked.violation,text:`Судья поднимает руку: возможное удаление — ${signal}. Игра продолжается до ближайшего свистка.`});
        }
      }
    }
  }
  // Too many men is a rare line-change infraction, never a first-shift initialization artefact.
  if(minute>2&&minute<60&&!live.tooManyMenCalled&&!live.pendingPenaltyCall&&Math.random()<.00006){
    const tid=Math.random()<.5?live.homeId:live.awayId,pool=eligible(tid).filter(p=>p.pos!=='G');
    const player=pool.slice().sort((a,b)=>this.effectiveOVR(a)-this.effectiveOVR(b))[0];
    if(player){live.tooManyMenCalled=true;const at=stamp(),violation='Нарушение численного состава — слишком много игроков на льду',entry=assessPenalty({teamId:tid,playerId:player.id,type:'minor',violation,...{ppUnitKey:Math.random()<.5?'pp1':'pp2',pkUnitKey:Math.random()<.5?'pk1':'pk2'}},{emitEvent:false,atStamp:at});push({kind:'penalty',id:entry.id,penaltyId:entry.id,teamId:tid,playerId:player.id,period:at.period,time:at.time,type:'minor',minutes:2,penaltyMinutes:2,stoppage:true,violation,penaltyDetails:[penaltyRecord(entry)],text:`Свисток судьи: ошибка смены звеньев, команда получила штраф за слишком большое количество игроков на льду. ${entry.description}.${teamManpowerSummary(tid,secondsForStamp(at))}`});}
  }

  const diff=m.homeScore-m.awayScore;
  if(!live.fightOccurred){let initiator=null,trigger=false;{const FM=this.penaltyFightMul?this.penaltyFightMul(m):1,SP=this.SPECIAL_MODEL_PARAMS;if(Math.abs(diff)>=3){initiator=diff>0?live.awayId:live.homeId;trigger=Math.random()<SP.fightBlowoutPerMin*FM;}else{initiator=Math.random()<.5?live.homeId:live.awayId;trigger=Math.random()<SP.fightBasePerMin*FM;}}
    if(trigger){
      const other=initiator===live.homeId?live.awayId:live.homeId,aa=eligible(initiator),bb=eligible(other);
      if(aa.length&&bb.length){
        const p1=aa[Math.floor(Math.random()*aa.length)],p2=bb[Math.floor(Math.random()*bb.length)],serious=Math.random()<this.SPECIAL_MODEL_PARAMS.fightSerious;
        live.fightOccurred=true;
        const fightStamp=stamp();
        const p1Major=assessPenalty({teamId:initiator,playerId:p1.id,type:'major',violation:'Драка — большой штраф 5 минут',coincidental:true,affectsManpower:true},{emitEvent:false,atStamp:fightStamp});
        const p2Major=assessPenalty({teamId:other,playerId:p2.id,type:serious?'majorDkm':'major',violation:serious?'Драка с дополнительным дисциплинарным удалением до конца матча':'Драка — большой штраф 5 минут',coincidental:true,affectsManpower:true,gameMisconduct:serious},{emitEvent:false,atStamp:fightStamp});
        push({kind:'fight',teamId:initiator,playerId:p1.id,opponentPlayerId:p2.id,serious,gameMisconduct:serious,period:fightStamp.period,time:fightStamp.time,penaltyDetails:[penaltyRecord(p1Major),penaltyRecord(p2Major)],text:serious?`Серьёзная драка! ${p1.name} и ${p2.name} получили большие штрафы на 5 минут; ${p2.name} дополнительно удалён до конца матча (ДКМ). ${manpowerSummary(secondsForStamp(fightStamp))}`:`Драка между ${p1.name} и ${p2.name}. Оба получили большие штрафы на 5 минут. ${manpowerSummary(secondsForStamp(fightStamp))}`});
        m.fights=(m.fights||[]).concat([{playerId:p1.id,opponentPlayerId:p2.id,serious,teamId:initiator}]);
        // A scuffle can cause a minor injury. The player leaves this game but is cleared for the next one.
        if(Math.random()<.18){
          const candidates=[[initiator,p1],[other,p2]].filter(([tid,p])=>!live.injuryOccurred[tid]&&!(live.injured[tid]||[]).includes(p.id)&&!this.playerDev(p)?.injury);
          if(candidates.length){
            const [injuryTeam,injuredPlayer]=candidates[Math.floor(Math.random()*candidates.length)];
            const assigned=this.assignInjury(injuredPlayer,m,injuryTeam,stamp().period,stamp().time,'light');
            if(assigned){live.injuryOccurred[injuryTeam]=true;live.injured[injuryTeam].push(injuredPlayer.id);live.sentOff[injuryTeam].push(injuredPlayer.id);}
          }
        }
      }
    }
  }

  // Late goalie pull is a separate live event. The follow-up shot/goal is resolved
  // on a later virtual tick, so the pull is rendered before its outcome.
  let handledLatePull=false;
  const thirdPeriodStamp=(seconds)=>({period:'3П',time:`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`});
  const __pd=(!live.goaliePullProcessed&&!live.pendingLateGoaliePull&&minute>=54&&minute<=59&&m.homeScore!==m.awayScore&&Math.abs(m.homeScore-m.awayScore)<=2)?(()=>{const lead=m.homeScore>m.awayScore?live.homeId:live.awayId,tr=lead===live.homeId?live.awayId:live.homeId;return this.tacPullDecision?{...this.tacPullDecision(live,m,tr,minute,Math.abs(m.homeScore-m.awayScore)),tr}:(minute===57&&Math.abs(m.homeScore-m.awayScore)===1?{pull:true,at:null,diff:1,tr}:{pull:false});})():{pull:false};
  if(__pd.pull){
    const elapsedSeconds=1079+Math.floor(Math.random()*92); // 17:59 through 19:30, inclusive.
    const delaySeconds=Math.min(60+Math.floor(Math.random()*31),1200-elapsedSeconds); // Outcome is deferred to a later live tick, normally at least a minute later.
    const leadingId=m.homeScore>m.awayScore?live.homeId:live.awayId;
    const trailingId=leadingId===live.homeId?live.awayId:live.homeId;
    // Time-out happens first; the goalie pull is a separate event on the next eligible tick.
    const pullAtMinute=__pd.at!=null?Math.max(minute,__pd.at):(elapsedSeconds<=1080?58:59);
    live.pendingLateGoaliePull={diff:__pd.diff||1,leadingId,trailingId,pullSeconds:elapsedSeconds,goalSeconds:elapsedSeconds+delaySeconds,pullAtMinute,timeoutAtMinute:57,timeoutCalled:false,activated:false,resolveAtMinute:null};
  }
  if(live.pendingLateGoaliePull&&!live.pendingLateGoaliePull.timeoutCalled&&minute>=live.pendingLateGoaliePull.timeoutAtMinute){
    const p=live.pendingLateGoaliePull;p.timeoutCalled=true;
    push({kind:'timeout',teamId:p.trailingId,period:'3П',time:'17:00',visibleAtMinute:minute,text:`${this.teamById(p.trailingId)?.name||'Команда'} берёт тайм-аут. Тренерский штаб готовит финальную атаку и обсуждает снятие вратаря.`});
    handledLatePull=true;live.forceUiRender=true;
  }
  if(!handledLatePull&&live.pendingLateGoaliePull&&!live.pendingLateGoaliePull.activated&&minute>=live.pendingLateGoaliePull.pullAtMinute){
    const p=live.pendingLateGoaliePull;
    if(Math.abs(m.homeScore-m.awayScore)!==(p.diff||1)){live.pendingLateGoaliePull=null;}
    else{
      p.leadingId=m.homeScore>m.awayScore?live.homeId:live.awayId;
      p.trailingId=p.leadingId===live.homeId?live.awayId:live.homeId;
      p.activated=true;p.resolveAtMinute=Math.min(60,minute+1);live.goaliePullProcessed=true;live.goaliePulledTeamId=p.trailingId;
      const pullStamp=thirdPeriodStamp(p.pullSeconds);
      push({kind:'emptyNet',teamId:p.trailingId,...pullStamp,visibleAtMinute:minute,text:`${this.teamById(p.trailingId)?.name} снимает вратаря в концовке! Команда играет в шесть полевых.`});
      handledLatePull=true;live.forceUiRender=true;
    }
  }

  // Resolve the 6-on-5 sequence only after the pull event has already been shown.
  if(live.pendingLateGoaliePull?.activated&&minute>=live.pendingLateGoaliePull.resolveAtMinute){
    const late=live.pendingLateGoaliePull,goalStamp=thirdPeriodStamp(late.goalSeconds);
    const emptyNetGoal=Math.random()<.70;
    const scoringId=emptyNetGoal?late.leadingId:late.trailingId;
    const pool=eligible(scoringId),scorer=this.weightedPick(pool,'shooting')||pool[0]||null;
    if(scorer){live.shotStats[scorer.id]=(live.shotStats[scorer.id]||0)+1;if(scoringId===live.homeId)m.homeShots++;else m.awayShots++;if(!emptyNetGoal)recordGoalieShot(scoringId===live.homeId?live.awayId:live.homeId);}
    addGoal(scoringId,scorer,goalStamp,emptyNetGoal
      ?{emptyNet:true,shotAlreadyCounted:true,visibleAtMinute:minute,text:'Гол в пустые ворота после снятия вратаря!'}
      :{sixOnFive:true,shotAlreadyCounted:true,visibleAtMinute:minute,text:'ГОЛ! Команда сравняла счёт в атаке 6 на 5.'});
    if(!emptyNetGoal&&m.homeScore===m.awayScore)live.forcedLateTie=true;
    live.pendingLateGoaliePull=null;live.goaliePulledTeamId=null;
    handledLatePull=true;live.forceUiRender=true;
  }

  // Rare overtime gamble (regular season only): a team pulls its goalie in 3-on-3 overtime.
  // If the opponent then scores into the empty net, the loser gets 0 points (m.overtimeEmptyNet).
  if(minute>60&&!m.playoff&&!m.so&&m.homeScore===m.awayScore&&!live.pendingLateGoaliePull){
    if(!live.goaliePulledTeamId&&!live.otPullTried){
      if(Math.random()<this.OT_EMPTY_NET_PULL_CHANCE){
        const pulling=Math.random()<.5?live.homeId:live.awayId;live.otPullTried=true;live.otPulledTeamId=pulling;live.goaliePulledTeamId=pulling;
        push({kind:'emptyNet',teamId:pulling,...stamp(),visibleAtMinute:minute,text:`${this.teamById(pulling)?.name} рискует в овертайме и снимает вратаря! Проигрыш в ОТ без шайбы оставит команду без очков.`});
        live.forceUiRender=true;
      }
    }else if(live.otPulledTeamId&&live.goaliePulledTeamId===live.otPulledTeamId&&Math.random()<this.OT_EMPTY_NET_SCORE_CHANCE){
      const scoringId=live.otPulledTeamId===live.homeId?live.awayId:live.homeId,pool=eligible(scoringId),scorer=this.weightedPick(pool,'shooting')||pool[0]||null;
      if(scorer){live.shotStats[scorer.id]=(live.shotStats[scorer.id]||0)+1;if(scoringId===live.homeId)m.homeShots++;else m.awayShots++;}
      m.overtimeEmptyNet=true;
      addGoal(scoringId,scorer,stamp(),{emptyNet:true,shotAlreadyCounted:true,visibleAtMinute:minute,text:'Победная шайба в пустые ворота в овертайме!'});
      this.endLiveMatch(live,minute);return true;
    }
  }

  const liveCounts=manpowerCounts(penaltyEvalSeconds);
  m.liveManpower={home:liveCounts.home,away:liveCounts.away,ppTeamId:liveCounts.home===liveCounts.away?null:liveCounts.home<liveCounts.away?live.awayId:live.homeId,goaliePulledTeamId:live.goaliePulledTeamId||null};
  const sides=[{id:live.homeId,active:live.activeH,exp:live.expectedHome,home:true},{id:live.awayId,active:live.activeA,exp:live.expectedAway,home:false}];
  const waitingForLatePullOutcome=!!live.pendingLateGoaliePull?.activated;
  const waitingForGoaliePull=!!live.pendingLateGoaliePull?.timeoutCalled&&!live.pendingLateGoaliePull?.activated;
  if(!handledLatePull&&!waitingForLatePullOutcome&&!waitingForGoaliePull&&!(live.forcedLateTie&&minute>=59&&minute<=60))for(const side of sides){
    if(minute>60&&m.homeScore!==m.awayScore)break;
    const playStamp=stamp();
    const playSeconds=secondsForStamp(playStamp);
    penaltyEvalSeconds=playSeconds;
    const pendingCall=live.pendingPenaltyCall;
    const pendingAgainstSide=pendingCall&&!pendingCall.coincidental&&(pendingCall.assessments||[]).some(a=>String(a.teamId)===String(side.id)&&a.type!=='penaltyShot');
    if(pendingAgainstSide){
      // The offending team gaining/touching the puck ends a delayed penalty; assess it on this whistle.
      if(minute>Number(pendingCall.createdAtMinute||minute))push({kind:'faceoff',teamId:side.id,period:playStamp.period,time:playStamp.time,stoppage:true,text:'Свисток судьи: команда, нарушившая правила, завладела шайбой. Отложенный штраф зафиксирован.'});
      continue;
    }
    const opponent=side.home?live.awayId:live.homeId;
    const countAtPlay=manpowerCounts(playSeconds);
    const ownMen=side.home?countAtPlay.home:countAtPlay.away,oppMen=side.home?countAtPlay.away:countAtPlay.home;
    const pp=ownMen>oppMen,short=ownMen<oppMen;
    const penaltyTeam=pp?opponent:short?side.id:null;
    const activePenalty=penaltyTeam?activePenalties(penaltyTeam).slice().sort((a,b)=>Number(!!a.coincidental)-Number(!!b.coincidental)||(a.expiresAt-b.expiresAt))[0]:null;
    let unitKey=null;
    if(pp){unitKey=oppMen<=3&&ownMen>=5?'pp1':(activePenalty?.ppUnitKey||'pp1');}
    else if(short){unitKey=ownMen<=3&&oppMen>=5?'pk1':(activePenalty?.pkUnitKey||'pk1');}
    // Track the exact unit used during this opportunity, including the PP1/PK1 preference on 5-on-3.
    if(pp&&activePenalty)syncPenaltyUnitKey(activePenalty,'ppUnitKey',unitKey);
    else if(short&&activePenalty)syncPenaltyUnitKey(activePenalty,'pkUnitKey',unitKey);
    // 4-on-4 always uses ordinary lines. On 4 skaters use 2F+2D; on 3 use 1F+2D.
    const picked=unitKey?selectUnitForManpower(side.id,unitKey,ownMen):side.active;
    let pool=(picked.skaters||[]).filter(p=>p&&!sent(side.id).includes(p.id)&&!(live.injured[side.id]||[]).includes(p.id)&&!this.isPlayerUnavailable(p)&&!penaltyBlocksPlayer(side.id,p.id));
    let forwards=(picked.forwards||[]).filter(p=>pool.some(x=>x.id===p.id));if(pool.length<2)pool=eligible(side.id);if(!forwards.length)forwards=pool.filter(p=>['LW','C','RW'].includes(p.pos));
    const SPM=this.SPECIAL_MODEL_PARAMS;let spFx={shots:1,p:1};if(pp){const oppKey=activePenalty?.pkUnitKey||'pk1';spFx=this.specialPowerFactors(side.id,picked.skaters,opponent,selectUnitForManpower(opponent,oppKey,oppMen).skaters);}
    const overtime=minute>60,__sc=this.liveScenario(live,m),Rt=live.rates,Rs=side.home?Rt.h:Rt.a,__rate=__sc?Math.max(8,Rs.shots*(side.home?1+__sc.F:1-__sc.F)+(side.home?__sc.shift:-__sc.shift)):Rs.shots,OTm=m.playoff?this.MATCH_MODEL_PARAMS.otPo:this.MATCH_MODEL_PARAMS.ot3v3,shotChance=Math.min(.92,__rate/60*this.liveScoreFx(live,m,side.home)*(overtime?OTm.shotMul:1)*(pp?SPM.ppShotMul*spFx.shots:short?SPM.shShotMul:1));if(Math.random()>=shotChance)continue;
    const shooter=this.pickScorerFrom(forwards,pool);if(!shooter)continue;
    live.shotStats[shooter.id]=(live.shotStats[shooter.id]||0)+1;if(side.home)m.homeShots++;else m.awayShots++;recordGoalieShot(opponent);this.liveShotNote(live,side.home,minute);
    const quality=this.clamp(1+(this.playerSkill(shooter,'shooting')-75)*.004,.82,1.12),advantage=pp?1.48:short?.58:1;
    const defendingGoalie=active(opponent).goalie,startingGoalieRating=Number(live.goalieStartingRating[opponent]),currentGoalieRating=goalieRating(defendingGoalie);
    const goalieFactor=Number.isFinite(startingGoalieRating)?this.clamp(1+(startingGoalieRating-currentGoalieRating)*.012,.84,1.16):1;
    let chance=this.clamp(Rs.p*this.FEED_PARAMS.liveGoalCal*(overtime?OTm.pMul*(m.playoff?1+this.MATCH_MODEL_PARAMS.otFatigue.k*Math.max(0,minute-60-this.MATCH_MODEL_PARAMS.otFatigue.start):1):1)*quality*(pp?SPM.ppChanceMul*spFx.p:short?SPM.shChanceMul*(this.tacShMul?this.tacShMul(side.id,opponent):1):1)*goalieFactor,.012,pp?.25:overtime?.28:.145);
    if(__sc&&!overtime){const SC=this.MATCH_MODEL_PARAMS.scn,dg=Math.random()<(side.home?__sc.qH:__sc.qA);chance=Math.min(chance*(dg?SC.hi:SC.lo),pp?.42:.3);if(side.home){__sc.xgH+=chance;if(dg)__sc.dangH++;}else{__sc.xgA+=chance;if(dg)__sc.dangA++;}}
    if(Math.random()<chance){
      const st=playStamp;
      const goalEvent=addGoal(side.id,shooter,st,{powerPlay:pp,shortHanded:short,ppUnitKey:pp?unitKey:null,ppUnitKeyAgainst:short?(activePenalty?.ppUnitKey||null):null,pkUnitKeyFor:short?unitKey:null,pkUnitKeyAgainst:pp?(activePenalty?.pkUnitKey||null):null,ppOpportunityId:pp?activePenalty?.id:null,pkOpportunityId:pp?activePenalty?.id:null,shotAlreadyCounted:true,text:short?'Гол в меньшинстве':pp?'Гол в большинстве':undefined});
      // Only a power-play goal can shorten an eligible opposing minor. Short-handed goals,
      // coincidental minors, queued penalties and five-minute majors never cancel penalties.
      if(pp){
        if(side.home)m.ppGoalsHome=(m.ppGoalsHome||0)+1;else m.ppGoalsAway=(m.ppGoalsAway||0)+1;
        const goalSeconds=secondsForStamp(st);
        const end=live.penalties.filter(p=>String(p.teamId)===String(opponent)&&!p.queued&&penaltyExpirySeconds(p)>goalSeconds&&!p.coincidental&&p.type!=='major'&&p.type!=='majorDkm'&&p.affectsManpower!==false&&(p.type==='minor'||(p.type==='doubleMinor'&&Number(p.segmentNo||1)===1))).sort((a,b)=>penaltyExpirySeconds(a)-penaltyExpirySeconds(b))[0];
        if(end&&end.type==='doubleMinor'){
          goalEvent.pkOpportunityId=end.id;goalEvent.pkUnitKeyAgainst=end.pkUnitKey||goalEvent.pkUnitKeyAgainst;
          end.segmentNo=2;end.segmentsRemaining=1;end.activeStartedAt=minute;end.activeStartedAtSeconds=goalSeconds;end.expiresAtSeconds=goalSeconds+120;end.expiresAt=Math.ceil(end.expiresAtSeconds/60);
          push({kind:'penaltyEnd',teamId:end.teamId,playerId:end.playerId,period:st.period,time:st.time,violation:end.violation,text:`Гол в большинстве сократил первый отрезок двойного малого штрафа. Вторые 2 минуты продолжаются.${teamManpowerSummary(end.teamId)}`});
        }else if(end){
          goalEvent.pkOpportunityId=end.id;goalEvent.pkUnitKeyAgainst=end.pkUnitKey||goalEvent.pkUnitKeyAgainst;
          live.penalties=live.penalties.filter(p=>p.id!==end.id);
          activateQueuedPenalties(end.teamId,goalSeconds);
          push({kind:'penaltyEnd',teamId:end.teamId,playerId:end.playerId,period:st.period,time:st.time,violation:end.violation,text:`Гол в большинстве сократил малый штраф. Игрок возвращается в игру.${teamManpowerSummary(end.teamId)}`});
        }
      }
      if(overtime){this.endLiveMatch(live,minute);return true;}
    }else{this.liveShotNoGoal(live,side,shooter,opponent,playStamp,push,active);}
  }
  this.liveMinuteCounters(live,m,minute,push,stamp,eligible);

  const refreshedCounts=manpowerCounts(penaltyEvalSeconds);
  m.liveManpower={home:refreshedCounts.home,away:refreshedCounts.away,ppTeamId:refreshedCounts.home===refreshedCounts.away?null:refreshedCounts.home<refreshedCounts.away?live.awayId:live.homeId,goaliePulledTeamId:live.goaliePulledTeamId||null};
  const generic=[{kind:'icing',text:'Проброс — вбрасывание в зоне команды',stoppage:true},{kind:'offside',text:'Положение вне игры — свисток судьи',stoppage:true},{kind:'faceoff',text:'Вратарь фиксирует шайбу ловушкой. Свисток судьи — вбрасывание.',stoppage:true}];
  const lastFeedMinute=(m.events||[]).filter(e=>e&&e.kind!=='final').reduce((max,e)=>Math.max(max,this.eventMinute(e)),0);
  const currentFeedMinute=this.eventMinute(this.liveStamp(minute,59));
  const quietGap=Math.max(0,currentFeedMinute-lastFeedMinute);
  const delayedAge=live.pendingPenaltyCall?minute-Number(live.pendingPenaltyCall.createdAtMinute||minute):0;
  const forceDelayedWhistle=!!live.pendingPenaltyCall&&delayedAge>=2;
  const forceQuietAction=quietGap>=5;
  const genericChance=quietGap>=4?.25:.11;
  if(!handledLatePull&&!waitingForGoaliePull&&!waitingForLatePullOutcome&&(forceDelayedWhistle||forceQuietAction||Math.random()<genericChance)){
    let e;
    if(forceDelayedWhistle){
      e={kind:'faceoff',text:'Судья останавливает игру.',stoppage:true};
    }else if(forceQuietAction){
      e=generic[Math.floor(Math.random()*generic.length)];
    }else{
      e=generic[Math.floor(Math.random()*generic.length)];
    }
    const eventTime=stamp();
    push({kind:e.kind,text:e.text,stoppage:!!e.stoppage,teamId:Math.random()<.5?live.homeId:live.awayId,period:eventTime.period,time:eventTime.time});
  }
  if(m.playoff&&m.ot&&minute>60&&(minute-60)%10===0&&m.homeScore===m.awayScore){const n=(minute-60)/10;push({kind:'fatigue',teamId:live.homeId,...stamp(),text:n===1?'Игроки заметно устали: поле открывается, вратари получают больше работы.':n===2?'Овертайм затягивается. Хоккеисты катаются на последних силах.':'Усталость накопилась: любая ошибка может решить серию.'});}
  if(minute===20)push({kind:'intermission',time:'20:00',period:'1П',teamId:live.homeId,text:'Первый период завершён. Перерыв.'});
  if(minute===40)push({kind:'intermission',time:'20:00',period:'2П',teamId:live.homeId,text:'Второй период завершён. Перерыв.'});
  if(minute===60&&m.homeScore===m.awayScore){m.ot=true;m.overtimeEmptyNet=false;live.totalMinutes=m.playoff?80:65;push({kind:'faceoff',text:m.playoff?'Начинается овертайм плей-офф 5 на 5 до первой шайбы.':'Начинается пятиминутный овертайм 3 на 3 до первой шайбы.',teamId:live.homeId,period:'ОТ',time:'00:00'});return false;}
  if(minute===60&&m.homeScore!==m.awayScore){this.endLiveMatch(live,minute);return true;}
  if(minute>60&&m.homeScore!==m.awayScore){this.endLiveMatch(live,minute);return true;}
  if(minute>=65&&minute===(live.totalMinutes||65)&&m.homeScore===m.awayScore&&!m.playoff){live.inShootout=true;m.so=true;live.penalties=[];live.waitingReturns=[];live.shootoutGoals={home:0,away:0};live.shootoutAttempts={home:0,away:0};live.shootoutUsedPlayerIds={home:[],away:[]};live.shootoutFirstTeamId=live.shootoutNextTeamId=Math.random()<.5?live.homeId:live.awayId;m.shootoutFirstTeamId=live.shootoutFirstTeamId;push({kind:'faceoff',teamId:live.shootoutFirstTeamId,period:'Б',time:'00:00',virtualMinute:minute,text:'Овертайм не выявил победителя. Жребий: первыми бросает '+(this.teamById(live.shootoutFirstTeamId)?.name||'команда')+'. Каждая команда исполняет по три броска. Если счёт равный, начинаются дополнительные раунды по одному броску, пока одна из команд не окажется впереди после равного числа бросков.'});return false;}
  if(m.playoff&&minute>=live.totalMinutes&&m.homeScore===m.awayScore){live.totalMinutes=(live.totalMinutes||80)+20;push({kind:'intermission',teamId:live.homeId,period:'ОТ',time:'20:00',virtualMinute:minute,text:'В овертайме нет гола. Начинается следующий дополнительный период до победной шайбы.'});}
  return false;
};
KHLManagerApp.prototype.endLiveMatch = function(live,minute){
  const m=live.simulatedMatch;if(m.events.some(e=>e.kind==='final')){live.finished=true;return true;}
  if(m.homeScore===m.awayScore)return false;
  const winner=m.homeScore>m.awayScore?m.homeId:m.awayId;
  m.events.push({kind:'final',time:minute>60?`${String(minute-60).padStart(2,'0')}:00`:`${String(minute%20||20).padStart(2,'0')}:00`,period:'Итог',finalMinute:minute+.8,teamId:winner,text:m.so?'Победа в серии буллитов':m.ot?(m.overtimeEmptyNet?'Победа в овертайме (гол в пустые ворота)':'Победа в овертайме'):'Матч завершён'});
  m.played=true;live.finished=true;live.totalMinutes=minute;return true;
};

const __v6CompleteLivePrevious=KHLManagerApp.prototype.completeLiveMatch;
KHLManagerApp.prototype.completeLiveMatch=function(live){
  const m=live?.simulatedMatch;
  if(m){m.injuries=m.injuries||[];m.expulsions=m.expulsions||[];}
  __v6CompleteLivePrevious.call(this,live);
  if(m&&this.state){const target=this.state.matches.find(x=>x.id===m.id);if(target){target.injuries=m.injuries||[];target.injuryEvents=(m.injuries||[]).length;this.decrementInjuriesAfterMatch(target);target.events=target.events||[];target.events.sort((a,b)=>this.eventMinute(a)-this.eventMinute(b));const final=target.events.find(e=>e.kind==='final');if(final){target.events=target.events.filter(e=>e!==final);target.events.push(final);}this.persistQuietly();this.renderAll();}}
};

// Live shooter event row must remain visible only when its virtual attempt has occurred.
const __v6RenderMatchCenter=KHLManagerApp.prototype.renderMatchCenter;
KHLManagerApp.prototype.renderMatchCenter=function(){
  const previousShooter=document.getElementById('shootout-player-select')?.value||'';
  __v6RenderMatchCenter.call(this);
  const live=this.liveMatch;
  if(live?.inShootout){
    const score=document.getElementById('match-scoreboard');
    if(score){
      const old=score.querySelector('.live-shootout-score');if(old)old.remove();
      score.insertAdjacentHTML('beforeend',`<div class="notice live-shootout-score" style="margin:.6rem 0;text-align:center"><b>Буллиты: ${live.shootoutGoals.home}:${live.shootoutGoals.away}</b><br><span class="tiny">${(()=>{const at=live.shootoutAttempts||{home:0,away:0},r=Math.max(at.home,at.away);return r>=3?'Дополнительные раунды: по одному броску у каждой команды, пока не определится победитель':'Серия: по три броска у каждой команды. При равном счёте — дополнительные раунды'})()}</span></div>`);
    }
  }
};

KHLManagerApp.prototype.confirmShootoutShooter=function(playerId){
  const live=this.liveMatch,pick=live?.pendingShootoutPick;
  if(!live||!pick||pick.teamId!==this.state?.teamId)return;
  if(!(pick.candidateIds||[]).some(id=>String(id)===String(playerId))){alert('Выбери игрока, который ещё не исполнял буллит в текущем круге.');return;}
  live.pendingShootoutShooterId=playerId;live.pendingShootoutPick=null;live.renderedShootoutPickerKey=null;live.forceUiRender=false;
  this.setNotice('Исполнитель буллита выбран. Серия продолжается.');
  this.renderMatchCenter();
};

// The goal-scoring winner is resolved by randomized individual attempts, not a single random winner event.
const __v6SimulatePlayoffGamePrevious=KHLManagerApp.prototype.simulatePlayoffGame;
KHLManagerApp.prototype.simulatePlayoffGame=function(match){
  if(match?.played||match?.cancelled)return match;
  // Delay recording the series result until the late goalie-pull rule has resolved the final score.
  const recorder=this.recordPlayoffResult;
  this.recordPlayoffResult=function(){};
  let result;
  try{result=__v6SimulatePlayoffGamePrevious.call(this,match);}
  finally{this.recordPlayoffResult=recorder;}
  if(result&&result.played){
    this.applyLateGoaliePullCompleted(result);
    this.maybeAddSimulatedInjury(result);
    this.decrementInjuriesAfterMatch(result);
    result.injuryProcessed=true;
    this.recordPlayoffResult(result);
  }
  return result;
};

// Season archive and final club statistics.
KHLManagerApp.prototype.seasonSummaryData=function(){
  if(!this.state)return null;
  const teamId=this.state.initialTeamId||this.state.teamId,team=this.teamById(teamId),ss=this.state.standings[teamId]||{},regular=this.state.playerStats||{},po=this.state.playoff||{},pstats=po.playerStats||{};
  const roster=this.teamPlayers(teamId).map(p=>{const r=regular[p.id]||{},q=pstats[p.id]||{};return {id:p.id,name:p.name,pos:p.pos,regular:{gp:r.gp||0,g:r.g||0,a:r.a||0,pts:r.pts||0,shots:r.shots||0,plusMinus:r.plusMinus||0,goalieGP:r.goalieGP||0,goalieW:r.goalieW||0,goalieShots:r.goalieShots||0,goalieSaves:r.goalieSaves||0,goalieGA:r.goalieGA||0,shutouts:r.shutouts||0},playoff:{gp:q.gp||0,g:q.g||0,a:q.a||0,pts:q.pts||0,shots:q.shots||0,plusMinus:q.plusMinus||0,goalieGP:q.goalieGP||0,goalieW:q.goalieW||0,goalieShots:q.goalieShots||0,goalieSaves:q.goalieSaves||0,goalieGA:q.goalieGA||0,shutouts:q.shutouts||0}};}).sort((a,b)=>b.regular.pts-a.regular.pts||b.regular.g-a.regular.g||a.name.localeCompare(b.name,'ru'));
  const playoffMatches=(this.state.matches||[]).filter(m=>m.playoff&&m.played&&!m.cancelled&&(m.homeId===teamId||m.awayId===teamId));
  const playoffTeam={gp:playoffMatches.length,w:0,l:0,gf:0,ga:0,ot:playoffMatches.filter(m=>m.ot).length,so:playoffMatches.filter(m=>m.so).length};
  for(const m of playoffMatches){const mine=m.homeId===teamId?m.homeScore:m.awayScore,against=m.homeId===teamId?m.awayScore:m.homeScore;playoffTeam.gf+=mine||0;playoffTeam.ga+=against||0;if(mine>against)playoffTeam.w++;else playoffTeam.l++;}
  const allStages=[...(po.history||[]),...(po.stage&&po.series?.length?[{stage:po.stage,series:po.series}]:[])];
  const involving=allStages.filter(st=>(st.series||[]).some(s=>s.teamA===teamId||s.teamB===teamId));
  const last=involving.length?involving[involving.length-1]:null;
  let playoffFinish='Не вышел в плей-офф';
  if(po.championId===teamId)playoffFinish='Обладатель Кубка Гагарина';
  else if(last){const s=last.series.find(s=>s.teamA===teamId||s.teamB===teamId);playoffFinish=s?.winnerId===teamId?'Прошёл дальше':`${this.playoffStageName(last.stage)} · вылет`;
  }
  const seasonStart=2026+Math.max(0,(this.state.seasonNumber||1)-1),seasonLabel=`${seasonStart}/${String(seasonStart+1).slice(-2)}`;
  return {teamId,teamName:team?.name||teamId,seasonNumber:this.state.seasonNumber||1,seasonLabel,championId:po.championId||null,championName:this.teamById(po.championId)?.name||null,playoffFinish,team:{gp:ss.gp||0,w:ss.w||0,regw:ss.regw||0,otw:ss.otw||0,sow:ss.sow||0,l:ss.l||0,otl:ss.otl||0,sol:ss.sol||0,pp:ss.pp||0,pts:ss.pts||0,gf:ss.gf||0,ga:ss.ga||0},playoffTeam,roster};
};
KHLManagerApp.prototype.renderFinalSeasonStatsHtml=function(){
  const sum=this.seasonSummaryData();if(!sum)return '';
  const t=sum.team;
  const skaters=sum.roster.filter(p=>p.pos!=='G');
  const table=`<div class="table-wrap"><table class="data-table" style="min-width:930px"><thead><tr><th rowspan="2">Игрок</th><th rowspan="2">Поз.</th><th colspan="4" style="text-align:center">Регулярный чемпионат</th><th colspan="4" style="text-align:center">Кубок Гагарина</th><th colspan="3" style="text-align:center">Всего</th></tr><tr><th class="numeric">И</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th><th class="numeric">И</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th></tr></thead><tbody>${skaters.map(p=>`<tr><td class="team-cell">${this.escape(p.name)}</td><td>${this.positionLabel(p.pos)}</td><td class="numeric">${p.regular.gp}</td><td class="numeric">${p.regular.g}</td><td class="numeric">${p.regular.a}</td><td class="numeric"><b>${p.regular.pts}</b></td><td class="numeric">${p.playoff.gp}</td><td class="numeric">${p.playoff.g}</td><td class="numeric">${p.playoff.a}</td><td class="numeric"><b>${p.playoff.pts}</b></td><td class="numeric">${p.regular.g+p.playoff.g}</td><td class="numeric">${p.regular.a+p.playoff.a}</td><td class="numeric"><b>${p.regular.pts+p.playoff.pts}</b></td></tr>`).join('')}</tbody></table></div>`;
  const goalies=sum.roster.filter(p=>p.pos==='G');
  const pct=(saves,shots)=>shots?`${(saves/shots*100).toFixed(1)}%`:'—';
  const goalieTable=`<div class="table-wrap"><table class="data-table" style="min-width:1260px"><thead><tr><th rowspan="2">Вратарь</th><th colspan="5" style="text-align:center">Регулярный чемпионат</th><th colspan="5" style="text-align:center">Кубок Гагарина</th><th colspan="5" style="text-align:center">Всего</th></tr><tr><th class="numeric">И</th><th class="numeric">Сэйвы</th><th class="numeric">% отраж.</th><th class="numeric">ПШ</th><th class="numeric">СО</th><th class="numeric">И</th><th class="numeric">Сэйвы</th><th class="numeric">% отраж.</th><th class="numeric">ПШ</th><th class="numeric">СО</th><th class="numeric">И</th><th class="numeric">Сэйвы</th><th class="numeric">% отраж.</th><th class="numeric">ПШ</th><th class="numeric">СО</th></tr></thead><tbody>${goalies.map(p=>`<tr><td class="team-cell">${this.escape(p.name)}</td><td class="numeric">${p.regular.goalieGP}</td><td class="numeric">${p.regular.goalieSaves}</td><td class="numeric">${pct(p.regular.goalieSaves,p.regular.goalieShots)}</td><td class="numeric">${p.regular.goalieGA}</td><td class="numeric">${p.regular.shutouts}</td><td class="numeric">${p.playoff.goalieGP}</td><td class="numeric">${p.playoff.goalieSaves}</td><td class="numeric">${pct(p.playoff.goalieSaves,p.playoff.goalieShots)}</td><td class="numeric">${p.playoff.goalieGA}</td><td class="numeric">${p.playoff.shutouts}</td><td class="numeric">${p.regular.goalieGP+p.playoff.goalieGP}</td><td class="numeric">${p.regular.goalieSaves+p.playoff.goalieSaves}</td><td class="numeric">${pct(p.regular.goalieSaves+p.playoff.goalieSaves,p.regular.goalieShots+p.playoff.goalieShots)}</td><td class="numeric">${p.regular.goalieGA+p.playoff.goalieGA}</td><td class="numeric">${p.regular.shutouts+p.playoff.shutouts}</td></tr>`).join('')}</tbody></table></div>`;
  return `<section class="card season-final-summary" style="margin-top:1rem"><div class="eyebrow">Итоги сезона · клуб, выбранный в начале карьеры</div><h2 style="margin:.35rem 0">${this.escape(sum.teamName)}</h2><p class="muted">Регулярный чемпионат: ${t.gp} матчей · ${t.w} побед · ${t.l} поражений в основное время · ${t.otl} поражений в ОТ · ${t.sol} поражений по буллитам · ${t.pts} очков · шайбы ${t.gf}:${t.ga}.</p><p class="muted">Плей-офф: ${sum.playoffTeam.gp} матчей · ${sum.playoffTeam.w} побед · ${sum.playoffTeam.l} поражений · шайбы ${sum.playoffTeam.gf}:${sum.playoffTeam.ga} · ОТ: ${sum.playoffTeam.ot} · серии буллитов: ${sum.playoffTeam.so}.</p><div class="metric-row" style="margin:.8rem 0">${[['Матчи',t.gp],['Очки',t.pts],['Шайбы',`${t.gf}:${t.ga}`],['Плей-офф',sum.playoffFinish]].map(([a,b])=>`<div class="metric"><div class="label">${a}</div><div class="value" style="font-size:${String(b).length>14?'.9rem':'1.35rem'}">${this.escape(b)}</div></div>`).join('')}</div><div class="section-head"><div><h3>Полная статистика состава</h3><p class="small muted">Регулярный чемпионат и Кубок Гагарина приведены раздельно. Вратари вынесены отдельно.</p></div></div>${table}<div class="section-head"><div><h3>Статистика вратарей</h3></div></div>${goalieTable}<div class="toolbar" style="margin-top:1rem"><button class="btn btn-primary" onclick="app.startAnotherSeason()">🔄 Начать сезон за другой клуб</button><button class="btn btn-quiet" onclick="app.exportSave()">⇩ Экспортировать завершённый сезон</button></div><p class="tiny muted" style="margin-top:.7rem">Перед переходом к новой карьере завершённая статистика будет помещена в архив сезонов.</p></section>`;
};

KHLManagerApp.prototype.startAnotherSeason=function(){
  if(!this.state?.playoff?.completed){alert('Новый сезон за другой клуб доступен после завершения Кубка Гагарина.');return;}
  const previous=this.state.initialTeamId||this.state.teamId;this.archiveCompletedSeason();this.previousSeasonTeamId=previous;this.requireDifferentTeam=true;
  this.loadTeamOptions();const sel=document.getElementById('select-team');const alternate=this.db.teams.find(t=>t.id!==previous);if(sel&&alternate)sel.value=alternate.id;
  this.showScreen('screen-wizard');this.previewTeam();
  const preview=document.getElementById('team-preview');if(preview)preview.insertAdjacentHTML('afterbegin',`<div class="notice" style="margin-bottom:.7rem">🏒 Сезон ${this.state.seasonNumber||1} завершён и помещён в архив. Выбери новый клуб, отличный от ${this.escape(this.teamById(previous)?.name||'предыдущей команды')}.</div>`);
};
const __v6InitCareerPrevious=KHLManagerApp.prototype.initNewCareer;
KHLManagerApp.prototype.initNewCareer=function(){
  const chosen=document.getElementById('select-team')?.value;
  if(this.requireDifferentTeam&&chosen===this.previousSeasonTeamId){alert('Для нового сезона выбери другой клуб.');return;}
  __v6InitCareerPrevious.call(this);
  if(this.state){this.state.initialTeamId=this.state.teamId;this.state.seasonNumber=(this.state.seasonNumber||1);this.state.seasonHistoryArchived=false;this.requireDifferentTeam=false;this.persistQuietly();}
};
KHLManagerApp.prototype.renderSeasonArchives=function(){
  const root=document.getElementById('season-history-list');if(!root)return;
  let history=[];try{history=JSON.parse(localStorage.getItem(this.storageKey+'_season_history')||'[]');if(!Array.isArray(history))history=[];}catch(e){history=[];}
  if(!history.length){root.innerHTML='<div class="card"><div class="empty">Завершённые сезоны появятся здесь после финала Кубка Гагарина и перехода к новой карьере.</div></div>';return;}
  root.innerHTML=history.map((s,i)=>{const t=s.team||{};return `<article class="card" style="margin-bottom:.7rem"><div class="section-head" style="margin-top:0"><div><h3>${i+1}. ${this.escape(s.teamName||'Клуб')} · ${this.escape(s.seasonLabel||'Сезон')}</h3><p class="small muted">${this.escape(s.playoffFinish||'')}${s.championName?` · Кубок Гагарина: ${this.escape(s.championName)}`:''}</p></div><span class="badge gold">${t.pts||0} очков</span></div><p class="small">${t.gp||0} матчей · ${t.w||0} побед · шайбы ${t.gf||0}:${t.ga||0} · плей-офф ${s.playoffTeam?.w||0}-${s.playoffTeam?.l||0} · ${s.roster?.length||0} игроков в отчёте</p><details><summary>Открыть полную статистику состава</summary><div class="table-wrap" style="margin-top:.7rem"><table class="data-table" style="min-width:760px"><thead><tr><th>Игрок</th><th>Поз.</th><th class="numeric">И (рег.)</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th><th class="numeric">И (ПО)</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th></tr></thead><tbody>${(s.roster||[]).map(p=>`<tr><td>${this.escape(p.name)}</td><td>${this.positionLabel(p.pos)}</td><td class="numeric">${p.regular?.gp||0}</td><td class="numeric">${p.regular?.g||0}</td><td class="numeric">${p.regular?.a||0}</td><td class="numeric">${p.regular?.pts||0}</td><td class="numeric">${p.playoff?.gp||0}</td><td class="numeric">${p.playoff?.g||0}</td><td class="numeric">${p.playoff?.a||0}</td><td class="numeric">${p.playoff?.pts||0}</td></tr>`).join('')}</tbody></table></div></details></article>`;}).join('');
};
const __v6RenderAllPrevious=KHLManagerApp.prototype.renderAll;
KHLManagerApp.prototype.renderAll=function(){__v6RenderAllPrevious.call(this);if(this.state)this.renderSeasonArchives();};


// Mobile Edition 7.2: reorganized league statistics and move full season report out of playoffs.
// 9.1.0: порог для таблицы «Вратари лиги» — 30% матчей (минимум 1), растёт вместе с сезоном.
KHLManagerApp.prototype.goalieQualifyGames=function(){const gp=Object.values(this.state?.standings||{}).reduce((m,t)=>Math.max(m,t.gp||0),0);return Math.max(1,Math.ceil(gp*0.3));};
KHLManagerApp.prototype.renderStats = function(){
  if(!this.state)return;
  const playerMap = new Map();
  for(const p of this.db.players){
    const regular=this.state.playerStats?.[p.id]||{};
    const playoff=this.state.playoff?.playerStats?.[p.id]||{};
    const sum=(key)=>Number(regular[key]||0)+Number(playoff[key]||0);
    playerMap.set(p.id,{...p,
      gp:sum('gp'),g:sum('g'),a:sum('a'),pts:sum('pts'),shots:sum('shots'),plusMinus:sum('plusMinus'),
      goalieGP:sum('goalieGP'),goalieW:sum('goalieW'),goalieShots:sum('goalieShots'),goalieSaves:sum('goalieSaves'),goalieGA:sum('goalieGA'),shutouts:sum('shutouts'),
    });
  }
  const skaters=[...playerMap.values()].filter(p=>p.pos!=='G'&&p.gp>0);
  const teamName=(p)=>this.escape(this.teamById(p.teamId)?.name||'—');
  const playerName=(p)=>this.escape(p.name||'—');
  const renderTable=(rows,headers,renderRow,minWidth=360)=>rows.length
    ? `<div class="table-wrap"><table class="data-table sortable-stats-table" style="min-width:${minWidth}px"><thead><tr>${headers.map(h=>`<th${h.numeric?' class="numeric"':''}>${h.sort===false?h.label:`<button type="button" class="stats-sort-trigger" data-label="${this.escape(h.label)}" data-sort-type="${h.type|| (h.numeric?'num':'text')}" onclick="app.sortStatsTable(this)" aria-label="Сортировать по столбцу ${this.escape(h.label)}">${h.label} <span aria-hidden="true">↕</span></button>`}</th>`).join('')}</tr></thead><tbody>${rows.map((p,i)=>renderRow(p,i)).join('')}</tbody></table></div>`
    : '<div class="empty">Статистика появится после первых матчей.</div>';
  const scorers=skaters.slice().sort((a,b)=>b.pts-a.pts||b.g-a.g||b.a-a.a||a.name.localeCompare(b.name,'ru')).slice(0,15);
  const goals=skaters.slice().sort((a,b)=>b.g-a.g||b.pts-a.pts||a.name.localeCompare(b.name,'ru')).slice(0,15);
  const assists=skaters.slice().sort((a,b)=>b.a-a.a||b.pts-a.pts||a.name.localeCompare(b.name,'ru')).slice(0,15);
  const scoringHeaders=[{label:'#',sort:false},{label:'Игрок',type:'text'},{label:'Поз.',type:'text'},{label:'Клуб',type:'text'},{label:'Г+П',numeric:true},{label:'Г',numeric:true},{label:'П',numeric:true},{label:'И',numeric:true}];
  document.getElementById('league-scorers').innerHTML=renderTable(scorers,scoringHeaders,(p,i)=>`<tr class="${p.teamId===this.state.teamId?'user-row':''}"><td>${i+1}</td><td class="team-cell">${playerName(p)}</td><td>${this.escape(this.positionLabel(p.pos))}</td><td>${teamName(p)}</td><td class="numeric"><b>${p.pts}</b></td><td class="numeric">${p.g}</td><td class="numeric">${p.a}</td><td class="numeric">${p.gp}</td></tr>`,690);
  const simplifiedHeaders=(statLabel)=>[{label:'#',sort:false},{label:'Игрок',type:'text'},{label:'Поз.',type:'text'},{label:'Клуб',type:'text'},{label:statLabel,numeric:true},{label:'И',numeric:true}];
  document.getElementById('league-goals').innerHTML=renderTable(goals,simplifiedHeaders('Г'),(p,i)=>`<tr class="${p.teamId===this.state.teamId?'user-row':''}"><td>${i+1}</td><td class="team-cell">${playerName(p)}</td><td>${this.escape(this.positionLabel(p.pos))}</td><td>${teamName(p)}</td><td class="numeric"><b>${p.g}</b></td><td class="numeric">${p.gp}</td></tr>`,570);
  document.getElementById('league-assists').innerHTML=renderTable(assists,simplifiedHeaders('П'),(p,i)=>`<tr class="${p.teamId===this.state.teamId?'user-row':''}"><td>${i+1}</td><td class="team-cell">${playerName(p)}</td><td>${this.escape(this.positionLabel(p.pos))}</td><td>${teamName(p)}</td><td class="numeric"><b>${p.a}</b></td><td class="numeric">${p.gp}</td></tr>`,570);
  const minGoalieGP=this.goalieQualifyGames();const thrEl=document.getElementById('goalie-thr');if(thrEl)thrEl.textContent=`(от ${minGoalieGP} ${minGoalieGP%10===1&&minGoalieGP%100!==11?'игры':'игр'})`;
  const goalies=[...playerMap.values()].filter(p=>p.pos==='G'&&p.goalieGP>=minGoalieGP&&p.goalieGP>0).map(p=>({...p,savePct:p.goalieSaves/Math.max(1,p.goalieShots)})).sort((a,b)=>b.savePct-a.savePct||b.goalieGP-a.goalieGP||a.name.localeCompare(b.name,'ru')).slice(0,15);
  document.getElementById('goalie-stats').innerHTML=renderTable(goalies,[{label:'#',sort:false},{label:'Вратарь',type:'text'},{label:'Клуб',type:'text'},{label:'И',numeric:true},{label:'Сэйвы',numeric:true},{label:'% отраж.',numeric:true,type:'num'},{label:'ПШ',numeric:true},{label:'КН',numeric:true,type:'num'},{label:'СО',numeric:true}],(p,i)=>`<tr class="${p.teamId===this.state.teamId?'user-row':''}"><td>${i+1}</td><td class="team-cell">${playerName(p)}</td><td>${teamName(p)}</td><td class="numeric">${p.goalieGP}</td><td class="numeric">${p.goalieSaves}</td><td class="numeric"><b>${(p.savePct*100).toFixed(1)}%</b></td><td class="numeric">${p.goalieGA}</td><td class="numeric">${(p.goalieGA/Math.max(1,p.goalieGP)).toFixed(2).replace('.',',')}</td><td class="numeric">${p.shutouts||0}</td></tr>`,680);

  const teamId=this.state.initialTeamId||this.state.teamId;
  const clubPlayers=this.db.players.filter(p=>p.teamId===teamId);
  const clubSkaters=clubPlayers.filter(p=>p.pos!=='G').map(p=>({p,r:this.state.playerStats?.[p.id]||{},q:this.state.playoff?.playerStats?.[p.id]||{}}))
    .sort((a,b)=>((b.r.pts||0)+(b.q.pts||0))-((a.r.pts||0)+(a.q.pts||0))||((b.r.g||0)+(b.q.g||0))-((a.r.g||0)+(a.q.g||0))||a.p.name.localeCompare(b.p.name,'ru'));
  const skaterTable=`<div class="table-wrap"><table class="data-table sortable-stats-table" data-no-rank="1" style="min-width:930px"><thead><tr><th rowspan="2"><button type="button" class="stats-sort-trigger" data-label="Игрок" data-sort-type="text" onclick="app.sortStatsTable(this)" aria-label="Сортировать по столбцу Игрок">Игрок <span aria-hidden="true">↕</span></button></th><th rowspan="2"><button type="button" class="stats-sort-trigger" data-label="Поз." data-sort-type="text" onclick="app.sortStatsTable(this)" aria-label="Сортировать по столбцу Поз.">Поз. <span aria-hidden="true">↕</span></button></th><th colspan="4" style="text-align:center">Регулярный чемпионат</th><th colspan="4" style="text-align:center">Кубок Гагарина</th><th colspan="3" style="text-align:center">Всего</th></tr><tr><th class="numeric">И</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th><th class="numeric">И</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th><th class="numeric">Г</th><th class="numeric">П</th><th class="numeric">О</th></tr></thead><tbody>${clubSkaters.map(({p,r,q})=>`<tr><td class="team-cell">${playerName(p)}</td><td data-sort-value="${({LW:0,C:1,RW:2,D:3,G:4})[p.pos]}">${this.escape(this.positionLabel(p.pos))}</td><td class="numeric">${r.gp||0}</td><td class="numeric">${r.g||0}</td><td class="numeric">${r.a||0}</td><td class="numeric"><b>${r.pts||0}</b></td><td class="numeric">${q.gp||0}</td><td class="numeric">${q.g||0}</td><td class="numeric">${q.a||0}</td><td class="numeric"><b>${q.pts||0}</b></td><td class="numeric">${(r.g||0)+(q.g||0)}</td><td class="numeric">${(r.a||0)+(q.a||0)}</td><td class="numeric"><b>${(r.pts||0)+(q.pts||0)}</b></td></tr>`).join('')}</tbody></table></div>`;
  const clubGoalies=clubPlayers.filter(p=>p.pos==='G').map(p=>({p,r:this.state.playerStats?.[p.id]||{},q:this.state.playoff?.playerStats?.[p.id]||{}}));
  const pct=(saves,shots)=>shots?`${(saves/shots*100).toFixed(1)}%`:'—';
  const goalieTable=clubGoalies.length?`<div class="table-wrap"><table class="data-table sortable-stats-table" data-no-rank="1" style="min-width:1260px"><thead><tr><th rowspan="2"><button type="button" class="stats-sort-trigger" data-label="Вратарь" data-sort-type="text" onclick="app.sortStatsTable(this)" aria-label="Сортировать по столбцу Вратарь">Вратарь <span aria-hidden="true">↕</span></button></th><th colspan="5" style="text-align:center">Регулярный чемпионат</th><th colspan="5" style="text-align:center">Кубок Гагарина</th><th colspan="5" style="text-align:center">Всего</th></tr><tr><th class="numeric">И</th><th class="numeric">Сэйвы</th><th class="numeric">% отраж.</th><th class="numeric">ПШ</th><th class="numeric">СО</th><th class="numeric">И</th><th class="numeric">Сэйвы</th><th class="numeric">% отраж.</th><th class="numeric">ПШ</th><th class="numeric">СО</th><th class="numeric">И</th><th class="numeric">Сэйвы</th><th class="numeric">% отраж.</th><th class="numeric">ПШ</th><th class="numeric">СО</th></tr></thead><tbody>${clubGoalies.map(({p,r,q})=>`<tr><td class="team-cell">${playerName(p)}</td><td class="numeric">${r.goalieGP||0}</td><td class="numeric">${r.goalieSaves||0}</td><td class="numeric">${pct(r.goalieSaves||0,r.goalieShots||0)}</td><td class="numeric">${r.goalieGA||0}</td><td class="numeric">${r.shutouts||0}</td><td class="numeric">${q.goalieGP||0}</td><td class="numeric">${q.goalieSaves||0}</td><td class="numeric">${pct(q.goalieSaves||0,q.goalieShots||0)}</td><td class="numeric">${q.goalieGA||0}</td><td class="numeric">${q.shutouts||0}</td><td class="numeric">${(r.goalieGP||0)+(q.goalieGP||0)}</td><td class="numeric">${(r.goalieSaves||0)+(q.goalieSaves||0)}</td><td class="numeric">${pct((r.goalieSaves||0)+(q.goalieSaves||0),(r.goalieShots||0)+(q.goalieShots||0))}</td><td class="numeric">${(r.goalieGA||0)+(q.goalieGA||0)}</td><td class="numeric">${(r.shutouts||0)+(q.shutouts||0)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Вратари клуба не найдены.</div>';
  document.getElementById('team-stats').innerHTML=`<div class="section-head"><div><h3>Полная статистика состава</h3><p class="small muted">Регулярный чемпионат и Кубок Гагарина приведены раздельно. Вратари вынесены отдельно.</p></div></div>${skaterTable}<div class="section-head"><div><h3>Статистика вратарей</h3></div></div>${goalieTable}`;
  const finalRoot=document.getElementById('team-season-summary');
  if(finalRoot){
    if(this.state.playoff?.completed){
      const sum=this.seasonSummaryData(),t=sum?.team;
      finalRoot.innerHTML=sum?`<section class="card season-final-summary" style="margin-top:1rem"><div class="eyebrow">Итоги сезона · клуб, выбранный в начале карьеры</div><h3 style="margin:.35rem 0">${this.escape(sum.teamName)}</h3><p class="muted">Регулярный чемпионат: ${t.gp} матчей · ${t.w} побед · ${t.pts} очков · шайбы ${t.gf}:${t.ga}.</p><p class="muted">Плей-офф: ${sum.playoffTeam.gp} матчей · ${sum.playoffTeam.w} побед · ${sum.playoffTeam.l} поражений · шайбы ${sum.playoffTeam.gf}:${sum.playoffTeam.ga} · итог: ${this.escape(sum.playoffFinish)}.</p><div class="toolbar" style="margin-top:1rem"><button class="btn btn-primary" onclick="app.startAnotherSeason()">🔄 Начать сезон за другой клуб</button><button class="btn btn-quiet" onclick="app.exportSave()">⇩ Экспортировать завершённый сезон</button></div><p class="tiny muted" style="margin-top:.7rem">Перед переходом к новой карьере завершённая статистика будет помещена в архив сезонов.</p></section>`:'';
    }else finalRoot.innerHTML='';
  }
  if(typeof this.renderSeasonArchives==='function')this.renderSeasonArchives();
};

// Completed Cup banner now sends the player to the new league/team statistics sections.

KHLManagerApp.prototype.sortStatsTable=function(button){
  const table=button?.closest('table'); if(!table) return;
  const th=button.closest('th'); const index=Array.from(th.parentElement.children).indexOf(th);
  const type=button.dataset.sortType||'num';
  const key=String(index); const prev=table.dataset.sortColumn;
  const direction=prev===key?(table.dataset.sortDirection==='desc'?'asc':'desc'):(type==='text'?'asc':'desc');
  const tbody=table.tBodies[0]; if(!tbody) return;
  const rows=Array.from(tbody.rows);
  const value=(row)=>{
    const cell=row.cells[index]; const text=String(cell?.dataset?.sortValue??(cell?.textContent||'')).trim().replace(/%/g,'').replace(/,/g,'.');
    if(type==='num'){const n=Number(text);return Number.isFinite(n)?n:0;}
    return text.toLocaleLowerCase('ru');
  };
  rows.sort((a,b)=>{const av=value(a),bv=value(b);const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'ru');return direction==='desc'?-cmp:cmp;});
  rows.forEach((row,i)=>{tbody.appendChild(row); if(!table.dataset.noRank&&index!==0&&row.cells[0])row.cells[0].textContent=String(i+1);});
  table.dataset.sortColumn=key;table.dataset.sortDirection=direction;
  table.querySelectorAll('thead th').forEach(h=>h.classList.toggle('sorted',h===th));
  table.querySelectorAll('.stats-sort-trigger').forEach(btn=>{const label=btn.dataset.label||btn.textContent.replace(/[↕▲▼]/g,'').trim();btn.innerHTML=`${label} <span aria-hidden="true">${btn===button?(direction==='desc'?'▼':'▲'):'↕'}</span>`;});
};

const app=new KHLManagerApp();
// Empty-net overtime tuning (live engine): chance per OT minute that a team gambles, and chance per minute the opponent hits the empty net.
KHLManagerApp.prototype.OT_EMPTY_NET_PULL_CHANCE=0.03;
KHLManagerApp.prototype.OT_EMPTY_NET_SCORE_CHANCE=0.5;
