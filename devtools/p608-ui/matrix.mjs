/**
 * p608-ui/matrix.mjs —— P6.08「库根管理页 → 其他页白屏」跳转矩阵（复现 + 验收）
 *
 * 被测对象：后端 :8080 直读的管理端产物 /admin-ui/（先 npm run build:prod，再跑本脚本）。
 * 跑法：node devtools/p608-ui/matrix.mjs --label=before|after
 *
 * 流程：登录 → /media-roots（停留 2s 等列表/策略/监听状态回包）→ 用真实鼠标事件依次点侧栏
 *   媒体库 / 人物管理 / 工作室管理 / 库根管理 / 用户管理（用户端分组）/ 角色管理（系统管理分组）
 * 每跳记录：路径、正文长度、内容选择器、是否白屏、本跳未捕获异常（完整 stack）、console.error。
 * 白屏判定：.app-main 不存在，或 .app-main 的 innerText 为空（只剩注释占位）。
 * 输出：out/matrix-<label>.json / .md 与 out/M-jump-<key>-<label>.png
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
const LABEL = (process.argv.find(a => a.startsWith('--label=')) || '--label=after').split('=')[1]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const NL = String.fromCharCode(10)

const PAGES = [
  { key: 'media', title: '媒体库', href: '/media', sel: '.media-page' },
  { key: 'person', title: '人物管理', href: '/media-person', sel: '.app-container' },
  { key: 'studios', title: '工作室管理', href: '/media-studios', sel: '.app-container' },
  { key: 'roots', title: '库根管理', href: '/media-roots', sel: '.root-page' },
  // 「用户管理」在侧栏「用户端」分组里
  { key: 'appuser', title: '用户管理', parent: '用户端', href: '/appuser/user', sel: '.app-container' },
  // 「系统管理」是分组，用组内页面代表它（/system/user 自身另有既有问题，见 REPORT 已知限制）
  { key: 'system', title: '角色管理', parent: '系统管理', href: '/system/role', sel: '.app-container' }
]

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const cdpPort = await freePort()
const PROFILE = join(tmpdir(), 'qt-p608-chrome')
rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + cdpPort, '--remote-allow-origins=*',
  '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--window-size=1600,900', 'about:blank'
], { stdio: 'ignore' })

let target = null
for (let i = 0; i < 200 && !target; i++) {
  await sleep(250)
  try { target = (await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json()).find((t) => t.type === 'page') || null } catch (e) {}
}
if (!target) { console.error('拿不到 Chrome 调试目标'); chrome.kill(); process.exit(3) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', () => rej(new Error('CDP WebSocket 连接失败')), { once: true })
})
let seq = 0
const pending = new Map()
const events = []
ws.addEventListener('message', (ev) => {
  let msg; try { msg = JSON.parse(ev.data) } catch (e) { return }
  if (!msg.id) { events.push(msg); return }
  const job = pending.get(msg.id); if (!job) return
  pending.delete(msg.id)
  if (msg.error) job.reject(new Error(msg.error.message)); else job.resolve(msg.result)
})
const send = (method, params, timeout) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP 超时：' + method)) }, timeout || 30000)
  pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
  ws.send(JSON.stringify({ id, method, params: params || {} }))
})
async function evaluate(expression, timeout) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, timeout)
  if (r.exceptionDetails) {
    const d = r.exceptionDetails
    throw new Error('页面求值异常: ' + ((d.exception && d.exception.description) || d.text))
  }
  return r.result.value
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'))
}

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')

function digest(e) {
  if (e.method === 'Runtime.exceptionThrown') {
    const d = e.params.exceptionDetails
    return { kind: 'exception', text: d.text, stack: (d.exception && d.exception.description) || '', at: (d.url || '') + ':' + (d.lineNumber || 0) + ':' + (d.columnNumber || 0) }
  }
  if (e.method === 'Runtime.consoleAPICalled') {
    const text = (e.params.args || []).map(a => (a.value !== undefined ? String(a.value) : (a.description || a.type))).join(' ')
    return { kind: 'console.' + e.params.type, text: text.slice(0, 6000) }
  }
  if (e.method === 'Log.entryAdded') {
    const en = e.params.entry
    return { kind: 'log.' + en.level, text: (en.text || '').slice(0, 2000), source: en.source, url: en.url || '' }
  }
  return null
}
const take = () => { const out = events.map(digest).filter(Boolean); events.length = 0; return out }

/* ---------------------------------------------------------------- 登录 */
const cap = await (await fetch(ORIGIN + '/captchaImage')).json()
const rawCode = execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', 'captcha_codes:' + cap.uuid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const code = rawCode.trim().replace(/^"|"$/g, '')
const login = await (await fetch(ORIGIN + '/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USER, password: PWD, code: code, uuid: cap.uuid })
})).json()
if (!login.token) { console.error('登录失败: ' + JSON.stringify(login)); chrome.kill(); process.exit(5) }
await send('Network.setCookie', { name: 'Admin-Token', value: login.token, domain: '127.0.0.1', path: '/' })
console.log('登录成功（' + USER + '）')

/* ------------------------------------------------------------ 页内工具 */
const rectOf = (expr) => evaluate('(() => { const el = ' + expr + '; if (!el) return null; if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return "hidden"; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })()')
const mouseClick = async (box) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
}
const subMenuExpr = (title) => 'Array.from(document.querySelectorAll(".sidebar-container .el-sub-menu__title")).find(el => (el.textContent || "").trim() === ' + JSON.stringify(title) + ')'
const anchorExpr = (href) => 'Array.from(document.querySelectorAll(".sidebar-container a")).find(a => a.getAttribute("href") === ' + JSON.stringify(new URL(ADMIN + href).pathname) + ')'

async function clickSidebar(page) {
  let box = await rectOf(anchorExpr(page.href))
  if ((!box || box === 'hidden') && page.parent) {
    const pbox = await rectOf(subMenuExpr(page.parent))
    if (pbox && pbox !== 'hidden') { await mouseClick(pbox); await sleep(800) }
    box = await rectOf(anchorExpr(page.href))
  }
  if (!box || box === 'hidden') return 'notfound'
  await mouseClick(box)
  return 'clicked'
}

const STATE_JS = '(() => { const main = document.querySelector(".app-main"); const txt = main ? (main.innerText || "").trim() : ""; return { url: location.href, path: location.pathname, hasMain: !!main, mainTextLen: txt.length, mainText: txt.slice(0, 80).split(String.fromCharCode(10)).join(" / "), mainChildren: main ? main.children.length : -1, whiteout: !main || txt.length === 0 } })()'
const state = () => evaluate(STATE_JS)

/* --------------------------------------------------------- 进入库根管理 */
await send('Page.navigate', { url: ADMIN + '/media-roots' })
await sleep(6000)
take()
const entry = await evaluate('(() => ({ rows: document.querySelectorAll(".root-table .el-table__body tr").length, dataState: (document.querySelector(".root-page") || {}).dataset ? document.querySelector(".root-page").dataset.state : "", title: (document.querySelector(".root-page-title") || {}).textContent || "", hasTable: !!document.querySelector(".root-table"), hasRatingCard: !!document.querySelector("[data-testid=\\"rating-policy-card\\"]") }))()')
console.log('进入 /media-roots：' + JSON.stringify(entry))
await shot('M-roots-entry-' + LABEL + '.png')
take()

/* ------------------------------------------------------------- 跳转矩阵 */
const rows = []
for (const page of PAGES) {
  const clickRes = await clickSidebar(page)
  await sleep(2600)
  const st = await state()
  const hits = await evaluate('(() => ({ target: !!document.querySelector(' + JSON.stringify(page.sel) + '), tables: document.querySelectorAll(".el-table").length, pageError: !!document.querySelector("[data-testid=\\"page-error-fallback\\"]") }))()')
  const evts = take()
  const uncaught = evts.filter(e => e.kind === 'exception')
  const row = {
    key: page.key, target: page.title, wantPath: page.href, click: clickRes, path: st.path,
    urlOk: st.path === new URL(ADMIN + page.href).pathname, whiteout: st.whiteout, mainTextLen: st.mainTextLen, mainText: st.mainText,
    hits: hits, uncaught: uncaught,
    consoleErrors: evts.filter(e => e.kind === 'console.error').slice(0, 5),
    consoleWarns: evts.filter(e => e.kind === 'console.warn' || e.kind === 'console.warning').slice(0, 5)
  }
  rows.push(row)
  const badge = row.whiteout ? '白屏' : (row.uncaught.length ? '有异常' : 'OK')
  console.log('[' + page.title + '] ' + badge + '  path=' + row.path + (row.urlOk ? '' : '（期望 ' + page.href + '）') + '  text=' + row.mainTextLen + '  sel=' + hits.target + '  异常=' + uncaught.length)
  for (const u of uncaught) console.log('   !! ' + (u.stack || u.text).split(NL).slice(0, 6).join(' | '))
  await shot('M-jump-' + page.key + '-' + LABEL + '.png')
}

const report = { label: LABEL, at: new Date().toISOString(), entry, rows }
writeFileSync(join(OUT, 'matrix-' + LABEL + '.json'), JSON.stringify(report, null, 2))
const md = ['# P6.08 跳转矩阵（' + LABEL + '）', '', '| # | 目标页 | 结果 | 路径 | 正文长度 | 内容选择器 | 未捕获异常 |', '|---|---|---|---|---|---|---|']
rows.forEach((r, i) => md.push('| ' + (i + 1) + ' | ' + r.target + ' | ' + (r.whiteout ? '**白屏**' : (r.uncaught.length ? '异常' : 'ok')) + ' | ' + r.path + ' | ' + r.mainTextLen + ' | ' + (r.hits.target ? '✓' : '✗') + ' | ' + r.uncaught.length + ' |'))
writeFileSync(join(OUT, 'matrix-' + LABEL + '.md'), md.join(NL) + NL)

const bad = rows.filter(r => r.whiteout || r.uncaught.length > 0 || !r.urlOk)
console.log(NL + (bad.length ? 'FAIL ' + (rows.length - bad.length) + '/' + rows.length : 'PASS ' + rows.length + '/' + rows.length))
chrome.kill()
process.exit(bad.length ? 1 : 0)
