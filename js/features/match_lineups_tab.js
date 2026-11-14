// 14.7.24/14.7.26: вкладка «Составы» в блоке «Статистика матча» — отдельная вкладка внутри
// Матч-центра (п.2 концепта «Живая коробка 2.0»). Показывает составы обеих команд по
// звеньям/парам для любого матча, у которого есть снимок состава (lineup_snapshot.js).
// 14.7.26: критичный фикс — раньше при переходе на «Составы» вкладки «Главное/Шайба/
// Спецбригады» пропадали насовсем (строились заново с нуля БЕЗ них), выйти назад было
// нельзя. Теперь «Составы» — это ДОБАВКА поверх обычного рендера статистики: сначала всегда
// строится полный блок с «Главное/Шайба/Спецбригады», и только потом, если выбрана вкладка
// «Составы», её содержимое подставляется вместо таблицы (сама строка вкладок остаётся).
// Так же: у матчей без снимка вкладка «Составы» просто не показывается (не показываем
// сообщение «нет данных» — его незачем видеть, раз вкладки нет вовсе), и имена игроков —
// кликабельные ссылки на карточку игрока (как везде в игре).
(function(){
  const proto=(typeof KHLManagerApp!=='undefined'&&KHLManagerApp.prototype);
  if(!proto)return;
  const esc=s=>String(s==null?'':s);

  function playerLink(app,id){
    const p=app.db.players.find(x=>x.id===id);
    if(!p)return '<span class="muted">—</span>';
    const e=app.escape?s=>app.escape(s):esc;
    const num=p.number!=null?`<i>${e(p.number)}</i> `:'';
    return `${num}<span class="nm" data-pl="${e(p.id)}">${e(p.name)}</span>`;
  }

  function onIceIds(app){
    const R=app._rk; if(!R)return null;
    const out=new Set();
    [0,1].forEach(ti=>{
      (R.ice[ti].sk||[]).filter(p=>p.st==='ice').forEach(p=>out.add(p.id));
      if(R.ice[ti].gk)out.add(R.ice[ti].gk.id);
    });
    return out;
  }

  function teamBlockHtml(app, teamId, teamSnap, onIce){
    const team=app.teamById(teamId), e=app.escape?s=>app.escape(s):esc;
    const groups=app.lineupGroups(teamSnap);
    const rowsHtml=groups.map(g=>{
      const players=g.ids.map(id=>{
        const live=onIce&&onIce.has(id)?' ml-onice':'';
        return `<span class="ml-pl${live}">${playerLink(app,id)}</span>`;
      }).join('');
      return `<div class="ml-group"><div class="ml-group-lab">${e(g.label)}</div><div class="ml-group-pl">${players||'—'}</div></div>`;
    }).join('');
    return `<div class="ml-team"><div class="ml-team-h">${e(team?team.name:'')}</div>${rowsHtml}</div>`;
  }

  // Снимок состава для матча, который сейчас открыт (если он есть).
  proto.mcLineupSnapshotFor=function(match){
    if(!match)return null;
    const live=this.liveMatch&&this.liveMatch.matchId===match.id&&!this.liveMatch.finished?this.liveMatch:null;
    const src=live?live.simulatedMatch:match;
    return (src&&src.lineupSnapshot)||(match&&match.lineupSnapshot)||(live&&live.lineupSnapshot)||null;
  };

  // Рисует содержимое вкладки «Составы» ВНУТРИ уже построенного блока статистики —
  // заменяет только тело (всё после строки вкладок .mst-tabs), саму строку вкладок не трогает.
  proto.mcRenderLineupsBody=function(panel, match){
    const snap=this.mcLineupSnapshotFor(match);
    if(!snap)return false;
    const live=this.liveMatch&&this.liveMatch.matchId===match?.id&&!this.liveMatch.finished?this.liveMatch:null;
    const home=this.teamById(match.homeId),away=this.teamById(match.awayId);
    const onIce=(live&&this.rkViewMode&&this.rkViewMode()==='box')?onIceIds(this):null;
    const e=s=>this.escape?this.escape(s):esc(s);
    const tabsEl=panel.querySelector('.mst-tabs');
    const tabsHtml=tabsEl?tabsEl.outerHTML:'<div class="mst-tabs" role="tablist"></div>';
    const bodyHtml=`<div class="ml-wrap">${teamBlockHtml(this,match.homeId,snap[match.homeId],onIce)}${teamBlockHtml(this,match.awayId,snap[match.awayId],onIce)}</div>`;
    panel.innerHTML=`<h3 class="mst-title">👥 Составы</h3>`+
      `<div class="mst-vs"><span class="mst-pill h">${e(home?.name||'Хозяева')}</span><span class="mst-mid">${onIce?'на льду сейчас':''}</span><span class="mst-pill a">${e(away?.name||'Гости')}</span></div>`+
      tabsHtml+bodyHtml;
    this.mcMarkLineupsPill(panel, true);
    return true;
  };

  // Кнопка «Составы» в строке вкладок. Показываем её только если у матча есть снимок —
  // иначе вкладку просто незачем предлагать (без пустых заглушек «нет данных»).
  proto.mcEnsureLineupsPill=function(panel, match){
    const tabs=panel.querySelector('.mst-tabs'); if(!tabs)return;
    const hasSnap=!!this.mcLineupSnapshotFor(match);
    let btn=tabs.querySelector('[data-mst-tab="lineups"]');
    if(!hasSnap){ if(btn)btn.remove(); return; }
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';btn.className='mst-tab';btn.setAttribute('role','tab');btn.dataset.mstTab='lineups';btn.textContent='Составы';
      tabs.appendChild(btn);
    }
    this.mcMarkLineupsPill(panel, panel.dataset.lineupsActive==='1');
    this.mcBindLineupsClicks(panel, match);
  };

  proto.mcMarkLineupsPill=function(panel, active){
    const tabs=panel.querySelector('.mst-tabs'); if(!tabs)return;
    tabs.querySelectorAll('.mst-tab').forEach(b=>{
      const isLineups=b.dataset.mstTab==='lineups';
      if(isLineups){ b.classList.toggle('on',!!active); b.setAttribute('aria-selected',String(!!active)); }
      else if(active){ b.classList.remove('on'); b.setAttribute('aria-selected','false'); }
    });
  };

  // Клики привязываем к САМОЙ панели #match-statistics (она не пересоздаётся между
  // перерисовками, только её innerHTML) — один раз, а не к строке вкладок, которая
  // перестраивается заново при каждом рендере и теряла бы обработчик.
  proto.mcBindLineupsClicks=function(panel, match){
    if(panel._lineupsBound)return;
    panel._lineupsBound=true;
    const self=this;
    panel.addEventListener('click',ev=>{
      const b=ev.target.closest('[data-mst-tab]'); if(!b)return;
      if(b.dataset.mstTab==='lineups'){
        ev.stopPropagation();
        panel.dataset.lineupsActive='1';
        self.renderMatchStatistics(panel._lastMatch||match);
      } else if(panel.dataset.lineupsActive==='1'){
        panel.dataset.lineupsActive='0';
        // переключение на «Главное/Шайба/Спецбригады» дальше обрабатывает свой же
        // обработчик в match_stats_tabs.js (bubble-фаза, сработает следом за этим).
      }
    },true);
  };

  const baseRenderStats=proto.renderMatchStatistics;
  proto.renderMatchStatistics=function(match){
    const r=baseRenderStats.apply(this, arguments);
    const panel=document.getElementById('match-statistics');
    if(!panel||!panel.querySelector('.mst-tabs'))return r;
    panel._lastMatch=match;
    this.mcEnsureLineupsPill(panel, match);
    if(panel.dataset.lineupsActive==='1'){
      if(!this.mcRenderLineupsBody(panel, match)){
        // снимка больше нет (например, сменился матч) — тихо возвращаемся к обычной статистике
        panel.dataset.lineupsActive='0';
      }
    }
    return r;
  };
})();
