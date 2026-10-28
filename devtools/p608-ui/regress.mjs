/**
 * p608-ui/regress.mjs —— P6.08 不回归：库根管理页自身功能（真浏览器 + 接口双向校验）
 *
 * 覆盖：列表 / 顶部说明折叠 / 产物清单展开与收起 / 分级可见性开关（往返）/
 *      库根「未登录可见」开关（往返）/ 新增 / 编辑 / 删除；结束时断言基线已复原。
 * 跑法：node devtools/p608-ui/regress.mjs
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
/* ---------------------------------------------------------------- 接口侧 */
const cap = await (await fetch(ORIGIN + '/captchaImage')).json()
const rawCode = execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', 'captcha_codes:' + cap.uuid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const code = rawCode.trim().replace(/^"|"$/g, '')
const login = await (await fetch(ORIGIN + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: USER, password: PWD, code: code, uuid: cap.uuid }) })).json()
if (!login.token) { console.error('登录失败: ' + JSON.stringify(login)); process.exit(5) }
const H = { Authorization: 'Bearer ' + login.token }
const apiRoots = async () => { const r = await (await fetch(ORIGIN + '/api/media/admin/roots', { headers: H })).json(); return Array.isArray(r) ? r : (r.data || []) }
const apiPolicy = async () => { const r = await (await fetch(ORIGIN + '/api/media/admin/rating-policy', { headers: H })).json(); return r.data && r.data.items ? r.data : r }
/* ------------------------------------------------------------------ 浏览器 */
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
ws.addEventListener('message', (ev) => {
  let m; try { m = JSON.parse(ev.data) } catch (e) { return }
  if (!m.id) return
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
await send('Network.setCookie', { name: 'Admin-Token', value: login.token, domain: '127.0.0.1', path: '/' })
console.log('登录成功（' + USER + '）')
const Q = (sel) => 'document.querySelector(' + JSON.stringify(sel) + ')'
const rectOf = (sel) => evaluate('(() => { const el = ' + Q(sel) + '; if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })()')
const mouseClick = async (b) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 })
}
const clickSel = async (sel, wait) => {
  const b = await rectOf(sel)
  if (!b || b.w === 0) return false
  await mouseClick(b)
  await sleep(wait || 900)
  return true
}
const clickText = async (sel, text, wait) => {
  const expr = 'Array.from(document.querySelectorAll(' + JSON.stringify(sel) + ')).filter(el => (el.innerText || "").trim().indexOf(' + JSON.stringify(text) + ') >= 0)'
  const b = await evaluate('(() => { const list = ' + expr + '; const el = list[list.length - 1]; if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } })()')
  if (!b || b.w === 0) return false
  await mouseClick(b)
  await sleep(wait || 900)
  return true
}
const FILL = '(() => { const inputs = Array.from(document.querySelectorAll(".el-dialog .el-input__inner")); const el = inputs[IDX]; if (!el) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(el, VAL); el.dispatchEvent(new Event("input", { bubbles: true })); return true })()'
const fillInput = (index, value) => evaluate(FILL.split('IDX').join(String(index)).split('VAL').join(JSON.stringify(value)))
const ROW_COUNT = 'document.querySelectorAll(".root-table .el-table__body tr").length'

/* --------------------------------------------------------------- 前置基线 */
const baseRoots = await apiRoots()
const basePolicy = await apiPolicy()
const baseIds = baseRoots.map(r => r.id).sort((a, b) => a - b)
writeFileSync(join(OUT, 'regress-baseline.json'), JSON.stringify({ baseRoots: baseRoots, basePolicy: basePolicy }, null, 2))
console.log('基线：roots=' + JSON.stringify(baseIds) + ' policy=' + JSON.stringify({ g: basePolicy.general, gd: basePolicy.guidance, r: basePolicy.restricted }))
await send('Page.navigate', { url: ADMIN + '/media-roots' })
await sleep(6000)

console.log(NL + '== R1 列表')
const listInfo = await evaluate('(() => ({ rows: ' + ROW_COUNT + ', state: (document.querySelector(".root-page") || {}).dataset.state, title: (document.querySelector(".root-page-title") || {}).textContent }))()')
ok(listInfo.rows === baseRoots.length, '列表行数 = 接口库根数', 'UI=' + listInfo.rows + ' API=' + baseRoots.length)
ok(listInfo.state === 'ready' && listInfo.title === '库根管理', '三态=ready 且标题正确', JSON.stringify(listInfo))

console.log(NL + '== R2 顶部说明折叠')
await clickSel('[data-testid="root-intro-toggle"]', 600)
const introOpen = await evaluate('document.querySelector("[data-testid=\\"root-intro-body\\"]").getBoundingClientRect().height > 0')
await clickSel('[data-testid="root-intro-toggle"]', 600)
const introClosed = await evaluate('document.querySelector("[data-testid=\\"root-intro-body\\"]").getBoundingClientRect().height === 0')
ok(introOpen && introClosed, '展开/收起说明均可切换', 'open=' + introOpen + ' closed=' + introClosed)
console.log(NL + '== R3 产物清单展开（缩略图 kind=thumbs）')
const thumbs = baseRoots.find(r => r.kind === 'thumbs')
const subdirSel = thumbs ? '[data-testid="subdirs-btn-' + thumbs.id + '"]' : null
const tableSel = thumbs ? '[data-testid="artifact-table-' + thumbs.id + '"]' : null
const totalSel = thumbs ? '[data-testid="artifact-total-' + thumbs.id + '"]' : null
if (!thumbs) { ok(false, '存在产物根可测', '接口里没有 kind=thumbs 的库根') } else {
  await clickSel(subdirSel, 1200)
  let table = false
  for (let i = 0; i < 12 && !table; i++) { await sleep(700); table = await evaluate('!!' + Q(tableSel)) }
  ok(table, '展开后出现产物子目录小表', 'rootId=' + thumbs.id)
  ok(await evaluate('!!' + Q(totalSel)), '合计行存在（统计完整）')
  await clickSel(subdirSel, 900)
  ok(await evaluate('!' + Q(tableSel)), '再次点击可收起')
}
await shot('M-regress-roots.png')

console.log(NL + '== R4 分级可见性开关（往返）')
const ratingBefore = (await apiPolicy()).restricted
await clickSel('[data-testid="rating-switch-restricted"]', 2000)
const ratingAfter1 = (await apiPolicy()).restricted
ok(ratingAfter1 === !ratingBefore, '点一下：restricted 取反并落库', 'before=' + ratingBefore + ' after=' + ratingAfter1)
await clickSel('[data-testid="rating-switch-restricted"]', 2000)
const ratingAfter2 = (await apiPolicy()).restricted
ok(ratingAfter2 === ratingBefore, '再点一下：已复原', 'restored=' + ratingAfter2)

console.log(NL + '== R5 库根「未登录可见」开关（往返）')
const guestRow = baseRoots.find(r => r.guestVisible !== false) || baseRoots[0]
await clickSel('[data-testid="guest-switch-' + guestRow.id + '"]', 2000)
const guestAfter1 = (await apiRoots()).find(r => r.id === guestRow.id).guestVisible
ok(guestAfter1 === false, '点一下：该根改为仅登录可见', 'rootId=' + guestRow.id)
await clickSel('[data-testid="guest-switch-' + guestRow.id + '"]', 2000)
const guestAfter2 = (await apiRoots()).find(r => r.id === guestRow.id).guestVisible
ok(guestAfter2 === true, '再点一下：已复原', 'restored=' + guestAfter2)
console.log(NL + '== R6 新增库根（先关掉自动扫描）')
const TMP_NAME = 'p608临时根'
const TMP_PATH = 'E:/111/project/QTools/tmp'
await clickText('.root-toolbar-right .el-button', '新增库根', 1300)
const dialogOpen = await evaluate('!!document.querySelector(".el-dialog .el-input__inner")')
ok(dialogOpen, '新增弹窗已打开')
const autoScanOn = await evaluate('(() => { const el = document.querySelector("[data-testid=\\"root-auto-scan\\"]"); return !!el && el.classList.contains("is-checked") })()')
if (autoScanOn) await clickSel('[data-testid="root-auto-scan"]', 700)
ok(await evaluate('!document.querySelector("[data-testid=\\"root-auto-scan\\"]").classList.contains("is-checked")'), '「创建后立即扫描入库」已关掉（避免真的开跑扫描）')
ok(await fillInput(0, TMP_NAME), '填名称')
ok(await fillInput(1, TMP_PATH), '填路径')
let previewState = 'none'
for (let i = 0; i < 40; i++) {
  await sleep(1000)
  previewState = await evaluate('(document.querySelector("[data-testid=\\"root-preview\\"]") || {}).dataset ? document.querySelector("[data-testid=\\"root-preview\\"]").dataset.state : "none"')
  if (previewState === 'ready' || previewState === 'error') break
}
ok(previewState === 'ready' || previewState === 'error', '预演面板有结论（ready/error，不卡在 loading）', 'state=' + previewState)
await clickText('.el-dialog__footer .el-button', '保 存', 3000)
const afterCreate = await apiRoots()
const created = afterCreate.find(r => r.name === TMP_NAME)
ok(!!created, '新增成功并落库', 'id=' + (created && created.id))
ok(await evaluate(ROW_COUNT) === afterCreate.length, '列表已刷新', 'UI=' + (await evaluate(ROW_COUNT)) + ' API=' + afterCreate.length)

console.log(NL + '== R7 编辑库根')
if (!created) { ok(false, '编辑（缺少新建行）') } else {
  await clickSel('[data-testid="edit-' + created.id + '"]', 1300)
  ok(await evaluate('!!document.querySelector(".el-dialog .el-textarea__inner")'), '编辑弹窗已打开')
  await evaluate('(() => { const el = document.querySelector(".el-dialog .el-textarea__inner"); const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set; setter.call(el, "p608 编辑校验"); el.dispatchEvent(new Event("input", { bubbles: true })); return true })()')
  await clickText('.el-dialog__footer .el-button', '保 存', 3000)
  const edited = (await apiRoots()).find(r => r.id === created.id)
  ok(edited && edited.note === 'p608 编辑校验', '备注已更新并落库', 'note=' + (edited && edited.note))
}

console.log(NL + '== R8 删除库根')
if (!created) { ok(false, '删除（缺少新建行）') } else {
  await clickSel('[data-testid="delete-' + created.id + '"]', 1300)
  ok(await evaluate('!!document.querySelector(".el-message-box")'), '删除确认框已弹出')
  await clickText('.el-message-box__btns .el-button', '确定', 3000)
  ok(!(await apiRoots()).some(r => r.id === created.id), '删除成功并从库里移除', 'id=' + created.id)
  ok(await evaluate(ROW_COUNT) === baseRoots.length, '列表恢复基线行数', 'UI=' + (await evaluate(ROW_COUNT)) + ' 期望=' + baseRoots.length)
}

console.log(NL + '== R9 基线复原')
const finalRoots = await apiRoots()
const finalPolicy = await apiPolicy()
const finalIds = finalRoots.map(r => r.id).sort((a, b) => a - b)
ok(JSON.stringify(finalIds) === JSON.stringify(baseIds), '库根列表与基线一致', JSON.stringify(finalIds))
ok(finalPolicy.restricted === basePolicy.restricted && finalPolicy.general === basePolicy.general && finalPolicy.guidance === basePolicy.guidance, '分级策略与基线一致', JSON.stringify({ g: finalPolicy.general, gd: finalPolicy.guidance, r: finalPolicy.restricted }))

writeFileSync(join(OUT, 'regress.json'), JSON.stringify({ passed: passed, failures: failures }, null, 2))
console.log(NL + (failures.length ? 'FAIL ' + passed + '/' + (passed + failures.length) : 'PASS ' + passed + '/' + passed))
chrome.kill()
process.exit(failures.length ? 1 : 0)
