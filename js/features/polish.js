/* KHL Manager 9.0 — мелкие правки по итогам полного прохода: длинная лента новостей, пустые вратари. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const PAGE = 40;

  const _rn = proto.renderNews;
  proto.renderNews = function () {
    const r = _rn.apply(this, arguments);
    try {
      const root = document.getElementById('news-feed'); if (!root) return r;
      const lim = this._newsLimit || PAGE, items = [...root.querySelectorAll('.news-entry')];
      if (items.length > lim) {
        items.slice(lim).forEach(e => e.remove());
        root.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-quiet news-more" onclick="app.showMoreNews()">Показать ещё (${items.length - lim})</button>`);
      }
    } catch (e) { /* лента не должна ломать вкладку */ }
    return r;
  };
  proto.showMoreNews = function () { this._newsLimit = (this._newsLimit || PAGE) + PAGE; this.renderNews(); };
  const _sf = proto.setNewsFilter;
  proto.setNewsFilter = function () { this._newsLimit = PAGE; return _sf.apply(this, arguments); };

  const _rs = proto.renderStats;
  proto.renderStats = function () {
    const r = _rs.apply(this, arguments);
    try {
      const box = document.getElementById('goalie-stats'), e = box && box.querySelector('.empty');
      if (e && this.state) {
        const played = Object.values(this.state.standings || {}).some(s => (s.gp || 0) > 0);
        if (played) e.textContent = `Пока ни один вратарь не сыграл ${this.goalieQualifyGames()} матчей.`;
      }
    } catch (err) { /* не критично */ }
    return r;
  };
})();
