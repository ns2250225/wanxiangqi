const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, JSON, setTimeout, process_argv: process.argv[2], performance: { now: () => Date.now() }, window: { addEventListener() {} }, document: { createElement() { return { getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }), toDataURL: () => '' }; } } };
vm.createContext(ctx);
const code = ['util', 'data', 'art', 'game', 'content', 'battle', 'ai'].map(n => fs.readFileSync(__dirname + '/../js/' + n + '.js', 'utf8')).join('\n');
vm.runInContext(code + '\n' + fs.readFileSync(__dirname + '/harness.js', 'utf8') + (process.argv[3] ? fs.readFileSync(__dirname + '/' + process.argv[3], 'utf8') : ''), ctx);
