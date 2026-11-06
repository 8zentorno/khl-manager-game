/* KHL Manager 9.36.3 — лёгкая травма (стычка) действует только до конца текущего матча.
   Раньше флаг снимался лишь при переходе дня, и до этого игрок «залипал»: в Запасе, «в порядке»,
   но dnd не давал поставить его в состав. */
(function () {
  const proto = KHLManagerApp.prototype;

  proto.clearLightInjuries = function () {
    if (!this.state || !this.db || !this.db.players) return 0;
    if (this.liveMatch && !this.liveMatch.finished) return 0;
    let n = 0;
    for (const p of this.db.players) {
      const d = this.playerDev && this.playerDev(p);
      if (d && d.injury && d.injury.severity === 'light') { delete d.injury; n++; }
    }
    return n;
  };

  ['completeLiveMatch', 'simulateMatch'].forEach(name => {
    const base = proto[name];
    if (typeof base !== 'function') return;
    proto[name] = function () {
      const r = base.apply(this, arguments);
      try { this.clearLightInjuries(); } catch (e) { console.warn('KHL Manager 9.36.3 injuries:', e); }
      return r;
    };
  });

  /* сохранения, где травма уже «залипла»: чистим при отрисовке состава и смене вкладки */
  const rs = proto.renderLineScheme;
  if (typeof rs === 'function') proto.renderLineScheme = function () {
    try { this.clearLightInjuries(); } catch (e) {}
    return rs.apply(this, arguments);
  };
  const st = proto.switchTab;
  if (typeof st === 'function') proto.switchTab = function () {
    try { this.clearLightInjuries(); } catch (e) {}
    return st.apply(this, arguments);
  };
})();
