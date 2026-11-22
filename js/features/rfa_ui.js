/* KHL Manager 14.7.32 — интерфейс фазы 1 трансферной реформы: статусы ОСА/НСА в «Моих контрактах» и
 * «Свободных агентах», квалификация/квота/отказ от прав, отправка офер-шита, оповещение и мэтч при
 * офер-шите на своего игрока. Простые действия (как перевод в ВХЛ или расторжение по соглашению в этом
 * же проекте) идут через confirm() — отдельная модалка со слайдером для них избыточна.
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const A = () => (typeof app !== 'undefined' ? app : null);
  const esc = x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fm = v => (Number(v) / 1e6).toFixed(1).replace('.', ',') + ' млн';
  const STATUS_CLS = { RFA: 'y', 'RFA-junior': 'y', UFA: 'g' };

  proto.rfaStatusChip = function (p) {
    const st = this.faStatus(p); if (!st || st === 'signed') return '';
    return `<span class="finx-chip rfa-chip ${STATUS_CLS[st] || ''}" title="${st === 'UFA' ? 'Неограниченно свободный агент: уходит куда хочет' : 'Ограниченно свободный агент: клуб может закрепить права'}">${esc(this.FA_STATUS_LABEL[st])}</span>`;
  };

  /* ------------------------------------------------------------------ «Мои контракты»: действия для истекающих ОСА */
  const _mine = proto.mkTab_mine;
  proto.mkTab_mine = function () {
    let html = _mine.apply(this, arguments);
    try {
      const my = this.state.teamId, Y = this.seasonEndYear();
      // 14.7.38: contractUntil === Y значит «подписан на весь сезон Y» (см. faStatus) — expiring только < Y
      const expiring = this.teamPlayers(my).filter(p => !p.nextSalary && Number(p.contractUntil) < Y);
      const candidates = expiring.filter(p => { const st = this.faStatus(p); return st === 'RFA' || st === 'RFA-junior'; });
      const dleft = this.rfaDeadlineDay() - Number(this.state.dayIndex || 0);
      const deadlineLine = dleft >= 0
        ? `До дедлайна квалификации (${this.rfaDeadlineLabel()}) — ${dleft} дн.`
        : `Дедлайн квалификации (${this.rfaDeadlineLabel()}) уже прошёл — решите вопрос по оставшимся игрокам как можно скорее.`;
      // 14.7.38: ОСА — переходное состояние (контракт истёк, но вопрос не закрыт); к старту нового сезона
      // список обязан полностью опустеть, поэтому пустой список — ожидаемая норма, а не «ничего не произошло».
      if (!candidates.length) {
        html += `<div class="card rfa-box"><h3>Ограниченно свободные агенты</h3><p class="tiny muted" style="margin:0">Нет игроков с истёкшими контрактами. Ближайшее окно — май ${this.trStartYear() + 1}.</p></div>`;
        return html;
      }
      const unqualified = candidates.filter(p => !this.rfaOf(p.id));
      const bulkBtn = unqualified.length > 1
        ? `<button type="button" class="btn btn-quiet" data-rfa-qall>Квалифицировать всех (${unqualified.length})</button>`
        : '';
      const rows = candidates.map(p => {
        const st = this.faStatus(p), rec = this.rfaOf(p.id);
        let act;
        if (rec) act = `<span class="tr-ok">✅ Права закреплены — ${fm(rec.salary)}</span> <button type="button" class="btn btn-quiet" data-rfa-rel="${esc(p.id)}">Отказаться от прав</button>`;
        else if (st === 'RFA-junior') {
          const pct = this._rfaJunPct || 160;
          const quota = Math.max(this.MARKET.minWage, Math.round(p.salary * pct / 100 / 500000) * 500000);
          const seg = [150, 160, 170].map(v => `<button type="button" class="${pct === v ? 'on' : ''}" data-rfa-pct="${v}">${v}%</button>`).join('');
          act = `<div class="rfa-jun-opt"><button type="button" class="btn" data-rfa-q="${esc(p.id)}">Закрепить права — ${fm(p.salary)} → ${fm(p.salary)}</button>`
            + `<small class="muted">Дешевле, но права можно перебить офер-шитом (у вас будет 7 дней на мэтч)</small></div>`
            + `<div class="rfa-jun-opt"><span class="mk-seg rfa-pct">${seg}</span><button type="button" class="btn btn-primary" data-rfa-jun="${esc(p.id)}">Квота ${pct}% = ${fm(quota)}</button>`
            + `<small class="muted">Дороже, зато закрывает вопрос сразу — на рынок игрок не выйдет</small></div>`;
        }
        else act = `<button type="button" class="btn btn-primary" data-rfa-q="${esc(p.id)}">Закрепить права (квалифицировать) — ${fm(p.salary)} → ${fm(p.salary)}</button>`;
        return `<div class="tr-row rfa-row"><span>${this.mkPl(p.id)} ${this.rfaStatusChip(p)} <small class="muted">${this.positionLabel(p.pos)} · ${this.ageText(Math.floor(this.ageYears(p)))}</small></span><span class="rfa-acts">${act}</span></div>`;
      }).join('');
      html += `<div class="card rfa-box"><h3>Ограниченно свободные агенты</h3>`
        + `<p class="tiny muted" style="margin:0 0 .2rem">Контракт истёк, но права пока у клуба. Без квалификации к началу рынка игрок уйдёт как обычный свободный агент. Закреплённые права можно потерять по офер-шиту — у вас будет 7 дней на мэтч.</p>`
        + `<p class="tiny muted" style="margin:0 0 .4rem"><b>${esc(deadlineLine)}</b></p>`
        + (bulkBtn ? `<p style="margin:0 0 .4rem">${bulkBtn}</p>` : '')
        + rows + `</div>`;
    } catch (e) { console.warn('KHL Manager 14.7.38 rfa mine:', e); }
    return html;
  };

  /* ------------------------------------------------------------------ «Свободные агенты»: метка ОСА + офер-шит вместо подписания */
  const _fa = proto.mkTab_fa;
  proto.mkTab_fa = function () {
    let html = _fa.apply(this, arguments);
    try {
      const my = this.state.teamId;
      this.marketPool().forEach(p => {
        const rec = this.rfaOf(p.id); if (!rec) return;
        const re = new RegExp(`<button type="button" class="mk-btn[^"]*" data-mk-open="${p.id}">(?:Подписать|Думает|Позже|Нет места)</button>`);
        if (rec.teamId === my) html = html.replace(re, `<button type="button" class="mk-btn pri" data-rfa-rel="${p.id}">Отказаться от прав</button>`);
        else html = html.replace(re, `<button type="button" class="mk-btn pri" data-rfa-os="${p.id}">Офер-шит</button>`);
        html = html.replace(new RegExp(`<tr class="mk-row([^"]*)" data-mk-open="${p.id}">`), `<tr class="mk-row$1 rfa-locked">`);
      });
    } catch (e) { console.warn('KHL Manager 14.7.32 rfa fa:', e); }
    return html;
  };

  /* ------------------------------------------------------------------ действия */
  // квота 150–170%: окно prompt() в Telegram не работает надёжно, поэтому три фиксированные ступени через confirm()
  proto.rfaOpenJunior = function (pid) {
    const p = this.marketPlayer(pid); if (!p) return;
    const pct = this._rfaJunPct || 160;
    const sal = Math.round(p.salary * pct / 100 / 500000) * 500000;
    const ok = confirm(`Квота для молодого ОСА: ${p.name}.\nСтавка: ${pct}% от прежней зарплаты (${fm(p.salary)}) = ${fm(sal)} в год.\nЗакрывает вопрос сразу, на рынок игрок не выйдет.\n\nПродлить на этих условиях?`);
    if (!ok) return;
    const r = this.rfaQualifyJunior(pid, pct);
    this.setNotice && this.setNotice(r.text);
    this.renderAll();
  };
  proto.rfaSetJunPct = function (pct) { this._rfaJunPct = pct; this.renderMarket && this.renderMarket(); };
  proto.rfaOpenOfferSheet = function (pid) {
    const p = this.marketPlayer(pid), rec = this.rfaOf(pid); if (!p || !rec) return;
    const old = this.teamById(rec.teamId);
    const salary = this.askSalary(p) * 1.1, years = this.wantYears(p), type = this.ageYears(p) <= 20 ? '3-way' : (p.contract === '1-way' ? '1-way' : '2-way');
    const comp = this.offerSheetCompensation({ salary, years }, p);
    const ok = confirm(`Офер-шит: ${p.name}.\nУсловия: ${fm(salary)} в год, ${years} г.\nПрава сейчас у «${old ? old.name : ''}» — у клуба будет 7 дней, чтобы отстоять игрока.\nЕсли не отстоит, вы заплатите компенсацию ≈ ${fm(comp)} (идёт в ваш потолок).\n\nОтправить?`);
    if (!ok) return;
    const r = this.offerSheetSend(pid, this.state.teamId, { salary: Math.round(salary / 500000) * 500000, years, type, promises: [] });
    this.setNotice && this.setNotice(r.text);
    this.renderAll();
  };

  /* ------------------------------------------------------------------ оповещение об офер-шите на своего ОСА (матч/отпустить) */
  const _alert = proto.mkNextAlert;
  proto.mkNextAlert = function () {
    const my = this.state.teamId, os = this.offerSheetsOpen().find(x => x.oldTeam === my && !x.seen);
    if (os) return { kind: 'offersheet', os };
    return _alert.apply(this, arguments);
  };
  const _show = proto.mkShowAlerts;
  proto.mkShowAlerts = function () {
    if (!this.mk() || $('mk-alert') || this.mkBusyModal()) return;
    const a = this.mkNextAlert();
    if (!a || a.kind !== 'offersheet') return _show.apply(this, arguments);
    const os = a.os, p = this.marketPlayer(os.pid); if (!p) { os.seen = true; return; }
    os.seen = true;
    const left = Math.max(0, os.matchUntil - Number(this.state.dayIndex || 0));
    const html = `<div class="mk-dh"><div><h3>Офер-шит на вашего ОСА</h3><div class="small muted">${esc(p.name)} · ${this.positionLabel(p.pos)} · ${this.ageText(Math.floor(this.ageYears(p)))}</div></div></div>`
      + `<div class="mk-rival"><b>${this.cdTeam(os.fromTeam)}</b>: ${fm(os.offer.salary)} · ${this.ageText(os.offer.years)} в год</div>`
      + `<p class="small">Повторите условия точь-в-точь, чтобы сохранить игрока, или откажитесь — тогда он уходит в ${this.cdTeam(os.fromTeam)}, а клуб-похититель платит компенсацию ≈ ${fm(os.comp)} в свой потолок. Решение нужно принять в течение ${left} дн., иначе уход засчитается автоматически.</p>`
      + `<div class="pg-btns"><button type="button" class="btn btn-primary" data-os-match="${esc(os.id)}">Отстоять игрока</button><button type="button" class="btn" data-os-decline="${esc(os.id)}">Отпустить</button></div>`;
    const el = document.createElement('div'); el.id = 'mk-alert'; el.className = 'pg-scrim mk-scrim';
    el.innerHTML = `<div class="pg-dlg mk-dlg" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(el);
    this.persistQuietly && this.persistQuietly();
  };

  /* ------------------------------------------------------------------ события */
  document.addEventListener('click', e => {
    const app = A(); if (!app || !app.state || !app.mk || !app.mk()) return;
    const t = e.target.closest ? e.target : null; if (!t) return;
    let b;
    if ((b = t.closest('[data-rfa-q]'))) { const r = app.rfaQualify(b.dataset.rfaQ, app.state.teamId); app.setNotice && app.setNotice(r.text); app.renderAll(); return; }
    if (t.closest('[data-rfa-qall]')) { const r = app.rfaQualifyAll(app.state.teamId); app.setNotice && app.setNotice(r.text); app.renderAll(); return; }
    if ((b = t.closest('[data-rfa-pct]'))) { app.rfaSetJunPct(Number(b.dataset.rfaPct)); return; }
    if ((b = t.closest('[data-rfa-jun]'))) { app.rfaOpenJunior(b.dataset.rfaJun); return; }
    if ((b = t.closest('[data-rfa-rel]'))) { const r = app.rfaRelease(b.dataset.rfaRel); app.setNotice && app.setNotice(r.text); app.renderAll(); return; }
    if ((b = t.closest('[data-rfa-os]'))) { app.rfaOpenOfferSheet(b.dataset.rfaOs); return; }
    if ((b = t.closest('[data-os-match]'))) { app.mkCloseAlert(); const r = app.offerSheetMatch(b.dataset.osMatch); app.setNotice && app.setNotice(r.text); app.renderAll(); return; }
    if ((b = t.closest('[data-os-decline]'))) { app.mkCloseAlert(); app.offerSheetDecline(b.dataset.osDecline); app.renderAll(); return; }
  });
})();
