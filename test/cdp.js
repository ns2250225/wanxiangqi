// 通过 CDP 驱动无头 Edge：加载页面、执行操作、截图、收集报错
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const url = 'file:///' + path.resolve(__dirname, '../index.html').split(path.sep).join('/');
const prof = path.resolve(__dirname, 'prof');
const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-port=9333', '--window-size=1600,900', '--user-data-dir=' + prof, '--no-first-run', 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); if (tabs.find(t => t.type === 'page')) break; } catch (e) {} await sleep(250); }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; const logs = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails).slice(0, 400));
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push('CON ' + d.params.args.map(a => a.value || a.description).join(' ').slice(0, 400)); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result.result ? r.result.result.value : r; };
  const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.resolve(__dirname, name + '.png'), Buffer.from(r.result.data, 'base64')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url }); await sleep(1500);
  const steps = JSON.parse(process.argv[2] || '[]');
  for (const s of steps) {
    if (s.shot) await shot(s.shot);
    if (s.js) { const v = await ev(s.js); if (v !== undefined) console.log('>', JSON.stringify(v).slice(0, 1500)); }
    const M = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    if (s.click) { const [x, y] = s.click; await M('mouseMoved', x, y, { buttons: 0 }); await M('mousePressed', x, y); await M('mouseReleased', x, y); await sleep(150); }
    if (s.drag) { const [x1, y1, x2, y2] = s.drag; await M('mouseMoved', x1, y1, { buttons: 0 }); await M('mousePressed', x1, y1); for (let k = 1; k <= 8; k++) { await M('mouseMoved', x1 + (x2 - x1) * k / 8, y1 + (y2 - y1) * k / 8); await sleep(20); } await M('mouseReleased', x2, y2); await sleep(150); }
    if (s.wait) await sleep(s.wait);
  }
  console.log(logs.join('\n') || 'no errors');
  ws.close(); require('child_process').spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F']); process.exit(0);
})();
