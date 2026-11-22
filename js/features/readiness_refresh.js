/* KHL Manager 11.2.0 — карточка «Готовность к матчу» на Обзоре перерисовывается после любого изменения состава.
   Раньше она рисовалась один раз при открытии вкладки и после замены игроков показывала устаревшее предупреждение. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  let busy = false;
  proto.refreshReadiness = function () {
    if (busy || !this.state || !this.overviewNextMatch || !this.overviewOddsHtml) return;
    const el = document.getElementById('ov-odds'); if (!el) return;
    busy = true;
    try { const m = this.overviewNextMatch(); if (m) { el.className = 'ov-fc'; el.innerHTML = this.overviewOddsHtml(m); } }
    catch (e) { console.warn('KHL Manager 11.2 readiness:', e); }
    finally { busy = false; }
  };
  ['assignSlot', 'assignSpecialPlayer', 'applySpecialTeamsDraft76', 'discardSpecialTeamsDraft76', 'resetSpecialTeams', 'resetLineup',
    'returnToSlot', 'returnToSpecial', 'renderPregame', 'switchTab', 'advanceDay', 'simulateMatch', 'completeLiveMatch',
    'renderRoster', 'renderLineScheme', 'renderSpecialTeams', 'closePregame'].forEach(name => {
    const base = proto[name]; if (typeof base !== 'function') return;
    proto[name] = function () {
      const r = base.apply(this, arguments);
      try { this.refreshReadiness(); } catch (e) { }
      return r;
    };
  });
})();
