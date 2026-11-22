/* KHL Manager 8.9 — saving is coalesced.
 * persistQuietly() used to serialise the whole career (3+ MB) after every single match; simulating a day or a season
 * did this hundreds of times in a row. Now the writes within 300 ms are merged into one, and the save is flushed
 * when the page is hidden or closed.
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype, base = proto.persistQuietly;
  let timer = null, pending = null;
  proto.flushPersist = function () {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) { const app = pending; pending = null; base.call(app); }
  };
  proto.persistQuietly = function () {
    if (!this.state) return;
    pending = this;
    if (timer) return;
    timer = setTimeout(() => { timer = null; if (pending) { const app = pending; pending = null; base.call(app); } }, 300);
  };
  if (typeof window !== 'undefined' && window.addEventListener) {
    const flush = () => { try { proto.flushPersist(); } catch (e) {} };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }
})();
