// Telegram Mini App integration: expand the WebView and sync the real viewport height without blocking startup.
(function initTelegramMiniApp(){
  const isTelegram = !!(window.TelegramWebviewProxy || window.Telegram?.WebView || /tgWebApp(Data|Version|Platform)=/.test(location.search) || /Telegram/i.test(navigator.userAgent));
  if (!isTelegram) return;
  const apply = () => {
    const tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return;
    try { tg.ready(); tg.expand(); } catch (_) {}
    try { tg.setHeaderColor('#08111f'); tg.setBackgroundColor('#08111f'); } catch (_) {}
    const syncHeight = () => {
      const height = Number(tg.viewportStableHeight || tg.viewportHeight || 0);
      if (height > 0) document.documentElement.style.setProperty('--tg-viewport-height', `${height}px`);
    };
    syncHeight();
    try { tg.onEvent('viewportChanged', syncHeight); } catch (_) {}
  };
  if (window.Telegram?.WebApp) { apply(); return; }
  const sdk = document.createElement('script');
  sdk.src = 'https://telegram.org/js/telegram-web-app.js';
  sdk.async = true;
  sdk.onload = apply;
  document.head.appendChild(sdk);
})();
