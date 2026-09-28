// 通用工具
const U = {
  rnd: Math.random,
  int(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
  pick(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined; },
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  },
  sample(arr, n) { return U.shuffle(arr).slice(0, n); },
  chance(p) { return Math.random() < p; },
  weighted(ws) {
    let s = 0; for (const w of ws) s += w;
    let r = Math.random() * s;
    for (let i = 0; i < ws.length; i++) { r -= ws[i]; if (r < 0) return i; }
    return ws.length - 1;
  },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },
  sum(arr, f) { let s = 0; for (const x of arr) s += f ? f(x) : x; return s; },
  maxBy(arr, f) { let b, bv = -Infinity; for (const x of arr) { const v = f(x); if (v > bv) { bv = v; b = x; } } return b; },
  minBy(arr, f) { let b, bv = Infinity; for (const x of arr) { const v = f(x); if (v < bv) { bv = v; b = x; } } return b; },
  uid: (() => { let n = 1; return () => n++; })(),
  el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; },
  esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
};
