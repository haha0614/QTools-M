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
let seq = 0; const pending = new Map(); const events = []
ws.addEventListener('message', (ev) => { let m; try { m = JSON.parse(ev.data) } catch (e) { return } if (!m.id) { events.push(m); return } const j = pending.get(m.id); if (!j) return; pending.delete(m.id); m.error ? j.reject(new Error(m.error.message)) : j.resolve(m.result) })
const send = (method, params, timeout) => new Promise((resolve, reject) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)) }, timeout || 30000); pending.set(id, { resolve: v => { clearTimeout(t); resolve(v) }, reject: e => { clearTimeout(t); reject(e) } }); ws.send(JSON.stringify({ id, method, params: params || {} })) })
async function evaluate(expr, timeout) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true }, timeout); if (r.exceptionDetails) { const d = r.exceptionDetails; throw new Error('eval: ' + ((d.exception && d.exception.description) || d.text)) } return r.result.value }
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')
const cap = await (await fetch(ORIGIN + '/captchaImage')).json()
const rawCode = execFileSync(REDIS_CLI, ['-p', '6379', '--raw', 'get', 'captcha_codes:' + cap.uuid], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const code = rawCode.trim().replace(/^"|"$/g, '')
const login = await (await fetch(ORIGIN + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Qt608!audit', code, uuid: cap.uuid }) })).json()
if (!login.token) { console.error('login fail'); process.exit(5) }
await send('Network.setCookie', { name: 'Admin-Token', value: login.token, domain: '127.0.0.1', path: '/' })
await send('Page.navigate', { url: ADMIN + '/media-roots' })
await sleep(6000)
events.length = 0
const jsError = []
const box = await evaluate(`(() => { const el = Array.from(document.querySelectorAll('.sidebar-container a')).find(a => (a.textContent||'').trim() === '媒体库'); const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2 } })()`)
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
await sleep(3000)
const dom = await evaluate(`(() => {
  const main = document.querySelector('.app-main')
  const kids = main ? Array.from(main.children).map(el => ({ cls: el.className, tag: el.tagName, htmlLen: el.innerHTML.length, text: (el.innerText||'').slice(0,60), display: getComputedStyle(el).display, opacity: getComputedStyle(el).opacity, h: el.getBoundingClientRect().height, cls2: Array.from(el.classList) })) : null
  return {
    url: location.href,
    mainHtmlLen: main ? main.innerHTML.length : -1,
    mainHtml: main ? main.innerHTML.slice(0, 600) : '',
    kids,
    mainDisplay: main ? getComputedStyle(main).display : '',
    mainOpacity: main ? getComputedStyle(main).opacity : '',
    mainH: main ? main.getBoundingClientRect().height : -1,
    bodyText: document.body.innerText.trim().slice(0, 300),
    tagsView: Array.from(document.querySelectorAll('.tags-view-item')).map(t => t.textContent.trim()),
    vueApp: !!document.querySelector('#app').__vue_app__
  }
})()`)
console.log('DOM', JSON.stringify(dom, null, 1).slice(0, 4000))
console.log('--- events (no network):')
for (const e of events) {
  if (String(e.method).startsWith('Network.')) continue
  const p = e.params || {}
  if (e.method === 'Runtime.exceptionThrown') { const d = p.exceptionDetails || {}; console.log('EXC', ((d.exception && d.exception.description) || d.text || '').slice(0, 1500)) }
  else if (e.method === 'Runtime.consoleAPICalled') console.log('CONSOLE.' + p.type, (p.args||[]).map(a=>a.value!==undefined?String(a.value):(a.description||a.type)).join(' ').slice(0,1000))
  else if (e.method === 'Log.entryAdded') console.log('LOG.' + p.entry.level, (p.entry.text||'').slice(0,500), p.entry.url||'')
  else console.log(e.method, JSON.stringify(p).slice(0,300))
}
// probe Vue internals: app instance tree
const vue = await evaluate(`(() => {
  const el = document.querySelector('#app')
  const vapp = el && el.__vue_app__
  if (!vapp) return 'no vapp'
  const root = vapp._instance
  const out = []
  const walk = (inst, d) => {
    if (!inst || d > 8) return
    const name = inst.type && (inst.type.name || inst.type.__name || inst.type.__file || (typeof inst.type === 'string' ? inst.type : 'anon'))
    out.push('  '.repeat(d) + name + ' sub=' + (inst.subTree ? inst.subTree.type : 'null'))
    let c = inst.subTree
    const q = []
    const collect = (vnode, depth) => {
      if (!vnode || depth > 30) return
      if (vnode.component) q.push(vnode.component)
      if (Array.isArray(vnode.children)) vnode.children.forEach(c2 => collect(c2, depth + 1))
    }
    collect(c, 0)
    q.forEach(c2 => walk(c2, d + 1))
  }
  walk(root, 0)
  return out.join('\\n')
})()`)
console.log('--- VUE TREE:')
console.log(String(vue).slice(0, 4000))
writeFileSync(join(OUT, 'probe3.json'), JSON.stringify({ dom, events: events.filter(e => !String(e.method).startsWith('Network.')), vue }, null, 2))
chrome.kill(); process.exit(0)
