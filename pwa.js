(() => {
  const installButton = document.getElementById('pwa-install-btn');
  const installHelp = document.getElementById('pwa-install-help');
  let deferredPrompt = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (standalone() && installHelp) {
    installHelp.textContent = '✅ KHL Manager установлен на устройство. Если потребуется, прогресс можно сохранить через экспорт карьеры в меню игры.';
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (installButton) installButton.classList.remove('hidden');
    if (installHelp) installHelp.textContent = '📱 Можно установить KHL Manager как приложение на главный экран Android.';
  });

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) {
        if (installHelp) installHelp.textContent = 'В Chrome открой меню ⋮ и выбери «Установить приложение» или «Добавить на главный экран». Установка доступна при открытии сайта по HTTPS.';
        return;
      }
      deferredPrompt.prompt();
      try {
        const result = await deferredPrompt.userChoice;
        if (result && result.outcome === 'accepted') {
          installButton.classList.add('hidden');
          if (installHelp) installHelp.textContent = '✅ Установка запущена. После завершения запускай KHL Manager с главного экрана.';
        }
      } catch (error) {
        if (installHelp) installHelp.textContent = 'Чтобы установить игру, используй меню Chrome и пункт «Установить приложение». ' + (error && error.message ? error.message : '');
      }
      deferredPrompt = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    if (installButton) installButton.classList.add('hidden');
    if (installHelp) installHelp.textContent = '✅ KHL Manager установлен на устройство.';
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', {scope: './'}).catch((error) => {
        console.warn('PWA offline support could not be registered:', error);
      });
    });
  }
})();
