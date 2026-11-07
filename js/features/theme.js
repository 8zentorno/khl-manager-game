/* KHL Manager 8.11.0 — тёмная и светлая тема. Выбор хранится на устройстве; по умолчанию тёмная. */
(function(){
  const proto=KHLManagerApp.prototype;
  const KEY='khl.theme';
  proto.currentTheme=function(){return document.documentElement.getAttribute('data-theme')==='light'?'light':'dark';};
  proto.applyTheme=function(t){
    const light=t==='light';
    if(light)document.documentElement.setAttribute('data-theme','light');else document.documentElement.removeAttribute('data-theme');
    try{localStorage.setItem(KEY,light?'light':'dark');}catch(e){}
    const m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',light?'#eef3f9':'#08111f');
    document.querySelectorAll('[data-theme-toggle]').forEach(b=>{
      b.textContent=light?'☀️':'🌙';
      b.title=light?'Светлая тема. Нажмите, чтобы включить тёмную':'Тёмная тема. Нажмите, чтобы включить светлую';
      b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(light));
    });
  };
  proto.toggleTheme=function(){this.applyTheme(this.currentTheme()==='light'?'dark':'light');};
  let saved='dark';try{saved=localStorage.getItem(KEY)==='light'?'light':'dark';}catch(e){}
  const init=()=>{proto.applyTheme.call(typeof app!=='undefined'?app:proto,saved);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
