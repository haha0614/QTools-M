/* dev 模式取证：未修复模板在 vite dev（含 Vue dev warning）下离开库根管理页会打出什么 */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
mkdirSync(OUT, { recursive: true })
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REDIS_CLI = 'E:/111/project/QTools/tools/redis/redis-cli.exe'
const ORIGIN = 'http://127.0.0.1:8080'
const DEV = process.env.QT_DEV_ORIGIN || 'http://localhost:5174'
const USER = 'admin'
const PWD = process.env.QT_ADMIN_PWD || 'Qt608!audit'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const NL = String.fromCharCode(10)
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const cdpPort = await freePort()
const PROFILE = join(tmpdir(), 'qt-p608-dev')
rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + cdpPort, '--remote-allow-origins=*', '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })
let target = null
for (let i = 0; i < 200 && !target; i++) { await sleep(250); try { target = (await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json()).find((t) => t.type === 'page') || null } catch (e) {} }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ws')), { once: true }) })
let seq = 0
const pending = new Map()
const events = []
ws.addEventListener('message', (ev) => {
  let m; try { m = JSON.parse(ev.data) } catch (e) { return }
  if (!m.id) { events.push(m); return }
  const j = pending.get(m.id); if (!j) return
  pending.delete(m.id)
  m.error ? j.reject(new Error(m.error.message)) : j.resolve(m.result)
})
const send = (method, params, timeout) => new Promise((resolve, reject) => {
  const id = ++seq
  const t = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)) }, timeout || 30000)
  pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v) }, reject: (e) => { clearTimeout(t); reject(e) } })
  ws.send(JSON.stringify({ id, method, params: params || {} }))
})
async function evaluate(expr, timeout) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, timeout)
  if (r.exceptionDetails) { const d = r.exceptionDetails; throw new Error('eval: ' + ((d.exception && d.exception.description) || d.text)) }
  return r.result.value
}
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')
/* dev 走 /dev-api 代理，登录仍在 8080 上做，token 放 localhost 域的 cookie */
const cap = await (await fetch(ORIGIN + '/captchaImage')).json()
const rawCode = execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', 'captcha_codes:' + cap.uuid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const code = rawCode.trim().replace(/^"|"$/g, '')
const login = await (await fetch(ORIGIN + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PWD, code: code, uuid: cap.uuid }) })).json()
if (!login.token) { console.error('登录失败: ' + JSON.stringify(login)); process.exit(5) }
await send('Network.setCookie', { name: 'Admin-Token', value: login.token, domain: 'localhost', path: '/' })
await send('Page.navigate', { url: DEV + '/media-roots' })
await sleep(9000)
const box = await evaluate('(() => { const el = Array.from(document.querySelectorAll(".sidebar-container a")).find(a => (a.getAttribute("href") || "").indexOf("/media") >= 0 && (a.textContent || "").trim() === "媒体库"); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()')
if (!box) { console.error('找不到侧栏「媒体库」'); process.exit(6) }
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await sleep(4000)
const out = []
for (const e of events) {
  if (e.method === 'Runtime.consoleAPICalled' && (e.params.type === 'warning' || e.params.type === 'error' || e.params.type === 'warn')) {
    out.push('[console.' + e.params.type + '] ' + (e.params.args || []).map(a => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ').slice(0, 700))
  }
  if (e.method === 'Runtime.exceptionThrown') out.push('[exception] ' + (((e.params.exceptionDetails.exception || {}).description) || e.params.exceptionDetails.text || '').slice(0, 700))
}
const st = await evaluate('(() => { const m = document.querySelector(".app-main"); return { path: location.pathname, textLen: (m.innerText || "").trim().length, children: Array.from(m.childNodes).map(n => n.nodeType === 8 ? "#comment" : (n.nodeType === 3 ? "#text" : n.tagName)).slice(0, 8), htmlHead: m.innerHTML.slice(0, 80) } })()')
console.log('跳转后：' + JSON.stringify(st))
console.log('console 记录（' + out.length + '）：')
for (const line of out.slice(0, 12)) console.log('  ' + line)
writeFileSync(join(OUT, 'devmode.json'), JSON.stringify({ state: st, logs: out }, null, 2))
chrome.kill()
process.exit(0)
