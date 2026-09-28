// 核心规则：经济 / 商店 / 卡池 / 触发器 / 回合流程 / 拍卖
const HD = {}, HN = {}, ED = {}, QD = {};
HERO_DATA.forEach(h => { HD[h.id] = h; HN[h.name] = h; });
EFFECT_DATA.forEach(e => { ED[e.name] = e; });
EQUIP_DATA.forEach(e => { QD[e.name] = e; });
const CAMPS = ['三分之地', '大河流域', '日落海', '河洛', '逐鹿', '无阵营'];
const CAMP_SHORT = { '三分之地': '三分', '大河流域': '大河', '日落海': '日落海', '河洛': '河洛', '逐鹿': '逐鹿', '无阵营': '无阵营' };
const campOf = h => h.camp;
const hasKw = (h, k) => (h.kw || []).includes(k) || (h.desc || '').includes(k + '：') || (h.desc || '').startsWith(k);

const CFG = {
  START_HP: 60, HAND_MAX: 9, SHOP_HEROES: 4, SHOP_EFFECTS: 2, BOARD_R: 4, BOARD_C: 7,
  income(r) { return r <= 3 ? 6 : r <= 7 ? 8 : r <= 11 ? 12 : 15; },
  XP_NEED: [0, 7, 13, 17, 23, 27],          // 从 L 级升到 L+1 级需要的经验
  pop(lv) { return lv >= 5 ? 7 : lv >= 3 ? 6 : 5; },
  ODDS: [null, [70, 30, 0, 0, 0], [45, 40, 15, 0, 0], [30, 38, 27, 5, 0], [20, 30, 33, 15, 2], [12, 22, 33, 25, 8], [8, 15, 27, 32, 18]],
  EFF_COST: [0, 2, 3, 4, 5, 7, 9],
  POOL: [0, 16, 14, 12, 10, 8],
  AUCTION: { 3: 'A', 7: 'B', 11: 'C' },
  PREP_TIME: 75,
  SKILL_LV: [10, 40, 100],
};

// 基础装备 → 可铸造的普通装备类型
const FORGE_TYPE = { '雷鸣刃': '输出', '大棒': '输出', '速击之枪': '输出', '风暴巨剑': '输出', '圣者法典': '法术', '守护者之铠': '防御', '力量腰带': '防御', '破碎圣杯': '功能' };
const HERO_EQUIP = ['方天画戟', '霸王戟', '双剑·雄', '双剑·雌', '玄微之种'];
const BASIC_EQUIPS = Object.keys(FORGE_TYPE);
const NORMAL_EQUIPS = EQUIP_DATA.filter(e => e.q === 2 && !HERO_EQUIP.includes(e.name)).map(e => e.name);
function forgePool(t) {
  return NORMAL_EQUIPS.filter(n => {
    const ty = QD[n].type;
    if (t === '输出') return ty === '攻强' || ty === '暴击';
    if (t === '法术') return ty === '法术';
    if (t === '防御') return ty === '肉';
    return ty === '功能' || ty === '法术' || ty === '肉';
  });
}
const SPECIAL_EQUIPS = EQUIP_DATA.filter(e => e.q === 5 && !['月神', '贤者的庇护', '机关匣', '救命毫毛', '套娃枪', '怒莲之刺', '银莲庇佑'].includes(e.name)).map(e => e.name);
const TALENT_EQUIPS = EQUIP_DATA.filter(e => e.q === 3 && !e.desc.includes('专属')).map(e => e.name);

const G = {
  players: [], round: 0, phase: 'menu', pool: {}, depth: 0, trig: 0, tierByLv: {}, human: null,
  logs: [],

  // ---------------- 开局 ----------------
  newGame(masterKey) {
    this.round = 0; this.pool = {}; this.logs = [];
    HERO_DATA.forEach(h => this.pool[h.id] = CFG.POOL[h.q]);
    // 同等级所有棋手天赋品质相同（本局随机）
    const tiers = { 2: U.pick([1, 1, 2]), 3: U.pick([1, 2, 2]), 4: U.pick([2, 2, 3]), 5: U.pick([2, 3, 3]) };
    this.tierByLv = tiers;
    const keys = U.shuffle(Object.keys(MASTERS).filter(k => k !== masterKey));
    const names = ['云游棋士', '长安夜雨', '稷下学子', '峡谷清风', '东海渔歌'];
    this.players = [];
    for (let i = 0; i < 6; i++) {
      const p = this.newPlayer(i, i === 0 ? '我' : names[i - 1], i === 0 ? masterKey : keys[i - 1], i === 0);
      this.players.push(p);
    }
    this.human = this.players[0];
    this.players.forEach(p => MASTERS[p.mk].init && MASTERS[p.mk].init(p));
    this.startRound();
  },

  newPlayer(id, name, mk, human) {
    return {
      id, name, mk, human, hp: CFG.START_HP, energy: 0, lv: 1, xp: 0, board: new Array(28).fill(null), hand: [], shop: [],
      lock: false, freeRefresh: 0, alive: true, place: 0, talents: [], core: 0, totemBonus: {}, extraPop: 0,
      cnt: {}, rc: {}, lastOpp: null, lastWin: null, streakW: 0, streakL: 0, ms: {}, dmgDealt: 0, pending: {},
    };
  },

  alive() { return this.players.filter(p => p.alive); },
  log(p, msg) { if (p && !p.human && !p.ghost) return; this.logs.push({ r: this.round, msg }); if (this.logs.length > 200) this.logs.shift(); UI && UI.onLog && UI.onLog(msg); },

  // ---------------- 基础查询 ----------------
  units(p) { return p.board.filter(Boolean); },
  heroUnits(p) { return this.units(p).filter(u => !u.token); },
  pop(p) { return CFG.pop(p.lv) + p.extraPop; },
  popUsed(p) { return this.units(p).filter(u => !u.noPop).length; },
  posOf(p, u) { return p.board.indexOf(u); },
  hof(u) { return HD[u.hid]; },
  mOf(u) { return u.awake ? 2 : 1; },
  byCamp(p, camp) { return this.heroUnits(p).filter(u => HD[u.hid].camp === camp || (u.asCamp === camp)); },
  campsOnBoard(p) { return [...new Set(this.heroUnits(p).map(u => HD[u.hid].camp))]; },
  mainCamp(p) {
    const c = {}; this.heroUnits(p).forEach(u => { const k = HD[u.hid].camp; if (k !== '无阵营') c[k] = (c[k] || 0) + 1; });
    let best = null, bv = 0; for (const k in c) if (c[k] > bv) { bv = c[k]; best = k; }
    return best;
  },
  nearest(p, u, filter) {
    const i = this.posOf(p, u); if (i < 0) return null;
    const r = Math.floor(i / 7), c = i % 7;
    let best = null, bd = 1e9;
    p.board.forEach((v, j) => {
      if (!v || v === u || v.token || (filter && !filter(v))) return;
      const d = Math.max(Math.abs(Math.floor(j / 7) - r), Math.abs(j % 7 - c)) * 10 + Math.abs(Math.floor(j / 7) - r) + Math.abs(j % 7 - c);
      if (d < bd) { bd = d; best = v; }
    });
    return best;
  },
  neighbors(p, u, dist = 1) {
    const i = this.posOf(p, u); if (i < 0) return [];
    const r = Math.floor(i / 7), c = i % 7;
    return p.board.filter((v, j) => v && v !== u && !v.token && Math.max(Math.abs(Math.floor(j / 7) - r), Math.abs(j % 7 - c)) <= dist);
  },
  randUnits(p, n, filter, excl) { return U.sample(this.heroUnits(p).filter(u => u !== excl && (!filter || filter(u))), n); },
  totalLv(u) { return Math.max(1, u.lv + u.temp); },

  // ---------------- 单位 ----------------
  newUnit(hid, lv = 1) {
    return { uid: U.uid(), hid, lv, temp: 0, prog: 1, awake: false, equips: [], perm: { hp: 0, aspd: 0, mp: 0, patk: 0, matk: 0 }, rnd: { mp: 0 }, st: {}, revive: 0, kills: 0, flash: false };
  },

  stats(u) {
    const h = HD[u.hid], L = this.totalLv(u), k = L - 1;
    const mag = h.g[2] > 0;
    const aw = u.awake ? 1.5 : 1;
    const s = {
      lv: L, maxHp: (h.hp + h.g[0] * k) * aw + u.perm.hp,
      patk: (h.patk + h.g[1] * k) * aw + u.perm.patk,
      matk: mag ? ((h.matk || h.patk) + h.g[2] * k) * aw + u.perm.matk : u.perm.matk,
      pdef: (h.pdef + k * 0.35) * (u.awake ? 1.2 : 1), mdef: (h.mdef + k * 0.35) * (u.awake ? 1.2 : 1),
      aspd: h.aspd / 10000 * (1 + u.perm.aspd), range: h.range, melee: h.melee,
      mp0: h.mp0, mpMax: Math.max(10, h.mp + u.perm.mp + u.rnd.mp),
      crit: 0.05, critDmg: 1.5, ls: 0, amp: 0, dr: 0,
    };
    if (h.mp === 0) s.mpMax = 9999;
    let hpPct = 0, apct = 0, mpct = 0;
    for (const en of u.equips) {
      const e = QD[en]; if (!e) continue; const st = e.stats || {};
      if (st.critical_rate) s.crit += st.critical_rate / 100;
      if (st.critical_effect) s.critDmg += st.critical_effect / 100;
      if (st.attack_speed_pct) s.aspd *= 1 + st.attack_speed_pct / 100;
      if (st.magical_defense) { s.mdef += st.magical_defense; if (/物理和法术防御/.test(e.desc)) s.pdef += st.magical_defense; }
      if (st.physical_attack) {
        if (/%/.test(e.desc.split('。')[0] + e.desc.split('。')[1])) { if (/法术攻击力\+\d+%/.test(e.desc)) mpct += st.magical_attack / 100; if (/物理和法术攻击力\+\d+%/.test(e.desc)) apct += st.physical_attack / 100; }
        else { if (/法术攻击力\+\d+/.test(e.desc)) s.matk += st.magical_attack; if (/物理攻击力\+\d+/.test(e.desc)) s.patk += st.physical_attack; }
      }
      if (en === '不死鸟之眼') hpPct += 0.15;
      if (en === '月影之力') hpPct += 0.15;
      if (en === '火鹰合金盾') { s.pdef += 20; }
      if (en === '翼苍穹盾') { s.pdef += 10; }
      if (en === '银莲庇佑') { s.pdef += 10; s.mdef += 10; }
      if (en === '贤者之书') s.mpMax -= 10;
      if (en === '火鹰狩枪') s.mpMax -= 20;
      if (en === '灵泉项链') s.mpMax -= 10;
      if (en === '学识宝石') s.mpMax -= 2 * (u.st.gemRounds || 0);
      if (en === '噬神之书') { s.matk += 100; s.ls += 0.6; }
      if (en === '征服之剑') s.ls += 0.3;
      if (en === '掠魂爪') s.ls += 0.5;
      if (en === '魂祭绝刃') s.ls += 0.3;
      if (en === '火鹰装甲') s.ls += 0.2;
      if (en === '百锻刀') s.patk += 30 + (u.st.forgeAtk || 0);
      if (en === '聚灵法杖') s.matk += 30 + (u.st.forgeMatk || 0);
      if (en === '盛华') s.maxHp += u.st.bloom || 0;
      if (en === '双剑·雄' && h.name === '干将莫邪') s.mpMax = 10;
      if (en === '青莲剑谱') s.crit += 0.4;
      if (en === '怒神项链') s.crit += 0;
      if (en === '热血拳套') { }
      if (en === '机器头') s.amp += 0.6;
    }
    s.maxHp *= 1 + hpPct; s.patk *= 1 + apct; s.matk *= 1 + mpct + apct;
    s.mpMax = Math.max(10, s.mpMax);
    s.crit = Math.min(1, s.crit);
    s.maxHp = Math.round(s.maxHp); s.patk = Math.round(s.patk); s.matk = Math.round(s.matk);
    return s;
  },

  // ---------------- 卡牌 ----------------
  heroCard(hid, extra) { const h = HD[hid]; return Object.assign({ cid: U.uid(), kind: 'hero', hid, q: h.q, name: h.name, cost: 3 }, extra || {}); },
  effCard(name, extra) { const e = ED[name] || { q: 1 }; return Object.assign({ cid: U.uid(), kind: 'effect', name, q: e.q, cost: CFG.EFF_COST[e.q] || 3, flash: /^转瞬/.test(e.desc || '') }, extra || {}); },
  equipCard(name) { const e = QD[name]; return { cid: U.uid(), kind: 'equip', name, q: e ? e.q : 1, cost: 3 }; },
  giveCard(p, c, silent) {
    if (!c) return false;
    if (p.hand.length >= CFG.HAND_MAX) { if (c.kind === 'hero' && !c.gift) this.pool[c.hid]++; this.log(p, `手牌已满，${c.name}被丢弃`); return false; }
    p.hand.push(c);
    if (!silent) this.log(p, `获得卡牌【${c.name}】`);
    return true;
  },
  // 从卡池抽取英雄（不足则生成）
  drawHero(filter, fromPool = true) {
    let cands = HERO_DATA.filter(h => !filter || filter(h));
    if (!cands.length) cands = HERO_DATA.slice();
    const ws = cands.map(h => fromPool ? Math.max(0.2, this.pool[h.id]) : 1);
    const h = cands[U.weighted(ws)];
    if (fromPool && this.pool[h.id] > 0) this.pool[h.id]--;
    return this.heroCard(h.id);
  },
  giveHero(p, filter, extra) { const c = this.drawHero(filter); if (extra) Object.assign(c, extra); return this.giveCard(p, c); },
  randEffectName(filter) { const c = EFFECT_DATA.filter(e => e.q <= 5 && (!filter || filter(e))); return U.pick(c).name; },

  // ---------------- 商店 ----------------
  rollTier(p, bonus = 0) { return Math.min(5, U.weighted(CFG.ODDS[p.lv]) + 1 + bonus); },
  shopEffectOk(p, e) {
    if (e.q > 5 || /^转瞬/.test(e.desc)) return false;
    if (['弦音'].includes(e.name)) return false;
    if (e.cat === '通用' || e.cat === '无阵营') return true;
    return this.campsOnBoard(p).includes(e.cat) || U.chance(0.25);
  },
  refreshShop(p, free) {
    for (const c of p.shop) if (c && c.kind === 'hero') this.pool[c.hid]++;
    p.shop = [];
    for (let i = 0; i < CFG.SHOP_HEROES; i++) {
      let t = this.rollTier(p, (i === 0 && p.rc.breakthrough) ? 1 : 0);
      let cands = HERO_DATA.filter(h => h.q === t && this.pool[h.id] > 0);
      while (!cands.length && t > 1) { t--; cands = HERO_DATA.filter(h => h.q === t && this.pool[h.id] > 0); }
      if (!cands.length) { p.shop.push(null); continue; }
      const h = cands[U.weighted(cands.map(h => this.pool[h.id]))];
      this.pool[h.id]--;
      p.shop.push(this.heroCard(h.id));
    }
    for (let i = 0; i < CFG.SHOP_EFFECTS; i++) {
      const t = Math.min(5, this.rollTier(p));
      const cands = EFFECT_DATA.filter(e => e.q === t && this.shopEffectOk(p, e));
      p.shop.push(cands.length ? this.effCard(U.pick(cands).name) : null);
    }
    if (p.rc.discount > 0) { p.shop.forEach(c => c && (c.cost = Math.max(0, c.cost - 1))); p.rc.discount--; }
    p.rc.breakthrough = false;
    this.fire(p, 'onRefresh');
  },
  doRefresh(p) {
    if (p.freeRefresh > 0) p.freeRefresh--;
    else if (p.rc.freeShop) { }
    else { const cost = 1 + (p.rc.refreshTax || 0); if (p.energy < cost) return false; p.energy -= cost; }
    this.refreshShop(p);
    return true;
  },
  buy(p, i) {
    const c = p.shop[i]; if (!c) return false;
    if (p.energy < c.cost) return false;
    if (p.hand.length >= CFG.HAND_MAX) return false;
    p.energy -= c.cost; p.shop[i] = null;
    c.cost = c.kind === 'hero' ? 3 : c.cost;
    p.hand.push(c);
    p.cnt.bought = (p.cnt.bought || 0) + 1;
    this.fire(p, 'onBuy', c);
    return true;
  },
  sellCard(p, idx) {
    const c = p.hand[idx]; if (!c) return;
    p.hand.splice(idx, 1);
    if (c.kind === 'hero' && !c.gift) this.pool[c.hid]++;
    if (!c.flash) p.energy += 1;
  },

  // ---------------- 经验 / 等级 ----------------
  addXp(p, n) {
    if (p.lv >= 6) { return; }
    p.xp += n;
    while (p.lv < 6 && p.xp >= CFG.XP_NEED[p.lv]) { p.xp -= CFG.XP_NEED[p.lv]; this.levelUp(p); }
    if (p.lv >= 6) p.xp = 0;
  },
  buyLevel(p) {
    if (p.lv >= 6) return false;
    const need = CFG.XP_NEED[p.lv] - p.xp;
    if (p.energy < need) return false;
    p.energy -= need; this.addXp(p, need); return true;
  },
  levelUp(p) {
    p.lv++;
    this.log(p, `棋手升到 ${p.lv} 级`);
    if (p.lv === 6) {
      const M = MASTERS[p.mk];
      if (M.exclusive) this.giveCard(p, this.effCard(M.exclusive, { master: true }));
    } else {
      const tier = this.tierByLv[p.lv] || 1;
      const opts = U.sample(TALENTS.filter(t => t.q === tier && !p.talents.includes(t.name) && (!t.ok || t.ok(p))), 3);
      if (opts.length) this.ask(p, { title: `棋手升级：选择${['', '铜', '银', '金'][tier]}色天赋`, options: opts.map(t => ({ label: t.name, desc: t.desc, q: tier, kind: 'talent', value: t.name })) }, v => this.gainTalent(p, v));
    }
    this.fire(p, 'onLevelUp');
  },
  gainTalent(p, name) {
    const t = TALENT_MAP[name]; if (!t) return;
    p.talents.push(name);
    this.log(p, `获得天赋【${name}】`);
    t.gain && t.gain(p, t);
  },

  // ---------------- 选择（人类弹窗 / AI 自动） ----------------
  ask(p, q, cb) {
    if (p.ghost) return;
    if (p.human) UI.ask(q, cb);
    else { const n = q.n || 1; const vs = AI.choose(p, q); cb(n > 1 ? vs.slice(0, n) : vs[0]); }
  },
  // 发现：卡牌 N 选 k
  discover(p, cards, k = 1, title = '卡牌选择') {
    if (!cards.length) return;
    this.ask(p, { title, n: k, options: cards.map(c => ({ card: c, value: c })) }, v => {
      const arr = Array.isArray(v) ? v : [v];
      arr.forEach(c => this.giveCard(p, c));
      cards.filter(c => !arr.includes(c)).forEach(c => c.kind === 'hero' && this.pool[c.hid]++);
    });
  },

  // ---------------- 触发器 ----------------
  guard(fn) {
    if (this.depth > 30 || this.trig > 1500) return;
    this.depth++; this.trig++;
    try { fn(); } catch (e) { console.error(e); }
    this.depth--;
  },
  heroFx(u) { return HERO_FX[HD[u.hid].name] || {}; },
  // 触发单个英雄的某类效果
  trigger(p, u, kind, arg) {
    const fx = this.heroFx(u);
    if (!fx[kind]) return false;
    this.guard(() => fx[kind](p, u, this.mOf(u), arg));
    if (kind === 'play') { p.cnt.entrance = (p.cnt.entrance || 0) + 1; this.fire(p, 'onEntrance', u); }
    if (kind === 'prep') this.fire(p, 'onPrepTrig', u);
    if (kind === 'open') this.fire(p, 'onOpenTrig', u);
    if (kind === 'death') this.fire(p, 'onSacrifice', u);
    return true;
  },
  hasFx(u, kind) { return !!this.heroFx(u)[kind]; },
  // 广播事件：英雄被动、天赋、棋手
  fire(p, evt, arg, arg2) {
    if (!p) return;
    for (const u of this.heroUnits(p).slice()) {
      const fx = this.heroFx(u);
      if (fx[evt]) this.guard(() => fx[evt](p, u, this.mOf(u), arg, arg2));
    }
    for (const tn of p.talents) { const t = TALENT_MAP[tn]; if (t && t[evt]) this.guard(() => t[evt](p, t, arg, arg2)); }
    const M = MASTERS[p.mk]; if (M && M[evt]) this.guard(() => M[evt](p, arg, arg2));
  },

  // ---------------- 等级变化 ----------------
  lvUp(p, u, n, temp) {
    if (!u || !n || u.token && !u.summonLv) return;
    n = Math.round(n);
    if (temp) {
      u.temp += n;
      if (n > 0) this.fire(p, 'onTemp', u, n);
    } else {
      if (n > 0 && u.st.fengshen) n += 1;
      u.lv = U.clamp(u.lv + n, 1, 999);
      if (n > 0) this.fire(p, 'onLvGain', u, n);
    }
    if (u._bu && B.cur) B.relevel(u._bu);
  },
  coreUp(p, n) {
    if (!n) return;
    p.core += n;
    this.fire(p, 'onCoreUp', n);
  },
  useCoin(p, u, amount = 2, card) {
    if (!u) return;
    let n = amount;
    for (const w of this.heroUnits(p)) if (HD[w.hid].name === '武则天') n += this.mOf(w);
    if (!card || !card.broken) this.lvUp(p, u, n);
    for (const w of this.heroUnits(p)) if (HD[w.hid].name === '李白') { this.lvUp(p, u, 4 * this.mOf(w) + (w === u ? 3 * this.mOf(w) : 0), true); }
    p.rc.coins = (p.rc.coins || 0) + 1;
    p.cnt.coins = (p.cnt.coins || 0) + 1;
    this.fire(p, 'onCoin', u);
  },

  // ---------------- 出牌 ----------------
  // 返回 true 表示成功
  playCard(p, idx, targetU, cell) {
    const c = p.hand[idx]; if (!c) return false;
    let ok = false;
    if (c.kind === 'hero') ok = this.playHero(p, c, cell);
    else if (c.kind === 'equip') ok = this.playEquip(p, c, targetU);
    else ok = this.playEffect(p, c, targetU);
    if (ok) {
      const j = p.hand.indexOf(c); if (j >= 0) p.hand.splice(j, 1);
      p.rc.played = (p.rc.played || 0) + 1;
      p.rc.playedList = p.rc.playedList || []; p.rc.playedList.push(c);
      this.fire(p, 'onAnyCard', c);
    }
    return ok;
  },
  cardNeedsTarget(c) {
    if (c.kind === 'equip') return true;
    if (c.kind === 'effect') { const fx = EFFECT_FX[c.name]; return !!(fx && fx.tgt); }
    return false;
  },
  canTarget(p, c, u) {
    if (!u || u.token) return false;
    if (c.kind === 'equip') return u.equips.length < 3 && (!EQUIP_RULE[c.name] || EQUIP_RULE[c.name](u));
    const fx = EFFECT_FX[c.name]; if (!fx || !fx.tgt) return true;
    return fx.tgt === true || fx.tgt(u, p);
  },
  firstFreeCell(p, h) {
    const rows = h && (h.melee || /坦/.test(h.tpl)) ? [0, 1, 2, 3] : [3, 2, 1, 0];
    const cols = [3, 2, 4, 1, 5, 0, 6];
    for (const r of rows) for (const c of cols) if (!p.board[r * 7 + c]) return r * 7 + c;
    return -1;
  },
  playHero(p, c, cell) {
    const h = HD[c.hid];
    let u = this.heroUnits(p).find(x => x.hid === c.hid);
    if (u) {
      // 合成：等级+1，触发登场
      let bonus = 0;
      for (const w of this.heroUnits(p)) if (HD[w.hid].name === '曜') bonus += this.mOf(w);
      this.lvUp(p, u, 1 + bonus);
      if (!u.awake) { u.prog = Math.min(4, u.prog + (c.split ? 1 : 1)); if (u.prog >= 4) { u.awake = true; this.log(p, `【${h.name}】觉醒！`); this.fire(p, 'onAwake', u); } }
      if (c.awakeCard && !u.awake) { u.prog = 4; u.awake = true; }
      this.log(p, `【${h.name}】合成，等级 ${u.lv}`);
      p.cnt.merges = (p.cnt.merges || 0) + 1; p.rc.merges = (p.rc.merges || 0) + 1;
      this.fire(p, 'onMerge', u);
    } else {
      if (this.popUsed(p) >= this.pop(p)) return false;
      if (cell == null || cell < 0 || p.board[cell]) cell = this.firstFreeCell(p, h);
      if (cell < 0) return false;
      u = this.newUnit(c.hid, c.lv || 1);
      if (c.awakeCard) { u.prog = 4; u.awake = true; }
      if (c.flash) u.flashCard = true;
      if (c.temp) u.temp += c.temp;
      p.board[cell] = u;
      this.log(p, `【${h.name}】上阵`);
      const fx = this.heroFx(u); if (fx.enter) this.guard(() => fx.enter(p, u, this.mOf(u)));
    }
    this.trigger(p, u, 'play');
    this.fire(p, 'onPlayHero', c, u);
    return true;
  },
  playEquip(p, c, u) {
    if (!this.canTarget(p, c, u)) return false;
    u.equips.push(c.name);
    this.log(p, `【${HD[u.hid].name}】穿戴【${c.name}】`);
    if (FORGE_TYPE[c.name]) {
      // 铸造：3选1普通装备
      const opts = U.sample(forgePool(FORGE_TYPE[c.name]), 3);
      this.ask(p, { title: `铸造【${c.name}】：选择1件普通装备`, options: opts.map(n => ({ label: n, desc: QD[n].desc, q: 2, kind: 'equip', value: n })) }, v => {
        const i = u.equips.indexOf(c.name); if (i >= 0) u.equips[i] = v;
        this.log(p, `铸造出【${v}】`);
        this.fire(p, 'onEquip', u, v);
      });
    } else this.fire(p, 'onEquip', u, c.name);
    return true;
  },
  unequip(p, u, i) {
    const n = u.equips[i]; if (!n) return;
    if (/无法拆卸/.test(QD[n] ? QD[n].desc : '')) return;
    if (p.hand.length >= CFG.HAND_MAX) return;
    u.equips.splice(i, 1);
    p.hand.push(this.equipCard(n));
  },
  playEffect(p, c, u) {
    const fx = EFFECT_FX[c.name];
    if (!fx) return false;
    if (fx.tgt && !this.canTarget(p, c, u)) return false;
    if (fx.can && !fx.can(p, u, c)) return false;
    if (/战术/.test(c.name)) p.cnt.tactics = (p.cnt.tactics || 0) + 1;
    p.rc.effects = (p.rc.effects || 0) + 1;
    p.cnt.effects = (p.cnt.effects || 0) + 1;
    this.guard(() => fx.run(p, u, c));
    this.log(p, `使用【${c.name}】` + (u ? `→【${HD[u.hid].name}】` : ''));
    this.fire(p, 'onEffect', c, u);
    return true;
  },
  sellUnit(p, u) {
    const i = this.posOf(p, u); if (i < 0 || u.token) return;
    p.board[i] = null;
    if (!u.gift) this.pool[u.hid] += u.prog;
    if (!u.flashCard) p.energy += 1;
    for (const e of u.equips) if (p.hand.length < CFG.HAND_MAX) p.hand.push(this.equipCard(e));
    p.cnt.sold = (p.cnt.sold || 0) + 1;
    this.trigger(p, u, 'sell');
    this.fire(p, 'onSellUnit', u);
    this.log(p, `出售【${HD[u.hid].name}】`);
  },
  moveUnit(p, from, to) {
    if (from === to || from < 0 || to < 0) return;
    const a = p.board[from], b = p.board[to];
    p.board[to] = a; p.board[from] = b;
  },
  removeUnit(p, u) { const i = this.posOf(p, u); if (i >= 0) p.board[i] = null; },

  // ---------------- 回合 ----------------
  startRound() {
    this.round++;
    this.trig = 0;
    this.phase = 'prep';
    for (const p of this.alive()) {
      p.rc = { coinsFirst: false };
      p.energy += CFG.income(this.round) + (p.pending.energy || 0);
      p.pending.energy = 0;
      if (this.round > 1) this.addXp(p, 1);
      for (const u of this.units(p)) { u.rnd = { mp: 0 }; u.revive = 0; }
    }
    for (const p of this.alive()) {
      this.fire(p, 'onRoundStart');
      // 整备：按棋盘顺序触发
      for (const u of this.heroUnits(p).slice()) this.trigger(p, u, 'prep');
      // 夺取
      for (const u of this.heroUnits(p).slice()) if (hasKw(HD[u.hid], '夺取')) this.steal(p, u);
      if (!p.lock) this.refreshShop(p, true); else p.lock = false;
    }
    for (const p of this.alive()) if (!p.human) AI.turn(p);
    UI.onRoundStart && UI.onRoundStart();
  },
  steal(p, u, max = 10) {
    const ns = this.neighbors(p, u, 1).filter(v => v.lv > 1);
    const v = U.pick(ns); if (!v) return;
    const n = Math.min(max, v.lv - 1);
    this.lvUp(p, v, -n); this.lvUp(p, u, n);
    this.log(p, `【${HD[u.hid].name}】夺取【${HD[v.hid].name}】${n}级`);
  },

  // 准备结束 → 匹配 → 战斗
  endPrep() {
    if (this.phase !== 'prep') return;
    this.phase = 'battle';
    const al = this.alive();
    // 转瞬手牌在回合结束时销毁（进入战斗前）
    for (const p of al) p.hand = p.hand.filter(c => !(c.flash && c.kind === 'effect'));
    const pairs = this.matchmake(al);
    this.battles = pairs.map(([a, b]) => ({ a, b, bGhost: !!b.ghost }));
    UI.onBattles(this.battles);
  },
  matchmake(al) {
    let best = null;
    for (let t = 0; t < 30; t++) {
      const s = U.shuffle(al);
      const pairs = [];
      for (let i = 0; i + 1 < s.length; i += 2) pairs.push([s[i], s[i + 1]]);
      if (s.length % 2) { const me = s[s.length - 1]; const g = this.ghostOf(U.pick(al.filter(x => x !== me))); pairs.push([me, g]); }
      const bad = pairs.filter(([a, b]) => a.lastOpp === (b.ghostOf != null ? b.ghostOf : b.id)).length;
      if (!best || bad < best.bad) best = { pairs, bad };
      if (!bad) break;
    }
    // 保证玩家永远是 a 方
    return best.pairs.map(([a, b]) => b.human ? [b, a] : [a, b]);
  },
  ghostOf(p) {
    const g = JSON.parse(JSON.stringify(p));
    g.ghost = true; g.human = false; g.ghostOf = p.id; g.name = p.name + '(镜像)';
    return g;
  },

  // 战斗前：开团、核心分配等
  preBattle(p, enemy) {
    for (const u of this.units(p)) u._bu = null;
    this.fire(p, 'onBattleStart', enemy);
    for (const u of this.heroUnits(p).slice()) this.trigger(p, u, 'open');
    // 阿科米亚核心：平均分配给日落海英雄（临时等级）
    const sun = this.heroUnits(p).filter(u => (HD[u.hid].camp === '日落海' || u.equips.includes('阿科米亚之子')) && !u.equips.includes('火鹰星徽'));
    if (p.core > 0 && sun.length) { const each = Math.ceil(p.core / sun.length); sun.forEach(u => this.lvUp(p, u, each, true)); }
  },

  // 战斗结算
  resolveBattle(bt, res) {
    const { a, b } = bt;
    const winner = res.winner === 0 ? a : res.winner === 1 ? b : null;
    const loser = res.winner === 0 ? b : res.winner === 1 ? a : null;
    bt.res = res;
    for (const [p, side] of [[a, 0], [b, 1]]) {
      if (p.ghost) continue;
      const won = res.winner === side;
      p.lastOpp = side === 0 ? (b.ghostOf != null ? b.ghostOf : b.id) : a.id;
      p.lastWin = won;
      if (won) { p.streakW++; p.streakL = 0; } else { p.streakL++; p.streakW = 0; }
      p.rc.kills = res.kills[side];
      for (const u of this.heroUnits(p).slice()) this.trigger(p, u, won ? 'win' : 'lose');
      this.fire(p, won ? 'onWin' : 'onLose');
      // 临时等级清空
      this.fire(p, 'onBattleEnd', won);
      for (const u of this.units(p)) { u.temp = 0; u._bu = null; }
    }
    if (loser && !loser.ghost) {
      const dmg = Math.min(20, 1 + Math.ceil(this.round / 2) + res.survivors);
      this.damage(loser, dmg, winner);
      bt.dmg = dmg;
    }
    if (!winner) {
      for (const p of [a, b]) if (!p.ghost) this.damage(p, 1 + Math.ceil(this.round / 3), null);
      bt.dmg = 1 + Math.ceil(this.round / 3);
    }
  },
  damage(p, n, by) {
    p.hp -= n;
    if (by && !by.ghost) { by.dmgDealt += n; this.fire(by, 'onDealDamage', n); }
    if (p.hp <= 0 && p.ms.lastChance) { p.hp = 1; p.ms.lastChance = false; this.log(p, '一线生机：免于淘汰！'); }
  },
  afterBattles() {
    // 淘汰
    const dead = this.alive().filter(p => p.hp <= 0).sort((x, y) => x.hp - y.hp);
    for (const p of dead) {
      p.alive = false; p.place = this.alive().length + 1;
      for (const u of this.units(p)) if (!u.gift) this.pool[u.hid] += u.prog;
      p.board.fill(null);
    }
    const al = this.alive();
    if (al.length <= 1 || !this.human.alive) {
      if (al.length === 1) al[0].place = 1;
      if (!this.human.alive || al.length <= 1) { this.phase = 'over'; UI.onGameOver(); return; }
    }
    if (CFG.AUCTION[this.round]) { this.phase = 'auction'; Auction.start(CFG.AUCTION[this.round]); return; }
    this.startRound();
  },
};
