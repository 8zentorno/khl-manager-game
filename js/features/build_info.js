/* Номер сборки: виден в меню («Версия …») и записывается в сохранение (state.build) — чтобы всегда было понятно, какая сборка запущена. */
const KHL_BUILD = '14.7.30';
(function () {
  const el = document.getElementById('menu-version'); if (el) el.textContent = 'Версия ' + KHL_BUILD;
  try { document.title = 'KHL Manager 2026/2027 — ' + KHL_BUILD; } catch (e) { }
})();
