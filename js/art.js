// ImageGen 生成的游戏素材图集。Canvas 仅负责裁切、缩放与叠加动态文字。
const CAMP_COLOR = {
  '三分之地': ['#7a1f1f', '#e0533d', '#ffd27a'], '大河流域': ['#12402f', '#2f9e6e', '#b8f2c8'],
  '日落海': ['#1b2f5c', '#ff7a45', '#8fd3ff'], '河洛': ['#3b1d5e', '#9b59d0', '#f5d67b'],
  '逐鹿': ['#1a2a3a', '#3a78b5', '#e8eef5'], '无阵营': ['#2e2f36', '#7b8494', '#f2c46d'],
};
const Q_COLOR = ['#666', '#a7b1ba', '#52c46a', '#3f95ff', '#b06cff', '#ffa726', '#ff4d6d'];
const Q_NAME = ['', '一阶', '二阶', '三阶', '四阶', '五阶', '六阶'];
const ART_FILES = {
  heroes0: 'assets/generated/heroes-01.png', heroes1: 'assets/generated/heroes-02.png',
  heroes2: 'assets/generated/heroes-03.png', heroes3: 'assets/generated/heroes-04.png',
  heroes4: 'assets/generated/heroes-05.png', heroes5: 'assets/generated/heroes-06.png',
  masters: 'assets/generated/master-avatars.png', icons: 'assets/generated/card-icons.png',
  summons: 'assets/generated/summons.png', board: 'assets/generated/battle-board.png'
};

const Art = {
  cache: new Map(), images: {},
  init() {
    if (typeof Image === 'undefined') return;
    Object.entries(ART_FILES).forEach(([key, src]) => {
      const img = new Image();
      img.onload = () => { this.cache.clear(); if (typeof UI !== 'undefined' && UI.render) UI.render(); };
      img.src = src; this.images[key] = img;
    });
  },
  canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
  crop(g, key, cols, rows, index, size, fallback = '#151a28') {
    const img = this.images[key];
    if (!img || !img.complete || !img.naturalWidth) { g.fillStyle = fallback; g.fillRect(0, 0, size, size); return false; }
    const sw = img.naturalWidth / cols, sh = img.naturalHeight / rows;
    const sx = (index % cols) * sw, sy = Math.floor(index / cols) * sh;
    const inset = Math.max(2, Math.min(sw, sh) * .012);
    g.drawImage(img, sx + inset, sy + inset, sw - inset * 2, sh - inset * 2, 0, 0, size, size); return true;
  },
  label(g, text, size, y = size - 4) {
    const s = size / 128; g.font = `bold ${18 * s}px "Microsoft YaHei",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'bottom'; g.lineWidth = 4 * s; g.strokeStyle = '#000c';
    g.strokeText(text, size / 2, y); g.fillStyle = '#fff'; g.fillText(text, size / 2, y);
  },
  hero(h, size = 128) {
    const key = 'h' + h.id + '_' + size; if (this.cache.has(key)) return this.cache.get(key);
    const c = this.canvas(size, size), g = c.getContext('2d');
    const heroIndex = HERO_DATA.findIndex(x => x.id === h.id), atlas = Math.max(0, Math.floor(heroIndex / 16));
    this.crop(g, 'heroes' + atlas, 4, atlas === 5 ? 2 : 4, Math.max(0, heroIndex % 16), size, (CAMP_COLOR[h.camp] || CAMP_COLOR['无阵营'])[0]);
    this.label(g, h.name.length > 4 ? h.name.slice(0, 4) : h.name, size); this.cache.set(key, c); return c;
  },
  emblem(name, kind, q, camp, size = 128) {
    const key = 'e' + kind + name + q + size; if (this.cache.has(key)) return this.cache.get(key);
    const c = this.canvas(size, size), g = c.getContext('2d'); let index;
    if (kind === 'equip') index = U.hash(name) % 2 ? 4 : 5; else if (kind === 'talent') index = 6;
    else if (name.includes('古币')) index = 0; else if (name.includes('战术')) index = 1;
    else if (name.includes('券') || name.includes('人才') || name.includes('征召') || name.includes('英雄')) index = 2;
    else if (name.includes('能量') || name.includes('补贴')) index = 3; else index = 7;
    this.crop(g, 'icons', 4, 2, index, size); const qc = Q_COLOR[q] || '#999';
    g.strokeStyle = qc; g.lineWidth = Math.max(2, size / 32); g.strokeRect(2, 2, size - 4, size - 4);
    this.label(g, name.length > 6 ? name.slice(0, 6) : name, size); this.cache.set(key, c); return c;
  },
  master(m, size = 128) {
    const key = 'm' + m.key + size; if (this.cache.has(key)) return this.cache.get(key);
    const order = ['小妲己', '瑶妹', '弈星', '香香', '庄小鱼', '乔汐', '闹闹', '常小娥', '姜导', '白歌'];
    const c = this.canvas(size, size), g = c.getContext('2d'); this.crop(g, 'masters', 5, 2, Math.max(0, order.indexOf(m.key)), size);
    this.label(g, m.name, size); this.cache.set(key, c); return c;
  },
  summon(name, color, size = 96) {
    const key = 's' + name + size; if (this.cache.has(key)) return this.cache.get(key); let index = 5;
    if (name.includes('图腾')) index = 0; else if (name.includes('鹿')) index = 1;
    else if (name.includes('傀儡') || name.includes('机器人') || name.includes('机械')) index = 2;
    else if (name.includes('弩炮')) index = 3; else if (name.includes('士兵')) index = 4;
    const c = this.canvas(size, size), g = c.getContext('2d'); this.crop(g, 'summons', 3, 2, index, size, color || '#18202c');
    this.label(g, name.slice(0, 4), size); this.cache.set(key, c); return c;
  },
  url(canvas) { if (!canvas._url) canvas._url = canvas.toDataURL(); return canvas._url; },
  boardBg(w, h) {
    const c = this.canvas(w, h), g = c.getContext('2d'), img = this.images.board;
    if (img && img.complete && img.naturalWidth) {
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / scale, sh = h / scale;
      g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
      g.fillStyle = 'rgba(4,9,20,.18)'; g.fillRect(0, 0, w, h);
    } else { g.fillStyle = '#111a2b'; g.fillRect(0, 0, w, h); } return c;
  },
};
Art.init();
