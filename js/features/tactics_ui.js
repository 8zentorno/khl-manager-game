/* KHL Manager 14.6.1 — интерфейс тактики: вкладка «Тактика», кнопки Матч-центра («Тренерский штаб», «Состав», «Спецбригады»)
 * со всплывающими окнами (игра на паузе), срочная замена в окне «Состав», значки стиля соперника, снятие вратаря.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = id => document.getElementById(id);
  const pct = v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%';

  /* ---------- вкладка «Тактика» ---------- */
  function liveMine(app) { const l = app.liveMatch; return l && !l.finished && (l.homeId === app.state.teamId || l.awayId === app.state.teamId) ? l : null; }
  /* тактика окна: в матче это тактика матча, иначе ближайшего матча (или команды) */
  function curCfg(app) {
    const l = liveMine(app);
    if (l && l.tac) { const s = l.homeId === app.state.teamId ? l.tac.h : l.tac.a; return s.queue || s.cfg; }
    return app.tacConfig(app.state.teamId);
  }
  /* вкладка «Тактика» меняет только тактику команды по умолчанию */
  function setCfg(app, patch) {
    Object.assign(app.tacTabConfig(), patch); app.persistQuietly && app.persistQuietly();
    app.renderTactics();
  }
  const barRow = (label, v, goodNeg) => {
    const w = Math.min(50, Math.abs(v) * 250), good = goodNeg ? v <= 0 : v >= 0;
    return `<div class="tc-bar"><span>${label}</span><div class="tc-t"><i class="${good ? 'pos' : 'neg'}" style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${w}%"></i></div><b>${pct(v)}</b></div>`;
  };
  proto.renderTactics = function () {
    const root = $('tactics-content'); if (!root || !this.state) return;
    const uid = this.state.teamId, cfg = this.tacTabConfig(), live = liveMine(this), ST = this.TAC_STYLES, PP = this.TAC_PP, PK = this.TAC_PK;
    const p = this.tacParams(cfg, uid), sk = k => this.tacSkill(uid, k), co = this.coachOf ? this.coachOf(uid) : null;
    const styles = Object.keys(ST).map(k => `<button type="button" class="tc-style${cfg.style === k ? ' on' : ''}" data-tcs="${k}"><b>${E(ST[k].n)}</b><small>${E(ST[k].d)}</small></button>`).join('');
    const chem = this.tacTeamChem(uid), bonus = this.TAC_PARAMS.chemMax * chem;
    const L = (() => { const s = this.state.slotAssignments || {}, o = []; for (let i = 1; i <= 4; i++) o.push(['Звено ' + i, ['LW', 'C', 'RW'].map(x => s['F' + i + x]).filter(Boolean)]); for (let i = 1; i <= 3; i++) o.push(['Пара ' + i, ['L', 'R'].map(x => s['D' + i + x]).filter(Boolean)]); return o; })();
    const chemRows = L.map(([t, ids]) => { const v = Math.round(this.tacLineChem(ids)), names = ids.map(id => { const pl = this.playerById(id); return pl ? `<span class="nm" data-pl="${E(id)}">${E(this.surname ? this.surname(pl) : pl.name)}</span>` : '—'; }).join(', '); return `<div class="tc-ch"><span class="tc-chn">${t}</span><span class="tc-chp">${names}</span><div class="tc-t"><i class="pos" style="left:0;width:${v}%"></i></div><b>${v}</b></div>`; }).join('');
    const ramp = Math.max(1, Math.round(this.TAC_PARAMS.ramp - (sk('ingame') - 40) / 55 * 3));
    const hint = (() => {
      let nm = null; try { nm = this.overviewNextMatch && this.overviewNextMatch(); } catch (e) { }
      const opp = nm && (nm.homeId === uid ? nm.awayId : nm.homeId);
      if (!opp) return '';
      const oc = this.tacConfig(opp), on = this.teamById(opp);
      return `<div class="tc-hint"><b>Подсказка штаба.</b> «${E(on ? on.name : '')}» обычно играет «${E(ST[oc.style].n.toLowerCase())}», давление ${oc.press}, борьба ${oc.phys}.${oc.style === 'att' ? ' Против атакующих хорошо работает контратакующий стиль.' : oc.style === 'def' ? ' Против обороны полезно давление и большинство.' : ''}</div>`;
    })();
    root.innerHTML = `
<div class="card tc-card"><h3>Стиль игры</h3><div class="tc-styles">${styles}</div>
<div class="tc-dgrid">
<label class="tc-f">Давление на соперника<select data-tcr="press">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${cfg.press === n ? ' selected' : ''}>${E(this.TAC_PRESS_LABEL[n - 1])}</option>`).join('')}</select></label>
<label class="tc-f">Силовая борьба<select data-tcr="phys">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${cfg.phys === n ? ' selected' : ''}>${E(this.TAC_PHYS_LABEL[n - 1])}</option>`).join('')}</select></label>
<label class="tc-f">Розыгрыш большинства<select data-tcp="1">${Object.keys(PP).map(k => `<option value="${k}" data-d="${E(PP[k].d)}"${cfg.pp === k ? ' selected' : ''}>${E(PP[k].n)}</option>`).join('')}</select></label>
<label class="tc-f">Розыгрыш меньшинства<select data-tck="1">${Object.keys(PK).map(k => `<option value="${k}" data-d="${E(PK[k].d)}"${(cfg.pk || 'std') === k ? ' selected' : ''}>${E(PK[k].n)}</option>`).join('')}</select></label></div>
<small class="tc-dnote">Давление: больше потерь у соперника и бросков, но выше усталость и риск удалений. Борьба: меньше качества у соперника, но больше удалений и травм.<br>Большинство: ${E(PP[cfg.pp].d)}<br>Меньшинство: ${E(PK[cfg.pk || 'std'].d)}</small>
${hint}</div>
<div class="card tc-card"><h3>Что это меняет в матче</h3><p class="small muted">Сравнение с равным соперником на сбалансированном стиле. Включает влияние навыка тренера «Тактика».</p>
${barRow('Свои броски', p.sf)}${barRow('Броски соперника', p.sa, true)}${barRow('Качество своих моментов', p.q)}${barRow('Качество моментов соперника', p.qa, true)}${barRow('Свои удаления', p.pen, true)}${barRow('Усталость игроков', p.fat, true)}${barRow('Риск травм', p.inj, true)}</div>
<div class="card tc-card"><h3>Химия звеньев</h3><p class="small muted">Игроки, которые долго играют вместе, лучше взаимодействуют. Химия растёт с каждым матчем в одном звене и затухает при разделении. Сейчас: <b>${Math.round(chem)}</b> из 100, бонус к качеству моментов <b>+${(bonus * 100 / 100).toFixed(1)}%</b> (максимум +${(this.TAC_PARAMS.chemMax * 100).toFixed(0)}%).</p>${chemRows}</div>
<div class="card tc-card"><h3>Что даёт тренер${co ? ` ${this.coachLink ? this.coachLink(uid) : E(co.name)}` : ''}</h3><ul class="tc-ul">
<li>Тактика ${sk('tactics')}: плюсы стиля ${pct((sk('tactics') - 65) / 200)} к силе, минусы смягчаются.</li>
<li>Звенья ${sk('lines')}: химия растёт на ${pct((sk('lines') - 60) / 100)} быстрее.</li>
<li>Запас ${sk('bench')}: усталость от стиля ${pct(-(sk('bench') - 60) / 150)}, замены адаптируются быстрее.</li>
<li>В игре ${sk('ingame')}: смена стиля вступает в силу за ${ramp} мин. Также определяет решения тренеров соперников.</li></ul>
<div class="tc-actions"><button class="btn btn-quiet" type="button" onclick="app.switchTab('roster',document.querySelector('[data-view=roster]'))">🏒 Состав</button><button class="btn btn-quiet" type="button" onclick="app.switchTab('specialteams',document.querySelector('[data-view=specialteams]'))">⚡ Спецбригады</button></div></div>`;
  };
  document.addEventListener('click', e => {
    if (typeof app === 'undefined' || !app.state) return;
    const s = e.target.closest && e.target.closest('[data-tcs]');
    if (s) { setCfg(app, { style: s.dataset.tcs }); return; }
  });
  document.addEventListener('change', e => {
    if (typeof app === 'undefined' || !app.state) return;
    const t = e.target;
    if (t.dataset && t.dataset.tcr) { const patch = {}; patch[t.dataset.tcr] = Number(t.value); setCfg(app, patch); return; }
    if (t.dataset && t.dataset.tcp) setCfg(app, { pp: t.value });
    if (t.dataset && t.dataset.tck) setCfg(app, { pk: t.value });
  });
  const baseTab = proto.switchTab;
  proto.switchTab = function (name) { const r = baseTab.apply(this, arguments); if (name === 'tactics') { try { this.renderTactics(); } catch (e) { console.error(e); } } return r; };


  /* ---------- Матч-центр: значки стиля и кнопки тренерского штаба ---------- */
  function sideOfLive(app, live) { return live && live.tac ? (live.homeId === app.state.teamId ? live.tac.h : live.tac.a) : null; }
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  proto.tacDecorateMatch = function () {
    if (!this.state) return;
    const sb = $('match-scoreboard'); if (!sb) return;
    const live = this.liveMatch && this.liveMatch.matchId === this.currentMatchId ? this.liveMatch : null;
    const m = live ? live.simulatedMatch : this.state.matches.find(x => x.id === this.currentMatchId);
    const hero = sb.querySelector('.match-hero');
    if (hero && m && !hero.querySelector('.tac-badge')) {
      const ST = this.TAC_STYLES;
      let hs, as;
      if (live && live.tac) { hs = live.tac.h.cfg.style; as = live.tac.a.cfg.style; }
      else if (m.tac) { hs = m.tac.h.last; as = m.tac.a.last; }
      const cells = hero.children;
      if (hs && as && cells.length >= 3) {
        const mk = (st, ch) => `<div class="tac-badge" title="Стиль игры">${E(ST[st].n)}${ch ? ` · смен: ${ch}` : ''}</div>`;
        const hc = live && live.tac ? live.tac.h.changes : (m.tac && m.tac.h.changes), ac = live && live.tac ? live.tac.a.changes : (m.tac && m.tac.a.changes);
        cells[0].insertAdjacentHTML('beforeend', mk(hs, hc)); cells[cells.length - 1].insertAdjacentHTML('beforeend', mk(as, ac));
      }
    }
    // кнопки справа в строке управления матчем
    const old = $('mc-tac'); if (old) old.remove();
    const mine = live && liveMine(this) && live.matchId === liveMine(this).matchId;
    const row = document.querySelector('#mc-tempo .mct-btns');
    let box = row && row.querySelector('.mct-staff');
    if (!mine) { if (box) box.remove(); this.tacDecorateSub(); return; }
    if (row && !box) {
      box = document.createElement('span'); box.className = 'mct-staff';
      box.innerHTML = '<button type="button" data-tcpop="tactics">🎯 Тренерский штаб</button><button type="button" data-tcpop="lineup">Состав</button><button type="button" data-tcpop="units">Спецбригады</button>';
      row.appendChild(box);
    }
    this.tacDecorateSub();
  };
  const baseMc = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = baseMc.apply(this, arguments);
    try { this.tacDecorateMatch(); } catch (e) { console.error(e); }
    return r;
  };

  /* ---------- всплывающие окна ---------- */
  let pop = null;
  const popEl = () => $('tc-sub');
  const POS = { LW: 'ЛН', C: 'Ц', RW: 'ПН', L: 'ЛЗ', R: 'ПЗ' };
  function pool(app, live, isD) {
    const uid = app.state.teamId, off = new Set([...(live ? (live.sentOff[uid] || []) : []), ...(live ? (live.injured[uid] || []) : [])]);
    return app.teamPlayers(uid).filter(p => p.pos !== 'G' && (p.pos === 'D') === isD && !off.has(p.id) && !app.isPlayerUnavailable(p)).sort((a, b) => app.effectiveOVR(b) - app.effectiveOVR(a));
  }
  const ovr = (app, p) => Math.round(app.effectiveOVR(p));          // динамический рейтинг, всегда целое
  const sname = p => String(p.name || '').split(' ').pop();
  function chip(app, id, attrs, cls) {
    const p = id && app.playerById(id);
    return `<button type="button" class="tc-pc ${cls || ''}" ${attrs}><b>${p ? E(sname(p)) : '—'}</b><small>${p ? E((app.positionLabel ? app.positionLabel(p.pos) : p.pos) + ' · ' + ovr(app, p)) : 'пусто'}</small></button>`;
  }
  /* какое звено и пара на льду: условная ротация смен (первое звено играет дольше) */
  proto.tacIceF = function (min) { const m = Math.floor(min) % 10; return m < 4 ? 1 : m < 7 ? 2 : m < 9 ? 3 : 4; };
  proto.tacIceD = function (min) { const m = Math.floor(min) % 9; return m < 4 ? 1 : m < 7 ? 2 : 3; };
  /* бригада на льду: большинство или меньшинство нашей команды */
  proto.tacIceUnit = function (live) {
    const uid = this.state.teamId, vm = live.visibleMinute || 0, act = (live.penalties || []).filter(x => !x.queued && x.expiresAt > vm);
    const own = act.filter(x => x.teamId === uid).length, opp = act.length - own, k = (Math.floor(vm) % 2) + 1;
    return opp > own ? 'pp' + k : own > opp ? 'pk' + k : null;
  };
  function bodyTactics(app) {
    const ST = app.TAC_STYLES, PP = app.TAC_PP, PK = app.TAC_PK, d = pop.draft, live = liveMine(app);
    const uid = app.state.teamId, m = live && live.simulatedMatch, minute = live ? Math.floor(live.visibleMinute || 0) : 0;
    const diff = live ? (live.homeId === uid ? 1 : -1) * ((m.homeScore || 0) - (m.awayScore || 0)) : 0;
    const canPull = live && diff < 0 && diff >= -2 && minute >= 54 && minute < 60 && !live.pendingLateGoaliePull && !live.goaliePullProcessed;
    const pulled = live && (live.tacManualPull && String(live.tacManualPull) === String(uid) || (live.goaliePulledTeamId && String(live.goaliePulledTeamId) === String(uid)));
    const sel = (key, obj, v) => `<select data-tcd="${key}">${Object.keys(obj).map(k => `<option value="${k}" data-d="${E(obj[k].d)}"${v === k ? ' selected' : ''}>${E(obj[k].n)}</option>`).join('')}</select>`;
    const lvl = key => `<select data-tcd="${key}">${[1, 2, 3, 4, 5].map(n => `<option value="${n}"${d[key] === n ? ' selected' : ''}>${E((key === 'press' ? app.TAC_PRESS_LABEL : app.TAC_PHYS_LABEL)[n - 1])}</option>`).join('')}</select>`;
    return `<div class="tc-sty">${Object.keys(ST).map(k => `<button type="button" class="${d.style === k ? 'on' : ''}" data-tcd-style="${k}"><b>${E(ST[k].n)}</b><small>${E(ST[k].d)}</small></button>`).join('')}</div>
<div class="tc-pop-grid"><label>Давление ${lvl('press')}</label><label>Силовая борьба ${lvl('phys')}</label>
<label>Большинство ${sel('pp', PP, d.pp)}</label><label>Меньшинство ${sel('pk', PK, d.pk || 'std')}</label></div>
${canPull && !pulled ? '<button type="button" class="btn btn-danger" data-tcpull="1">🧤 Снять вратаря</button>' : pulled ? '<span class="badge gold">Вратарь снят</span>' : ''}
${live ? '<p class="small muted">Изменения вступят в силу на ближайшей остановке игры.</p>' : ''}`;
  }
  const benchChips = (app, live, taken, selGroup, tagFn) => {
    const mk = isD => pool(app, live, isD).filter(p => !taken.has(p.id)).map(p => chip(app, p.id, `data-tcb="${E(p.id)}"`, (selGroup && selGroup !== (isD ? 'D' : 'F') ? 'dis ' : '') + (pop.sel && pop.sel.t === 'bench' && pop.sel.id === p.id ? 'sel' : ''))).join('');
    return `<div class="tc-bh">Запас · нападающие</div><div class="tc-row">${mk(false) || '<span class="muted small">нет</span>'}</div><div class="tc-bh">Запас · защитники</div><div class="tc-row">${mk(true) || '<span class="muted small">нет</span>'}</div>`;
  };
  function bodyLineup(app) {
    const live = liveMine(app), d = pop.draft, f = pop.forced, g = pop.sel && (pop.sel.t === 'slot' ? pop.sel.k[0] : (app.playerById(pop.sel.id).pos === 'D' ? 'D' : 'F'));
    const cell = k => chip(app, d[k], `data-tcls="${k}"`, (f && d[k] === f.playerId ? 'bad ' : '') + (pop.sel && pop.sel.t === 'slot' && pop.sel.k === k ? 'sel ' : '') + (g && g !== k[0] ? 'dis' : ''));
    const iF = live ? app.tacIceF(live.visibleMinute || 0) : 0, iD = live ? app.tacIceD(live.visibleMinute || 0) : 0;
    const rows = [];
    for (let i = 1; i <= 4; i++) rows.push(`<div class="tc-ln${iF === i ? ' ice' : ''}"><span class="tc-lt">Звено ${i}${iF === i ? '<i>на льду</i>' : ''}</span>${['LW', 'C', 'RW'].map(x => cell('F' + i + x)).join('')}</div>`);
    for (let i = 1; i <= 3; i++) rows.push(`<div class="tc-ln${iD === i ? ' ice' : ''}"><span class="tc-lt">Пара ${i}${iD === i ? '<i>на льду</i>' : ''}</span>${['L', 'R'].map(x => cell('D' + i + x)).join('')}</div>`);
    const taken = new Set(Object.values(d));
    const intro = f ? `<p><b>${E((app.playerById(f.playerId) || {}).name || '')}</b> ${f.reason === 'injury' ? 'получил травму и не может продолжать' : 'удалён до конца матча'}. Лучшая замена уже подставлена: нажмите «Заменить» или выберите другую (тап по игроку, затем по запасному).</p>` : '<p class="small muted">Рамка — звено на льду. Тап по игроку, затем по запасному или другому игроку. Только на этот матч.</p>';
    return intro + rows.join('') + benchChips(app, live, taken, g);
  }
  function bodyUnits(app) {
    const live = liveMine(app), d = pop.draft, tab = pop.tab, TAB = { pp1: 'Большинство 1', pp2: 'Большинство 2', pk1: 'Меньшинство 1', pk2: 'Меньшинство 2' };
    const u = d[tab] || {}, ice = live ? app.tacIceUnit(live) : null;
    const g = pop.sel && (pop.sel.t === 'slot' ? pop.sel.k.split('.')[1][0] : (app.playerById(pop.sel.id).pos === 'D' ? 'D' : 'F'));
    const cells = Object.keys(u).map(sl => chip(app, u[sl], `data-tcus="${tab}.${sl}"`, (pop.sel && pop.sel.t === 'slot' && pop.sel.k === tab + '.' + sl ? 'sel ' : '') + (g && g !== sl[0] ? 'dis' : ''))).join('');
    const taken = new Set(Object.values(u).filter(Boolean));
    return `<div class="tc-tabs">${Object.keys(TAB).map(k => `<button type="button" class="${tab === k ? 'on' : ''}${ice === k ? ' live' : ''}" data-tcut="${k}">${TAB[k]}${ice === k ? ' · на льду' : ''}</button>`).join('')}</div>
<div class="tc-ln${ice === tab ? ' ice' : ''}">${cells}</div><p class="small muted">Тап по игроку бригады, затем по запасному. Игрок из другой бригады того же вида меняется местами. Только на этот матч.</p>${benchChips(app, live, taken, g)}`;
  }
  function renderPop(app) {
    if (!pop) { const b = popEl(); if (b) b.remove(); return; }
    let box = popEl(); if (!box) { box = document.createElement('div'); box.id = 'tc-sub'; box.className = 'tc-sub'; document.body.appendChild(box); }
    const f = pop.forced;
    const title = f ? 'Игра остановлена: нужна замена' : pop.kind === 'tactics' ? 'Тренерский штаб' : pop.kind === 'lineup' ? 'Состав на матч' : 'Спецбригады на матч';
    const body = pop.kind === 'tactics' ? bodyTactics(app) : pop.kind === 'lineup' ? bodyLineup(app) : bodyUnits(app);
    const foot = f ? '<button type="button" class="btn btn-quiet" data-tcsub="__auto">Авто-замена</button><button type="button" class="btn btn-quiet" data-tcsub="__none">Без замены</button><button type="button" class="btn btn-primary" data-tcpa="1">Заменить</button>'
      : '<button type="button" class="btn btn-quiet" data-tcx="1">Отмена</button><button type="button" class="btn btn-primary" data-tcpa="1">Применить</button>';
    box.innerHTML = `<div class="tc-sub-in tc-pop-in" role="dialog" aria-modal="true"><div class="tc-pop-h"><h3>${title}</h3>${f ? '' : '<button type="button" class="btn btn-quiet tc-x" data-tcx="1" aria-label="Закрыть">✕</button>'}</div>${body}<div class="tc-sub-act">${foot}</div></div>`;
  }
  proto.tacOpenPop = function (kind, pre) {
    const live = liveMine(this); if (!pre && !live) return;
    if (pop && pop.forced) return;
    pop = { kind, pre: !!pre };
    if (live && !pre) { live.paused = true; live.runMode = null; try { this.mcRefreshTempo(); } catch (e) { } }
    if (kind === 'tactics') pop.draft = Object.assign({}, curCfg(this));
    else if (kind === 'lineup') pop.draft = clone(live.tac.slotsQ || live.tac.slots);
    else { pop.draft = clone(live.tac.unitsQ || live.tac.units); pop.tab = 'pp1'; }
    renderPop(this);
  };
  proto.tacClosePop = function () {
    const live = liveMine(this); pop = null; renderPop(this);
    if (live && !live.forcedSub) { live.paused = false; try { this.mcRefreshTempo(); } catch (e) { } }
  };
  /* тап по плитке: слот, игрок запаса; замена или обмен внутри окна */
  function tapChip(app, slotKey, benchId) {
    const d = pop.draft, sel = pop.sel;
    const grp = k => (pop.kind === 'units' ? k.split('.')[1][0] : k[0]);
    const get = k => pop.kind === 'units' ? (d[k.split('.')[0]] || {})[k.split('.')[1]] : d[k];
    const put = (k, id) => { if (pop.kind === 'units') d[k.split('.')[0]][k.split('.')[1]] = id; else d[k] = id; };
    const pg = id => (app.playerById(id).pos === 'D' ? 'D' : 'F');
    if (slotKey) {
      if (sel && sel.t === 'slot' && sel.k !== slotKey && grp(sel.k) === grp(slotKey)) {      // два слота: обмен
        const a = get(sel.k), b = get(slotKey); put(sel.k, b); put(slotKey, a); pop.sel = null;
      } else if (sel && sel.t === 'bench' && pg(sel.id) === grp(slotKey)) { place(slotKey, sel.id); pop.sel = null; }
      else pop.sel = sel && sel.t === 'slot' && sel.k === slotKey ? null : { t: 'slot', k: slotKey };
    } else {
      if (sel && sel.t === 'slot' && pg(benchId) === grp(sel.k)) { place(sel.k, benchId); pop.sel = null; }
      else pop.sel = sel && sel.t === 'bench' && sel.id === benchId ? null : { t: 'bench', id: benchId };
    }
    function place(k, id) {
      if (pop.kind === 'units') {                       // в однотипных бригадах игрок один раз: дубль меняется местами
        const kind = k.split('.')[0].slice(0, 2), mine = get(k);
        for (const u of Object.keys(d).filter(x => x.slice(0, 2) === kind)) for (const sl of Object.keys(d[u])) if (d[u][sl] === id && u + '.' + sl !== k) d[u][sl] = mine || '';
      }
      put(k, id);
    }
    renderPop(app);
  }
  function applyPop(app) {
    const live = liveMine(app);
    if (pop.kind === 'tactics') {
      if (live && !pop.pre) app.tacLiveQueue(pop.draft);
      else {                                            // из «Подготовки к матчу»: только на ближайший матч
        const tab = app.tacTabConfig(), same = ['style', 'press', 'phys', 'pp', 'pk'].every(k => (pop.draft[k] || 'std') === (tab[k] || 'std'));
        app.state.preMatchTac = same ? null : Object.assign({}, pop.draft); app.persistQuietly && app.persistQuietly();
      }
    } else if (pop.kind === 'lineup') {
      app.tacLiveQueueLines(pop.draft, null);
      if (pop.forced) { app.tacLiveFlush(live, 'срочная замена'); live.tac.subs = live.tac.subs || {}; live.forcedSub = null; }
    } else app.tacLiveQueueLines(null, pop.draft);
    const forced = !!pop.forced;
    app.tacClosePop();
    if (forced) { try { app.renderMatchCenter(); } catch (e) { } if (live.quick) app.revealFullMatch(); else app.startLiveTicker(); }
    else app.tacDecorateMatch();
  }
  document.addEventListener('click', e => {
    if (typeof app === 'undefined' || !app.state) return;
    const t = e.target.closest ? e.target : null; if (!t) return;
    const o = t.closest('[data-tcpop]'); if (o) { app.tacOpenPop(o.dataset.tcpop); return; }
    if (!pop) return;
    if (t.closest('[data-tcx]')) { app.tacClosePop(); return; }
    if (t.classList && t.classList.contains('tc-sub') && !pop.forced) { app.tacClosePop(); return; }
    const st = t.closest('[data-tcd-style]'); if (st) { pop.draft.style = st.dataset.tcdStyle; renderPop(app); return; }
    const ut = t.closest('[data-tcut]'); if (ut) { pop.tab = ut.dataset.tcut; pop.sel = null; renderPop(app); return; }
    const ls = t.closest('[data-tcls]'), us = t.closest('[data-tcus]'), bn = t.closest('[data-tcb]');
    if (ls || us || bn) { tapChip(app, ls ? ls.dataset.tcls : us ? us.dataset.tcus : null, bn ? bn.dataset.tcb : null); return; }
    if (t.closest('[data-tcpa]')) { applyPop(app); return; }
    const pull = t.closest('[data-tcpull]'); if (pull) { if (app.tacPullNow()) { pop.draft = Object.assign({}, curCfg(app)); renderPop(app); } return; }
    const sub = t.closest('[data-tcsub]'); if (sub) { app.tacResolveSub(sub.dataset.tcsub); return; }
  });
  document.addEventListener('change', e => {
    if (typeof app === 'undefined' || !app.state || !pop) return;
    const t = e.target, ds = t.dataset || {};
    if (ds.tcd) { pop.draft[ds.tcd] = ds.tcd === 'press' || ds.tcd === 'phys' ? Number(t.value) : t.value; renderPop(app); return; }
  });

  /* ---------- срочная замена: окно «Состав» ---------- */
  proto.tacAutoSub = typeof navigator !== 'undefined' && navigator.webdriver === true; // автотесты не ждут выбора замены
  proto.tacCheckForced = function (live) {
    const uid = this.state.teamId; if (live.homeId !== uid && live.awayId !== uid) return;
    const tac = live.tac; if (!tac) return; tac.seenOff = tac.seenOff || {};
    const off = (live.sentOff && live.sentOff[uid]) || [];
    for (const id of off) {
      if (tac.seenOff[id]) continue; tac.seenOff[id] = true;
      const pl = this.playerById(id); if (!pl || pl.pos === 'G') continue;
      const injured = ((live.injured && live.injured[uid]) || []).includes(id);
      const slots = tac.slots || {}, slot = Object.keys(slots).find(k => slots[k] === id);
      if (!slot) continue;
      live.forcedSub = { key: id + ':' + Math.floor(live.visibleMinute || 0), playerId: id, slot, reason: injured ? 'injury' : 'ejection' };
      live.forceUiRender = true;
      if (this.tacAutoSub || live.quick) { this.tacApplySub(live, candidates(this, live, live.forcedSub)[0] || null); break; }
      try { this.tacDecorateSub(); } catch (e) { }
      break;
    }
  };
  function candidates(app, live, f) {
    const uid = app.state.teamId, inAct = new Set(Object.values(live.tac.slots || {}));
    const off = new Set([...(live.sentOff[uid] || []), ...(live.injured[uid] || [])]);
    const pl = app.playerById(f.playerId), isD = pl.pos === 'D';
    return app.teamPlayers(uid).filter(p => p.pos !== 'G' && (p.pos === 'D') === isD && !inAct.has(p.id) && !off.has(p.id) && !app.isPlayerUnavailable(p))
      .sort((a, b) => (b.pos === pl.pos) - (a.pos === pl.pos) || app.effectiveOVR(b) - app.effectiveOVR(a));
  }
  /* показывает окно «Состав» в режиме срочной замены, когда игра ждёт выбора */
  proto.tacDecorateSub = function () {
    const live = this.liveMatch, f = live && live.forcedSub;
    if (!f || live.finished) { if (pop && pop.forced) { pop = null; renderPop(this); } return; }
    if (pop && pop.forced && pop.forced.key === f.key) return;
    pop = { kind: 'lineup', forced: f, draft: clone(live.tac.slotsQ || live.tac.slots) };
    const list = candidates(this, live, f); if (list.length) pop.draft[f.slot] = list[0].id;
    renderPop(this);
  };
  /* замена без перерисовки: общий путь для выбора пользователя и автозамены (быстрый итог, автотесты) */
  proto.tacApplySub = function (live, pick) {
    const f = live.forcedSub, old = this.playerById(f.playerId), m = live.simulatedMatch, uid = this.state.teamId, minute = Math.floor(live.visibleMinute || 0);
    let text = `Без замены: ${old.name} выбыл, команда играет без него.`;
    if (pick) {
      live.tac.slots[f.slot] = pick.id; if (live.tac.slotsQ) live.tac.slotsQ[f.slot] = pick.id;
      this.tacRebuildActive(live);
      live.tac.subs = live.tac.subs || {}; live.tac.subs[pick.id] = true;
      text = `Замена в составе: ${pick.name} вместо ${old.name}.`;
    }
    const t = Math.max(0, Math.min(59.98, minute)), per = Math.floor(t / 20) + 1, loc = t - (per - 1) * 20;
    (m.events = m.events || []).push({ kind: 'tactic', teamId: uid, period: per + 'П', time: String(Math.floor(loc)).padStart(2, '0') + ':00', visibleAtMinute: minute, text });
    live.forcedSub = null; live.forceUiRender = true;
  };
  proto.tacResolveSub = function (id) {
    const live = this.liveMatch, f = live && live.forcedSub; if (!f) return;
    const list = candidates(this, live, f);
    let pick = null;
    if (id === '__auto') pick = list[0] || null; else if (id !== '__none') pick = list.find(p => p.id === id) || null;
    this.tacApplySub(live, pick);
    pop = null; renderPop(this); live.paused = false;
    try { this.renderMatchCenter(); } catch (e) { }
    if (live.quick) this.revealFullMatch(); else this.startLiveTicker();
  };
  /* «Быстрый итог»: окна закрываются, срочные замены делаются автоматически */
  const baseReveal = proto.revealFullMatch;
  proto.revealFullMatch = function () {
    const live = this.liveMatch;
    if (live) {
      live.quick = true; pop = null; try { renderPop(this); } catch (e) { }
      if (live.tac && live.tac.slotsQ || live.tac && live.tac.unitsQ) { try { this.tacLiveFlush(live, ''); } catch (e) { } }
      if (live.forcedSub) { try { this.tacApplySub(live, candidates(this, live, live.forcedSub)[0] || null); } catch (e) { live.forcedSub = null; } }
      live.paused = false;
    }
    return baseReveal.apply(this, arguments);
  };

})();
