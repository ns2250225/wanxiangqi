// 页面内自动驾驶：每次调用推进一步
window.__auto = function () {
  const $ = id => document.getElementById(id), vis = el => el && !el.classList.contains('hidden');
  const m = $('modal');
  if (vis(m)) { const o = m.querySelectorAll('.opt'); const n = m.querySelector('#askOk'); if (n) { o[0].click(); const m2 = $('modal').querySelectorAll('.opt'); if (m2[1]) m2[1].click(); const k = $('askOk'); if (k && !k.disabled) k.click(); else $('modal').querySelectorAll('.opt').forEach(e=>{ const kk=$('askOk'); if (kk && kk.disabled) e.click(); }); if ($('askOk')) $('askOk').click(); return 'ask-multi'; } o[0].click(); return 'ask'; }
  const ov = $('overlay');
  if (vis(ov)) { for (const id of ['bidR', 'bidOk', 'nextLot', 'aEnd']) { const b = $(id); if (!b) continue; if (id === 'bidR') { b.value = Math.min(3, b.max); b.dispatchEvent(new Event('input')); continue; } b.click(); return 'ov:' + id; } return 'overlay:' + ov.innerText.slice(0, 20); }
  if (vis($('battleView'))) { const c = $('contBtn'); if (c && vis($('bvResult'))) { c.click(); return 'cont'; } const s = document.querySelector('[data-s="4"]'); if (s && !s.classList.contains('on')) s.click(); return 'battle'; }
  if (G.phase === 'prep') { if (window.__r !== G.round) { window.__r = G.round; AI.turn(G.human); UI.render(); return 'aiturn r' + G.round; } $('readyBtn').click(); return 'ready'; }
  return 'phase ' + G.phase;
};
