/* KHL Manager 8.14 — цели плей-офф: названия, сложность и награда, рекомендация по месту клуба. */
(function(){
  const proto=KHLManagerApp.prototype;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const TIERS={easy:{label:'лёгкая',good:2,bad:-8},mid:{label:'средняя',good:4,bad:-8},hard:{label:'сложная',good:7,bad:-5},epic:{label:'очень сложная',good:10,bad:-4}};
  const PO=[
    {type:'quarterfinals',name:'Выйти в 1/4 финала (пройти первую серию)',tier:'easy',series:1,desc:'Выиграть первую серию плей-офф (1/8 финала). Подходит клубу, который вышел в плей-офф с нижних мест.'},
    {type:'semifinal',name:'Выйти в полуфинал',tier:'mid',series:2,desc:'Выиграть две серии подряд: 1/8 финала и 1/4 финала.'},
    {type:'final',name:'Выйти в финал Кубка Гагарина',tier:'hard',series:3,desc:'Выиграть три серии и сыграть финал. Реалистично для клубов из верхней части таблицы.'},
    {type:'champion',name:'Выиграть Кубок Гагарина',tier:'epic',series:4,desc:'Выиграть четыре серии и завоевать Кубок. Высокий риск, но и самая большая награда.'}
  ];
  const BY=Object.fromEntries(PO.map(o=>[o.type,o]));
  proto.playoffObjectiveOptions=function(){return PO.map(o=>[o.type,o.name]);};
  proto.playoffObjectiveName=function(type){return (BY[type]||BY.semifinal).name;};
  proto.playoffObjectiveTier=function(type){return TIERS[(BY[type]||BY.semifinal).tier];};
  proto.playoffObjectiveRewardText=function(type){const t=this.playoffObjectiveTier(type);return `Сложность: ${t.label}. Выполнение: мораль +${t.good}. Провал: мораль ${t.bad}.`;};
  proto.recommendedPlayoffObjective=function(){
    const r=this.state?this.conferenceRank(this.state.teamId):5;
    return r<=2?'final':r<=5?'semifinal':'quarterfinals';
  };

  // Итоговая мораль по сложности (база: +4,5 / −8).
  const baseEval=proto.evaluatePlayoffObjective;
  proto.evaluatePlayoffObjective=function(success){
    const before=this.state?.playoffObjective,was=!!before?.evaluated,sel=!!before?.selected;
    baseEval.apply(this,arguments);
    const obj=this.state?.playoffObjective;
    if(was||!sel||!obj||!obj.evaluated||obj.tierApplied)return;
    obj.tierApplied=true;
    const t=this.playoffObjectiveTier(obj.type),base=obj.completed?4.5:-8,extra=(obj.completed?t.good:t.bad)-base;
    if(extra)this.teamPlayers(this.state.teamId).forEach(p=>{const d=this.playerDev(p);d.morale=clamp(Number(d.morale||0)+extra,0,100);});
    obj.moraleDelta=obj.completed?t.good:t.bad;
  };

  function descHtml(app,type,rec){
    const o=BY[type]||BY.semifinal,t=TIERS[o.tier],steps=['1/8','1/4','Полуфинал','Финал'];
    const seed=app.conferenceRank(app.state.teamId);
    return `<p class="obj-t"><b>${app.escape(o.name)}</b></p><p class="small">${app.escape(o.desc)}</p>`+
      `<p class="small obj-reward"><span class="obj-tier ${o.tier}">${t.label}</span> Выполнение: мораль <b>+${t.good}</b> · провал: <b>${t.bad}</b></p>`+
      `<div class="obj-stairs">${steps.map((s,i)=>`<span class="${i<o.series?'on':''}"></span>`).join('')}</div><div class="obj-stairs-l">${steps.map(s=>`<span>${s}</span>`).join('')}</div>`+
      `<p class="small muted">Выход в плей-офф: ${seed}-е место в конференции.${type===rec?' Рекомендует совет директоров с учётом места клуба.':''}</p>`;
  }
  function decorateSelect(app,sel){
    if(!sel||sel.dataset.po814)return;
    sel.dataset.po814='1';
    const rec=app.recommendedPlayoffObjective();
    sel.innerHTML=PO.map(o=>`<option value="${o.type}">${app.escape(o.name)}${o.type===rec?' · рекомендация':''}</option>`).join('');
    sel.value=rec;
    const box=document.createElement('div');box.className='obj-desc';
    sel.insertAdjacentElement('afterend',box);
    const upd=()=>{box.innerHTML=descHtml(app,sel.value,rec);};
    sel.addEventListener('change',upd);upd();
  }

  // Окно после регулярки: выбор цели на плей-офф.
  const baseModal=proto.renderObjectiveModal;
  proto.renderObjectiveModal=function(){
    baseModal.apply(this,arguments);
    try{
      const root=document.getElementById('objective-modal-overlay'),m=this.state?.objectiveModal;
      if(!root||!m||m.kind!=='regular'||!m.qualified||root.dataset.po814)return;
      const sel=root.querySelector('#regular-end-playoff-goal');if(!sel)return;
      root.dataset.po814='1';
      const hint=[...root.querySelectorAll('section p.small')].find(p=>/задачу на Кубок/.test(p.textContent));
      if(hint)hint.textContent='Выбери задачу на плей-офф. Цель фиксируется после первого матча серии. Если команда выполнит её, мораль игроков вырастет, если нет, упадёт. Величина зависит от сложности цели.';
      const lab=root.querySelector('label[for="regular-end-playoff-goal"]');if(lab)lab.textContent='Цель на Кубок Гагарина';
      decorateSelect(this,sel);
    }catch(e){console.warn('KHL Manager 8.14 playoff goals:',e);}
  };

  // Вкладка «Развитие»: панель цели плей-офф.
  const baseDev=proto.renderDevelopment;
  proto.renderDevelopment=function(){
    baseDev.apply(this,arguments);
    try{
      const panel=document.getElementById('playoff-objective-panel');if(!panel||!this.state)return;
      const sel=panel.querySelector('#playoff-objective-select');
      if(sel){const po=this.state.playoffObjective;
        if(!po?.selected&&!sel.dataset.po814)decorateSelect(this,sel);}
      else if(this.state.playoffObjective?.selected&&!panel.querySelector('.obj-reward')){
        panel.querySelector('.objective-phase-card')?.insertAdjacentHTML('beforeend',`<div class="small muted obj-reward" style="margin-top:.5rem">${this.escape(this.playoffObjectiveRewardText(this.state.playoffObjective.type))}</div>`);
      }
    }catch(e){console.warn('KHL Manager 8.14 playoff goals dev:',e);}
  };
})();
