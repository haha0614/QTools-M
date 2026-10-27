/**
 * 图标存在性判定的唯一事实来源：vite-plugin-svg-icons 生成的 symbol 名单。
 *
 * virtual:svg-icons-names 导出的就是构建期注入页面的 sprite 里真实存在的 symbol id
 * （symbolId 配置为 'icon-[dir]-[name]'），与 <svg-icon> 里 <use xlink:href> 同源，
 * 所以「名单里有」等价于「渲染得出来」。历史 bug：sys_menu.icon 写了一个不存在的
 * 名字（如 files 曾经没有对应 svg），<use> 指向不存在的 symbol，浏览器不报错，
 * 菜单上就是一块空白。
 */
import iconSymbolIds from 'virtual:svg-icons-names'

const SYMBOL_PREFIX = 'icon-'

// 插件在 build 里给的是数组 ['icon-files', ...]；SSR/异常情况下可能是 {}，
// 两种形状都兜住，别让一个空名单把整个侧栏判成「全部缺失」。
const symbolIds = Array.isArray(iconSymbolIds) ? iconSymbolIds : Object.keys(iconSymbolIds || {})

/** sprite 里真实存在的图标名集合 */
export const ICON_NAMES = new Set(symbolIds.map((id) => String(id).slice(SYMBOL_PREFIX.length)))

/** 名单是否可用（不可用时不做事后判定，按原样渲染，避免误伤） */
export const ICON_NAMES_READY = ICON_NAMES.size > 0

/** 名字命中不到时用的默认图标（必须自己先存在，否则会二次兜底失败） */
export const DEFAULT_ICON = 'list'

/** 排序后的名单，供图标选择器使用 */
export const ICON_NAMES_SORTED = Array.from(ICON_NAMES).sort()

/**
 * @param {unknown} name 菜单/路由里配置的图标名
 * @returns {boolean} 该名字是否真的能渲染出图标
 */
export function hasIcon(name) {
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  // '#' 是若依约定：仅按钮型菜单用它占位，本来就没有图标
  if (trimmed === '' || trimmed === '#') return false
  // 名单拿不到时不做判定（宁可原样渲染，也不要给全站菜单挂上默认图标）
  if (!ICON_NAMES_READY) return true
  return ICON_NAMES.has(trimmed)
}

const warned = new Set()

/**
 * 同名只警告一次：侧栏在每次重渲染、多个位置（侧栏/面包屑/搜索）都会走到这里，
 * 不限流会瞬间刷屏。
 * @param {unknown} name
 */
export function warnMissingIcon(name) {
  const key = name == null ? '' : String(name).trim()
  if (key === '' || key === '#') return
  if (warned.has(key)) return
  warned.add(key)
  console.warn(
    '[SvgIcon] 图标 "' + key + '" 不在 src/assets/icons/svg（sprite 无 #icon-' + key + '），已回退为默认图标 "' + DEFAULT_ICON +
    '"。请检查 sys_menu.icon，或补一个同名 svg（QTools-M/scripts/check-menu-icons.mjs 可批量自查）。'
  )
}

/** 仅供自查脚本/单测重置去重状态 */
export function __resetIconWarnings() {
  warned.clear()
}
