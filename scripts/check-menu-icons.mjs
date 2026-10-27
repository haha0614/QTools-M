#!/usr/bin/env node
/**
 * scripts/check-menu-icons.mjs —— 菜单图标自查（P5.82）
 *
 * 为什么需要它：管理端图标来自本地 SVG sprite（src/assets/icons/svg/*.svg），
 * sys_menu.icon 写了一个不存在的名字时，<use xlink:href="#icon-xxx"> 找不到 symbol，
 * 浏览器不报错，菜单上就是一块无法排查的空白（「库根管理」曾经用 files，而 files.svg 不存在）。
 * 本脚本把「库里用到的图标名」和「sprite 里真实存在的图标名」对一遍，缺失即 exit 1，
 * 可以挂到发布前检查里。
 *
 * 用法：
 *   node scripts/check-menu-icons.mjs                 # 连真实库只读查 sys_menu（默认 127.0.0.1:3307/qtools）
 *   node scripts/check-menu-icons.mjs --json m.json   # 用 JSON 导出比对，不连库
 *   node scripts/check-menu-icons.mjs --verbose       # 额外列出未被任何菜单使用的图标
 *
 * JSON 导出文件允许三种形状（任选其一，脚本自动识别）：
 *   1) [{"menu_id":2016,"menu_name":"库根管理","icon":"files"}, ...]   ← SELECT menu_id, menu_name, icon 的结果
 *   2) ["files","folder", ...]                                        ← 只导出图标名
 *   3) {"data":[...]} / {"rows":[...]}                                ← 包了一层的接口返回
 *
 * 连库参数（仅 DB 模式）：环境变量优先，其次配置文件里的口令
 *   QT_DB_HOST(127.0.0.1) QT_DB_PORT(3307) QT_DB_USER(root) QT_DB_PASSWORD
 *   QT_DB_NAME(qtools) QT_MYSQL_CLIENT(<仓库根>/tools/mysql/bin/mysql.exe)
 *   QT_SECRET_YML(<仓库根>/QTools/qtools-admin/src/main/resources/secret.yml)
 * 只用 mysql 客户端进程读，不依赖任何 npm 依赖。
 *
 * 退出码：0 = 全部命中；1 = 有缺失（或读不到图标目录）；2 = 参数/环境问题。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = resolve(HERE, '..')                 // QTools-M
const REPO_ROOT = resolve(APP_ROOT, '..')            // QTools（便携根）

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const flag = (name) => process.argv.includes('--' + name)

const ICONS_DIR = resolve(arg('icons-dir', join(APP_ROOT, 'src/assets/icons/svg')))
const JSON_INPUT = arg('json', '')

/** sprite 里真实存在的图标名（与 vite-plugin-svg-icons 的 symbolId 'icon-[dir]-[name]' 对齐） */
function loadSpriteNames(dir) {
  if (!existsSync(dir)) {
    console.error('[check-menu-icons] 图标目录不存在：' + dir)
    process.exit(2)
  }
  const names = new Set()
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.toLowerCase().endsWith('.svg')) continue
      const rel = relative(dir, full).replace(/\\/g, '/').slice(0, -'.svg'.length)
      names.add(rel.split('/').join('-'))
    }
  }
  walk(dir)
  return names
}

function readSecretPassword() {
  if (process.env.QT_DB_PASSWORD) return process.env.QT_DB_PASSWORD
  const yml = process.env.QT_SECRET_YML || join(REPO_ROOT, 'QTools/qtools-admin/src/main/resources/secret.yml')
  if (!existsSync(yml)) return ''
  const text = readFileSync(yml, 'utf8')
  // 只认 master 节点下的 password，避免误取 redis/test 的口令
  const m = text.match(/druid:[\s\S]*?master:[\s\S]*?password:\s*(\S+)/)
  return m ? m[1].trim() : ''
}

function loadRowsFromDb() {
  const client = process.env.QT_MYSQL_CLIENT || join(REPO_ROOT, 'tools/mysql/bin/mysql.exe')
  const useClient = existsSync(client) ? client : 'mysql'
  const host = process.env.QT_DB_HOST || '127.0.0.1'
  const port = process.env.QT_DB_PORT || '3307'
  const user = process.env.QT_DB_USER || 'root'
  const db = process.env.QT_DB_NAME || 'qtools'
  const password = readSecretPassword()
  const sql = "SELECT menu_id, menu_name, icon FROM sys_menu WHERE icon IS NOT NULL AND icon <> '' AND icon <> '#' ORDER BY menu_id"
  const args = ['-h' + host, '-P' + port, '-u' + user, '-N', '-B', '-e', sql, db]
  // 口令走 MYSQL_PWD，不出现在命令行/进程列表里
  const out = execFileSync(useClient, args, {
    encoding: 'utf8',
    env: { ...process.env, MYSQL_PWD: password },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return parseTsv(out)
}

function parseTsv(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [menuId, menuName, icon] = line.split('\t')
    rows.push({ menu_id: menuId, menu_name: menuName, icon })
  }
  return rows
}

function loadRowsFromJson(file) {
  const raw = JSON.parse(readFileSync(resolve(file), 'utf8'))
  const list = Array.isArray(raw) ? raw : (raw.data || raw.rows || raw.list || [])
  if (!Array.isArray(list)) {
    console.error('[check-menu-icons] 无法识别的 JSON 形状，期望数组或 {data|rows|list: []}')
    process.exit(2)
  }
  return list
    .map((item) => (typeof item === 'string'
      ? { menu_id: '', menu_name: '(JSON 导出只给了图标名)', icon: item }
      : { menu_id: item.menu_id ?? item.menuId ?? '', menu_name: item.menu_name ?? item.menuName ?? '', icon: item.icon ?? '' }))
    .filter((r) => r.icon && String(r.icon).trim() !== '' && String(r.icon).trim() !== '#')
}

/** icon 名 → 使用它的菜单 */
function groupByIcon(rows) {
  const map = new Map()
  for (const row of rows) {
    const name = String(row.icon).trim()
    if (!name || name === '#') continue
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(row.menu_id ? row.menu_id + ' ' + row.menu_name : row.menu_name)
  }
  return map
}

const sprite = loadSpriteNames(ICONS_DIR)
let rows
try {
  rows = JSON_INPUT ? loadRowsFromJson(JSON_INPUT) : loadRowsFromDb()
} catch (err) {
  console.error('[check-menu-icons] 读菜单数据失败：' + (err && err.message))
  console.error('  连库不便时用 --json <导出文件> 比对（见文件头说明）。')
  process.exit(2)
}

const used = groupByIcon(rows)
const missing = [...used.keys()].filter((name) => !sprite.has(name)).sort()

const source = JSON_INPUT ? 'JSON ' + resolve(JSON_INPUT) : '库 ' + (process.env.QT_DB_NAME || 'qtools') + '.sys_menu'
console.log('[check-menu-icons] 图标目录：' + ICONS_DIR)
console.log('[check-menu-icons] sprite 图标数：' + sprite.size + '；菜单用到的图标名：' + used.size + '（来源：' + source + '）')

if (missing.length === 0) {
  console.log('[check-menu-icons] OK：全部 ' + used.size + ' 个菜单图标名都能在 sprite 里找到。')
  if (flag('verbose')) {
    const unused = [...sprite].filter((n) => !used.has(n)).sort()
    console.log('[check-menu-icons] 未被菜单使用的图标（' + unused.length + '）：' + unused.join(', '))
  }
  process.exit(0)
}

console.error('[check-menu-icons] 缺失 ' + missing.length + ' 个图标（这些菜单会显示空白/兜底图标）：')
for (const name of missing) {
  console.error('  - ' + name + '  ←  ' + used.get(name).join(' | '))
}
console.error('[check-menu-icons] 修法：往 src/assets/icons/svg/ 补同名 svg，或把 sys_menu.icon 改成已存在的名字。')
process.exit(1)
