let state = null; const errs = [];
const UI = {
  ask(q, cb) { const vs = AI.choose(G.human, q); cb((q.n || 1) > 1 ? vs.slice(0, q.n) : vs[0]); },
  onLog() {}, onRoundStart() { state = 'prep'; }, onBattles(bs) { state = 'battles'; }, onAuction(A) { state = 'auction'; }, onGameOver() { state = 'over'; },
};
console.error = (e) => { errs.push(String(e && e.stack || e).split(/\r?\n/).slice(0, 3).join(' | ')); };
const stat = { rounds: [], battleT: [], timeouts: 0, battles: 0 };
function run(mk) {
  state = null; G.newGame(mk);
  let guard = 0;
  while (state !== 'over' && guard++ < 200) {
    if (state === 'prep') { AI.turn(G.human); G.endPrep(); }
    else if (state === 'battles') { for (const bt of G.battles) { const b = B.simulate(bt); stat.battles++; stat.battleT.push(b.t); if (b.t >= 40) stat.timeouts++; } state = null; G.afterBattles(); }
    else if (state === 'auction') { const A = Auction; state = null; while (A.idx < A.lots.length) A.settle(U.int(0, 5)); A.finish(); G.startRound(); }
    else break;
  }
  stat.rounds.push(G.round);
  return { round: G.round, place: G.human.place, p: G.players.map(p => p.hp + '/L' + p.lv + '/' + G.heroUnits(p).map(u => G.totalLv(u)).join(',')) };
}
const N = +(process_argv || 0);
for (let k = 0; k < N; k++) for (const mk of Object.keys(MASTERS)) { try { const r = run(mk); if (k === 0) console.log(mk, JSON.stringify(r)); } catch (e) { console.log(mk, 'CRASH', e.stack.split(/\r?\n/).slice(0, 4).join(' | ')); } }
const cnt = {}; errs.forEach(e => cnt[e] = (cnt[e] || 0) + 1);
const avg = a => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
console.log('avg rounds', avg(stat.rounds), 'avg battle t', avg(stat.battleT), 'timeouts', stat.timeouts + '/' + stat.battles);
console.log('guarded errors:', errs.length); Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([e, n]) => console.log(n, e));
