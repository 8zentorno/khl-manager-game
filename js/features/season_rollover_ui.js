/* KHL Manager 14.7.5 — переход в новый сезон (интерфейс): мастер из пяти шагов, панель межсезонья, итоги лета, итоги карьеры. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fm = v => (Number(v) / 1e6).toFixed(1).replace('.', ',') + ' млн';
  const STEPS = ['Итоги', 'Контракты', 'Возраст и сборы', 'Прощание', 'Рынок'];
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  proto.TR_STEPS = STEPS;

  const pl = (app, id) => app.mkPl ? (app.mkPl(id) || '') : '';
  const link = (app, p) => (app.db.players.some(x => x.id === p.id) ? `<span class="nm" data-pl="${E(p.id)}">${E(p.name)}</span>` : E(p.name));

  /* ------------------------------------------------------------------ какой шаг сейчас */
  proto.trStep = function () {
    const st = this.state; if (!st) return 0;
    const o = this.ofs();
    if (o) return o.wizard ? o.step : 0;
    return st.trWiz && st.trWiz.open && st.playoff && st.playoff.completed ? st.trWiz.step : 0;
  };
  proto.trOpen = function () {
    const st = this.state; if (!st || !st.playoff || !st.playoff.completed) return;
    if ((st.seasonNumber || 1) >= this.SEASONS_TOTAL) { this.trOpenCareer(); return; }
    if (!st.trWiz) st.trWiz = { step: 1 };
    st.trWiz.open = true;
    const old = $('season-summary-overlay'); if (old) old.remove();
    this.trRender();
  };
  proto.trClose = function () {
    const st = this.state; if (st && st.trWiz) st.trWiz.open = false;
    const o = this.ofs(); if (o) o.wizard = false;
    const el = $('tr-ov'); if (el) el.remove();
    this.persistQuietly && this.persistQuietly();
    try { this.renderAll(); } catch (e) { }
  };
  proto.trGo = function (n) {
    const st = this.state, o = this.ofs();
    if (o) o.step = n; else if (st.trWiz) st.trWiz.step = n;
    this.persistQuietly && this.persistQuietly();
    this.trRender();
  };

  /* ------------------------------------------------------------------ каркас мастера */
  proto.trChips = function (step) {
    const pre = !this.ofs();     // до перехода шаги 3–5 ещё закрыты: они считаются после «Да, перейти»
    return `<div class="tr-chips">${STEPS.map((s, i) => `<span class="tr-chip${i + 1 === step ? ' on' : i + 1 < step ? ' done' : ''}${pre && i >= 2 ? ' later' : ''}"${pre && i >= 2 ? ' title="Откроется после перехода в новый сезон"' : ''}><b>${pre && i >= 2 ? '🔒' : i + 1}</b><i>${E(s)}</i></span>`).join('')}</div>${pre ? '<p class="small muted tr-later-note">Шаги 3–5 откроются сами после перехода в новый сезон: там считаются возраст, уходы игроков и рынок.</p>' : ''}`;
  };
  proto.trRender = function () {
    const step = this.trStep();
    let el = $('tr-ov');
    if (!step) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'tr-ov'; el.className = 'tr-ov'; document.body.appendChild(el); }
    const body = [null, 'trStep1', 'trStep2', 'trStep3', 'trStep4', 'trStep5'][step];
    const sc = el.querySelector('.tr-card'); const top = sc ? sc.scrollTop : 0;
    el.innerHTML = `<div class="tr-card" role="dialog" aria-modal="true" aria-label="Переход в новый сезон">${this.trChips(step)}${this[body]()}</div>`;
    const c = el.querySelector('.tr-card'); if (c && top) c.scrollTop = top;
  };

  /* ------------------------------------------------------------------ шаг 1: итоги */
  proto.trStep1 = function () {
    const s = this.state.offseason ? this.state.offseason.report.summary : this.trSummary();
    const best = s.best.map(b => `<div class="tr-row"><span>${link(this, { id: b.id, name: b.name })} <small class="muted">${E(this.positionLabel(b.pos))}</small></span><b>${E(b.t)}</b></div>`).join('');
    return `<h2>Итоги сезона ${E(s.label)} · сезон ${s.n} из ${this.SEASONS_TOTAL}</h2>`
      + `<div class="tr-sum"><div><small>Клуб</small><b>${E(s.club)}</b></div><div><small>Регулярка</small><b>${s.place}-е место · ${s.pts} очк.</b></div><div><small>Кубок Гагарина</small><b>${E(s.finish || '—')}</b></div><div><small>Чемпион</small><b>${s.champ ? '🏆 вы' : E(s.champion || '—')}</b></div></div>`
      + (s.goals.length ? `<div class="tr-box"><h4>Цели</h4>${s.goals.map(g => `<div class="small">${E(g)}</div>`).join('')}</div>` : '')
      + `<div class="tr-box"><h4>Лучшие игроки клуба</h4>${best}</div>`
      + `<p class="small muted">Полные итоги сезона сохранены в «Истории сезонов». Дальше — контракты: у кого срок заканчивается, решать тебе.</p>`
      + `<div class="tr-acts"><button class="btn btn-quiet" data-tr="close">Свернуть</button><button class="btn btn-primary" data-tr="go" data-n="2">Контракты →</button></div>`;
  };

  /* ------------------------------------------------------------------ шаг 2: контракты */
  proto.trStep2 = function () {
    const st = this.state, my = st.teamId, Y = this.seasonEndYear(), draft = (st.trDraft || {}).letGo || {};
    const cs = this.capStatus(my);
    st.trDraft = st.trDraft || { letGo: {} }; const was = st.trDraft.was = st.trDraft.was || {};
    this.teamPlayers(my).forEach(p => { if (Number(p.contractUntil) <= Y) was[p.id] = 1; });
    const rows = this.teamPlayers(my).filter(p => was[p.id]).sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
    const msg = this._trMsg || {};
    const line = p => {
      const rec = this.trRecommend(p), age = Math.floor(this.ageYears(p)), ovr = Math.round(this.permanentOVR(p));
      const done = p.nextSalary || Number(p.contractUntil) > Y;
      let act;
      if (done) act = `<span class="tr-ok">✅ Продлён до ${p.contractUntil} · ${fm(p.nextSalary || p.salary)}</span>`;
      else if (draft[p.id]) act = `<span class="tr-no">Отпущен</span> <button class="btn btn-quiet" data-tr="keep" data-pid="${E(p.id)}">Вернуть</button>`;
      else act = `<button class="btn btn-primary" data-tr="ext" data-pid="${E(p.id)}">Продлить</button><button class="btn btn-quiet" data-tr="free" data-pid="${E(p.id)}">Отпустить</button>`;
      return `<div class="tr-card2${done ? ' ok' : draft[p.id] ? ' no' : ''}"><div class="tr-c-top"><div>${link(this, p)} <small class="muted">${E(this.positionLabel(p.pos))} · ${age} ${plural(age, 'год', 'года', 'лет')} · рейтинг ${ovr}</small></div><div class="small">${fm(p.salary)} → просит ≈ ${fm(this.askSalary(p))}</div></div>`
        + `<div class="tr-rec ${rec.key}">💡 ${E(rec.text)}</div>${msg[p.id] ? `<div class="small tr-msg">${E(msg[p.id])}</div>` : ''}<div class="tr-btns">${act}</div></div>`;
    };
    const left = rows.filter(p => !(p.nextSalary || Number(p.contractUntil) > Y) && !draft[p.id]).length;
    const confirm = this._trConfirm
      ? `<div class="tr-warn"><b>Перейти в новый сезон?</b><div class="small">Назад дороги нет: создаётся автосохранение «До перехода». Игроки без продления остаются у тебя ещё ${7} дней (эксклюзивное окно), потом уходят на рынок. Контракты других клубов, завершение карьер и возраст рассчитываются сейчас.</div><div class="tr-acts"><button class="btn btn-quiet" data-tr="no">Ещё подумаю</button><button class="btn btn-primary" data-tr="roll">Да, перейти</button></div></div>` : '';
    return `<h2>Контракты</h2><p class="small muted">Контракт истекает у ${rows.length} ${plural(rows.length, 'игрока', 'игроков', 'игроков')}. Фонд сейчас ${fm(cs.payroll)}, с 1 июля ${fm(this.teamPlayers(my).reduce((a, x) => a + (Number(x.nextSalary) || (this.payrollOf ? this.payrollOf(x) : x.salary)), 0) + ((this.mk().capCharges || {})[my] || 0))} из ${fm(cs.cap)}${cs.over ? ' <b class="tr-no">(выше потолка)</b>' : ''}. Новые зарплаты вступают в силу 1 июля. Клубы ИИ продлевают свои контракты сами.</p>`
      + (rows.length ? `<div class="tr-list">${rows.map(line).join('')}</div>` : '<div class="tr-box">Ни у кого из игроков контракт не заканчивается.</div>')
      + (left ? `<p class="small muted">Без решения: ${left}. Они останутся на 7 дней в эксклюзивном окне, потом уйдут.</p>` : '')
      + confirm
      + (this._trConfirm ? '' : `<div class="tr-acts"><button class="btn btn-quiet" data-tr="go" data-n="1">← Итоги</button><button class="btn btn-quiet" data-tr="close">Свернуть</button><button class="btn btn-primary" data-tr="ask">Завершить сезон и перейти к возрасту и сборам →</button></div>`);
  };

  /* ------------------------------------------------------------------ шаг 3: возраст и сборы */
  proto.trStep3 = function () {
    const o = this.ofs(), my = this.state.teamId;
    const rows = this.teamPlayers(my).sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a)).map(p => {
      const f = this.trForecast(p), age = Math.floor(this.ageOn(p, this.seasonStartMs()));
      const w = f.dir > 0 ? `<b class="tr-up">▲ растёт</b>` : f.dir < 0 ? `<b class="tr-no">▼ спад</b>` : '<span class="muted">стабилен</span>';
      return `<tr><td>${link(this, p)}</td><td>${E(this.positionLabel(p.pos))}</td><td class="n">${age}</td><td class="n">${Math.round(this.permanentOVR(p))}</td><td>${w}</td></tr>`;
    }).join('');
    const focus = Object.entries(this.TR_FOCUS).map(([k, v]) => `<button class="tr-focus${o.focus === k ? ' on' : ''}" data-tr="focus" data-k="${k}"><b>${E(v.name)}</b><small>${E(v.hint)}</small></button>`).join('');
    return `<h2>Возраст и сборы</h2><p class="small muted">Начало сезона ${E(this.seasonLabel(this.state.seasonNumber))}. За лето игроки меняются примерно на треть годового развития. Выбери направление сборов.</p>`
      + `<div class="tr-focus-row">${focus}</div>`
      + `<div class="table-wrap"><table class="data-table tr-tbl"><thead><tr><th>Игрок</th><th>Поз.</th><th class="n">Возраст</th><th class="n">Рейтинг</th><th>Прогноз на лето</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + `<div class="tr-acts"><button class="btn btn-primary" data-tr="go" data-n="4">Прощание →</button></div>`;
  };

  /* ------------------------------------------------------------------ шаг 4: прощание */
  proto.trStep4 = function () {
    const o = this.ofs(), rep = o.report, rt = o.rt || {};
    const cards = rep.retiring.map(r => {
      const p = this.marketPlayer(r.pid), res = rt[r.pid];
      let act;
      if (res === 'stay') act = '<b class="tr-ok">✅ Согласился сыграть ещё один год</b>';
      else if (res === 'gone') act = '<b class="tr-no">Решение принято: завершает карьеру</b>';
      else if (res === 'honor') act = '<b>🎗️ Проводили с почестями</b>';
      else act = `<button class="btn btn-primary" data-tr="honor" data-pid="${E(r.pid)}">Проводить с почестями</button><button class="btn" data-tr="persuade" data-pid="${E(r.pid)}">Уговорить на ещё один год</button>`;
      return `<div class="tr-card2"><div class="tr-c-top"><div>${p ? link(this, p) : E(r.name)} <small class="muted">${E(this.positionLabel(r.pos))} · ${r.age} ${plural(r.age, 'год', 'года', 'лет')} · рейтинг ${Math.round(r.ovr)}</small></div></div><div class="tr-btns">${act}</div></div>`;
    }).join('');
    return `<h2>Прощание</h2><p class="small muted">Вероятность завершить карьеру растёт с 38 лет, с 42 — наверняка. Слабые уходят чаще, звёзды реже.</p>`
      + (rep.retiring.length ? `<div class="tr-list">${cards}</div>` : '<div class="tr-box">В этом году никто из твоих игроков не завершает карьеру.</div>')
      + `<p class="small muted">По лиге карьеру завершили ещё ${rep.retiredOther} ${plural(rep.retiredOther, 'игрок', 'игрока', 'игроков')}${rep.poolLeft ? `, из числа свободных агентов — ${rep.poolLeft}` : ''}.</p>`
      + `<div class="tr-acts"><button class="btn btn-primary" data-tr="go5">Рынок →</button></div>`;
  };

  /* ------------------------------------------------------------------ шаг 5: рынок */
  proto.trStep5 = function () {
    const o = this.ofs(), rep = o.report, ex = o.exclusive;
    const pool = this.marketPool().sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
    const top = pool.slice(0, 6).map(p => `<div class="tr-row"><span>${link(this, p)} <small class="muted">${E(this.positionLabel(p.pos))} · ${Math.floor(this.ageYears(p))} · ${Math.round(this.permanentOVR(p))}${p.prevTeam ? ' · ' + E((this.teamById(p.prevTeam) || {}).name || '') : ''}</small></span><b>≈ ${fm(this.askSalary(p))}</b></div>`).join('');
    const mine = ex ? ex.pids.map(id => this.marketPlayer(id)).filter(p => p && p.teamId === this.state.teamId && !p.nextSalary && Number(p.contractUntil) <= this.seasonEndYear() - 1) : [];
    return `<h2>Рынок</h2><p class="small muted">Клубы продлили ${rep.aiRenewed} контрактов, ${rep.aiLeft} ${plural(rep.aiLeft, 'игрок вышел', 'игрока вышли', 'игроков вышли')} на рынок. Всего свободных агентов: ${pool.length}.</p>`
      + (mine.length ? `<div class="tr-box"><h4>Эксклюзивное окно до ${E(this.formatDate(ex.until))}</h4><div class="small">Другие клубы не подписывают твоих игроков: ${mine.map(p => E(p.name)).join(', ')}. Продлить можно на вкладке «Рынок». Потом они станут свободными агентами.</div></div>` : '')
      + `<div class="tr-box"><h4>Сильнейшие свободные агенты</h4>${top}</div>`
      + `<p class="small muted">Дальше межсезонье идёт по датам: 1 июля вступают новые контракты, 27 августа закрывается окно расторжения, 3 сентября — старт. Игроки новых клубов подписываются каждый день.</p>`
      + `<div class="tr-acts"><button class="btn" data-tr="market">Открыть рынок</button><button class="btn btn-primary" data-tr="start">В межсезонье →</button></div>`;
  };

  /* ------------------------------------------------------------------ панель межсезонья на главной */
  proto.trPanelHtml = function () {
    const st = this.state, o = this.ofs();
    if (!o) {
      if (st.playoff && st.playoff.completed) {
        const last = (st.seasonNumber || 1) >= this.SEASONS_TOTAL;
        return `<div class="card tr-panel"><div class="eyebrow">Кубок Гагарина завершён</div><h3>${last ? 'Последний сезон карьеры позади' : 'Сезон окончен'}</h3><p class="small muted">${last ? 'Пять сезонов пройдены: посмотри итоги карьеры.' : 'Пора подводить итоги и готовиться к следующему сезону: контракты, возраст, прощания, рынок.'}</p><div class="tr-acts"><button class="btn btn-primary" data-tr="open">${last ? '🏁 Итоги карьеры' : '➡️ Перейти в новый сезон'}</button><button class="btn btn-quiet" onclick="app.openSeasonSummary()">📊 Итоги сезона</button></div></div>`;
      }
      return '';
    }
    const day = Number(st.dayIndex || 0), left = -day, next = this.trNextKeyDate();
    const dates = this.trKeyDates().map(k => `<li class="${k.day <= day ? 'past' : ''}"><b>${E(this.formatDate(k.day))}</b> ${E(k.label)}</li>`).join('');
    const ex = o.exclusive && !o.exclusive.done ? `<div class="tr-box"><b>Эксклюзивное окно</b> до ${E(this.formatDate(o.exclusive.until))}: на ваших игроков без продления никто не претендует.</div>` : '';
    let ready = '';
    if (day >= 0) {
      const L = this.trReadiness();
      ready = `<div class="tr-box"><h4>Проверка готовности</h4>${L.map(x => `<div class="small tr-ck ${x.info ? 'i' : x.ok ? 'ok' : 'warn'}">${x.info ? 'ℹ️' : x.ok ? '✅' : '⚠️'} ${E(x.text)}</div>`).join('')}<p class="small muted">Предупреждения не мешают начать сезон, но матч нельзя сыграть с пустыми местами в звеньях.</p></div>`;
    }
    const btn = day >= 0
      ? `<button class="btn" data-tr="fill">Заполнить звенья</button><button class="btn btn-primary" data-tr="begin">🏒 Начать сезон ${E(this.seasonLabel(st.seasonNumber))}</button>`
      : `<button class="btn" data-tr="d" data-n="1">+1 день</button><button class="btn" data-tr="d" data-n="7">+7 дней</button><button class="btn" data-tr="d" data-n="next">До: ${E(next ? next.short : 'старта')}</button><button class="btn btn-primary" data-tr="d" data-n="start">До старта</button>`;
    return `<div class="card tr-panel"><div class="eyebrow">Межсезонье · сезон ${st.seasonNumber} из ${this.SEASONS_TOTAL}</div><h3>${E(this.formatDate(day))}${left > 0 ? ` <small class="muted">· до старта ${left} ${plural(left, 'день', 'дня', 'дней')}</small>` : ''}</h3>`
      + `<div class="tr-acts">${btn}</div>${o.note ? `<div class="notice tr-note">${E(o.note)}</div>` : ''}${ex}${ready}`
      + `<details class="tr-dates"><summary>Ключевые даты</summary><ul>${dates}</ul></details>`
      + `<div class="tr-acts"><button class="btn btn-quiet" data-tr="wiz">Шаги перехода</button><button class="btn btn-quiet" data-tr="mk">Рынок</button></div></div>`;
  };
  proto.trRenderPanel = function () {
    const host = $('ov-offseason'); if (!host || !this.state) return;
    const html = this.trPanelHtml();
    host.innerHTML = html; host.classList.toggle('hidden', !html);
    const hero = document.querySelector('#view-dashboard .ov-hero'); if (hero) hero.classList.toggle('hidden', !!this.ofs());
  };

  /* ------------------------------------------------------------------ итоги лета */
  proto.trSummerHtml = function (s) {
    const rows = s.rows.map(r => ({ ...r, d: Math.round((r.b - r.a) * 10) / 10 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d) || b.d - a.d || b.b - a.b);
    const cell = d => d > 0 ? `<b class="tr-up">+${d}</b>` : d < 0 ? `<b class="tr-no">${d}</b>` : '<span class="muted">0</span>';
    return `<div class="tr-card tr-summer" role="dialog" aria-modal="true"><h2>Итоги лета</h2><p class="small muted">Как изменились игроки за межсезонье ${E(this.seasonLabel(s.n))}.${s.topUp ? ' Фонд был ниже нижней границы: разницу распределили между игроками (настроение +3).' : ''}</p>`
      + `<div class="table-wrap"><table class="data-table tr-tbl"><thead><tr><th>Игрок</th><th>Поз.</th><th class="n">Было</th><th class="n">Стало</th><th class="n">Изм.</th></tr></thead><tbody>${rows.map(r => `<tr><td>${link(this, { id: r.id, name: r.name })}</td><td>${E(this.positionLabel(r.pos))}</td><td class="n">${Math.round(r.a)}</td><td class="n">${Math.round(r.b)}</td><td class="n">${cell(r.d)}</td></tr>`).join('')}</tbody></table></div>`
      + `<div class="tr-acts"><button class="btn btn-primary" data-tr="summer-ok">К сезону</button></div></div>`;
  };
  proto.trShowSummer = function () {
    const s = this.state && this.state.summer; if (!s || s.seen || $('tr-summer-ov')) return;
    const el = document.createElement('div'); el.id = 'tr-summer-ov'; el.className = 'tr-ov'; el.innerHTML = this.trSummerHtml(s); document.body.appendChild(el);
  };

  /* ------------------------------------------------------------------ итоги карьеры */
  proto.trCareerStats = function () {
    const c = (this.state.career || []).slice().sort((a, b) => a.n - b.n), best = {};
    c.forEach(e => (e.best || []).forEach(b => { const k = b.name; best[k] = best[k] || { name: b.name, pos: b.pos, v: 0, seasons: 0 }; best[k].v += b.v || 0; best[k].seasons++; }));
    return {
      seasons: c, cups: c.filter(e => e.champ).length, po: c.filter(e => e.playoff && !/^Не вышел/.test(e.playoff)).length,
      bestPlace: c.length ? Math.min(...c.map(e => e.place || 99)) : 0, top: Object.values(best).sort((a, b) => b.v - a.v).slice(0, 5)
    };
  };
  proto.trCareerLine = function (s) {
    const n = s.seasons.length;
    if (s.cups >= 3) return `Династия: ${s.cups} Кубка Гагарина за ${n} сезонов.`;
    if (s.cups === 2) return 'Два Кубка Гагарина: тренерская карьера удалась.';
    if (s.cups === 1) return 'Кубок Гагарина в копилке: карьеру можно назвать успешной.';
    if (s.po >= n - 1) return `Стабильный плей-офф: ${s.po} выходов из ${n}, но до Кубка не хватило.`;
    if (s.po >= Math.ceil(n / 2)) return `Крепкий середняк: плей-офф в ${s.po} сезонах из ${n}.`;
    return 'Сложные годы: клуб редко попадал в плей-офф, зато есть над чем работать.';
  };
  proto.trOpenCareer = function () {
    const st = this.state; if (!st) return;
    this.recordSeasonHistory();
    const sum = this.trSummary();
    st.career = (st.career || []).filter(e => e.n !== sum.n); st.career.push(this.trCareerEntry());
    this.persistQuietly && this.persistQuietly();
    const old = $('season-summary-overlay'); if (old) old.remove();
    let el = $('tr-career'); if (el) el.remove();
    const s = this.trCareerStats();
    const path = s.seasons.map(e => `<div class="tr-row"><span><b>${E(e.label)}</b> · ${E(e.club)}</span><span>${e.place}-е место · ${E(e.playoff || '—')}${e.champ ? ' 🏆' : ''}</span></div>`).join('');
    const top = s.top.map(b => `<div class="tr-row"><span>${E(b.name)} <small class="muted">${E(this.positionLabel(b.pos))} · в лучших ${b.seasons} ${plural(b.seasons, 'сезон', 'сезона', 'сезонов')}</small></span><b>${b.v}</b></div>`).join('');
    el = document.createElement('div'); el.id = 'tr-career'; el.className = 'tr-ov';
    el.innerHTML = `<div class="tr-card" role="dialog" aria-modal="true"><div class="eyebrow">Итоги карьеры</div><h2>${s.seasons.length} ${plural(s.seasons.length, 'сезон', 'сезона', 'сезонов')} в КХЛ</h2><p class="tr-line">${E(this.trCareerLine(s))}</p>`
      + `<div class="tr-sum"><div><small>Кубков Гагарина</small><b>${s.cups}</b></div><div><small>Плей-офф</small><b>${s.po} из ${s.seasons.length}</b></div><div><small>Лучшее место</small><b>${s.bestPlace || '—'}</b></div></div>`
      + `<div class="tr-box"><h4>Путь по сезонам</h4>${path}</div><div class="tr-box"><h4>Лучшие игроки пяти лет</h4>${top || '<div class="small muted">—</div>'}</div>`
      + `<div class="tr-acts"><button class="btn btn-quiet" data-tr="career-close">Закрыть</button><button class="btn btn-primary" data-tr="career-new">Начать новую карьеру за другой клуб</button></div></div>`;
    document.body.appendChild(el);
  };

  /* ------------------------------------------------------------------ слот «До перехода» */
  proto.trLoadPre = async function () {
    try {
      const { st } = await this.readSlotState('pre');
      this.enterState(st, st.slotId || '1');
    } catch (e) { alert('Не удалось загрузить: ' + e.message); }
  };

  /* ------------------------------------------------------------------ события */
  const A = () => (typeof app !== 'undefined' ? app : null);
  document.addEventListener('click', e => {
    const a = A(); if (!a || !a.state) return;
    const t = e.target && e.target.closest ? e.target.closest('[data-tr]') : null; if (!t) return;
    const k = t.dataset.tr, pid = t.dataset.pid;
    const redo = () => { a.persistQuietly && a.persistQuietly(); a.trRender(); a.trRenderPanel(); };
    if (k === 'open') { a.trOpen(); return; }
    if (k === 'close') { a.trClose(); return; }
    if (k === 'go') { a._trConfirm = false; a.trGo(Number(t.dataset.n)); return; }
    if (k === 'go5') { a.trFinalizeRetire(); a.trGo(5); return; }
    if (k === 'ext') { a.mkOpenDeal(pid, 'ext'); return; }
    if (k === 'cheap') { a._trMsg = a._trMsg || {}; const r = a.trQuickOffer(pid, true); a._trMsg[pid] = r.text; a.trRender(); return; }
    if (k === 'free') { a.trLetGo(pid, true); a._trMsg = a._trMsg || {}; a._trMsg[pid] = ''; redo(); return; }
    if (k === 'keep') { a.trLetGo(pid, false); redo(); return; }
    if (k === 'ask') { a._trConfirm = true; a.trRender(); return; }
    if (k === 'no') { a._trConfirm = false; a.trRender(); return; }
    if (k === 'roll') {
      a._trConfirm = false; a._trMsg = {};
      const ok = a.trRollover();
      if (!ok) { a.setNotice && a.setNotice('Переход не удался.'); return; }
      const el = $('tr-ov'); if (el) el.remove();
      a.renderAll(); a.trRender(); return;
    }
    if (k === 'focus') { a.trSetFocus(t.dataset.k); a.trRender(); return; }
    if (k === 'honor') { a.trHonor(pid); redo(); return; }
    if (k === 'persuade') { a.trPersuade(pid); redo(); return; }
    if (k === 'market') { a._mkTab = 'fa'; a.trClose(); a.switchTab('market'); return; }
    if (k === 'start') { const o = a.ofs(); if (o) { o.wizard = false; } const el = $('tr-ov'); if (el) el.remove(); a.persistQuietly && a.persistQuietly(); a.renderAll(); return; }
    if (k === 'wiz') { const o = a.ofs(); if (o) { o.wizard = true; o.step = 3; a.trRender(); } return; }
    if (k === 'mk') { a.switchTab('market'); return; }
    if (k === 'd') {
      const o = a.ofs(); if (!o) return;
      const n = t.dataset.n, r = a.offseasonAdvance(/^\d+$/.test(n) ? Number(n) : n);
      o.note = r.why === 'event' ? 'Остановка: есть событие, которое требует внимания (предложение, ответ игрока или требование).' : '';
      a.persistQuietly && a.persistQuietly(); a.renderAll(); return;
    }
    if (k === 'fill') { const n = a.trFillSlots(); const o = a.ofs(); if (o) o.note = n ? `Заполнено мест в звеньях: ${n}.` : 'Звенья уже заполнены или нет подходящих игроков.'; a.persistQuietly && a.persistQuietly(); a.renderAll(); return; }
    if (k === 'begin') { if (a.trStartSeason()) { a.renderAll(); a.trShowSummer(); } return; }
    if (k === 'summer-ok') { if (a.state.summer) a.state.summer.seen = true; const el = $('tr-summer-ov'); if (el) el.remove(); a.trReleaseObjective(); a.persistQuietly && a.persistQuietly(); a.renderAll(); return; }
    if (k === 'career-close') { const el = $('tr-career'); if (el) el.remove(); return; }
    if (k === 'career-new') {
      const el = $('tr-career'); if (el) el.remove();
      a._carryHistory = null;
      try { a.startNewGameWizard(); } catch (x) { a.startAnotherSeason && a.startAnotherSeason(); }
      return;
    }
  });

  /* ------------------------------------------------------------------ подключение к отрисовке */
  const _ra = proto.renderAll;
  proto.renderAll = function () {
    const r = _ra.apply(this, arguments);
    if (!this.state) return r;
    try {
      this.trRenderPanel();
      if (this.trStep()) this.trRender(); else { const el = $('tr-ov'); if (el) el.remove(); }
      if (this.state.summer && !this.state.summer.seen) this.trShowSummer();
      else if (this.state.teamObjective && this.state.teamObjective.hold && !this.ofs()) this.trReleaseObjective();
      const head = $('dash-headline'), o = this.ofs();
      if (head) {
        if (o) { head.textContent = `Межсезонье ${this.seasonLabel(this.state.seasonNumber)}`; const sub = $('dash-subtitle'); if (sub) sub.textContent = `сезон ${this.state.seasonNumber} из ${this.SEASONS_TOTAL}`; }
        else if (!(this.state.playoff && this.state.playoff.started) && !this.state.seasonFinished) { head.textContent = `Сезон ${this.seasonLabel(this.state.seasonNumber)} · ${this.state.seasonNumber || 1} из ${this.SEASONS_TOTAL}`; }
      }
    } catch (e) { console.warn('KHL Manager 14.7.5 render:', e); }
    return r;
  };
  const _mkClose = proto.mkClose;
  if (_mkClose) proto.mkClose = function () { const r = _mkClose.apply(this, arguments); try { if (this.trStep()) { this.trRender(); this.trRenderPanel(); } } catch (e) { } return r; };

  // итоги сезона: заголовок с номером сезона и кнопка перехода
  const _ssh = proto.seasonSummaryHtml;
  if (_ssh) proto.seasonSummaryHtml = function () {
    let h = _ssh.apply(this, arguments);
    const n = this.state.seasonNumber || 1, last = n >= this.SEASONS_TOTAL;
    h = h.replace(/Итоги сезона 2026\/27/, `Итоги сезона ${E(this.seasonLabel(n))} · сезон ${n} из ${this.SEASONS_TOTAL}`);
    h = h.replace('<div class="ss-actions">', `<div class="ss-actions"><button class="btn btn-primary" data-tr="open">${last ? '🏁 Итоги карьеры' : '➡️ В новый сезон'}</button>`);
    return h;
  };

  // слот «До перехода» на экране сохранений
  const _rms = proto.renderMenuSlots;
  proto.renderMenuSlots = function () {
    const r = _rms.apply(this, arguments);
    try {
      const box = $('saves-slots'), m = this.slotMeta && this.slotMeta['pre'];
      if (box && m) {
        const when = m.savedAt ? new Date(m.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';
        box.insertAdjacentHTML('beforeend', `<div class="slot-card auto"><div class="slot-num">↺</div><div class="slot-body"><div class="slot-head"><b>До перехода в новый сезон</b></div><span class="slot-meta">${E(m.team)} · после сезона ${m.preSeason || ''} · ${E(when)}</span><span class="slot-meta">Откат на случай, если переход прошёл не так, как хотелось.</span><div class="slot-acts"><button class="btn btn-primary" onclick="app.trLoadPre()">Загрузить</button></div></div></div>`);
      }
    } catch (e) { }
    return r;
  };
})();
