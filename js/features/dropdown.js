/* KHL Manager 14.6.2 — выпадающие списки в стиле игры.
 * Любой <select> (кроме таблиц, multiple/size и помеченных data-nodd) получает кнопку и список в общем стиле;
 * исходный select остаётся в странице (скрыт), его значение и события change не меняются, код игры работает как раньше.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const SKIP = 'table select, [data-nodd], select[multiple], select[size]';
  let list = null, cur = null, hi = -1;
  const txt = sel => { const o = sel.options[sel.selectedIndex]; return o ? o.textContent : ''; };
  function refresh(sel) {
    const b = sel._ddBtn; if (!b) return;
    const t = b.firstChild; if (t && t.textContent !== txt(sel)) t.textContent = txt(sel);
    if (b.disabled !== sel.disabled) b.disabled = sel.disabled;
  }
  function enhance(sel) {
    if (sel.dataset.dd || sel.matches(SKIP) || !sel.parentNode) return;
    sel.dataset.dd = '1';
    const wrap = document.createElement('span'); wrap.className = 'dd-wrap';
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'dd-btn ' + sel.className; if (sel.style.cssText) b.style.cssText = sel.style.cssText;
    b.setAttribute('aria-haspopup', 'listbox'); b.appendChild(document.createTextNode(txt(sel)));
    if (sel.getAttribute('aria-label')) b.setAttribute('aria-label', sel.getAttribute('aria-label'));
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(b); wrap.appendChild(sel);
    sel.classList.add('dd-native'); sel.tabIndex = -1; sel._ddBtn = b; b._ddSel = sel; refresh(sel);
  }
  function scan(root) { (root || document).querySelectorAll('select:not([data-dd])').forEach(enhance); }
  function close() { if (list) { list.remove(); list = null; } if (cur && cur._ddBtn) cur._ddBtn.classList.remove('open'); cur = null; hi = -1; }
  function items() { return list ? [...list.querySelectorAll('.dd-i')] : []; }
  function mark(i) { const it = items(); it.forEach((x, k) => x.classList.toggle('hi', k === i)); hi = i; if (it[i]) it[i].scrollIntoView({ block: 'nearest' }); }
  function pick(sel, idx) {
    close(); if (idx < 0 || sel.selectedIndex === idx) return;
    sel.selectedIndex = idx; refresh(sel);
    sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function open(sel) {
    close(); cur = sel; const b = sel._ddBtn; b.classList.add('open');
    list = document.createElement('div'); list.className = 'dd-list'; list.setAttribute('role', 'listbox');
    let html = '', grp = '';
    [...sel.options].forEach((o, i) => {
      if (o.parentNode.tagName === 'OPTGROUP' && o.parentNode.label !== grp) { grp = o.parentNode.label; html += `<div class="dd-g">${grp.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>`; }
      const d = o.dataset.d;
      html += `<div class="dd-i${i === sel.selectedIndex ? ' on' : ''}${o.disabled ? ' off' : ''}" role="option" data-i="${i}">${o.textContent.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}${d ? `<small>${d.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</small>` : ''}</div>`;
    });
    list.innerHTML = html; document.body.appendChild(list);
    const r = b.getBoundingClientRect(), vh = window.innerHeight, w = Math.max(r.width, 200);
    list.style.minWidth = w + 'px'; list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    const h = list.offsetHeight, below = vh - r.bottom - 8, above = r.top - 8;
    if (h > below && above > below) { list.style.bottom = (vh - r.top + 4) + 'px'; list.style.maxHeight = Math.min(h, above) + 'px'; }
    else { list.style.top = (r.bottom + 4) + 'px'; list.style.maxHeight = Math.min(h, Math.max(160, below)) + 'px'; }
    mark(sel.selectedIndex);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.dd-btn');
    if (b && b._ddSel) { e.preventDefault(); if (cur === b._ddSel) close(); else if (!b.disabled) open(b._ddSel); return; }
    const it = e.target.closest && e.target.closest('.dd-i');
    if (it && cur) { if (!it.classList.contains('off')) pick(cur, Number(it.dataset.i)); return; }
    if (list && !(e.target.closest && e.target.closest('.dd-list'))) close();
  }, true);
  document.addEventListener('keydown', e => {
    if (!list) { const b = e.target.closest && e.target.closest('.dd-btn'); if (b && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); open(b._ddSel); } return; }
    const n = items().length;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const b = cur._ddBtn; close(); b.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); mark(Math.min(n - 1, hi + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(Math.max(0, hi - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const s = cur, b = s._ddBtn; pick(s, hi); b.focus(); }
  }, true);
  window.addEventListener('resize', close); window.addEventListener('scroll', e => { if (list && !(e.target && e.target.closest && e.target.closest('.dd-list'))) close(); }, true);
  // программная смена значения тоже обновляет подпись
  for (const k of ['value', 'selectedIndex']) {
    const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, k);
    if (d && d.set) Object.defineProperty(HTMLSelectElement.prototype, k, { get: d.get, set(v) { d.set.call(this, v); if (this._ddBtn) refresh(this); }, configurable: true });
  }
  document.addEventListener('change', e => { if (e.target && e.target._ddBtn) refresh(e.target); }, true);
  let queued = false;
  const mo = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; scan(); document.querySelectorAll('select[data-dd]').forEach(refresh); }); });
  const start = () => { scan(); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
