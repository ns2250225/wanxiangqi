// 界面：棋手选择 / 准备阶段（拖拽上阵、商店、手牌）/ 选择弹窗 / 战斗观战 / 拍卖 / 结算
const UI = {
  queue: [], cur: null, speed: 1, sel: null, drag: null, timer: CFG.PREP_TIME, viewing: null, mode: null, logs: [],

  $(id) { return document.getElementById(id); },
  img(c) { return `<img src="${Art.url(c)}" draggable="false">`; },
  cardArt(c) {
    if (c.kind === 'hero') return Art.hero(HD[c.hid], 128);
    if (c.kind === 'equip') return Art.emblem(c.name, 'equip', c.q, null, 128);
    if (c.kind === 'talent') return Art.emblem(c.name, 'talent', c.q, null, 128);
    const e = ED[c.name] || {}; return Art.emblem(c.name, 'effect', c.q, CAMPS.includes(e.cat) ? e.cat : null, 128);
  },

  // ---------------- 初始化 ----------------
  init() {
    const st = this.$('stage');
    st.innerHTML = `
      <div id="top"></div>
      <div id="left"><div id="players"></div><div id="master"></div></div>
      <div id="center">
        <div id="boardHead"></div>
        <div id="board"></div>
        <div id="shopWrap" data-zone="sell"><div id="shop"></div><div id="shopBtns"></div><div class="sellHint">拖到此处出售（+1能量）</div></div>
        <div id="hand" data-zone="hand"></div>
        <div id="battleView" class="hidden"><div id="bvHead"></div><canvas id="bvCanvas" width="850" height="760"></canvas><div id="bvResult" class="hidden"></div></div>
      </div>
      <div id="right"><div id="info"></div><div id="mine"></div><div id="log"></div></div>
      <div id="modal" class="hidden"></div>
      <div id="overlay" class="hidden"></div>`;
    window.addEventListener('resize', () => this.fit()); this.fit();
    st.addEventListener('pointerdown', e => this.onDown(e));
    window.addEventListener('pointermove', e => this.onMove(e));
    window.addEventListener('pointerup', e => this.onUp(e));
    st.addEventListener('contextmenu', e => { e.preventDefault(); this.sel = null; this.mode = null; this.render(); });
    setInterval(() => this.tick(), 1000);
    this.menu();
  },
  fit() {
    const st = this.$('stage'), s = Math.min(innerWidth / 1600, innerHeight / 900);
    this.scale = s;
    st.style.transform = `scale(${s})`;
    st.style.left = (innerWidth - 1600 * s) / 2 + 'px'; st.style.top = (innerHeight - 900 * s) / 2 + 'px';
  },

  // ---------------- 棋手选择 ----------------
  menu() {
    const ov = this.$('overlay'); ov.classList.remove('hidden');
    ov.innerHTML = `<div class="menu"><h1>王者万象棋</h1><div class="sub">六人自走棋 · 选择你的棋手</div><div class="masters">${Object.values(MASTERS).map(m => `
      <div class="mcard" data-mk="${m.key}">${this.img(Art.master(m, 128))}<div class="mname">${m.name}</div>
      <div class="mskill">【${m.skill}】${U.esc(m.desc)}</div><div class="mex">专属卡【${m.exclusive}】${U.esc(m.exDesc || '')}</div></div>`).join('')}</div>
      <div class="menuBtns"><button id="helpBtn">玩法说明</button></div></div>`;
    ov.querySelectorAll('.mcard').forEach(el => el.onclick = () => { ov.classList.add('hidden'); this.logs = []; this.$('log').innerHTML = ''; G.newGame(el.dataset.mk); });
    this.$('helpBtn').onclick = () => this.help();
  },
  help() {
    this.showPanel(`<h2>玩法说明</h2><div class="help">
      <p><b>目标：</b>6名棋手对战，每人60点生命，最后存活者获胜。</p>
      <p><b>能量：</b>每回合发放能量（1-3回合6点，4-7回合8点，8-11回合12点，12回合起15点），<b>未用完的能量可保留</b>。英雄牌3能量，刷新1能量，出售+1能量。</p>
      <p><b>商店：</b>每回合4张英雄牌+2张效果牌，可锁定。棋手等级越高，高阶卡出现概率越高。</p>
      <p><b>合成与等级：</b>打出场上已有英雄的同名牌 → 合成，等级+1并再次触发登场效果；同一英雄合成满4张 → <b>觉醒</b>（属性提升、效果翻倍）。英雄10/40/100级时技能强化。</p>
      <p><b>棋手升级：</b>购买经验升级，每级提升获得1个天赋（3选1），3级/5级人口+1，6级获得棋手专属卡。</p>
      <p><b>关键词：</b>登场（打出时）、整备（每回合开始）、开团（战斗开始）、牺牲（阵亡时）、退场（出售时）、凯旋/败阵（战斗胜/负后）、夺取、闪现（开战跃至敌后）、临时等级（仅本回合）、转瞬（回合结束销毁）。</p>
      <p><b>战斗：</b>英雄自动移动、攻击、回蓝放技能。战败方受到 1+⌈回合/2⌉+敌方存活英雄数 点伤害。</p>
      <p><b>拍卖：</b>第3/7/11回合后举行暗标拍卖，拍卖所得按血量分红给所有棋手，并各获得1件基础装备和2点经验。</p>
      <p><b>操作：</b>拖拽手牌到棋盘打出（装备/指定牌拖到英雄身上）；拖拽英雄调整站位；拖到商店区出售。也可点击选中后再点击目标，右键取消。</p></div>`);
  },
  showPanel(html, btn = '知道了', cb) {
    const m = this.$('modal'); m.classList.remove('hidden');
    m.innerHTML = `<div class="box">${html}<div class="btns"><button id="panelOk">${btn}</button></div></div>`;
    this.$('panelOk').onclick = () => { m.classList.add('hidden'); cb ? cb() : (this.cur ? this.showAsk() : this.nextAsk()); };
  },

  // ---------------- 回调 ----------------
  onLog(msg) {
    this.logs.push(`<div><span class="lr">R${G.round}</span> ${U.esc(msg)}</div>`);
    if (this.logs.length > 80) this.logs.shift();
    const l = this.$('log'); if (l) { l.innerHTML = '<div class="ptitle">日志</div>' + this.logs.join(''); l.scrollTop = 1e6; }
  },
  onRoundStart() {
    this.timer = CFG.PREP_TIME; this.sel = null; this.mode = null; this.viewing = null;
    this.$('battleView').classList.add('hidden');
    const div = G.human.pending.div; if (div != null) { G.human.pending.div = null; }
    this.render();
  },
  tick() {
    if (G.phase !== 'prep') return;
    if (this.cur || !this.$('modal').classList.contains('hidden')) return;
    this.timer--;
    if (this.timer <= 0) this.ready();
    else { const t = this.$('timer'); if (t) { t.textContent = this.timer; t.classList.toggle('urgent', this.timer <= 10); } }
  },
  ready() {
    if (G.phase !== 'prep' || this.cur) return;
    this.sel = null; this.mode = null; this.viewing = null;
    G.endPrep();
  },

  // ---------------- 渲染 ----------------
  render() {
    if (!G.human) return;
    const p = G.human, M = MASTERS[p.mk];
    const need = p.lv < 6 ? CFG.XP_NEED[p.lv] : 0;
    const nextA = [3, 7, 11].find(r => r >= G.round);
    this.$('top').innerHTML = `
      <div class="tt">第 <b>${G.round}</b> 回合 · ${G.phase === 'prep' ? '准备阶段' : G.phase === 'battle' ? '战斗阶段' : G.phase === 'auction' ? '拍卖' : ''}</div>
      <div class="ti">⏱ <b id="timer" class="${this.timer <= 10 ? 'urgent' : ''}">${this.timer}</b></div>
      <div class="ti hp">❤ <b>${p.hp}</b></div>
      <div class="ti en">⚡ <b>${p.energy}</b><small> 本回合收入${CFG.income(G.round)}</small></div>
      <div class="ti">棋手 Lv<b>${p.lv}</b> ${p.lv < 6 ? `<span class="xpbar"><i style="width:${p.xp / need * 100}%"></i></span>${p.xp}/${need}` : '(满级)'}</div>
      <div class="ti">人口 <b>${G.popUsed(p)}/${G.pop(p)}</b></div>
      ${p.core ? `<div class="ti core">阿科米亚核心 <b>${p.core}</b></div>` : ''}
      <div class="ti small">${nextA ? `第${nextA}回合后拍卖` : ''}</div>
      <div class="ti"><button id="helpBtn2">说明</button></div>
      <button id="readyBtn" ${G.phase !== 'prep' ? 'disabled' : ''}>开 战</button>`;
    this.$('readyBtn').onclick = () => this.ready();
    this.$('helpBtn2').onclick = () => this.help();
    this.renderPlayers(); this.renderMaster(); this.renderBoard(); this.renderShop(); this.renderHand(); this.renderMine();
    if (!this.infoLocked) this.renderInfo();
  },
  renderPlayers() {
    const ps = G.players.slice().sort((a, b) => (b.alive - a.alive) || (b.hp - a.hp));
    this.$('players').innerHTML = '<div class="ptitle">棋手</div>' + ps.map(q => `
      <div class="pl ${q.human ? 'me' : ''} ${q.alive ? '' : 'dead'} ${this.viewing === q ? 'viewing' : ''}" data-pid="${q.id}">
        ${this.img(Art.master(MASTERS[q.mk], 64))}
        <div class="pli"><div class="pln">${U.esc(q.name)} <small>${MASTERS[q.mk].name} Lv${q.lv}</small></div>
        <div class="hpb"><i style="width:${Math.max(0, q.hp) / CFG.START_HP * 100}%"></i><span>${q.alive ? q.hp : '第' + q.place + '名'}</span></div>
        <div class="plm">${q.alive ? `${G.heroUnits(q).length}名英雄 · ${q.streakW > 1 ? q.streakW + '连胜' : q.streakL > 1 ? q.streakL + '连败' : ''}` : '已淘汰'}</div></div></div>`).join('');
    this.$('players').querySelectorAll('.pl').forEach(el => el.onclick = () => {
      const q = G.players[+el.dataset.pid];
      this.viewing = (q.human || this.viewing === q || !q.alive) ? null : q; this.sel = null; this.render();
    });
  },
  renderMaster() {
    const p = G.human, M = MASTERS[p.mk], A = M.active;
    let btn = '';
    if (A) {
      const cost = A.cost(p), can = G.phase === 'prep' && p.energy >= cost && (!A.can || A.can(p));
      btn = `<button id="skillBtn" ${can ? '' : 'disabled'} class="${this.mode === 'skill' ? 'on' : ''}">使用技能 (${cost}⚡)</button>`;
    }
    this.$('master').innerHTML = `<div class="ptitle">我的棋手</div><div class="mrow">${this.img(Art.master(M, 96))}<div><b>${M.name}</b><div class="msk">【${M.skill}】</div></div></div>
      <div class="mdesc">${U.esc(M.desc)}</div><div class="mdesc ex">专属【${M.exclusive}】：${U.esc(M.exDesc || '')}</div>${btn}`;
    const sb = this.$('skillBtn');
    if (sb) sb.onclick = () => {
      if (A.target) { this.mode = this.mode === 'skill' ? null : 'skill'; this.sel = null; this.render(); return; }
      p.energy -= A.cost(p); G.guard(() => A.use(p)); this.render();
    };
  },
  unitHtml(u, owner) {
    const h = HD[u.hid], L = G.totalLv(u);
    const pips = u.awake ? '<span class="aw">觉醒</span>' : [1, 2, 3, 4].map(i => `<i class="${i <= u.prog ? 'on' : ''}"></i>`).join('');
    return `<div class="unit q${h.q} ${u.awake ? 'awake' : ''}" ${owner ? `data-drag="unit" data-idx="${G.posOf(owner, u)}"` : ''}>
      ${this.img(Art.hero(h, 128))}
      <div class="ulv">${L}${u.temp ? `<small>(${u.temp > 0 ? '+' : ''}${u.temp})</small>` : ''}</div>
      <div class="upips">${pips}</div>
      <div class="ueq">${u.equips.map(e => `<span class="eqi q${QD[e] ? QD[e].q : 1}" title="${U.esc(e)}">${e[0]}</span>`).join('')}</div></div>`;
  },
  renderBoard() {
    const p = this.viewing || G.human, mine = !this.viewing;
    this.$('boardHead').innerHTML = mine
      ? `<span>我的棋盘</span><span class="hintF">↑ 前排（靠近敌人）</span><span class="bh2">${this.modeHint()}</span>`
      : `<span>查看：${U.esc(p.name)}（${MASTERS[p.mk].name}）</span><button id="backBtn">返回我的棋盘</button>`;
    if (!mine) this.$('backBtn').onclick = () => { this.viewing = null; this.render(); };
    const sc = this.sel != null ? p.hand[this.sel] : null;
    let html = '';
    for (let i = 0; i < 28; i++) {
      const u = p.board[i];
      let cls = 'cell' + (Math.floor(i / 7) === 0 ? ' front' : '');
      if (mine && sc) {
        if (sc.kind === 'hero') { if ((!u && G.popUsed(p) < G.pop(p)) || (u && u.hid === sc.hid)) cls += ' valid'; }
        else if (G.cardNeedsTarget(sc) && u && G.canTarget(p, sc, u)) cls += ' valid';
      }
      if (mine && this.mode === 'skill' && u) cls += ' valid';
      if (mine && this.selU === u && u) cls += ' selected';
      html += `<div class="${cls}" data-cell="${i}">${u ? this.unitHtml(u, mine ? p : null) : ''}</div>`;
    }
    const bd = this.$('board'); bd.innerHTML = html;
    bd.querySelectorAll('.cell').forEach(el => {
      el.onclick = e => { if (e.target.closest('[data-drag]')) return; this.clickCell(+el.dataset.cell); };
      el.onmouseenter = () => { const u = p.board[+el.dataset.cell]; if (u && !this.drag) this.renderInfo({ unit: u, owner: p }); };
    });
  },
  modeHint() {
    if (this.mode === 'skill') return '选择一名英雄作为技能目标（右键取消）';
    const c = this.sel != null ? G.human.hand[this.sel] : null;
    if (!c) return '';
    if (c.kind === 'hero') return `点击空格上阵【${c.name}】，或点击同名英雄合成`;
    if (G.cardNeedsTarget(c)) return `选择【${c.name}】的目标英雄`;
    return '';
  },
  cardHtml(c, attrs = '', extra = '') {
    const tag = c.kind === 'hero' ? CAMP_SHORT[HD[c.hid].camp] : c.kind === 'equip' ? '装备' : (ED[c.name] && ED[c.name].cat && CAMPS.includes(ED[c.name].cat) ? CAMP_SHORT[ED[c.name].cat] : c.master ? '专属' : '效果');
    const tagCol = c.kind === 'hero' ? CAMP_COLOR[HD[c.hid].camp][1] : c.kind === 'equip' ? '#8a6d3b' : '#5b5f99';
    return `<div class="card q${c.q} k-${c.kind} ${c.flash ? 'flash' : ''}" ${attrs}>
      ${this.img(this.cardArt(c))}
      <div class="ctag" style="background:${tagCol}">${tag}</div>
      ${c.flash ? '<div class="cflash">转瞬</div>' : ''}
      ${c.lv > 1 ? `<div class="clv">Lv${c.lv}</div>` : ''}
      <div class="cq">${Q_NAME[c.q] || ''}</div>${extra}</div>`;
  },
  renderShop() {
    const p = G.human;
    this.$('shop').innerHTML = p.shop.map((c, i) => c
      ? this.cardHtml(c, `data-drag="shop" data-idx="${i}"`, `<div class="cost ${p.energy < c.cost ? 'poor' : ''}">${c.cost}⚡</div>${c.kind === 'hero' && G.heroUnits(p).some(u => u.hid === c.hid) ? '<div class="own">已拥有</div>' : ''}`)
      : '<div class="card empty"></div>').join('');
    this.$('shop').querySelectorAll('.card:not(.empty)').forEach(el => el.onmouseenter = () => !this.drag && this.renderInfo({ card: p.shop[+el.dataset.idx] }));
    const need = p.lv < 6 ? CFG.XP_NEED[p.lv] - p.xp : 0;
    const rc = p.freeRefresh > 0 ? '免费' : (1 + (p.rc.refreshTax || 0)) + '⚡';
    this.$('shopBtns').innerHTML = `
      <button id="refBtn">刷新 <small>${rc}</small></button>
      <button id="lvBtn" ${p.lv >= 6 ? 'disabled' : ''}>升级 <small>${p.lv >= 6 ? '满级' : need + '⚡'}</small></button>
      <button id="lockBtn" class="${p.lock ? 'on' : ''}">${p.lock ? '已锁定' : '锁定'}</button>`;
    const pr = G.phase === 'prep';
    this.$('refBtn').onclick = () => { if (pr && G.doRefresh(p)) this.render(); };
    this.$('lvBtn').onclick = () => { if (pr && G.buyLevel(p)) this.render(); };
    this.$('lockBtn').onclick = () => { p.lock = !p.lock; this.render(); };
  },
  renderHand() {
    const p = G.human;
    this.$('hand').innerHTML = `<div class="htitle">手牌 ${p.hand.length}/${CFG.HAND_MAX}</div>` + p.hand.map((c, i) => this.cardHtml(c, `data-drag="hand" data-idx="${i}"`, this.sel === i ? '<div class="selmark"></div>' : '')).join('');
    this.$('hand').querySelectorAll('.card').forEach(el => el.onmouseenter = () => !this.drag && this.renderInfo({ card: p.hand[+el.dataset.idx], handIdx: +el.dataset.idx }));
  },
  renderMine() {
    const p = G.human;
    const camps = {}; G.heroUnits(p).forEach(u => { const k = HD[u.hid].camp; camps[k] = (camps[k] || 0) + 1; });
    const tot = G.totems(p);
    this.$('mine').innerHTML = `<div class="ptitle">阵容</div>
      <div class="camps">${Object.entries(camps).map(([k, v]) => `<span class="camp" style="background:${CAMP_COLOR[k][1]}">${CAMP_SHORT[k]} ×${v}</span>`).join('') || '<span class="dim">暂无英雄</span>'}</div>
      ${tot.length ? `<div class="camps">${tot.map(t => `<span class="camp totem">${t.name} Lv${t.lv}</span>`).join('')}</div>` : ''}
      <div class="ptitle">天赋</div><div class="tals">${p.talents.map(t => `<span class="tal q${TALENT_MAP[t] ? TALENT_MAP[t].q : 1}" data-t="${U.esc(t)}">${t}</span>`).join('') || '<span class="dim">升级棋手获得天赋</span>'}</div>`;
    this.$('mine').querySelectorAll('.tal').forEach(el => el.onmouseenter = () => this.renderInfo({ talent: el.dataset.t }));
  },

  // ---------------- 信息面板 ----------------
  heroInfo(h, u, owner) {
    const s = u ? G.stats(u) : null;
    const lv = u ? G.totalLv(u) : 1;
    const skE = (h.sk && h.sk.e || []).map(e => `<div class="ske ${lv >= e[0] ? 'on' : ''}"><b>${e[0]}级</b> ${U.esc(e[1])}</div>`).join('');
    const st = s || G.stats(G.newUnit(h.id));
    return `<div class="ih">${this.img(Art.hero(h, 128))}<div>
        <div class="iname">${h.name} <span class="qn q${h.q}">${Q_NAME[h.q]}</span></div>
        <div><span class="camp" style="background:${CAMP_COLOR[h.camp][1]}">${h.camp}</span> <span class="dim">${h.tpl || ''} ${h.role || ''}</span></div>
        ${u ? `<div>等级 <b>${lv}</b>${u.temp ? `（临时${u.temp > 0 ? '+' : ''}${u.temp}）` : ''} · ${u.awake ? '<b class="gold">已觉醒</b>' : `合成 ${u.prog}/4`}</div>` : ''}</div></div>
      <div class="stats"><span>❤ ${st.maxHp}</span><span>⚔ ${st.patk}</span>${st.matk ? `<span>✦ ${st.matk}</span>` : ''}<span>🛡 ${Math.round(st.pdef)}/${Math.round(st.mdef)}</span><span>攻速 ${st.aspd.toFixed(2)}</span><span>射程 ${st.range}</span><span>法力 ${st.mpMax >= 9999 ? '-' : st.mpMax}</span></div>
      ${(h.kw || []).length ? `<div class="kws">${h.kw.map(k => `<span>${k}</span>`).join('')}</div>` : ''}
      <div class="idesc">${U.esc(h.desc || '')}</div>
      ${h.sk ? `<div class="sk"><b>技能【${h.sk.n}】</b>${U.esc(h.sk.d)}</div>${skE}` : ''}
      ${u && u.equips.length ? `<div class="ptitle">装备</div>${u.equips.map((e, i) => `<div class="eqline"><b class="q${QD[e] ? QD[e].q : 1}c">${e}</b> <span class="dim">${U.esc(QD[e] ? QD[e].desc : '')}</span>${owner && owner.human && G.phase === 'prep' ? ` <button data-uneq="${i}">卸下</button>` : ''}</div>`).join('')}` : ''}
      ${u && owner && owner.human && G.phase === 'prep' ? `<div class="btns"><button id="sellUBtn">出售（+${u.flashCard ? 0 : 1}⚡）</button></div>` : ''}`;
  },
  renderInfo(o) {
    const el = this.$('info'); if (!el) return;
    if (!o) {
      if (this.selU && G.human.board.includes(this.selU)) o = { unit: this.selU, owner: G.human };
      else if (this.sel != null && G.human.hand[this.sel]) o = { card: G.human.hand[this.sel], handIdx: this.sel };
      else { el.innerHTML = '<div class="ptitle">详情</div><div class="dim">鼠标移到卡牌或英雄上查看详情。<br>拖动手牌到棋盘打出，拖到商店区出售。</div>'; return; }
    }
    let html = '<div class="ptitle">详情</div>';
    if (o.unit) html += this.heroInfo(HD[o.unit.hid], o.unit, o.owner);
    else if (o.card) {
      const c = o.card;
      if (c.kind === 'hero') html += this.heroInfo(HD[c.hid]);
      else {
        const d = c.kind === 'equip' ? QD[c.name] : ED[c.name];
        html += `<div class="ih">${this.img(this.cardArt(c))}<div><div class="iname">${c.name} <span class="qn q${c.q}">${Q_NAME[c.q] || ''}</span></div>
          <div class="dim">${c.kind === 'equip' ? '装备 · ' + (d ? d.type : '') : '效果牌' + (d && d.cat ? ' · ' + d.cat : '')}</div></div></div>
          <div class="idesc">${U.esc(d ? d.desc : '')}</div>
          ${c.kind === 'equip' && FORGE_TYPE[c.name] ? `<div class="dim">基础装备：穿戴后铸造（3选1）为【${FORGE_TYPE[c.name]}】类普通装备</div>` : ''}`;
        if (o.handIdx != null && G.phase === 'prep' && !G.cardNeedsTarget(c)) html += `<div class="btns"><button id="useBtn">使用</button></div>`;
      }
      if (o.handIdx != null && G.phase === 'prep') html += `<div class="btns"><button id="sellCBtn">出售（+${c.flash ? 0 : 1}⚡）</button></div>`;
    } else if (o.talent) {
      const t = TALENT_MAP[o.talent];
      html += `<div class="ih">${this.img(Art.emblem(o.talent, 'talent', t ? t.q : 1, null, 128))}<div><div class="iname">${o.talent}</div><div class="dim">${['', '铜', '银', '金'][t ? t.q : 1]}色天赋</div></div></div><div class="idesc">${U.esc(t ? t.desc : '')}</div>`;
    }
    el.innerHTML = html;
    const p = G.human;
    const ub = this.$('useBtn'); if (ub) ub.onclick = () => this.playHand(o.handIdx, null, -1);
    const sc = this.$('sellCBtn'); if (sc) sc.onclick = () => { G.sellCard(p, o.handIdx); this.sel = null; this.render(); };
    const su = this.$('sellUBtn'); if (su) su.onclick = () => { G.sellUnit(p, o.unit); this.selU = null; this.render(); };
    el.querySelectorAll('[data-uneq]').forEach(b => b.onclick = () => { G.unequip(p, o.unit, +b.dataset.uneq); this.render(); this.renderInfo({ unit: o.unit, owner: p }); });
  },

  // ---------------- 交互 ----------------
  playHand(idx, u, cell) {
    const p = G.human; if (G.phase !== 'prep') return;
    const c = p.hand[idx]; if (!c) return;
    if (c.kind === 'hero' && !G.heroUnits(p).some(x => x.hid === c.hid) && G.popUsed(p) >= G.pop(p)) { this.toast('人口已满，无法上阵新英雄'); return; }
    if (G.cardNeedsTarget(c) && (!u || !G.canTarget(p, c, u))) { this.toast('无效的目标'); return; }
    const ok = G.playCard(p, idx, u, cell);
    if (!ok) this.toast('无法使用这张牌');
    this.sel = null; this.render();
  },
  clickCell(i) {
    if (this.viewing || G.phase !== 'prep') return;
    const p = G.human, u = p.board[i];
    if (this.mode === 'skill') {
      if (!u) return; const A = MASTERS[p.mk].active;
      p.energy -= A.cost(p); G.guard(() => A.use(p, u)); this.mode = null; this.render(); return;
    }
    if (this.sel != null) {
      const c = p.hand[this.sel];
      if (c.kind === 'hero') return this.playHand(this.sel, null, u ? -1 : i);
      if (G.cardNeedsTarget(c)) { if (u) this.playHand(this.sel, u); return; }
      return this.playHand(this.sel, null, -1);
    }
    if (this.selU && !u) { G.moveUnit(p, G.posOf(p, this.selU), i); this.selU = null; this.render(); return; }
    this.selU = u || null; this.render();
  },
  clickDrag(d) {
    const p = G.human; if (G.phase !== 'prep') return;
    if (d.src === 'shop') { if (!G.buy(p, d.idx)) this.toast(p.hand.length >= CFG.HAND_MAX ? '手牌已满' : '能量不足'); this.render(); return; }
    if (d.src === 'hand') {
      const c = p.hand[d.idx];
      if (this.sel === d.idx) { if (c.kind === 'hero') this.playHand(d.idx, null, -1); else { this.sel = null; this.render(); } return; }
      this.sel = d.idx; this.selU = null; this.mode = null; this.render(); return;
    }
    if (d.src === 'unit') this.clickCell(d.idx);
  },
  onDown(e) {
    if (e.button !== 0) return;
    const t = e.target.closest('[data-drag]'); if (!t || this.viewing) return;
    this.drag = { el: t, src: t.dataset.drag, idx: +t.dataset.idx, x: e.clientX, y: e.clientY, moved: false };
  },
  onMove(e) {
    const d = this.drag; if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      if (G.phase !== 'prep') { this.drag = null; return; }
      d.moved = true; d.ghost = d.el.cloneNode(true); d.ghost.classList.add('ghost'); this.$('stage').appendChild(d.ghost);
      if (d.src === 'hand') { this.sel = d.idx; this.renderBoard(); }
      document.body.classList.add('dragging', 'drag-' + d.src);
    }
    if (d.moved) {
      const r = this.$('stage').getBoundingClientRect();
      d.ghost.style.left = (e.clientX - r.left) / this.scale - 45 + 'px'; d.ghost.style.top = (e.clientY - r.top) / this.scale - 60 + 'px';
    }
  },
  onUp(e) {
    const d = this.drag; this.drag = null; if (!d) return;
    if (!d.moved) return this.clickDrag(d);
    d.ghost.remove(); document.body.classList.remove('dragging', 'drag-hand', 'drag-shop', 'drag-unit');
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = under && under.closest('[data-cell]'), zone = under && under.closest('[data-zone]');
    const p = G.human;
    if (d.src === 'shop') { if (cellEl || (zone && zone.dataset.zone === 'hand')) { if (!G.buy(p, d.idx)) this.toast('能量不足或手牌已满'); } this.render(); return; }
    if (d.src === 'hand') {
      if (zone && zone.dataset.zone === 'sell') { G.sellCard(p, d.idx); this.sel = null; this.render(); return; }
      if (cellEl) { const i = +cellEl.dataset.cell, u = p.board[i], c = p.hand[d.idx]; if (c.kind === 'hero') this.playHand(d.idx, null, u ? -1 : i); else this.playHand(d.idx, u || null, -1); return; }
      this.sel = null; this.render(); return;
    }
    if (d.src === 'unit') {
      const u = p.board[d.idx];
      if (zone && zone.dataset.zone === 'sell') { G.sellUnit(p, u); this.selU = null; this.render(); return; }
      if (cellEl) G.moveUnit(p, d.idx, +cellEl.dataset.cell);
      this.render();
    }
  },
  toast(msg) {
    const t = U.el('div', 'toast', U.esc(msg)); this.$('stage').appendChild(t);
    setTimeout(() => t.remove(), 1600);
  },

  // ---------------- 选择弹窗 ----------------
  ask(q, cb) { this.queue.push({ q, cb }); if (!this.cur) this.nextAsk(); },
  nextAsk() {
    const it = this.queue.shift();
    if (!it) { this.cur = null; this.$('modal').classList.add('hidden'); this.render(); return; }
    this.cur = it; this.picked = []; this.showAsk();
  },
  showAsk() {
    const { q } = this.cur, n = Math.min(q.n || 1, q.options.length);
    const m = this.$('modal'); m.classList.remove('hidden');
    m.innerHTML = `<div class="box ask"><h2>${U.esc(q.title || '选择')}</h2>${n > 1 ? `<div class="dim">请选择 ${n} 项</div>` : ''}
      <div class="opts">${q.options.map((o, i) => {
        const sel = this.picked.includes(i) ? 'picked' : '';
        if (o.card) { const c = o.card, d = c.kind === 'hero' ? HD[c.hid].desc : c.kind === 'equip' ? (QD[c.name] || {}).desc : (ED[c.name] || {}).desc; return `<div class="opt ${sel}" data-i="${i}">${this.cardHtml(c)}<div class="odesc"><b>${c.name}</b><br>${U.esc(d || '')}</div></div>`; }
        const art = o.kind === 'talent' ? Art.emblem(o.label, 'talent', o.q, null, 96) : o.kind === 'equip' ? Art.emblem(o.label, 'equip', o.q, null, 96) : o.hid != null ? Art.hero(HD[o.hid], 96) : null;
        return `<div class="opt txt q${o.q || 0} ${sel}" data-i="${i}">${art ? this.img(art) : ''}<div class="odesc"><b>${U.esc(o.label)}</b><br>${U.esc(o.desc || '')}</div></div>`;
      }).join('')}</div>
      <div class="btns">${n > 1 ? `<button id="askOk" ${this.picked.length === n ? '' : 'disabled'}>确定</button>` : ''}<button id="peekBtn">查看棋盘</button></div></div>`;
    m.querySelectorAll('.opt').forEach(el => el.onclick = () => {
      const i = +el.dataset.i;
      if (n <= 1) return this.answer(q.options[i].value);
      const k = this.picked.indexOf(i); if (k >= 0) this.picked.splice(k, 1); else if (this.picked.length < n) this.picked.push(i);
      this.showAsk();
    });
    const ok = this.$('askOk'); if (ok) ok.onclick = () => this.answer(this.picked.map(i => q.options[i].value));
    this.$('peekBtn').onclick = () => { m.classList.add('hidden'); const b = U.el('button', 'peekBack', '返回选择'); b.onclick = () => { b.remove(); this.showAsk(); }; this.$('stage').appendChild(b); };
  },
  answer(v) {
    const it = this.cur; this.$('modal').classList.add('hidden');
    try { it.cb(v); } catch (e) { console.error(e); }
    this.cur = null; this.nextAsk();
  },

  // ---------------- 战斗 ----------------
  onBattles(battles) {
    this.render();
    const mine = battles.find(bt => bt.a.human || bt.b.human);
    for (const bt of battles) if (bt !== mine) B.simulate(bt);
    const bv = this.$('battleView'); bv.classList.remove('hidden');
    this.$('bvResult').classList.add('hidden');
    const opp = mine.a.human ? mine.b : mine.a;
    this.$('bvHead').innerHTML = `<span class="me">我</span> VS <span class="op">${U.esc(opp.name)}（${MASTERS[opp.mk].name}）</span>
      <span class="spd">${[1, 2, 4].map(s => `<button data-s="${s}" class="${this.speed === s ? 'on' : ''}">${s}×</button>`).join('')}<button data-s="skip">跳过</button></span>`;
    this.$('bvHead').querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
      this.speed = b.dataset.s === 'skip' ? 'skip' : +b.dataset.s;
      this.$('bvHead').querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b));
    });
    const prevSpeed = this.speed === 'skip' ? 1 : this.speed; this.speed = prevSpeed;
    B.play(mine, this.$('bvCanvas'), () => this.speed, () => { this.speed = prevSpeed; this.showResults(battles, mine); });
  },
  showResults(battles, mine) {
    const me = G.human;
    const res = mine.res, side = mine.a === me ? 0 : 1;
    const won = res.winner === side, draw = res.winner == null;
    const rows = battles.map(bt => {
      const w = bt.res.winner, an = bt.a.name, bn = bt.b.name;
      return `<div class="rrow ${bt === mine ? 'mine' : ''}"><span class="${w === 0 ? 'win' : w === 1 ? 'lose' : ''}">${U.esc(an)}</span> vs <span class="${w === 1 ? 'win' : w === 0 ? 'lose' : ''}">${U.esc(bn)}</span>
        <small>${w == null ? '平局' : (w === 0 ? an : bn) + ' 胜'} · ${w == null ? '双方' : (w === 0 ? bn : an)} -${bt.dmg || 0}</small></div>`;
    }).join('');
    const r = this.$('bvResult'); r.classList.remove('hidden');
    r.innerHTML = `<h2 class="${won ? 'win' : draw ? '' : 'lose'}">${won ? '胜 利' : draw ? '平 局' : '失 败'}</h2>
      <div>${won ? `对敌方造成 ${mine.dmg || 0} 点伤害` : `受到 ${mine.dmg || 0} 点伤害`} · 击杀 ${res.kills[side]}</div>
      <div class="rlist">${rows}</div><button id="contBtn">继续</button>`;
    this.$('contBtn').onclick = () => { this.$('battleView').classList.add('hidden'); G.afterBattles(); this.render(); };
    this.render();
  },

  // ---------------- 拍卖 ----------------
  onAuction(A) { this.A = A; this.render(); this.auctionLot(); },
  auctionLot() {
    const A = this.A, p = G.human, lot = A.lots[A.idx];
    const names = { A: '英雄拍卖会（2-3阶）', B: '英雄拍卖会（4-5阶）', C: '神器拍卖会（6阶效果）' };
    const already = A.won[p.id];
    this.bid = 0;
    const ov = this.$('overlay'); ov.classList.remove('hidden');
    ov.innerHTML = `<div class="auction"><h1>${names[A.type]}</h1><div class="dim">第 ${A.idx + 1}/${A.lots.length} 件 · 暗标竞价：出价最高者得，所有成交款将按生命值分红给所有棋手</div>
      <div class="lot">${lot.cards.map(c => this.cardHtml(c)).join('')}<div class="lotd"><b>${U.esc(lot.title)}</b><br>${U.esc(lot.hid != null ? HD[lot.hid].desc : (ED[lot.name] || {}).desc || '')}</div></div>
      <div class="bidrow">${already ? '<b>你已拍得一件拍品，本场不能再出价</b>' : `我的能量 ⚡${p.energy}　出价：<button id="bm">−</button><b id="bidV">0</b><button id="bp">＋</button><input id="bidR" type="range" min="0" max="${p.energy}" value="0">`}</div>
      <div class="btns"><button id="bidOk">${already ? '继续' : '出价'}</button>${already ? '' : '<button id="bidNo">不出价</button>'}</div></div>`;
    const upd = v => { this.bid = U.clamp(v, 0, p.energy); this.$('bidV').textContent = this.bid; this.$('bidR').value = this.bid; };
    if (!already) { this.$('bm').onclick = () => upd(this.bid - 1); this.$('bp').onclick = () => upd(this.bid + 1); this.$('bidR').oninput = e => upd(+e.target.value); this.$('bidNo').onclick = () => this.auctionSettle(0); }
    this.$('bidOk').onclick = () => this.auctionSettle(already ? 0 : this.bid);
  },
  auctionSettle(v) {
    const A = this.A, res = A.settle(v);
    const ov = this.$('overlay');
    ov.innerHTML = `<div class="auction"><h1>${U.esc(res.lot.title)}</h1>
      <div class="bids">${res.bids.map(b => `<div class="${b.p === res.winner ? 'win' : ''}">${U.esc(b.p.name)}：${b.v}⚡</div>`).join('')}</div>
      <h2>${res.winner ? `${U.esc(res.winner.name)} 以 ${res.price}⚡ 拍得！` : '流拍'}</h2><div class="btns"><button id="nextLot">${A.idx < A.lots.length ? '下一件' : '拍卖结束'}</button></div></div>`;
    this.render();
    this.$('nextLot').onclick = () => {
      if (A.idx < A.lots.length) return this.auctionLot();
      const div = A.finish(), al = G.alive();
      ov.innerHTML = `<div class="auction"><h1>拍卖分红</h1><div class="dim">成交总额 ${A.divPool}⚡，按损失生命加权分红；每名棋手额外获得1件基础装备与2点经验</div>
        <div class="bids">${al.map((q, i) => `<div class="${q.human ? 'win' : ''}">${U.esc(q.name)}（❤${q.hp}）：+${div[i]}⚡</div>`).join('')}</div>
        <div class="btns"><button id="aEnd">进入下一回合</button></div></div>`;
      this.$('aEnd').onclick = () => { ov.classList.add('hidden'); G.startRound(); };
    };
  },

  // ---------------- 结束 ----------------
  onGameOver() {
    const me = G.human;
    const al = G.alive().sort((a, b) => b.hp - a.hp);
    al.forEach((p, i) => { if (!p.place || p.alive) p.place = i + 1; });
    const ps = G.players.slice().sort((a, b) => a.place - b.place);
    const ov = this.$('overlay'); ov.classList.remove('hidden');
    ov.innerHTML = `<div class="auction over"><h1>${me.place === 1 ? '🏆 吃鸡！' : `第 ${me.place} 名`}</h1><div class="dim">共进行 ${G.round} 回合</div>
      <div class="bids">${ps.map(p => `<div class="${p.human ? 'win' : ''}">第${p.place}名　${U.esc(p.name)}（${MASTERS[p.mk].name}）${p.alive ? '❤' + p.hp : ''}</div>`).join('')}</div>
      <div class="btns"><button id="again">再来一局</button></div></div>`;
    this.$('again').onclick = () => { this.queue = []; this.cur = null; this.$('modal').classList.add('hidden'); this.$('battleView').classList.add('hidden'); this.menu(); };
  },
};
window.addEventListener('load', () => UI.init());
