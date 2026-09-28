// 自动战斗：8×7 战场，双方各 4 排；英雄自动移动、普攻、回蓝、释放技能
const AR = 8, AC = 7, DT = 0.05, TIME_LIMIT = 45, DMG_SCALE = 0.5;

// ---------------- 技能文本解析 ----------------
const SKILL_CACHE = {};
function parseSkill(h) {
  if (SKILL_CACHE[h.id]) return SKILL_CACHE[h.id];
  const full = h.sk ? h.sk.d : '';
  const txt = full.includes('主动：') ? full.split('主动：')[1] : full;
  const sk = { dmg: [], heal: null, shield: null, radius: 0, multi: 1, stun: 0, summon: false, aspdBuff: 0, allyHeal: false, allyShield: false, revive40: false, far: false };
  const statOf = (s, t) => s === '法术攻击力' ? 'matk' : s === '最大生命值' ? 'maxHp' : s === '物理攻击力' ? 'patk' : (t === '法术' ? 'matk' : 'patk');
  const re = /(?:(\d+)\+)?(\d+)%(物理攻击力|法术攻击力|最大生命值)?的?(物理|法术|真实)伤害/g;
  let m;
  while ((m = re.exec(txt))) {
    const pre = txt.slice(Math.max(0, m.index - 16), m.index);
    const hm = pre.match(/(\d+)(?:次|支|段|道|发)/);
    const hits = hm ? Math.min(8, +hm[1]) : 1;
    sk.dmg.push({ base: +(m[1] || 0), pct: +m[2] / 100, stat: statOf(m[3], m[4]), type: m[4] === '法术' ? 'mag' : m[4] === '真实' ? 'true' : 'phys', hits });
  }
  const flat = /(\d+)点(物理|法术|真实)伤害/.exec(txt);
  if (!sk.dmg.length && flat) sk.dmg.push({ base: +flat[1], pct: 0, stat: 'patk', type: flat[2] === '法术' ? 'mag' : flat[2] === '真实' ? 'true' : 'phys', hits: 1 });
  const hm = /恢复[^。]*?(?:(\d+)\+)?(\d+)%(物理攻击力|法术攻击力|最大生命值)的?生命值/.exec(txt) || /恢复[^。]*?(\d+)()点生命值/.exec(txt);
  if (hm) { sk.heal = { base: +(hm[1] || 0), pct: hm[2] ? +hm[2] / 100 : 0, stat: statOf(hm[3], h.g[2] > 0 ? '法术' : '物理') }; sk.allyHeal = /友军|友方|己方|队友/.test(txt); }
  const sm = /(?:(\d+)\+)?(\d+)%(物理攻击力|法术攻击力|最大生命值)的护盾/.exec(txt) || /(\d+)()点护盾/.exec(txt);
  if (sm) { sk.shield = { base: +(sm[1] || 0), pct: sm[2] ? +sm[2] / 100 : 0, stat: statOf(sm[3]) }; sk.allyShield = /友军|友方|己方|队友/.test(txt.slice(0, txt.indexOf('护盾'))); }
  const rm = /(?:周围|附近|范围|半径)(\d+)格/.exec(txt) || /(\d+)格内的?敌人/.exec(txt);
  if (rm) sk.radius = Math.min(3, +rm[1]);
  else if (/周围|附近|范围|密集|扇形|圆形/.test(txt)) sk.radius = 1;
  if (/全场|所有敌人|全体敌人|全部敌人/.test(txt)) sk.radius = 99;
  if (/沿途|直线|一排|前方/.test(txt) && !sk.radius) sk.radius = 1;
  const mm = /(\d+)(?:名|个)敌人/.exec(txt); if (mm && !sk.radius) sk.multi = Math.min(6, +mm[1]);
  const st = /(?:眩晕|冻结|击飞|晕眩|禁锢|定身|压制)[^。，]*?(\d+(?:\.\d+)?)秒/.exec(txt);
  if (st) sk.stun = Math.min(3, +st[1]); else if (/眩晕|冻结|击飞|晕眩|禁锢|压制/.test(txt)) sk.stun = 0.6;
  if (/召唤/.test(txt) && !/图腾/.test(txt)) sk.summon = true;
  const am = /(?:提升|增加|获得)[^。]*?(\d+)%攻击速度/.exec(txt) || /攻击速度(?:提升|增加)(\d+)%/.exec(txt);
  if (am) sk.aspdBuff = +am[1] / 100;
  if (/最远|后排|跃向|突袭|冲向/.test(txt)) sk.far = true;
  const e40 = (h.sk && h.sk.e || []).find(e => e[0] === 40);
  if (e40 && /复生|复活/.test(e40[1])) sk.revive40 = true;
  if (!sk.dmg.length && !sk.heal && !sk.shield && !sk.summon && !sk.aspdBuff) sk.dmg.push({ base: 80, pct: 1, stat: h.g[2] > 0 ? 'matk' : 'patk', type: h.g[2] > 0 ? 'mag' : 'phys', hits: 1 });
  SKILL_CACHE[h.id] = sk;
  return sk;
}
const skillMult = lv => lv >= 100 ? 2.3 : lv >= 40 ? 1.7 : lv >= 10 ? 1.3 : 1;

// ---------------- 装备战斗效果 ----------------
const EQFX = {
  '贤者之书': { cast(b) { if ((b.sage = (b.sage || 0) + 1) <= 6) b.matk += Math.round(b._s.matk * 0.2); } },
  '红魔': { init(b) { b.amp += 0.25; } },
  '制裁之剑': { attack(b, t) { t.healCut = 0.7; } },
  '纯净苍穹': { tick(b, dt) { b.cp = (b.cp || 0) + dt; if (b.cp >= 2) { b.cp -= 2; b.matk += 10; b.stunT = 0; } } },
  '御灵之纱': { init(b, B) { B.shield(b, b.lv * 15, 99); }, broke(b, B) { B.enemiesOf(b).filter(e => B.dist(e, b) <= 1).forEach(e => B.stun(e, 1, b)); } },
  '魔律之刃': { cast(b, B) { if (!b.echo && U.chance(0.35 + b.lv / 700)) { b.echo = true; B.cast(b, true); b.echo = false; } } },
  '名刀·司命': { lethal(b) { if (b.mingdao) return false; b.mingdao = true; b.hp = 1; b.inv = 1.5; return true; } },
  '日渊': { attack(b, t, B) { U.sample(B.enemiesOf(b), 2).forEach(e => B.hit(b, e, b.patk * 0.45, 'phys', { noMana: true })); } },
  '生命魔典': { hurt(b, s, d, B) { if ((b.smcd || 0) > B.t) return; b.smcd = B.t + 2; B.alliesOf(b).filter(a => B.dist(a, b) <= 1).concat([b]).forEach(a => B.heal(a, a.maxHp * 0.05)); } },
  '痛苦面具': { dealt(b, t, d, type, B) { if (type === 'mag' && d > t.maxHp * 0.08) t.burn = { dps: b.matk * 0.75, t: 3, src: b }; } },
  '法源之杯': { tick(b, dt) { b.mp += 5 * dt; } },
  '破茧之衣': { init(b, B) { b.mp += 15; const e = U.pick(B.enemiesOf(b).sort((x, y) => y.lv - x.lv).slice(0, 3)); e && B.stun(e, Math.min(5, 1 + Math.floor(e.lv / 10) * 0.5), b); } },
  '聚灵水晶': { hurt(b) { if ((b.jl = (b.jl || 0) + 10) === 100) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.2); if (b.jl <= 100) b.mp += 10; } },
  '炽热支配者': { stunned(b, B) { if (b.czt) return; b.czt = true; B.shield(b, 300, 15); b.ccImmune = B.t + 15; } },
  '霸者重铠': { tick(b) { b.bzdr = b.hp > b.maxHp * 0.7 ? 0.4 : 0; } },
  '魔女斗篷': { init(b, B) { B.shield(b, b.lv * 5, 99); } },
  '红莲炎甲': { tick(b, dt, B) { b.hl = (b.hl || 0) + dt; if (b.hl >= 2) { b.hl -= 2; B.enemiesOf(b).filter(e => B.dist(e, b) <= 1).forEach(e => B.hit(b, e, 20 + b.maxHp * 0.05, 'mag', { noMana: true })); } } },
  '金色圣剑': { init(b) { b.aspd *= 1.3; }, attack(b, t, B) { B.hit(b, t, 20 + b.matk * 0.3, 'mag', { noMana: true }); } },
  '近卫荣耀': { init(b, B) { b.pdef += 20; b.mdef += 20; B.alliesOf(b).filter(a => B.dist(a, b) <= 1).forEach(a => { a.pdef += 10; a.mdef += 10; }); } },
  '反伤重甲': { hurt(b, s, d, B) { if (s && s.alive && !s.reflecting) { b.reflecting = true; B.hit(b, s, d * 0.3, 'true', { noMana: true }); b.reflecting = false; } } },
  '铸梦·逐风': { tick(b, dt) { b.zf = (b.zf || 8) + dt; if (b.zf >= 8) { b.zf -= 8; b.burst = 4; } } },
  '灵泉法杖': { init(b) { b.flashNow = true; } },
  '鼓舞之戒': { init(b, B) { B.unitsOf(b.side).filter(a => a.h && a.h.camp === b.h.camp).forEach(a => { a.maxHp *= 1.3; a.hp *= 1.3; }); } },
  '梦魇之牙': { dealt(b, t, d, type) { if (type === 'mag') t.nightmare = b; } },
  '末世': { attack(b, t, B) { B.hit(b, t, t.maxHp * (b.melee ? 0.04 : 0.02), 'phys', { noMana: true }); } },
  '唤鹰骨笛': { tick(b, dt, B) { b.hy = (b.hy || 0) + dt; if (b.hy >= 8) { b.hy -= 8; B.summon(b.side, { name: '云中君', lv: Math.ceil(b.lv / 2), hp: 250, patk: 36, g: [26, 2], range: 1, color: '#6ad0c2' }, b.r, b.c, B.P[b.side]); } } },
  '苍穹王权': { lethal(b, B) { if (b.cq) return false; b.cq = true; b.inv = 1; B.enemiesOf(b).forEach(e => B.hit(b, e, 100 + b.maxHp * 0.3, 'mag', { noMana: true })); b.hp = Math.max(1, b.hp); return true; } },
  '永冻霜羽': { dealt(b, t, d, type, B) { if (type === 'mag') { t.frozenBy = t.frozenBy || new Set(); if (!t.frozenBy.has(b.id)) { t.frozenBy.add(b.id); B.stun(t, 2, b); } } } },
  '破妄之刃': { init(b) { b.truePct = 0.5; } },
  '强敌克星': { init(b) { b.truePct = Math.max(b.truePct || 0, 0.15); }, attack(b, t, B) { if ((b.qd = (b.qd || 0) + 1) % 4 === 0) B.stun(t, 1, b); } },
  '破阵战芒': { init(b) { const k = Math.min(0.5, b.lv / 100); b.amp += k; b.aspd *= 1 + k; } },
  '三分旗帜': { dealt(b, t, d, type, B) { const al = B.unitsOf(b.side).filter(a => a.h && a.h.camp === '三分之地'); al.forEach(a => B.heal(a, d * 0.3 / al.length, true)); } },
  '法潮灵杖': { init(b, B) { B.unitsOf(b.side).filter(a => a !== b && a.r === b.r && Math.abs(a.c - b.c) === 1).forEach(a => b.matk += a.matk); } },
  '护命灵珠': { tick(b, dt, B) { b.hm = (b.hm || 4) + dt; if (b.hm >= 4) { b.hm -= 4; B.shield(b, b.maxHp * 0.25, 99); } b.hmAmp = b.shieldV > 0 ? 0.25 : 0; } },
  '光辉圣铠': { tick(b, dt, B) { B.heal(b, (50 + b.maxHp * 0.04) * dt, true); } },
  '魂祭绝刃': { init(b) { b.hp *= 0.5; } },
  '灵泉项链': { tick(b, dt, B) { B.alliesOf(b).filter(a => B.dist(a, b) <= 1).concat([b]).forEach(a => a.mp += 4 * dt); } },
  '魂灭灵冠': { death(b, B) { B.enemiesOf(b).filter(e => B.dist(e, b) <= 1).forEach(e => B.hit(b, e, e.maxHp * 0.35, 'true', { noMana: true })); } },
  '怒神项链': { init(b) { b.magCrit = true; } },
  '掠魂爪': { attack(b, t, B) { B.hit(b, t, t.hp * 0.08, 'phys', { noMana: true }); } },
  '翼苍穹盾': { enemyDied(b) { if ((b.ycq = (b.ycq || 0) + 10) <= 90) { b.pdef += 10; b.mdef += 10; } } },
  '流云之刺': { attack(b, t, B) { if ((b.ly = (b.ly || 0) + 1) % 3 === 0) { B.hit(b, t, t.maxHp * 0.04, 'phys', { noMana: true }); t.pdef = Math.max(0, t.pdef - 5); } } },
  '驱雷': { tick(b, dt, B) { b.ql = (b.ql || 0) + dt; if (b.ql >= 2) { b.ql -= 2; U.sample(B.units.filter(x => x.alive && x !== b && !x.totem), 2).forEach(x => x.h && x.h.name === '司空震' ? (x.burst = 4) : B.hit(b, x, x.maxHp * 0.3, 'mag', { noMana: true, noLs: x.side === b.side })); } } },
  '机器头': { init(b) { b.fixedAspd = 0.4; b.ccImmune = 999; } },
  '阿科米亚之子': { tick(b, dt, B) { B.alliesOf(b).filter(a => B.dist(a, b) <= 1).concat([b]).forEach(a => { a.mp += 4 * dt; B.heal(a, a.maxHp * 0.02 * dt, true); }); } },
  '磐石之心': { init(b) { b.capHit = 0.15; } },
  '征服之剑': { tick(b) { b.lsBonus = b.hp < b.maxHp * 0.5 ? 0.3 : 0; } },
  '百锻刀': { kill(b) { if (b.src) b.src.st.forgeAtk = (b.src.st.forgeAtk || 0) + 5; } },
  '聚灵法杖': { attack(b, t, B) { B.hit(b, t, b.matk * 0.7, 'mag', { noMana: true }); }, kill(b) { if (b.src) b.src.st.forgeMatk = (b.src.st.forgeMatk || 0) + 5; } },
  '静谧之铃': { init(b, B) { b.bell = B.enemiesOf(b).sort((x, y) => y.lv - x.lv).slice(0, 2); b.bell.forEach(e => e.silencedBy = b); } },
  '分身镜': { init(b, B) { const c = B.cloneUnit(b, b.side, true); if (c) { c.frail = 3.5; c.name = b.name + '(镜)'; } } },
  '捕能手套': { kill(b, B) { if (B.P[b.side] && !B.P[b.side].ghost) B.P[b.side].pending.energy = (B.P[b.side].pending.energy || 0) + 1; } },
  '热血拳套': { tick(b) { b.hxAspd = Math.min(4, (b.mpGained || 0) / 200); } },
  '双剑·雌': { kill(b, B) { if (b.src && b.h) G.lvUp(B.P[b.side], b.src, b.h.name === '干将莫邪' ? 2 : 1); } },
  '方天画戟': { cast(b) { b.mpMax = Math.max(10, b.mpMax - 10); if (b.h.name === '吕布') b.skillTrue = true; } },
  '霸王戟': { tick(b, dt) { b.patk += 10 * dt; }, lethal(b, B) { if (b.h.name !== '项羽' || b.bwj) return false; b.bwj = true; const d = b.patk * 2; B.enemiesOf(b).filter(e => B.dist(e, b) <= 1).forEach(e => B.hit(b, e, d, 'phys')); b.hp = Math.min(b.maxHp, d); return true; } },
  '玄微之种': { death(b, B) { const a = U.minBy(B.alliesOf(b), x => x.hp / x.maxHp); a && B.heal(a, 200 + a.maxHp * 0.2); } },
  '火鹰合金盾': { init(b) { b.dr += 0.2; } },
  '火鹰狩枪': { init(b) { b.execute = 0.1; } },
  '火鹰装甲': { cast(b, B) { b.ccImmune = Math.max(b.ccImmune || 0, B.t + 2); } },
  '月神': { hurt(b) { if (!b.ys && b.hp < b.maxHp * 0.3 && b.hp > 0) { b.ys = true; b.inv = 2; b.mp += 60; } } },
  '贤者的庇护': { init(b) { b.revive = (b.revive || 0) + 1; b.reviveFrac = 0.3; } },
  '停滞漩涡': { tick(b, dt, B) { B.enemiesOf(b).forEach(e => { if (e.stunT > 0) { const k = 0.05 * dt; b.patk += e.patk * k; b.matk += e.matk * k; e.patk *= 1 - k; e.matk *= 1 - k; } }); } },
  '机关匣': { init(b, B) { const top = U.maxBy(B.unitsOf(b.side).filter(x => x.src), x => x.lv); for (let i = 0; i < 2; i++) B.summon(b.side, { name: '故障机器人', lv: Math.ceil((top ? top.lv : 1) / 2), hp: 300, patk: 34, g: [34, 2], range: 1, color: '#c9a36a' }, b.r, b.c, B.P[b.side]); } },
  '寒霜侵袭': { attack(b, t, B) { t.frost = (t.frost || 0) + 1; if (t.frost === 5) { t.vuln = B.t + 5; } } },
  '破晓': { attack(b, t, B) { t.pdef = Math.max(0, t.pdef - 3); if (t.pdef === 0 && !t.px) { t.px = true; B.hit(b, t, t.maxHp * 0.15, 'phys', { noMana: true }); } } },
  '断念': { dealt(b, t) { if (!t.dn) { t.dn = true; t.maxHp *= 0.8; t.hp = Math.min(t.hp, t.maxHp); } } },
  '不屈意志': { tick(b, dt, B) { b.bq = (b.bq == null ? 3 : b.bq) + dt; if (b.bq >= 3) { b.bq -= 3; const n = B.unitsOf(b.side).filter(a => a.equips.includes('不屈意志')).length; B.addTemp(b, n * 2); } } },
  '冥王': { tick(b, dt, B) { const n = B.enemiesOf(b).filter(e => B.dist(e, b) <= 1).length; if (n !== b.mw) { const d = (n - (b.mw || 0)); b.pdef += 10 * d; b.patk += b._s.patk * 0.15 * d; b.mw = n; } } },
  '自然法杖': { cast(b, B) { b.zr = (b.zr || 0) + b.mpMax; const need = b.melee ? 80 : 40; while (b.zr >= need) { b.zr -= need; const e = U.pick(B.enemiesOf(b)); e && B.stun(e, 2, b); } } },
  '凝渊': { hurt(b) { b.crit = Math.min(1, b.crit + 0.01); } },
  '不祥征兆': { init(b) { b.omen = 15; } },
  '极寒风暴': { hurt(b, s, d, B, basic) { if (basic && s) s.slowT = B.t + 2; } },
};

// ---------------- 战斗实例 ----------------
let BID = 1;
class Battle {
  constructor(bt) {
    this.bt = bt; this.P = [bt.a, bt.b]; this.t = 0; this.over = false; this.units = []; this.fx = []; this.turret = {}; this.kills = [0, 0]; this.flashKills = [0, 0];
    this.grid = Array.from({ length: AR }, () => new Array(AC).fill(null));
    B.cur = this;
    G.preBattle(bt.a, bt.b); G.preBattle(bt.b, bt.a);
    for (let side = 0; side < 2; side++) {
      const p = this.P[side];
      p.board.forEach((u, i) => {
        if (!u) return;
        const r = Math.floor(i / 7), c = i % 7;
        const ar = side === 0 ? 4 + r : 3 - r, ac = side === 0 ? c : 6 - c;
        this.addHero(side, u, ar, ac, r, c);
      });
    }
    // 闪现：开战瞬间跃至敌方镜像位置
    for (const b of this.units.slice()) {
      if (!b.h || !(hasKw(b.h, '闪现') || b.flashNow)) continue;
      const tr = b.side === 0 ? b.br : AR - 1 - b.br, tc = b.c;
      const cell = this.freeNear(tr, tc); if (!cell) continue;
      this.place(b, cell[0], cell[1]); b.isFlash = true; b.fx = { t: 0.4, kind: 'flash' };
    }
    // 图腾
    for (let side = 0; side < 2; side++) {
      const p = this.P[side]; if (p.rc.noTotem) continue;
      G.totems(p).forEach((t, i) => {
        const col = t.name === '先知图腾' ? '#e0b24a' : t.name === '因缘图腾' ? '#ff8fb3' : '#8b7bff';
        const bu = this.mkUnit(side, { name: t.name, lv: t.lv, maxHp: 1, patk: 0, matk: 0, pdef: 0, mdef: 0, aspd: 0, range: 0, mpMax: 100, mp0: 0, color: col });
        bu.totem = true; bu.totemName = t.name; bu.r = -1; bu.c = i; bu.tcd = 0;
        this.units.push(bu);
      });
    }
    // 英雄开战效果
    for (const b of this.units.slice()) if (b.src && !b.summon) this.heroHook(b, 'bInit', b, this);
    for (let side = 0; side < 2; side++) {
      const p = this.P[side];
      p.talents.forEach(tn => { const t = TALENT_MAP[tn]; t && t.bSetup && G.guard(() => t.bSetup(p, t, this, side)); });
      const M = MASTERS[p.mk]; M && M.bSetup && G.guard(() => M.bSetup(p, this, side));
      // 移花接木
      if (p.rc.graft) {
        const top = U.maxBy(this.unitsOf(1 - side).filter(x => x.src && !x.summon), x => x.lv);
        const me = U.pick(this.unitsOf(side).filter(x => x.src && !x.summon));
        if (top && me) this.addTemp(me, Math.floor(top.lv / 2));
        p.rc.graft = false;
      }
    }
    for (const b of this.units.slice()) for (const e of b.equips) EQFX[e] && EQFX[e].init && EQFX[e].init(b, this);
    for (const b of this.units) { if (b.qimou) b.mp = b.mpMax; b.hp = Math.min(b.hp, b.maxHp); }
  }

  mkUnit(side, s) {
    return Object.assign({
      id: BID++, side, alive: true, hp: s.maxHp, shieldV: 0, shields: [], mp: s.mp0 || 0, atkT: 0, moveT: 0, stunT: 0, kills: 0,
      crit: 0.05, critDmg: 1.5, ls: 0, amp: 0, dr: 0, equips: [], revive: 0, dmgDone: 0, x: 0, y: 0, buffs: [],
    }, s);
  }
  addHero(side, u, ar, ac, br, bc) {
    const s = G.stats(u), h = HD[u.hid];
    const b = this.mkUnit(side, Object.assign({}, s, { name: h.name, h, src: u, br, bc, equips: u.equips.slice(), melee: h.melee, color: CAMP_COLOR[h.camp][1] }));
    b._s = s; b.sk = parseSkill(h);
    b.revive = u.revive || 0;
    if (b.sk.revive40 && s.lv >= 40) { b.revive++; b.reviveFrac = s.lv >= 100 ? 1 : 0.5; }
    if (u.rnd.shield) this.shield(b, u.rnd.shield, 99);
    if (u.rnd.qimou) b.qimou = true;
    if (u.rnd.rush) b.rush = 15;
    if (u.st.edge) { b.crit += 0.22; b.ls += 0.11; }
    u._bu = b; b.B = this;
    this.units.push(b); this.place(b, ar, ac); b.x = b.c; b.y = b.r;
    return b;
  }
  place(b, r, c) {
    if (b.r != null && b.r >= 0 && this.grid[b.r] && this.grid[b.r][b.c] === b) this.grid[b.r][b.c] = null;
    b.r = r; b.c = c; this.grid[r][c] = b;
  }
  freeNear(r, c) {
    for (let d = 0; d < 8; d++) {
      const cs = [];
      for (let i = -d; i <= d; i++) for (let j = -d; j <= d; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== d) continue;
        const rr = r + i, cc = c + j;
        if (rr >= 0 && rr < AR && cc >= 0 && cc < AC && !this.grid[rr][cc]) cs.push([rr, cc]);
      }
      if (cs.length) return U.pick(cs);
    }
    return null;
  }

  // ---------- 查询 ----------
  unitsOf(side) { return this.units.filter(x => x.side === side && x.alive); }
  alliesOf(b) { return this.units.filter(x => x.side === b.side && x.alive && x !== b && !x.totem); }
  enemiesOf(b) { return this.units.filter(x => x.side !== b.side && x.alive && !x.totem && !(x.inv > 0 && x.untarget)); }
  dist(a, b) { return Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)); }
  heroHook(b, evt, ...args) {
    if (!b.src || !b.h) return;
    const fx = HERO_FX[b.h.name]; if (!fx || !fx[evt]) return;
    const p = this.P[b.side];
    G.guard(() => fx[evt](p, b.src, G.mOf(b.src), ...args));
  }
  broadcast(side, evt, ...args) {
    for (const a of this.units.filter(x => x.side === side && x.src && !x.summon)) {
      const fx = HERO_FX[a.h.name]; if (!fx || !fx[evt]) continue;
      if (!a.alive && evt !== 'bSacrifice') continue;
      const p = this.P[side];
      G.guard(() => fx[evt](p, a.src, G.mOf(a.src), args[0], a, this, args[1]));
    }
  }
  eq(b, k, ...args) { let r = false; for (const e of b.equips) if (EQFX[e] && EQFX[e][k]) r = EQFX[e][k](b, ...args) || r; return r; }

  // ---------- 行为 ----------
  relevel(b) {
    if (!b || !b.src || !b.alive) return;
    const s = G.stats(b.src), o = b._s;
    for (const k of ['maxHp', 'patk', 'matk', 'pdef', 'mdef']) b[k] += s[k] - o[k];
    if (s.maxHp > o.maxHp) b.hp += s.maxHp - o.maxHp;
    b.hp = Math.min(b.hp, b.maxHp);
    if (o.aspd > 0) b.aspd *= s.aspd / o.aspd;
    b.lv = s.lv; b._s = s;
    if (b.sk && b.sk.revive40 && s.lv >= 40 && !b.rv40) { b.rv40 = true; if (!b.revived) { b.revive++; b.reviveFrac = 0.5; } }
    this.pop(b, 'Lv' + s.lv, '#ffe066', 0.7);
  }
  addTemp(b, n) {
    if (!n) return;
    if (b.src && !b.summon) G.lvUp(this.P[b.side], b.src, n, true);
    else { const k = n; b.lv += k; b.maxHp += (b.g ? b.g[0] : 20) * k; b.hp += (b.g ? b.g[0] : 20) * k; b.patk += (b.g ? b.g[1] : 1.5) * k; }
  }
  shield(b, v, dur) { if (!b.alive || v <= 0) return; v *= b.equips.includes('不死鸟之眼') ? 1.3 : 1; b.shields.push({ v, until: this.t + dur }); b.shieldV += v; }
  heal(b, v, quiet) {
    if (!b.alive || v <= 0) return;
    v *= (b.equips.includes('不死鸟之眼') ? 1.3 : 1) * (1 - (b.healCut || 0));
    const before = b.hp; b.hp = Math.min(b.maxHp, b.hp + v);
    if (!quiet && b.hp - before > 1) this.pop(b, '+' + Math.round(b.hp - before), '#6dff8a');
  }
  stun(t, sec, src) {
    if (!t.alive || t.totem || (t.ccImmune || 0) > this.t) return;
    if (t.fixedAspd && t.ccImmune) return;
    t.stunT = Math.max(t.stunT, sec);
    this.eq(t, 'stunned', this);
    this.fx.push({ kind: 'stun', b: t, t: sec });
    if (src && src.side !== t.side) this.broadcast(src.side, 'bControl', t);
  }
  hit(src, t, dmg, type, opt = {}) {
    if (!t || !t.alive || t.totem || dmg <= 0) return 0;
    if (t.inv > 0) return 0;
    let d = dmg * DMG_SCALE;
    if (src) {
      d *= 1 + (src.amp || 0) + (src.hmAmp || 0);
      if (src.truePct && type !== 'true') { const tp = d * src.truePct; this.hit(src, t, tp, 'true', { noMana: true, noHook: true, noLs: opt.noLs }); d -= tp; }
    }
    if (opt.basic && src && U.chance(src.crit)) { d *= src.critDmg; opt.crit = true; }
    else if (!opt.basic && src && src.magCrit && type === 'mag' && U.chance(src.crit)) { d *= src.critDmg; opt.crit = true; }
    if (type === 'phys') d *= 100 / (100 + Math.max(0, t.pdef));
    else if (type === 'mag') d *= 100 / (100 + Math.max(0, t.mdef - (src && src.equips.includes('虚无法杖') ? 15 : 0)));
    d *= Math.max(0.1, 1 - (t.dr || 0) - (t.bzdr || 0));
    if ((t.vuln || 0) > this.t) d *= 1.2;
    if (t.frail) d *= t.frail;
    if (opt.basic && t.omen && this.t < t.omen) d *= src && src.aspd > 1.5 ? 0.3 : 0.5;
    if (t.capHit) d = Math.min(d, t.maxHp * t.capHit);
    // 护盾
    let absorbed = 0;
    while (d > 0 && t.shields.length) {
      const s = t.shields[0], k = Math.min(s.v, d);
      s.v -= k; d -= k; absorbed += k; t.shieldV -= k;
      if (s.v <= 0.01) { t.shields.shift(); this.onShieldBreak(t); }
    }
    t.hp -= d;
    const total = d + absorbed;
    if (src) {
      src.dmgDone += total;
      const ls = (src.ls || 0) + (src.lsBonus || 0);
      if (ls > 0 && !opt.noLs && src.alive) this.heal(src, total * ls, true);
      if (!opt.noHook) this.eq(src, 'dealt', t, total, type, this);
      if (opt.basic && !opt.noHook) this.eq(src, 'attack', t, this);
    }
    if (!opt.noMana) { t.mp += 3; t.mpGained = (t.mpGained || 0) + 3; }
    if (!opt.noHook) this.eq(t, 'hurt', src, total, this, opt.basic);
    if (total >= 1) this.pop(t, Math.round(total) + (opt.crit ? '!' : ''), type === 'mag' ? '#7fb6ff' : type === 'true' ? '#fff' : opt.crit ? '#ff9f1a' : '#ffd0a0', opt.crit ? 1.2 : 0.9);
    if (src && src.execute && !opt.basic && t.hp > 0 && t.hp < t.maxHp * src.execute) t.hp = 0;
    if (t.hp <= 0) this.die(t, src);
    return total;
  }
  onShieldBreak(t) {
    this.eq(t, 'broke', this);
    if (t.hmAmp) t.hmAmp = 0;
    this.broadcast(t.side, 'bShieldBreak', t);
  }
  die(b, killer) {
    if (!b.alive) return;
    if (this.eq(b, 'lethal', this)) return;
    if (b.revive > 0) {
      b.revive--; b.revived = true; b.hp = b.maxHp * (b.reviveFrac || 0.5); b.inv = 0.8; b.stunT = 0;
      this.pop(b, '复生', '#ffe066', 1.3); this.fx.push({ kind: 'ring', r: b.r, c: b.c, t: 0.6, col: '#ffe066', rad: 1 });
      if (b.h && b.h.name === '苏烈' && b.lv >= 100) { this.enemiesOf(b).filter(e => this.dist(e, b) <= 1).forEach(e => { this.stun(e, 1, b); this.hit(b, e, b.maxHp * 0.1, 'phys'); }); }
      return;
    }
    b.alive = false; b.hp = 0;
    if (this.grid[b.r] && this.grid[b.r][b.c] === b) this.grid[b.r][b.c] = null;
    if (killer && killer.side !== b.side) {
      killer.kills++; this.kills[killer.side]++;
      if (killer.isFlash) this.flashKills[killer.side]++;
      if (b.src && !b.summon) this.eq(killer, 'kill', this);
      if (b.zhongkui && !killer.zkHit && killer.alive) { killer.zkHit = true; this.addTemp(killer, -Math.ceil(killer.lv * 0.1)); }
      if (b.nightmare) { const nm = b.nightmare; this.enemiesOf(nm).filter(e => this.dist(e, b) <= 1).forEach(e => this.hit(nm, e, nm.matk * 2, 'mag', { noMana: true })); }
    }
    for (const x of this.units) if (x.alive && x.side !== b.side) this.eq(x, 'enemyDied', this);
    this.eq(b, 'death', this);
    this.fx.push({ kind: 'die', r: b.r, c: b.c, t: 0.6, col: b.color });
    const p = this.P[b.side];
    if (b.src && !b.summon) {
      let sac = false;
      if (G.hasFx(b.src, 'death')) { G.trigger(p, b.src, 'death', { B: this, bu: b }); sac = true; }
      if (b.zhongkui || b.equips.includes('玄微之种')) { sac = true; if (!G.hasFx(b.src, 'death')) G.fire(p, 'onSacrifice', b.src); }
      if (sac) { this.broadcast(b.side, 'bSacrifice', b); this.pop(b, '牺牲', '#ff6b6b', 1.1); }
    } else if (b.summon) this.broadcast(b.side, 'bSummonDeath', b);
  }
  summon(side, spec, r, c, p) {
    const cell = this.freeNear(r < 0 ? (side === 0 ? 6 : 1) : r, c < 0 ? 3 : c); if (!cell) return null;
    let lv = Math.max(1, Math.round(spec.lv || 1));
    const ml = this.units.filter(x => x.side === side && x.alive && x.src && !x.summon && x.h.name === '米莱狄');
    ml.forEach(x => lv += (x.src && x.src.st.summonTemp) || 3);
    const k = lv - 1, g = spec.g || [20, 1.5];
    const b = this.mkUnit(side, {
      name: spec.name, lv, maxHp: spec.hp + g[0] * k, patk: spec.patk + g[1] * k, matk: 0, pdef: spec.pdef || 15, mdef: spec.mdef || 15,
      aspd: spec.aspd || 0.8, range: spec.range || 1, mpMax: 9999, mp0: 0, melee: (spec.range || 1) <= 1, color: spec.color || '#aaa', g, summon: true, taunt: spec.taunt,
    });
    b.hp = b.maxHp;
    this.units.push(b); this.place(b, cell[0], cell[1]); b.x = b.c; b.y = b.r;
    if (p) p.cnt.summons = (p.cnt.summons || 0) + 1;
    this.fx.push({ kind: 'ring', r: b.r, c: b.c, t: 0.5, col: b.color, rad: 0.6 });
    return b;
  }
  cloneUnit(e, side, keepPos) {
    const cell = keepPos ? this.freeNear(e.r, e.c) : this.freeNear(side === 0 ? 6 : 1, e.c); if (!cell) return null;
    const b = this.mkUnit(side, {
      name: e.name, h: e.h, lv: e.lv, maxHp: e.maxHp, patk: e.patk, matk: e.matk, pdef: e.pdef, mdef: e.mdef, aspd: e.aspd, range: e.range, mpMax: e.mpMax, mp0: 0,
      melee: e.melee, color: e.color, sk: e.sk, summon: true, crit: e.crit, critDmg: e.critDmg,
    });
    b.hp = b.maxHp; this.units.push(b); this.place(b, cell[0], cell[1]); b.x = b.c; b.y = b.r;
    this.fx.push({ kind: 'ring', r: b.r, c: b.c, t: 0.5, col: '#b48cff', rad: 0.7 });
    return b;
  }
  addEquipFx(b, name, dur) {
    const e = QD[name]; if (!e) return;
    const st = e.stats || {};
    if (st.critical_rate) b.crit += st.critical_rate / 100;
    if (st.attack_speed_pct) b.aspd *= 1 + st.attack_speed_pct / 100;
    if (st.physical_attack) b.patk += st.physical_attack < 1 ? b.patk * st.physical_attack : Math.min(80, st.physical_attack);
    if (st.magical_attack) b.matk += st.magical_attack < 1 ? b.matk * st.magical_attack : Math.min(80, st.magical_attack);
    if (st.magical_defense) b.mdef += st.magical_defense;
    if (!b.equips.includes(name)) { b.equips.push(name); EQFX[name] && EQFX[name].init && EQFX[name].init(b, this); }
  }
  aoe(side, r, c, rad, dmg, type, src) {
    this.units.filter(x => x.alive && !x.totem && x.side !== side && Math.max(Math.abs(x.r - r), Math.abs(x.c - c)) <= rad).forEach(x => this.hit(src, x, dmg, type, { noMana: true }));
    this.fx.push({ kind: 'ring', r, c, t: 0.4, col: type === 'mag' ? '#7fb6ff' : '#ffb36b', rad: rad + 0.5 });
  }
  pop(b, text, col, sz = 1) { if (this.headless) return; this.fx.push({ kind: 'text', x: b.x, y: b.y, text, col, t: 0.9, sz, dx: (Math.random() - 0.5) * 0.5 }); }

  target(b) {
    const es = this.enemiesOf(b); if (!es.length) return null;
    const taunt = es.filter(e => e.taunt && this.dist(e, b) <= 2);
    if (taunt.length) return U.minBy(taunt, e => this.dist(e, b));
    if (b.tgt && b.tgt.alive && this.dist(b.tgt, b) <= b.range) return b.tgt;
    if (b.sk && b.sk.far && b.jumped == null) { b.jumped = true; }
    return U.minBy(es, e => this.dist(e, b) * 100 + e.hp / e.maxHp);
  }
  step(dt) {
    if (this.over) return;
    this.t += dt;
    for (const b of this.units) {
      if (!b.alive) continue;
      if (b.inv > 0) b.inv -= dt;
      for (let i = b.shields.length - 1; i >= 0; i--) if (b.shields[i].until < this.t) { b.shieldV -= b.shields[i].v; b.shields.splice(i, 1); }
      if (b.burn) { b.burn.t -= dt; this.hit(b.burn.src, b, b.burn.dps * dt, 'true', { noMana: true, noHook: true }); if (b.burn && b.burn.t <= 0) b.burn = null; if (!b.alive) continue; }
      if (b.totem) { this.totemTick(b, dt); continue; }
      this.eq(b, 'tick', dt, this);
      if (b.src && !b.summon) this.heroHook(b, 'bTick', b, this, dt);
      if (b.buffs.length) b.buffs = b.buffs.filter(f => { if (f.until < this.t) { b.aspd /= 1 + f.aspd; return false; } return true; });
      if (b.rush > 0) b.rush -= dt;
      if (b.stunT > 0) { b.stunT -= dt; continue; }
      const t = this.target(b); if (!t) continue;
      b.tgt = t;
      const d = this.dist(b, t);
      // 技能
      if (b.mp >= b.mpMax && b.mpMax < 9999 && !(b.silencedBy && b.silencedBy.alive && (b.silT || 0) > this.t)) { this.cast(b); continue; }
      if (b.rush > 0 && b.mpMax < 9999) { b.rushCd = (b.rushCd || 0) - dt; if (b.rushCd <= 0) { b.rushCd = 0.9; this.cast(b); continue; } }
      if (d <= b.range) {
        const as = b.fixedAspd || Math.min(b.equips.includes('热血拳套') ? 5 : 2.5, b.aspd * (1 + (b.hxAspd || 0)) * ((b.slowT || 0) > this.t ? 0.8 : 1)) * 1.35;
        b.atkT += dt;
        if (b.burst > 0 && b.atkT >= 0.15) { b.burst--; b.atkT = 0; this.attack(b, t); }
        else if (as > 0 && b.atkT >= 1 / as) { b.atkT = 0; this.attack(b, t); }
      } else {
        b.moveT += dt;
        if (b.moveT >= 0.42) { b.moveT = 0; this.moveToward(b, t); }
      }
    }
    // 香香的弩炮
    for (const side of [0, 1]) {
      const tr = this.turret[side]; if (!tr) continue;
      tr.t = (tr.t || 0) + dt;
      if (tr.t >= tr.cd) {
        tr.t = 0; const e = U.pick(this.units.filter(x => x.alive && !x.totem && x.side !== side));
        if (e) { const src = { side, amp: 0, crit: 0, critDmg: 1, equips: [], alive: true, dmgDone: 0, ls: 0 }; this.hit(src, e, tr.atk, 'phys', { noMana: true, noHook: true }); if (tr.splash) this.units.filter(x => x.alive && x !== e && x.side !== side && this.dist(x, e) <= 1).forEach(x => this.hit(src, x, tr.atk * 0.4, 'phys', { noMana: true, noHook: true })); this.fx.push({ kind: 'shot', x0: -0.8, y0: side === 0 ? 7 : 0, x1: e.c, y1: e.r, t: 0.25, col: '#ffdd55' }); }
      }
    }
    // 结束判定
    const alive0 = this.units.some(x => x.side === 0 && x.alive && !x.totem);
    const alive1 = this.units.some(x => x.side === 1 && x.alive && !x.totem);
    if (!alive0 || !alive1 || this.t >= TIME_LIMIT) {
      this.over = true;
      if (alive0 && !alive1) this.winner = 0;
      else if (alive1 && !alive0) this.winner = 1;
      else if (!alive0 && !alive1) this.winner = null;
      else {
        const pct = s => { const us = this.units.filter(x => x.side === s && !x.totem); return U.sum(us, x => Math.max(0, x.hp)) / Math.max(1, U.sum(us, x => x.maxHp)); };
        const a = pct(0), b = pct(1); this.winner = Math.abs(a - b) < 0.01 ? null : a > b ? 0 : 1;
      }
    }
    this.fx = this.fx.filter(f => (f.t -= dt) > 0);
  }
  totemTick(b, dt) {
    b.tcd += dt; const L = b.lv;
    if (b.totemName === '先知图腾') { if (b.tcd >= 4) { b.tcd = 0; U.sample(this.alliesOf(b), 2).forEach(a => { a.mp += 20 + L; this.pop(a, '+蓝', '#7fb6ff', 0.7); }); } }
    else if (b.totemName === '因缘图腾') { if (b.tcd >= 3) { b.tcd = 0; const a = U.minBy(this.alliesOf(b), x => x.hp / x.maxHp); a && this.heal(a, 40 + 8 * L); } }
    else { b.mp += 10 * dt; if (b.mp >= 100) { b.mp = 0; U.sample(this.enemiesOf(b), 3).forEach(e => { this.hit(b, e, 60 + 12 * L, 'mag', { noMana: true }); this.fx.push({ kind: 'shot', x0: -0.8, y0: b.side === 0 ? 5 : 2, x1: e.c, y1: e.r, t: 0.3, col: '#b39bff' }); }); } }
  }
  moveToward(b, t) {
    let best = null, bd = this.dist(b, t) + (b.melee ? 0 : 0);
    const cur = Math.abs(b.r - t.r) + Math.abs(b.c - t.c);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (!i && !j) continue;
      const r = b.r + i, c = b.c + j;
      if (r < 0 || r >= AR || c < 0 || c >= AC || this.grid[r][c]) continue;
      const d = Math.max(Math.abs(r - t.r), Math.abs(c - t.c)), m = Math.abs(r - t.r) + Math.abs(c - t.c);
      if (d < bd || (d === bd && m < cur && !best)) { bd = d; best = [r, c]; }
    }
    if (best) this.place(b, best[0], best[1]);
  }
  attack(b, t) {
    b.mp += 10; b.mpGained = (b.mpGained || 0) + 10;
    const mag = b.h && b.h.g[2] > 0 && b.h.tpl.includes('法');
    const dmg = mag ? Math.max(b.matk * 0.6, b.patk) : b.patk;
    if (!this.headless) this.fx.push({ kind: b.range > 1 ? 'shot' : 'slash', x0: b.c, y0: b.r, x1: t.c, y1: t.r, t: 0.2, col: b.side === 0 ? '#9fe3ff' : '#ffb0a0' });
    this.hit(b, t, dmg, mag ? 'mag' : 'phys', { basic: true });
    if (b.botrk && t.alive) this.hit(b, t, t.maxHp * b.botrk, 'mag', { noMana: true, noHook: true });
    if (b.h && b.h.name === '虞姬' && t.alive && U.chance(0.3)) this.hit(b, t, b.patk, 'phys', { basic: true });
  }
  cast(b, echo) {
    const sk = b.sk; if (!sk) { b.mp = 0; return; }
    if (!echo) { b.mp = 0; b.casts = (b.casts || 0) + 1; }
    const mult = skillMult(b.lv);
    const es = this.enemiesOf(b);
    let t = b.tgt && b.tgt.alive ? b.tgt : this.target(b);
    if (sk.far && es.length) t = U.maxBy(es, e => this.dist(e, b));
    this.pop(b, b.h ? b.h.sk.n : '技能', '#ffe8a3', 1);
    if (t && sk.far && b.melee) { const cell = this.freeNear(t.r, t.c); if (cell && Math.max(Math.abs(cell[0] - t.r), Math.abs(cell[1] - t.c)) <= 1) this.place(b, cell[0], cell[1]); }
    // 伤害
    if (sk.dmg.length && t) {
      let targets;
      if (sk.radius >= 99) targets = es;
      else if (sk.radius > 0) targets = es.filter(e => this.dist(e, t) <= sk.radius);
      else if (sk.multi > 1) targets = [t].concat(U.sample(es.filter(e => e !== t), sk.multi - 1));
      else targets = [t];
      for (const d of sk.dmg) {
        const v = (d.base + d.pct * (b[d.stat] || 0)) * mult;
        for (const e of targets) for (let i = 0; i < d.hits; i++) this.hit(b, e, v, b.skillTrue ? 'true' : d.type, { noMana: i > 0 });
      }
      if (!this.headless) this.fx.push({ kind: 'ring', r: t.r, c: t.c, t: 0.45, col: sk.dmg[0].type === 'mag' ? '#6fa8ff' : '#ff9a4a', rad: Math.min(3, sk.radius >= 99 ? 3.5 : sk.radius) + 0.5 });
      if (sk.stun) targets.forEach(e => this.stun(e, sk.stun, b));
    } else if (sk.stun && t) this.stun(t, sk.stun, b);
    if (sk.heal) {
      const v = (sk.heal.base + sk.heal.pct * (b[sk.heal.stat] || 0)) * mult;
      if (sk.allyHeal) { const tg = this.alliesOf(b).concat([b]).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp).slice(0, 3); tg.forEach(a => this.heal(a, v)); }
      else this.heal(b, v);
    }
    if (sk.shield) {
      const v = (sk.shield.base + sk.shield.pct * (b[sk.shield.stat] || 0)) * mult;
      if (sk.allyShield) { const a = U.minBy(this.alliesOf(b).concat([b]), x => x.hp / x.maxHp); this.shield(a, v, 5); }
      else this.shield(b, v, 4);
    }
    if (sk.aspdBuff) { const k = sk.aspdBuff; b.aspd *= 1 + k; b.buffs.push({ aspd: k, until: this.t + 4 }); }
    if (sk.summon) {
      const n = this.units.filter(x => x.alive && x.summoner === b).length;
      if (n < 4) { const s = this.summon(b.side, { name: b.h.name === '蒙恬' ? '玄雍士兵' : (b.h.name + '召唤物').slice(0, 5), lv: b.lv, hp: 180, patk: 22, g: [18, 1.4], range: 1, color: b.color }, b.r, b.c, this.P[b.side]); if (s) s.summoner = b; }
    }
    if (!echo) {
      this.eq(b, 'cast', this);
      this.broadcast(b.side, 'bCast', b);
      const p = this.P[b.side];
      p.talents.forEach(tn => { const tt = TALENT_MAP[tn]; tt && tt.bCastAny && G.guard(() => tt.bCastAny(p, tt, b, this)); });
      this.units.filter(x => x.alive && x.side !== b.side && x.equips.includes('静谧之铃')).forEach(x => { if (x.bell && x.bell.includes(b)) { b.silT = this.t + 5; b.bellSrc = x; } });
    }
  }
  // 结算
  finish() {
    B.cur = null;
    const w = this.winner;
    const survivors = w == null ? 0 : this.units.filter(x => x.side === w && x.alive && !x.totem && !x.summon).length;
    for (const side of [0, 1]) { const p = this.P[side]; if (!p.ghost) { p.ms.flashKills = this.flashKills[side]; } }
    for (const b of this.units) if (b.src && b.equips.includes('百锻刀') && w === b.side) b.src.st.forgeAtk = (b.src.st.forgeAtk || 0) + 5 * b.kills;
    G.resolveBattle(this.bt, { winner: w, kills: this.kills, survivors });
    this.done = true;
  }
}

const B = {
  cur: null,
  relevel(bu) { if (bu && bu.B) bu.B.relevel(bu); },
  simulate(bt) { const b = new Battle(bt); b.headless = true; let n = 0; while (!b.over && n++ < 2000) b.step(DT); b.over = true; b.finish(); return b; },
  // 可视化战斗
  play(bt, canvas, getSpeed, onDone) {
    const b = new Battle(bt); this.view = b;
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const MX = 70, cell = Math.min((W - MX - 10) / AC, (H - 10) / AR);
    const ox = MX + ((W - MX) - cell * AC) / 2, oy = (H - cell * AR) / 2;
    const bg = Art.boardBg(W, H);
    let last = performance.now(), acc = 0, finished = false;
    const X = c => ox + (c + 0.5) * cell, Y = r => oy + (r + 0.5) * cell;
    const draw = () => {
      g.drawImage(bg, 0, 0);
      for (let r = 0; r < AR; r++) for (let c = 0; c < AC; c++) {
        g.fillStyle = r < 4 ? ((r + c) % 2 ? 'rgba(255,90,90,.07)' : 'rgba(255,90,90,.12)') : ((r + c) % 2 ? 'rgba(90,170,255,.07)' : 'rgba(90,170,255,.12)');
        g.fillRect(ox + c * cell + 1, oy + r * cell + 1, cell - 2, cell - 2);
      }
      g.strokeStyle = 'rgba(255,230,160,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(ox, oy + 4 * cell); g.lineTo(ox + AC * cell, oy + 4 * cell); g.stroke();
      // 侧栏：图腾、弩炮
      for (const side of [0, 1]) {
        const ts = b.units.filter(x => x.totem && x.side === side);
        ts.forEach((t, i) => { const y = side === 0 ? oy + cell * AR - (i + 1) * 58 : oy + i * 58 + 4; g.drawImage(Art.summon(t.name, t.color, 96), 8, y, 52, 52); g.fillStyle = '#fff'; g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillText('Lv' + t.lv, 34, y + 64 - 6); });
        if (b.turret[side]) { const y = side === 0 ? oy + cell * AR - ts.length * 58 - 60 : oy + ts.length * 58 + 8; g.drawImage(Art.summon('弩炮', '#d9a441', 96), 8, y, 52, 52); }
      }
      // 单位
      const us = b.units.filter(x => !x.totem && (x.alive));
      for (const u of us) {
        u.x += (u.c - u.x) * 0.3; u.y += (u.r - u.y) * 0.3;
        const px = X(u.x), py = Y(u.y), rad = cell * 0.4;
        g.save();
        g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.closePath();
        g.fillStyle = u.side === 0 ? '#2a78d8' : '#d23a3a'; g.fill();
        g.save(); g.clip();
        const img = u.h ? Art.hero(u.h, 96) : Art.summon(u.name, u.color, 96);
        g.drawImage(img, px - rad, py - rad, rad * 2, rad * 2);
        if (u.stunT > 0) { g.fillStyle = 'rgba(80,80,120,.45)'; g.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
        if (u.inv > 0) { g.fillStyle = 'rgba(255,255,200,.35)'; g.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
        g.restore();
        g.lineWidth = 3; g.strokeStyle = u.side === 0 ? '#5fb0ff' : '#ff6a6a'; if (u.src && u.src.awake) g.strokeStyle = '#ffd34d'; g.stroke();
        g.restore();
        // 血条/护盾/蓝条
        const bw = cell * 0.82, bx = px - bw / 2, by = py - rad - 12;
        g.fillStyle = '#000a'; g.fillRect(bx, by, bw, 9);
        const tot = Math.max(u.maxHp, u.hp + u.shieldV);
        g.fillStyle = u.side === 0 ? '#3bd16f' : '#ff4d4d'; g.fillRect(bx + 1, by + 1, (bw - 2) * Math.max(0, u.hp) / tot, 4);
        if (u.shieldV > 0) { g.fillStyle = '#fff'; g.fillRect(bx + 1 + (bw - 2) * Math.max(0, u.hp) / tot, by + 1, (bw - 2) * u.shieldV / tot, 4); }
        if (u.mpMax < 9999) { g.fillStyle = '#4aa3ff'; g.fillRect(bx + 1, by + 6, (bw - 2) * Math.min(1, u.mp / u.mpMax), 2); }
        g.font = 'bold 11px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillRect(px - 15, py + rad - 8, 30, 13);
        g.fillStyle = '#ffe28a'; g.fillText(u.lv, px, py + rad + 2);
        if (u.stunT > 0) { g.fillStyle = '#ffe066'; g.font = '14px sans-serif'; g.fillText('✦✦', px, py - rad + 4); }
      }
      // 特效
      for (const f of b.fx) {
        g.save();
        if (f.kind === 'shot') { g.strokeStyle = f.col; g.lineWidth = 3; g.globalAlpha = Math.min(1, f.t * 5); g.beginPath(); g.moveTo(f.x0 < 0 ? 34 : X(f.x0), Y(f.y0)); g.lineTo(X(f.x1), Y(f.y1)); g.stroke(); }
        else if (f.kind === 'slash') { g.strokeStyle = f.col; g.lineWidth = 4; g.globalAlpha = f.t * 5; const mx = (X(f.x0) + X(f.x1)) / 2, my = (Y(f.y0) + Y(f.y1)) / 2; g.beginPath(); g.arc(mx, my, cell * 0.25, 0, Math.PI); g.stroke(); }
        else if (f.kind === 'ring') { g.strokeStyle = f.col; g.fillStyle = f.col; g.globalAlpha = Math.min(0.5, f.t); g.beginPath(); g.arc(X(f.c), Y(f.r), cell * f.rad * (1.2 - f.t), 0, Math.PI * 2); g.fill(); }
        else if (f.kind === 'die') { g.fillStyle = f.col; g.globalAlpha = f.t; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, d = (0.6 - f.t) * cell; g.beginPath(); g.arc(X(f.c) + Math.cos(a) * d, Y(f.r) + Math.sin(a) * d, 4, 0, 7); g.fill(); } }
        else if (f.kind === 'text') { g.globalAlpha = Math.min(1, f.t * 2); g.font = `bold ${Math.round(15 * f.sz)}px "Microsoft YaHei",sans-serif`; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = '#000'; const x = X(f.x + f.dx), y = Y(f.y) - cell * 0.4 - (0.9 - f.t) * 40; g.strokeText(f.text, x, y); g.fillStyle = f.col; g.fillText(f.text, x, y); }
        g.restore();
      }
      g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'right';
      g.fillText(`⏱ ${Math.max(0, TIME_LIMIT - b.t).toFixed(1)}s`, W - 12, 22);
    };
    const loop = now => {
      if (finished) return;
      const sp = getSpeed();
      if (sp === 'skip') { while (!b.over) b.step(DT); }
      else {
        acc += Math.min(0.1, (now - last) / 1000) * sp;
        while (acc >= DT && !b.over) { b.step(DT); acc -= DT; }
      }
      last = now;
      draw();
      if (b.over) { finished = true; b.overT = 0; setTimeout(() => { b.finish(); onDone(b); }, sp === 'skip' ? 50 : 900); return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(t => { last = t; loop(t); });
    return b;
  },
};
