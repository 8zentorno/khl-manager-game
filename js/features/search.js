/* KHL Manager 14.5.3 — поиск по игре: игроки, клубы, тренеры.
 * ПК: кнопка в верхней панели, Ctrl+K или «/», предпросмотр справа. Телефон: значок 🔍 в шапке, поиск на весь экран.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CODES = { avangard: 'АВГ', avtomobilist: 'АВТ', admiral: 'АДМ', akbars: 'АКБ', amur: 'АМУ', barys: 'БАР', dinamo_mn: 'ДМН', dinamo_msk: 'ДМО', lada: 'ЛАД', lokomotiv: 'ЛОК', metallurg: 'ММГ', neftekhimik: 'НЕФ', salavat: 'СЮЛ', severstal: 'СЕВ', sibir: 'СИБ', ska: 'СКА', sochi: 'СОЧ', spartak: 'СПА', torpedo: 'ТОР', traktor: 'ТРК', cska: 'ЦСК', shanghai: 'ШДР' };
  const POSN = { G: 'Вратарь', D: 'Защитник', LW: 'Левый нап.', C: 'Центр', RW: 'Правый нап.' };
  const POSW = { 'вр': 'G', 'врат': 'G', 'вратарь': 'G', 'защ': 'D', 'защитник': 'D', 'нап': 'F', 'нападающий': 'F', 'лн': 'LW', 'пн': 'RW', 'центр': 'C' };
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е');
  const S = { open: false, q: '', f: 'all', my: false, foreign: false, sel: 0, flat: [], idx: null, idxKey: '' };
  const LS = 'khl_srch_recent';
  const recents = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (_) { return []; } };
  const saveRecent = q => { q = q.trim(); if (!q) return; try { localStorage.setItem(LS, JSON.stringify([q, ...recents().filter(x => x !== q)].slice(0, 6))); } catch (_) { /* нет хранилища */ } };

  function index(app) {
    const key = (app.db.players || []).length + ':' + (app.db.teams || []).map(t => t.coach).join('|');
    if (S.idx && S.idxKey === key) return S.idx;
    const L = [];
    for (const p of app.db.players || []) L.push({ k: 'p', id: p.id, team: p.teamId, n: p.name, pos: p.pos, ovr: p.ovr, no: p.number, fg: !!p.foreign, s: norm(p.name) });
    for (const t of app.db.teams || []) {
      L.push({ k: 'c', id: t.id, team: t.id, n: t.name, s: norm(t.name + ' ' + (CODES[t.id] || '')) });
      if (t.coach) { const io = /\(и\.о\.\)/.test(t.coach); const n = String(t.coach).replace(/\s*\(и\.о\.\)/, '').trim(); L.push({ k: 'k', id: t.id, team: t.id, n, io, s: norm(n) }); }
    }
    S.idxKey = key; return (S.idx = L);
  }
  function match(d, q) {
    const ws = norm(q).trim().split(/\s+/).filter(Boolean);
    return ws.every(w => {
      if (d.k === 'p' && (/^№\d{1,2}$/.test(w) || /^\d{1,2}$/.test(w))) return String(d.no) === w.replace('№', '');
      const pw = POSW[w];
      if (pw) return d.k === 'p' && (pw === 'F' ? ['LW', 'C', 'RW'].includes(d.pos) : d.pos === pw);
      return d.s.split(/\s+/).some(x => x.startsWith(w)) || (d.k === 'c' && d.s.includes(w));
    });
  }
  function results(app) {
    let L = index(app).filter(d => match(d, S.q));
    if (S.f === 'p') L = L.filter(d => d.k === 'p'); else if (S.f === 'c') L = L.filter(d => d.k === 'c'); else if (S.f === 'k') L = L.filter(d => d.k === 'k');
    if (S.my) L = L.filter(d => d.team === app.state.teamId);
    if (S.foreign) L = L.filter(d => d.k === 'p' && d.fg);
    const pl = L.filter(d => d.k === 'p').sort((a, b) => b.ovr - a.ovr), cl = L.filter(d => d.k === 'c'), co = L.filter(d => d.k === 'k');
    const lim = S.f === 'all' ? [8, 6, 5] : [60, 22, 22];
    return [['Игроки', pl, lim[0]], ['Клубы', cl, lim[1]], ['Тренеры', co, lim[2]]].filter(g => g[1].length).map(g => [g[0], g[1].slice(0, g[2]), g[1].length]);
  }
  const hl = (txt, q) => {
    const nt = norm(txt); for (const w of norm(q).split(/\s+/).filter(Boolean)) {
      const i = nt.search(new RegExp('(^|\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); if (i >= 0) { const st = nt[i] === ' ' ? i + 1 : i; return E(txt.slice(0, st)) + '<mark>' + E(txt.slice(st, st + w.length)) + '</mark>' + E(txt.slice(st + w.length)); }
    } return E(txt);
  };
  const tname = (app, id) => { const t = app.teamById ? app.teamById(id) : null; return t ? t.name : id; };
  const emb = (app, id) => (app.clubEmblemSvg ? app.clubEmblemSvg(id) : '') || '';
  function row(app, d, i) {
    const cls = 'srch-r' + (i === S.sel ? ' sel' : '');
    if (d.k === 'p') return `<div class="${cls}" data-i="${i}">${emb(app, d.team)}<div class="srch-t"><b>${hl(d.n, S.q)}</b><small>${E(POSN[d.pos] || d.pos)} · №${E(d.no)} · ${E(tname(app, d.team))}${d.fg ? ' · легионер' : ''}</small></div><span class="srch-rt">${d.ovr}</span></div>`;
    if (d.k === 'c') return `<div class="${cls}" data-i="${i}">${emb(app, d.id)}<div class="srch-t"><b>${hl(d.n, S.q)}</b><small>Клуб · ${E(CODES[d.id] || '')}</small></div></div>`;
    return `<div class="${cls}" data-i="${i}">${emb(app, d.team)}<div class="srch-t"><b>${hl(d.n, S.q)}</b><small>Тренер · ${E(tname(app, d.team))}${d.io ? ' · и.о.' : ''}</small></div></div>`;
  }
  function prev(app, d) {
    if (!d) return '<small class="muted">Выберите результат</small>';
    const kp = (v, l) => `<div><b>${E(v)}</b><small>${l}</small></div>`;
    if (d.k === 'p') { const p = app.playerById(d.id); const age = p && app.ageYears ? Math.floor(app.ageYears(p)) : '—'; return `<div class="srch-big">${emb(app, d.team)}</div><h3>${E(d.n)}</h3><small>${E(POSN[d.pos] || d.pos)} · ${E(tname(app, d.team))}</small><div class="srch-kv">${kp(d.ovr, 'рейтинг')}${kp('№' + d.no, 'номер')}${kp(age, 'возраст')}</div><p><small>Enter открывает карточку игрока</small></p>`; }
    if (d.k === 'c') return `<div class="srch-big">${emb(app, d.id)}</div><h3>${E(d.n)}</h3><small>Тренер: ${E((app.teamById(d.id) || {}).coach || '—')}</small><p><small>Enter открывает карточку клуба</small></p>`;
    return `<div class="srch-big">${emb(app, d.team)}</div><h3>${E(d.n)}</h3><small>Главный тренер · ${E(tname(app, d.team))}</small><p><small>Enter открывает карточку тренера</small></p>`;
  }
  let root = null;
  function ensure() {
    if (root) return root;
    root = document.createElement('div'); root.id = 'srch'; root.className = 'srch hidden';
    root.innerHTML = '<div class="srch-scrim" data-sc="close"></div><div class="srch-pal" role="dialog" aria-label="Поиск"><div class="srch-in"><button type="button" class="srch-bk" data-sc="close" aria-label="Закрыть">←</button><span class="srch-ic">🔍</span><input id="srch-q" type="search" placeholder="Игрок, клуб или тренер" aria-label="Поиск" autocomplete="off" spellcheck="false"><button type="button" class="srch-x hidden" data-sc="clr" aria-label="Очистить">×</button></div><div class="srch-chips" id="srch-chips"></div><div class="srch-split"><div class="srch-res" id="srch-res"></div><div class="srch-prev" id="srch-prev"></div></div><div class="srch-foot"><span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> открыть</span><span><kbd>Tab</kbd> фильтр</span><span><kbd>Esc</kbd> закрыть</span></div></div>';
    document.body.appendChild(root); return root;
  }
  function paint(app) {
    ensure();
    document.getElementById('srch-chips').innerHTML = [['all', 'Все'], ['p', 'Игроки'], ['c', 'Клубы'], ['k', 'Тренеры']].map(([k, l]) => `<button type="button" data-f="${k}" class="${S.f === k ? 'on' : ''}">${l}</button>`).join('') + `<button type="button" data-fl="my" class="${S.my ? 'on' : ''}">Мой клуб</button><button type="button" data-fl="foreign" class="${S.foreign ? 'on' : ''}">Легионеры</button>`;
    root.querySelector('.srch-x').classList.toggle('hidden', !S.q);
    const res = document.getElementById('srch-res'); S.flat = [];
    const idle = !S.q.trim() && S.f === 'all' && !S.my && !S.foreign;
    if (idle) {
      const rc = recents();
      res.innerHTML = (rc.length ? `<h5>Недавние запросы</h5><div class="srch-rec">${rc.map(x => `<button type="button" data-rq="${E(x)}">${E(x)}</button>`).join('')}</div>` : '') + `<h5>Попробуйте</h5><div class="srch-rec">${['вр', 'защ', '№17', 'легионеры'].map(x => x === 'легионеры' ? '<button type="button" data-fl="foreign">легионеры</button>' : `<button type="button" data-rq="${x}">${x}</button>`).join('')}</div>`;
    } else {
      const G = results(app);
      if (!G.length) res.innerHTML = '<div class="srch-empty">Ничего не найдено. Проверьте написание или снимите фильтры.</div>';
      else { let h = ''; G.forEach(g => { h += `<h5>${g[0]} (${g[2]})</h5>`; g[1].forEach(d => { h += row(app, d, S.flat.length); S.flat.push(d); }); }); res.innerHTML = h; }
    }
    if (S.sel >= S.flat.length) S.sel = Math.max(0, S.flat.length - 1);
    document.getElementById('srch-prev').innerHTML = prev(app, S.flat[S.sel]);
    const s = res.querySelector('.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  }
  function open(app) {
    if (!app || !app.state || !app.db) return;
    ensure(); S.open = true; S.sel = 0; root.classList.remove('hidden'); document.body.classList.add('srch-lock');
    const i = document.getElementById('srch-q'); i.value = S.q; paint(app); i.focus(); i.select();
  }
  function close() { if (!root) return; S.open = false; root.classList.add('hidden'); document.body.classList.remove('srch-lock'); }
  function pick(app, d) {
    if (!d) return; saveRecent(S.q); close();
    if (d.k === 'p') app.openPlayerCard(d.id); else if (d.k === 'c') app.openClubCard(d.id); else app.openCoachCard(d.id);
  }
  proto.searchFind = function (q, o) { // без DOM: список результатов для теста и внешних вызовов
    o = o || {}; const keep = [S.q, S.f, S.my, S.foreign]; S.q = q || ''; S.f = o.f || 'all'; S.my = !!o.my; S.foreign = !!o.foreign;
    try { const out = []; results(this).forEach(g => g[1].forEach(d => out.push(d))); return out; } finally { [S.q, S.f, S.my, S.foreign] = keep; }
  };
  proto.openSearch = function () { open(this); };
  proto.closeSearch = close;
  proto._searchState = S;

  document.addEventListener('click', e => {
    const a = typeof app !== 'undefined' ? app : null; if (!a) return;
    if (e.target.closest && e.target.closest('[data-srch-open]')) { e.preventDefault(); open(a); return; }
    if (!S.open || !root || !root.contains(e.target)) return;
    const t = e.target;
    if (t.closest('[data-sc="close"]')) { close(); return; }
    if (t.closest('[data-sc="clr"]')) { S.q = ''; document.getElementById('srch-q').value = ''; S.sel = 0; paint(a); document.getElementById('srch-q').focus(); return; }
    const f = t.closest('[data-f]'); if (f) { S.f = f.dataset.f; S.sel = 0; paint(a); return; }
    const fl = t.closest('[data-fl]'); if (fl) { S[fl.dataset.fl] = !S[fl.dataset.fl]; S.sel = 0; paint(a); return; }
    const rq = t.closest('[data-rq]'); if (rq) { S.q = rq.dataset.rq; const i = document.getElementById('srch-q'); i.value = S.q; S.sel = 0; paint(a); i.focus(); return; }
    const r = t.closest('.srch-r[data-i]'); if (r) pick(a, S.flat[+r.dataset.i]);
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'srch-q' || typeof app === 'undefined') return;
    S.q = e.target.value; S.sel = 0; paint(app);
  });
  document.addEventListener('mouseover', e => {
    const r = e.target.closest && e.target.closest('.srch-r[data-i]'); if (!r || !S.open) return;
    const i = +r.dataset.i; if (i === S.sel) return; S.sel = i;
    root.querySelectorAll('.srch-r.sel').forEach(x => x.classList.remove('sel')); r.classList.add('sel');
    document.getElementById('srch-prev').innerHTML = prev(app, S.flat[i]);
  });
  document.addEventListener('keydown', e => {
    if (typeof app === 'undefined' || !app.state) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (document.activeElement && document.activeElement.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { e.preventDefault(); S.open ? close() : open(app); return; }
    if (!S.open) { if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(app); } return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); S.sel = Math.min(S.flat.length - 1, S.sel + 1); paint(app); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); S.sel = Math.max(0, S.sel - 1); paint(app); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(app, S.flat[S.sel]); }
    else if (e.key === 'Tab') { e.preventDefault(); const o = ['all', 'p', 'c', 'k']; S.f = o[(o.indexOf(S.f) + (e.shiftKey ? 3 : 1)) % 4]; S.sel = 0; paint(app); }
  }, true);

  /* кнопки в верхней панели */
  function inject() {
    if (document.getElementById('srch-btn-pc')) return;
    const acts = document.querySelector('.top-actions'), line = document.querySelector('.top-line');
    if (acts) { const b = document.createElement('button'); b.type = 'button'; b.id = 'srch-btn-pc'; b.className = 'btn btn-quiet srch-btn'; b.setAttribute('data-srch-open', '1'); b.innerHTML = '🔍 <span class="lbl">Поиск</span> <kbd>Ctrl K</kbd>'; acts.insertBefore(b, acts.firstChild); }
    if (line) { const b = document.createElement('button'); b.type = 'button'; b.id = 'srch-btn-m'; b.className = 'srch-btn-m'; b.setAttribute('data-srch-open', '1'); b.setAttribute('aria-label', 'Поиск'); b.textContent = '🔍'; line.insertBefore(b, line.querySelector('.top-toggle')); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject); else inject();
})();
