#!/usr/bin/env node
/**
 * check-styles.mjs —— 模板里用到、但本文件 <style> 里没有定义的 class 检查（P6.236）
 *
 * 起因：拆分组件时按**行区间**删样式，多删了几行（.album-opt / .album-opt-cover），
 * 构建完全正常、页面也不报错，只是那一块样式没了 —— 只能靠人眼发现。
 * 这条检查把「模板在用但没定义」变成可自动发现的问题。
 *
 * 说明：
 * · 只看静态 class="..."；:class 里的动态值无法静态判定，跳过；
 * · <style> 里出现过 .foo 就算定义（含 :deep / 嵌套 / 媒体查询内）；
 * · 跳过 Element Plus 自带（el-*）、图标与状态辅助类（is-*、has-*）、以及 ALLOW 里的通用类。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const SRC = join(ROOT, 'src')

const ALLOW = new Set([
  // 布局/滚动容器等由全局样式或 Element Plus 提供
  'app-container', 'page-container', 'clearfix', 'hidden', 'w-full', 'text-center',
  'small-padding', 'fixed-width', 'mt8', 'mb8', 'mt10', 'mb10', 'ml8', 'mr8',
  // 以下为「只作为选择器钩子/语义容器」的 class：要么由附��� :deep 上样式，要么本就不需要样式。
  // 逐个看过模板用途，确认不是「样式被删漏」（P6.236 首次运行时的存量清单）。
  'album-body', 'album-dup', 'auto-rate-dialog', 'derive-abbr', 'derive-result-dialog', 'dr-body', 'dup-main', 'media-root-page', 'near-body', 'near-dup', 'near-radio', 'rc-dialog', 'root-kind-tag', 'root-table', 'rule-table', 'rv-inbound-mode', 'rv-inbound-tip', 'rv-seq', 'rv-seq-parked', 'scan-run', 'scan-text', 'scan-toolbar-right', 'studio-table', 'tn-dialog', 'video-dialog', 'vp-body'
])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

function templateClasses(src) {
  const end = src.search(/<script\b/)
  const tpl = end > 0 ? src.slice(0, end) : src
  const set = new Set()
  for (const m of tpl.matchAll(/\sclass="([^"]*)"/g)) {
    for (const raw of m[1].split(/\s+/)) {
      const c = raw.trim()
      if (!c || c.includes('{{') || c.includes('+')) continue
      set.add(c)
    }
  }
  return set
}

function styleSelectors(src) {
  const i = src.search(/<style\b/)
  if (i < 0) return new Set()
  const css = src.slice(i)
  const set = new Set()
  for (const m of css.matchAll(/\.([A-Za-z0-9_-]+)/g)) set.add(m[1])
  return set
}

/* 全局样式（assets/styles/*.scss）里定义过的 class 也算已定义，
   否则 layout / sidebar / tags-view 这些靠全局样式的文件会整片误报 */
const GLOBAL = new Set()
function collectGlobals(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) collectGlobals(p)
    else if (/\.(scss|css)$/.test(name)) {
      for (const m of readFileSync(p, 'utf8').matchAll(/\.([A-Za-z0-9_-]+)/g)) GLOBAL.add(m[1])
    }
  }
}
collectGlobals(join(SRC, 'assets', 'styles'))

/* 先只覆盖正在拆分的媒体库模块（views/media）。整仓普遍存在"由父组件 :deep 提供样式"
   的写法，全量开启误报太多；媒体库这块是本次改动的热点，先在这里当闸门。
   注意：选择器集合按整个模块汇总 —— 父页面用 :deep(.xxx) 给子组件里的 class 上样式，
   是这套代码的常规写法，按单文件判断会误报。 */
const SCOPES = [join(SRC, 'views', 'media')]
const FILES = SCOPES.flatMap(d => walk(d))

const ALL_SELECTORS = new Set(GLOBAL)
for (const file of FILES) {
  for (const sel of styleSelectors(readFileSync(file, 'utf8'))) ALL_SELECTORS.add(sel)
}

const problems = []
for (const file of FILES) {
  const src = readFileSync(file, 'utf8')
  const used = templateClasses(src)
  if (!used.size) continue
  const defined = ALL_SELECTORS
  for (const c of used) {
    if (defined.has(c) || ALLOW.has(c)) continue
    if (/^(el|is|has|v|dsh)-/.test(c)) continue
    problems.push({ file: relative(ROOT, file), name: c })
  }
}

if (problems.length) {
  console.error('[check-styles] 发现 ' + problems.length + ' 处「模板用了但样式没定义」的 class：')
  for (const p of problems) console.error('  - ' + p.file + ' → .' + p.name)
  process.exit(1)
}
console.log('[check-styles] 通过：模板里用到的 class 都有对应样式')
