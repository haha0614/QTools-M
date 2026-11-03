#!/usr/bin/env node
/**
 * 轻量"未声明变量"检查（离线替代 ESLint no-undef）。
 *
 * 背景：本项目用 unplugin-auto-import，ref/computed 等不需要 import，
 * 所以真正的坑是那些**既不在 auto-import 里、也忘了 import 的名字**。
 * 线上真实事故：review.vue 里用了 14 次 proxy 却从未声明 —— 打包不报错，
 * 运行时整页崩。
 *
 * 做法：对每个 .vue 的 <script> 与每个 .js 文件，
 *   1. 收集声明：import（默认/具名/命名空间）、const/let/var（含解构）、function、class；
 *   2. 用一份"具体名字清单"去查：出现但没声明 → 报错。
 * 清单只放**确定不是全局、也不在 auto-import 里**的名字，避免误报。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(process.cwd(), 'src')

/** 这些名字属于项目/依赖，忘了声明就会运行时崩 */
const WATCH = [
  'proxy',
  'dayjs',
  'download',
  'parseTime',
  'handleTree',
  'resetForm',
  'addDateRange',
  'Cookies',
  'encrypt',
  'getToken',
  'Modal',
  'MessageBox',
  'useDict',
  'selectDictLabel',
  'permission',
  'auth',
  // 这些工具函数在多处被"各自复制一份"，拆组件时最容易漏 import
  'errorText',
  'errorStatus',
  'isJobGone',
  'failSummary',
  'formatBytes',
  'copyText'
]

/** auto-import 与运行时全局，出现不算错 */
const ALLOW = new Set([
  'ref', 'reactive', 'computed', 'watch', 'watchEffect', 'nextTick',
  'onMounted', 'onBeforeUnmount', 'onUnmounted', 'onActivated', 'onDeactivated',
  'getCurrentInstance', 'defineComponent', 'defineProps', 'defineEmits', 'defineExpose',
  'toRefs', 'toRef', 'shallowRef', 'shallowReactive', 'markRaw', 'provide', 'inject',
  'useSlots', 'useAttrs', 'h', 'resolveComponent', 'withDefaults',
  'useRouter', 'useRoute', 'onBeforeRouteLeave', 'onBeforeRouteUpdate',
  'defineStore', 'storeToRefs', 'useDict', 'selectDictLabel',
  'window', 'document', 'console', 'location', 'navigator', 'history',
  'localStorage', 'sessionStorage', 'performance', 'JSON', 'Math', 'Date',
  'Number', 'String', 'Boolean', 'Object', 'Array', 'Promise', 'Map', 'Set',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'FileReader', 'Event', 'CustomEvent',
  'alert', 'confirm', 'process', 'defineOptions'
])

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (/\.(vue|js)$/.test(name)) out.push(full)
  }
  return out
}

function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function scriptBlocks(text) {
  const blocks = []
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(text))) blocks.push(m[1])
  return blocks
}

function collectDeclared(code) {
  const names = new Set()

  for (const m of code.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = m[1]
    const defaultImport = clause.match(/^\s*([A-Za-z_$][\w$]*)/)
    if (defaultImport) names.add(defaultImport[1])
    const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)
    if (ns) names.add(ns[1])
    const braces = clause.match(/\{([\s\S]*?)\}/)
    if (braces) {
      for (const part of braces[1].split(',')) {
        const alias = part.split(' as ').pop().trim()
        if (/^[A-Za-z_$][\w$]*$/.test(alias)) names.add(alias)
      }
    }
  }

  for (const m of code.matchAll(/\b(?:const|let|var)\s+([\s\S]*?)=/g)) {
    const target = m[1].trim()
    const braces = target.match(/\{([\s\S]*?)\}/)
    if (braces) {
      for (const part of braces[1].split(',')) {
        const alias = part.split(':').pop().split('=')[0].trim()
        if (/^[A-Za-z_$][\w$]*$/.test(alias)) names.add(alias)
      }
    }
    const single = target.match(/^([A-Za-z_$][\w$]*)/)
    if (single) names.add(single[1])
  }

  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])

  // 函数参数 / 箭头函数参数：只用于减少误报（参数名本来就不是"未声明"）
  for (const m of code.matchAll(/\bfunction\s*[A-Za-z_$]*\s*\(([^)]*)\)/g)) addParams(m[1])
  for (const m of code.matchAll(/\(([^()]*)\)\s*=>/g)) addParams(m[1])
  for (const m of code.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) names.add(m[1])

  function addParams(list) {
    for (const part of list.split(',')) {
      const name = part.split('=')[0].replace(/\{([\s\S]*?)\}/g, (_a, inner) => {
        for (const p of inner.split(',')) {
          const n = p.split(':').pop().split('=')[0].trim()
          if (/^[A-Za-z_$][\w$]*$/.test(n)) names.add(n)
        }
        return ' '
      }).trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }

  return names
}

const files = walk(ROOT)
const problems = []

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  const blocks = file.endsWith('.vue') ? scriptBlocks(text) : [text]
  if (!blocks.length) continue

  const declared = new Set()
  for (const b of blocks) {
    for (const n of collectDeclared(stripComments(b))) declared.add(n)
  }

  const code = stripComments(blocks.join('\n'))
  for (const name of WATCH) {
    if (ALLOW.has(name) || declared.has(name)) continue
    const re = new RegExp('(^|[^\\w$.])' + name + '\\s*[.(\\[{]', 'm')
    if (re.test(code)) {
      problems.push({ file: path.relative(ROOT, file), name })
    }
  }
}

if (problems.length === 0) {
  console.log('[check-globals] 通过：' + files.length + ' 个文件，没有发现未声明的常见全局名')
  process.exit(0)
}

console.error('[check-globals] 发现 ' + problems.length + ' 处"用了但没声明"的名字：')
for (const p of problems) console.error('  - ' + p.file + ' → ' + p.name)
process.exit(1)
