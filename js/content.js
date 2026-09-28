// 英雄卡牌词条、效果牌、天赋、棋手、拍卖 —— 均依据官方图鉴文本实现
const isCamp = c => u => HD[u.hid].camp === c || u.asCamp === c;
const hn = u => HD[u.hid].name;
const heroesWith = pred => h => pred(h);
const descHas = k => h => (h.desc || '').includes(k);
const TOTEM_OWNER = { '鬼谷子': '先知图腾', '少司缘': '因缘图腾', '大司命': '往生图腾' };
const TACTICS = ['援护战术', '演练战术', '推演战术', '特训战术', '招募战术'];
const TACTICS_HI = ['高阶援护战术', '高阶演练战术', '高阶推演战术', '高阶特训战术', '高阶招募战术'];
const tacticName = (p, n) => (p.talents.includes('演武') && p.lv >= 5 && TACTICS.includes(n)) ? '高' + '阶' + n : n;
const giveEff = (p, n, extra) => G.giveCard(p, G.effCard(n, extra));
const giveTactic = (p, n) => giveEff(p, tacticName(p, n || U.pick(TACTICS)));
const giveCoin = (p, n = 1, fine) => {
  for (let i = 0; i < n; i++) {
    if (p.talents.includes('零钱兑换')) { for (let k = 0; k < (fine ? 4 : 2); k++) giveEff(p, '古币', { broken: true, label: '破损古币' }); }
    else giveEff(p, fine ? '精致古币' : '古币');
  }
};
const totems = p => {
  const t = [];
  for (const u of G.heroUnits(p)) { const n = TOTEM_OWNER[hn(u)]; if (n) t.push({ name: n, lv: Math.max(1, u.lv + (p.totemBonus[n] || 0)), owner: u }); }
  for (let i = 0; i < (p.ms.extraTotem || 0); i++) t.push({ name: '因缘图腾', lv: 1 + (p.totemBonus['因缘图腾'] || 0) + G.round, owner: null });
  return t;
};
G.totems = totems;
const mostEquipped = (p, camp) => U.maxBy(G.heroUnits(p).filter(u => !camp || HD[u.hid].camp === camp), u => u.equips.length * 1000 + u.lv);

// ======================= 英雄词条 =======================
const HERO_FX = {
  // ---- 1阶 ----
  '苏烈': { death(p, u, m) { G.lvUp(p, u, 2 * m); } },
  '曜': {},  // 合成加成在 G.playHero 中结算
  '孙膑': { bCast(p, u, m, caster) { caster.casts3 = (caster.casts3 || 0) + 1; if (caster.casts3 % 3 === 0 && caster.src && !caster.summon) G.lvUp(p, caster.src, m); } },
  '狂铁': { prep(p, u, m) { G.coreUp(p, 2 * m); } },
  '孙尚香': { play(p, u, m) { p.freeRefresh += m; } },
  '弈星': { onLevelUp(p, u, m) { if (p.lv < 6) G.addXp(p, 2 * m); } },
  '干将莫邪': {
    enter(p, u, m) { if (!u.st.sword) { u.st.sword = 1; G.giveCard(p, G.equipCard('双剑·雄')); } },
    onAwake(p, u, m, w) { if (w === u && !u.st.sword2) { u.st.sword2 = 1; G.giveCard(p, G.equipCard('双剑·雌')); } },
  },
  '李元芳': { prep(p, u, m) { const t = G.nearest(p, u, isCamp('河洛')) || (HD[u.hid].camp === '河洛' ? u : null); for (let i = 0; i < m; i++) t && G.useCoin(p, t); } },
  '牛魔': { win(p, u, m) { p.energy += m; } },
  // ---- 2阶 ----
  '亚连': { prep(p, u, m) { const t = mostEquipped(p, '日落海'); t && G.lvUp(p, t, 2 * m); G.coreUp(p, m); } },
  '米莱狄': { prep(p, u, m) { u.st.summonTemp = (u.st.summonTemp || 3) + 3 * m; G.coreUp(p, 3 * m); } },
  '项羽': { death(p, u, m) { for (const n of ['先知图腾', '因缘图腾', '往生图腾']) p.totemBonus[n] = (p.totemBonus[n] || 0) + 3 * m; } },
  '鬼谷子': {},
  '梦奇': {
    sell(p, u, m) { const q = Math.min(5, u.st.vq || 1); for (let i = 0; i < m; i++) giveEff(p, q + '阶英雄兑换券'); },
    lose(p, u, m) { u.st.vq = Math.min(5, (u.st.vq || 1) + 1); },
  },
  '芈月': { onEffect(p, u, m) { const t = mostEquipped(p, '逐鹿'); t && G.lvUp(p, t, m); } },
  '沈梦溪': { onEffect(p, u, m, c, t) { if (t === u) u.rnd.mp -= 15 * m; } },
  '盾山': { death(p, u, m) { giveCoin(p, m); } },
  '曹操': { prep(p, u, m) { for (let i = 0; i < m; i++) { const t = U.pick(G.byCamp(p, '三分之地').filter(v => G.hasFx(v, 'play'))); t && G.trigger(p, t, 'play'); } } },
  '虞姬': { open(p, u, m) { const n = totems(p).length; for (let i = 0; i < n; i++) { G.lvUp(p, u, m); G.randUnits(p, 2, isCamp('大河流域'), u).forEach(v => G.lvUp(p, v, m)); } } },
  '马可波罗': { play(p, u, m) { G.lvUp(p, u, 2 * m); G.coreUp(p, 2 * m); } },
  '赵云': { play(p, u, m) { G.lvUp(p, u, m); G.randUnits(p, 2, null, u).forEach(v => G.lvUp(p, v, m)); } },
  '大乔': { onEntrance(p, u, m) { u.st.ent = (u.st.ent || 0) + 1; if (u.st.ent % 2 === 0) u.perm.mp -= 5 * m; } },
  '公孙离': { bInit(p, u, m, bu, B) { const n = B.units.filter(x => x.side === bu.side && x.src && x.src.awake).length; bu.aspd *= 1 + 0.15 * m * n; } },
  '百里守约': { bSacrifice(p, u, m, dead, self) { if (self.alive) self.mpMax = Math.max(10, self.mpMax - 20 * m); } },
  '墨子': { bShieldBreak(p, u, m, t) { if (t.src && !t.summon) t.src.perm.hp += 30 * m; } },
  '百里玄策': { prep(p, u, m) { const k = p.ms.flashKills || 0; for (let i = 0; i < k * m; i++) { const t = U.pick(G.heroUnits(p).filter(v => hasKw(HD[v.hid], '闪现'))); t && G.lvUp(p, t, 1); } } },
  '廉颇': { bCast(p, u, m, caster, self, B) { if (caster === self) B.alliesOf(self).forEach(a => a !== self && B.shield(a, (5 + 5 * (p.cnt.tactics || 0)) * m, 6)); } },
  '蒙恬': { death(p, u, m, ctx) { for (let i = 0; i < 2; i++) ctx.B.summon(ctx.bu.side, { name: '玄雍士兵', lv: G.totalLv(u), hp: 260, patk: 30, g: [26, 1.6], range: 1, color: '#6b8fb8' }, ctx.bu.r, ctx.bu.c, p); } },
  '蔡文姬': { onPlayHero(p, u, m, c, v) { if (HD[c.hid].camp !== '三分之地') return; G.heroUnits(p).filter(x => x !== u && isCamp('三分之地')(x)).sort((a, b) => a.lv - b.lv).slice(0, 3).forEach(x => G.lvUp(p, x, m)); } },
  // ---- 3阶 ----
  '云中君': { open(p, u, m) { G.heroUnits(p).forEach(v => v.equips.length && G.lvUp(p, v, v.equips.length * m)); } },
  '姬小满': { onSellUnit(p, u, m, s) { if (s === u) return; u.st.sold = (u.st.sold || 0) + 1; if (u.st.sold % 4 === 0) p.freeRefresh += m; } },
  '苍': { bSummonDeath(p, u, m, dead, self, B) { B.aoe(self.side, dead.r, dead.c, 1, (25 + 5 * (p.cnt.summons || 0)) * m, 'phys', self); } },
  '铠': { death(p, u, m, ctx) { G.byCamp(p, '河洛').forEach(v => { G.lvUp(p, v, 5 * m, true); }); } },
  '白起': { onEffect(p, u, m, c) { if (!p.rc.baiqi) { p.rc.baiqi = 1; for (let i = 0; i < m; i++) giveTactic(p, '援护战术'); } } },
  '明世隐': {
    play(p, u, m) { u.st.conv = (u.st.conv || 2) + 2 * m; },
    onBattleEnd(p, u, m) { const t = G.nearest(p, u); if (t && t.temp > 0) { const n = Math.min(t.temp, u.st.conv || 2); G.lvUp(p, t, n); } },
  },
  '阿轲': { play(p, u, m) { const times = 1 + Math.floor((CFG.START_HP - p.hp) / 10); for (let i = 0; i < times; i++) { G.lvUp(p, u, m); G.randUnits(p, 1, null, u).forEach(v => G.lvUp(p, v, m)); } } },
  '马超': { bControl(p, u, m, t, self) { if (self.alive) { self.mp += 15 * m; self.crit += 0.05 * m; } } },
  '裴擒虎': { prep(p, u, m) { const t = U.pick(G.heroUnits(p).filter(v => v !== u)); if (t) { const n = Math.floor(t.lv / 2) * m; u.temp = Math.max(u.temp, n); } } },
  '老夫子': { onMerge(p, u, m) { if (!p.rc.lfz) { p.rc.lfz = 1; for (let i = 0; i < m; i++) giveTactic(p, '招募战术'); } } },
  '西施': { prep(p, u, m) { for (let i = 0; i < m; i++) giveTactic(p, '推演战术'); } },
  '刘禅': { bCast(p, u, m, caster) { if (caster.src && !caster.summon) G.lvUp(p, caster.src, 2 * m, true); } },
  '猪八戒': { onMerge(p, u, m, w) { const q = HD[w.hid].q; if (q > 3) return; G.heroUnits(p).filter(v => HD[v.hid].q === q).forEach(v => G.lvUp(p, v, m)); } },
  '程咬金': { prep(p, u, m) { giveCoin(p, 1); for (let i = 0; i < m; i++) G.useCoin(p, u); } },
  '狄仁杰': { onCoin(p, u, m, t) { if (t === u) u.perm.aspd += 0.05 * m; } },
  '张良': { onOpenTrig(p, u, m) { G.randUnits(p, 3).forEach(v => G.lvUp(p, v, m)); } },
  '少司缘': {},
  '亚瑟': { onPlayHero(p, u, m, c) { if (HD[c.hid].camp === '日落海') G.coreUp(p, 3 * m); } },
  '钟馗': { bInit(p, u, m, bu, B) { B.unitsOf(bu.side).filter(x => x.src && Math.abs(x.bc - bu.bc) <= 1 && x.br === bu.br).forEach(x => x.zhongkui = true); } },
  '貂蝉': { play(p, u, m) { G.byCamp(p, '三分之地').forEach(v => G.lvUp(p, v, m)); } },
  '安琪拉': { prep(p, u, m) { G.lvUp(p, u, 2 * m); G.coreUp(p, 2 * m); } },
  '瑶': { bInit(p, u, m, bu, B) { const e = bu.src.equips.find(n => QD[n] && QD[n].q === 2); if (!e) return; U.sample(B.unitsOf(bu.side).filter(x => x !== bu && !x.totem), 3).forEach(x => B.addEquipFx(x, e, 15)); } },
  '镜': { onEffect(p, u, m) { u.st.eff = (u.st.eff || 0) + 1; if (u.st.eff % 2 === 0) G.lvUp(p, u, m); } },
  '朵莉亚': { onPrepTrig(p, u, m) { G.randUnits(p, 3).forEach(v => G.lvUp(p, v, m)); G.coreUp(p, m); } },
  // ---- 4阶 ----
  '莱西奥': { onSellUnit(p, u, m, s) { if (s === u) return; u.st.sold = (u.st.sold || 0) + 1; if (u.st.sold % 2 === 0) G.coreUp(p, m); } },
  '上官婉儿': { prep(p, u, m) { for (let i = 0; i < m; i++) G.randUnits(p, 3, isCamp('河洛')).forEach(v => G.useCoin(p, v)); } },
  '艾琳': { bInit(p, u, m, bu) { bu.aspd *= 1 + bu.lv * 0.01 * m; } },
  '扁鹊': { bShieldBreak(p, u, m, t, self, B) { if (!self.alive || (self.bqcd || 0) > B.t) return; self.bqcd = B.t + 1; B.aoe(t.side, t.r, t.c, 1, t.maxHp * 0.1 * m, 'mag', self); } },
  '嬴政': { bInit(p, u, m, bu) { bu.matk += (8 + 4 * (p.cnt.tactics || 0)) * m; } },
  '李信': { bSacrifice(p, u, m, dead, self, B) { if (self.alive) B.addTemp(self, 7 * m); } },
  '李白': {},
  '雅典娜': { open(p, u, m) { for (let i = 0; i < m; i++) G.randUnits(p, 2, v => isCamp('日落海')(v) && G.hasFx(v, 'prep')).forEach(v => G.trigger(p, v, 'prep')); } },
  '太乙真人': { open(p, u, m) { const t = G.nearest(p, u); if (t) t.revive = (t.revive || 0) + m; } },
  '孙悟空': { prep(p, u, m) { G.heroUnits(p).filter(v => hasKw(HD[v.hid], '闪现')).forEach(v => G.lvUp(p, v, 2 * m)); } },
  '甄姬': { play(p, u, m) { for (let i = 0; i < m; i++) G.giveHero(p, h => h.name !== '甄姬' && descHas('登场：')(h)); } },
  '小乔': { onEntrance(p, u, m) { G.randUnits(p, 3).forEach(v => G.lvUp(p, v, m)); } },
  '大司命': { onSacrifice(p, u, m) { p.totemBonus['往生图腾'] = (p.totemBonus['往生图腾'] || 0) + 2 * m; }, bSacrifice(p, u, m, dead, self, B) { B.unitsOf(self.side).filter(x => x.totemName === '往生图腾').forEach(x => x.mp += 50); } },
  '庄周': { play(p, u, m) { G.lvUp(p, u, 2 * m); for (let i = 0; i < m; i++) giveTactic(p, '招募战术'); } },
  '刘邦': { open(p, u, m) { const n = totems(p).length; if (n) { p.rc.noTotem = true; G.lvUp(p, u, 5 * n * m); } } },
  '诸葛亮': { bCast(p, u, m, caster, self, B) { if (caster !== self && self.alive) { self.mp += 15; B.addTemp(self, 4 * m); } } },
  '韩信': { onPrepTrig(p, u, m) { G.lvUp(p, u, m); }, onOpenTrig(p, u, m) { G.lvUp(p, u, m); } },
  '蒙犽': { play(p, u, m) { for (let i = 0; i < m; i++) giveTactic(p, '特训战术'); } },
  // ---- 5阶 ----
  '东皇太一': { open(p, u, m) { const s = U.sum(totems(p), t => t.lv); G.lvUp(p, u, Math.floor(s * 0.15 * m), true); } },
  '敖隐': { bTick(p, u, m, self, B, dt) { self.aoyin = (self.aoyin || 0) + dt; if (self.aoyin >= 4) { self.aoyin -= 4; const n = B.unitsOf(self.side).filter(x => x.totem && x.alive).length; if (n) { self.aspd *= 1 + 0.16 * n * m; B.addTemp(self, 4 * n * m); } } } },
  '鲁班大师': { bInit(p, u, m, bu, B) { B.summon(bu.side, { name: '机关傀儡', lv: bu.lv, hp: 420, patk: 36, g: [42, 1.8], range: 1, pdef: 30, color: '#b08a4a', taunt: true }, bu.r, bu.c, p); } },
  '花木兰': {
    onCoin(p, u, m) { u.st.coin4 = (u.st.coin4 || 0) + 1; if (u.st.coin4 % 4 === 0) u.revive = (u.revive || 0) + 1; },
    death(p, u, m, ctx) { ctx.B.addTemp(ctx.bu, 10 * m); },
    onRoundStart(p, u) { u.st.coin4 = 0; },
  },
  '司空震': { onTemp(p, u, m, t, n) { if (t === u || G.depth > 20) return; const k = Math.min(Math.floor(n / 2) * m, u.lv); if (k > 0) { u.temp += k; if (u._bu && B.cur) B.relevel(u._bu); } } },
  '姜子牙': { onPlayHero(p, u, m, c, v) { const camp = HD[c.hid].camp; const others = G.heroUnits(p).filter(x => x !== v && HD[x.hid].camp === camp); if (camp === '无阵营' || !others.length) { G.lvUp(p, u, m); const seen = new Set([HD[u.hid].camp]); U.shuffle(G.heroUnits(p)).filter(x => x !== u && !seen.has(HD[x.hid].camp) && seen.add(HD[x.hid].camp)).slice(0, 3).forEach(x => G.lvUp(p, x, m)); } } },
  '武则天': { play(p, u, m) { for (let i = 0; i < m; i++) giveCoin(p, 1, true); } },
  '吕布': { bInit(p, u, m, bu, B) { B.unitsOf(bu.side).filter(x => x.h && x.h.camp === '三分之地').sort((a, b) => b.lv - a.lv).slice(0, 3).forEach(x => x.ls += 0.2 * m * (x === bu ? 2 : 1)); } },
  '海月': { death(p, u, m, ctx) { const B_ = ctx.B, e = U.maxBy(B_.enemiesOf(ctx.bu), x => x.lv); if (e) { B_.stun(e, 4, ctx.bu); B_.hit(ctx.bu, e, ctx.bu.maxHp * m, 'true', { noMana: true }); } } },
  '鲁班七号': { onMerge(p, u, m) { u.st.mg = (u.st.mg || 0) + 1; if (u.st.mg % 3 === 0) for (let i = 0; i < m; i++) giveTactic(p); } },
  '海诺': { onCoreUp(p, u, m) { if (G.depth < 25) p.core += m; } },
  '露娜': { play(p, u, m) { G.coreUp(p, 2 * m); G.randUnits(p, 2, v => G.hasFx(v, 'prep')).forEach(v => G.trigger(p, v, 'prep')); } },
  '杨玉环': {
    onRoundStart(p, u, m) { u.st.r = (u.st.r || 0) + 1; if (u.st.r % 3 === 0) for (let i = 0; i < m; i++) giveEff(p, '弦音'); },
    sell(p, u, m) { for (let i = 0; i < m; i++) giveEff(p, '弦音'); },
  },
  '周瑜': { play(p, u, m) { G.heroUnits(p).forEach(v => G.lvUp(p, v, m)); } },
};
// 苏烈/盾山/铠/蒙恬/项羽/海月/花木兰 = 牺牲；钟馗给予的牺牲在战斗中处理

// ======================= 效果牌 =======================
const anyU = true;
const campT = c => u => HD[u.hid].camp === c || u.asCamp === c;
const vouch = (p, q, n = 3, filter) => { const cs = []; for (let i = 0; i < n; i++) cs.push(G.drawHero(h => h.q === q && (!filter || filter(h)) && !cs.some(c => c.hid === h.id))); G.discover(p, cs, 1, `${q}阶英雄 ${n}选1`); };
const randTierCard = p => G.drawHero(h => h.q === G.rollTier(p));
const discoverHeroes = (p, n, k, filter, title) => { const cs = []; for (let i = 0; i < n; i++) { const t = G.rollTier(p); cs.push(G.drawHero(h => (filter ? filter(h) : h.q === t) && !cs.some(c => c.hid === h.id))); } G.discover(p, cs, k, title || `英雄牌 ${n}选${k}`); };
const campHeroes = (p, camp, n) => { for (let i = 0; i < n; i++) G.giveHero(p, h => h.camp === camp && h.q <= Math.max(2, p.lv)); };
const tuiyan = (p, u, step, cap, key) => { p.cnt[key] = (p.cnt[key] || 0) + 1; u.rnd.mp -= Math.min(cap, step * p.cnt[key]); };
const campShield = (p, base, per) => { const v = base + per * (p.cnt.tactics || 0); G.byCamp(p, '逐鹿').forEach(u => u.rnd.shield = (u.rnd.shield || 0) + v); };
const addProg = (p, u, n = 1) => { if (u.awake) return; u.prog = Math.min(4, u.prog + n); if (u.prog >= 4) { u.awake = true; G.log(p, `【${hn(u)}】觉醒！`); G.fire(p, 'onAwake', u); } };

const EFFECT_FX = {
  '惊喜补贴': { run(p) { p.freeRefresh += 3; } },
  '1阶英雄兑换券': { run(p) { vouch(p, 1); } },
  '研读会': { run(p) { G.addXp(p, 3); } },
  '招兵买马': { run(p) { giveEff(p, '3阶英雄兑换券'); } },
  '高级人才': { run(p) { G.giveHero(p, h => h.q === Math.min(5, p.lv + 1)); } },
  '古币': { tgt: (u, p) => campT('河洛')(u) || (p.talents.includes('多彩古币') && !campT('河洛')(u)), run(p, u, c) { G.useCoin(p, u, 2, c); } },
  '援护战术': { run(p) { campShield(p, 50, 25); } },
  '吸纳人才': { run(p) { discoverHeroes(p, 4, 1); } },
  '简易协作': { tgt: anyU, run(p, u) { G.lvUp(p, u, 3); G.randUnits(p, 1).forEach(v => G.lvUp(p, v, 2)); } },
  '图腾仪式': { run(p) { G.giveHero(p, h => ['鬼谷子', '少司缘', '大司命', '虞姬', '东皇太一', '敖隐', '刘邦', '项羽'].includes(h.name)); } },
  '2阶英雄': { run(p) { campHeroes; G.giveHero(p, h => h.q === 2); G.giveHero(p, h => h.q === 2); } },
  '古币多多': { run(p) { giveCoin(p, 2); } },
  '跳级': { tgt: anyU, run(p, u) { const n = Math.min(5, p.core); p.core -= n; G.lvUp(p, u, n); } },
  '弦音': { tgt: u => HD[u.hid].q <= 3 && !u.awake, run(p, u) { addProg(p, u); } },
  '临阵磨枪': { tgt: u => G.hasFx(u, 'prep'), run(p, u) { G.trigger(p, u, 'prep'); } },
  '唤醒': { tgt: u => G.hasFx(u, 'play'), run(p, u) { G.trigger(p, u, 'play'); } },
  '演练战术': { run(p) { G.heroUnits(p).forEach(u => G.lvUp(p, u, 1)); } },
  '推演战术': { tgt: campT('逐鹿'), run(p, u) { tuiyan(p, u, 5, 20, 'ty'); } },
  '特训战术': { tgt: anyU, run(p, u) { G.lvUp(p, u, 4); } },
  '招募战术': { run(p) { G.giveHero(p, h => h.camp === '逐鹿'); } },
  '2阶英雄兑换券': { run(p) { vouch(p, 2); } },
  '3阶英雄兑换券': { run(p) { vouch(p, 3); } },
  '精致古币': { tgt: (u, p) => campT('河洛')(u), run(p, u, c) { G.useCoin(p, u, 4, c); } },
  '广纳良才': { run(p) { discoverHeroes(p, 5, 2); } },
  '精密协作': { tgt: anyU, run(p, u) { G.lvUp(p, u, 4); G.randUnits(p, 1).forEach(v => G.lvUp(p, v, 3)); } },
  '八方来援': { tgt: anyU, run(p, u) { const n = 1 + G.campsOnBoard(p).length; for (let i = 0; i < n; i++) G.lvUp(p, u, 2); } },
  '经典研读会': { run(p) { G.addXp(p, 4); } },
  '武装之力': { run(p) { G.heroUnits(p).forEach(u => G.lvUp(p, u, u.equips.length)); } },
  '遗志': { tgt: anyU, can: p => G.heroUnits(p).length > 1, run(p, u) { const n = u.lv; G.removeUnit(p, u); G.pool[u.hid] += u.prog; const t = U.pick(G.heroUnits(p)); t && G.lvUp(p, t, n); } },
  '呼朋唤友': { tgt: anyU, run(p, u) { G.giveHero(p, h => h.camp === HD[u.hid].camp); } },
  '整备高手': { run(p) { G.giveHero(p, descHas('整备：')); G.giveHero(p, descHas('整备：')); } },
  '登场人物': { run(p) { G.giveHero(p, descHas('登场：')); G.giveHero(p, descHas('登场：')); } },
  '无阵营征召令': { run(p) { campHeroes(p, '无阵营', 2); } },
  '大河流域征召令': { run(p) { campHeroes(p, '大河流域', 2); } },
  '日落海征召令': { run(p) { campHeroes(p, '日落海', 2); } },
  '逐鹿征召令': { run(p) { campHeroes(p, '逐鹿', 2); } },
  '三分征召令': { run(p) { campHeroes(p, '三分之地', 2); } },
  '河洛征召令': { run(p) { campHeroes(p, '河洛', 2); } },
  '换帅': { tgt: campT('三分之地'), run(p, u) { const t = G.nearest(p, u, campT('三分之地')); if (t) { const a = u.lv; u.lv = t.lv; t.lv = a; } } },
  '照影': { can: p => G.heroUnits(p).length > 0, run(p) { const u = U.pick(G.heroUnits(p)); G.giveCard(p, G.heroCard(u.hid, { gift: true })); } },
  '助力核心': { run(p) { const n = 1 + G.byCamp(p, '日落海').length; for (let i = 0; i < n; i++) G.coreUp(p, 2); } },
  '超级补贴': { run(p) { p.freeRefresh += 4; } },
  '逍遥自在': { run(p) { const us = G.byCamp(p, '无阵营'); us.forEach(u => G.lvUp(p, u, 2 * us.length)); } },
  '4阶英雄': { run(p) { G.giveHero(p, h => h.q === 4); G.giveHero(p, h => h.q === 4); } },
  '高阶演练战术': { run(p) { G.heroUnits(p).forEach(u => G.lvUp(p, u, 2)); } },
  '武装重构': { tgt: u => u.equips.length > 0, run(p, u) { const n = u.equips.length; u.equips = []; for (let i = 0; i <= n; i++) G.giveCard(p, G.equipCard(U.pick(BASIC_EQUIPS))); } },
  '阵营祝福': { run(p) { G.campsOnBoard(p).forEach(c => { const u = U.pick(G.byCamp(p, c)); u && G.lvUp(p, u, 4); }); } },
  '发号施令': { run(p) { giveTactic(p); giveTactic(p); } },
  '高阶招募战术': { run(p) { discoverHeroes(p, 3, 1, h => h.camp === '逐鹿' && h.q <= Math.max(3, p.lv), '【逐鹿】英雄 3选1'); } },
  '高阶特训战术': { tgt: anyU, run(p, u) { G.lvUp(p, u, 8); } },
  '高阶援护战术': { run(p) { campShield(p, 100, 50); } },
  '4阶英雄兑换券': { run(p) { vouch(p, 4); } },
  '扶倾济弱': { can: p => G.heroUnits(p).length > 0, run(p) { const u = U.minBy(G.heroUnits(p), u => u.lv); G.lvUp(p, u, 9); } },
  '妙音': { tgt: u => !u.awake, run(p, u) { addProg(p, u); } },
  '乱世': { run(p) { discoverHeroes(p, 3, 1, h => descHas('登场：')(h) && h.q <= Math.max(3, p.lv), '登场英雄 3选1'); } },
  '战前宣誓': { tgt: anyU, run(p, u) { G.lvUp(p, u, HD[u.hid].q * 3, true); } },
  '夺取之术': { tgt: anyU, run(p, u) { const t = G.nearest(p, u); if (t && t.lv > 1) { const n = Math.min(10, t.lv - 1); G.lvUp(p, t, -n); G.lvUp(p, u, n); } } },
  '牺牲品': { run(p) { G.giveHero(p, descHas('牺牲')); G.giveHero(p, descHas('牺牲')); } },
  '闪现突击者': { run(p) { G.giveHero(p, h => hasKw(h, '闪现')); G.giveHero(p, h => hasKw(h, '闪现')); } },
  '开团号令': { run(p) { G.giveHero(p, descHas('开团：')); G.giveHero(p, descHas('开团：')); } },
  '远洋宝藏': { run(p) { const all = ['月影之力', '火鹰合金盾', '火鹰星徽', '火鹰狩枪', '火鹰装甲']; p.ms.sea = p.ms.sea || []; const left = all.filter(n => !p.ms.sea.includes(n)); if (!left.length) return; const n = U.pick(left); p.ms.sea.push(n); G.giveCard(p, G.equipCard(n)); } },
  '因材施教': { run(p) { const c = G.mainCamp(p) || '通用'; giveEff(p, G.randEffectName(e => e.cat === c && !/^转瞬/.test(e.desc))); } },
  '传承': { tgt: u => u.lv > 10, can: p => G.heroUnits(p).length > 1, run(p, u) { const n = u.lv - 1; u.lv = 1; const ts = G.randUnits(p, 3, null, u); if (!ts.length) return; const cut = [0, U.rnd(), U.rnd(), 1].slice(0, ts.length + 1).sort(); if (ts.length < 3) cut.push(1); let given = 0; ts.forEach((t, i) => { const k = i === ts.length - 1 ? n - given : Math.floor(n / ts.length); given += k; G.lvUp(p, t, k); }); } },
  '高阶推演战术': { tgt: campT('逐鹿'), run(p, u) { tuiyan(p, u, 10, 40, 'ty2'); } },
  '度命之护': { run(p) { G.giveCard(p, G.equipCard('贤者的庇护')); } },
  '武装分解': { tgt: u => u.equips.length > 0, run(p, u) { const n = Math.min(3, u.equips.length); u.equips = []; if (n === 1) p.energy += 4; else if (n === 2) giveEff(p, '妙音'); else giveEff(p, '珍品宝箱'); } },
  '久经沙场': { tgt: u => u.awake && campT('逐鹿')(u), run(p, u) { G.giveCard(p, G.heroCard(u.hid, { gift: true })); } },
  '机关秘典': { run(p) { G.giveCard(p, G.equipCard('机关匣')); } },
  '图腾祝福': { run(p) { const n = 1 + totems(p).length; for (let i = 0; i < n; i++) { const u = U.pick(G.byCamp(p, '大河流域')); u && G.lvUp(p, u, 5); } } },
  '珍品宝箱': { run(p) { const opts = U.sample(SPECIAL_EQUIPS.concat(TALENT_EQUIPS), 3); G.ask(p, { title: '珍品宝箱：3选1', options: opts.map(n => ({ label: n, desc: QD[n].desc, q: QD[n].q, kind: 'equip', value: n })) }, v => G.giveCard(p, G.equipCard(v))); } },
  '移花接木': { run(p) { p.rc.graft = true; } },
  '5阶英雄': { run(p) { G.giveHero(p, h => h.q === 5); G.giveHero(p, h => h.q === 5); } },
  '5阶英雄兑换券': { run(p) { vouch(p, 5); } },
  '有福同享': { tgt: anyU, run(p, u) { const q = HD[u.hid].q; G.heroUnits(p).filter(v => HD[v.hid].q === q).forEach(v => G.lvUp(p, v, 3)); } },
  '求贤': { tgt: anyU, run(p, u) { discoverHeroes(p, 3, 1, h => h.camp === HD[u.hid].camp, `【${CAMP_SHORT[HD[u.hid].camp]}】英雄 3选1`); } },
  '奇谋': { tgt: campT('三分之地'), run(p, u) { u.rnd.qimou = true; } },
  '开局狂飙': { tgt: anyU, run(p, u) { u.rnd.rush = true; } },
  '能量大爆炸': { run(p) { p.energy += 5; } },
  '集体唤醒': { run(p) { G.heroUnits(p).slice().forEach(u => G.hasFx(u, 'play') && G.trigger(p, u, 'play')); } },
  '全军动员': { run(p) { G.heroUnits(p).slice().forEach(u => G.hasFx(u, 'prep') && G.trigger(p, u, 'prep')); } },
  '精选武装': { run(p) { const o = U.sample(BASIC_EQUIPS, 4); G.ask(p, { title: '精选武装：4选1', options: o.map(n => ({ label: n, desc: QD[n].desc + `（可铸造${FORGE_TYPE[n]}型普通装备）`, q: 1, kind: 'equip', value: n })) }, v => G.giveCard(p, G.equipCard(v))); } },
  // ---- 6阶（第三轮拍卖）----
  '强力针剂': { tgt: anyU, run(p, u) { G.lvUp(p, u, 20); u.st.inject = (u.st.inject || 0) + 1; } },
  '展翅腾飞': { run(p) { p.rc.freeShop = true; } },
  '军械库': { run(p) { for (let i = 0; i < 3; i++) G.giveCard(p, G.equipCard(U.pick(BASIC_EQUIPS))); } },
  '众星拱月': { tgt: anyU, run(p, u) { G.heroUnits(p).filter(v => v !== u).forEach(v => { const n = Math.min(10, v.lv - 1); if (n > 0) { G.lvUp(p, v, -n); G.lvUp(p, u, n); } }); } },
  '神兵天降': { run(p) { for (let i = 0; i < 4; i++) giveEff(p, '5阶英雄兑换券'); } },
  '呼风唤雨': { run(p) { for (let i = 0; i < 4; i++) giveEff(p, G.randEffectName(e => e.q === 5 && !/^转瞬/.test(e.desc))); } },
  '众星闪耀': { run(p, u, c) { const n = 10 + 5 * (c.held || 0); G.heroUnits(p).forEach(v => G.lvUp(p, v, n)); } },
  '天籁琴音': { run(p) { for (let i = 0; i < 3; i++) giveEff(p, '妙音'); } },
  '绝处逢生': { run(p) { p.hp = 1; for (let i = 0; i < 10; i++) giveEff(p, G.randEffectName(e => !/^转瞬/.test(e.desc))); } },
  '化铁为金': { tgt: u => HD[u.hid].q <= 3, run(p, u) { const on = new Set(G.heroUnits(p).map(v => v.hid)); const h = U.pick(HERO_DATA.filter(h => h.q === 5 && !on.has(h.id))); if (!h) return; G.pool[u.hid] += u.prog; u.hid = h.id; u.awake = true; u.prog = 4; u.st = {}; u.gift = true; } },
  '超级复印机': { can: p => G.heroUnits(p).length > 0, run(p) { const u = U.pick(G.heroUnits(p)); for (let i = 0; i < 3; i++) G.giveCard(p, G.heroCard(u.hid, { gift: true })); } },
  '一线生机': { run(p) { p.ms.lastChance = true; G.giveCard(p, G.equipCard('名刀·司命')); G.giveCard(p, G.equipCard('名刀·司命')); } },
  '能量超新星': { run(p) { p.energy += U.int(10, 20); } },
  '扶摇直上': { run(p) { if (p.lv >= 6) p.energy += 10; else { p.xp = 0; G.levelUp(p); } } },
  '狂飙三倍速': { run(p) { for (let i = 0; i < 3; i++) giveEff(p, '开局狂飙'); } },
  '四人同行': { run(p) { const cs = []; for (let i = 0; i < 5; i++) cs.push(G.drawHero(h => h.q >= 3 && !cs.some(c => c.hid === h.id))); G.ask(p, { title: '四人同行：5选1，并一分为四', options: cs.map(c => ({ card: c, value: c })) }, c => { for (let i = 0; i < 4; i++) G.giveCard(p, G.heroCard(c.hid, { gift: i > 0 })); }); } },
  '新生力量': { run(p) { p.extraPop++; } },
  '沧海拾遗': { run(p, u, c) { giveEff(p, U.pick(EFFECT_DATA.filter(e => e.q === 6 && e.name !== '沧海拾遗')).name); } },
  // ---- 天赋牌 / 秘技牌 ----
  '复印机': { tgt: u => HD[u.hid].q <= 3, run(p, u) { G.giveCard(p, G.heroCard(u.hid, { gift: true })); } },
  '体面离场': { tgt: anyU, run(p, u) { const e = [3, 5, 7, 9][Math.min(3, u.prog - 1)]; G.removeUnit(p, u); G.pool[u.hid] += u.prog; p.energy += e; } },
  '援军': { tgt: anyU, run(p, u) { campHeroes(p, HD[u.hid].camp, 4); } },
  '前浪的荣光': { tgt: anyU, run(p, u) { const q = Math.min(5, HD[u.hid].q + U.int(1, 2)); G.giveHero(p, h => h.camp === HD[u.hid].camp && h.q === q); } },
  '碰碰运气': { tgt: anyU, run(p, u) { G.lvUp(p, u, U.int(5, 20)); p.energy = Math.max(0, p.energy - U.int(1, 5)); } },
  '挂帅': { tgt: campT('三分之地'), run(p, u) { const t = G.nearest(p, u, campT('三分之地')); if (t) u.lv = t.lv; } },
  '点兵点将': { run(p) { G.heroUnits(p).forEach(u => G.giveCard(p, G.heroCard(u.hid, { gift: true }))); } },
  '扩编': { can: p => p.energy >= 8, run(p) { p.energy -= 8; p.extraPop++; } },
  '大明星': { can: p => G.popUsed(p) < G.pop(p), run(p) { const on = new Set(G.heroUnits(p).map(v => v.hid)); const h = U.pick(HERO_DATA.filter(h => h.q === 5 && !on.has(h.id))); const cell = G.firstFreeCell(p, h); if (cell < 0) return; const u = G.newUnit(h.id, p.lv * 7); u.prog = 2; u.gift = true; u.st.star = 0; p.board[cell] = u; } },
  '心之引力': { run(p) { p.freeRefresh += 4; p.rc.discount = 0; p.ms.discount = 4; } },
  '神奇小鹿': { run(p) { p.ms.deerTaunt = true; p.ms.deer = (p.ms.deer || 1) + 8; } },
  '驭势': { run(p) { p.rc.yushi = true; } },
  '武器改造': { run(p) { p.ms.gunMod = (p.ms.gunMod || 0) + 1; } },
  '如梦似幻': { can: p => p.energy >= 6, run(p) { p.energy -= 6; const c = G.mainCamp(p) || U.pick(CAMPS); campHeroes(p, c, 3); giveEff(p, G.randEffectName(e => e.cat === c || e.cat === '通用')); } },
  '潮汐的交响': { run(p) { G.randUnits(p, 5).forEach(u => G.lvUp(p, u, 4)); } },
  '朋友多多': { run(p) { campHeroes(p, p.ms.camp || U.pick(CAMPS), 4); } },
  '小菟送福': { run(p) { G.randUnits(p, 4).forEach(u => MASTERS['常小娥'].boost(p, u)); } },
  '封神一瞬': { tgt: anyU, run(p, u) { u.st.fengshen = true; } },
  '即兴创作': { can: p => G.heroUnits(p).length > 0, run(p) { const u = U.pick(G.heroUnits(p)); G.giveCard(p, G.heroCard(u.hid, { gift: true })); p.cnt.improv = (p.cnt.improv || 0) + 1; if (p.cnt.improv === 6) giveEff(p, '灵感爆发'); } },
  '灵感爆发': { run(p) { G.heroUnits(p).forEach(u => G.giveCard(p, G.heroCard(u.hid, { gift: true }))); } },
};
// 扩展卡牌定义（天赋牌/秘技牌）
[
  ['复印机', 2, '天赋牌', '指定1名1-3阶英雄，获得该英雄牌。'], ['体面离场', 2, '天赋牌', '指定移除一名英雄，获得能量。此英雄0/1/2/3觉醒进度时，获得3/5/7/9能量。'],
  ['援军', 3, '天赋牌', '指定1名英雄，随机获得4张同阵营的英雄牌。'], ['前浪的荣光', 3, '天赋牌', '指定1名英雄，获得1张高1-2阶的同阵营英雄牌。'],
  ['碰碰运气', 3, '天赋牌', '指定1名英雄提升5-20等级，随机消耗1-5能量。'], ['挂帅', 4, '天赋牌', '指定1名【三分】英雄，使其等级等同于1名最近的【三分】英雄。'],
  ['点兵点将', 5, '天赋牌', '获得场上英雄牌各1张。'], ['扩编', 4, '天赋牌', '花费8能量，可上阵人数+1。'],
  ['大明星', 5, '天赋牌', '随机上阵1名不在场的等级为棋手等级×7的5阶英雄，其觉醒进度为1，此后每经过2回合则额外+1。'],
  ['心之引力', 6, '秘技牌', '获得4次临时刷新。接下来4次刷新时，商店里的牌购买消耗-1。'], ['神奇小鹿', 6, '秘技牌', '开战后小鹿会在敌人之间移动，每3秒嘲讽1次周围1格敌人，等级+8。'],
  ['驭势', 6, '秘技牌', '本回合战斗开始时，将敌方场上所有英雄复制进你的手牌。'], ['武器改造', 6, '秘技牌', '香香攻击力+20%，并改造武器：弩炮每次攻击额外溅射。'],
  ['如梦似幻', 6, '秘技牌', '消耗6能量，基于场上阵容获取一套梦幻手牌。'], ['潮汐的交响', 6, '秘技牌', '场上随机5名英雄等级+4。'],
  ['朋友多多', 6, '秘技牌', '随机获得4张技能所选阵营的英雄牌。'], ['小菟送福', 6, '秘技牌', '对场上的随机4名英雄各触发1次小菟助力。'],
  ['封神一瞬', 6, '秘技牌', '指定1名英雄，使其每次等级永久提升时，都额外+1级。'], ['即兴创作', 3, '秘技牌', '随机获得场上1名英雄的复制。'],
  ['灵感爆发', 6, '秘技牌', '获得场上英雄牌各1张。'],
].forEach(([name, q, cat, desc]) => { if (!ED[name]) ED[name] = { name, q, cat, desc }; });
ED['古币'].desc = '转瞬 指定1名【河洛】英雄等级+2。';

// 装备限定
const EQUIP_RULE = {
  '贤者的庇护': campT('河洛'), '机关匣': campT('逐鹿'),
  '日渊': u => !HD[u.hid].melee, '青莲剑谱': u => HD[u.hid].melee, '破阵战芒': u => HD[u.hid].q <= 3, '三分旗帜': campT('三分之地'),
};
const UNIQUE_OK = (u, n) => !(u.equips.includes(n) && /唯一/.test(QD[n] ? QD[n].desc : ''));
const _canT = G.canTarget.bind(G);
G.canTarget = function (p, c, u) { if (c.kind === 'equip' && u && !UNIQUE_OK(u, c.name)) return false; return _canT(p, c, u); };

// ======================= 全局效果（卡牌/装备的回合持续效果） =======================
const GLOBAL_FX = {
  onRoundStart(p) {
    for (const u of G.heroUnits(p)) {
      if (u.st.inject) G.lvUp(p, u, 10 * u.st.inject);
      if (u.equips.includes('学识宝石')) { u.st.gemRounds = (u.st.gemRounds || 0) + 1; G.lvUp(p, u, Math.max(3, Math.floor(u.lv * 0.08))); }
      if (u.st.star != null) { u.st.star++; if (u.st.star % 2 === 0) addProg(p, u); }
    }
    for (const c of p.hand) c.held = (c.held || 0) + 1;
    if (p.ms.discount > 0) { p.rc.discount = 1; p.ms.discount--; }
  },
  onBattleEnd(p, won) {
    for (const u of G.heroUnits(p)) if (u.equips.includes('盛华')) u.st.bloom = (u.st.bloom || 0) + (won ? 400 : 200);
  },
};
const _fire = G.fire.bind(G);
G.fire = function (p, evt, a, b) { _fire(p, evt, a, b); if (GLOBAL_FX[evt]) G.guard(() => GLOBAL_FX[evt](p, a, b)); };

// ======================= 天赋 =======================
const TALENTS = [
  // ---- 铜 ----
  { name: '复印机', q: 1, desc: '获得2张天赋牌复印机：指定1名1-3阶英雄，获得该英雄牌。', gain(p) { giveEff(p, '复印机'); giveEff(p, '复印机'); } },
  { name: '整装待发', q: 1, desc: '若回合内没有打出英雄牌，下回合开始时，获得2能量。', onBattleStart(p) { if (!(p.rc.playedList || []).some(c => c.kind === 'hero')) p.pending.energy = (p.pending.energy || 0) + 2; } },
  { name: '日落海新援', q: 1, desc: '获得2能量，以及随机1张2-3阶【日落海】英雄牌。', gain(p) { p.energy += 2; G.giveHero(p, h => h.camp === '日落海' && h.q >= 2 && h.q <= 3); } },
  { name: '河洛新援', q: 1, desc: '获得2能量，以及随机1张2-3阶【河洛】英雄牌。', gain(p) { p.energy += 2; G.giveHero(p, h => h.camp === '河洛' && h.q >= 2 && h.q <= 3); } },
  { name: '破格', q: 1, desc: '回合开始商店自动刷新时，会出现1个高1阶英雄牌。', onRoundStart(p) { p.rc.breakthrough = true; } },
  { name: '好聚好散', q: 1, desc: '获得1张天赋牌体面离场：指定移除一名英雄，获得能量。此英雄0/1/2/3觉醒进度时，获得3/5/7/9能量。', gain(p) { giveEff(p, '体面离场'); } },
  { name: '战争头牌', q: 1, desc: '每回合获得1个品阶数字，打出相同品阶的英雄牌时，额外+4等级。', onRoundStart(p) { p.rc.headQ = U.int(1, Math.min(5, p.lv)); }, onPlayHero(p, t, c, u) { if (HD[c.hid].q === p.rc.headQ) G.lvUp(p, u, 4); } },
  { name: '微弱优势', q: 1, desc: '打出觉醒英雄牌时，其获得22%暴击率和11%物理及法术吸血（每名英雄仅1次）。', onPlayHero(p, t, c, u) { if (u.awake && !u.st.edge) u.st.edge = 1; } },
  { name: '刻舟减蓝', q: 1, desc: '英雄20级后，法力值上限-10。', onBattleStart(p) { G.heroUnits(p).forEach(u => { if (G.totalLv(u) >= 20) u.rnd.mp -= 10; }); } },
  { name: '兵行诡招', q: 1, desc: '棋手生命值-15，战斗开始时，己方每名英雄+2临时等级。战斗胜利时，获得1棋手生命值，临时等级额外+1。', gain(p) { p.hp -= 15; p.ms.trick = 2; }, onBattleStart(p) { G.heroUnits(p).forEach(u => G.lvUp(p, u, p.ms.trick, true)); }, onWin(p) { p.hp += 1; p.ms.trick++; } },
  { name: '研读心得', q: 1, desc: '立即获得6棋手经验。', gain(p) { G.addXp(p, 6); } },
  // ---- 银 ----
  { name: '伤害转化器', q: 2, desc: '获得2能量。战斗胜利时，再获得2能量。', gain(p) { p.energy += 2; }, onWin(p) { p.pending.energy = (p.pending.energy || 0) + 2; } },
  { name: '常胜将军', q: 2, desc: '若你至少2连胜，战斗胜利时获得2能量和4棋手生命值。', onWin(p) { if (p.streakW >= 2) { p.pending.energy = (p.pending.energy || 0) + 2; p.hp += 4; } } },
  { name: '如法炮制', q: 2, desc: '每回合首次打出英雄牌时，获得1张同阶的英雄牌（不可超过棋手等级）。', onPlayHero(p, t, c) { if (p.rc.rfpz) return; p.rc.rfpz = 1; const q = Math.min(HD[c.hid].q, p.lv); G.giveHero(p, h => h.q === q); } },
  { name: '金算盘', q: 2, desc: '出售场上英雄时，随机1名英雄等级+3。', onSellUnit(p) { G.randUnits(p, 1).forEach(u => G.lvUp(p, u, 3)); } },
  { name: '结伴', q: 2, desc: '获得2能量以及2张3阶英雄兑换券。', gain(p) { p.energy += 2; giveEff(p, '3阶英雄兑换券'); giveEff(p, '3阶英雄兑换券'); } },
  { name: '前线堡垒', q: 2, desc: '战斗开始时，你第一排的英雄获得20点物理及法术防御。', bSetup(p, t, B, side) { B.unitsOf(side).filter(x => x.br === 0).forEach(x => { x.pdef += 20; x.mdef += 20; }); } },
  { name: '援军', q: 2, desc: '获得1张援军：指定1名英雄，随机获得4张同阵营的英雄牌。', gain(p) { giveEff(p, '援军'); } },
  { name: '虚构装备', q: 2, desc: '战斗开始时，随机3名己方英雄临时获得1件普通装备及100点生命上限。', bSetup(p, t, B, side) { U.sample(B.unitsOf(side).filter(x => x.src && !x.summon), 3).forEach(x => { x.maxHp += 100; x.hp += 100; B.addEquipFx(x, U.pick(NORMAL_EQUIPS), 999); }); } },
  { name: '控能达人', q: 2, desc: '战斗开始时，若当前能量≤3，随机获得1张3-4阶英雄牌。', onBattleStart(p) { if (p.energy <= 3) G.giveHero(p, h => h.q >= 3 && h.q <= 4); } },
  { name: '保持进步', q: 2, desc: '获得1张3阶兑换券。回合开始时，获得1棋手经验。满级后，改为获得1能量。', gain(p) { giveEff(p, '3阶英雄兑换券'); }, onRoundStart(p) { if (p.lv >= 6) p.energy += 1; else G.addXp(p, 1); } },
  { name: '紧急行动', q: 2, desc: '获得15点棋手生命值、1张装备箱（精选武装）。', gain(p) { p.hp += 15; giveEff(p, '精选武装'); } },
  { name: '前浪的荣光', q: 2, desc: '获得2张天赋牌前浪的荣光：指定1名英雄，获得1张高1-2阶的同阵营英雄牌。', gain(p) { giveEff(p, '前浪的荣光'); giveEff(p, '前浪的荣光'); } },
  { name: '逐鹿来客', q: 2, desc: '获得3能量以及1张蒙犽。', gain(p) { p.energy += 3; G.giveCard(p, G.heroCard(HN['蒙犽'].id, { gift: true })); } },
  { name: '三分来客', q: 2, desc: '获得3能量以及1张小乔。', gain(p) { p.energy += 3; G.giveCard(p, G.heroCard(HN['小乔'].id, { gift: true })); } },
  { name: '扩编名额', q: 2, desc: '获得2张扩编：花费8能量，可上阵人数+1。', gain(p) { giveEff(p, '扩编'); giveEff(p, '扩编'); } },
  { name: '卧薪尝胆', q: 2, desc: '选取天赋后，当你输掉2场战斗时，获得9棋手经验。', onLose(p) { p.ms.wxcd = (p.ms.wxcd || 0) + 1; if (p.ms.wxcd === 2) G.addXp(p, 9); } },
  { name: '重大里程碑', q: 2, desc: '棋手到达5级时，获得8能量、1张装备箱和1张高阶效果牌。', onLevelUp(p) { if (p.lv === 5) { p.energy += 8; giveEff(p, '精选武装'); giveEff(p, G.randEffectName(e => e.q === 5)); } } },
  { name: '日落海精兵', q: 2, desc: '卡牌3选1（4阶或5阶的【日落海】英雄）。', gain(p) { discoverHeroes(p, 3, 1, h => h.camp === '日落海' && h.q >= 4, '日落海精兵 3选1'); } },
  { name: '场外供能', q: 2, desc: '回合开始时，阿科米亚核心获得棋手等级×3的等级。', onRoundStart(p) { G.coreUp(p, p.lv * 3); } },
  { name: '乐善好施', q: 2, desc: '你的英雄触发登场效果时，随机2名【三分】英雄等级+2。', onEntrance(p) { G.randUnits(p, 2, campT('三分之地')).forEach(u => G.lvUp(p, u, 2)); } },
  { name: '古币契约', q: 2, desc: '你的英雄每触发3次牺牲效果，获得1张古币。', onSacrifice(p) { p.ms.sac = (p.ms.sac || 0) + 1; if (p.ms.sac % 3 === 0) p.ms.coinDue = (p.ms.coinDue || 0) + 1; }, onRoundStart(p) { if (p.ms.coinDue) { giveCoin(p, p.ms.coinDue); p.ms.coinDue = 0; } } },
  { name: '幸运硬币', q: 2, desc: '打出古币时有概率额外触发1-3次。', onEffect(p, t, c, u) { if (/古币/.test(c.name) && u && U.chance(0.35)) { const n = U.int(1, 3); for (let i = 0; i < n; i++) G.useCoin(p, u, c.name === '精致古币' ? 4 : 2, c); } } },
  { name: '因缘际会', q: 2, desc: '召唤1个1级的因缘图腾。', gain(p) { p.ms.extraTotem = (p.ms.extraTotem || 0) + 1; } },
  { name: '多彩古币', q: 2, desc: '古币也可以对非【河洛】英雄使用。', gain(p) { giveCoin(p, 2); } },
  // ---- 金 ----
  { name: '挂帅上阵', q: 3, desc: '获得1张挂帅：指定1名【三分】英雄，使其等级等同于1名最近的【三分】英雄。', gain(p) { giveEff(p, '挂帅'); } },
  { name: '穷兵黩武', q: 3, desc: '【逐鹿】英雄释放技能时，召唤1个玄雍士兵，其等级与召唤英雄相同，最多同时存在3个。', bCastAny(p, t, caster, B) { if (caster.h && caster.h.camp === '逐鹿' && B.unitsOf(caster.side).filter(x => x.name === '玄雍士兵' && x.alive).length < 3) B.summon(caster.side, { name: '玄雍士兵', lv: caster.lv, hp: 260, patk: 30, g: [26, 1.6], range: 1, color: '#6b8fb8' }, caster.r, caster.c, p); } },
  { name: '演武', q: 3, desc: '棋手升到5级后，你获得的战术牌都会变为高阶战术。', gain(p) { giveTactic(p); } },
  { name: '积少成多', q: 3, desc: '【日落海】英雄每提升10级，阿科米亚核心获得4等级。', onLvGain(p, t, u, n) { if (HD[u.hid].camp !== '日落海') return; p.ms.jscd = (p.ms.jscd || 0) + n; while (p.ms.jscd >= 10) { p.ms.jscd -= 10; G.coreUp(p, 4); } } },
  { name: '点兵点将', q: 3, desc: '获得1张天赋牌点兵点将：获得场上英雄牌各1张。', gain(p) { giveEff(p, '点兵点将'); } },
  { name: '护命灵珠', q: 3, desc: '获得护命灵珠：增加护盾，护盾存在期间造成伤害提升。', gain(p) { G.giveCard(p, G.equipCard('护命灵珠')); } },
  { name: '鼓舞之戒', q: 3, desc: '获得鼓舞之戒：与穿戴者同阵营的英雄提升最大生命值。', gain(p) { G.giveCard(p, G.equipCard('鼓舞之戒')); } },
  { name: '日落海强援', q: 3, desc: '获得5能量和随机3张4-5阶【日落海】英雄牌。', gain(p) { p.energy += 5; for (let i = 0; i < 3; i++) G.giveHero(p, h => h.camp === '日落海' && h.q >= 4); } },
  { name: '逐鹿强援', q: 3, desc: '获得5能量和随机3张4-5阶【逐鹿】英雄牌。', gain(p) { p.energy += 5; for (let i = 0; i < 3; i++) G.giveHero(p, h => h.camp === '逐鹿' && h.q >= 4); } },
  { name: '河洛强援', q: 3, desc: '获得5能量和3张随机4-5阶【河洛】英雄牌。', gain(p) { p.energy += 5; for (let i = 0; i < 3; i++) G.giveHero(p, h => h.camp === '河洛' && h.q >= 4); } },
  { name: '强者恒强', q: 3, desc: '战斗开始时，你的已觉醒英雄获得50点物理攻击力和50点法术攻击力。若所有己方英雄已觉醒，则再获得20%物理及法术吸血。', bSetup(p, t, B, side) { const us = B.unitsOf(side).filter(x => x.src && !x.summon); const all = us.every(x => x.src.awake); us.filter(x => x.src.awake).forEach(x => { x.patk += 50; x.matk += 50; if (all) x.ls += 0.2; }); } },
  { name: '随机强化', q: 3, desc: '战斗开始时，你品阶最高的1名英雄等级永久+9。', onBattleStart(p) { const u = U.maxBy(G.heroUnits(p), u => HD[u.hid].q * 1000 + u.lv); u && G.lvUp(p, u, 9); } },
  { name: '破败神威', q: 3, desc: '战斗开始时，你的英雄普攻附带敌人最大生命值3%的法术伤害。', bSetup(p, t, B, side) { B.unitsOf(side).forEach(x => x.botrk = 0.03); } },
  { name: '全副武装', q: 3, desc: '获得1张基础装备牌。战斗开始时，你至少穿戴2件装备的英雄获得15%伤害加成和减免。', gain(p) { G.giveCard(p, G.equipCard(U.pick(BASIC_EQUIPS))); }, bSetup(p, t, B, side) { B.unitsOf(side).filter(x => x.src && x.src.equips.length >= 2).forEach(x => { x.amp += 0.15; x.dr += 0.15; }); } },
  { name: '三人游', q: 3, desc: '随机获得3张4-5阶英雄牌。', gain(p) { for (let i = 0; i < 3; i++) G.giveHero(p, h => h.q >= 4); } },
  { name: '补给线：牺牲', q: 3, desc: '获得1张牺牲效果英雄牌。回合开始时，再获得1张。', gain(p) { G.giveHero(p, descHas('牺牲')); }, onRoundStart(p) { G.giveHero(p, descHas('牺牲')); } },
  { name: '搏命', q: 3, desc: '棋手生命值-20，获得25能量。', gain(p) { p.hp -= 20; p.energy += 25; }, ok: p => p.hp > 25 },
  { name: '大明星', q: 3, desc: '获得1张大明星：随机上阵1名不在场的等级为棋手等级×7的5阶英雄，其觉醒进度为1，此后每经过2回合则额外+1。', gain(p) { giveEff(p, '大明星'); } },
];
const TALENT_MAP = {}; TALENTS.forEach(t => TALENT_MAP[t.name] = t);

// ======================= 棋手 =======================
const MASTERS = {
  '小妲己': {
    name: '小妲己', skill: '怦然心动', desc: '每购买4张牌，小妲己随机获得1张效果牌。', exclusive: '心之引力', exDesc: '心之引力：获得4次临时刷新。接下来4次刷新时，商店里的牌购买消耗-1。',
    onBuy(p) { p.ms.buy = (p.ms.buy || 0) + 1; if (p.ms.buy % 4 === 0) { giveEff(p, G.randEffectName(e => e.q <= Math.min(5, p.lv) && !/^转瞬/.test(e.desc))); p.ms.heart = (p.ms.heart || 0) + 1; if (p.ms.heart === 5) giveEff(p, '心之引力'); } },
  },
  '瑶妹': {
    name: '瑶妹', ears: true, skill: '可爱小鹿', desc: '游戏开始时，瑶召唤自己心爱的小鹿前来助阵，小鹿每回合等级+2，如果上回合战斗胜利，等级额外+4。', exclusive: '神奇小鹿', exDesc: '神奇小鹿·嘲讽：开战后小鹿在敌人之间移动，每3秒嘲讽1次周围1格敌人，等级+8。',
    init(p) { p.ms.deer = 1; },
    onRoundStart(p) { if (G.round > 1) p.ms.deer += 2 + (p.lastWin ? 4 : 0); if (G.round % 3 === 0 && G.round > 0) giveEff(p, '神奇小鹿'); },
    bSetup(p, B, side) { B.summon(side, { name: '小鹿', lv: p.ms.deer, hp: 240, patk: 18, g: [30, 1.4], range: 1, color: '#f7b3d0', taunt: p.ms.deerTaunt, noCollide: p.ms.deerTaunt, pdef: 20 }, side === 0 ? 7 : 0, 3, p); },
  },
  '弈星': {
    name: '弈星', skill: '棋道万象', desc: '本回合战斗开始时，弈星随机复制1名敌方英雄。', exclusive: '驭势', exDesc: '驭势：战斗开始时，将敌方场上所有英雄复制进你的手牌。',
    onRoundStart(p) { if ([4, 8, 12].includes(G.round)) giveEff(p, '驭势'); },
    bSetup(p, B, side) { const e = U.pick(B.unitsOf(1 - side).filter(x => x.src && !x.summon && !x.totem)); if (e) B.cloneUnit(e, side); },
    onBattleStart(p, enemy) { if (p.rc.yushi && enemy) G.heroUnits(enemy).forEach(u => G.giveCard(p, G.heroCard(u.hid, { gift: true }))); },
  },
  '香香': {
    name: '香香', skill: '究极弩炮', desc: '战斗开始时，香香会使用武器攻击敌人。香香初始攻击力为20，每拥有1名不低于10级的1-3阶英雄，香香的攻击力+20。', exclusive: '武器改造', exDesc: '武器改造：香香攻击力+20%，弩炮溅射。',
    bSetup(p, B, side) { const n = B.unitsOf(side).filter(x => x.src && !x.summon && x.h.q <= 3 && x.lv >= 10).length; B.turret = B.turret || {}; B.turret[side] = { atk: (20 + 20 * n) * (1 + 0.2 * (p.ms.gunMod || 0)), cd: 1, splash: !!p.ms.gunMod }; },
    onDealDamage(p, n) { p.ms.dmg = (p.ms.dmg || 0) + n; const th = [10, 25, 45, 75]; const k = p.ms.gunGot || 0; if (k < th.length && p.ms.dmg >= th[k]) { p.ms.gunGot = k + 1; giveEff(p, '武器改造'); } },
  },
  '庄小鱼': {
    name: '庄小鱼', skill: '梦隐游戏', desc: '庄小鱼升级时，会随机获得1张效果牌。', exclusive: '如梦似幻', exDesc: '如梦似幻：消耗6能量，基于场上阵容获取一套梦幻手牌。',
    onLevelUp(p) { giveEff(p, G.randEffectName(e => e.q <= Math.min(5, p.lv) && !/^转瞬/.test(e.desc))); if (p.lv === 5) giveEff(p, '如梦似幻'); },
  },
  '乔汐': {
    name: '乔汐', skill: '温柔呼唤', desc: '使用技能（2能量），随机获得1张1-5阶的转瞬英雄牌。', exclusive: '潮汐的交响', exDesc: '潮汐的交响：场上随机5名英雄等级+4。',
    active: { cost: () => 2, use(p) { const c = G.drawHero(h => true, false); c.flash = true; c.gift = true; c.name = c.name; G.giveCard(p, c); } },
    onRoundStart(p) { if (G.round % 4 === 0) giveEff(p, '潮汐的交响'); },
  },
  '闹闹': {
    name: '闹闹', skill: '派对泡泡', desc: '使用技能，从随机2个阵营中选择1个，之后技能替换为：花费1点能量，获得1张该阵营的英雄牌。', exclusive: '朋友多多', exDesc: '朋友多多：随机获得4张技能所选阵营的英雄牌。',
    active: {
      cost: p => p.ms.camp ? 1 : 0,
      use(p) {
        if (!p.ms.camp) { const cs = U.sample(CAMPS.filter(c => c !== '无阵营'), 2); G.ask(p, { title: '派对泡泡：选择阵营', options: cs.map(c => ({ label: CAMP_SHORT[c], desc: `之后花费1能量，获得1张【${CAMP_SHORT[c]}】英雄牌`, value: c })) }, v => p.ms.camp = v); return; }
        G.giveHero(p, h => h.camp === p.ms.camp && h.q <= Math.max(2, p.lv));
        if (!p.ms.party && G.byCamp(p, p.ms.camp).length >= 6) { p.ms.party = 1; giveEff(p, '朋友多多'); }
      },
    },
  },
  '常小娥': {
    name: '常小娥', ears: true, skill: '小菟助力', desc: '使用技能（2能量），小菟随机助力1名英雄，使其等级+2。本场比赛中，小菟每助力过1次，等级提升效果+1。', exclusive: '小菟送福', exDesc: '小菟送福：对场上的随机4名英雄各触发1次小菟助力。',
    boost(p, u) { G.lvUp(p, u, 2 + (p.ms.tu || 0)); p.ms.tu = (p.ms.tu || 0) + 1; const s = U.sum(G.heroUnits(p), x => x.lv); const th = [50, 175, 400]; const k = p.ms.tuGot || 0; if (k < 3 && s >= th[k]) { p.ms.tuGot = k + 1; giveEff(p, '小菟送福'); } },
    active: { cost: () => 2, can: p => G.heroUnits(p).length > 0, use(p) { MASTERS['常小娥'].boost(p, U.pick(G.heroUnits(p))); } },
  },
  '姜导': {
    name: '姜导', skill: '钦定主角', desc: '使用技能，指定1名英雄成为主角：每打出2张英雄或效果牌，等级+1（每回合最多+5）。', exclusive: '封神一瞬', exDesc: '封神一瞬：指定1名英雄，使其每次等级永久提升时，都额外+1级。',
    active: { cost: () => 0, target: true, use(p, u) { G.heroUnits(p).forEach(v => v.st.star1 = false); u.st.star1 = true; } },
    onAnyCard(p, c) { const u = G.heroUnits(p).find(v => v.st.star1); if (!u) return; p.rc.jd = (p.rc.jd || 0) + 1; if (p.rc.jd % 2 === 0 && (p.rc.jdg || 0) < 5) { p.rc.jdg = (p.rc.jdg || 0) + 1; G.lvUp(p, u, 1); } if (!p.ms.fs && G.heroUnits(p).some(v => v.lv >= 25)) { p.ms.fs = 1; giveEff(p, '封神一瞬'); } },
  },
  '白歌': {
    name: '白歌', skill: '神来之笔', desc: '每进行4次英雄合成，白歌获得1张即兴创作（随机获得场上1名英雄的复制）。', exclusive: '灵感爆发', exDesc: '灵感爆发：获得场上英雄牌各1张。',
    onMerge(p) { p.ms.bg = (p.ms.bg || 0) + 1; if (p.ms.bg % 4 === 0) giveEff(p, '即兴创作'); },
  },
};
Object.entries(MASTERS).forEach(([k, m]) => m.key = k);

// ======================= 拍卖 =======================
const Auction = {
  start(type) {
    const al = G.alive();
    const lots = [];
    for (let i = 0; i < al.length; i++) {
      if (type === 'A') { const c = G.drawHero(h => h.q >= 2 && h.q <= 3 && !lots.some(l => l.hid === h.id)); lots.push({ hid: c.hid, cards: [c, G.heroCard(c.hid, { gift: true })], title: `${c.name} ×2`, q: c.q }); }
      else if (type === 'B') { const c = G.drawHero(h => h.q >= 4 && !lots.some(l => l.hid === h.id)); lots.push({ hid: c.hid, cards: [c, G.heroCard(c.hid, { gift: true })], title: `${c.name} ×2`, q: c.q }); }
      else { const e = U.pick(EFFECT_DATA.filter(e => e.q === 6 && !lots.some(l => l.name === e.name))); lots.push({ name: e.name, cards: [G.effCard(e.name)], title: e.name, q: 6 }); }
    }
    this.type = type; this.lots = lots; this.idx = 0; this.results = []; this.divPool = 0; this.won = {};
    UI.onAuction(this);
  },
  aiBid(p, lot) {
    if (this.won[p.id]) return 0;
    const base = this.type === 'A' ? U.int(2, 6) : this.type === 'B' ? U.int(4, 10) : U.int(5, 14);
    const synergy = lot.hid && G.heroUnits(p).some(u => u.hid === lot.hid) ? 3 : 0;
    return Math.max(0, Math.min(p.energy, base + synergy - (U.chance(0.3) ? 3 : 0)));
  },
  // 暗标：出价最高者获得，同价先出价者得；未拍得者不付费
  settle(humanBid) {
    const lot = this.lots[this.idx];
    const bids = G.alive().map(p => ({ p, v: p.human ? Math.min(p.energy, humanBid) : this.aiBid(p, lot), t: p.human ? 0.5 : U.rnd() }));
    bids.sort((a, b) => b.v - a.v || a.t - b.t);
    const top = bids[0];
    let res = { lot, bids };
    if (top.v > 0) {
      top.p.energy -= top.v; this.divPool += top.v; this.won[top.p.id] = true;
      lot.cards.forEach(c => G.giveCard(top.p, c));
      res.winner = top.p; res.price = top.v;
    } else {
      // 无人出价：流拍，卡牌退回
      lot.cards.forEach(c => c.kind === 'hero' && !c.gift && G.pool[c.hid]++);
    }
    this.results.push(res); this.idx++;
    return res;
  },
  finish() {
    const al = G.alive();
    // 分红：按损失生命加权，生命越低分得越多
    const ws = al.map(p => CFG.START_HP + 5 - Math.max(0, p.hp));
    const tot = U.sum(ws); let given = 0;
    const div = al.map((p, i) => { const v = Math.floor(this.divPool * ws[i] / tot); given += v; return v; });
    let rest = this.divPool - given;
    const order = al.map((p, i) => i).sort((a, b) => al[a].hp - al[b].hp);
    for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) div[order[k]]++;
    al.forEach((p, i) => { p.energy += div[i]; p.pending.div = div[i]; });
    // 拍卖后：每人获得1张随机基础装备，棋手经验+2
    al.forEach(p => { G.giveCard(p, G.equipCard(U.pick(BASIC_EQUIPS))); G.addXp(p, 2); });
    return div;
  },
};

// 棋手主动技能：同一回合内每多使用1次，消耗+1能量
Object.values(MASTERS).forEach(m => {
  if (!m.active) return;
  const cost = m.active.cost, use = m.active.use;
  m.active.cost = p => { const b = cost(p); return b > 0 ? b + (p.rc.skillUses || 0) : b; };
  m.active.use = (p, u) => { if (cost(p) > 0) p.rc.skillUses = (p.rc.skillUses || 0) + 1; return use(p, u); };
});
