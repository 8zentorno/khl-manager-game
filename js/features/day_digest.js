/* KHL Manager 11.3.0 — панель «Итоги дня» над сезоном вместо строки «Сыграно матчей лиги/плей-офф: N. Дата: …».
   После «Промотать день»: результаты лиги за этот день (ваш матч выделен), положение клуба и ближайший матч.
   В паузе вместо результатов показывается причина паузы и день паузы. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  const MAX_CHIPS = 12;

  proto.dgDateText = function (offset) {
    const d = this.calDate ? this.calDate(offset).d : new Date(offset);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };
  proto.dgRank = function () {
    try { const st = this.state; if (!st || (st.playoff && st.playoff.started)) return null; if (!((st.standings[st.teamId] || {}).gp > 0)) return null; const r = this.conferenceRank(st.teamId); return r > 0 ? r : null; } catch (e) { return null; }
  };
  proto.dgChip = function (m) {
    const my = this.state.teamId, h = this.teamById(m.homeId), a = this.teamById(m.awayId), tail = m.so ? ' Б' : m.ot ? ' ОТ' : '';
    const me = m.homeId === my || m.awayId === my, esc = x => this.escape(String(x));
    return `<button type="button" class="dg-chip${me ? ' me' : ''}" data-dg-open="${esc(m.id)}">${esc(h ? h.name : '—')} <b>${m.homeScore}:${m.awayScore}${tail}</b> ${esc(a ? a.name : '—')}</button>`;
  };
  proto.dgNextLine = function () {
    const st = this.state, esc = x => this.escape(String(x));
    const m = this.overviewNextMatch ? this.overviewNextMatch() : null;
    if (!m) return this.calendarUnformed && this.calendarUnformed() ? 'Календарь добора формируется 5 февраля.' : '';
    const my = st.teamId, opp = this.teamById(m.homeId === my ? m.awayId : m.homeId), days = Math.max(0, Number(m.dateOffset) - Number(st.dayIndex || 0));
    const when = days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
    return `Ближайший матч: ${esc(opp ? opp.name : '—')}, ${this.dgDateText(m.dateOffset)}, ${m.homeId === my ? 'дома' : 'в гостях'} (${when}).`;
  };
  proto.dgHtml = function () {
    const st = this.state, day = Number(st.dayIndex || 0), esc = x => this.escape(String(x));
    const pause = this.pauseDayInfo ? this.pauseDayInfo(day) : null;
    const next = this.dgNextLine();
    if (pause) {
      return `<div class="dg-head"><span class="dg-t">⏸ Пауза: ${esc(pause.name)}</span><span class="dg-s">${esc(pause.short)} · день ${pause.day} из ${pause.total}</span></div>` +
        `<div class="dg-line">Матчей лиги нет, тренировки идут.</div>${this._calFormedToday === day ? '<div class="dg-line">📅 Лига утвердила добор, календарь до 20 марта опубликован.</div>' : ''}${next ? `<div class="dg-line">${next}</div>` : ''}`;
    }
    const ms = st.matches.filter(m => !m.cancelled && m.played && Number(m.dateOffset) === day).sort((a, b) => (b.homeId === st.teamId || b.awayId === st.teamId) - (a.homeId === st.teamId || a.awayId === st.teamId));
    const head = `<div class="dg-head"><span class="dg-t">Итоги ${this.dgDateText(day)}</span><span class="dg-s">${ms.length ? `в лиге сыграно ${ms.length} ${plural(ms.length, 'матч', 'матча', 'матчей')}` : 'в лиге матчей нет'}</span></div>`;
    const chips = ms.length ? `<div class="dg-chips">${ms.slice(0, MAX_CHIPS).map(m => this.dgChip(m)).join('')}${ms.length > MAX_CHIPS ? `<span class="dg-more">и ещё ${ms.length - MAX_CHIPS}</span>` : ''}</div>` : '';
    const rank = this.dgRank(), prev = this._dgPrevRank;
    let place = '';
    if (rank) {
      const arrow = prev && prev !== rank ? (rank < prev ? ` <span class="dg-up">▲ ${prev}-е → ${rank}-е</span>` : ` <span class="dg-dn">▼ ${prev}-е → ${rank}-е</span>`) : '';
      place = `Вы на ${rank}-м месте в конференции${arrow}.`;
    }
    const line = [place, next].filter(Boolean).join(' ');
    return head + chips + (line ? `<div class="dg-line">${line}</div>` : '') + (this._calFormedToday === day ? '<div class="dg-line">📅 Лига утвердила добор, календарь до 20 марта опубликован.</div>' : '');
  };
  proto.renderDayDigest = function () {
    const el = $('last-result-note'); if (!el || !this.state) return;
    el.innerHTML = this.dgHtml(); el.className = 'notice ov-digest';
    if (!el._dgBound) {
      el._dgBound = true;
      el.addEventListener('click', ev => {
        const b = ev.target.closest('[data-dg-open]'); if (!b) return;
        const m = this.state.matches.find(x => x.id === b.dataset.dgOpen); if (!m || !m.played) return;
        this.currentMatchId = m.id; this.switchTab('match'); try { this.renderMatchCenter(); } catch (e) { }
      });
    }
    this._dgOn = true;
  };

  // обычное уведомление снимает вид «итогов дня»
  const baseNotice = proto.setNotice;
  proto.setNotice = function () { this._dgOn = false; const el = $('last-result-note'); if (el) el.classList.remove('ov-digest'); return baseNotice.apply(this, arguments); };

  const baseAdv = proto.advanceDay;
  proto.advanceDay = function () {
    this._dgPrevRank = this.state ? this.dgRank() : null;
    const day0 = this.state ? Number(this.state.dayIndex || 0) : 0;
    this._calFormedToday = null;
    const r = baseAdv.apply(this, arguments);
    try {
      const st = this.state;
      if (st && Number(st.dayIndex || 0) > day0 && !(this.duePendingUserMatch && this.duePendingUserMatch()) && !(st.playoff && st.playoff.completed)) this.renderDayDigest();
    } catch (e) { console.warn('KHL Manager 11.3 digest:', e); }
    return r;
  };
  // после renderAll нужно вернуть панель (renderAll очищает только карточки, но на всякий случай держим её)
  const baseAll = proto.renderAll;
  proto.renderAll = function () {
    const r = baseAll.apply(this, arguments);
    try { if (this._dgOn && this.state) this.renderDayDigest(); } catch (e) { }
    return r;
  };

  // кнопка «Играть следующий матч» до формирования добора
  const baseOv = proto.renderOverview;
  proto.renderOverview = function () {
    const r = baseOv.apply(this, arguments);
    try {
      const b = document.querySelector('.ov-actions .btn-primary');
      if (b && this.state && this.calendarUnformed && this.calendarUnformed() && !this.overviewNextMatch()) b.textContent = '⏩ Дожить до добора';
      else if (b && b.textContent === '⏩ Дожить до добора') b.textContent = '▶ Играть следующий матч';
    } catch (e) { }
    return r;
  };
})();
