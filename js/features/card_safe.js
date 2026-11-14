/* 14.7.8: устойчивые карточки игрока и клуба. Если один из блоков карточки выдаёт ошибку (например, в плей-офф),
   карточка не «залипает» на старой странице: блок пропускается, внизу показывается пометка с названием ошибки. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BLOCKS = ['teamRankLine', 'cardContract', 'kaBadge', 'cdKpis', 'cdLastTable', 'cdSkills', 'cdSkillBars', 'cdContractBox', 'cdInjuryBox',
    'cdSpark', 'cdMatchRows', 'cdMatchId', 'playerAvatarSvg', 'leadershipLineHtml', 'clubFactsHtml', 'clubTransfersHtml', 'clubCalendarHtml', 'clubFinanceHtml',
    'ratingHistory', 'playerInjuries', 'birthText', 'cdTeam', 'cdName'];
  let errs = [];
  BLOCKS.forEach(name => {
    const base = proto[name]; if (typeof base !== 'function') return;
    proto[name] = function () {
      try { return base.apply(this, arguments); }
      catch (e) { errs.push(name + ': ' + (e && e.message)); console.error('KHL card block ' + name, e); return ''; }
    };
  });
  const baseRender = proto.cardRender;
  proto.cardRender = function () {
    const c = this._card; errs = [];
    try { const h0 = c && document.getElementById('view-' + c.t); if (h0) h0.innerHTML = '<div class="cd-wrap"><p class="muted small">Загрузка карточки…</p></div>'; } catch (e) { }   // старая страница не может остаться на экране
    try { baseRender.apply(this, arguments); }
    catch (e) {
      console.error('KHL card render', e);
      const host = c && document.getElementById('view-' + c.t);
      if (host) host.innerHTML = '<div class="cd-wrap"><div class="cd-top"><button type="button" class="btn btn-quiet" data-cd="back">← Назад</button></div>'
        + '<div class="card"><p>Не удалось показать карточку.</p><p class="muted small">' + E(e && e.message) + '</p></div></div>';
      return;
    }
    if (errs.length && c) {
      const host = document.getElementById('view-' + c.t), w = host && host.querySelector('.cd-wrap');
      if (w) w.insertAdjacentHTML('beforeend', '<p class="muted small">Часть данных не показана: ' + E(errs.slice(0, 3).join('; ')) + '</p>');
    }
  };
})();
