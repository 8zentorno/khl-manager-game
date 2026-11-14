/* KHL Manager 14.7 — вкладка «Рынок»: свободные агенты, переговоры (до трёх раундов), мои контракты, обещания и требования, журнал. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const A = () => (typeof app !== 'undefined' ? app : null);
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fm = v => (v / 1e6).toFixed(1).replace('.', ',') + ' млн';
  const POS = { C: 'Центр', LW: 'Лев. край', RW: 'Прав. край', D: 'Защитник', G: 'Вратарь' };
  const TYPE_NAME = { '1-way': 'Односторонний', '2-way': 'Двусторонний', '3-way': 'Трёхсторонний' };
  const TYPE_SHORT = { '1-way': 'О', '2-way': 'Д', '3-way': 'Т' };
  const TABS = [['fa', 'Свободные агенты'], ['neg', 'Переговоры'], ['mine', 'Мои контракты'], ['prm', 'Обещания и запросы'], ['log', 'Журнал']];
  const PROMISE_CHAMP = [['', 'Без обещания'], ['top4', 'Войти в четвёрку конференции'], ['po', 'Выйти в плей-офф'], ['role', 'Место в первом звене'], ['nt', 'Не отпускать до конца сезона'], ['ext', 'Продлить контракт после сезона']];
  const PROMISE_CUP = [['', 'Без обещания'], ['cup1', 'Дойти до 1/4 финала'], ['cup2', 'Дойти до полуфинала'], ['cup3', 'Дойти до финала'], ['cup4', 'Выиграть Кубок Гагарина']];

  /* ------------------------------------------------------------------ вкладка */
  const baseSwitch = proto.switchTab;
  proto.switchTab = function (name) {
    const r = baseSwitch.apply(this, arguments);
    if (name === 'market') this.renderMarket();
    return r;
  };
  const baseAll = proto.renderAll;
  proto.renderAll = function () {
    const r = baseAll.apply(this, arguments);
    try { this.renderOverviewTransfers(); } catch (e) { console.warn('KHL Manager 14.7 transfers block:', e); }
    try { this.mkShowAlerts(); } catch (e) { console.warn('KHL Manager 14.7.4 alerts:', e); }
    try { this.marketBadge(); const v = $('view-market'); if (v && v.classList.contains('active')) this.renderMarket(); } catch (e) { console.warn('KHL Manager 14.7 market ui:', e); }
    return r;
  };
  // блок «Трансферы лиги» на «Обзоре»: последние подписания всех клубов, мой клуб подсвечен
  proto.renderOverviewTransfers = function () {
    const card = $('ov-trans-card'), box = $('ov-trans'); if (!card || !box) return;
    const m = this.mk(), list = m && m.transfers ? m.transfers.filter(x => x.kind === 'in').slice(0, 4) : [];
    card.hidden = false;
    if (!list.length) { box.innerHTML = '<div class="empty">Трансферов пока не было.</div>'; return; }
    const my = this.state.teamId, money = v => (v / 1e6).toFixed(1).replace('.', ',') + ' млн';
    box.innerHTML = `<div class="ov-news">${list.map(x => `<div class="ov-news-item${x.to === my ? ' mine' : ''}"><small>${esc(this.formatDate(x.day))}</small>${this.cdTeam(x.to)}: подписан ${this.mkPl(x.pid)} (${esc(this.positionLabel(x.pos))}, ${money(x.salary)}, до ${x.until})</div>`).join('')}</div>`;
  };
  proto.mkPl = function (id) {
    const p = this.marketPlayer(id); if (!p) return '';
    return this.db.players.some(x => x.id === id) ? `<span class="nm" data-pl="${esc(id)}">${esc(p.name)}</span>` : esc(p.name);
  };
  // вкладка «Трансферы» на странице клуба: пришли, ушли, продлены
  proto.clubTransfersHtml = function (id) {
    const m = this.mk(), L = m && m.transfers ? m.transfers.filter(x => x.to === id || x.from === id) : [];
    if (!L.length) return '<div class="cd-box"><p class="muted small" style="margin:0">Трансферов пока не было. Здесь появятся подписания, уходы и продления контрактов.</p></div>';
    const money = v => v ? (v / 1e6).toFixed(1).replace('.', ',') + ' млн' : '—';
    const where = x => {
      if (x.kind === 'in') { const pv = x.prev || (String(x.from).startsWith('prev:') ? String(x.from).slice(5) : ''); return (x.from === 'FA' || pv) ? 'свободный агент' + (pv && this.teamById(pv) ? ' (ранее ' + this.cdTeam(pv) + ')' : '') : this.cdTeam(x.from); }
      if (x.kind === 'out') return 'расторжение, свободный агент';
      return '—';
    };
    const kind = x => x.kind === 'in' ? '<span class="cd-chip g">Пришёл</span>' : x.kind === 'out' ? '<span class="cd-chip y">Ушёл</span>' : '<span class="cd-chip">Продлён</span>';
    const rows = L.slice(0, 80).map(x => `<tr class="cd-tr"><td>${esc(this.formatDate(x.day))}</td><td>${this.mkPl(x.pid)} · ${esc(this.positionLabel(x.pos))}</td><td>${kind(x)}</td><td>${where(x)}</td><td>${x.kind === 'out' ? '—' : money(x.salary) + (x.until ? ' · до ' + x.until : '')}</td></tr>`).join('');
    return `<div class="cd-box"><h4>Трансферы</h4><div class="cd-tw"><table class="cd-tbl"><thead><tr><th>Дата</th><th>Игрок</th><th>Событие</th><th>Откуда</th><th>Контракт</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };
  proto.openTransferNews = function () { if (this.setNewsFilter) this.setNewsFilter('transfer'); this.switchTab('news'); };
  proto.marketBadge = function () {
    const b = document.querySelector('#main-nav [data-view="market"] .mk-badge'); if (!b) return;
    const n = this.mk() ? this.openRequests().length + this.thinkingList().filter(x => !x.seen).length : 0;
    b.textContent = n; b.classList.toggle('hidden', !n);
  };

  proto.renderMarket = function () {
    const host = $('view-market'); if (!host || !this.state) return;
    if (!this.mk()) { host.innerHTML = '<div class="card"><p class="muted">Рынок недоступен в этой карьере.</p></div>'; return; }
    const tab = this._mkTab || 'fa', cs = this.capStatus(this.state.teamId), w = this.marketWindow(), m = this.mk();
    const pct = Math.min(100, cs.payroll / (this.MARKET.cap * 1.25) * 100), capPct = this.MARKET.cap / (this.MARKET.cap * 1.25) * 100, floorPct = this.MARKET.floor / (this.MARKET.cap * 1.25) * 100;
    const nReq = this.openRequests().length;
    host.innerHTML = `<div class="section-head"><div><h2>Рынок игроков</h2><p class="small muted">Свободные агенты, продление и расторжение контрактов. Потолок зарплат ${this.MARKET.cap / 1e6} млн, пол ${this.MARKET.floor / 1e6} млн.</p></div></div>`
      + `<div class="mk-cap card"><div class="mk-cap-top"><div><span class="label">Фонд зарплат</span><b class="${cs.over ? 'mk-bad' : ''}">${fm(cs.payroll)}</b></div>`
      + `<div><span class="label">${cs.over ? 'Выше потолка' : 'До потолка'}</span><b class="${cs.over ? 'mk-bad' : 'mk-good'}">${fm(Math.abs(cs.room))}</b></div>`
      + `<div><span class="label">Репутация клуба</span><b>${Math.round(m.rep)}</b></div>`
      + `<div><span class="label">Трансферное окно</span><b class="${w.open ? 'mk-good' : 'mk-bad'}">${w.open ? 'до 31 января · ' + w.daysLeft + ' дн.' : 'закрыто'}</b></div></div>`
      + `<div class="mk-bar"><i style="width:${pct}%" class="${cs.over ? 'over' : ''}"></i><s style="left:${floorPct}%" title="Пол"></s><s style="left:${capPct}%" class="cap" title="Потолок"></s></div>`
      + `<p class="tiny muted" style="margin:.3rem 0 0">${cs.over ? 'Фонд выше потолка на ' + fm(Math.abs(cs.room)) + '. Продлить можно без повышения зарплаты, подписать свободного агента только по минимуму (1 млн, 1 год) при нехватке игроков. Пока фонд не опустится ниже потолка, остальное закрыто.' : cs.belowFloor ? 'Фонд ниже пола: не хватает ' + fm(cs.toFloor) + '.' : 'Фонд в допустимых границах.'}${m.capCharges[this.state.teamId] ? ' В фонд включены компенсации за расторжение: ' + fm(m.capCharges[this.state.teamId]) + '.' : ''}</p></div>`
      + `<div class="mk-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" class="${tab === k ? 'on' : ''}" data-mk-tab="${k}">${l}${k === 'prm' && nReq ? ` <span class="mk-badge-inline">${nReq}</span>` : ''}${k === 'neg' && this.thinkingList().length ? ` <span class="mk-badge-inline">${this.thinkingList().length}</span>` : ''}</button>`).join('')}</div>`
      + `<div id="mk-body">${this['mkTab_' + tab]()}</div>`;
  };

  /* ------------------------------------------------------------------ свободные агенты */
  const FILTER0 = { pos: 'all', fo: 'all', sort: 'ovr', dir: -1, q: '' };
  proto.mkTab_fa = function () {
    const f = this._mkF || (this._mkF = { ...FILTER0 });
    let list = this.marketPool().filter(p => (f.pos === 'all' || (f.pos === 'F' ? ['LW', 'C', 'RW'].includes(p.pos) : p.pos === f.pos)) && (f.fo === 'all' || (f.fo === 'ru' ? !p.foreign : !!p.foreign))
      && (!f.q || p.name.toLowerCase().includes(f.q.toLowerCase())));
    const val = { name: p => p.name, pos: p => p.pos, age: p => this.ageYears(p), ovr: p => p.ovr, ask: p => this.askSalary(p) };
    const g = val[f.sort] || val.ovr;
    list.sort((a, b) => { const x = g(a), y = g(b); return (typeof x === 'string' ? x.localeCompare(y, 'ru') : x - y) * f.dir || b.ovr - a.ovr; });
    const seg = (key, opts) => `<span class="mk-seg">${opts.map(([v, l]) => `<button type="button" class="${f[key] === v ? 'on' : ''}" data-mk-f="${key}" data-v="${v}">${l}</button>`).join('')}</span>`;
    const th = (k, l, c) => `<th class="${c || ''} sortable${f.sort === k ? ' sorted' : ''}" data-mk-sort="${k}" role="button" tabindex="0">${l}${f.sort === k ? (f.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    const rows = list.slice(0, 120).map(p => {
      const noRoom = !this.thinkOf(p.id) && this.maxOfferSalary(p, this.state.teamId, 'fa') <= 0;
      const t = p.prevTeam && this.teamById(p.prevTeam), th = this.thinkOf(p.id), cd = !!th || (this.mk().cooldown[p.id] || 0) > (this.state.dayIndex || 0);
      return `<tr class="mk-row${cd ? ' cd' : ''}" data-mk-open="${esc(p.id)}"><td class="team-cell finx-name"><b>${esc(p.name)}</b>${p.foreign ? '<span class="mk-leg">Легионер</span>' : ''}`
        + `<span class="finx-sub">${this.positionLabel(p.pos)} · ${this.ageText(Math.floor(this.ageYears(p)))} · ${p.ovr}${t ? ' · ' + esc(t.name) : ''}</span></td>`
        + `<td class="finx-h">${this.positionLabel(p.pos)}</td><td class="finx-h numeric">${Math.floor(this.ageYears(p))}</td><td class="numeric"><b>${p.ovr}</b></td>`
        + `<td class="finx-h">${t ? esc(t.name) : '—'}</td><td class="numeric">${fm(this.askSalary(p))}</td><td class="finx-act"><button type="button" class="mk-btn${cd || noRoom ? '' : ' pri'}" data-mk-open="${esc(p.id)}">${th ? 'Думает' : cd ? 'Позже' : noRoom ? 'Нет места' : 'Подписать'}</button></td></tr>`;
    }).join('');
    return `<div class="card"><div class="mk-filters"><div><span class="label">Позиция</span>${seg('pos', [['all', 'Все'], ['F', 'Напад.'], ['D', 'Защ.'], ['G', 'Врат.']])}</div>`
      + `<div><span class="label">Гражданство</span>${seg('fo', [['all', 'Все'], ['ru', 'Россия'], ['f', 'Легион.']])}</div>`
      + `<div class="mk-q"><input type="search" data-mk-q placeholder="Поиск по фамилии" value="${esc(f.q)}" aria-label="Поиск игрока"></div></div>`
      + `<p class="tiny muted" style="margin:.2rem 0 .5rem">Найдено: ${list.length}${list.length > 120 ? ' (показаны первые 120)' : ''}. Нажмите на игрока, чтобы подписать контракт.</p>`
      + `<div class="table-wrap"><table class="data-table finx mk-table"><thead><tr>${th('name', 'Игрок')}${th('pos', 'Поз.', 'finx-h')}${th('age', 'Возр.', 'finx-h numeric')}${th('ovr', 'Рейт.', 'numeric')}<th class="finx-h">Прежний клуб</th>${th('ask', 'Желает', 'numeric')}<th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">Никого не найдено.</td></tr>'}</tbody></table></div></div>`;
  };

  /* ------------------------------------------------------------------ переговоры: игроки, которые думают */
    proto.mkTab_neg = function () {
    const L = this.thinkingList(), day = Number(this.state.dayIndex || 0);
    L.forEach(x => { x.seen = true; });
    setTimeout(() => { try { this.marketBadge(); } catch (e) { } }, 0);
    const R = (this.mk().results || []).slice(0, 10);
    const done = R.length ? `<div class="card"><h3>Завершённые</h3>${R.map(r => `<div class="mk-log ${r.mine ? 'mine' : 'bad'}"><span>${esc(this.formatDate(r.day))}</span><p>${esc(r.name)}: ${r.winner ? (r.mine ? 'выбрал ваш клуб' : 'выбрал ' + esc((this.teamById(r.winner) || {}).name || '') + (r.why ? ' (' + esc(r.why) + ')' : '')) : 'отказал всем предложениям'}</p></div>`).join('')}</div>` : '';
    if (!L.length) return '<div class="card"><p class="muted" style="margin:0">Сейчас никто не обдумывает ваши предложения. Если игрок сомневается, он возьмёт паузу на 3 дня, а за это время ему могут написать другие клубы.</p></div>' + done;
    const W = ([t, c]) => `<span class="w ${c}">${esc(t)}</span>`;
    return L.map(th => {
      const p = this.marketPlayer(th.pid); if (!p) return '';
      const left = Math.max(0, th.until - day), ev = this.evaluateOffer(p, th.teamId, { ...th.offer, kind: 'fa' }), wd = this.marketWords(ev, th.offer, th.teamId);
      const ask = this.askSalary(p);
      const rivals = th.rivals.length ? th.rivals.map(r => {
        const e2 = this.evaluateOffer(p, r.teamId, { salary: r.salary, years: r.years, type: r.type, promises: [], round: 0, kind: 'fa' }), w2 = this.marketWords(e2, r, r.teamId);
        return `<div class="mk-rival"><b>${this.cdTeam(r.teamId)}</b>: ${fm(r.salary)} · ${this.ageText(r.years)} · ${TYPE_NAME[r.type] || r.type} · ${esc(r.role || '')}<div class="mk-wl">${W(w2.money)} ${W(w2.status)} ${W(w2.desire)}</div></div>`;
      }).join('') : '<p class="tiny muted" style="margin:.3rem 0 0">Других предложений пока нет.</p>';
      return `<div class="card mk-neg"><div class="mk-dh"><div><h3>${this.mkPl(p.id) || esc(p.name)}</h3><div class="small muted">${this.positionLabel(p.pos)} · ${this.ageText(Math.floor(this.ageYears(p)))} · рейтинг ${Math.round(this.permanentOVR(p))} · решит через ${left} дн.</div></div></div>`
        + `<h4 class="mk-h">Ваше предложение</h4><div class="mk-line">${fm(th.offer.salary)} · ${this.ageText(th.offer.years)} · ${TYPE_NAME[th.offer.type] || th.offer.type}${th.offer.promises.length ? ' · обещания: ' + esc(th.offer.promises.map(k => this.PROMISE_KINDS[k]).join('; ')) : ''}</div>`
        + `<div class="mk-wl">${W(wd.money)} ${W(wd.status)} ${W(wd.desire)} ${W(wd.role)} ${W(wd.length)} ${W(wd.promise)}</div>`
        + `<h4 class="mk-h">Конкуренты</h4>${rivals}`
        + `<div class="mk-acts" style="margin-top:.6rem"><button type="button" class="btn btn-primary" data-mk-impr="${esc(p.id)}" ${th.improves >= 2 ? 'disabled' : ''}>Улучшить предложение (${th.improves} из 2)</button><button type="button" class="btn" data-mk-wd="${esc(p.id)}">Отозвать</button></div></div>`;
    }).join('') + done;
  };
  proto.mkOpenImprove = function (pid) {
    const th = this.thinkOf(pid), p = this.marketPlayer(pid); if (!th || !p) return;
    this._mk = { pid, kind: 'fa', round: 0, log: [], salary: th.offer.salary, years: th.offer.years, type: th.offer.type, promise: (th.offer.promises || []).find(k => !this.isCupPromise(k)) || '', promiseCup: (th.offer.promises || []).find(k => this.isCupPromise(k)) || '', help: false, done: false, ended: false, ask: this.askSalary(p), improve: true };
    this.mkRenderDeal();
  };

  /* ------------------------------------------------------------------ мои контракты */
  proto.mkTab_mine = function () {
    const my = this.state.teamId, m = this.mk();
    const list = this.teamPlayers(my).slice().sort((a, b) => (Number(a.contractUntil) || 9999) - (Number(b.contractUntil) || 9999) || b.salary - a.salary);
    const rows = list.map(p => {
      const left = this.yearsLeft(p), prs = this.promisesOf(p.id), ext = p.nextSalary ? ` <span class="finx-chip" title="Зарплата со следующего сезона">→ ${fm(p.nextSalary)}</span>` : '';
      return `<tr><td class="team-cell finx-name"><b data-pl="${esc(p.id)}">${esc(p.name)}</b>${p.foreign ? '<span class="mk-leg">Легионер</span>' : ''}${prs.length ? ` <span class="finx-chip" title="${esc(prs.map(x => this.PROMISE_KINDS[x.kind]).join('; '))}">обещ. ${prs.length}</span>` : ''}`
        + `<span class="finx-sub">${this.positionLabel(p.pos)} · ${this.ageText(Math.floor(this.ageYears(p)))} · ${Math.round(this.permanentOVR(p))} · ${TYPE_SHORT[p.contract] || '—'} · до ${p.contractUntil}</span></td>`
        + `<td class="finx-h">${this.positionLabel(p.pos)}</td><td class="finx-h numeric">${Math.floor(this.ageYears(p))}</td><td class="numeric">${Math.round(this.permanentOVR(p))}</td>`
        + `<td class="finx-h${left <= 1 ? ' soon' : ''}">${TYPE_SHORT[p.contract] || '—'} · до ${p.contractUntil}</td><td class="numeric"><b>${(p.salary / 1e6).toFixed(1)}</b>${ext}</td>`
        + `<td class="finx-act mk-acts"><button type="button" class="mk-btn pri" data-mk-ext="${esc(p.id)}">Продлить</button><button type="button" class="mk-btn dan" data-mk-term="${esc(p.id)}">Расторгнуть</button></td></tr>`;
    }).join('');
    return `<div class="card"><p class="tiny muted" style="margin:0 0 .5rem">Контракт заканчивается после сезона в указанный год. Продление действует со следующего сезона. Расторжение клубом возможно только в межсезонье, по соглашению — когда игрок недоволен или мало играет.</p>`
      + `<div class="table-wrap"><table class="data-table finx mk-table"><thead><tr><th>Игрок</th><th class="finx-h">Поз.</th><th class="finx-h numeric">Возр.</th><th class="numeric">Рейт.</th><th class="finx-h">Контракт</th><th class="numeric">Зарплата, млн</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };

  /* ------------------------------------------------------------------ обещания и запросы */
  proto.mkTab_prm = function () {
    const m = this.mk(), rq = this.openRequests();
    const reqHtml = rq.length ? rq.map(r => {
      const p = this.marketPlayer(r.pid), thr = this.persuadeThreshold(r), days = r.until == null ? null : Math.max(0, r.until - (this.state.dayIndex || 0));
      const raise = r.kind === 'veteran' ? '' : `<div class="mk-raise"><label>Прибавка к зарплате: <b data-mk-rv="${r.id}">${thr}</b>%</label><input type="range" min="5" max="40" value="${thr}" data-mk-rs="${r.id}"><span class="tiny muted">Игрок остаётся при прибавке от ${thr}%.</span></div>`;
      return `<div class="mk-req"><div><b>${esc(p ? p.name : '')}</b><p>${esc(r.text)}</p>${days != null ? `<span class="tiny muted">Решение через ${days} дн.: иначе игрок уйдёт сам.</span>` : ''}</div>${raise}`
        + `<div class="mk-acts">${r.kind === 'veteran' ? '' : `<button type="button" class="btn btn-primary" data-mk-pers="${r.id}">Уговорить</button>`}<button type="button" class="btn" data-mk-rel="${r.id}">${r.kind === 'veteran' ? 'Отпустить' : 'Расторгнуть по соглашению'}</button><button type="button" class="btn btn-quiet" data-mk-ref="${r.id}">${r.kind === 'veteran' ? 'Отказать' : 'Пусть уходит'}</button></div></div>`;
    }).join('') : '<p class="muted">Открытых требований нет.</p>';
    const act = m.promises.filter(x => x.status === 'active'), done = m.promises.filter(x => x.status !== 'active' && x.status !== 'void').slice(-8).reverse();
    const prHtml = act.length ? act.map(pr => {
      const p = this.marketPlayer(pr.pid), g = this.promiseProgress(pr);
      return `<div class="mk-prm"><div><b>${esc(p ? p.name : '')}</b> — ${esc(this.PROMISE_KINDS[pr.kind])}<div class="tiny muted">${esc(g.text)}</div></div><div class="mk-pbar"><i style="width:${g.pct}%" class="${g.ok ? 'ok' : 'bad'}"></i></div></div>`;
    }).join('') : '<p class="muted">Активных обещаний нет. Их можно давать при подписании и продлении.</p>';
    const doneHtml = done.length ? `<h4 class="mk-h">Закрытые</h4>` + done.map(pr => { const p = this.marketPlayer(pr.pid); return `<div class="mk-done ${pr.status}"><span>${esc(p ? p.name : '')} — ${esc(this.PROMISE_KINDS[pr.kind])}</span><em>${pr.status === 'kept' ? 'выполнено' : pr.status === 'broken' ? 'нарушено' : 'урегулировано'}</em></div>`; }).join('') : '';
    return `<div class="card"><h3>Требования игроков</h3>${reqHtml}</div><div class="card"><h3>Обещания клуба</h3><p class="tiny muted">Проверяются в конце регулярного чемпионата. Нарушенное обещание даёт игроку 14 дней на решение, а репутация клуба падает.</p>${prHtml}${doneHtml}</div>`;
  };
  // {p:ID} → ссылка на игрока, {t:ID} → ссылка на клуб
  proto.mkRich = function (text) {
    return esc(text).replace(/\{p:([^}]+)\}/g, (m, id) => {
      const p = this.marketPlayer(id); if (!p) return '';
      return (this.db.players.some(x => x.id === id) ? `<span class="nm" data-pl="${esc(id)}">${esc(p.name)}</span>` : esc(p.name));
    }).replace(/\{t:([^}]+)\}/g, (m, id) => this.cdTeam ? this.cdTeam(id) : esc((this.teamById(id) || {}).name || id));
  };
  proto.mkTab_log = function () {
    const m = this.mk(), L = m.log.slice(0, 80);
    return `<div class="card">${L.length ? L.map(x => `<div class="mk-log ${x.kind}"><span>${esc(this.formatDate(x.day))}</span><p>${this.mkRich(x.text)}</p></div>`).join('') : '<p class="muted">Событий пока нет.</p>'}</div>`;
  };

  /* ------------------------------------------------------------------ окно переговоров */
  proto.mkOpenDeal = function (pid, kind) {
    const p = this.marketPlayer(pid); if (!p) return;
    const ask = this.askSalary(p), types = ['1-way', '2-way', '3-way'];
    const def = TYPE_NAME[p.contract] && (p.contract !== '1-way' || this.ageYears(p) > this.CONTRACT_RULES.maxOneWayAge) ? p.contract : '2-way';
    const mx0 = this.maxOfferSalary(p, this.state.teamId, kind);
    this._mk = { pid, kind, round: 0, log: [], salary: mx0 > 0 ? Math.min(ask, mx0) : ask, years: Math.min(kind === 'ext' ? 5 : 4, this.wantYears(p)), type: def, promise: '', promiseCup: '', help: false, done: false, ended: false, ask };
    this.mkRenderDeal();
  };
  proto.mkOffer = function () { const d = this._mk; return { salary: d.salary, years: d.years, type: d.type, promises: [d.promise, d.promiseCup].filter(Boolean), round: d.round, kind: d.kind }; };
  proto.mkRenderDeal = function () {
    const d = this._mk; if (!d) return;
    const p = this.marketPlayer(d.pid); if (!p) return;
    let modal = $('mk-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'mk-modal'; modal.className = 'pg-scrim mk-scrim'; document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) this.mkClose(); }); }
    const my = this.state.teamId, t = this.teamById(my), max = d.kind === 'ext' ? 5 : 4, cd = (this.mk().cooldown[p.id] || 0) > (this.state.dayIndex || 0);
    const types = ['1-way', '2-way', '3-way'];
    const sl = this.mkSliderHtml(d, p);
    modal.innerHTML = `<div class="pg-dlg mk-dlg" role="dialog" aria-modal="true" aria-label="${d.kind === 'ext' ? 'Продление' : 'Подписание'}"><div class="mk-dh"><div><h3>${esc(p.name)}</h3><div class="small muted">${POS[p.pos] || p.pos} · ${this.ageText(Math.floor(this.ageYears(p)))} · рейтинг ${Math.round(this.permanentOVR(p))}${p.foreign ? ' · легионер' : ''} · ${d.kind === 'ext' ? 'продление в ' : 'предложение от '}${esc(t ? t.name : '')}</div></div><button type="button" class="mk-x" data-mk-close aria-label="Закрыть">×</button></div>`
      + `<div class="mk-ask">Желает: <b>${fm(d.ask)}</b> в год на <b>${this.ageText(this.wantYears(p))}</b>${d.kind === 'ext' ? ` · сейчас ${fm(p.salary)}` : ''}</div>`
      + `<div class="mk-ctl"><label>Зарплата: <b id="mk-sv">${fm(d.salary)}</b></label>${sl}</div>`
      + `<div class="mk-ctl"><label>Срок</label><span class="mk-seg">${Array.from({ length: max }, (_, i) => i + 1).map(n => `<button type="button" class="${d.years === n ? 'on' : ''}" data-mk-years="${n}">${n}</button>`).join('')}</span></div>`
      + `<div class="mk-ctl"><label>Тип контракта</label><span class="mk-seg">${types.map(k => `<button type="button" class="${d.type === k ? 'on' : ''}" data-mk-type="${k}" title="${TYPE_NAME[k]}">${TYPE_NAME[k]}</button>`).join('')}</span></div>`
      + `<div class="mk-ctl"><label>Обещание на чемпионат</label><select data-mk-prom="champ">${PROMISE_CHAMP.map(([v, l]) => `<option value="${v}" ${d.promise === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`
      + `<div class="mk-ctl"><label>Обещание на Кубок Гагарина</label><select data-mk-prom="cup">${PROMISE_CUP.map(([v, l]) => `<option value="${v}" ${d.promiseCup === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`
      + `<div id="mk-eval"></div><div id="mk-msg"></div>`
      + `<div class="pg-btns"><button type="button" class="btn btn-primary" id="mk-go" ${d.done || d.ended || cd ? 'disabled' : ''}>${d.improve ? 'Улучшить предложение · ' + (this.thinkOf(d.pid) ? this.thinkOf(d.pid).improves + 1 : 1) + ' из 2' : 'Предложить · раунд ' + Math.min(d.round + 1, this.MARKET.rounds) + ' из ' + this.MARKET.rounds}</button><button type="button" class="btn" data-mk-close>${d.done ? 'Готово' : 'Закрыть'}</button></div></div>`;
    this.mkRefreshEval();
  };
  // ползунок зарплаты: верх ограничен местом под потолком (для продления — текущая зарплата + место)
  proto.mkSliderHtml = function (d, p) {
    const mx = this.maxOfferSalary(p, this.state.teamId, d.kind), lock = d.done || d.ended;
    const want = Math.round(d.ask * 0.7 / 500000), maxU = Math.round(mx / 500000);
    if (mx <= 0) return `<p class="tiny mk-bad" style="margin:.2rem 0 0">Для этого клуба сейчас нет места под потолком: увеличить фонд нельзя.</p>`;
    const minU = maxU < want ? Math.min(2, maxU) : want, hi = Math.max(minU, Math.min(maxU, Math.round(d.ask * 1.6 / 500000)));
    d.salary = Math.max(minU * 500000, Math.min(hi * 500000, d.salary));
    return `<input type="range" id="mk-sal" min="${minU}" max="${hi}" value="${Math.round(d.salary / 500000)}" ${lock || hi <= minU ? 'disabled' : ''}>${mx < Math.round(d.ask * 1.6 / 500000) * 500000 ? `<p class="tiny muted" style="margin:.2rem 0 0">Больше ${fm(hi * 500000)} предложить нельзя: не хватает места под потолком.</p>${d.ask > hi * 500000 ? `<p class="tiny" style="margin:.2rem 0 0"><b>Нужно освободить ${fm(Math.max(500000, Math.ceil((d.ask - hi * 500000) / 500000) * 500000))}</b> под потолком, чтобы дать ${fm(d.ask)}. <span class="nm" role="button" tabindex="0" onclick="app.mkClose();app.switchTab('finances',document.querySelector('[data-view=finances]'))">Посмотреть контракты</span></p>` : ''}` : ''}`;
  };
  proto.mkRefreshEval = function () {
    const d = this._mk, box = $('mk-eval'); if (!d || !box) return;
    const p = this.marketPlayer(d.pid), my = this.state.teamId;
    const ev = this.evaluateOffer(p, my, this.mkOffer());
    const wd = this.marketWords(ev, this.mkOffer(), my), W = ([t, c]) => `<span class="w ${c}">${esc(t)}</span>`;
    const row = (n, w) => `<div class="mk-f"><span>${n}</span><span class="mk-w">${W(w)}</span></div>`;
    const cs = this.capStatus(my), delta = d.kind === 'ext' ? d.salary - (Number(p.nextSalary) || p.salary) : d.salary, block = this.dealCheck(p, my, this.mkOffer(), d.kind);
    const vd = ev.verdict === 'accept' ? ['g', 'Склоняется к согласию'] : ev.verdict === 'counter' ? ['y', d.kind === 'fa' && !d.improve ? 'Сомневается: возьмёт паузу' : 'Сомневается'] : ['r', 'Откажет'];
    box.innerHTML = `<div class="mk-eval">${row('Деньги', wd.money)}${row('Статус клуба', wd.status)}${row('Желание', wd.desire)}${row('Роль', wd.role)}${row('Срок', wd.length)}${row('Обещания', wd.promise)}`
      + `<p class="mk-verd-row"><span class="mk-verd ${vd[0]}">${vd[1]}</span><button type="button" class="mk-btn" data-mk-help>? Что это значит</button></p>`
      + (d.help ? `<dl class="mk-help"><dt>Деньги</dt><dd>Насколько зарплата устраивает игрока. Если ниже ожиданий, поднимите её.</dd><dt>Статус клуба</dt><dd>Насколько клуб силён и престижен: от аутсайдера до лидера лиги. Сильные игроки тянутся к сильным клубам.</dd><dt>Желание</dt><dd>Личное отношение игрока именно к вашему клубу: симпатия, тренер, арена и болельщики, дух команды, для легионеров другие легионеры в составе. Меняется только выбором клуба и ростом команды.</dd><dt>Роль</dt><dd>Какое место игрок займёт: звено у нападающих, пара у защитников, номер у вратарей. Звёзды не любят запас.</dd><dt>Срок</dt><dd>Насколько длина контракта близка к желаемой: молодые хотят подольше, ветераны покороче.</dd><dt>Обещания</dt><dd>Насколько игрок верит вашим обещаниям. Зависит от силы клуба и репутации; второе правдоподобное обещание добавляет доверия.</dd></dl>` : '')
      + `</div><p class="tiny ${block ? 'mk-bad' : 'muted'}" style="margin:.35rem 0 0">${block ? esc(block) : 'Фонд после подписания: ' + fm(cs.payroll + this.capReserved(my, p.id) + Math.max(0, delta)) + ' из ' + this.MARKET.cap / 1e6 + ' млн'}</p>`;
    const sv = $('mk-sv'); if (sv) sv.textContent = fm(d.salary);
    const go = $('mk-go'); if (go) go.disabled = !!(d.done || d.ended || block);
  };
  proto.mkSubmit = function () {
    const d = this._mk; if (!d || d.done || d.ended) return;
    if (d.improve) {
      const r = this.marketThinkImprove(d.pid, this.mkOffer());
      if (r.ok) { this.persistQuietly && this.persistQuietly(); this.mkClose(); this.renderMarket(); this.setNotice && this.setNotice(r.text); }
      else { const mm = $('mk-msg'); if (mm) mm.innerHTML = `<div class="res bad">${esc(r.text)}</div>`; }
      return;
    }
    const res = this.negotiate(d.pid, this.state.teamId, this.mkOffer(), d.kind);
    const msg = $('mk-msg');
    if (res.blocked) { if (msg) msg.innerHTML = `<div class="res bad">${esc(res.text)}</div>`; return; }
    d.log.push(`Раунд ${d.round + 1}: ${res.text}`);
    if (res.thinking) { d.ended = true; this.persistQuietly && this.persistQuietly(); this.setNotice && this.setNotice(res.text); this._mkTab = 'neg'; this.mkClose(); return; }
    if (res.done) { d.done = true; this.persistQuietly && this.persistQuietly(); this.setNotice && this.setNotice(`${this.marketPlayer(d.pid).name}: ${res.text}`); }
    else if (res.ended) d.ended = true;
    else d.round++;
    this.mkRenderDeal();
    const m2 = $('mk-msg');
    if (m2) m2.innerHTML = d.log.map(x => `<div class="mk-logline">${esc(x)}</div>`).join('')
      + (res.done && d.kind === 'ext' ? (() => { const q = this.marketPlayer(d.pid); return `<div class="res good"><b>✅ Контракт продлён</b> до ${q.contractUntil}: ${fm(q.nextSalary || q.salary)} в год со следующего сезона. Окно можно закрыть.</div>`; })() : '')
      + (res.ev && res.ev.counter && !d.done && !d.ended ? `<button type="button" class="btn btn-primary" data-mk-counter="${res.ev.counter.salary}">Принять и подписать: ${fm(res.ev.counter.salary)}</button>` : '');
    if (d.done || d.ended) { this.renderAll(); }
  };

  /* ------------------------------------------------------------------ окна: предложение конкурента и итог торгов */
  proto.mkBusyModal = function () {
    if (!this.state || this.state.objectiveModal) return true;
    if (this.liveMatch && !this.liveMatch.finished) return true;   // 14.7.10: во время матча окна рынка не показываем — только после его окончания
    return !!document.querySelector('#objective-modal-overlay, .pg-scrim, .modal-overlay.open, #pregame-modal');
  };
  proto.mkNextAlert = function () {
    const m = this.mk(); if (!m) return null;
    for (const th of (m.thinking || [])) { const r = th.rivals.find(x => !x.seen); if (r) return { kind: 'rival', th, r }; }
    const res = (m.results || []).find(x => !x.seen); if (res) return { kind: 'result', res };
    return null;
  };
  proto.mkShowAlerts = function () {
    if (!this.mk() || $('mk-alert') || this.mkBusyModal()) return;
    const a = this.mkNextAlert(); if (!a) return;
    const day = Number(this.state.dayIndex || 0), W = ([t, c]) => `<span class="w ${c}">${esc(t)}</span>`;
    let html = '';
    if (a.kind === 'rival') {
      const p = this.marketPlayer(a.th.pid); if (!p) { a.r.seen = true; return; }
      const e2 = this.evaluateOffer(p, a.r.teamId, { salary: a.r.salary, years: a.r.years, type: a.r.type, promises: [], round: 0, kind: 'fa' }), w2 = this.marketWords(e2, a.r, a.r.teamId);
      a.r.seen = true; a.th.seenDay = day;
      const left = Math.max(this.MARKET.minAnswerDays, a.th.until - day);
      html = `<div class="mk-dh"><div><h3>Предложение от клуба: ${this.cdTeam(a.r.teamId)}</h3><div class="small muted">${esc(p.name)} · ${this.positionLabel(p.pos)} · ${this.ageText(Math.floor(this.ageYears(p)))}</div></div></div>`
        + `<div class="mk-rival"><b>${fm(a.r.salary)}</b> · ${this.ageText(a.r.years)} · ${TYPE_NAME[a.r.type] || a.r.type} · ${esc(a.r.role || '')}<div class="mk-wl">${W(w2.money)} ${W(w2.status)} ${W(w2.desire)}</div></div>`
        + `<p class="small">Ваше предложение: ${fm(a.th.offer.salary)} · ${this.ageText(a.th.offer.years)}. Игрок решит не раньше чем через ${left} дн.</p>`
        + `<div class="pg-btns"><button type="button" class="btn btn-primary" data-mk-al="outbid" data-pid="${esc(p.id)}">Перебить</button><button type="button" class="btn" data-mk-al="keep">Оставить как есть</button><button type="button" class="btn" data-mk-al="wd" data-pid="${esc(p.id)}">Отозвать</button></div>`;
    } else {
      const r = a.res; r.seen = true;
      const who = r.winner ? (r.mine ? 'ваш клуб' : this.cdTeam(r.winner)) : null;
      html = `<div class="mk-dh"><div><h3>${r.winner ? (r.mine ? esc(r.name) + ' выбрал ваш клуб' : esc(r.name) + ' выбрал другой клуб') : esc(r.name) + ' отказал всем'}</h3><div class="small muted">${esc(this.formatDate(r.day))} · ${this.positionLabel(r.pos)}</div></div></div>`
        + (r.winner ? `<p>${r.mine ? 'Контракт подписан: ' + fm(r.my.salary) + ', ' + this.ageText(r.my.years) + '.' : `Выбор: ${who}, ${fm(r.won.salary)}, ${this.ageText(r.won.years)}. Ваше предложение: ${fm(r.my.salary)}, ${this.ageText(r.my.years)}.`}</p>` : '')
        + (r.why ? `<p class="small muted">Причина: ${esc(r.why)}.</p>` : '')
        + `<div class="pg-btns"><button type="button" class="btn btn-primary" data-mk-al="ok">Понятно</button><button type="button" class="btn" data-mk-al="neg">К переговорам</button></div>`;
    }
    const el = document.createElement('div'); el.id = 'mk-alert'; el.className = 'pg-scrim mk-scrim';
    el.innerHTML = `<div class="pg-dlg mk-dlg" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);
    this.persistQuietly && this.persistQuietly(); this.marketBadge();
  };
  // после окончания матча показываем отложенные предложения и итоги торгов
  const _clmAlert = proto.completeLiveMatch;
  if (typeof _clmAlert === 'function') proto.completeLiveMatch = function () {
    const r = _clmAlert.apply(this, arguments);
    setTimeout(() => { try { this.mkShowAlerts(); } catch (e) { } }, 400);
    return r;
  };
  proto.mkCloseAlert = function () { const el = $('mk-alert'); if (el) el.remove(); setTimeout(() => { try { this.mkShowAlerts(); } catch (e) { } }, 0); };
  proto.mkClose = function () { const m = $('mk-modal'); if (m) m.remove(); this._mk = null; this._mkT = null; if (this.renderMarket) this.renderMarket(); };

  /* ------------------------------------------------------------------ расторжение */
  proto.mkOpenTerm = function (pid) {
    const p = this.marketPlayer(pid); if (!p) return;
    this._mkT = { pid, sum: this.mutualNeed(p) };
    this.mkRenderTerm();
  };
  proto.mkRenderTerm = function (msg, cls) {
    const t = this._mkT; if (!t) return;
    const p = this.marketPlayer(t.pid); if (!p) return;
    let modal = $('mk-modal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'mk-modal'; modal.className = 'pg-scrim mk-scrim'; document.body.appendChild(modal); modal.addEventListener('click', e => { if (e.target === modal) this.mkClose(); }); }
    const comp = this.compensation(p), w = this.clubTerminationWindow(), av = this.mutualAvailable(p), need = this.mutualNeed(p);
    modal.innerHTML = `<div class="pg-dlg mk-dlg" role="dialog" aria-modal="true"><div class="mk-dh"><div><h3>Расторжение: ${esc(p.name)}</h3><div class="small muted">Контракт до ${p.contractUntil}, ${fm(p.salary)} в год, осталось сезонов: ${Math.max(1, this.yearsLeft(p))}</div></div><button type="button" class="mk-x" data-mk-close aria-label="Закрыть">×</button></div>`
      + `<p class="small">По правилам КХЛ клуб платит игроку 25% контракта, если остался год, и ещё 20% за каждый следующий год. Выплата идёт в потолок зарплат. По соглашению сумму можно обсудить.</p>`
      + `<div class="mk-term"><b>По инициативе клуба</b><p class="tiny muted">${w.open ? 'Выплата ' + fm(comp) + '.' : esc(w.reason)}</p><button type="button" class="btn" data-mk-tclub ${w.open ? '' : 'disabled'}>Расторгнуть: ${fm(comp)}</button></div>`
      + `<div class="mk-term"><b>По соглашению сторон</b><p class="tiny muted">${av ? 'Игрок готов обсуждать. Он ждёт не меньше суммы, зависящей от настроения и игровой практики.' : 'Игрок не хочет уходить: расторжение возможно при плохом настроении, малой игровой практике или у ветерана в слабом клубе.'}</p>`
      + `<div class="mk-ctl"><label>Выплата: <b id="mk-ts">${fm(t.sum)}</b></label><input type="range" id="mk-tsum" min="0" max="${Math.round(comp / 100000)}" value="${Math.round(t.sum / 100000)}" ${av ? '' : 'disabled'}></div><button type="button" class="btn" data-mk-tmut ${av ? '' : 'disabled'}>Предложить расторжение</button></div>`
      + `<div id="mk-msg">${msg ? `<div class="res ${cls || ''}">${esc(msg)}</div>` : ''}</div><div class="pg-btns"><button type="button" class="btn" data-mk-close>Закрыть</button></div></div>`;
  };

  /* ------------------------------------------------------------------ события */
  document.addEventListener('click', e => {
    const app = A(); if (!app || !app.state || !app.mk || !app.mk()) return;
    const t = e.target.closest ? e.target : null; if (!t) return;
    let b;
    if ((b = t.closest('[data-mk-tab]'))) { app._mkTab = b.dataset.mkTab; app.renderMarket(); return; }
    if ((b = t.closest('[data-mk-f]'))) { app._mkF[b.dataset.mkF] = b.dataset.v; app.renderMarket(); return; }
    if ((b = t.closest('[data-mk-sort]'))) { const f = app._mkF, k = b.dataset.mkSort; f.dir = f.sort === k ? -f.dir : (k === 'name' || k === 'pos' ? 1 : -1); f.sort = k; app.renderMarket(); return; }
    if ((b = t.closest('[data-mk-open]'))) { if (app.thinkOf(b.dataset.mkOpen)) { app._mkTab = 'neg'; app.renderMarket(); return; } app.mkOpenDeal(b.dataset.mkOpen, 'fa'); return; }
    if ((b = t.closest('[data-mk-al]'))) {
      const k = b.dataset.mkAl; app.mkCloseAlert();
      if (k === 'outbid') { app._mkTab = 'neg'; app.switchTab('market'); app.mkOpenImprove(b.dataset.pid); }
      else if (k === 'wd') { app.marketThinkWithdraw(b.dataset.pid); app.persistQuietly && app.persistQuietly(); app.renderMarket(); }
      else if (k === 'neg') { app._mkTab = 'neg'; app.switchTab('market'); }
      return;
    }
    if ((b = t.closest('[data-mk-impr]'))) { app.mkOpenImprove(b.dataset.mkImpr); return; }
    if ((b = t.closest('[data-mk-wd]'))) { app.marketThinkWithdraw(b.dataset.mkWd); app.persistQuietly && app.persistQuietly(); app.renderMarket(); return; }
    if ((b = t.closest('[data-mk-ext]'))) { app.mkOpenDeal(b.dataset.mkExt, 'ext'); return; }
    if ((b = t.closest('[data-mk-term]'))) { app.mkOpenTerm(b.dataset.mkTerm); return; }
    if (t.closest('[data-mk-close]')) { app.mkClose(); return; }
    if (t.closest('#mk-go')) { app.mkSubmit(); return; }
    if (t.closest('[data-mk-help]') && app._mk) { app._mk.help = !app._mk.help; app.mkRefreshEval(); return; }
    if ((b = t.closest('[data-mk-years]')) && app._mk) { app._mk.years = +b.dataset.mkYears; app.mkRenderDeal(); return; }
    if ((b = t.closest('[data-mk-type]')) && app._mk) { app._mk.type = b.dataset.mkType; app.mkRenderDeal(); return; }
    if ((b = t.closest('[data-mk-counter]')) && app._mk) { app._mk.salary = +b.dataset.mkCounter; app.mkRenderDeal(); app.mkSubmit(); return; }
    if (t.closest('[data-mk-tclub]') && app._mkT) { const r = app.terminateByClub(app._mkT.pid); if (r.ok) { app.persistQuietly && app.persistQuietly(); app.mkClose(); app.renderAll(); } else app.mkRenderTerm(r.text, 'bad'); return; }
    if (t.closest('[data-mk-tmut]') && app._mkT) { const r = app.terminateMutual(app._mkT.pid, app._mkT.sum); if (r.ok) { app.persistQuietly && app.persistQuietly(); app.mkClose(); app.renderAll(); } else app.mkRenderTerm(r.text, 'bad'); return; }
    if ((b = t.closest('[data-mk-pers]'))) { const id = b.dataset.mkPers, sl = document.querySelector(`[data-mk-rs="${id}"]`), r = app.requestPersuade(id, sl ? +sl.value : 0); app.setNotice && app.setNotice(r.text); app.persistQuietly && app.persistQuietly(); app.renderAll(); return; }
    if ((b = t.closest('[data-mk-rel]'))) { app.requestRelease(b.dataset.mkRel); app.persistQuietly && app.persistQuietly(); app.renderAll(); return; }
    if ((b = t.closest('[data-mk-ref]'))) { app.requestRefuse(b.dataset.mkRef); app.persistQuietly && app.persistQuietly(); app.renderAll(); return; }
  });
  document.addEventListener('input', e => {
    const app = A(); if (!app || !app.state) return; const t = e.target;
    if (t.id === 'mk-sal' && app._mk) { app._mk.salary = +t.value * 500000; app.mkRefreshEval(); }
    else if (t.id === 'mk-tsum' && app._mkT) { app._mkT.sum = +t.value * 100000; const s = $('mk-ts'); if (s) s.textContent = fm(app._mkT.sum); }
    else if (t.dataset && t.dataset.mkRs) { const l = document.querySelector(`[data-mk-rv="${t.dataset.mkRs}"]`); if (l) l.textContent = t.value; }
    else if (t.dataset && t.dataset.mkQ !== undefined) { app._mkF.q = t.value; const pos = t.selectionStart; app.renderMarket(); const n = document.querySelector('[data-mk-q]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { } } }
  });
  document.addEventListener('change', e => {
    const app = A(); if (!app || !app.state) return; const t = e.target;
    if (t.dataset && t.dataset.mkProm !== undefined && app._mk) { app._mk[t.dataset.mkProm === 'cup' ? 'promiseCup' : 'promise'] = t.value; app.mkRefreshEval(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && A() && A()._mk) A().mkClose(); });

  /* ------------------------------------------------------------------ потолок в «Финансах» */
  const baseFin = proto.renderFinances;
  proto.renderFinances = function () {
    const r = baseFin.apply(this, arguments);
    try {
      const host = $('finance-metrics');
      if (host && this.mk()) {
        const cs = this.capStatus(this.state.teamId);
        host.insertAdjacentHTML('beforeend', `<div class="metric mk-fin" title="Потолок ${this.MARKET.cap / 1e6} млн, пол ${this.MARKET.floor / 1e6} млн"><div class="label">До потолка зарплат</div><div class="value ${cs.over ? 'mk-bad' : ''}">${cs.over ? '−' : ''}${(Math.abs(cs.room) / 1e6).toFixed(1)} млн</div></div>`);
      }
    } catch (e) { }
    return r;
  };
})();
