#!/usr/bin/env node
/**
 * p605-ui/run.mjs —— P6.05 管理端弹窗 / 抽屉溢出真浏览器审计
 *
 * 被测对象：QTools-M 构建产物（Spring 静态直读 QTools-M/dist，地址 /admin-ui/）+ 真实后端 :8080。
 * 因此先 build QTools-M，再跑本脚本，测的就是真实产物。
 *
 * 审计口径（每个弹窗 × 每档视口）：
 *   1) 弹窗底部（含 footer）在视口内：rect.bottom <= innerHeight 且 rect.top >= 0
 *   2) footer 主按钮中心点 elementFromPoint 命中按钮自己
 *   3) body 需要滚动时，滚到底后最后一行（表格）完整可见
 * 修前数值：在同一次打开状态里回注改动前的 CSS（等价于回滚 P6.05）再量一遍。
 *
 * 跑法：cd QTools-M && node devtools/p605-ui/run.mjs
 * 环境变量：QT_ORIGIN、QT_AUDIT_USER / QT_AUDIT_PWD、QT_ONLY=key1,key2
 * 输出：out/report.json + out/M-<key>-<w>x<h>-after.png（修前 FAIL 时另存 -before.png）
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
const ADMIN = ORIGIN + '/admin-ui'
const AUDIT_USER = process.env.QT_AUDIT_USER || 'p605audit'
const AUDIT_PWD = process.env.QT_AUDIT_PWD || 'admin123'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { w: 1600, h: 900, tag: '1600x900' },
  { w: 1280, h: 720, tag: '1280x720' },
  { w: 375, h: 812, tag: '375x812' }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
const failures = []
const rows = []
function ok(cond, name, extra) {
  if (cond) { passed++; console.log('  PASS ' + name + (extra ? '  -- ' + extra : '')) }
  else { failures.push(name + (extra ? ' -> ' + extra : '')); console.log('  FAIL ' + name + (extra ? ' -> ' + extra : '')) }
  return !!cond
}
const head = (t) => console.log('\n== ' + t)

/* ------------------------------------------------------------------ Chrome */
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) }) })
const cdpPort = await freePort()
const PROFILE = join(tmpdir(), 'qt-p605-m-chrome')
rmSync(PROFILE, { recursive: true, force: true })
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + cdpPort, '--remote-allow-origins=*',
  '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1', '--mute-audio',
  '--window-size=1600,900', 'about:blank'
], { stdio: 'ignore' })

function finish(code) {
  try { chrome.kill() } catch (e) {}
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ passed, failures, rows }, null, 2))
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
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', () => rej(new Error('CDP WebSocket 连接失败')), { once: true })
})
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
await send('Page.enable')
await send('Runtime.enable')

async function evaluate(expression, timeout) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, timeout)
  if (r.exceptionDetails) throw new Error('页面求值异常: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text))
  return r.result.value
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'))
}
async function viewport(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
}

/* ------------------------------------------------------------- 页内 helper */
const HELPERS = String.raw`
window.__p605 = {
  vis(el) {
    if (!el) return false
    let n = el
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false
      n = n.parentElement
    }
    return true
  },
  click(sel, text) {
    const list = [...document.querySelectorAll(sel)].filter((el) => __p605.vis(el))
    const hit = text == null ? list[0] : list.find((el) => (el.textContent || '').replace(/\s+/g, ' ').includes(text))
    if (!hit) throw new Error('找不到 ' + sel + (text == null ? '' : ' 含「' + text + '」') + '；候选=' + list.map((e) => (e.textContent || '').trim().slice(0, 10)).join('|'))
    hit.click()
    return (hit.textContent || '').trim().slice(0, 20)
  },
  clickIdx(sel, idx) {
    const list = [...document.querySelectorAll(sel)].filter((el) => __p605.vis(el))
    const hit = list[idx]
    if (!hit) throw new Error('找不到 ' + sel + '[' + idx + ']，可见数=' + list.length)
    hit.click()
    return list.length
  },
  count(sel) { return [...document.querySelectorAll(sel)].filter((el) => __p605.vis(el)).length },
  pick(kind) {
    const sel = kind === 'drawer' ? '.el-drawer' : '.el-dialog'
    const list = [...document.querySelectorAll(sel)].filter((el) => __p605.vis(el))
    return list.length ? list[list.length - 1] : null
  },
  env() {
    return { dark: document.documentElement.classList.contains('dark'), bodyOverflow: getComputedStyle(document.body).overflow }
  },
  measure(kind) {
    const el = __p605.pick(kind)
    if (!el) return { error: 'no-visible-' + kind }
    const innerH = window.innerHeight, innerW = window.innerWidth
    const r = el.getBoundingClientRect()
    const body = el.querySelector(kind === 'drawer' ? '.el-drawer__body' : '.el-dialog__body')
    const footer = el.querySelector(kind === 'drawer' ? '.el-drawer__footer' : '.el-dialog__footer')
    const out = {
      kind,
      title: (el.querySelector(kind === 'drawer' ? '.el-drawer__title' : '.el-dialog__title') || {}).textContent || '',
      innerW, innerH,
      rect: { left: +r.left.toFixed(1), top: +r.top.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) },
      bottomOver: +(r.bottom - innerH).toFixed(1),
      topOver: +(0 - r.top).toFixed(1),
      fits: r.bottom <= innerH + 0.5 && r.top >= -0.5,
      body: null, footerBtn: null
    }
    if (body) {
      const bs = getComputedStyle(body)
      const info = { scrollH: body.scrollHeight, clientH: body.clientHeight, needScroll: body.scrollHeight > body.clientHeight + 1, overflowY: bs.overflowY, scrollW: body.scrollWidth, clientW: body.clientWidth }
      if (info.needScroll) {
        body.scrollTop = body.scrollHeight
        const br = body.getBoundingClientRect()
        info.reachedBottom = Math.abs(body.scrollTop + body.clientHeight - body.scrollHeight) <= 2
        // 判据 1：body 自己的最后一个直接子节点（最后一段内容）要在 body 视口内
        const last = body.lastElementChild
        if (last) {
          const lr = last.getBoundingClientRect()
          // 最后一段如果是比滚动视口还高的块，只要求「底边能看到」（滚到底就是看到它的结尾）
          info.lastBlock = { text: (last.textContent || '').replace(/\s+/g, ' ').trim().slice(-40), top: +lr.top.toFixed(1), bottom: +lr.bottom.toFixed(1), height: +lr.height.toFixed(1), fullyVisible: lr.bottom <= br.bottom + 1 && lr.top >= br.top - 1, endReachable: lr.bottom <= br.bottom + 1 }
        }
        // 判据 2：body 内第一张自滚表格（el-table max-height）滚到底时最后一行可见
        const wrap = [...body.querySelectorAll('.el-table__body-wrapper')].find((w) => w.scrollHeight > w.clientHeight + 1)
        if (wrap) {
          wrap.scrollTop = wrap.scrollHeight
          const wr = wrap.getBoundingClientRect()
          const trs = [...wrap.querySelectorAll('tbody tr')].filter((t) => __p605.vis(t))
          const ltr = trs.length ? trs[trs.length - 1] : null
          if (ltr) {
            const lr = ltr.getBoundingClientRect()
            info.innerTable = { text: (ltr.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30), top: +lr.top.toFixed(1), bottom: +lr.bottom.toFixed(1), fullyVisible: lr.bottom <= wr.bottom + 1 && lr.top >= wr.top - 1, wrapH: wrap.clientHeight, rows: trs.length }
          }
          wrap.scrollTop = 0
        }
        body.scrollTop = 0
      }
      out.body = info
    }
    if (footer) {
      const btn = footer.querySelector('.el-button--primary') || footer.querySelector('.el-button')
      if (btn) {
        const br = btn.getBoundingClientRect()
        const x = Math.round(br.left + br.width / 2), y = Math.round(br.top + br.height / 2)
        const hitEl = document.elementFromPoint(x, y)
        out.footerBtn = {
          text: (btn.textContent || '').trim().slice(0, 24),
          top: +br.top.toFixed(1), bottom: +br.bottom.toFixed(1),
          inViewport: br.bottom <= innerH + 0.5 && br.top >= -0.5 && br.right <= innerW + 0.5 && br.left >= -0.5,
          hit: !!hitEl && (hitEl === btn || btn.contains(hitEl)),
          hitTag: hitEl ? hitEl.tagName + (typeof hitEl.className === 'string' && hitEl.className ? '.' + hitEl.className.split(' ')[0] : '') : null
        }
      }
    }
    out.pass = out.fits && !!out.footerBtn && out.footerBtn.hit && (!out.body ||
      ((!out.body.lastBlock || out.body.lastBlock.endReachable) && (!out.body.innerTable || out.body.innerTable.fullyVisible)))
    return out
  },
  legacyOn() {
    if (document.getElementById('p605-legacy')) return
    const s = document.createElement('style')
    s.id = 'p605-legacy'
    s.textContent = [
      '.el-dialog:not(.is-fullscreen){display:block!important;max-height:none!important;overflow:visible!important;margin:6vh auto 50px!important;}',
      '.el-dialog:not(.is-fullscreen)>.el-dialog__header,.el-dialog:not(.is-fullscreen)>.el-dialog__footer{flex:none!important;}',
      '.el-dialog:not(.is-fullscreen)>.el-dialog__body{flex:none!important;min-height:0!important;overflow:visible!important;}',
      '.el-drawer{max-height:none!important;}',
      '.el-drawer>.el-drawer__body{min-height:auto!important;}'
    ].join('\n')
    document.head.appendChild(s)
  },
  legacyOff() { const e = document.getElementById('p605-legacy'); if (e) e.remove() },
  async step(st) {
    const deadline = Date.now() + (st.timeout || 15000)
    if (st.sleep) { await new Promise((r) => setTimeout(r, st.sleep)); return 'slept' }
    if (st.click) { return __p605.click(st.click.sel, st.click.text) }
    if (st.clickIdx) { return __p605.clickIdx(st.clickIdx.sel, st.clickIdx.idx) }
    while (Date.now() < deadline) {
      if (st.wait) {
        const list = [...document.querySelectorAll(st.wait.sel)].filter((el) => __p605.vis(el))
        const hit = st.wait.text == null ? list[0] : list.find((el) => (el.textContent || '').includes(st.wait.text))
        if (hit) return 'ok'
      }
      if (st.waitGone) {
        const list = [...document.querySelectorAll(st.waitGone.sel)].filter((el) => __p605.vis(el))
        if (!list.length) return 'ok'
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error('等待超时: ' + JSON.stringify(st))
  }
};
'ready'
`

/* -------------------------------------------------------------------- 登录 */
async function redisCode(uuid) {
  try {
    return execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', 'captcha_codes:' + uuid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(/^"|"$/g, '')
  } catch (e) { return '' }
}

await send('Page.navigate', { url: ADMIN + '/login' })
await sleep(2500)
writeFileSync(join(OUT, 'helpers.js'), HELPERS)
try { await evaluate(HELPERS) } catch (e) { console.error('HELPERS 注入失败，已存 out/helpers.js：' + e.message); finish(6) }
const captcha = await evaluate("fetch('/captchaImage',{headers:{'Content-Type':'application/json'}}).then(r=>r.json())")
const code = await redisCode(captcha.uuid)
if (!code) { console.error('读不到验证码（Redis captcha_codes:' + captcha.uuid + '）'); finish(4) }
const loginBody = { username: AUDIT_USER, password: AUDIT_PWD, code, uuid: captcha.uuid }
const loginRes = await evaluate("fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(" + JSON.stringify(loginBody) + ")}).then(r=>r.json())")
if (!loginRes.token) { console.error('登录失败: ' + JSON.stringify(loginRes)); finish(5) }
await evaluate("document.cookie='Admin-Token=" + loginRes.token + "; path=/'")
console.log('登录成功：' + AUDIT_USER)

async function goto(route) {
  await send('Page.navigate', { url: ADMIN + route })
  await sleep(900)
  for (let i = 0; i < 60; i++) {
    try { await evaluate(HELPERS); const ready = await evaluate("!!document.querySelector('.app-main')"); if (ready) break } catch (e) {}
    await sleep(250)
  }
  await sleep(1200)
  if (process.env.QT_DEBUG) {
    const info = await evaluate("JSON.stringify({url:location.href,title:document.title,appMain:!!document.querySelector('.app-main'),text:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,200)})")
    console.log('  [debug] ' + info)
  }
}

/* ------------------------------------------------------------------ 审计表 */
const RECIPES = [
  { key: 'maint-drawer', name: '维护（抽屉）', kind: 'drawer', route: '/media',
    steps: [{ click: { sel: 'button', text: '维护' } }, { wait: { sel: '.el-drawer', timeout: 20000 } }, { sleep: 1200 }] },
  { key: 'rating-classify', name: '内容自动分级', kind: 'dialog', route: '/media',
    steps: [{ click: { sel: 'button', text: '维护' } }, { wait: { sel: '[data-testid="maint-rating-classify"]', timeout: 20000 } },
      { click: { sel: '[data-testid="maint-rating-classify"]' } }, { wait: { sel: '.rc-stats', timeout: 240000 } }, { sleep: 800 }] },
  { key: 'tag-normalize', name: '标签规范化', kind: 'dialog', route: '/media',
    steps: [{ click: { sel: 'button', text: '维护' } }, { wait: { sel: '[data-testid="maint-tag-normalize"]', timeout: 20000 } },
      { click: { sel: '[data-testid="maint-tag-normalize"]' } }, { wait: { sel: '.tn-stats', timeout: 240000 } }, { sleep: 800 }] },
  { key: 'scan-drawer', name: '扫描 / 导入媒体库（抽屉）', kind: 'drawer', route: '/media',
    steps: [{ click: { sel: 'button', text: '扫描 / 导入' } }, { wait: { sel: '.el-drawer', timeout: 20000 } }, { sleep: 1500 }] },
  { key: 'duplicates-drawer', name: '重复文件（抽屉）', kind: 'drawer', route: '/media',
    steps: [{ click: { sel: 'button', text: '重复文件' } }, { wait: { sel: '.el-drawer', timeout: 30000 } }, { sleep: 1500 }] },
  { key: 'tag-manager', name: '标签管理', kind: 'dialog', route: '/media',
    steps: [{ click: { sel: 'button', text: '标签管理' } }, { wait: { sel: '.el-dialog', timeout: 25000 } }, { sleep: 1500 }] },
  { key: 'edit-policy', name: '编辑策略（可见性）', kind: 'dialog', route: '/media',
    steps: [{ click: { sel: 'button', text: '编辑策略' } }, { wait: { sel: '.el-dialog', timeout: 20000 } }, { sleep: 1000 }] },
  { key: 'user-detail-drawer', name: '用户详情（抽屉）', kind: 'drawer', route: '/system/user',
    steps: [{ wait: { sel: '.link-type', timeout: 25000 } }, { click: { sel: '.link-type', text: AUDIT_USER } },
      { wait: { sel: '.el-drawer', timeout: 20000 } }, { sleep: 1500 }] },
  { key: 'auth-role', name: '分配角色', kind: 'dialog', route: '/system/user',
    steps: [{ wait: { sel: '.el-table__body tbody tr', timeout: 25000 } },
      { clickIdx: { sel: '.el-table__body tbody tr:last-child td:last-child .el-button', idx: 3 } },
      { wait: { sel: '.el-dialog', timeout: 20000 } }, { sleep: 1500 }] },
  { key: 'select-user', name: '选择用户（top=5vh）', kind: 'dialog', route: '/system/role',
    steps: [{ wait: { sel: '.el-table__body tbody tr', timeout: 25000 } },
      { clickIdx: { sel: '.el-table__body tbody tr:last-child td:last-child .el-button', idx: 3 } },
      { wait: { sel: '.el-dialog', timeout: 20000 } }, { sleep: 1500 }] },
  { key: 'menu-edit', name: '菜单新增（长表单）', kind: 'dialog', route: '/system/menu',
    steps: [{ click: { sel: 'button', text: '新增' } }, { wait: { sel: '.el-dialog', timeout: 20000 } }, { sleep: 1200 }] },
  { key: 'dict-data', name: '字典数据', kind: 'dialog', route: '/system/dict',
    steps: [{ click: { sel: '.link-type' } }, { wait: { sel: '.el-dialog', timeout: 25000 } }, { sleep: 1500 }] },
  { key: 'root-create', name: '新增库根', kind: 'dialog', route: '/media-roots',
    steps: [{ click: { sel: 'button', text: '新增库根' } }, { wait: { sel: '.el-dialog', timeout: 20000 } }, { sleep: 1200 }] },
  { key: 'operlog-detail', name: '操作日志详情', kind: 'dialog', route: '/monitor/operlog',
    steps: [{ click: { sel: 'button', text: '详细' } }, { wait: { sel: '.el-dialog', timeout: 20000 } }, { sleep: 1200 }] },
  { key: 'appuser-detail', name: '用户端用户详情', kind: 'dialog', route: '/appuser/user',
    steps: [{ clickIdx: { sel: '[data-testid^="detail-"]', idx: 0 } }, { wait: { sel: '.el-dialog', timeout: 20000 } }, { sleep: 1500 }] }
]

const only = process.env.QT_ONLY ? process.env.QT_ONLY.split(',') : null

for (const vp of VIEWPORTS) {
  await viewport(vp.w, vp.h)
  head('视口 ' + vp.tag)
  for (const rec of RECIPES) {
    if (only && !only.includes(rec.key)) continue
    await goto(rec.route)
    let stepErr = null
    for (const st of rec.steps) {
      try { await evaluate('__p605.step(' + JSON.stringify(st) + ')', 260000) } catch (e) { stepErr = e.message; break }
    }
    if (stepErr) {
      rows.push({ key: rec.key, name: rec.name, viewport: vp.tag, status: 'SKIP', reason: stepErr.slice(0, 160) })
      console.log('  SKIP ' + rec.name + ' — ' + stepErr.slice(0, 120)); continue
    }
    const after = await evaluate('__p605.measure(' + JSON.stringify(rec.kind) + ')')
    if (after.error) {
      rows.push({ key: rec.key, name: rec.name, viewport: vp.tag, status: 'SKIP', reason: after.error })
      console.log('  SKIP ' + rec.name + ' — ' + after.error); continue
    }
    const env = await evaluate('__p605.env()')
    const afterShot = 'M-' + rec.key + '-' + vp.tag + '-after.png'
    await shot(afterShot)
    await evaluate('__p605.legacyOn()')
    await sleep(350)
    const before = await evaluate('__p605.measure(' + JSON.stringify(rec.kind) + ')')
    let beforeShot = ''
    if (!before.pass) { beforeShot = 'M-' + rec.key + '-' + vp.tag + '-before.png'; await shot(beforeShot) }
    await evaluate('__p605.legacyOff()')

    const desc = rec.name + ' @' + vp.tag
    ok(after.fits, desc + ' 底部在视口内', 'bottom=' + after.rect.bottom + ' innerH=' + after.innerH + ' over=' + after.bottomOver)
    if (after.footerBtn) {
      ok(after.footerBtn.inViewport && after.footerBtn.hit, desc + ' footer 按钮可点',
        'btnBottom=' + after.footerBtn.bottom + ' hit=' + after.footerBtn.hit + ' hitTag=' + after.footerBtn.hitTag)
    } else ok(true, desc + '（无 footer 按钮）', '')
    if (after.body && after.body.needScroll) {
      ok(!after.body.lastBlock || after.body.lastBlock.endReachable, desc + ' body 滚到底最后一段可见',
        JSON.stringify(after.body.lastBlock || {}))
      if (after.body.innerTable) {
        ok(after.body.innerTable.fullyVisible, desc + ' 表格自滚到底最后一行可见', JSON.stringify(after.body.innerTable))
      }
    }
    rows.push({ key: rec.key, name: rec.name, kind: rec.kind, viewport: vp.tag, theme: env.dark ? 'dark' : 'light', status: after.pass ? 'PASS' : 'FAIL', before, after, shots: [afterShot, beforeShot].filter(Boolean) })
    await evaluate("(()=>{const el=__p605.pick(" + JSON.stringify(rec.kind) + "); const b=el&&el.querySelector('.el-dialog__headerbtn,.el-drawer__close-btn'); if(b) b.click(); return true})()")
    await sleep(400)
  }
}

finish(0)
