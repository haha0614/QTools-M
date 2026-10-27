#!/usr/bin/env node
/**
 * p578-ui/run.mjs —— P5.78「库根管理」页的真浏览器实测（Chrome headless + CDP，零第三方依赖）
 *
 * 被测对象：QTools-M 构建产物（/admin-ui）+ 临时实例 :18081（克隆库 qtools_p578_tmp）。
 * 断言覆盖验收要求：
 *   1) 列表显示：id / 名称 / 路径 / 类型 / 未登录可见开关 / 可读 / 条目数 / 最后扫描
 *   2) 行内开关：点击即 PUT，toast，刷新后保持
 *   3) 编辑 / 新增 / 删除（有内容时二次确认并说明影响）
 *   4) 路径不存在 → 行标红 + 「目录不可读」
 *   5) 亮暗主题、窄屏可用
 *
 * 用法：node QTools-M/devtools/p578-ui/run.mjs
 * 输出：控制台 PASS/FAIL + out/*.png 截图 + out/network.log 抓包原文
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const ORIGIN = 'http://127.0.0.1:18081'
const ADMIN = ORIGIN + '/admin-ui'
const MYSQL = 'E:/111/project/QTools/tools/mysql/bin/mysql.exe'
const REDIS_CLI = 'E:/111/project/QTools/tools/redis/redis-cli.exe'
const DB = 'qtools_p578_tmp'
const OUT = path.resolve('E:/111/project/QTools/p578-evidence/ui')
const CDP_PORT = 9333

fs.mkdirSync(OUT, { recursive: true })

function sql(q) {
  return execFileSync(MYSQL, ['-h127.0.0.1', '-P3307', '-uroot', '-pdqq1107.', '--default-character-set=utf8mb4', DB, '-N', '-B', '-e', q],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** 只读 Redis 里的一个 key（登录验证码答案）；失败返回空串 */
function REDIS_GET(key) {
  try {
    const raw = execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    // 若依把答案以 JSON 字符串存（带双引号），这里去掉引号
    return raw.replace(/^"|"$/g, '')
  } catch (e) {
    return ''
  }
}
let pass = 0, fail = 0
const NET = []
const CHECKS = []
function check(name, ok, detail) {
  CHECKS.push((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  | ' + detail : ''))
  if (ok) { pass++; console.log('PASS  ' + name + (detail ? '  | ' + detail : '')) }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  | ' + detail : '')) }
}

/* ---------------------------------------------------------------- chrome */
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p578-chrome-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--window-size=1440,1000',
  '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + userDataDir, 'about:blank'
], { stdio: 'ignore' })

async function pageTarget() {
  for (let i = 0; i < 150; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')
      const list = await res.json()
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch { /* 还没起来 */ }
    await sleep(150)
  }
  throw new Error('Chrome CDP 没起来')
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.id = 0
    this.pending = new Map()
    this.handlers = new Map()
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res()
      this.ws.onerror = () => rej(new Error('ws error'))
    })
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (!msg.id) {
        const h = this.handlers.get(msg.method)
        if (h) h(msg.params)
        return
      }
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.rej(new Error(msg.error.message))
      else p.res(msg.result)
    }
  }
  on(method, fn) { this.handlers.set(method, fn) }
  send(method, params) {
    const id = ++this.id
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params: params || {} }))
    })
  }
  async evaluate(expression, awaitPromise) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: !!awaitPromise, returnByValue: true })
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description))
    }
    return r.result.value
  }
  close() { try { this.ws.close() } catch { /* ignore */ } }
}

const target = await pageTarget()
const cdp = new CDP(target.webSocketDebuggerUrl)
await cdp.ready

/* ---------------------------------------------------------------- 抓包 */
const reqs = new Map()
let currentUrl = ''
cdp.on('Network.requestWillBeSent', p => {
  reqs.set(p.requestId, { method: p.request.method, url: p.request.url, postData: p.request.postData || '' })
  currentUrl = p.request.url
})
cdp.on('Network.responseReceived', async p => {
  const rec = reqs.get(p.requestId)
  if (!rec) return
  rec.status = p.response.status
  const url = rec.url
  if (url.includes('/api/media/admin/roots') || url.includes('/api/media/index') || url.includes('/login') || url.includes('/captchaImage')) {
    try {
      const body = await cdp.send('Network.getResponseBody', { requestId: p.requestId })
      rec.body = body.body
    } catch { /* 有的响应拿不到 body */ }
  }
})
await cdp.send('Network.enable')
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')

async function goto(url, wait) {
  await cdp.send('Page.navigate', { url })
  await sleep(wait || 1500)
  // 每次导航都会丢掉注入的 helper（新 document），重新放进去
  await inject()
}

/** 把页内 helper 注入当前 document；导航后必须重新调用 */
async function inject() {
  for (let i = 0; i < 20; i++) {
    try {
      await cdp.evaluate(HELPERS)
      return
    } catch (e) {
      await sleep(200)
    }
  }
}

async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'))
}

/* 页面内常用动作（都走 Runtime.evaluate，失败抛错便于定位） */
const HELPERS = `
window.__p578 = {
  setVal(el, v) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  },
  clickText(sel, text) {
    const list = [...document.querySelectorAll(sel)]
    const hit = list.find(el => (el.innerText || '').trim().includes(text))
    if (!hit) throw new Error('找不到 ' + sel + ' 含「' + text + '」的元素；候选=' + list.map(e => (e.innerText || '').trim().slice(0, 12)).join('|'))
    hit.click()
    return true
  },
  rows() {
    return [...document.querySelectorAll('.root-table .el-table__body tbody tr')].map(tr => {
      const sw = tr.querySelector('.el-switch')
      const tagBad = !!tr.querySelector('.root-path-bad')
      const texts = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').trim())
      return {
        text: texts.join(' | '),
        switchOn: sw ? sw.classList.contains('is-checked') : null,
        pathBad: tagBad,
        rowClass: tr.className
      }
    })
  },
  toastText() {
    return [...document.querySelectorAll('.el-message')].map(el => (el.innerText || '').trim()).join(' ‖ ')
  }
}
true
`

// 上一次中途被中断可能留下「UI探针根」，先清掉，保证起始状态确定
sql("delete from media_root where name='UI探针根'")
const ROOT_COUNT = Number(sql('select count(*) from media_root'))

/* ---------------------------------------------------------------- 1. 登录（真表单 + 真验证码） */
console.log('=== 1. 管理端登录（浏览器里真填表单；验证码从 Redis 取答案，不改生产配置） ===')
let loginOk = false
for (let attempt = 1; attempt <= 2 && !loginOk; attempt++) {
await goto(ADMIN + '/login', 2500)
try {
  // 登录页会先打 /captchaImage，返回 {captchaEnabled, uuid, img}：uuid 就是 Vue 表单手里那个，
  // 答案在 Redis 的 captcha_codes:<uuid> 里（若依默认实现）。生产实例与临时实例共用 Redis，
  // 但这里只读一个马上要过期的 key，不改任何配置。
  const cap = [...reqs.values()].filter(r => r.url.includes('/captchaImage')).pop()
  let captchaOn = true
  let code = ''
  if (cap && cap.body) {
    const parsed = JSON.parse(cap.body)
    captchaOn = parsed.captchaEnabled !== false
    if (captchaOn && parsed.uuid) {
      code = REDIS_GET('captcha_codes:' + parsed.uuid)
      console.log('  验证码 uuid=' + parsed.uuid + ' 答案=' + code)
    }
  }
  loginOk = await cdp.evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter(i => i.type !== 'checkbox')
    if (inputs.length < 2) return 'inputs=' + inputs.length
    window.__p578.setVal(inputs[0], 'admin')
    window.__p578.setVal(inputs[1], 'admin123')
    if (inputs[2]) window.__p578.setVal(inputs[2], '${code}')
    return 'filled'
  })()`)
  await sleep(400)
  await cdp.evaluate(`window.__p578.clickText('button', '登')`)
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    const loc = await cdp.evaluate('location.pathname')
    if (loc && !loc.endsWith('/login')) break
  }
  const loc = await cdp.evaluate('location.pathname + location.search')
  const token = await cdp.evaluate(`(() => { const m = document.cookie.match(/(?:^|; )Admin-Token=([^;]+)/); return m ? decodeURIComponent(m[1]).slice(0, 20) : '' })()`)
  const loginCall = [...reqs.values()].filter(r => r.url.endsWith('/login') && r.method === 'POST').pop()
  const pageMsg = await cdp.evaluate(`[...document.querySelectorAll('.el-message, .el-form-item__error')].map(e => e.innerText).join(' / ')`)
  console.log('  POST /login -> ' + (loginCall ? loginCall.status + ' body=' + String(loginCall.body || '').slice(0, 120) : '(没抓到)'))
  console.log('  页面提示 = ' + pageMsg)
  loginOk = !String(loc).endsWith('/login')
  if (attempt > 1 || !loginOk) console.log('  （第 ' + attempt + ' 次登录' + (loginOk ? '成功' : '失败，重试') + '）')
} catch (e) {
  console.log('  登录异常：' + e.message)
}
}
const finalToken = await cdp.evaluate(`(() => { const m = document.cookie.match(/(?:^|; )Admin-Token=([^;]+)/); return m ? decodeURIComponent(m[1]).slice(0, 20) : '' })()`)
check('浏览器登录成功（不再是 /login）', loginOk, '')
check('Admin-Token cookie 已写入', !!finalToken, 'token=' + finalToken + '…')

/* ---------------------------------------------------------------- 2. 打开库根管理页 */
console.log('\n=== 2. 打开 /admin-ui/media-roots ===')
await goto(ADMIN + '/media-roots', 3000)
const state = await cdp.evaluate(`(() => {
  const el = document.querySelector('.root-page')
  return { has: !!el, state: el ? el.getAttribute('data-state') : null, rows: el ? el.getAttribute('data-rows') : null,
           title: el ? (el.querySelector('.root-page-title') || {}).innerText : null,
           body: document.body.innerText.slice(0, 400) }
})()`)
console.log('  页面状态 = ' + JSON.stringify({ has: state.has, state: state.state, rows: state.rows, title: state.title }))
check('页面渲染出 .root-page（路由 + 组件挂载成功）', state.has, 'title=' + state.title)
check('列表进入 ready 态且行数 = 库里的库根数（' + ROOT_COUNT + '）',
  state.state === 'ready' && Number(state.rows) === ROOT_COUNT,
  'data-state=' + state.state + ' data-rows=' + state.rows)
if (!state.has) console.log('  页面正文：' + state.body)

let rows = await cdp.evaluate('window.__p578.rows()')
console.log('  行内容：')
rows.forEach(r => console.log('    ' + r.text))
check('列表每行都有 id/名称/路径/类型/条目数',
  rows.length === ROOT_COUNT && rows.every(r => r.text.split('|').length >= 8), '行数=' + rows.length + ' 列数=' + (rows[0] ? rows[0].text.split('|').length : 0))
check('第 1 行是默认根（主库）且标了「默认根」', /主库/.test(rows[0].text) && /默认根/.test(rows[0].text), rows[0].text)
check('根3「私有库」的未登录可见开关默认关闭', !!rows[2] && rows[2].switchOn === false, 'switchOn=' + (rows[2] && rows[2].switchOn))
check('根1/根2 的开关默认打开', rows[0].switchOn === true && rows[1].switchOn === true,
  'row1=' + rows[0].switchOn + ' row2=' + rows[1].switchOn)  // 守卫见上
check('条目数一栏是「视频 / 相册 / 照片」三组数字', /^\d+ \/ \d+ \/ \d+$/.test((rows[2].text.split('|')[6] || '').trim()),
  '根3 条目数=' + rows[2].text.split('|')[6])
check('「最后扫描」一栏有值或 —（不报错）', /\d{4}-\d{2}-\d{2}/.test(rows[2].text) || /—/.test(rows[2].text), rows[2].text.split('|')[7] || '')
await shot('root-list-light.png')

/* ---------------------------------------------------------------- 3. 行内开关 */
console.log('\n=== 3. 行内开关：切根3 → PUT 保存 + toast + 刷新保持 ===')
const beforeLen = reqs.size
await cdp.evaluate(`(() => {
  const tr = [...document.querySelectorAll('.root-table .el-table__body tbody tr')][2]
  tr.querySelector('.el-switch').click()
  return true
})()`)
await sleep(1800)
const putCall = [...reqs.values()].filter(r => r.url.includes('/api/media/admin/roots/3') && r.method === 'PUT').pop()
const toastOn = await cdp.evaluate('window.__p578.toastText()')
console.log('  PUT 请求 = ' + (putCall ? putCall.method + ' ' + putCall.url + ' body=' + putCall.postData : '(没抓到)'))
console.log('  toast = ' + toastOn)
check('切开关发出 PUT /api/media/admin/roots/3', !!putCall, putCall ? putCall.url : '')
check('PUT body 只带 guestVisible', !!putCall && /"guestVisible":true/.test(putCall.postData), putCall ? putCall.postData : '')
check('PUT 返回 200', !!putCall && putCall.status === 200, 'status=' + (putCall && putCall.status))
check('弹出了 toast 提示', /未登录可见/.test(toastOn), toastOn.slice(0, 80))
rows = await cdp.evaluate('window.__p578.rows()')
check('开关立刻变到「开」', rows[2].switchOn === true, 'switchOn=' + rows[2].switchOn)
// 刷新页面（真刷新）后再看
await goto(ADMIN + '/media-roots', 3000)
rows = await cdp.evaluate('window.__p578.rows()')
check('刷新页面后开关仍是开（落库成功）', rows[2].switchOn === true, 'switchOn=' + rows[2].switchOn)
const dbVal = sql('select guest_visible from media_root where id=3')
check('库里 guest_visible=1', dbVal === '1', 'db=' + dbVal)
// 切回去
await cdp.evaluate(`(() => {
  const tr = [...document.querySelectorAll('.root-table .el-table__body tbody tr')][2]
  tr.querySelector('.el-switch').click()
  return true
})()`)
await sleep(1600)
const offCall = [...reqs.values()].filter(r => r.url.includes('/api/media/admin/roots/3') && r.method === 'PUT' && /"guestVisible":false/.test(r.postData || '')).pop()
check('再切一次 → PUT {"guestVisible":false} 200', !!offCall && offCall.status === 200, 'status=' + (offCall && offCall.status))
check('库里 guest_visible=0', sql('select guest_visible from media_root where id=3') === '0', 'db=' + sql('select guest_visible from media_root where id=3'))

/* ---------------------------------------------------------------- 4. 编辑 */
console.log('\n=== 4. 编辑对话框：改备注 → PUT ===')
await goto(ADMIN + '/media-roots', 2500)
await cdp.evaluate(`(() => {
  const tr = [...document.querySelectorAll('.root-table .el-table__body tbody tr')][1]
  tr.querySelectorAll('.el-button')[0].click()
  return true
})()`)
await sleep(900)
const dialog = await cdp.evaluate(`(() => {
  const d = document.querySelector('.el-dialog')
  return { open: !!d, title: d ? (d.querySelector('.el-dialog__title') || {}).innerText : '',
           labels: d ? [...d.querySelectorAll('.el-form-item__label')].map(l => l.innerText.trim()) : [],
           switchOn: d ? !!d.querySelector('.el-switch.is-checked') : null }
})()`)
console.log('  对话框 = ' + JSON.stringify(dialog))
check('编辑对话框打开且标题正确', dialog.open && /编辑库根/.test(dialog.title || ''), dialog.title)
check('表单含 名称 / 路径 / 类型 / 未登录可见 / 备注 五项',
  ['名称', '路径', '类型', '未登录可见', '备注'].every(l => dialog.labels.includes(l)), dialog.labels.join(','))
await cdp.evaluate(`(() => {
  const d = document.querySelector('.el-dialog')
  const ta = d.querySelector('textarea')
  window.__p578.setVal(ta, 'P5.78 编辑探针')
  return true
})()`)
await sleep(300)
await cdp.evaluate(`window.__p578.clickText('.el-dialog__footer button', '保')`)
await sleep(1600)
const editPut = [...reqs.values()].filter(r => r.url.includes('/api/media/admin/roots/2') && r.method === 'PUT').pop()
check('编辑保存发出 PUT /roots/2 且 200', !!editPut && editPut.status === 200,
  (editPut ? editPut.postData : '(没抓到)'))
check('库里根2 的备注已更新', sql('select note from media_root where id=2').includes('P5.78 编辑探针'),
  'note=' + sql('select note from media_root where id=2'))
sql("update media_root set note='派生资源，可重建' where id=2")

/* ---------------------------------------------------------------- 5. 新增 + 删除 */
console.log('\n=== 5. 新增库根 → 列表多一行；删除 → 少一行 ===')
await goto(ADMIN + '/media-roots', 2500)
const tempDir = 'E:/111/project/QTools/p578-evidence/tmp-root'
fs.mkdirSync(tempDir, { recursive: true })
await cdp.evaluate(`window.__p578.clickText('.root-toolbar-right button', '新增库根')`)
await sleep(900)
await cdp.evaluate(`(() => {
  const d = document.querySelector('.el-dialog')
  const inputs = [...d.querySelectorAll('input')]
  window.__p578.setVal(inputs[0], 'UI探针根')
  window.__p578.setVal(inputs[1], '${tempDir}')
  return inputs.map(i => i.value)
})()`)
await sleep(300)
await cdp.evaluate(`window.__p578.clickText('.el-dialog__footer button', '保')`)
await sleep(1800)
let postCall = null
for (let i = 0; i < 30; i++) {
  postCall = [...reqs.values()].filter(r => r.url.endsWith('/api/media/admin/roots') && r.method === 'POST' && r.status).pop()
  if (postCall) break
  await sleep(200)
}
check('新增发出 POST /roots 且 200', !!postCall && postCall.status === 200,
  (postCall ? postCall.status + ' ' + postCall.postData : '(没抓到)'))
const newId = sql("select id from media_root where name='UI探针根'")
check('库里出现新行', !!newId, 'id=' + newId)
rows = await cdp.evaluate('window.__p578.rows()')
check('列表刷新后 4 行', rows.length === 4, 'rows=' + rows.length)
const newRowSwitch = rows[3] ? rows[3].switchOn : null
check('新行「未登录可见」默认开', newRowSwitch === true, 'switchOn=' + newRowSwitch)

console.log('\n=== 5b. 删除空根（无内容 → 单次确认） ===')
await cdp.evaluate(`(() => {
  const tr = [...document.querySelectorAll('.root-table .el-table__body tbody tr')][3]
  const btns = tr.querySelectorAll('.el-button')
  btns[btns.length - 1].click()
  return true
})()`)
await sleep(800)
const confirm1 = await cdp.evaluate(`(() => { const b = document.querySelector('.el-message-box'); return { open: !!b, text: b ? b.innerText : '' } })()`)
check('删除弹出确认框并说明「只是去掉登记，磁盘文件不动」', confirm1.open && /磁盘文件不动/.test(confirm1.text), confirm1.text.replace(/\n/g, ' / ').slice(0, 120))
await cdp.evaluate(`window.__p578.clickText('.el-message-box__btns button', '确')`)
await sleep(1500)
const delCall = [...reqs.values()].filter(r => r.url.includes('/api/media/admin/roots/' + newId) && r.method === 'DELETE').pop()
check('确认后发出 DELETE /roots/' + newId + ' 且 200', !!delCall && delCall.status === 200, 'status=' + (delCall && delCall.status))
check('库里该行已删除', !sql("select id from media_root where name='UI探针根'"), '')
rows = await cdp.evaluate('window.__p578.rows()')
check('列表回到 3 行', rows.length === 3, 'rows=' + rows.length)

console.log('\n=== 5c. 删除有内容的根（3 视频 / 1 相册 / 2 照片）→ 二次确认 + 后端拒绝 ===')
await cdp.evaluate(`(() => {
  const tr = [...document.querySelectorAll('.root-table .el-table__body tbody tr')][2]
  const btns = tr.querySelectorAll('.el-button')
  btns[btns.length - 1].click()
  return true
})()`)
await sleep(800)
const confirm2 = await cdp.evaluate(`(() => { const b = document.querySelector('.el-message-box'); return { open: !!b, text: b ? b.innerText : '' } })()`)
console.log('  确认框：' + confirm2.text.replace(/\n/g, ' / '))
check('有内容时确认框写明「还有 3 条视频 / 1 个相册 / 2 张照片」',
  confirm2.open && /3 条视频/.test(confirm2.text) && /1 个相册/.test(confirm2.text) && /2 张照片/.test(confirm2.text),
  confirm2.text.replace(/\n/g, ' / ').slice(0, 160))
await cdp.evaluate(`window.__p578.clickText('.el-message-box__btns button', '确')`)
await sleep(1500)
const delRef = [...reqs.values()].filter(r => r.url.includes('/api/media/admin/roots/3') && r.method === 'DELETE').pop()
check('后端按引用拒绝（4xx）', !!delRef && delRef.status >= 400 && delRef.status < 500, 'status=' + (delRef && delRef.status))
const toastRef = await cdp.evaluate('window.__p578.toastText()')
check('页面 toast 出后端的拒绝原因（含引用数）', /库根仍被引用|引用/.test(toastRef), toastRef.slice(0, 140))
check('该根仍在库里', sql('select count(*) from media_root where id=3') === '1', '')

/* ---------------------------------------------------------------- 6. 路径不存在 → 标红 */
console.log('\n=== 6. 路径不存在 → 行标红 + 「目录不可读」 ===')
sql("update media_root set path='E:/111/project/QTools/p578-evidence/__not_exists__' where id=3")
await goto(ADMIN + '/media-roots', 3000)
rows = await cdp.evaluate('window.__p578.rows()')
console.log('  根3 行 = ' + (rows[2] ? rows[2].text : '(缺失)'))
check('行被标红（root-path-bad + 行样式）', !!rows[2] && rows[2].pathBad === true, 'pathBad=' + (rows[2] && rows[2].pathBad))
check('提示「目录不可读（路径不存在）」', /目录不可读/.test(rows[2].text) && /路径不存在/.test(rows[2].text), rows[2].text)
check('「可读」列显示 否', /否/.test(rows[2].text), rows[2].text)
await shot('root-list-path-missing.png')
sql("update media_root set path='E:/111/videos_placeholder' where id=3")
sql("update media_root set path='E:/111/视频/_媒体站' where id=3")
await goto(ADMIN + '/media-roots', 2500)
rows = await cdp.evaluate('window.__p578.rows()')
check('恢复路径后不再标红', rows[2] && rows[2].pathBad === false, 'pathBad=' + (rows[2] && rows[2].pathBad))

/* ---------------------------------------------------------------- 7. 亮 / 暗主题 */
console.log('\n=== 7. 亮 / 暗主题 ===')
const readTheme = () => cdp.evaluate(`(() => {
  const s = getComputedStyle(document.documentElement)
  const page = document.querySelector('.root-page')
  const body = document.body
  return { isDark: document.documentElement.classList.contains('dark'),
           bg: s.getPropertyValue('--el-bg-color').trim(),
           text: s.getPropertyValue('--el-text-color-primary').trim(),
           bodyBg: getComputedStyle(body).backgroundColor,
           pageColor: getComputedStyle(document.querySelector('.root-page-title')).color,
           tableBg: page ? getComputedStyle(page.querySelector('.el-table')).backgroundColor : '' }
})()`)
// 强制亮色（覆盖系统的 prefers-color-scheme，避免「亮暗都一样」的假通过）
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
await cdp.evaluate("document.documentElement.classList.remove('dark'); true")
await sleep(700)
const light = await readTheme()
await shot('root-list-light.png')
// 切暗色
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await cdp.evaluate("document.documentElement.classList.add('dark'); true")
await sleep(700)
const dark = await readTheme()
await shot('root-list-dark.png')
console.log('  亮色 = ' + JSON.stringify(light))
console.log('  暗色 = ' + JSON.stringify(dark))
check('亮色 --el-bg-color 是浅色值', /^#f|^#e|^#ffffff|^rgba\(255/i.test(light.bg) || light.bg.toLowerCase() === '#ffffff',
  '--el-bg-color=' + light.bg)
check('暗色 --el-bg-color 是深色值且与亮色不同', dark.bg !== light.bg && /^#1|^#0|^rgb\(2[0-9]|^rgb\(1[0-9]/i.test(dark.bg),
  light.bg + ' -> ' + dark.bg)
check('两种主题下标题文字颜色不同（真的换了主题）', light.pageColor !== dark.pageColor,
  'light=' + light.pageColor + ' dark=' + dark.pageColor)
check('两种主题下表格背景不同', light.tableBg !== dark.tableBg, 'light=' + light.tableBg + ' dark=' + dark.tableBg)
check('暗色下标题文字不是纯黑（可读）', !/rgb\(0, 0, 0\)/.test(dark.pageColor), 'color=' + dark.pageColor)
await cdp.send('Emulation.setEmulatedMedia', { features: [] })
await cdp.evaluate("document.documentElement.classList.remove('dark'); true")
await sleep(300)

/* ---------------------------------------------------------------- 8. 窄屏 */
console.log('\n=== 8. 窄屏（390×844） ===')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await sleep(900)
const narrow = await cdp.evaluate(`(() => {
  const doc = document.documentElement
  const page = document.querySelector('.root-page')
  return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth,
           pageWidth: page ? page.getBoundingClientRect().width : 0,
           toolbarWrap: getComputedStyle(document.querySelector('.root-toolbar')).flexWrap }
})()`)
console.log('  窄屏尺寸 = ' + JSON.stringify(narrow))
check('无横向溢出（scrollWidth <= innerWidth + 8）', narrow.scrollWidth <= narrow.innerWidth + 8,
  narrow.scrollWidth + ' vs ' + narrow.innerWidth)
check('工具栏允许换行（flex-wrap）', narrow.toolbarWrap === 'wrap', narrow.toolbarWrap)
await shot('root-list-narrow.png')
await cdp.send('Emulation.clearDeviceMetricsOverride')

/* ---------------------------------------------------------------- 9. 收尾 */
fs.writeFileSync(path.join(OUT, 'network.log'),
  [...reqs.values()].filter(r => /\/api\/media\/admin\/roots|\/api\/media\/index|\/login/.test(r.url))
    .map(r => r.method + ' ' + r.url + ' -> ' + r.status + (r.postData ? '\n    body: ' + r.postData : '') + '\n    resp: ' + String(r.body || '').slice(0, 260)).join('\n'))
fs.writeFileSync(path.join(OUT, 'checks.log'), CHECKS.join('\n') + '\n')

console.log('\n=== 结果：' + pass + ' passed / ' + fail + ' failed ===')
console.log('截图与抓包：' + OUT)
cdp.close()
chrome.kill()
process.exit(fail === 0 ? 0 : 1)
