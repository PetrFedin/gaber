/**
 * Аудит интерфейса в браузере (DevTools или инструмент автоматизации): контраст WCAG AA, текст мельче 11 px,
 * цели касания меньше 44 px, обрезанный и выходящий за экран контент. Запуск на dev-сервере:
 *   eval(await (await fetch('/scripts/design-audit.browser.js')).text()); await __runAll()
 * Затем повторить на ширинах 375, 768, 1024, 1440. Пустой результат для ширины означает «замечаний нет».
 */
window.__audit = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return {r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3]};
  };
  const lum = ({r, g, b}) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || {r: 243, g: 238, b: 228};
    if (base.a < 1) base = {r: 243, g: 238, b: 228};
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      base = {r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a)};
    }
    return base;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0;
  };
  const key = (el) => el.tagName.toLowerCase() + '.' + [...el.classList].join('.');
  const out = {small: [], touch: [], contrast: [], overflow: []};
  document.querySelectorAll('body *').forEach((el) => {
    if (!visible(el) || el.closest('canvas,svg,model-viewer')) return;
    const s = getComputedStyle(el);
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      const fs = parseFloat(s.fontSize), fg = parse(s.color);
      if (fs < 11) out.small.push(key(el) + ' ' + fs + 'px');
      if (fg && !el.matches(':disabled')) {
        const L1 = lum(fg), L2 = lum(bgOf(el)), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (cr < (fs >= 24 ? 3 : 4.5)) out.contrast.push(key(el) + ' ' + cr.toFixed(2) + ' "' + el.textContent.trim().slice(0, 24) + '"');
      }
    }
    if (el.matches('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]')) {
      const lab = el.closest('label');
      const r = (lab && el.matches('input[type=checkbox],input[type=radio]') ? lab : el).getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) out.touch.push(key(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    if (el.scrollWidth > el.clientWidth + 2 && ['hidden', 'clip'].includes(s.overflowX) && el.clientWidth > 0 && !el.matches('.hero-stage,.scene-host,canvas,.sr-only,.studio-canvas'))
      out.overflow.push('clipped ' + key(el) + ' ' + el.scrollWidth + '>' + el.clientWidth);
    if (el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('.table-scroll,.scene-host,.studio-canvas,.hero-stage,nav'))
      out.overflow.push('offscreen ' + key(el));
  });
  if (document.documentElement.scrollWidth > innerWidth + 1) out.overflow.push('PAGE scrollWidth ' + document.documentElement.scrollWidth + ' > ' + innerWidth);
  const group = (a) => {
    const m = {};
    a.forEach((x) => (m[x.split(' ').slice(0, 2).join(' ')] ??= []).push(x));
    return Object.values(m).map((v) => v.length + '× ' + v[0]).slice(0, 8);
  };
  return {small: group(out.small), touch: group(out.touch), contrast: group(out.contrast), overflow: group(out.overflow), n: [out.small.length, out.touch.length, out.contrast.length, out.overflow.length]};
};
// Переходы отключаются на время аудита: в скрытой вкладке они не завершаются и цвета читаются «на полпути».
window.__noMotion = () => {
  if (document.getElementById('__audit-nomotion')) return;
  const s = document.createElement('style');
  s.id = '__audit-nomotion';
  s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
  document.head.appendChild(s);
};
window.__runAll = async (routes = ['home', 'studio', 'materials', 'partner', 'orders', 'projects', 'factory', 'costing', 'technical']) => {
  window.__noMotion();
  const res = {};
  for (const r of routes) {
    location.hash = '#' + r;
    await new Promise((x) => setTimeout(x, 900));
    const a = window.__audit();
    if (a.n.some((v) => v > 0)) res[r] = a;
  }
  return {width: innerWidth, ...res};
};
