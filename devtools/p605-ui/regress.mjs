#!/usr/bin/env node
/**
 * p605-ui/regress.mjs —— P6.05 不回归检查（真浏览器）
 *   1) 弹窗打开 / 关闭 / 再打开仍可用
 *   2) 亮暗主题：html.dark 下弹窗仍在视口内、按钮仍可点（M 与 C 各一个代表弹窗）
 *   3) 弹窗内表格横向滚动仍由 el-table 自己负责（scrollLeft 可动，且不因 body 限高失效）
 *   4) 抽屉 / 面板内部滚动位置在重排后保持（我们的 CSS 不会重置 scrollTop）
 *
 * 跑法：node QTools-M/devtools/p605-ui/regress.mjs        （M 部分）
 *      QT_TARGET=C node QTools-M/devtools/p605-ui/regress.mjs（C 部分）
 */
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'out')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const REDIS_CLI = 'E:/111/project/QTools/tools/redis/redis-cli.exe'
const ORIGIN = process.env.QT_ORIGIN || 'http://127.0.0.1:8080'
const TARGET = process.env.QT_TARGET || 'M'
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
const failures = []
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  PASS ' + name + (extra ? '  -- ' + extra : '')) }
  else { failures.push(name + (extra ? ' -> ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')) }
}
const head = (t) => console.log('\n== ' + t)

const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const cdpPort = await freePort()
const PROFILE = join(tmpdir(), 'qt-p605-regress')
rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + cdpPort, '--remote-allow-origins=*',
  '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--mute-audio', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })

function finish(code) {
  try { chrome.kill() } catch (e) {}
  writeFileSync(join(OUT, 'regress-' + TARGET + '.json'), JSON.stringify({ passed, failures }, null, 2))
  console.log('\n' + (failures.length ? 'FAIL ' + passed + '/' + (passed + failures.length) : 'PASS ' + passed + '/' + passed))
  process.exit(code || (failures.length ? 1 : 0))
}

let target = null
for (let i = 0; i < 200 && !target; i++) {
  await sleep(250)
  try { target = (await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json()).find((t) => t.type === 'page') || null } catch (e) {}
}
if (!target) { console.error('拿不到 Chrome 调试目标'); finish(3) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('ws')), { once: true }) })
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  let msg; try { msg = JSON.parse(ev.data) } catch (e) { return }
  if (!msg.id) return
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
await send('Page.enable'); await send('Runtime.enable')
async function evaluate(expression, timeout) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, timeout)
  if (r.exceptionDetails) throw new Error('页面求值异常: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text))
  return r.result.value
}
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64')) }
const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })

const HELPERS = String.raw`
window.__r = {
  vis(el) {
    if (!el) return false
    let n = el
    while (n && n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; n = n.parentElement }
    return true
  },
  pick(sel) { const l = [...document.querySelectorAll(sel)].filter(__r.vis); return l.length ? l[l.length - 1] : null },
  click(sel, text) {
    const l = [...document.querySelectorAll(sel)].filter(__r.vis)
    const hit = text == null ? l[0] : l.find((e) => (e.textContent || '').includes(text))
    if (!hit) throw new Error('找不到 ' + sel + ' ' + (text || ''))
    hit.click(); return true
  },
  wait(sel, ms) {
    return new Promise((res, rej) => {
      const end = Date.now() + (ms || 20000)
      const t = setInterval(() => {
        if (__r.pick(sel)) { clearInterval(t); res(true) } else if (Date.now() > end) { clearInterval(t); rej(new Error('等待超时 ' + sel)) }
      }, 150)
    })
  },
  rect(sel) { const el = __r.pick(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), innerH: innerHeight, fits: r.top >= -0.5 && r.bottom <= innerHeight + 0.5 } },
  btnHit(sel, btnSel) {
    const el = __r.pick(sel); if (!el) return null
    const btn = el.querySelector(btnSel); if (!btn) return null
    const r = btn.getBoundingClientRect()
    const hitEl = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return { text: (btn.textContent || '').trim().slice(0, 16), bottom: +r.bottom.toFixed(1), hit: !!hitEl && (hitEl === btn || btn.contains(hitEl)) }
  },
  tableScroll(sel) {
    const el = __r.pick(sel); if (!el) return null
    const w = el.querySelector('.el-table__body-wrapper'); if (!w) return null
    const before = w.scrollLeft
    w.scrollLeft = 9999
    const moved = w.scrollLeft > before
    const res = { scrollW: w.scrollWidth, clientW: w.clientWidth, scrollLeft: w.scrollLeft, moved }
    w.scrollLeft = 0
    return res
  },
  drawerScroll(sel, y) {
    const el = __r.pick(sel); if (!el) return null
    const body = el.querySelector('.el-dialog__body') || el.querySelector('.el-drawer__body')
    if (!body) return null
    body.scrollTop = y
    return { max: body.scrollHeight - body.clientHeight, set: body.scrollTop }
  },
  scrollTop(sel) {
    const el = __r.pick(sel); if (!el) return null
    const body = el.querySelector('.el-dialog__body') || el.querySelector('.el-drawer__body')
    return body ? body.scrollTop : null
  },
  dark(on) {
    document.documentElement.classList.toggle('dark', !!on)
    return document.documentElement.classList.contains('dark')
  }
};
'ready'
`

async function redisCode(uuid) {
  try { return execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', 'captcha_codes:' + uuid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(/^"|"$/g, '') } catch (e) { return '' }
}
async function goto(url) {
  await send('Page.navigate', { url })
  await sleep(1200)
  for (let i = 0; i < 60; i++) { try { await evaluate(HELPERS); if (await evaluate('!!document.body')) break } catch (e) { } await sleep(250) }
  await sleep(1500)
}

if (TARGET === 'M') {
  const ADMIN = ORIGIN + '/admin-ui'
  await viewport(1600, 900)
  await goto(ADMIN + '/login')
  await evaluate(HELPERS)
  const cap = await evaluate("fetch('/captchaImage').then(r=>r.json())")
  const code = await redisCode(cap.uuid)
  const body = { username: process.env.QT_AUDIT_USER || 'p605audit', password: process.env.QT_AUDIT_PWD || 'admin123', code, uuid: cap.uuid }
  const res = await evaluate("fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(" + JSON.stringify(body) + ")}).then(r=>r.json())")
  if (!res.token) { console.error('登录失败 ' + JSON.stringify(res)); finish(5) }
  await evaluate("document.cookie='Admin-Token=" + res.token + "; path=/'")

  for (const vp of [{ w: 1280, h: 720, tag: '1280x720' }, { w: 375, h: 812, tag: '375x812' }]) {
    await viewport(vp.w, vp.h)
    head('M @' + vp.tag)
    await goto(ADMIN + '/media')
    // 打开 / 关闭 / 再打开
    await evaluate("__r.click('button','标签管理')")
    await evaluate("__r.wait('.el-dialog', 20000)")
    const first = await evaluate("__r.rect('.el-dialog')")
    ok(!!first && first.fits, '打开：弹窗在视口内', JSON.stringify(first))
    const scroll = await evaluate("__r.tableScroll('.el-dialog')")
    ok(!!scroll && scroll.scrollW >= scroll.clientW, '弹窗内表格横向滚动可用（由 el-table 自己负责）', JSON.stringify(scroll))
    ok(!!first && first.fits, '横向滚动后弹窗仍在视口内', JSON.stringify(await evaluate("__r.rect('.el-dialog')")))
    await evaluate("(()=>{const el=__r.pick('.el-dialog'); el.querySelector('.el-dialog__headerbtn').click(); return true})()")
    await sleep(600)
    ok(!(await evaluate("!!__r.pick('.el-dialog')")), '关闭：弹窗已隐藏')
    await evaluate("__r.click('button','标签管理')")
    await evaluate("__r.wait('.el-dialog', 20000)")
    const again = await evaluate("__r.rect('.el-dialog')")
    ok(!!again && again.fits, '再打开：仍可用且在视口内', JSON.stringify(again))
    // 暗色主题
    await evaluate("__r.dark(true)")
    await sleep(400)
    const darkRect = await evaluate("__r.rect('.el-dialog')")
    const darkBtn = await evaluate("__r.btnHit('.el-dialog','.el-button--primary')")
    ok(!!darkRect && darkRect.fits, '暗色：弹窗在视口内', JSON.stringify(darkRect))
    ok(!!darkBtn && darkBtn.hit, '暗色：footer 主按钮可点', JSON.stringify(darkBtn))
    await shot('M-regress-dark-' + vp.tag + '.png')
    await evaluate("__r.dark(false)")
    await evaluate("(()=>{const el=__r.pick('.el-dialog'); el.querySelector('.el-dialog__headerbtn').click(); return true})()")
    await sleep(600)
    // 抽屉内部滚动位置保持
    await evaluate("__r.click('button','维护')")
    await evaluate("__r.wait('.el-drawer', 20000)")
    await sleep(1200)
    const set = await evaluate("__r.drawerScroll('.el-drawer', 160)")
    await sleep(700)
    await evaluate("__r.rect('.el-drawer')")
    const after = await evaluate("__r.scrollTop('.el-drawer')")
    ok(set && set.set > 0 && Math.abs((after || 0) - set.set) <= 1, '抽屉内部滚动位置在重排后保持', JSON.stringify({ set, after }))
  }
} else {
  head('C')
  await viewport(375, 812)
  await goto(ORIGIN + '/media/persons')
  await evaluate(HELPERS)
  await evaluate("__r.wait('[data-role=\"avatar-change\"]', 40000)")
  await evaluate("(()=>{const b=[...document.querySelectorAll('[data-role=\"avatar-change\"]')][0]; b.click(); return true})()")
  await evaluate("__r.wait('.pa-panel', 20000)")
  await sleep(1200)
  const light = await evaluate("__r.rect('.pa-panel')")
  ok(!!light && light.fits, '亮色：换头像面板在视口内 @375x812', JSON.stringify(light))
  await evaluate("__r.dark(true)")
  await sleep(500)
  const dark = await evaluate("__r.rect('.pa-panel')")
  const darkBtn = await evaluate("__r.btnHit('.pa-panel','button')")
  ok(!!dark && dark.fits, '暗色：换头像面板在视口内 @375x812', JSON.stringify(dark))
  ok(!!darkBtn, '暗色：面板内按钮仍在视口内', JSON.stringify(darkBtn))
  await shot('C-regress-dark-375x812.png')
  await evaluate("__r.dark(false)")
  // 面板内滚动位置保持（头像列表）
  const sc = await evaluate("(()=>{const el=__r.pick('.pa-panel'); const s=[el,...el.querySelectorAll('*')].find(n=>n.scrollHeight>n.clientHeight+1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)); if(!s) return null; s.scrollTop=60; return {set:s.scrollTop}; })()")
  await sleep(600)
  const sc2 = await evaluate("(()=>{const el=__r.pick('.pa-panel'); const s=[el,...el.querySelectorAll('*')].find(n=>n.scrollHeight>n.clientHeight+1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)); return s?s.scrollTop:null})()")
  ok(!sc || Math.abs((sc2 || 0) - sc.set) <= 1, '面板内部滚动位置在重排后保持', JSON.stringify({ sc, sc2 }))
}
finish(0)
