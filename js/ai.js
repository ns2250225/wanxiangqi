// 电脑棋手：准备阶段的购买 / 出牌 / 升级 / 刷新 / 技能决策
const AI = {
  // 对一个选择题的所有选项排序（最想要的在前）
  choose(p, q) {
    const onBoard = new Set(G.heroUnits(p).map(u => u.hid));
    const main = G.mainCamp(p);
    const score = o => {
      let s = Math.random() * 3 + (o.q || 0);
      const c = o.card;
      if (c) {
        if (c.kind === 'hero') { const h = HD[c.hid]; if (onBoard.has(c.hid)) s += 10; if (main && h.camp === main) s += 4; s += h.q * 1.5; }
        else s += (c.q || 1) * 1.2;
      }
      if (typeof o.value === 'string' && main && o.value === main) s += 6;
      return s;
    };
    return q.options.map(o => ({ o, s: score(o) })).sort((a, b) => b.s - a.s).map(x => x.o.value);
  },

  unitValue(u) { return G.totalLv(u) * (1 + HD[u.hid].q * 0.3) * (u.awake ? 1.5 : 1) + u.equips.length * 3; },

  bestTarget(p, c) {
    const us = G.heroUnits(p).filter(u => G.canTarget(p, c, u));
    if (!us.length) return null;
    return U.maxBy(us, u => this.unitValue(u) + Math.random());
  },

  heroWanted(p, c) {
    const h = HD[c.hid], main = G.mainCamp(p);
    if (G.heroUnits(p).some(u => u.hid === c.hid)) return 10;
    if (p.hand.some(x => x.kind === 'hero' && x.hid === c.hid)) return 8;
    let s = h.q * 1.2;
    if (main && h.camp === main) s += 3;
    if (G.popUsed(p) < G.pop(p)) s += 3;
    return s;
  },

  playHand(p) {
    let guard = 0, progress = true;
    while (progress && guard++ < 30) {
      progress = false;
      for (let i = 0; i < p.hand.length; i++) {
        const c = p.hand[i];
        if (c.kind === 'hero') {
          const merge = G.heroUnits(p).some(u => u.hid === c.hid);
          if (!merge && G.popUsed(p) >= G.pop(p)) continue;
          if (G.playCard(p, i, null, -1)) { progress = true; break; }
        } else {
          let t = null;
          if (G.cardNeedsTarget(c)) { t = this.bestTarget(p, c); if (!t) continue; }
          if (c.kind === 'effect') {
            const fx = EFFECT_FX[c.name];
            if (!fx) continue;
            let ok = true;
            try { ok = !fx.can || fx.can(p, t, c); } catch (e) { ok = false; }
            if (!ok) continue;
          }
          if (G.playCard(p, i, t)) { progress = true; break; }
        }
      }
    }
  },

  // 人口满时：若手里有更好的新英雄，卖掉场上最弱的
  swapWeak(p) {
    if (G.popUsed(p) < G.pop(p)) return;
    const newHero = p.hand.find(c => c.kind === 'hero' && !G.heroUnits(p).some(u => u.hid === c.hid));
    if (!newHero) return;
    const weak = U.minBy(G.heroUnits(p).filter(u => !u.noPop), u => this.unitValue(u));
    if (weak && this.unitValue(weak) < 4 + HD[newHero.hid].q * 1.5 && G.round > 2) { G.sellUnit(p, weak); this.playHand(p); }
  },

  turn(p) {
    if (!p.alive || p.ghost) return;
    const M = MASTERS[p.mk];
    this.playHand(p);
    let refreshes = 0;
    for (let step = 0; step < 25; step++) {
      // 棋手技能
      if (M.active) {
        const cost = M.active.cost(p);
        if (p.energy >= cost + 1 && cost <= 3 && (!M.active.can || M.active.can(p)) && (cost > 0 || !p.rc.aiUsedFree)) {
          if (M.active.target) { const u = U.maxBy(G.heroUnits(p), u => this.unitValue(u)); if (u && !u.st.star1) { p.energy -= cost; G.guard(() => M.active.use(p, u)); } p.rc.aiUsedFree = true; }
          else { p.energy -= cost; G.guard(() => M.active.use(p)); if (!cost) p.rc.aiUsedFree = true; this.playHand(p); continue; }
        }
      }
      // 升级
      if (p.lv < 6) {
        const need = CFG.XP_NEED[p.lv] - p.xp;
        const eager = G.round >= 3 && (p.energy - need >= 3 || need <= 2 || (G.round >= 8 && p.energy >= need));
        if (p.energy >= need && eager) { G.buyLevel(p); this.playHand(p); continue; }
      }
      // 购买
      let bought = false;
      const opts = p.shop.map((c, i) => ({ c, i })).filter(x => x.c && x.c.cost <= p.energy && p.hand.length < CFG.HAND_MAX);
      const ranked = opts.map(x => ({ ...x, s: x.c.kind === 'hero' ? this.heroWanted(p, x.c) : (x.c.q * 1.3 + (p.energy - x.c.cost >= 3 ? 2 : -2)) })).sort((a, b) => b.s - a.s);
      for (const x of ranked) {
        if (x.s < 4.5) break;
        if (G.buy(p, x.i)) { bought = true; this.playHand(p); this.swapWeak(p); break; }
      }
      if (bought) continue;
      // 刷新
      if (p.energy >= 4 && refreshes < 4) { refreshes++; if (G.doRefresh(p)) continue; }
      break;
    }
    // 手牌过多时卖掉最差的牌
    while (p.hand.length > 7) {
      const i = p.hand.indexOf(U.minBy(p.hand, c => (c.q || 1) + (c.kind === 'hero' && G.heroUnits(p).some(u => u.hid === c.hid) ? 10 : 0)));
      G.sellCard(p, i);
    }
    this.arrange(p);
  },

  // 近战/坦克站前排，远程站后排
  arrange(p) {
    const us = G.units(p).slice();
    const front = us.filter(u => u.token || HD[u.hid].melee || /坦/.test(HD[u.hid].tpl));
    const back = us.filter(u => !front.includes(u));
    const b = new Array(28).fill(null);
    const cols = [3, 2, 4, 1, 5, 0, 6];
    const put = (list, rows) => { for (const u of list) { let done = false; for (const r of rows) { for (const c of cols) { if (!b[r * 7 + c]) { b[r * 7 + c] = u; done = true; break; } } if (done) break; } } };
    put(front, [0, 1, 2, 3]); put(back, [3, 2, 1, 0]);
    p.board = b;
  },
};
