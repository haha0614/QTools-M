/**
 * P5.39 · 品牌一致性截图（Chrome headless + CDP，零第三方依赖）
 *
 * 跑法（先起管理端 dev server，harness 页由 vite 现编）：
 *   QTools-M $ ./node_modules/.bin/vite --port 5199 --strictPort
 *   QTools     $ node QTools-M/devtools/p539-brand/shot.mjs <url> <out.png> <w> <h> [waitSelector] [light|dark]
 *
 * 用到三个 harness 页：
 *   sidebar.html        侧栏 Logo（展开 + 收起，vite 现编真实 Logo.vue）
 *   favicon-strip.html  模拟标签栏，看 favicon 在浅/深底下的可辨性
 *   线上 /、/admin-ui/login 直接截真站
 */
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function freePort () {
  return new Promise((res, rej) => {
    const s = net.createServer()
    s.unref()
    s.on('error', rej)
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)) })
  })
}

class CDP {
  constructor (url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map() }
  ready () { return new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej }) }
  send (method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => this.pending.set(id, { res, rej }))
  }
  attach () {
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? rej(new Error(m.error.message)) : res(m.result)
      }
    }
  }
}

const [,, url, outFile, wStr, hStr, waitSel, scheme] = process.argv
const W = Number(wStr || 1440), H = Number(hStr || 900)

const PORT = await freePort()
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'p539-shot-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--force-color-profile=srgb',
  '--user-data-dir=' + profile,
  '--remote-debugging-port=' + PORT,
  '--window-size=' + W + ',' + H,
  'about:blank',
], { stdio: 'ignore' })

let target = null
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch('http://127.0.0.1:' + PORT + '/json/list')
    const list = await r.json()
    target = list.find(t => t.type === 'page')
    if (target) break
  } catch {}
  await sleep(200)
}
if (!target) { chrome.kill(); throw new Error('chrome cdp not ready') }

const cdp = new CDP(target.webSocketDebuggerUrl)
cdp.attach()
await cdp.ready()
await cdp.send('Page.enable')
await cdp.send('Runtime.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false })
if (scheme) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
await cdp.send('Page.navigate', { url })
await sleep(1500)
// 等选择器（可选）
if (waitSel) {
  for (let i = 0; i < 40; i++) {
    const r = await cdp.send('Runtime.evaluate', { expression: '!!document.querySelector(' + JSON.stringify(waitSel) + ')', returnByValue: true })
    if (r.result && r.result.value) break
    await sleep(200)
  }
}
await sleep(1200)
const title = await cdp.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
const shotRes = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, Buffer.from(shotRes.data, 'base64'))
console.log('TITLE=' + (title.result && title.result.value))
console.log('SAVED=' + outFile)
chrome.kill()