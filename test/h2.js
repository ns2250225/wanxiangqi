const hist = {}, bt = {};
const _sim = B.simulate.bind(B);
B.simulate = function (x) { const b = _sim(x); (bt[G.round] = bt[G.round] || []).push(b.t); return b; };
const _sr = G.startRound.bind(G);
G.startRound = function () { for (const p of G.alive()) for (const u of G.heroUnits(p)) { const n = HD[u.hid].name; const L = G.totalLv(u); if (L >= 150 && !hist[n]) hist[n] = 'R' + G.round + ' L' + L + ' ' + MASTERS[p.mk].name + ' ' + p.talents.join('/'); } return _sr(); };
for (let k = 0; k < 3; k++) for (const mk of Object.keys(MASTERS)) { try { const r = run(mk); if (k == 0) console.log(mk, JSON.stringify(r)); } catch (e) { console.log('CRASH', e.stack.split(/\r?\n/).slice(0, 4).join(' | ')); } }
console.log(JSON.stringify(hist, null, 1));
for (const r in bt) console.log('R' + r, (bt[r].reduce((a, b) => a + b, 0) / bt[r].length).toFixed(1));
console.log('errors', errs.length, [...new Set(errs)].slice(0, 10).join('\n'));
