#!/usr/bin/env node
/**
 * p595-ui/run.mjs —— P5.95「库根管理」页未登录可见警告的真浏览器实测
 *
 * 被测对象：QTools-M 构建产物（/admin-ui）+ 临时实例 :18091 + 克隆库 qtools_p595_tmp。
 * 生产库（qtools）全程只读。库根表的改动全部落在克隆库里。
 *
 * 断言覆盖验收要求：
 *   1) 单内容根 + gv=0 → 顶部红色警告 + 该行开关旁小警示图标（文案与图标 tooltip 同一句）
 *   2) 切成 gv=1 → 警告消失（走真实行内开关 + PUT 落库）
 *   3) 多内容根且只有其一 gv=0 → 不警告；全部关掉 → 警告（并说明规则）
 *
 * 跑法：node QTools-M/devtools/p595-ui/run.mjs
 * 输出：控制台 PASS/FAIL + out/*.png + out/report.json
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
const MYSQL = 'E:/111/project/QTools/tools/mysql/bin/mysql.exe'
const REDIS_CLI = 'E:/111/project/QTools/tools/redis/redis-cli.exe'
const ORIGIN = process.env.QT_TMP_BACKEND || 'http://127.0.0.1:18091'
const ADMIN = ORIGIN + '/admin-ui'
const DB = 'qtools_p595_tmp'
const ADMIN_USER = process.env.QT_ADMIN_USER || 'admin'
const ADMIN_PWD = process.env.QT_ADMIN_PWD || 'P595test!1'
mkdirSync(OUT, { recursive: true })

function sql(q) {
  return execFileSync(MYSQL, ['-h127.0.0.1', '-P3307', '-uroot', '-pdqq1107.', '--default-character-set=utf8mb4', DB, '-N', '-B', '-e', q],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}
function redisGet(key) {
  try {
    return execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim().replace(/^"|"$/g, '')
  } catch (e) { return '' }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
const failures = []
const facts = {}
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  PASS ' + name + (extra ? '  -- ' + extra : '')) }
  else { failures.push(name + (extra ? ' -> ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')) }
  return !!cond
}
const head = (t) => console.log('\n== ' + t)

/* --------------------------------------------------------------- Chrome CDP */
function freePort() {
  return new Promise((res) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => res(port)) })
  })
}
const cdpPort = await freePort()
const PROFILE = join(tmpdir(), 'qt-p595-admin-chrome')
rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=' + cdpPort,
  '--remote-allow-origins=*',
  '--user-data-dir=' + PROFILE,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--mute-audio',
  '--window-size=1600,1000',
  'about:blank'
], { stdio: 'ignore' })

function finish(code) {
  try { chrome.kill() } catch (e) {}
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ passed, failures, facts }, null, 2))
  console.log('\n' + (failures.length ? 'FAIL ' + passed + '/' + (passed + failures.length) : 'PASS ' + passed + '/' + passed))
  process.exit(code || (failures.length ? 1 : 0))
}

let target = null
for (let i = 0; i < 200 && !target; i++) {
  await sleep(250)
  try {
    const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json()
    target = list.find((t) => t.type === 'page') || null
  } catch (e) {}
}
if (!target) { console.error('拿不到 Chrome 调试目标'); finish(3) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', () => rej(new Error('CDP WebSocket 连接失败')), { once: true })
})
let seq = 0
const pending = new Map()
const reqs = new Map()
ws.addEventListener('message', (ev) => {
  let msg
  try { msg = JSON.parse(ev.data) } catch (e) { return }
  if (!msg.id) {
    if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response
      if (/captchaImage|\/login|admin\/roots/.test(r.url)) {
        reqs.set(msg.params.requestId, { url: r.url, status: r.status, body: '' })
      }
    }
    return
  }
  const job = pending.get(msg.id)
  if (!job) return
  pending.delete(msg.id)
  if (msg.error) job.reject(new Error(msg.error.message))
  else job.resolve(msg.result)
})
const send = (method, params) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP 超时：' + method)) }, 30000)
  pending.set(id, {
    resolve: (v) => { clearTimeout(timer); resolve(v) },
    reject: (e) => { clearTimeout(timer); reject(e) }
  })
  ws.send(JSON.stringify({ id, method, params: params || {} }))
})
await send('Runtime.enable')
await send('Page.enable')
await send('Network.enable')

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
  if (r.exceptionDetails) {
    throw new Error('页面求值异常: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text))
  }
  return r.result.value
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(join(OUT, name + '.png'), Buffer.from(r.data, 'base64'))
}
async function viewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 })
  await sleep(300)
}
async function goto(url, wait) {
  await send('Page.navigate', { url })
  await sleep(wait || 1500)
}
async function waitFor(expr, ms) {
  const deadline = Date.now() + (ms || 20000)
  while (Date.now() < deadline) {
    const v = await evaluate(expr).catch(() => false)
    if (v) return v
    await sleep(150)
  }
  return false
}

const PROBE = "(function(){" +
  "var alertEl = document.querySelector('[data-testid=guest-hidden-warning]');" +
  "var icons = document.querySelectorAll('.root-guest-warn-icon');" +
  "var tip = document.querySelector('[data-testid=guest-rule-tip]');" +
  "return {" +
  "page: !!document.querySelector('.root-page')," +
  "state: (document.querySelector('.root-page') || {}).getAttribute ? document.querySelector('.root-page').getAttribute('data-state') : null," +
  "rows: (document.querySelector('.root-page') || {}).getAttribute ? document.querySelector('.root-page').getAttribute('data-rows') : null," +
  "alertText: alertEl ? (alertEl.innerText || '').replace(/\\s+/g, ' ').trim() : ''," +
  "alertColor: alertEl ? getComputedStyle(alertEl.querySelector('.el-alert') || alertEl).borderColor : ''," +
  "iconCount: icons.length," +
  "iconTitles: [].slice.call(icons).map(function(i){ return i.closest('.el-tooltip__trigger') ? 'trigger' : (i.parentElement ? i.parentElement.getAttribute('aria-label') || '' : '') })," +
  "tipText: tip ? (tip.innerText || '').replace(/\\s+/g, ' ').trim() : ''," +
  "switches: [].slice.call(document.querySelectorAll('.root-table .el-switch')).map(function(s){ return s.classList.contains('is-checked') })" +
  "};" +
  "})()"
async function probe() {
  return JSON.parse(await evaluate('JSON.stringify(' + PROBE + ')'))
}

/* ================================================================ 1 登录 */
head('1. 管理端登录（真表单 + 真验证码，答案从 Redis 读，不改任何配置）')
await viewport(1600, 1000)
let loggedIn = false
for (let attempt = 1; attempt <= 2 && !loggedIn; attempt++) {
  await goto(ADMIN + '/login', 2600)
  const capEntry = [...reqs.values()].filter((r) => r.url.includes('/captchaImage')).pop()
  if (capEntry && !capEntry.body) {
    try {
      const b = await send('Network.getResponseBody', { requestId: [...reqs.entries()].filter(([, v]) => v === capEntry)[0][0] })
      capEntry.body = b.body || ''
    } catch (e) {}
  }
  let code = ''
  let captchaOn = true
  if (capEntry && capEntry.body) {
    try {
      const parsed = JSON.parse(capEntry.body)
      captchaOn = parsed.captchaEnabled !== false
      if (captchaOn && parsed.uuid) code = redisGet('captcha_codes:' + parsed.uuid)
    } catch (e) {}
  }
  facts.captcha = { captchaOn, code: code ? '有' : '无' }
  const filled = await evaluate("(function(){" +
    "var inputs = [].slice.call(document.querySelectorAll('input')).filter(function(i){ return i.type !== 'checkbox' });" +
    "if (inputs.length < 2) return 'inputs=' + inputs.length;" +
    "function setVal(el, v){ var d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }" +
    "setVal(inputs[0], " + JSON.stringify(ADMIN_USER) + ");" +
    "setVal(inputs[1], " + JSON.stringify(ADMIN_PWD) + ");" +
    "if (inputs[2] && " + JSON.stringify(code) + ") setVal(inputs[2], " + JSON.stringify(code) + ");" +
    "return 'filled:' + inputs.length;" +
    "})()")
  await sleep(400)
  await evaluate("(function(){var bs=[].slice.call(document.querySelectorAll('button'));var b=bs.filter(function(x){return (x.innerText||'').trim().indexOf('登') >= 0})[0];if(b)b.click();return 1})()")
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    const loc = await evaluate('location.pathname')
    if (loc && !loc.endsWith('/login')) break
  }
  const loc = await evaluate('location.pathname')
  loggedIn = !String(loc).endsWith('/login')
  console.log('  第 ' + attempt + ' 次：' + filled + ' → ' + loc)
}
ok(loggedIn, '浏览器登录成功（不再是 /login）')

/* ================================================================ 2 单内容根 + gv=0 */
head('2. 单内容根 + gv=0 → 顶部红色警告 + 行内警示图标')
sql("update media_root set kind='thumbs' where id=3; update media_root set kind='root', guest_visible=0 where id=1;")
await goto(ADMIN + '/media-roots', 3000)
await waitFor("!!document.querySelector('.root-page') && document.querySelector('.root-page').getAttribute('data-state') === 'ready'", 20000)
const single = await probe()
facts.singleHidden = single
console.log('  警告文案 = ' + single.alertText)
ok(single.page, '库根管理页渲染成功（.root-page）')
ok(!!single.alertText, '顶部出现警告条（data-testid=guest-hidden-warning）')
ok(/唯一的内容根/.test(single.alertText) && /未登录不可见/.test(single.alertText) && /未登录可见/.test(single.alertText),
  '警告文案 = 「当前唯一的内容根已设为「未登录不可见」…」', single.alertText)
ok(single.alertColor === 'rgb(245, 108, 108)', '警告条是红色（error 语义）', single.alertColor)
ok(single.iconCount === 1, '唯一内容根那一行的开关旁有 1 个小警示图标', 'iconCount=' + single.iconCount)
ok(/全部内容根都关掉/.test(single.tipText), '页面底部写明了「何时才警告」的规则', single.tipText.slice(0, 60))
await shot('admin-single-root-gv0-warning')

/* ================================================================ 3 切 gv=1 */
head('3. 行内开关切成 gv=1 → 警告消失')
const switched = await evaluate("(function(){" +
  "var rows = [].slice.call(document.querySelectorAll('.root-table .el-table__body tbody tr'));" +
  "var tr = rows.filter(function(r){ return /主库/.test(r.innerText) })[0] || rows[0];" +
  "var sw = tr.querySelector('.el-switch');" +
  "if (!sw) return false; sw.click(); return true;" +
  "})()")
await sleep(2200)
const afterOn = await probe()
facts.afterToggleOn = afterOn
const dbGv = sql('select guest_visible from media_root where id=1')
ok(switched === true, '点到了真实行内开关（.el-switch）')
ok(dbGv === '1', 'PUT 已落库：media_root.id=1 guest_visible=1', 'db=' + dbGv)
ok(!afterOn.alertText, 'gv=1 后顶部警告消失')
ok(afterOn.iconCount === 0, '行内警示图标同时消失', 'iconCount=' + afterOn.iconCount)
await shot('admin-single-root-gv1')

/* ================================================================ 4 多内容根，其一 gv=0 */
head('4. 多内容根、只有其一 gv=0 → 不警告（规则：全部不可见才警告）')
sql("update media_root set kind='root' where id=3; update media_root set guest_visible=1 where id=1; update media_root set guest_visible=0 where id=3;")
await goto(ADMIN + '/media-roots', 3000)
await waitFor("!!document.querySelector('.root-page') && document.querySelector('.root-page').getAttribute('data-state') === 'ready'", 20000)
const multiOne = await probe()
facts.multiOneHidden = multiOne
ok(multiOne.rows === '3', '列表仍是 3 个库根（其中 2 个内容根）', 'data-rows=' + multiOne.rows)
ok(!multiOne.alertText, '只有其一 gv=0 → 不显示警告', 'alert="' + multiOne.alertText + '"')
ok(multiOne.iconCount === 0, '也不挂行内警示图标', 'iconCount=' + multiOne.iconCount)
ok(/全部内容根都关掉/.test(multiOne.tipText), '页面上的规则说明仍在（告诉站长为什么这次没警告）')
await shot('admin-multi-root-one-hidden')

head('4b. 多内容根全部 gv=0 → 警告（文案说明「全部 N 个」）')
sql("update media_root set guest_visible=0 where id in (1,3);")
await goto(ADMIN + '/media-roots', 3000)
await waitFor("!!document.querySelector('.root-page') && document.querySelector('.root-page').getAttribute('data-state') === 'ready'", 20000)
const multiAll = await probe()
facts.multiAllHidden = multiAll
ok(/全部 2 个内容根/.test(multiAll.alertText), '警告文案变成「全部 2 个内容根都已设为…」', multiAll.alertText)
ok(multiAll.iconCount === 2, '两个内容根各挂一个警示图标', 'iconCount=' + multiAll.iconCount)
await shot('admin-multi-root-all-hidden')

head('5. 收尾：把克隆库恢复成中性状态（gv=1，root 3 还原为产物根）')
sql("update media_root set guest_visible=1 where id in (1,3); update media_root set kind='thumbs' where id=3;")
await goto(ADMIN + '/media-roots', 2500)
const restored = await probe()
ok(!restored.alertText, '恢复后没有警告')
console.log('  克隆库最终状态：' + sql('select concat(id, ":", name, ":", kind, ":", guest_visible) from media_root order by id').split('\n').join(' | '))

finish()
