/* 9.22.0 — Матч-центр: пока идёт матч, кнопки «Играть следующий матч» нет; после финального свистка она появляется. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const base = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = base.apply(this, arguments);
    try { this.mcSyncButtons(); } catch (e) { console.warn('mc buttons', e); }
    return r;
  };
  proto.mcSyncButtons = function () {
    if (typeof document === 'undefined' || !document.querySelector) return;
    const head = document.querySelector('#view-match .section-head');
    if (!head) return;
    const play = head.querySelector('[onclick*="playNextMatch"]'), quick = head.querySelector('[onclick*="finishMatchSim"]');
    const live = this.liveMatch && !this.liveMatch.finished;
    const cur = this.state && this.currentMatchId && (this.state.matches || []).find(m => m.id === this.currentMatchId);
    if (play) play.hidden = !!live || !!(this.poNoNextMatch && this.poNoNextMatch());
    const done = !!(this.liveMatch && this.liveMatch.finished);
    if (quick) quick.hidden = live ? false : (done || !(cur && !cur.played));
  };
})();
