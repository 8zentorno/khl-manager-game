/* KHL Manager 9.16.0 — главное меню: карточка «Продолжить», номер версии, подтверждение новой карьеры.
   Время сохранения (savedAt) пишется при каждом сохранении. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);

  const stamp = fn => function () { try { if (this.state) this.state.savedAt = Date.now(); } catch (e) { } return fn.apply(this, arguments); };
  if (proto.persistQuietly) proto.persistQuietly = stamp(proto.persistQuietly);
  if (proto.saveGame) proto.saveGame = stamp(proto.saveGame);

  proto.readStoredSave = function () {
    try { const s = JSON.parse(localStorage.getItem(this.storageKey) || 'null'); return s && this.validateSave(s) ? s : null; } catch (e) { return null; }
  };

  // Данные для карточки считаются на копии состояния: текущая игра (если есть) не затрагивается.
  proto.menuContinueInfo = function (save) {
    const keep = this.state;
    try {
      this.state = save;
      const team = this.teamById(save.teamId), ss = (save.standings || {})[save.teamId] || {};
      const conf = String(team.conf || '').toLowerCase();
      const place = this.conferenceRank(save.teamId);
      const next = save.matches.filter(m => !m.played && !m.cancelled && (m.homeId === save.teamId || m.awayId === save.teamId)).sort((a, b) => a.dateOffset - b.dateOffset)[0];
      let nextTxt = 'Сезон завершён';
      if (next) {
        const opp = this.teamById(next.homeId === save.teamId ? next.awayId : next.homeId);
        nextTxt = `Дальше: ${opp.name}, ${this.formatDate(next.dateOffset)}, ${(this.stadiumFor(next.homeId) || {}).name || ''}`;
      }
      const po = save.playoff && save.playoff.started;
      const prog = po ? 'плей-офф' : `регулярка: ${ss.gp || 0} из 68`;
      const when = save.savedAt ? new Date(save.savedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';
      return { team: team.name, conf: conf === 'west' ? 'на Западе' : 'на Востоке', place, prog, nextTxt, when, po };
    } finally { this.state = keep; }
  };

  proto.renderMenuContinue = function () {
    const box = $('menu-continue'); if (!box) return;
    const save = this.readStoredSave();
    if (!save) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    try {
      const i = this.menuContinueInfo(save), e = s => this.escape(String(s));
      box.innerHTML = `<b>${e(i.team)} · сезон ${i.season || '2026/27'}</b><span>${i.po ? '' : `${i.place}-е место ${i.conf} · `}${e(i.prog)}${i.when ? ' · сохранено ' + e(i.when) : ''}</span><span>${e(i.nextTxt)}</span>`;
      box.classList.remove('hidden');
    } catch (err) { box.classList.add('hidden'); }
  };

  const _upd = proto.updateContinueButton;
  proto.updateContinueButton = function () { const r = _upd.apply(this, arguments); this.renderMenuContinue(); return r; };

  const _show = proto.showScreen;
  if (_show) proto.showScreen = function (id) { const r = _show.apply(this, arguments); if (id === 'screen-menu') this.renderMenuContinue(); return r; };

  // Новая карьера заменит сохранение: спрашиваем, если оно уже есть.
  const _wiz = proto.startNewGameWizard;
  proto.startNewGameWizard = function () {
    const save = this.readStoredSave();
    if (save && typeof confirm === 'function') {
      const i = this.menuContinueInfo(save);
      if (!confirm(`В браузере уже есть сохранение: ${i.team}, ${i.prog}. Новая карьера заменит его, когда вы начнёте игру. Перед этим можно экспортировать копию в файл. Продолжить?`)) return;
    }
    return _wiz.apply(this, arguments);
  };

  const v = (document.title.match(/(\d+\.\d+\.\d+)\s*$/) || [])[1];
  const el = $('menu-version'); if (el && v) el.textContent = 'Версия ' + v;
  if (proto.renderMenuContinue && typeof app !== 'undefined' && app) app.renderMenuContinue();
})();
