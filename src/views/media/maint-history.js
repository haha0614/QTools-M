/**
 * 维护抽屉「上次执行」的本地记录（P6.04）
 *
 * 为什么以 localStorage 为主：
 *   后端 /api/media/admin/scan/list 的每条任务只有 type=full|thumb，没有 mode 列，
 *   一个 type=thumb 的 job 可能来自「缩略图 / 精灵图 / 预览片段 / GC」任意一个按钮，
 *   后端无法把历史行归到具体按钮上。所以每个按钮的最后一次执行按 actionKey 存本地，
 *   刷新页面不丢；打开面板时再用 scan/list 里**能识别**的任务（START 行带 gc/sprite/
 *   preview、enrich 行、EXPORT 行、scan 的 poster/backfill 标记）回填一次，
 *   识别不出的历史不猜——宁可显示「—」，也不把 A 按钮的结果贴到 B 按钮上。
 *
 * 本文件是纯函数模块（不 import Vue / axios），方便单测直接跑。
 */

export const HISTORY_KEY = 'qtools.media.maint.history.v1'

/** 存储不可用（隐私模式 / SSR）时静默降级：只在内存里活着，不抛异常 */
function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch (e) {
    return null
  }
}

export function loadHistory() {
  const ls = storage()
  if (!ls) return {}
  try {
    const raw = ls.getItem(HISTORY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch (e) {
    return {}
  }
}

export function saveHistory(map) {
  const ls = storage()
  if (!ls) return
  try {
    ls.setItem(HISTORY_KEY, JSON.stringify(map || {}))
  } catch (e) {
    /* 配额满 / 隐私模式：不阻断任何维护操作 */
  }
}

/** 写一条并返回新对象（组件把它塞回 ref，保证响应式） */
export function recordEntry(map, key, entry) {
  if (!key || !entry) return map || {}
  const next = { ...(map || {}), [key]: entry }
  saveHistory(next)
  return next
}

export function clearHistory() {
  const ls = storage()
  if (ls) {
    try {
      ls.removeItem(HISTORY_KEY)
    } catch (e) {
      /* ignore */
    }
  }
  return {}
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

/** 时间戳兼容秒 / 毫秒 / ISO / 'YYYY-MM-DD HH:mm:ss'；非法返回空串 */
export function formatWhen(value) {
  if (value == null || value === '') return ''
  let ms = NaN
  if (typeof value === 'number') {
    ms = value > 100000000000 ? value : value * 1000
  } else {
    const text = String(value).trim()
    if (!text) return ''
    const num = Number(text)
    if (isFinite(num)) {
      ms = num > 100000000000 ? num : num * 1000
    } else {
      ms = Date.parse(text)
      if (!isFinite(ms)) {
        // 显式拼 T：Safari / 部分内核不认 'YYYY-MM-DD HH:mm:ss'
        ms = Date.parse(text.replace(' ', 'T'))
      }
    }
  }
  if (!isFinite(ms)) return String(value)
  const d = new Date(ms)
  if (isNaN(d.getTime())) return String(value)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/** 「上次：2026-10-27 17:22 · 成功 239」里的后半段 */
export function formatHistoryEntry(entry) {
  if (!entry) return '—'
  const when = formatWhen(entry.at)
  const result = entry.result || ''
  if (!when && !result) return '—'
  return when + (result ? ' · ' + result : '')
}

function num(value) {
  const n = Number(value)
  return isFinite(n) ? n : null
}

/**
 * 后端任务视图 → 历史条目
 * job: { id, status, total, done, startedAt, finishedAt, derive:{ok,skip,fail} }
 */
export function entryFromJob(job) {
  if (!job) return null
  const status = job.status || 'done'
  const total = num(job.total)
  const done = num(job.done) || 0
  const derive = job.derive || {}
  const ok = num(derive.ok)
  const skip = num(derive.skip)
  const fail = num(derive.fail)
  let result = ''
  if (status === 'running') {
    result = '运行中'
  } else if (status === 'cancelled') {
    result = '已取消' + (done ? ' · 处理 ' + done : '')
  } else if (status === 'failed') {
    result = '失败' + (fail ? ' · 失败 ' + fail : (done ? ' · 处理 ' + done : ''))
  } else if (ok != null || fail != null) {
    result = '成功 ' + (ok != null ? ok : done)
      + (skip ? ' · 跳过 ' + skip : '')
      + (fail ? ' · 失败 ' + fail : '')
  } else {
    result = '完成 ' + done + (total ? ' / ' + total : '')
  }
  return {
    at: job.finishedAt || job.startedAt || new Date().toISOString(),
    status: status,
    total: total,
    done: done,
    ok: ok,
    skip: skip,
    fail: fail,
    jobId: job.id == null ? null : job.id,
    result: result,
    source: 'backend'
  }
}

/** 前端内部动作（清空回收站 / 重复文件检查 / 一致性检查）→ 历史条目 */
export function entryFromLocal(result, status, at) {
  return {
    at: at || new Date().toISOString(),
    status: status || 'done',
    result: result || '',
    source: 'local'
  }
}

/**
 * 后端任务日志 → 它最有可能是哪个按钮跑的
 * 只认能确定的标记；thumb 任务日志尾部没有 START 行（长任务被截断）时返回空数组。
 */
export function modeKeysFromJob(job) {
  if (!job) return []
  const lines = Array.isArray(job.logTail) ? job.logTail : []
  const text = lines.join('\n')
  const start = lines.find(line => /^START\b/.test(line))
  if (start) {
    if (/\bgc=1\b/.test(start)) return ['gc']
    const sprite = /\bsprites\b/.test(start) || /\bsprite=1\b/.test(start)
    const preview = /\bpvclips\b/.test(start) || /\bpreview=1\b/.test(start)
    if (sprite && preview) return ['sprite', 'preview']
    if (sprite) return ['sprite']
    if (preview) return ['preview']
    return ['thumb']
  }
  if (/^enrich\b/m.test(text)) return ['enrich']
  if (/^EXPORT\b/m.test(text)) return ['export']
  if (/poster_path|poster 校验|poster 修正/.test(text)) return ['fix-poster']
  if (/回填 content_hash/.test(text)) return ['backfill-hash']
  // type=full 还可能是 rescan / backfill / fix-poster：只有确实没有其它标记时才当 rescan
  if (job.type === 'full' || job.type === 'scan') return ['rescan']
  return []
}

function timeOf(entry) {
  if (!entry || !entry.at) return 0
  const text = String(entry.at)
  const num = Number(text)
  if (isFinite(num)) return num > 100000000000 ? num : num * 1000
  let ms = Date.parse(text)
  if (!isFinite(ms)) ms = Date.parse(text.replace(' ', 'T'))
  return isFinite(ms) ? ms : 0
}

/**
 * 用后端历史补本地记录：只补「本地没有」或「后端更新的」条目，不覆盖更新的本地记录。
 */
export function mergeBackendJobs(map, jobs) {
  let next = { ...(map || {}) }
  ;(Array.isArray(jobs) ? jobs : []).forEach(job => {
    if (!job || (job.status !== 'done' && job.status !== 'failed' && job.status !== 'cancelled')) return
    const entry = entryFromJob(job)
    if (!entry) return
    modeKeysFromJob(job).forEach(key => {
      const existing = next[key]
      if (!existing || timeOf(entry) >= timeOf(existing)) {
        next[key] = entry
      }
    })
  })
  return next
}
