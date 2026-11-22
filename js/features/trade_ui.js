/* KHL Manager — «Центр обменов»: вкладка «Обмены» в разделе «Рынок» (фаза 2, итерация 1).
 * Конструктор на одного клуба-партнёра (игроки + нетто-доплата), нейтральная шкала баланса,
 * вероятностный вердикт клуба-партнёра, потолок после сделки, лента истории обменов.
 * Шкала/вердикт/потолок обновляются частично (#tr-dyn), чтобы слайдер доплаты не терял фокус при протяжке. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const A = () => (typeof app !== 'undefined' ? app : null);
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fm = v => (v / 1e6).toFixed(1).replace('.', ',') + ' млн';
  const NEED_LABEL = { C: 'центральных нападающих', W: 'крайних нападающих', D: 'защитников', G: 'вратарей' };
  const sumSalary = list => list.reduce((s, p) => s + (Number(p.salary) || 0), 0);
  const clamp01 = v => Math.max(0, Math.min(100, v));

  /* ------------------------------------------------------------------ добавляем вкладку «Обмены» в «Рынок» */
  const _rm = proto.renderMarket;
  proto.renderMarket = function () {
    const r = _rm.apply(this, arguments);
    try {
      const host = $('view-market'); if (!host) return r;
      const bar = host.querySelector('.mk-tabs'); if (!bar) return r;
      if (!bar.querySelector('[data-mk-tab="trade"]')) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.setAttribute('role', 'tab'); btn.dataset.mkTab = 'trade'; btn.textContent = 'Обмены';
        bar.appendChild(btn);
      }
      const tab = this._mkTab || 'fa';
      bar.querySelectorAll('button[data-mk-tab]').forEach(b => b.classList.toggle('on', b.dataset.mkTab === tab));
    } catch (e) { console.warn('KHL Manager — вкладка «Обмены»:', e); }
    return r;
  };

  proto.trState = function () { return this._tr || (this._tr = { other: null, mine: [], theirs: [], cash: 0, round: 0, counterOffer: null, counterFinal: false, counterText: '' }); };
  proto.trSelected = function () {
    const tr = this.trState(), my = this.state.teamId, other = tr.other;
    return {
      tr, my, other,
      mineSel: tr.mine.map(id => this.marketPlayer(id)).filter(p => p && p.teamId === my),
      theirSel: other ? tr.theirs.map(id => this.marketPlayer(id)).filter(p => p && p.teamId === other) : []
    };
  };

  proto.mkTab_trade = function () {
    const sub = this._trSub || 'build';
    const head = `<div class="mk-tabs" role="tablist" style="margin-bottom:.6rem">${[['build', 'Конструктор'], ['hist', 'История']]
      .map(([k, l]) => `<button type="button" role="tab" class="${sub === k ? 'on' : ''}" data-tr-sub="${k}">${l}</button>`).join('')}</div>`;
    return head + (sub === 'hist' ? this.trHistHtml() : this.trBuildHtml());
  };

  /* ------------------------------------------------------------------ конструктор: статичная часть (клуб + списки игроков) */
  proto.trBuildHtml = function () {
    const { tr, my, other, mineSel, theirSel } = this.trSelected();
    const teams = this.league('KHL').teams().filter(t => t.id !== my).slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const myName = (this.teamById(my) || {}).name || '';
    const pickHtml = `<div class="tc-head"><div class="tc-vs"><span>${esc(myName)}</span><span class="muted">⇄</span>`
      + `<select data-tr-other style="max-width:12rem"><option value="">Выберите клуб…</option>${teams.map(t => `<option value="${esc(t.id)}" ${tr.other === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div></div>`;
    if (!other || !this.teamById(other)) {
      return `<div class="card tc-wrap">${pickHtml}<p class="tiny muted" style="margin:.4rem 0 0">Выберите клуб-партнёра, чтобы собрать предложение. Обмен — игрок(и) на игрока(ов) и/или деньги; драфт-пиков в КХЛ нет.</p></div>`;
    }
    const otherName = (this.teamById(other) || {}).name || '';
    const needs = this.marketNeeds(other) || {};
    const topNeed = Object.entries(needs).sort((a, b) => b[1].score - a[1].score)[0];
    const needsHtml = topNeed && topNeed[1].score > 0.5 ? `<p class="tiny muted" style="margin:.3rem 0 0">${esc(otherName)} ищет ${NEED_LABEL[topNeed[0]] || ''}.</p>` : '';

    const row = (p, side) => {
      const checked = (side === 'mine' ? tr.mine : tr.theirs).includes(p.id);
      const blocked = this.tradeBlockReason(p, p.teamId);
      const attr = blocked ? '' : ` data-tr-pl="${side}:${esc(p.id)}" role="button" tabindex="0"`;
      return `<div class="tc-prow${checked ? ' on' : ''}${blocked ? ' dis' : ''}"${attr} title="${blocked ? esc(blocked) : ''}">`
        + `<input type="checkbox" ${checked ? 'checked' : ''} ${blocked ? 'disabled' : ''}>`
        + `<div class="tc-pname"><b>${esc(p.name)}</b><small>${this.positionLabel(p.pos)} · ${this.ageText(Math.floor(this.ageYears(p)))} · рейтинг ${Math.round(this.permanentOVR(p))} · до ${p.contractUntil || '—'}</small></div>`
        + `<div class="tc-pval">${fm(p.salary)}</div></div>`;
    };
    const myList = this.teamPlayers(my).slice().sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
    const otherList = this.teamPlayers(other).slice().sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
    const colsHtml = `<div class="tc-cols">`
      + `<div class="tc-col"><h4>Отдаёте <small>${esc(myName)}</small></h4><div class="tc-plist">${myList.map(p => row(p, 'mine')).join('') || '<p class="muted tiny">Нет игроков.</p>'}</div></div>`
      + `<div class="tc-col"><h4>Получаете <small>${esc(otherName)}</small></h4><div class="tc-plist">${otherList.map(p => row(p, 'theirs')).join('') || '<p class="muted tiny">Нет игроков.</p>'}</div></div>`
      + `</div>`;

    const limMine = this.tradeCashLimit(my), limOther = this.tradeCashLimit(other);
    const cash = Number(tr.cash) || 0;
    const maxU = Math.round(Math.min(limMine, this.TRADE.cashSliderMax) / 500000), minU = -Math.round(Math.min(limOther, this.TRADE.cashSliderMax) / 500000);
    const cashHtml = `<div class="tc-cash"><label>Доплата деньгами</label><input type="range" data-tr-cash min="${minU}" max="${Math.max(minU, maxU)}" value="${Math.max(minU, Math.min(maxU, Math.round(cash / 500000)))}" ${maxU <= minU ? 'disabled' : ''}><b id="tr-cash-lbl">${this.trCashLabel(cash)}</b></div>`;

    return `<div class="card tc-wrap">${pickHtml}${needsHtml}${colsHtml}${cashHtml}<div id="tr-dyn">${this.trDynHtml(my, other, mineSel, theirSel, cash)}</div></div>`;
  };

  proto.trCashLabel = function (cash) { return cash === 0 ? 'нет' : (cash > 0 ? `вы платите ${fm(Math.abs(cash))}` : `вам платят ${fm(Math.abs(cash))}`); };

  /* ------------------------------------------------------------------ динамическая часть: шкала, вердикт, потолок, кнопка — пересчитывается без полного ре-рендера */
  proto.trDynHtml = function (my, other, mineSel, theirSel, cash) {
    const otherName0 = (this.teamById(other) || {}).name || '';
    const tr = this.trState();
    // 14.7.37: пока клуб ждёт ответа на свою корректировку — показываем её вместо обычной шкалы/вердикта;
    // «Применить корректировку» меняет tr.mine/tr.cash и сразу переподаёт сделку (trSubmit), «Изменить самому»
    // просто закрывает панель (на финальном раунде — отменяет всю сделку, дальше торга не будет).
    if (tr.counterOffer) {
      const co = tr.counterOffer;
      const swapHtml = co.swap ? `<div class="tiny" style="margin:.2rem 0"><s class="muted">${esc((this.playerById(co.swap.outId) || {}).name || '')}</s> → <b>${esc((this.playerById(co.swap.inId) || {}).name || '')}</b></div>` : '';
      const roundLabel = tr.counterFinal ? 'финальный раунд' : `раунд ${tr.round} из ${this.TRADE.maxCounterRounds}`;
      return `<div class="tc-verdict y" style="flex-direction:column;align-items:flex-start;gap:.3rem">`
        + `<b>🤔 ${esc(otherName0)} просит скорректировать предложение · ${esc(roundLabel)}</b>`
        + `<span class="tiny">${esc(tr.counterText || '')}</span>${swapHtml}`
        + `<div class="tc-foot" style="margin-top:.3rem"><button type="button" class="btn btn-primary" data-tr-counter-apply>${tr.counterFinal ? 'Принять финальные условия' : 'Принять корректировку'}</button>`
        + `<button type="button" class="btn btn-quiet" data-tr-counter-dismiss>${tr.counterFinal ? 'Отменить сделку' : 'Изменить самому'}</button></div>`
        + `</div><div id="tr-msg"></div>`;
    }
    const cashAtoB = Math.max(0, cash), cashBtoA = Math.max(0, -cash);
    const myName = (this.teamById(my) || {}).name || '', otherName = otherName0;
    const fair = this.tradeFairness(mineSel, cashAtoB, theirSel, cashBtoA);
    const markerPct = clamp01(50 + fair.frac * 50);
    const fairLabel = Math.abs(fair.frac) < 0.08 ? 'по ценности почти равноценно' : (fair.frac > 0 ? 'в вашу пользу' : 'не в вашу пользу');
    const hasOffer = mineSel.length || theirSel.length || cashAtoB || cashBtoA;
    const dec = hasOffer ? this.tradeDecision(other, mineSel, cashAtoB, theirSel, cashBtoA, my) : null;
    const verdictHtml = !dec ? '' : dec.verdict === 'accept'
      ? `<div class="tc-verdict g">✅ ${esc(otherName)}, скорее всего, согласится</div>`
      : dec.verdict === 'counter' ? `<div class="tc-verdict y">🤔 ${esc(otherName)} будет сомневаться</div>`
      : `<div class="tc-verdict r">❌ ${esc(otherName)}, скорее всего, откажет</div>`;
    const payMineAfter = this.teamPayroll(my) - sumSalary(mineSel) + sumSalary(theirSel);
    const payOtherAfter = this.teamPayroll(other) - sumSalary(theirSel) + sumSalary(mineSel);
    const capRow = (name, val) => `<div class="tc-cap-row"><span>Потолок «${esc(name)}» после обмена</span><b class="${val > this.MARKET.cap ? 'bad' : 'ok'}">${fm(val)} из ${this.MARKET.cap / 1e6} млн</b></div>`;
    const gaugeHtml = `<div class="tc-gauge-wrap"><div class="tc-gauge-top"><b>Баланс обмена</b><span class="tc-badge">${esc(fairLabel)}</span></div>`
      + `<div class="tc-gauge"><i></i><span class="tc-gauge-mark" style="left:${markerPct}%"></span></div>${verdictHtml}${capRow(myName, payMineAfter)}${capRow(otherName, payOtherAfter)}</div>`;
    const check = this.tradeCheck(my, other, mineSel, theirSel, cashAtoB, cashBtoA);
    const goDisabled = !!check || !hasOffer;
    const footHtml = `<div class="tc-foot"><button type="button" class="btn btn-primary" data-tr-go ${goDisabled ? 'disabled' : ''}>Предложить обмен</button><button type="button" class="btn btn-quiet" data-tr-clear>Очистить</button></div>`
      + (check ? `<p class="tiny mk-bad" style="margin:.3rem 0 0">${esc(check)}</p>` : '') + `<div id="tr-msg"></div>`;
    return gaugeHtml + footHtml;
  };
  // 14.7.37: единая точка подачи сделки (и первой, и повторной после «Применить корректировку») —
  // ветвится по verdict, который теперь всегда приходит из tradeExecute (accept/counter/reject).
  proto.trSubmit = function (priorCounters) {
    const tr = this.trState(), { my, other, mineSel, theirSel } = this.trSelected(); if (!other) return;
    const cash = Number(tr.cash) || 0;
    const r = this.tradeExecute(my, other, mineSel, theirSel, Math.max(0, cash), Math.max(0, -cash), false, priorCounters || 0);
    if (r.ok) {
      tr.mine = []; tr.theirs = []; tr.cash = 0; tr.round = 0; tr.counterOffer = null; tr.counterText = ''; tr.counterFinal = false;
      this.renderAll(); this.trShowResult(r.rec);
    } else if (r.verdict === 'counter') {
      tr.round = r.round; tr.counterOffer = r.counter; tr.counterFinal = r.final; tr.counterText = r.text;
      const dyn = $('tr-dyn'); if (dyn) dyn.innerHTML = this.trDynHtml(my, other, mineSel, theirSel, cash);
    } else if (r.verdict === 'reject') {
      tr.mine = []; tr.theirs = []; tr.cash = 0; tr.round = 0; tr.counterOffer = null; tr.counterText = ''; tr.counterFinal = false;
      this.renderMarket();
      const msg = $('tr-msg'); if (msg) msg.innerHTML = `<div class="res bad">${esc(r.text)}</div>`;
    } else {
      const msg = $('tr-msg'); if (msg) msg.innerHTML = `<div class="res bad">${esc(r.text)}</div>`;
    }
  };
  proto.trRefresh = function () {
    const { my, other, mineSel, theirSel } = this.trSelected(); if (!other) return;
    const cash = Number(this.trState().cash) || 0;
    const lbl = $('tr-cash-lbl'); if (lbl) lbl.textContent = this.trCashLabel(cash);
    const dyn = $('tr-dyn'); if (dyn) dyn.innerHTML = this.trDynHtml(my, other, mineSel, theirSel, cash);
  };

  /* ------------------------------------------------------------------ 14.7.36: окно с итогом сделки */
  proto.trCloseResult = function () { const el = $('tr-result'); if (el) el.remove(); };
  proto.trShowResult = function (rec) {
    this.trCloseResult();
    const my = this.state.teamId;
    const mine = rec.teamA === my ? rec.playersA : rec.playersB, theirs = rec.teamA === my ? rec.playersB : rec.playersA;
    const myCashOut = rec.teamA === my ? rec.cashAtoB : rec.cashBtoA, myCashIn = rec.teamA === my ? rec.cashBtoA : rec.cashAtoB;
    const partner = rec.teamA === my ? rec.teamB : rec.teamA;
    const pl = id => this.playerById(id);
    const plRow = id => { const p = pl(id); return p ? `<div style="font-weight:800;font-size:.95rem">${this.mkPl(id)}</div><div class="small muted">${this.positionLabel(p.pos)} · рейтинг ${Math.round(this.permanentOVR(p))}</div>` : ''; };
    const payAfter = this.teamPayroll(my);
    const html = `<div class="mk-dh"><div><span class="cd-chip g">✅ Обмен совершён</span><h3 class="pg-vs" style="margin-top:.4rem">${esc(this.teamById(my).name)}<span class="muted">⇄</span>${esc(this.teamById(partner).name)}</h3><div class="small muted" style="text-align:center">${esc(this.formatDate(rec.day))} · вступает в силу немедленно</div></div></div>`
      + `<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:.6rem;align-items:center;margin:.3rem 0">`
      + `<div class="tc-col" style="background:var(--t-bg-0b1728,#0b1728);border:1px solid var(--line);border-radius:11px;padding:.7rem"><div class="tiny muted" style="margin-bottom:.4rem">ОТДАЛИ</div>${mine.map(plRow).join('<div style="height:.5rem"></div>') || '<span class="muted small">—</span>'}${myCashOut ? `<div class="small" style="color:var(--gold);margin-top:.4rem">+ доплата ${fm(myCashOut)}</div>` : ''}</div>`
      + `<div class="muted" style="font-size:1.1rem">⇄</div>`
      + `<div class="tc-col" style="background:var(--t-bg-0b1728,#0b1728);border:1px solid var(--line);border-radius:11px;padding:.7rem"><div class="tiny muted" style="margin-bottom:.4rem">ПОЛУЧИЛИ</div>${theirs.map(plRow).join('<div style="height:.5rem"></div>') || '<span class="muted small">—</span>'}${myCashIn ? `<div class="small" style="color:var(--gold);margin-top:.4rem">+ доплата ${fm(myCashIn)}</div>` : ''}</div>`
      + `</div>`
      + `<div class="tc-cap-row" style="display:flex;justify-content:space-between;background:var(--t-bg-0b1728,#0b1728);border:1px solid var(--line);border-radius:10px;padding:.5rem .7rem"><span class="small muted">Потолок «${esc(this.teamById(my).name)}» после обмена</span><b class="${payAfter > this.MARKET.cap ? 'bad' : 'ok'}">${fm(payAfter)} из ${this.MARKET.cap / 1e6} млн</b></div>`
      + `<div class="pg-btns"><button type="button" class="btn btn-primary" data-tr-result-close>Понятно</button><button type="button" class="btn" data-tr-result-hist>Открыть историю обменов</button></div>`;
    const el = document.createElement('div'); el.id = 'tr-result'; el.className = 'pg-scrim';
    el.innerHTML = `<div class="pg-dlg" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);
  };

  /* ------------------------------------------------------------------ история */
  proto.trHistHtml = function () {
    const m = this.mk(), L = this.tradesList();
    if (!L.length) return '<div class="card"><p class="muted" style="margin:0">Обменов пока не было.</p></div>';
    let joke = '';
    if (!m.tradeJokeShown) {
      joke = `<p class="tiny muted" style="margin:0 0 .5rem"><s>2 драфт-пика</s> ✕ в КХЛ нет драфта: обмены — только «игрок(и) + деньги» ⇄ «игрок(и) + деньги».</p>`;
      m.tradeJokeShown = true; this.persistQuietly && this.persistQuietly();
    }
    const money = v => v ? ` + ${(v / 1e6).toFixed(1).replace('.', ',')} млн` : '';
    const rows = L.slice(0, 80).map(x => {
      const sideA = (x.playersA.map(id => this.mkPl(id)).join(', ') || '—') + money(x.cashAtoB);
      const sideB = (x.playersB.map(id => this.mkPl(id)).join(', ') || '—') + money(x.cashBtoA);
      return `<div class="tc-hrow">${x.ai ? '<span class="tc-badge ai">ИИ ⇄ ИИ</span>' : ''}<span>${esc(this.formatDate(x.day))}</span> ${this.cdTeam(x.teamA)} ⇄ ${this.cdTeam(x.teamB)}: ${sideA} <span class="arrow">за</span> ${sideB}</div>`;
    }).join('');
    return joke + `<div class="card"><h3>История обменов</h3><div class="tc-hist">${rows}</div></div>`;
  };

  /* ------------------------------------------------------------------ события */
  document.addEventListener('click', e => {
    const app = A(); if (!app || !app.state || !app.mk || !app.mk()) return;
    const t = e.target.closest ? e.target : null; if (!t) return;
    let b;
    if ((b = t.closest('[data-tr-sub]'))) { app._trSub = b.dataset.trSub; app.renderMarket(); return; }
    if ((b = t.closest('[data-tr-pl]'))) {
      const [side, id] = b.dataset.trPl.split(':'), tr = app.trState();
      const arr = side === 'mine' ? tr.mine : tr.theirs;
      const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id);
      // 14.7.36: точечное обновление строки и панели итога вместо renderMarket() целиком —
      // полный ре-рендер сбрасывал прокрутку списка игроков, и выбранный внизу списка игрок «улетал» наверх.
      const nowChecked = arr.includes(id);
      b.classList.toggle('on', nowChecked);
      const cb = b.querySelector('input[type="checkbox"]'); if (cb) cb.checked = nowChecked;
      const { my, other, mineSel, theirSel } = app.trSelected();
      if (other) { const dyn = $('tr-dyn'); if (dyn) dyn.innerHTML = app.trDynHtml(my, other, mineSel, theirSel, Number(tr.cash) || 0); }
      return;
    }
    if (t.closest('[data-tr-clear]')) { const tr = app.trState(); tr.mine = []; tr.theirs = []; tr.cash = 0; tr.round = 0; tr.counterOffer = null; tr.counterText = ''; tr.counterFinal = false; app.renderMarket(); return; }
    if (t.closest('[data-tr-result-close]')) { app.trCloseResult(); return; }
    if (t.closest('[data-tr-result-hist]')) { app.trCloseResult(); app._trSub = 'hist'; app.renderMarket(); return; }
    if (t.closest('[data-tr-go]')) { app.trSubmit(app.trState().round || 0); return; }
    if (t.closest('[data-tr-counter-apply]')) {
      const tr = app.trState(), co = tr.counterOffer; if (!co) return;
      const prevRound = tr.round || 0;
      if (co.swap) { const i = tr.mine.indexOf(co.swap.outId); if (i >= 0) tr.mine.splice(i, 1); if (!tr.mine.includes(co.swap.inId)) tr.mine.push(co.swap.inId); }
      tr.cash = co.money;
      app.trSubmit(prevRound);
      return;
    }
    if (t.closest('[data-tr-counter-dismiss]')) {
      const tr = app.trState(), wasFinal = !!tr.counterFinal;
      tr.counterOffer = null; tr.counterText = ''; tr.counterFinal = false;
      if (wasFinal) { tr.mine = []; tr.theirs = []; tr.cash = 0; tr.round = 0; app.renderMarket(); return; }
      const { my, other, mineSel, theirSel } = app.trSelected();
      if (other) { const dyn = $('tr-dyn'); if (dyn) dyn.innerHTML = app.trDynHtml(my, other, mineSel, theirSel, Number(tr.cash) || 0); }
      return;
    }
  });
  document.addEventListener('input', e => {
    const app = A(); if (!app || !app.state) return; const t = e.target;
    if (t.dataset && t.dataset.trCash !== undefined) { app.trState().cash = (+t.value) * 500000; app.trRefresh(); }
  });
  document.addEventListener('change', e => {
    const app = A(); if (!app || !app.state) return; const t = e.target;
    if (t.dataset && t.dataset.trOther !== undefined) { const tr = app.trState(); tr.other = t.value || null; tr.mine = []; tr.theirs = []; tr.cash = 0; tr.round = 0; tr.counterOffer = null; tr.counterText = ''; tr.counterFinal = false; app.renderMarket(); }
  });
})();
