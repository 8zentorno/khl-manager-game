/* KHL Manager 8.13 — цели регулярного чемпионата: шесть целей, награда по сложности,
   порог зависит от силы клуба, рекомендация совета директоров и новые тексты окна выбора. */
(function(){
  const proto=KHLManagerApp.prototype;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const TIERS={easy:{label:'лёгкая',good:2,bad:-8},mid:{label:'средняя',good:4,bad:-8},hard:{label:'сложная',good:7,bad:-5}};
  const GA_LIMIT=175,DEVELOP_N=10,WINS_BASE=30,GAMES_BASE=68;
  // Цели в списке выбора. «Старые» типы нужны только для уже начатых сохранений.
  const LIST=['playoffs','points','wins','top4','develop','first'];
  const LEGACY=['points90','develop3','defense'];

  proto.objectivePower=function(teamId){
    const pl=(this.teamPlayers(teamId)||[]).map(p=>({pos:p.pos,o:Number(this.permanentOVR(p))||0}));
    const sk=pl.filter(p=>p.pos!=='G').map(p=>p.o).sort((a,b)=>b-a).slice(0,18);
    const g=pl.filter(p=>p.pos==='G').map(p=>p.o).sort((a,b)=>b-a)[0]||70;
    return (sk.reduce((s,v)=>s+v,0)+g*3)/(sk.length+3);
  };
  // Место клуба по силе среди клубов своей конференции (1 = сильнейший).
  proto.objectivePowerRank=function(){
    const me=this.teamById(this.state.teamId),conf=this.db.teams.filter(t=>t.conf===me?.conf);
    const pw=conf.map(t=>[t.id,this.objectivePower(t.id)]).sort((a,b)=>b[1]-a[1]);
    return pw.findIndex(x=>x[0]===this.state.teamId)+1;
  };
  proto.userRegularTotal=function(){
    return Math.max(1,(this.state?.matches||[]).filter(m=>!m.playoff&&!m.cancelled&&(m.homeId===this.state.teamId||m.awayId===this.state.teamId)).length);
  };
  // Порог цели: сохранённый в цели или рассчитанный сейчас.
  proto.objectiveTarget=function(type,obj){
    if(obj&&obj.target!=null&&obj.type===type)return obj.target;
    switch(type){
      case'points':{const r=this.objectivePowerRank();return r<=2?105:r<=6?90:75;}
      case'points90':return 90;
      case'wins':return Math.round(WINS_BASE*this.userRegularTotal()/GAMES_BASE);
      case'develop':return DEVELOP_N;
      case'develop3':return 3;
      case'defense':return GA_LIMIT;
      default:return null;
    }
  };
  const tierKey=(type,t)=>type==='points'||type==='points90'?(t<=78?'easy':t>=100?'hard':'mid'):
    type==='playoffs'?'easy':type==='first'?'hard':'mid';
  proto.objectiveTier=function(type,target){
    if(target==null)target=this.state?this.objectiveTarget(type,this.state.teamObjective):null;
    return TIERS[tierKey(type,target)];
  };
  const nameOf=(app,type,t)=>({
    playoffs:'Попасть в плей-офф — топ-8 конференции',
    top4:'Занять топ-4 конференции',
    first:'Выиграть конференцию',
    points:`Набрать ${t} очков в регулярном сезоне`,points90:'Набрать 90 очков в регулярном сезоне',
    wins:`Выиграть минимум ${t} матчей в основное время и овертайме`,
    develop:`Развить минимум ${t} игроков на +1 OVR`,develop3:'Развить минимум 3 игроков на +1 OVR',
    defense:`Лучшая оборона: пропустить не больше ${t} шайб`
  })[type]||'Попасть в плей-офф — топ-8 конференции';
  const descOf=(app,type,t)=>({
    playoffs:'Закончить регулярный чемпионат в восьмёрке своей конференции.',
    top4:'Закончить регулярный чемпионат в четвёрке сильнейших своей конференции и получить преимущество в плей-офф.',
    first:'Закончить регулярный чемпионат на первом месте в своей конференции.',
    points:`Порог зависит от силы клуба: 75 очков для клубов из нижней части таблицы, 90 для середняков и 105 для фаворитов. Для твоего клуба ${t}.`,
    wins:`Победы считаются в основное время и в овертайме, победы по буллитам не идут в счёт. Порог пересчитывается под число матчей сезона (${WINS_BASE} из ${GAMES_BASE}).`,
    develop:`К концу сезона ${t} игроков должны прибавить к постоянному рейтингу. Помогут тренировки и игровое время молодёжи.`,
    points90:'Набрать 90 очков за регулярный чемпионат.',
    develop3:'Минимум трое игроков должны прибавить к постоянному рейтингу.',
    defense:`Пропустить не больше ${GA_LIMIT} шайб за регулярный чемпионат.`
  })[type]||'';
  proto.OBJECTIVE_TYPES=LIST;
  proto.regularObjectiveOptions=function(){
    if(!this.state)return LIST.map(t=>[t,nameOf(this,t,null)]);
    return LIST.map(t=>[t,nameOf(this,t,this.objectiveTarget(t,null))]);
  };
  proto.regularObjectiveName=function(type){
    const obj=this.state?.teamObjective;return nameOf(this,type,this.objectiveTarget(type,obj&&obj.type===type?obj:null));
  };
  proto.objectiveRewardText=function(type){
    const t=this.objectiveTier(type,this.objectiveTarget(type,this.state?.teamObjective));
    return `Сложность: ${t.label}. Выполнение: мораль +${t.good}. Провал: мораль ${t.bad}.`;
  };
  proto.recommendedObjective=function(){
    if(!this.state)return 'playoffs';
    const r=this.objectivePowerRank();
    return r<=3?'top4':r<=7?'playoffs':r<=9?'points':'develop';
  };

  // ----- прогресс и итог для целей, которых нет в базовой игре -----
  const baseInfo=proto.teamObjectiveInfo;
  const NEW=['points','wins','develop','defense','first'];
  proto.teamObjectiveInfo=function(){
    const obj=this.state?.teamObjective||{type:'playoffs'},type=obj.type||'playoffs';
    if(!NEW.includes(type))return baseInfo.call(this);
    const sid=this.state.teamId,rank=this.conferenceRank(sid),confTeams=this.db.teams.filter(t=>t.conf===this.teamById(sid)?.conf).length;
    const ss=this.state.standings[sid]||{},played=ss.gp||0,total=this.userRegularTotal(),target=this.objectiveTarget(type,obj);
    const grown=this.teamPlayers(sid).filter(p=>(this.playerDev(p)?.growth||0)>=1).length;
    let title,status,progress,success;
    if(type==='points'){
      const pts=ss.pts||0;title=`Набрать ${target} очков`;
      status=`${pts} из ${target} очков в регулярном сезоне.`;progress=clamp(pts/target*100,0,100);success=pts>=target;
    }else if(type==='wins'){
      const w=(ss.regw||0)+(ss.otw||0);title=`Выиграть ${target} матчей`;
      status=played?`Побед в основное время и овертайме: ${w} из ${target}, темп на сезон: ${Math.round(w/played*total)}.`:`Нужно ${target} побед в основное время и овертайме.`;
      progress=clamp(w/target*100,0,100);success=w>=target;
    }else if(type==='develop'){
      title=`Развить ${target} игроков`;status=`Игроков с постоянным ростом рейтинга: ${grown} из ${target}.`;
      progress=clamp(grown/target*100,0,100);success=grown>=target;
    }else if(type==='defense'){
      const ga=ss.ga||0,pace=played?Math.round(ga/played*total):0;title='Лучшая оборона';
      status=played?`Пропущено ${ga} шайб за ${played} матчей, темп на сезон: ${pace} из ${GA_LIMIT}.`:`Нужно пропустить не больше ${GA_LIMIT} шайб за регулярный чемпионат.`;
      progress=played?clamp((GA_LIMIT*1.25-pace)/(GA_LIMIT*.25)*100,0,100):0;success=ga<=GA_LIMIT;
    }else{
      title='Выиграть конференцию';
      status=played?`Текущее место: ${rank}-е из ${confTeams}; нужно первое.`:'Сезон только начинается. После первых матчей появится положение в конференции.';
      progress=played?clamp((confTeams+1-rank)/confTeams*100,0,100):0;success=rank<=1;
    }
    if(obj.evaluated)status=obj.completed?`✅ Цель выполнена. ${status}`:`⚠️ Цель не выполнена. ${status}`;
    return {type,title,status,progress:Math.round(progress),success,played,grown,points:ss.pts||0,rank};
  };

  // ----- порог фиксируется в момент выбора цели -----
  const freeze=app=>{const o=app.state?.teamObjective;if(o&&o.selected&&o.target==null){const t=app.objectiveTarget(o.type,null);if(t!=null)o.target=t;}};
  ['confirmRegularObjectiveChoice','setTeamObjective'].forEach(name=>{
    const base=proto[name];if(typeof base!=='function')return;
    proto[name]=function(){const r=base.apply(this,arguments);try{freeze(this);}catch(e){}return r;};
  });

  // ----- итоговая мораль по сложности -----
  const baseEval=proto.evaluateTeamObjective;
  proto.evaluateTeamObjective=function(){
    const was=!!this.state?.teamObjective?.evaluated;
    baseEval.apply(this,arguments);
    const obj=this.state?.teamObjective;
    if(was||!obj||!obj.evaluated||obj.tierApplied)return;
    obj.tierApplied=true;
    const t=this.objectiveTier(obj.type,this.objectiveTarget(obj.type,obj)),base=obj.completed?4:-8,extra=(obj.completed?t.good:t.bad)-base;
    if(extra)this.teamPlayers(this.state.teamId).forEach(p=>{const d=this.playerDev(p);d.morale=clamp(Number(d.morale||0)+extra,0,100);});
    obj.moraleDelta=obj.completed?t.good:t.bad;
  };

  // ----- промежуточная мораль (каждые 4 матча) -----
  proto.updateRegularObjectiveMorale=function(){
    if(!this.state||this.state.teamObjective?.evaluated||this.state.playoff?.started)return;
    const obj=this.state.teamObjective||(this.state.teamObjective={type:'playoffs',evaluated:false,completed:null});
    const gp=Number(this.state.standings?.[this.state.teamId]?.gp||0);
    if(obj.moraleCheckpointGp==null){obj.moraleCheckpointGp=gp-(gp%4);obj.moraleCheckpointReady=false;return;}
    if(obj.moraleCheckpointReady===false){obj.moraleCheckpointReady=true;return;}
    const total=this.userRegularTotal();
    while(gp>=Number(obj.moraleCheckpointGp||0)+4&&!obj.evaluated){
      obj.moraleCheckpointGp=Number(obj.moraleCheckpointGp||0)+4;
      const ss=this.state.standings?.[this.state.teamId]||{};
      const cp=Math.min(gp,total),pts=Number(ss.pts||0),ga=Number(ss.ga||0),wins=(ss.regw||0)+(ss.otw||0),rank=this.conferenceRank(this.state.teamId);
      const grown=this.teamPlayers(this.state.teamId).filter(p=>(this.playerDev(p)?.growth||0)>=1).length;
      const rest=Math.max(0,(total-cp)/total),share=cp/total,target=this.objectiveTarget(obj.type,obj);let onTrack=false;
      if(obj.type==='points'||obj.type==='points90')onTrack=pts+1.5>=target*share;
      else if(obj.type==='wins')onTrack=wins+1>=target*share;
      else if(obj.type==='top4')onTrack=rank<=4+Math.ceil(rest*4);
      else if(obj.type==='develop')onTrack=grown>=Math.floor(target*share*share);
      else if(obj.type==='develop3')onTrack=grown>=Math.max(0,Math.round(3*share)-((cp<20)?1:0));
      else if(obj.type==='defense')onTrack=ga<=GA_LIMIT*share+4;
      else if(obj.type==='first')onTrack=rank<=1+Math.ceil(rest*4);
      else onTrack=rank<=8+Math.ceil(rest*7);
      const delta=onTrack?1.0:-1.6;
      this.teamPlayers(this.state.teamId).forEach(p=>{const d=this.playerDev(p);d.morale=clamp(Number(d.morale||0)+delta,0,100);});
      obj.lastMoraleCheck={gp:cp,onTrack,delta};
    }
  };

  // ----- окно выбора цели -----
  function decorate(app,root){
    if(!root||root.dataset.obj813)return;
    const h=root.querySelector('#objective-modal-title');
    if(!h||!/Выбери цель/.test(h.textContent))return;
    root.dataset.obj813='1';
    h.textContent='Цель на регулярный чемпионат';
    root.querySelector('.objective-modal-result')?.remove();
    const p=root.querySelector('section>p');
    if(p)p.textContent='Совет директоров ждёт от тебя результата. Цель фиксируется после первого матча. В конце регулярного чемпионата мораль игроков изменится: бонус за выполнение или штраф за провал, величина зависит от сложности цели.';
    const sel=root.querySelector('#regular-start-objective');if(!sel)return;
    const rec=app.recommendedObjective();
    sel.innerHTML=LIST.map(t=>`<option value="${t}">${app.escape(nameOf(app,t,app.objectiveTarget(t,null)))}${t===rec?' · рекомендация':''}</option>`).join('');
    sel.value=rec;
    const box=document.createElement('div');box.className='obj-desc';box.id='regular-objective-desc';
    sel.insertAdjacentElement('afterend',box);
    const upd=()=>{
      const t=sel.value,tg=app.objectiveTarget(t,null),tier=app.objectiveTier(t,tg),key=tierKey(t,tg);
      box.innerHTML=`<p><b>${app.escape(nameOf(app,t,tg))}</b></p><p class="small">${app.escape(descOf(app,t,tg))}</p><p class="small obj-reward"><span class="obj-tier ${key}">${tier.label}</span> Выполнение: мораль <b>+${tier.good}</b> · провал: <b>${tier.bad}</b></p>${t===rec?'<p class="small muted">Рекомендует совет директоров с учётом силы клуба.</p>':''}`;
    };
    sel.addEventListener('change',upd);upd();
  }
  const baseModal=proto.renderObjectiveModal;
  proto.renderObjectiveModal=function(){
    baseModal.apply(this,arguments);
    try{if(this.state?.objectiveModal?.kind==='regular-choice')decorate(this,document.getElementById('objective-modal-overlay'));}catch(e){console.warn('KHL Manager 8.13 objectives:',e);}
  };

  // ----- вкладка «Развитие»: список целей и награда -----
  const baseDev=proto.renderDevelopment;
  proto.renderDevelopment=function(){
    baseDev.apply(this,arguments);
    try{
      const sel=document.getElementById('team-objective-select');
      if(sel&&this.state){
        const cur=this.state.teamObjective?.type||'playoffs';
        const types=LIST.includes(cur)?LIST:[...LIST,cur];
        const sig=types.join()+'|'+this.objectiveTarget('points',this.state.teamObjective)+'|'+this.state.teamObjective?.target;
        if(sel.dataset.obj813!==sig){sel.dataset.obj813=sig;sel.innerHTML=types.map(t=>`<option value="${t}">${this.escape(nameOf(this,t,this.objectiveTarget(t,t===cur?this.state.teamObjective:null)))}</option>`).join('');}
        sel.value=cur;
        const st=document.getElementById('team-objective-status');
        if(st&&!st.querySelector('.obj-reward'))st.insertAdjacentHTML('beforeend',`<div class="small muted obj-reward">${this.escape(this.objectiveRewardText(cur))}</div>`);
      }
    }catch(e){console.warn('KHL Manager 8.13 objectives dev:',e);}
  };
})();
