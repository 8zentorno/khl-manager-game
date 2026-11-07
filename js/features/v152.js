/* KHL Manager 14.5.2 — ссылки на тренеров и счета, эмблемы клубов в шапке, «Ближайшем матче» и Матч-центре.
 * Ссылки выглядят как у клубов и игроков (класс nm), без синего цвета.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- ссылки на тренеров ---------- */
  let CI = null, CKEY = '';
  function inflect(sur) { // простые падежные формы фамилии
    const out = [sur];
    if (/(ский|цкий)$/.test(sur)) { const b = sur.slice(0, -2); out.push(b + 'ого', b + 'ому', b + 'им', b + 'ом'); }
    else if (/[бвгджзклмнпрстфхцчшщ]$/.test(sur)) out.push(sur + 'а', sur + 'у', sur + (/[жчшщ]$/.test(sur) ? 'ем' : 'ом'), sur + 'е', sur + 'ым');
    return out;
  }
  function coachIdx(app) {
    const key = app.db && app.db.teams ? app.db.teams.map(t => t.coach).join('|') : '';
    if (CI && CKEY === key) return CI; CKEY = key;
    const map = new Map(), players = new Set();
    for (const p of app.db.players || []) players.add(String(p.name).trim().split(/\s+/).slice(-1)[0]);
    const cs = app.db.teams.filter(t => t.coach).map(t => ({ id: t.id, name: String(t.coach).replace(/\s*\(и\.о\.\)/, '').trim() }));
    const surCount = new Map(); cs.forEach(c => { const s = c.name.split(/\s+/).slice(-1)[0]; surCount.set(s, (surCount.get(s) || 0) + 1); });
    const forms = [];
    for (const c of cs) {
      map.set(c.name, c.id); forms.push(c.name);
      const s = c.name.split(/\s+/).slice(-1)[0];
      if (players.has(s) || surCount.get(s) > 1 || s.length < 4) continue;
      for (const f of inflect(s)) if (!map.has(f)) { map.set(f, c.id); forms.push(f); }
    }
    forms.sort((a, b) => b.length - a.length);
    const re = forms.length ? new RegExp('(?<![А-Яа-яЁё-])(' + forms.map(rx).join('|') + ')(?![А-Яа-яЁё])', 'g') : null;
    return (CI = { map, re });
  }
  const baseNL = proto.newsLinkHtml;
  proto.newsLinkHtml = function (text) {
    const html = baseNL ? baseNL.apply(this, arguments) : E(text);
    if (!this.db || !this.db.teams) return html;
    const ix = coachIdx(this); if (!ix.re) return html;
    const parts = html.split(/(<[^>]+>)/); let depth = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.charAt(0) === '<') { if (/^<span class="nm"/.test(p)) depth++; else if (depth && p === '</span>') depth--; continue; }
      if (depth || !p) continue;
      ix.re.lastIndex = 0;
      parts[i] = p.replace(ix.re, m => `<span class="nm" data-co="${E(ix.map.get(m))}">${m}</span>`);
    }
    return parts.join('');
  };

  /* ---------- счета ведут в матч ---------- */
  function findMatch(app, h, a, hs, as, date) {
    const L = (app.state.matches || []).filter(m => m.played && !m.cancelled && Number(m.homeScore) === hs && Number(m.awayScore) === as && (!h || m.homeId === h) && (!a || m.awayId === a));
    if (!L.length) return null;
    const near = L.filter(m => date == null || m.dateOffset <= date + 1).sort((x, y) => y.dateOffset - x.dateOffset);
    return (near[0] || L.sort((x, y) => y.dateOffset - x.dateOffset)[0]).id;
  }
  proto.findScoreMatch = function (h, a, hs, as, date) { return findMatch(this, h, a, hs, as, date); };
  function linkScores(app, el) {
    if (!app.state) return;
    const host = el.closest('[data-nd]') || el, cat = host.dataset ? host.dataset.ncat : '';
    if (cat === 'series') return;
    const date = host.dataset && host.dataset.nd !== undefined ? Number(host.dataset.nd) : null, mid = host.dataset && host.dataset.nmid, nt = ((host.dataset && host.dataset.nt) || '').split(',').filter(Boolean);
    const w = document.createTreeWalker(el, 4), nodes = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue && /\d+:\d+/.test(n.nodeValue) && !(n.parentElement && n.parentElement.closest('[data-mc],button'))) nodes.push(n);
    for (const n of nodes) {
      const v = n.nodeValue, re = /(?<![\d:])(\d{1,2}):(\d{1,2})(?![\d:])/g; let m, last = 0; const frag = document.createDocumentFragment(); let any = false;
      const prev = n.previousSibling, next = n.nextSibling;
      while ((m = re.exec(v))) {
        const hs = Number(m[1]), as = Number(m[2]); let id = null;
        const before = v.slice(0, m.index).trim() === '' ? prev : null, after = v.slice(m.index + m[0].length).trim() === '' ? next : null;
        if (before && after && before.dataset && after.dataset && before.dataset.cl && after.dataset.cl) id = findMatch(app, before.dataset.cl, after.dataset.cl, hs, as, date);
        if (!id && mid) { const mm = (app.state.matches || []).find(x => x.id === mid && x.played && Number(x.homeScore) === hs && Number(x.awayScore) === as); if (mm) id = mm.id; }
        if (!id && nt.length === 2) id = findMatch(app, nt[0], nt[1], hs, as, date) || findMatch(app, nt[1], nt[0], hs, as, date);
        if (!id) continue;
        any = true;
        if (m.index > last) frag.appendChild(document.createTextNode(v.slice(last, m.index)));
        const sp = document.createElement('span'); sp.className = 'nm'; sp.dataset.mc = id; sp.textContent = m[0]; frag.appendChild(sp); last = m.index + m[0].length;
      }
      if (!any) continue;
      if (last < v.length) frag.appendChild(document.createTextNode(v.slice(last)));
      n.parentNode.replaceChild(frag, n);
    }
  }
  proto.linkScoresIn = function (el) { linkScores(this, el); };
  const baseNews = proto.renderNews;
  proto.renderNews = function () {
    const r = baseNews.apply(this, arguments);
    try { document.querySelectorAll('#news-feed .news-title, #news-feed .news-body').forEach(el => linkScores(this, el)); } catch (e) { console.warn('news scores', e); }
    return r;
  };
  const baseOv = proto.renderOverview;
  if (baseOv) proto.renderOverview = function () {
    const r = baseOv.apply(this, arguments);
    try { const host = document.getElementById('ov-news'); if (host) host.querySelectorAll('.ov-news-item').forEach(el => linkScores(this, el)); } catch (e) { }
    return r;
  };
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-mc]');
    if (!a || typeof app === 'undefined' || !app.state) return;
    e.preventDefault(); e.stopPropagation();
    app.currentMatchId = a.dataset.mc; app.switchTab('match');
    const nb = document.querySelector('.nav button[data-view="match"]'); if (nb) { document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b === nb)); }
    try { app.renderMatchCenter(); } catch (er) { }
  }, true);

  /* ---------- эмблемы ---------- */
  let NM = null;
  const nameMap = () => { if (!NM && typeof app !== 'undefined' && app.db) NM = new Map(app.db.teams.map(t => [t.name, t.id])); return NM || new Map(); };
  function emblemize(root) {
    if (!root || !root.querySelectorAll || typeof app === 'undefined' || !app.clubEmblemSvg) return;
    const list = root.matches && root.matches('.club-badge') ? [root] : root.querySelectorAll('.club-badge:not(.emb)');
    list.forEach(b => {
      if (b.classList.contains('emb')) return;
      const nm = b.parentElement && b.parentElement.querySelector('.club-name'); if (!nm) return;
      const id = nameMap().get(nm.textContent.replace(/\s*◀$/, '').trim()); if (!id) return;
      const svg = app.clubEmblemSvg(id); if (!svg) return;
      b.classList.add('emb'); b.innerHTML = svg; b.setAttribute('aria-label', nm.textContent.trim());
    });
  }
  proto.emblemizeBadges = emblemize;
  function boot() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    let q = new Set(), busy = false;
    const flush = () => { busy = false; const s = q; q = new Set(); s.forEach(n => { if (n.isConnected) emblemize(n); }); };
    new MutationObserver(recs => {
      for (const r of recs) r.addedNodes.forEach(n => { if (n.nodeType === 1 && (n.matches('.club-badge') || n.querySelector('.club-badge'))) q.add(n); });
      if (!busy && q.size) { busy = true; (window.requestAnimationFrame || setTimeout)(flush); }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }

  /* ---------- шапка: эмблема и тренер ---------- */
  proto.headerHtml = function () {
    const t = this.teamById(this.state.teamId); if (!t) return null;
    return { team: `<span class="hdr-emb">${this.clubEmblemSvg(t.id)}</span>${E(t.name)}`, coach: `Тренер: ${this.coachLink ? this.coachLink(t.id, String(t.coach || '').replace(/\s*\(и\.о\.\)/, '').trim() || '—') : E(t.coach || '—')}${/\(и\.о\.\)/.test(t.coach || '') ? ' (и.о.)' : ''}` };
  };
  const baseAll = proto.renderAll;
  proto.renderAll = function () {
    const r = baseAll.apply(this, arguments);
    try {
      if (this.state && typeof document !== 'undefined') {
        const h = this.headerHtml(), te = document.getElementById('header-team'), ce = document.getElementById('header-coach');
        if (h && te) te.innerHTML = h.team; if (h && ce) ce.innerHTML = h.coach;
      }
    } catch (e) { console.warn('header', e); }
    return r;
  };
})();
