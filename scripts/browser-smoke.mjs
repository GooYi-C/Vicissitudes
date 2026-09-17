#!/usr/bin/env node
// 可选 L2 浏览器冒烟：临时本地静态服务 + 全新浏览器资料；所有模型 fetch 被拦截。
// 不访问玩家浏览器资料、不提供真实 key、不替代真实服务商 CORS/人工 L3 验收。
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'dist')
const browser = process.argv[2] || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))
if (!browser || !existsSync(browser)) throw new Error('请以参数指定 Chromium/Edge 可执行文件')
if (!existsSync(join(dist, 'index.html'))) throw new Error('请先 pnpm build')
const profile = mkdtempSync(join(tmpdir(), 'vic-browser-smoke-'))
let child
const driver = `<script>
(() => {
  const attempts = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin && !url.pathname.startsWith('/api/')) return originalFetch(input, init);
    attempts.push('blocked');
    return Promise.reject(new Error('Offline smoke blocks model requests'));
  };
  const errors = [];
  const originalError=console.error.bind(console);
  console.error=(...args)=>{errors.push(args.map(x=>x?.message || String(x)).join(' ').slice(0,400));originalError(...args)};
  window.addEventListener('error', e => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', () => errors.push('unhandled rejection'));
  // 用本地网络等待真实时钟，让 IndexedDB 完成 IPC/落盘，不被虚拟计时器瞬间跑完。
  const wait = ms => originalFetch('/__smoke_wait?ms='+ms).then(()=>{});
  async function until(fn, label) {
    for (let i=0;i<100;i++) { if(fn()) return; await wait(50); }
    throw new Error('Timeout: '+label);
  }
  function result(value) {
    const node=document.createElement('pre');node.id='vic-smoke-result';node.textContent=encodeURIComponent(JSON.stringify(value));document.body.appendChild(node);
  }
  window.addEventListener('load', async () => {
    try {
      const stage=sessionStorage.getItem('vic-smoke-stage');
      if (!stage) {
        await until(()=>document.querySelectorAll('.vic-opening__era').length===5,'five era buttons');
        const buttons=[...document.querySelectorAll('.vic-opening__era')];
        (buttons.find(b=>/军阀|北洋/.test(b.textContent)) || buttons[2]).click();
        await until(()=>document.querySelector('textarea[aria-label="验收观测 JSON"]'),'settings and observations');
        if(document.querySelector('.vic-statusbar span').textContent.trim()!=='1921-07')throw new Error('Unexpected initial date');
        for(let i=0;i<12;i++) {
          const button=[...document.querySelectorAll('.vic-input button')].find(b=>b.textContent.trim()==='歇息一月');
          if(!button)throw new Error('Missing month action');
          await until(()=>!button.disabled,'previous save complete');
          button.click();await wait(30);
          await until(()=>!button.disabled,'current save complete');
        }
        if(document.querySelector('.vic-statusbar span').textContent.trim()!=='1922-07')throw new Error('Twelve months failed');
        const observation=JSON.parse(document.querySelector('textarea[aria-label="验收观测 JSON"]').value);
        if(attempts.length||observation.summary.calls!==0)throw new Error('Unexpected model request');
        if(errors.length)throw new Error('Browser runtime error: '+errors.join(';'));
        await wait(1500);
        sessionStorage.setItem('vic-smoke-stage','restore');
        location.reload();
      } else {
        await until(()=>document.querySelector('.vic-statusbar span')?.textContent.trim()==='1922-07','restored month');
        await until(()=>document.body.textContent.includes('读档恢复'),'restored story');
        await until(()=>document.querySelector('textarea[aria-label="验收观测 JSON"]'),'restored settings');
        const observation=JSON.parse(document.querySelector('textarea[aria-label="验收观测 JSON"]').value);
        if(attempts.length||observation.summary.calls!==0||errors.length)throw new Error('Unexpected request/runtime error after reload');
        result({status:'pass',automatic:true,liveProvider:false,openingEras:5,months:12,restoredDate:'1922-07',generationCalls:0,blockedModelFetches:attempts.length,transport:observation.transport});
      }
    } catch(error) { result({status:'fail',message:String(error.message),errors,bodySample:document.body.innerText.slice(0,1800),blockedModelFetches:attempts.length}); }
  });
})();
</script>`
const server = createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
  const requestUrl = new URL(req.url, 'http://127.0.0.1')
  const pathname = requestUrl.pathname
  if (pathname === '/__smoke_wait') {
    setTimeout(() => { res.writeHead(204); res.end() }, Math.min(Number(requestUrl.searchParams.get('ms')) || 50, 1500))
    return
  }
  const path = resolve(dist, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)))
  if (!path.startsWith(dist + sep)) { res.writeHead(403); res.end(); return }
  try {
    let body = readFileSync(path)
    const type = path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'application/octet-stream'
    if (path.endsWith('index.html')) body = Buffer.from(body.toString().replace('</head>', driver + '</head>'))
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body)
  } catch { res.writeHead(404); res.end() }
})
try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${server.address().port}/`
  const html = await new Promise((done, reject) => {
    let stdout = ''; let stderr = ''
    child = spawn(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--disable-default-apps', '--virtual-time-budget=20000',
      '--dump-dom', `--user-data-dir=${profile}`, url,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { child.kill(); reject(new Error('Browser smoke exceeded 40 seconds')) }, 40000)
    child.stdout.on('data', d => { stdout += d; if (stdout.length > 2_000_000) { child.kill(); reject(new Error('DOM output too large')) } })
    child.stderr.on('data', d => { if (stderr.length < 5000) stderr += d })
    child.on('error', e => { clearTimeout(timer); reject(e) })
    child.on('close', code => { clearTimeout(timer); if(code!==0)reject(new Error(`Browser exit ${code}: ${stderr.slice(-1200)}`));else done(stdout) })
  })
  const match = html.match(/<pre id="vic-smoke-result">([^<]+)<\/pre>/)
  if (!match) throw new Error('Browser did not finish smoke; no result marker')
  const report = JSON.parse(decodeURIComponent(match[1]))
  console.log('[browser-smoke] ' + JSON.stringify(report))
  if (report.status !== 'pass') process.exitCode = 1
} finally {
  if (child && child.exitCode === null) child.kill()
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) } catch { console.warn('[browser-smoke] 临时浏览器资料仍被系统占用，请稍后清理：' + profile) }
}
