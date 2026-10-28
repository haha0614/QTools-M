import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url)); const OUT = join(HERE, 'out'); mkdirSync(OUT, { recursive: true })
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REDIS_CLI = 'E:/111/project/QTools/tools/redis/redis-cli.exe'
const ORIGIN = 'http://127.0.0.1:8080'; const ADMIN = ORIGIN + '/admin-ui'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const cdpPort = await freePort()
const PROFILE = join(tmpdir(), 'qt-p608-chrome'); rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + cdpPort, '--remote-allow-origins=*', '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })
let target = null
for (let i = 0; i < 200 && !target; i++) { await sleep(250); try { target = (await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json()).find(t => t.type === 'page') || null } catch (e) {} }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ws')), { once: true }) })
let seq = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { let m; try { m = JSON.parse(ev.data) } catch (e) { return } if (!m.id) return; const j = pending.get(m.id); if (!j) return; pending.delete(m.id); m.error ? j.reject(new Error(m.error.message)) : j.resolve(m.result) })
const send = (method, params, timeout) => new Promise((resolve, reject) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)) }, timeout || 30000); pending.set(id, { resolve: v => { clearTimeout(t); resolve(v) }, reject: e => { clearTimeout(t); reject(e) } }); ws.send(JSON.stringify({ id, method, params: params || {} })) })
async function evaluate(expr, timeout) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, timeout); if (r.exceptionDetails) { const d = r.exceptionDetails; throw new Error('eval: ' + ((d.exception && d.exception.description) || d.text)) } return r.result.value }
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
// 页内自证：window.onerror / unhandledrejection 都记进 __errs（不依赖 CDP 事件投递）
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__errs = []
  window.addEventListener('error', (e) => { window.__errs.push({ src: 'error', msg: String(e.message), stack: e.error && e.error.stack ? String(e.error.stack) : (e.filename + ':' + e.lineno) }) })
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; window.__errs.push({ src: 'rejection', msg: String(r && r.message || r), stack: r && r.stack ? String(r.stack) : '' }) })
  const ce = console.error.bind(console)
  console.error = (...a) => { window.__errs.push({ src: 'console.error', msg: a.map(x => { try { return typeof x === 'string' ? x : (x && x.stack ? x.stack : JSON.stringify(x)) } catch (e) { return String(x) } }).join(' ') }); ce(...a) }
  const cw = console.warn.bind(console)
  console.warn = (...a) => { window.__errs.push({ src: 'console.warn', msg: a.map(x => { try { return typeof x === 'string' ? x : (x && x.stack ? x.stack : JSON.stringify(x)) } catch (e) { return String(x) } }).join(' ') }); cw(...a) }
` })
const cap = await (await fetch(ORIGIN + '/captchaImage')).json()
const rawCode = execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', 'captcha_codes:' + cap.uuid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const code = rawCode.trim().replace(/^"|"$/g, '')
const login = await (await fetch(ORIGIN + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Qt608!audit', code, uuid: cap.uuid }) })).json()
if (!login.token) { console.error('login fail'); process.exit(5) }
await send('Network.setCookie', { name: 'Admin-Token', value: login.token, domain: '127.0.0.1', path: '/' })
await send('Page.navigate', { url: ADMIN + '/media-roots' })
await sleep(7000)
// 装 Vue 级 errorHandler（等价于本轮修复要加的全局兜底），并记录 info
const installed = await evaluate(`(() => {
  const app = document.querySelector('#app') && document.querySelector('#app').__vue_app__
  if (!app) return 'no app'
  window.__vueErrs = []
  app.config.errorHandler = (err, instance, info) => {
    window.__vueErrs.push({ info: String(info), msg: String(err && err.message || err), stack: err && err.stack ? String(err.stack) : '', comp: instance && instance.type ? String(instance.type.name || instance.type.__file || instance.type.__name || 'anon') : '' })
  }
  return 'installed'
})()`)
console.log('vue errorHandler:', installed)
const before = await evaluate("window.__errs.length + '/' + (window.__vueErrs||[]).length")
console.log('errs before click:', before)
const box = await evaluate(`(() => { const el = Array.from(document.querySelectorAll('.sidebar-container a')).find(a => (a.textContent||'').trim() === '首页'); const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 } })()`)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await sleep(3000)
const res = await evaluate(`(() => ({
  url: location.href.replace(location.origin,''),
  mainLen: document.querySelector('.app-main').innerHTML.length,
  errs: window.__errs,
  vueErrs: window.__vueErrs || []
}))()`)
console.log('AFTER', JSON.stringify(res, null, 1).slice(0, 6000))
writeFileSync(join(OUT, 'probe5.json'), JSON.stringify(res, null, 2))
chrome.kill(); process.exit(0)
