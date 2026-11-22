/**
 * 表格溢出提示（show-overflow-tooltip）靠 el-table 的 tooltip-options 把 popper 挂到 body。
 * 原因：页面容器 .app-container 有 backdrop-filter，Chromium 会把它当成 position:fixed 子孙的包含块，
 * popper 的 translate 被套进容器坐标系 → 提示出现在离单元格很远的「表格内容流末尾」。
 * 漏加这个属性的表格在视觉上不会报错，只会「提示飞走」，所以用脚本兜住。
 *
 * 用法：node scripts/check-table-tooltip.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\//, '')
const SRC = join(ROOT, 'src')

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 引号感知地从 i 扫到标签结束的 '>' */
function tagEnd(text, i) {
  let quote = null
  for (let j = i; j < text.length; j++) {
    const ch = text[j]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      return j
    }
  }
  return -1
}

const bad = []
let total = 0
for (const file of walk(SRC, [])) {
  const text = readFileSync(file, 'utf8')
  let i = 0
  for (;;) {
    const at = text.indexOf('<el-table', i)
    if (at < 0) break
    i = at + 9
    // 排除 <el-table-column
    if (text[at + 9] === '-') continue
    if (!/[\s>]/.test(text[at + 9] || '')) continue
    const end = tagEnd(text, at)
    if (end < 0) break
    total++
    const tag = text.slice(at, end)
    if (!tag.includes('tooltip-options')) {
      const line = text.slice(0, at).split('\n').length
      bad.push(relative(ROOT, file).replace(/\\/g, '/') + ':' + line)
    }
    i = end
  }
}

if (bad.length) {
  console.error('[check-table-tooltip] 以下 ' + bad.length + ' 个 <el-table> 缺少 :tooltip-options="{ appendTo: \'body\' }"，' +
    '溢出提示会偏离单元格（.app-container 的 backdrop-filter 改了 fixed 包含块）：')
  for (const b of bad) console.error('  - ' + b)
  process.exit(1)
}
console.log('[check-table-tooltip] 通过：' + total + ' 个 <el-table> 都带了 tooltip-options')
