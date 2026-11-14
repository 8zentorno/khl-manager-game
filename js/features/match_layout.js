/* KHL Manager 9.32.0 — «Матч-центр»: табло, «Минута матча», строка событий, коробка слева и статистика справа, «Ход матча» внизу.
   Этап (регулярка или стадия плей-офф) стоит над названием арены, описание «дата · этап · статус» убрано. */
(function () {
  const proto = (typeof KHLManagerApp !== 'undefined' && KHLManagerApp.prototype);
  if (!proto) return;
  const $ = id => document.getElementById(id);

  proto.mcLayoutApply = function () {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const card = document.querySelector('#view-match > .card'), canvas = $('rink-canvas');
    if (!card || !canvas) return;
    let split = $('mc-split');
    if (!split) {
      split = document.createElement('div'); split.id = 'mc-split'; split.className = 'mc-split';
      const l = document.createElement('div'); l.id = 'mc-rinkcol'; l.className = 'mc-rinkcol';
      const r = document.createElement('div'); r.id = 'mc-statcol'; r.className = 'mc-statcol';
      split.appendChild(l); split.appendChild(r);
      const ref = $('rink-label') || canvas;
      ref.parentNode.insertBefore(split, ref);
    }
    const l = $('mc-rinkcol'), r = $('mc-statcol');
    ['rink-label', 'rink-canvas', 'rink-legend', 'rink-detail'].forEach(id => { const e = $(id); if (e && e.parentNode !== l) l.appendChild(e); });
    const st = $('match-statistics'); if (st && st.parentNode !== r) r.appendChild(st);
  };

  proto.mcStageLabel = function (m) {
    if (!m) return '';
    if (m.playoff) return `${this.playoffStageName(m.playoffStage)} · игра ${m.gameNo} серии`;
    return this.state && this.state.calendar ? 'Игровой день' : `${m.round}-й игровой раунд`;
  };

  const base = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = base.apply(this, arguments);
    try {
      this.mcLayoutApply();
      const top = document.querySelector('#match-scoreboard .arena-live-top'), sub = $('match-center-subtitle');
      if (sub) sub.style.display = top ? 'none' : '';
      if (top && this.state) {
        const m = this.liveMatch && this.liveMatch.matchId === this.currentMatchId ? this.liveMatch.simulatedMatch : (this.state.matches || []).find(x => x.id === this.currentMatchId);
        top.querySelectorAll('.mc-stage').forEach(e => e.remove());
        const txt = this.mcStageLabel(m);
        if (txt) top.insertAdjacentHTML('afterbegin', `<span class="mc-stage">${this.escape(txt)}</span>`);
      }
    } catch (e) { console.warn('KHL Manager 9.32 match layout:', e); }
    return r;
  };
})();
