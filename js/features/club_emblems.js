/* KHL Manager 14.5.1 — эмблемы клубов: собственные плоские символы по мотивам названий клубов (рисуются кодом, в цветах формы).
 * Не копии логотипов. Объёмный вариант: кольцо в цвет каймы формы, градиент, символ и его тень.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));return .299*c[0]+.587*c[1]+.114*c[2]};
  const ink=f=>lum(f)>150?'#16202f':'#ffffff';
  const shade=(hex,d)=>'#'+[1,3,5].map(i=>Math.max(0,Math.min(255,parseInt(hex.slice(i,i+2),16)+d)).toString(16).padStart(2,'0')).join('');
  const star=(cx,cy,R,r)=>{let p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,q=i%2?r:R;p.push((cx+q*Math.cos(a)).toFixed(1)+','+(cy+q*Math.sin(a)).toFixed(1))}return p.join(' ')};
/* символы по мотивам эмблем клубов; c - основной цвет, b - фон (для вырезов), a - акцент */
function motif(id,c,b,a){const f=`fill="${c}"`,A=`fill="${a}"`,cut=`fill="${b}"`,s=`fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"`,sa=`fill="none" stroke="${a}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;
const mir=(d)=>`<g>${d}</g><g transform="translate(64 0) scale(-1 1)">${d}</g>`;
const M={
autom2:`<circle ${f} cx="38" cy="32" r="17"/><circle ${cut} cx="38" cy="32" r="9.5"/><circle ${f} cx="38" cy="32" r="3.5"/><path ${A} d="M24 24C16 24 9 22 3 18C8 28 14 32 22 34ZM24 36C17 38 10 42 5 48C14 49 21 46 25 42ZM21 30C14 30 8 31 2 34C8 36 14 36 21 33Z"/>`,
autom3:`<circle ${s} cx="32" cy="36" r="12" stroke-width="4"/><circle ${f} cx="32" cy="36" r="4.2"/><path ${s} d="M21 33L28 35M43 33L36 35M32 41V48" stroke-width="3"/><path ${A} d="M20 30C14 22 8 18 1 18C3 26 8 32 14 35C10 36 8 40 8 44C14 42 19 40 22 38ZM44 30C50 22 56 18 63 18C61 26 56 32 50 35C54 36 56 40 56 44C50 42 45 40 42 38Z"/>`,
avangard:`<path ${f} d="M56 30C56 18 47 8 36 8C25 8 19 14 17 21L3 35C11 33 17 35 21 40C19 45 20 50 25 55C28 48 34 46 41 46C50 46 56 39 56 30Z"/><path ${A} d="M17 21L3 35C11 33 17 35 21 40L27 27Z"/><path ${cut} d="M24 21L42 27L39 31L26 27Z"/><circle ${A} cx="35" cy="27.5" r="1.8"/><path d="M22 14L44 24" stroke="${b}" stroke-width="3.2" stroke-linecap="round"/><path ${f} d="M44 46L52 56L46 48ZM36 47L40 58L38 48Z"/>`,
autom:`<path ${f} d="M12 18H52C56 18 58 21 58 25V46C58 49 56 51 53 51H11C8 51 6 49 6 46V25C6 21 8 18 12 18Z"/><rect ${cut} x="14" y="30" width="36" height="14" rx="3"/><path stroke="${a}" stroke-width="2.6" d="M20 30V44M26 30V44M32 30V44M38 30V44M44 30V44"/><circle ${A} cx="14" cy="24" r="3.4"/><circle ${A} cx="50" cy="24" r="3.4"/><rect ${A} x="28" y="22" width="8" height="5" rx="1.5"/><path ${f} d="M12 51V56H20V51ZM44 51V56H52V51Z"/>`,
admiral:`<polygon ${A} points="${star(32,31,25,11)}" opacity=".55"/><circle ${s} cx="32" cy="17" r="4" stroke-width="3.4"/><path ${s} d="M32 21V50M23 29H41M14 38C15 46 23 51 32 51S49 46 50 38M14 38L11 43M14 38L19 41M50 38L53 43M50 38L45 41" stroke-width="3.4"/>`,
akbars:`<path ${f} d="M13 12L26 21H38L51 12V33C51 46 42 55 32 55S13 46 13 33Z"/><path ${f} d="M13 31L7 36L13 40ZM51 31L57 36L51 40Z"/><path ${A} d="M32 21V28M25 22L26 28M39 22L38 28M18 36l3 2M46 36l-3 2M20 42l3 1M44 42l-3 1"/><path d="M32 21V28M25 22L26 28M39 22L38 28" stroke="${a}" stroke-width="2.4" stroke-linecap="round"/><path ${cut} d="M19 32L28 34L27 38L20 36ZM45 32L36 34L37 38L44 36Z"/><path ${cut} d="M28 43H36L32 48Z"/><path d="M32 48V51M28 52q4 3 8 0" stroke="${b}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
amur:`<path ${f} d="M11 22C11 11 24 9 29 16H35C40 9 53 11 53 22V35C53 47 44 56 32 56S11 47 11 35Z"/><path d="M32 17V27M24 18L26 28M40 18L38 28M12 33L19 36M52 33L45 36M13 41L20 40M51 41L44 40" stroke="${b}" stroke-width="3.2" stroke-linecap="round"/><path ${cut} d="M15 30L28 35L27 39L16 36ZM49 30L36 35L37 39L48 36Z"/><path ${A} d="M23 44C27 43 37 43 41 44C41 52 37 55 32 55C27 55 23 52 23 44Z"/><path ${cut} d="M24 45Q32 53 40 45Q32 47 24 45Z"/><path ${f} d="M27 46L28.5 51L30 47ZM34 47L35.5 51L37 46Z"/><path ${cut} d="M28 41H36L32 45Z"/>`,
barys:`<path ${f} d="M8 32C8 19 19 10 32 10C38 10 42 12 45 15L51 13L50 22C56 24 61 29 61 33L55 35L59 40L50 41C48 49 40 55 29 55C17 55 8 46 8 32Z"/><path ${f} d="M18 15L20 3L31 11Z"/><path ${A} d="M21 12L22 7L27 11Z"/><path ${cut} d="M42 24L53 27L44 30Z"/><path ${cut} d="M52 40L40 41L48 47Z"/><path ${A} d="M46 41L47 45L49 41Z"/><circle ${A} cx="18" cy="30" r="2.6"/><circle ${A} cx="25" cy="40" r="2.6"/><circle ${A} cx="14" cy="42" r="2.2"/><circle ${A} cx="26" cy="22" r="2.2"/><circle ${cut} cx="57" cy="31" r="1.5"/>`,
dinamo_mn:`<path ${s} d="M16 24C5 24 3 12 8 5" stroke-width="5.5"/><path ${s} d="M48 24C59 24 61 12 56 5" stroke-width="5.5"/><path ${f} d="M12 24C12 8 52 8 52 24C56 32 52 40 46 46L42 56H22L18 46C12 40 8 32 12 24Z"/><path ${A} d="M23 33H41L39 56H25Z"/><path ${cut} d="M18 28L28 31L27 34L19 32ZM46 28L36 31L37 34L45 32Z"/><circle ${cut} cx="28" cy="49" r="1.8"/><circle ${cut} cx="36" cy="49" r="1.8"/>`,
dinamo_msk:`<circle ${s} cx="32" cy="32" r="25" stroke-width="2.6"/><g transform="skewX(-14) translate(9 0)"><text x="33" y="44" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-style="italic" font-size="36" ${f}>D</text></g><path stroke="${a}" stroke-width="2.4" stroke-linecap="round" d="M9 24H18M7 31H15M10 38H17"/>`,
lada:`<path d="M46 6L22 44" stroke="${c}" stroke-width="5.5" stroke-linecap="round" fill="none"/><path d="M22 44C18 52 10 54 6 54L7 59C16 59 25 56 30 49Z" fill="${c}"/><ellipse ${A} cx="46" cy="54" rx="10" ry="4.6"/><path ${f} d="M38 48H54V54H38Z" opacity="0"/><path d="M50 14L42 26" stroke="${a}" stroke-width="3.2" stroke-linecap="round"/><path d="M8 24C16 18 22 12 28 6" stroke="${a}" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/>`,
lokomotiv:`<path ${f} d="M25 6H39L41 15H23Z"/><circle ${f} cx="32" cy="33" r="17"/><circle ${cut} cx="32" cy="33" r="12"/><circle ${A} cx="32" cy="33" r="7"/><path ${f} d="M12 46H52V51H12Z"/><circle ${f} cx="20" cy="56" r="4"/><circle ${f} cx="44" cy="56" r="4"/>`,
metallurg:`<path ${f} d="M6 14L24 22H40L58 14L51 37L32 57L13 37Z"/><path ${A} d="M32 57L13 37L22 36L32 45L42 36L51 37Z"/><path ${cut} d="M17 27L27 31L26 35L19 33ZM47 27L37 31L38 35L45 33Z"/><path ${cut} d="M29 47H35L32 51Z"/>`,
neftekhimik:`<path ${f} d="M12 6L26 19H38L52 6V30C52 43 42 54 32 57C22 54 12 43 12 30Z"/><path ${A} d="M32 30L21 42C24 51 28 55 32 57C36 55 40 51 43 42Z"/><path ${cut} d="M18 28L28 32L26 36L19 34ZM46 28L36 32L38 36L45 34Z"/><path ${cut} d="M28 46H36L32 52Z"/>`,
salavat:`<path d="M17 30H47V38C47 50 40 58 32 58S17 50 17 38Z" fill="#e8b47c"/><path d="M5 36C3 14 18 4 32 4S61 14 59 36C56 28 50 24 46 24H18C14 24 8 28 5 36Z" fill="${c}"/><path d="M10 28C12 20 18 14 22 12M54 28C52 20 46 14 42 12M32 8V16M24 9L26 17M40 9L38 17" stroke="${a}" stroke-width="2.4" stroke-linecap="round" fill="none"/><path d="M5 36C8 30 12 28 18 27L18 36L12 40C9 40 6 38 5 36ZM59 36C56 30 52 28 46 27L46 36L52 40C55 40 58 38 59 36Z" fill="${c}"/><path d="M21 34L29 36M43 34L35 36M20 31L29 33M44 31L35 33" stroke="#3a2418" stroke-width="2.2" stroke-linecap="round"/><path d="M32 36V45M29 46Q32 48 35 46" stroke="#a8683a" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M24 51Q32 48 40 51" stroke="#3a2418" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
severstal:`${[-70,50,170].map(a0=>{const r=20,a1=a0*Math.PI/180,a2=(a0+100)*Math.PI/180,x1=32+r*Math.cos(a1),y1=32+r*Math.sin(a1),x2=32+r*Math.cos(a2),y2=32+r*Math.sin(a2);return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${c}" stroke-width="8" fill="none" stroke-linecap="butt"/>`}).join("")}`,
sibir:`${[0,60,120,180,240,300].map(a=>`<g transform="rotate(${a} 32 32)"><path d="M32 32V8M32 18L25 11M32 18L39 11M32 25L27 21M32 25L37 21" stroke="${c}" stroke-width="3" stroke-linecap="round" fill="none"/></g>`).join("")}`,
ska:`<polygon ${f} points="${star(32,31,25,10.5)}"/><polygon ${A} points="${star(32,31.5,12,5)}"/>`,
sochi:`<path ${f} d="M11 24C11 14 19 9 26 14H38C45 9 53 14 53 24V36C53 47 43 55 32 55S11 47 11 36Z"/><path ${A} d="M18 18L26 24L19 28ZM46 18L38 24L45 28Z" opacity=".9"/><path ${cut} d="M18 31L28 34L27 38L19 36ZM46 31L36 34L37 38L45 36Z"/><circle ${A} cx="20" cy="45" r="2"/><circle ${A} cx="44" cy="45" r="2"/><circle ${A} cx="32" cy="21" r="2"/><path ${cut} d="M28 43H36L32 48Z"/>`,
spartak:`<circle ${s} cx="32" cy="32" r="24" stroke-width="3"/><path d="M32 12L52 32L32 52L12 32Z" fill="none" stroke="${c}" stroke-width="3.4" stroke-linejoin="round"/><text x="32" y="41" text-anchor="middle" font-family="Georgia,serif" font-weight="800" font-size="25" ${f}>С</text>`,
torpedo:`<path ${f} d="M24 34H40L37 54C35 56 29 56 27 54Z"/><path ${f} d="M24 34L18 28L22 38ZM40 34L46 28L42 38Z"/><path ${s} d="M26 33C22 25 20 17 14 9M22 22L12 22M23 27L13 31M38 33C42 25 44 17 50 9M42 22L52 22M41 27L51 31" stroke-width="3.2"/><circle ${cut} cx="29" cy="42" r="1.7"/><circle ${cut} cx="35" cy="42" r="1.7"/><circle ${A} cx="32" cy="52" r="2.2"/>`,
traktor:`<circle ${f} cx="15" cy="18" r="7"/><circle ${f} cx="49" cy="18" r="7"/><path ${f} d="M11 33C11 20 53 20 53 33C56 44 50 55 32 55C14 55 8 44 11 33Z"/><circle ${A} cx="15" cy="18" r="3"/><circle ${A} cx="49" cy="18" r="3"/><ellipse ${A} cx="32" cy="46" rx="11" ry="7.5"/><circle ${cut} cx="24" cy="33" r="2.4"/><circle ${cut} cx="40" cy="33" r="2.4"/><path ${cut} d="M28 42H36L32 47Z"/>`,
cska:`<polygon ${f} points="${star(32,31,26,11)}"/>`,
shanghai:`<path ${A} d="M8 42L0 38L9 36L2 29L13 31L9 22L19 28Z"/><path ${f} d="M6 42C8 29 18 21 30 21L45 16C51 14 57 18 59 25L52 27L59 33L48 35C46 45 36 51 26 51C15 51 7 49 6 42Z"/><path ${A} d="M30 21C28 12 22 8 13 6C18 12 20 18 22 24ZM38 18C38 11 36 6 30 3C32 9 32 13 31 19Z"/><path ${cut} d="M30 27L42 29L36 33L29 31Z"/><path d="M22 43L48 35" stroke="${b}" stroke-width="2.4" stroke-linecap="round"/><path ${cut} d="M42 36L44 41L46 35Z"/><circle ${cut} cx="53" cy="25" r="1.6"/><path d="M12 44C6 49 6 55 12 58" stroke="${a}" stroke-width="3" fill="none" stroke-linecap="round"/>`};
return M[id==='avtomobilist'?'autom2':id]||''}
function symColor(k){return Math.abs(lum(k[0])-lum(k[1]))>70?k[1]:ink(k[0])}
function accColor(k,sc){const o=sc===k[1]?ink(k[0]):k[1];return o===sc||Math.abs(lum(o)-lum(k[0]))<40?shade(sc,lum(sc)>140?-55:55):o}
const place=(inner,x,y,sc)=>`<g transform="translate(${x} ${y}) scale(${sc}) translate(-32 -32)">${inner}</g>`;

  let uid = 0;
  proto.clubEmblemSvg = function (id) {
    const t = this.teamById ? this.teamById(id) : null; if (!t || !this.kitFor) return '';
    const kit = this.kitFor(id, true), k = [kit.f, kit.e], f = k[0], e = k[1], sc = symColor(k), ac = accColor(k, sc), g = 'ce' + (++uid);
    return `<svg viewBox="0 0 64 64" role="img" aria-label="${E(t.name)}"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(f, 28)}"/><stop offset="1" stop-color="${shade(f, -28)}"/></linearGradient></defs><circle cx="32" cy="32" r="31" fill="${e}"/><circle cx="32" cy="32" r="27.5" fill="url(#${g})"/><circle cx="32" cy="32" r="24" fill="none" stroke="${e}" stroke-opacity=".5" stroke-width="1"/><g opacity=".35">${place(motif(id, '#000', f, '#000'), 33.5, 34, .78)}</g>${place(motif(id, sc, f, ac), 32, 32, .78)}</svg>`;
  };

  /* карточка клуба и экран выбора клуба */
  const baseClub = proto.clubCardHtml;
  proto.clubCardHtml = function (id) {
    const html = baseClub.apply(this, arguments), svg = this.clubEmblemSvg(id); if (!svg) return html;
    return html.replace(/<div class="cd-ava sq"[^>]*aria-hidden="true">[^<]*<\/div>/, `<div class="cd-ava pic sq" aria-hidden="true">${svg}</div>`);
  };
  const basePrev = proto.previewTeam;
  if (basePrev) proto.previewTeam = function () {
    basePrev.apply(this, arguments);
    const sel = document.getElementById('select-team'), el = document.getElementById('team-preview'), h = el && el.querySelector && el.querySelector('h3');
    const svg = sel && sel.value ? this.clubEmblemSvg(sel.value) : '';
    if (h && svg && !h.querySelector('.st-emb')) h.insertAdjacentHTML('afterbegin', `<span class="st-emb">${svg}</span>`);
  };
})();
