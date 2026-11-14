/* KHL Manager 9.3.0 — вкладка «Развитие»: единая сводка, компактный список игроков с раскрытием,
   фильтры «позиция» и «нужно внимание», режимы развития во время травмы (облегчённый / пауза / реабилитация). */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const TIRED = 60, LOW_MORALE = 55, LOW_FORM = 40;
  const SEV = { light: 'лёгкая', medium: 'средняя', severe: 'тяжёлая' };
  const MODES = [['light', 'Облегчённые тренировки'], ['pause', 'Пауза'], ['rehab', 'Реабилитация']];
  const MODE_HINT = {
    light: 'Прогресс навыков вдвое медленнее, форма не меняется, мораль не падает из-за простоя.',
    pause: 'Тренировка и прогресс стоят до выздоровления. После возвращения форма на 5 пунктов ниже.',
    rehab: 'Навыки не растут, зато травма проходит быстрее: средняя на 1 игру, тяжёлая на полдня за каждый день.'
  };
  const SUM_KEY = 'khl.devSumCollapsed';
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  const sign = v => (v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '0');

  proto.devUI = function () { return this._devUI || (this._devUI = { pos: 'all', att: 'all', open: null }); };

  proto.devFlags = function (p) {
    const d = this.playerDev(p) || {};
    const inj = d.injury && this.isPlayerUnavailable(p) ? d.injury : null;
    return { inj, tired: (d.fatigue || 0) >= TIRED, form: (d.form == null ? 50 : d.form) < LOW_FORM, morale: (d.morale == null ? 60 : d.morale) < LOW_MORALE };
  };

  proto.devPlayers = function () {
    const order = { LW: 0, C: 1, RW: 2, D: 3, G: 4 };
    return this.teamPlayers(this.state.teamId).slice().sort((a, b) => (order[a.pos] - order[b.pos]) || this.playerLine(a) - this.playerLine(b) || this.effectiveOVR(b) - this.effectiveOVR(a));
  };

  proto.devToggle = function (id) { const u = this.devUI(); u.open = u.open === id ? null : id; this.renderDevelopment(); };
  proto.devPos = function (v) { this.devUI().pos = v; this.renderDevelopment(); };
  proto.devAtt = function (v) { this.devUI().att = v; this.renderDevelopment(); };
  proto.devToggleSummary = function () {
    let c = false; try { c = localStorage.getItem(SUM_KEY) === '1'; } catch (e) {}
    try { localStorage.setItem(SUM_KEY, c ? '0' : '1'); } catch (e) {}
    this.renderDevelopment();
  };

  /* ---- режим развития на время травмы ---- */
  proto.setInjuryMode = function (playerId, mode) {
    if (!this.state || !MODES.some(m => m[0] === mode)) return;
    const p = this.db.players.find(x => x.id === playerId); if (!p || p.teamId !== this.state.teamId) return;
    const d = this.playerDev(p), inj = d && d.injury; if (!inj) return;
    d.injuryMode = mode;
    if (mode === 'rehab' && inj.severity === 'medium' && !inj.rehabDone && Number(inj.gamesRemaining || 0) > 1) { inj.gamesRemaining -= 1; inj.rehabDone = true; }
    this.persistQuietly(); this.renderDevelopment();
    this.setNotice(`${p.name}: на время травмы — «${MODES.find(m => m[0] === mode)[1].toLowerCase()}».`);
  };

  const snapInjured = app => {
    const out = [];
    for (const p of app.teamPlayers(app.state.teamId)) {
      const d = app.playerDev(p);
      if (d && d.injury && app.isPlayerUnavailable(p)) out.push([d, { sk: Object.assign({}, d.skills), xp: Object.assign({}, d.skillXP), g: d.growth || 0, gx: d.growthXP || 0, ex: d.experience || 0, f: d.form, m: d.morale }]);
    }
    return out;
  };
  const scaleProgress = (d, b, factor) => {
    for (const k of Object.keys(b.sk)) {
      const before = b.sk[k] * 30 + (b.xp[k] || 0), after = (d.skills[k] || 0) * 30 + (d.skillXP[k] || 0);
      const t = before + (after - before) * factor, lv = Math.floor(t / 30);
      d.skills[k] = lv; d.skillXP[k] = t - lv * 30;
    }
    const gb = b.g * 58 + b.gx, ga = (d.growth || 0) * 58 + (d.growthXP || 0), gt = gb + (ga - gb) * factor, gl = Math.floor(gt / 58);
    d.growth = gl; d.growthXP = gt - gl * 58;
    d.experience = b.ex + ((d.experience || 0) - b.ex) * factor;
  };
  const healedPenalty = app => {
    for (const p of app.teamPlayers(app.state.teamId)) {
      const d = app.playerDev(p);
      if (d && d.injuryMode && !d.injury) {
        if (d.injuryMode === 'pause') d.form = Math.max(15, (d.form == null ? 50 : d.form) - 5);
        delete d.injuryMode;
      }
    }
  };

  const _adv = proto.advancePlayerDays;
  proto.advancePlayerDays = function (days) {
    if (!this.state || !(Number(days) > 0)) return _adv.apply(this, arguments);
    const n = Math.min(400, Math.max(1, Math.round(Number(days))));
    let snap = []; try { snap = snapInjured(this); } catch (e) {}
    const r = _adv.apply(this, arguments);
    try {
      for (const [d, b] of snap) {
        const mode = d.injuryMode || 'light';
        scaleProgress(d, b, mode === 'light' ? 0.5 : 0);
        d.form = b.f;
        if (mode === 'rehab' && d.injury && d.injury.severity === 'severe') {
          d.injury.daysRemaining = Math.max(0, Math.round(Number(d.injury.daysRemaining || 0) - n * 0.5));
          if (d.injury.daysRemaining === 0) delete d.injury;
        }
      }
      healedPenalty(this);
    } catch (e) { console.warn('KHL Manager 9.3 injury dev:', e); }
    return r;
  };

  const _amd = proto.applyMatchDevelopment;
  proto.applyMatchDevelopment = function () {
    if (!this.state) return _amd.apply(this, arguments);
    let snap = []; try { snap = snapInjured(this); } catch (e) {}
    const r = _amd.apply(this, arguments);
    try {
      for (const [d, b] of snap) { d.form = b.f; if ((d.morale || 0) < b.m) d.morale = b.m; }
      healedPenalty(this);
    } catch (e) { console.warn('KHL Manager 9.3 injury dev:', e); }
    return r;
  };

  /* ---- отрисовка ---- */
  const _render = proto.renderDevelopment;
  proto.renderDevelopment = function () {
    _render.apply(this, arguments);
    if (!this.state) return;
    try { this.renderDevSummary(); this.renderDevFilters(); this.renderDevList(); } catch (e) { console.warn('KHL Manager 9.3 development UI:', e); }
  };

  proto.renderDevSummary = function () {
    const host = $('development-summary'); if (!host) return;
    $('age-contracts-card')?.remove();
    const players = this.devPlayers(), ds = players.map(p => this.playerDev(p));
    const avgForm = ds.length ? Math.round(ds.reduce((n, d) => n + d.form, 0) / ds.length) : 50;
    const avgFat = ds.length ? Math.round(ds.reduce((n, d) => n + d.fatigue, 0) / ds.length) : 0;
    const tired = ds.filter(d => d.fatigue >= TIRED).length, grown = ds.reduce((n, d) => n + (d.growth || 0), 0);
    const r = this.seasonReview ? this.seasonReview() : null, esc = s => this.escape(String(s));
    let collapsed = false; try { collapsed = localStorage.getItem(SUM_KEY) === '1'; } catch (e) {}
    const tile = (a, b, c) => `<div class="dv-tile"><small>${a}</small><b>${b}</b><span>${c}</span></div>`;
    const tiles = [
      tile('Средняя форма', avgForm + '/100', avgForm >= 60 ? 'команда на подъёме' : avgForm <= 40 ? 'форма просела' : 'стабильный уровень'),
      tile('Средняя усталость', avgFat + '%', avgFat >= 55 ? 'стоит дать отдых' : 'нагрузка под контролем'),
      tile('Уставшие игроки', tired, 'усталость от ' + TIRED + '%'),
      tile('Изменение рейтинга', (() => { let up = 0, dn = 0; for (const p of players) { const g = this.permGrowth ? this.permGrowth(p) : 0; if (g > 0) up += g; else dn += g; } return `<span title="Сумма изменений постоянного рейтинга игроков с начала сезона">${sign(up)} / ${sign(dn)}</span>`; })(), (() => { let t = 0; for (const p of players) t += this.permGrowth ? this.permGrowth(p) : 0; return `итого ${sign(t)} · рост и снижение за сезон`; })())
    ];
    let lists = '';
    if (r) {
      tiles.push(tile('Средний возраст', r.avgAge.toFixed(1).replace('.', ','), `молодых до 22: ${r.young} · ветеранов 34+: ${r.veterans}`));
      const li = (arr, empty) => arr.length ? arr.map(x => `<li><span class="nm" data-pl="${esc(x.id)}">${esc(x.name)}</span> <span class="muted">· ${esc(this.positionLabel(x.pos))} · ${this.ageText(x.age)} · ${x.ovr0}→${x.ovr1} (${sign(x.delta)})</span></li>`).join('') : `<li class="muted">${empty}</li>`;
      lists = `<div class="dv-lists"><div><strong>Растут</strong><ul class="small">${li(r.risers, 'Пока без изменений')}</ul></div><div><strong>Сдают</strong><ul class="small">${li(r.fallers, 'Пока без изменений')}</ul></div></div>`
        + (r.retireWatch && r.retireWatch.length ? `<p class="small muted">Возможное завершение карьеры: ${r.retireWatch.map(x => esc(x.name) + ' (' + x.age + ')').join(', ')}.</p>` : '');
    }
    host.className = 'card dv-sum';
    host.removeAttribute('style');
    host.innerHTML = `<button type="button" class="dv-sumhead" onclick="app.devToggleSummary()" aria-expanded="${!collapsed}"><span class="eyebrow">Возраст и развитие · ${r ? r.season : ''}${r && r.finished ? ' · итоги сезона' : ''}</span><span class="dv-arrow" style="transform:${collapsed ? 'none' : 'rotate(90deg)'}">›</span></button>`
      + (collapsed ? '' : `<div class="dv-tiles">${tiles.join('')}</div>${lists}`);
  };

  proto.renderDevFilters = function () {
    const host = $('dev-filters'); if (!host) return;
    const u = this.devUI(), players = this.devPlayers();
    const cnt = { all: players.length, att: 0, def: 0, gk: 0 }, w = { warn: 0, inj: 0, tired: 0, form: 0, morale: 0 };
    players.forEach(p => {
      if (p.pos === 'G') cnt.gk++; else if (p.pos === 'D') cnt.def++; else cnt.att++;
      const f = this.devFlags(p); let any = false;
      for (const k of ['inj', 'tired', 'form', 'morale']) if (f[k]) { w[k]++; any = true; }
      if (any) w.warn++;
    });
    const chip = (kind, v, label, n, on) => `<button type="button" class="dv-chip" aria-pressed="${on}" onclick="app.${kind}('${v}')">${label}${n == null ? '' : ` <i>${n}</i>`}</button>`;
    host.innerHTML = `<div class="dv-flt"><span>Позиция</span>${chip('devPos', 'all', 'Все', cnt.all, u.pos === 'all')}${chip('devPos', 'att', 'Нападающие', cnt.att, u.pos === 'att')}${chip('devPos', 'def', 'Защитники', cnt.def, u.pos === 'def')}${chip('devPos', 'gk', 'Вратари', cnt.gk, u.pos === 'gk')}</div>`
      + `<div class="dv-flt"><span>Нужно внимание</span>${chip('devAtt', 'all', 'Все', null, u.att === 'all')}${chip('devAtt', 'warn', 'Любая проблема', w.warn, u.att === 'warn')}${chip('devAtt', 'inj', '🩹 Травмы', w.inj, u.att === 'inj')}${chip('devAtt', 'tired', 'Усталость', w.tired, u.att === 'tired')}${chip('devAtt', 'form', 'Низкая форма', w.form, u.att === 'form')}${chip('devAtt', 'morale', 'Низкая мораль', w.morale, u.att === 'morale')}</div>`;
  };

  proto.renderDevList = function () {
    const root = $('development-list'); if (!root) return;
    const u = this.devUI(), esc = s => this.escape(String(s));
    const list = this.devPlayers().filter(p => {
      if (u.pos === 'att' && (p.pos === 'D' || p.pos === 'G')) return false;
      if (u.pos === 'def' && p.pos !== 'D') return false;
      if (u.pos === 'gk' && p.pos !== 'G') return false;
      if (u.att === 'all') return true;
      const f = this.devFlags(p);
      return u.att === 'warn' ? (f.inj || f.tired || f.form || f.morale) : !!f[u.att];
    });
    root.className = 'dv-list';
    if (!list.length) { root.innerHTML = '<div class="empty">В этом фильтре никого нет.</div>'; return; }
    root.innerHTML = list.map(p => {
      const d = this.playerDev(p), f = this.devFlags(p), open = u.open === p.id;
      const cur = this.permanentOVR(p), now = Math.round(this.effectiveOVR(p)), line = this.playerLine(p);
      const badge = (c, t) => `<span class="dv-badge ${c}">${t}</span>`;
      const badges = (f.inj ? badge('inj', 'травма') : '') + (f.tired ? badge('bad', 'устал') : '') + (f.form ? badge('warn', 'форма') : '') + (f.morale ? badge('bad', 'мораль') : '') + (d.boost ? badge('ok', '⚡ усиленные') : '');
      const meter = (cls, label, v, low, suffix) => `<span class="dv-m${low ? ' low' : ''}"><i><span>${label}</span><b>${Math.round(v)}${suffix || ''}</b></i><span class="dev-bar ${cls}"><span style="width:${Math.max(0, Math.min(100, v))}%"></span></span></span>`;
      return `<article class="dv-row${open ? ' open' : ''}${f.inj ? ' hurt' : ''}"><button type="button" class="dv-head" onclick="app.devToggle('${p.id}')" aria-expanded="${open}">`
        + `<span class="dv-nm"><b>${esc(p.name)}</b>${badges}<small>${this.positionLabel(p.pos)} · ${line <= 4 ? line + ' звено' : 'запас'} · ${this.ageText(this.ageYears(p))}</small></span>`
        + `<span class="dv-ovr">${cur}<small>сейчас ${now}</small></span>`
        + `<span class="dv-minis">${meter('form', 'Форма', d.form, f.form)}${meter('fatigue', 'Устал.', d.fatigue, f.tired, '%')}${meter('morale', 'Мораль', d.morale, f.morale)}</span>`
        + `<span class="dv-arrow" aria-hidden="true">›</span></button>${open ? this.devDetails(p, d, f) : ''}</article>`;
    }).join('');
  };

  proto.devDetails = function (p, d, f) {
    const esc = s => this.escape(String(s)), st = this.state.playerStats[p.id] || {};
    const goal = d.goal || this.makePlayerGoal(p, 'auto');
    const goals = p.pos === 'G' ? [['auto', 'Авто: победы'], ['goalie_wins', 'Победы вратаря'], ['growth', 'Рост рейтинга'], ['none', 'Без цели']]
      : [['auto', 'Авто: очки'], ['points', 'Набрать очки'], ['goals', 'Забросить шайбы'], ['growth', 'Рост рейтинга'], ['none', 'Без цели']];
    const goalValue = this.playerGoalValue(p, d), goalPct = goal.target > 0 ? Math.min(100, goalValue / goal.target * 100) : 0;
    const focus = this.trainingSkill(d.training);
    let injBox = '';
    if (f.inj) {
      const inj = f.inj, mode = d.injuryMode || 'light';
      const left = inj.severity === 'severe' ? `около ${Math.max(0, Math.round(inj.daysRemaining || 0))} дн.` : `${inj.gamesRemaining || 0} ${plural(inj.gamesRemaining || 0, 'матч', 'матча', 'матчей')}`;
      injBox = `<div class="dv-injbox"><b>🩹 Травма: ${SEV[inj.severity] || inj.severity}</b> · осталось ${left}
        <div class="dev-control" style="margin-top:.4rem"><label>Развитие на время травмы</label><select onchange="app.setInjuryMode('${p.id}',this.value)">${MODES.map(([v, l]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="small muted">${MODE_HINT[mode]}</div></div>`;
    }
    const trend = d.potential - (d.pot0 == null ? d.potential : d.pot0);
    return `<div class="dv-more">${injBox}
      <div class="small" style="margin-bottom:.4rem"><span class="nm" data-pl="${p.id}">Открыть профиль: статистика и карьера →</span></div>
      <div class="small muted">${st.gp || 0} матчей · ${st.g || 0} Г · ${st.a || 0} П · потенциал ${d.potential}${trend ? ` (${trend > 0 ? '▲+' : '▼'}${trend})` : ''}${d.growth ? ` · +${d.growth} за сезон` : ''}</div>
      <div class="dev-controls"><div class="dev-control"><label>Индивидуальная тренировка</label><select onchange="app.setPlayerTraining('${p.id}',this.value)">${this.trainingOptions(p).map(([v, l]) => `<option value="${v}" ${d.training === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="dev-control"><label>Цель на сезон</label><select onchange="app.setPlayerGoal('${p.id}',this.value)">${goals.map(([v, l]) => `<option value="${v}" ${(v === 'auto' && goal.auto) || goal.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="dev-skills"><span>Бросок ${d.skills.shooting}</span><span>Пас ${d.skills.passing}</span><span>Катание ${d.skills.skating}</span><span>Оборона ${d.skills.defense}</span><span>Выносл. ${d.skills.stamina}</span>${p.pos === 'G' ? `<span>Вратарь ${d.skills.goalkeeping}</span>` : ''}</div>
      <div class="dev-foot"><span>${esc(this.trainingLabel(d.training))} · опыт ${Math.round(d.experience || 0)} · ${focus ? `прогресс навыка ${Math.round(d.skillXP[focus] || 0)}/30` : `прогресс развития ${Math.round(d.growthXP || 0)}/58`}</span><span class="objective-progress">${goal.type === 'none' ? 'Цель не назначена' : `${esc(this.goalTypeLabel(goal))}: ${goalValue}/${goal.target}${goal.achieved ? ' ✓' : ''}`}</span></div>
      <div class="dev-bar"><span style="width:${goalPct}%;background:${goal.achieved ? '#34d399' : '#fbbf24'}"></span></div></div>`;
  };
})();
