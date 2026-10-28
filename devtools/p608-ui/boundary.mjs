/**
 * p608-ui/boundary.mjs —— P6.08 全局兜底验收
 *
 * 步骤：登录 → 打开打了桩的页面 /media-person?p608throw=1（onMounted 里 throw new Error('test')）
 *   → 断言：不白屏、出现「本页出错了」兜底组件、控制台留下一条 error（第一现场）
 *   → 再点侧栏「媒体库」「库根管理」：断言仍可正常切页（兜底没有把应用带死）
 * 跑法：node devtools/p608-ui/boundary.mjs   （需先 build 带临时打桩的产物）
 */
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
const ORIGIN = process.env.QT_ORIGIN || 'http://127.0.0.1:8080'
const ADMIN = ORIGIN + '/admin-ui'
const USER = process.env.QT_ADMIN_USER || 'admin'
const PWD = process.env.QT_ADMIN_PWD || 'Qt608!audit'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const NL = String.fromCharCode(10)
let passed = 0
const failures = []
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  PASS ' + name + (extra ? '  -- ' + extra : '')) }
  else { failures.push(name + (extra ? ' -> ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')) }
}
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const cdpPort = await freePort()
const PROFILE = join(tmpdir(), 'qt-p608-chrome')
rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + cdpPort, '--remote-allow-origins=*', '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })
let target = null
for (let i = 0; i < 200 && !target; i++) { await sleep(250); try { target = (await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json()).find((t) => t.type === 'page') || null } catch (e) {} }
if (!target) { console.error('拿不到 Chrome 调试目标'); chrome.kill(); process.exit(3) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('CDP 连接失败')), { once: true }) })
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
  const t = setTimeout(() => { pending.delete(id); reject(new Error('CDP 超时 ' + method)) }, timeout || 30000)
  pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v) }, reject: (e) => { clearTimeout(t); reject(e) } })
  ws.send(JSON.stringify({ id, method, params: params || {} }))
})
async function evaluate(expr, timeout) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, timeout)
  if (r.exceptionDetails) { const d = r.exceptionDetails; throw new Error('页面求值异常: ' + ((d.exception && d.exception.description) || d.text)) }
  return r.result.value
}
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64')) }
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')
function consoleErrors(list) {
  const out = []
  for (const e of list) {
    if (e.method === 'Runtime.consoleAPICalled' && (e.params.type === 'error' || e.params.type === 'warning')) {
      out.push((e.params.args || []).map(a => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' '))
    }
  }
  return out
}
/* 登录 */
const cap = await (await fetch(ORIGIN + '/captchaImage')).json()
const rawCode = execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', 'captcha_codes:' + cap.uuid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const code = rawCode.trim().replace(/^"|"$/g, '')
const login = await (await fetch(ORIGIN + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PWD, code: code, uuid: cap.uuid }) })).json()
if (!login.token) { console.error('登录失败: ' + JSON.stringify(login)); chrome.kill(); process.exit(5) }
await send('Network.setCookie', { name: 'Admin-Token', value: login.token, domain: '127.0.0.1', path: '/' })
console.log('登录成功（' + USER + '）')

const STATE = '(() => { const main = document.querySelector(".app-main"); const txt = main ? (main.innerText || "").trim() : ""; return { path: location.pathname, whiteout: !main || txt.length === 0, textLen: txt.length, fallback: !!document.querySelector("[data-testid=\\"page-error-fallback\\"]"), sidebar: !!document.querySelector(".sidebar-container"), text: txt.slice(0, 80).split(String.fromCharCode(10)).join(" / ") } })()'

console.log(NL + '== 1. 打桩页抛错')
await send('Page.navigate', { url: ADMIN + '/media-person?p608throw=1' })
await sleep(7000)
const broken = await evaluate(STATE)
const errs = consoleErrors(events); events.length = 0
ok(!broken.whiteout, '抛错后页面仍有内容（不是白屏）', 'textLen=' + broken.textLen)
ok(broken.fallback, '渲染出「本页出错了」兜底组件', JSON.stringify(broken.text).slice(0, 60))
ok(broken.sidebar, '侧栏仍在（应用没被打死）')
ok(errs.some(t => t.indexOf('test') >= 0 || t.indexOf('全局异常') >= 0 || t.indexOf('本页出错了') >= 0), '控制台留下第一现场错误日志', errs.slice(0, 2).join(' | ').slice(0, 160))
await shot('M-boundary-fallback.png')

console.log(NL + '== 2. 兜底后还能正常切页')
const rectOf = (expr) => evaluate('(() => { const el = ' + expr + '; if (!el) return null; if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return "hidden"; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()')
const mouseClick = async (b) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 })
}
const anchor = (p) => 'Array.from(document.querySelectorAll(".sidebar-container a")).find(a => a.getAttribute("href") === ' + JSON.stringify(p) + ')'
for (const item of [{ href: '/admin-ui/media', name: '媒体库', sel: '.media-page' }, { href: '/admin-ui/media-roots', name: '库根管理', sel: '.root-page' }]) {
  const b = await rectOf(anchor(item.href))
  ok(b && b !== 'hidden', '侧栏「' + item.name + '」可点', JSON.stringify(b))
  if (b && b !== 'hidden') await mouseClick(b)
  await sleep(2600)
  const st = await evaluate(STATE)
  const hit = await evaluate('!!document.querySelector(' + JSON.stringify(item.sel) + ')')
  ok(!st.whiteout && st.path === item.href && !st.fallback, '兜底后切到「' + item.name + '」正常渲染', 'path=' + st.path + ' textLen=' + st.textLen + ' sel=' + hit)
  await shot('M-boundary-after-' + (item.href.split('/').pop()) + '.png')
}

writeFileSync(join(OUT, 'boundary.json'), JSON.stringify({ passed: passed, failures: failures, broken: broken, errs: errs }, null, 2))
console.log(NL + (failures.length ? 'FAIL ' + passed + '/' + (passed + failures.length) : 'PASS ' + passed + '/' + passed))
chrome.kill()
process.exit(failures.length ? 1 : 0)
