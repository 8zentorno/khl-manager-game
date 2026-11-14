/* 12.1.0 — капитан и ассистенты (К/А). Только отображение: на ход матча и развитие не влияет.
   Правило: один капитан и не более двух ассистентов из полевых игроков; вратари не назначаются.
   Данные: поля captain / alternate в базе. Основные ассистенты — двое сильнейших по звену и рейтингу.
   Если капитан недоступен (травма), «К» на это время носит первый ассистент («и.о.»), его место
   в «А» занимает следующий по приоритету. */
(function () {
  const proto = KHLManagerApp.prototype;
  const ESC = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const unavailable = (app, p) => { try { return !!(app.state && app.isPlayerUnavailable && app.isPlayerUnavailable(p)); } catch (e) { return false; } };

  proto.leadership = function (teamId) {
    const players = (this.db && this.db.players ? this.db.players : []).filter(p => p.teamId === teamId && p.pos !== 'G');
    const cap = players.find(p => p.captain) || null;
    const alts = players.filter(p => p.alternate && !p.captain)
      .sort((a, b) => (Number(a.line) || 9) - (Number(b.line) || 9) || (b.ovr - a.ovr) || String(a.id).localeCompare(String(b.id)));
    const healthy = alts.filter(p => !unavailable(this, p));
    let captain = cap, acting = false, rest = healthy.slice();
    if (!cap || unavailable(this, cap)) { captain = rest.shift() || null; acting = !!captain && !!cap; }
    return { captain, acting, nominal: cap, alts: rest.slice(0, 2), reserve: rest.slice(2) };
  };
  proto.kaRole = function (p) {
    if (!p || p.pos === 'G' || (!p.captain && !p.alternate)) return null;
    const L = this.leadership(p.teamId);
    if (L.captain && L.captain.id === p.id) return L.acting ? 'act' : 'c';
    if (L.alts.some(x => x.id === p.id)) return 'a';
    return null;
  };
  const TITLE = { c: 'Капитан команды', act: 'Исполняющий обязанности капитана', a: 'Ассистент капитана' };
  proto.kaBadge = function (p, extra) {
    const r = this.kaRole(p); if (!r) return '';
    return `<span class="ka-b ${r === 'a' ? 'a' : 'c'}${r === 'act' ? ' act' : ''}${extra ? ' ' + extra : ''}" title="${TITLE[r]}" aria-label="${TITLE[r]}">${r === 'a' ? 'А' : 'К'}</span>`;
  };
  proto.kaBadgeById = function (id) { const p = (this.db.players || []).find(x => x.id === id); return p ? this.kaBadge(p) : ''; };
  proto.kaText = function (p) {
    const r = this.kaRole(p); return r ? (r === 'a' ? ' (А)' : r === 'act' ? ' (и.о. К)' : ' (К)') : '';
  };
  proto.leadershipLineHtml = function (teamId) {
    const L = this.leadership(teamId), sn = p => `<span class="nm" data-pl="${ESC(p.id)}">${ESC(String(p.name).trim().split(/\s+/).slice(-1)[0])}</span>`;
    const parts = [];
    if (L.captain) parts.push(`<span class="ka-b c${L.acting ? ' act' : ''}" title="${L.acting ? TITLE.act : TITLE.c}">К</span> ${sn(L.captain)}${L.acting ? ' (и.о.)' : ''}`);
    L.alts.forEach(p => parts.push(`<span class="ka-b a" title="${TITLE.a}">А</span> ${sn(p)}`));
    return parts.length ? `<div class="ln"><i title="Капитан и ассистенты">©</i><span>${parts.join(' · ')}</span></div>` : '';
  };

  // фишки звеньев и спецбригад
  const baseChip = proto.schemeChip;
  if (baseChip) proto.schemeChip = function (o) {
    const html = baseChip.apply(this, arguments);
    const b = o && o.player ? this.kaBadge(o.player, 'ka-chip') : '';
    return b && html.endsWith('</button>') ? html.slice(0, -9) + b + '</button>' : html;
  };
})();
