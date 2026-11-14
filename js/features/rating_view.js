/* KHL Manager 9.38.0 — рейтинг игрока: постоянный (большая цифра) и текущий (разница под ним).
   Журнал постоянного рейтинга; с 11.2.0 цифра справа показывает изменение за весь сезон, 0 скрыт. */
(function () {
  const proto = KHLManagerApp.prototype;
  

  proto.ratingView = function (p) {
    const perm = Math.round(this.permanentOVR(p)), now = Math.round(this.effectiveOVR(p));
    return { perm, now, diff: now - perm };
  };
  proto.ratingDiffHtml = function (diff, cls) {
    if (!diff) return '';
    return `<i class="rv-d ${diff > 0 ? 'up' : 'down'}${cls ? ' ' + cls : ''}">${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}</i>`;
  };

  /* журнал изменений постоянного рейтинга: state.permLog[id] = [[день, рейтинг], ...] */
  proto.trackPerm = function () {
    if (!this.state || !this.db || !this.db.players) return;
    const log = this.state.permLog || (this.state.permLog = {}), day = this.state.dayIndex || 0;
    for (const p of this.db.players) {
      if (!this.playerDev(p)) continue;
      const v = this.permanentOVR(p), a = log[p.id];
      if (!a) { log[p.id] = [[day, v]]; continue; }
      if (a[a.length - 1][1] !== v) {
        a.push([day, v]);
        /* 11.2.0: первая запись (рейтинг на старте сезона) хранится всегда; обрезаем только середину */
        while (a.length > 40) a.splice(1, 1);
      }
    }
  };
  /* 11.2.0: изменение постоянного рейтинга за весь сезон = рейтинг сейчас минус рейтинг на старте (первая запись журнала) */
  proto.permGrowth = function (p) {
    const a = this.state && this.state.permLog && this.state.permLog[p.id];
    if (!a || !a.length) return 0;
    return Math.round(this.permanentOVR(p) - a[0][1]);
  };
  proto.growthHtml = function (g) {
    if (!g) return '';
    const cls = g > 0 ? 'up' : 'down';
    return `<span class="rv-g ${cls}" title="Изменение постоянного рейтинга с начала сезона">${g > 0 ? '+' + g : '−' + Math.abs(g)}</span>`;
  };

  ['advanceDay', 'simulateMatch', 'completeLiveMatch'].forEach(name => {
    const base = proto[name];
    if (typeof base !== 'function') return;
    proto[name] = function () {
      const r = base.apply(this, arguments);
      try { this.trackPerm(); } catch (e) { console.warn('KHL Manager 9.38 permLog:', e); }
      return r;
    };
  });
})();
