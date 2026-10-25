/**
 * duplicatesModel.js —— 重复文件管理页（P4-B）的纯逻辑层（无 Vue / 无网络）
 *
 * 为什么单独成文件：抽屉里真正要判定的东西只有三件事——
 *   1. 三种界面态（加载中 / 接口未就绪 / 空 / 有数据）怎么判；
 *   2. 体积与计数怎么格式化（后端给的是字节，界面要「1.20 GB」这种）；
 *   3. 二次确认要写清「会移到回收站 / 仅删记录」两种影响的哪一条。
 * 这三件事都不该缠在模板里，放这里可以直接跑单测（p4b-evidence/test-duplicates.mjs）。
 */

/** 与后端 kind 参数一一对应；顺序即抽屉里的切换顺序 */
export const KINDS = [
  { value: 'video', label: '视频', unit: '个视频' },
  { value: 'photo', label: '相册图片', unit: '张图片' }
]

export const PAGE_SIZES = [10, 20, 50]

export const NOT_READY_TEXT = '重复文件接口未就绪：后端部署 P4-A 后刷新页面即可（当前页面其余功能不受影响）'

function num(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

/** kind → 中文名（未知 kind 原样返回，不抛错） */
export function kindLabel(kind) {
  const hit = KINDS.find((k) => k.value === kind)
  return hit ? hit.label : String(kind == null ? '' : kind)
}

/** 字节 → 人类可读：与 MaintPanel / 媒体库其它地方的 GB/MB/KB 口径一致 */
export function formatBytes(bytes) {
  const n = num(bytes)
  if (n == null || n < 0) return '—'
  const KB = 1024
  const MB = 1024 * 1024
  const GB = 1024 * 1024 * 1024
  if (n >= GB) return (n / GB).toFixed(2) + ' GB'
  if (n >= MB) return (n / MB).toFixed(1) + ' MB'
  if (n >= KB) return Math.round(n / KB) + ' KB'
  return Math.round(n) + ' B'
}

/** 一组的副本数：后端给了 count 就用它，否则 = 别名数 + 主文件 */
export function groupCount(row) {
  const c = num(row && row.count)
  if (c != null && c > 0) return Math.round(c)
  const aliases = Array.isArray(row && row.aliases) ? row.aliases : []
  return aliases.length + 1
}

/** 一组可省空间：后端给了 bytesWasted 就用它，否则用副本体积之和兜底 */
export function groupWasted(row) {
  const w = num(row && row.bytesWasted)
  if (w != null && w >= 0) return w
  const aliases = Array.isArray(row && row.aliases) ? row.aliases : []
  return aliases.reduce((sum, a) => sum + (num(a && a.size) || 0), 0)
}

/** 主文件展示路径：relPath 优先，缺了就退 id（后端两种都可能给） */
export function primaryPath(row) {
  const p = row && row.primary
  return (p && (p.relPath || p.id)) || '（未知主文件）'
}

/** 别名列表（主文件不在其中）：展开行只列副本，避免和「主文件」列重复 */
export function groupAliases(row) {
  const aliases = Array.isArray(row && row.aliases) ? row.aliases : []
  return aliases.filter((a) => a && (a.relPath || a.id != null))
}

/**
 * 顶部统计：组数取后端 total（全库），可省空间按「本页」求和——
 * 接口一次只给一页，把本页合计冒充全库合计是错的，所以文案上明确写「本页」。
 */
export function duplicateTotals(rows, total) {
  const list = Array.isArray(rows) ? rows : []
  const bytes = list.reduce((sum, r) => sum + groupWasted(r), 0)
  const t = num(total)
  return {
    groups: t != null && t >= 0 ? Math.round(t) : list.length,
    pageGroups: list.length,
    bytes,
    bytesText: formatBytes(bytes)
  }
}

/** 是否是「后端还没部署这个接口」类错误：404 / 405 / 501 —— 只有这类才提示未就绪 */
export function isNotReadyError(err) {
  const status = err && err.response && err.response.status
  return status === 404 || status === 405 || status === 501
}

/**
 * 界面四态：loading / error（接口未就绪或网络异常）/ empty（0 组）/ data。
 * error 里再分「未就绪」与「真错误」，前者给引导文案，后者把后端消息带上。
 */
export function resolveViewState(input) {
  const s = input || {}
  const rows = Array.isArray(s.rows) ? s.rows : []
  if (s.loading) return { state: 'loading', message: '', notReady: false }
  // notReady 也算错误态：调用方在 404/405/501 时 deliberately 清空 error 文案（不当成网络错误提示）
  if (s.error || s.notReady) {
    const notReady = !!s.notReady
    return {
      state: 'error',
      notReady,
      message: notReady ? NOT_READY_TEXT : String(s.error)
    }
  }
  if (!rows.length) return { state: 'empty', message: '', notReady: false }
  return { state: 'data', message: '', notReady: false }
}

/** 页码合法性：total 变化后把超界页夹回最后一页 */
export function clampPage(page, total, size) {
  const p = num(page)
  const s = num(size) && size > 0 ? Math.round(size) : 20
  const t = num(total) && total > 0 ? Math.round(total) : 0
  const last = Math.max(1, Math.ceil(t / s))
  const cur = p == null || p < 1 ? 1 : Math.round(p)
  return Math.min(cur, last)
}

/**
 * 「清理副本」二次确认文案：必须把两种影响写清（deleteFiles 决定是移回收站还是只删记录）。
 * requireFiles=true 是当前勾选状态，文案随勾选实时变化。
 */
export function mergeConfirmText(input) {
  const s = input || {}
  const row = s.row || {}
  const kind = kindLabel(s.kind)
  const aliases = groupAliases(row)
  const primary = (row.primary && (row.primary.relPath || row.primary.id)) || '（未知主文件）'
  const effect = s.deleteFiles
    ? '副本文件会被移入回收站（可在回收站恢复，不会直接删除）'
    : '只删除索引记录，磁盘上的副本文件保持不动'
  return [
    '将把「' + primary + '」设为唯一主文件，清理同内容的 ' + aliases.length + ' 个' + kind + '副本。',
    '影响：' + effect + '。',
    '可省空间：' + formatBytes(groupWasted(row)) + '（仅统计被清理的副本体积）。'
  ].join('\n')
}

/** 「设为主文件」二次确认文案：只改记录，不动文件，但要说明旧主文件会变副本 */
export function keepConfirmText(input) {
  const s = input || {}
  const row = s.row || {}
  const alias = s.alias || {}
  const kind = kindLabel(s.kind)
  const target = alias.relPath || alias.id || '（未知路径）'
  return [
    '将把「' + target + '」设为这组' + kind + '的主文件。',
    '影响：只改索引记录，不移动、不删除任何文件；其余同内容文件（含原来的主文件）变成副本。',
    '副本数：' + Math.max(0, groupCount(row) - 1) + ' 个。'
  ].join('\n')
}

/** 行 key：contentHash 唯一；后端异常给空值时用下标兜底，避免 v-for 重复 key */
export function rowKey(row, index) {
  if (row && row.contentHash) return String(row.contentHash)
  return 'dup-' + String(index == null ? 0 : index)
}

/* ======================================================= P4.1 缩略图布局辅助 */
/* 下面这些都保持「纯函数 + 无 Vue」：缩略图 URL 规则 / 折叠行数 / 占位首字，都能直接单测。 */

/** 右栏默认最多显示几行副本，超出才出「展开全部」 */
export const ALIAS_PREVIEW_LIMIT = 6

/** 一组的稳定 key（与 rowKey 同口径，但优先用面板注入的 __key） */
export function groupKey(row, index) {
  if (row && row.__key) return String(row.__key)
  return rowKey(row, index)
}

/** 副本行 key：id 唯一，缺 id 用组 key + 下标兜底 */
export function aliasKey(alias, index, group) {
  if (alias && alias.id != null && alias.id !== '') return String(alias.id)
  return 'alias-' + String(group == null ? '' : group) + '-' + String(index == null ? 0 : index)
}

/** 单条记录（主文件或副本）的展示路径：relPath 优先，缺了退 id */
export function itemPath(item) {
  const it = item || {}
  if (it.relPath) return String(it.relPath)
  if (it.id != null && it.id !== '') return String(it.id)
  return '（未知路径）'
}

/**
 * 缩略图 URL —— 必须内容寻址，否则同一条记录换了内容还命中旧缓存：
 *   图片（kind=photo）：/api/media/thumb/p/<contentHash>（定位符就是内容哈希，后端单段路由）
 *   视频（kind=video）：/api/media/thumb/v/<id>（视频封面按 id，服务端内部再换内容寻址文件）
 * 拿不到定位符时返回空串，调用方据此渲染占位块，而不是拼一个必然 404 的地址。
 */
export function thumbPath(kind, item, groupHash) {
  const it = item || {}
  if (kind === 'photo') {
    const hash = String(it.contentHash || groupHash || '').trim()
    return hash ? '/api/media/thumb/p/' + encodeURIComponent(hash) : ''
  }
  const id = it.id == null || it.id === '' ? '' : String(it.id).trim()
  return id ? '/api/media/thumb/v/' + encodeURIComponent(id) : ''
}

/** 缩略图 404 / 加载失败时的占位字符：文件名首字（跳过标点），空路径给 '?' */
export function fileInitial(relPath) {
  const raw = String(relPath == null ? '' : relPath).trim()
  if (!raw) return '?'
  const base = raw.split(/[\\/]/).filter(Boolean).pop() || raw
  const hit = base.match(/[\p{L}\p{N}]/u)
  return (hit ? hit[0] : base.slice(0, 1)).toUpperCase()
}

/**
 * 右栏折叠窗口：折叠时只给前 limit 行，展开（expanded=true）时给全部。
 * more 只看总数是否超过上限——展开后仍要保留「收起」入口，所以 more 不随 expanded 变。
 */
export function aliasWindow(list, limit, expanded) {
  const all = Array.isArray(list) ? list : []
  const cap = num(limit) != null && limit > 0 ? Math.round(Number(limit)) : all.length
  const take = expanded ? all.length : cap
  return {
    visible: all.slice(0, take),
    hidden: Math.max(0, all.length - take),
    more: all.length > cap,
    collapsed: !expanded
  }
}

/** 缩略图坏掉后是否改写占位：url 为空或不处于 broken 集合里才算「还能显示」 */
export function thumbSrc(brokenMap, url) {
  if (!url) return ''
  const map = brokenMap || {}
  return map[url] ? '' : url
}

/** 标记某个缩略图地址已失败（404 / 解码失败），只记一次，避免反复重试打后端 */
export function markThumbBroken(brokenMap, url) {
  if (!brokenMap || !url) return false
  if (brokenMap[url]) return false
  brokenMap[url] = true
  return true
}