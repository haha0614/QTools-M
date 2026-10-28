/**
 * 库根管理页的「最后扫描时间」取数（P5.78）
 *
 * 后端没有「每个根最后一次扫描时间」的独立接口，但自动扫描状态里有：
 *   GET /api/media/admin/watch → { enabled, running, roots:[{ id, path, registered,
 *                                  lastEventAt, lastScanAt, pending }], ... }
 * 本页只需要把 roots 折成 { [rootId]: lastScanAt }。两条通道都试：
 *   1) 按 id 对齐（P5.78 起的后端会带 id）；
 *   2) 老后端只带 path：按「正斜杠归一 + 去尾部斜杠 + 小写」的路径对齐。
 *
 * 全部 silent：接口未就绪 / 无权限 / 连不上时返回空对象，页面「最后扫描」一栏退化成「—」，
 * 不影响库根列表本身（扫描状态不是这一页的核心信息）。
 */
import { getWatchStatus } from '@/api/media'

function normPath(value) {
  if (!value) return ''
  let text = String(value).trim().replace(/\\/g, '/')
  while (text.length > 1 && text.endsWith('/') && !text.endsWith(':/')) text = text.slice(0, -1)
  return text.toLowerCase()
}

function formatTime(value) {
  if (value === null || value === undefined || value === '') return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
}

/** 拉一次扫描状态并折成 { [rootId]: 'yyyy-MM-dd HH:mm:ss' }；失败一律空对象 */
export function listWatchRoots(signal) {
  return getWatchStatus(true, signal).then(res => {
    const body = res && typeof res === 'object' && res.data && !Array.isArray(res) ? res.data : res
    const roots = body && Array.isArray(body.roots) ? body.roots : []
    const byId = {}
    const byPath = {}
    roots.forEach(item => {
      if (!item) return
      const text = formatTime(item.lastScanAt)
      if (item.id !== undefined && item.id !== null && text) byId[item.id] = text
      const path = normPath(item.path)
      if (path && text) byPath[path] = text
    })
    return { byId, byPath }
  }).catch(() => ({ byId: {}, byPath: {} }))
}

/** 给页面用的最终映射：先按 id，再按路径兜底 */
export function lastScanByRoot(rows, maps) {
  const out = {}
  const byId = (maps && maps.byId) || {}
  const byPath = (maps && maps.byPath) || {}
  ;(rows || []).forEach(row => {
    if (!row || row.id === undefined || row.id === null) return
    const text = byId[row.id] || byPath[normPath(row.path)]
    if (text) out[row.id] = text
  })
  return out
}
