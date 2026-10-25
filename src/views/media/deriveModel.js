/**
 * P5.10-B：派生资源状态的纯逻辑层（徽标三态 + 生成任务日志解析）。
 *
 * 单独成文件的原因：这些规则要能被单测 / SSR 直接 import，不需要挂载页面、也不发请求；
 * 页面（index.vue / DeriveBadges.vue / DeriveResultDialog.vue）只负责把结果画出来。
 *
 * 后端契约（P5.10-A，并行实现中；未就绪时调用方降级，本模块不抛异常）：
 *   GET  /api/media/admin/derive-status?page=&size=&ids=&q=&kind=
 *        → { rows: [{ videoId, title, dur,
 *                     thumb:   { exists, stale },
 *                     sprite:  { exists, stale, status: 'ok'|'missing' },
 *                     preview: { exists, stale, status: 'ok'|'oldAlgo'|'missing', mtime, frames },
 *                     bytes }],
 *            total, algoSince, algoSinceSource }
 *   三态：绿 = ok / 橙 = 过期(stale) 或旧算法(oldAlgo，仅预览) / 灰 = missing；
 *   旧后端没有 status 字段时自动退化到 exists/stale 两态。
 *   POST /api/media/admin/scan   body 增加 videoIds: [...]（只对 thumb / sprite / preview 生效）
 *   job 日志行：
 *     ITEM video=<id> task=<video|sprite|pvclip> result=<ok|skip|fail>
 *     RESULT ok=<n> skip=<n> fail=<n> ids=<id,id,...>
 */

/** 三个派生资源：abbr 是徽标里的那个字（一列里三连显示，列宽只占一个汉字）
    preview 的「帧」数只在 hover 详情里出现，所以 abbr 用「预」而不是「片」。 */
export const DERIVE_KINDS = [
  { key: 'thumb', abbr: '帧', label: '封面' },
  { key: 'sprite', abbr: '灵', label: '精灵图' },
  { key: 'preview', abbr: '预', label: '预览片段' }
]

/** 日志里的 task 取值 → 中文名；脚本里封面叫 video、预览片段叫 pvclip，两种都收 */
const TASK_LABELS = {
  video: '封面',
  thumb: '封面',
  sprite: '精灵图',
  pvclip: '预览片段',
  preview: '预览片段',
  'sprite,preview': '精灵图/预览'
}

/** 状态 → 中文；unknown 只出现在「接口给了行但没给这个产物字段」或整行缺失时 */
const STATE_LABELS = {
  ok: '正常',
  stale: '存在，已过期',
  oldAlgo: '旧算法产物',
  missing: '缺失',
  unknown: '状态未知'
}

const RESULT_LABELS = { ok: '成功', skip: '跳过', fail: '失败', done: '已处理' }

/** 日志里 task → 展示名（认不出就返回 fallback，绝不抛错） */
export function taskLabelOf(task, fallback) {
  const key = task == null ? '' : String(task)
  if (TASK_LABELS[key]) {
    return TASK_LABELS[key]
  }
  return fallback == null ? (key || '派生资源') : fallback
}

/** ok / skip / fail / done → 中文 */
export function resultLabelOf(result) {
  const key = result == null ? '' : String(result).toLowerCase()
  return RESULT_LABELS[key] || '已处理'
}

/** 结果归一化：日志里偶尔会写 OK / skipped 之类，统一成 ok / skip / fail / done */
export function normalizeResult(raw) {
  const text = String(raw == null ? '' : raw).toLowerCase()
  if (text.indexOf('ok') === 0) return 'ok'
  if (text.indexOf('skip') === 0) return 'skip'
  if (text.indexOf('fail') === 0) return 'fail'
  return 'done'
}

/** 时间戳 → 「YYYY-MM-DD HH:mm」：秒 / 毫秒时间戳、ISO、'YYYY-MM-DD HH:mm:ss' 都收；认不出返回空串 */
export function formatStamp(value) {
  if (value == null || value === '' || value === 0) return ''
  let ms = NaN
  if (typeof value === 'number') {
    ms = value > 100000000000 ? value : value * 1000
  } else {
    const text = String(value).trim()
    const num = Number(text)
    if (text !== '' && Number.isFinite(num)) {
      ms = num > 100000000000 ? num : num * 1000
    } else {
      ms = Date.parse(text.replace(' ', 'T'))
    }
  }
  if (!Number.isFinite(ms)) return ''
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

/**
 * 徽标悬停详情。三态 + 旧算法原因：
 *   「精灵图：正常」/「精灵图：缺失」
 *   「预览片段：存在，已过期」
 *   「预览片段：旧算法产物（2026-10-25 15:12 生成，算法更新于 2026-10-25 16:00）」
 */
export function badgeTitleOf(label, state, frames, extra) {
  const ctx = extra || {}
  const name = String(label || '派生资源')
  const frameText = (state === 'missing' || state === 'unknown' || !frames) ? '' : '（' + frames + ' 帧）'
  if (state === 'oldAlgo') {
    const made = formatStamp(ctx.mtime) || '生成时间未知'
    const since = formatStamp(ctx.algoSince) || '未知'
    return name + '：旧算法产物（' + made + ' 生成，算法更新于 ' + since + '）'
  }
  const suffix = STATE_LABELS[state] || STATE_LABELS.unknown
  return name + '：' + suffix + frameText
}

/**
 * 单个产物的状态：
 *  - 后端给了 status（P5.10-A 新契约）：ok / stale / oldAlgo（仅预览）/ missing 直接用；
 *  - 没有 status（旧后端 / 404 降级）→ 退化成 exists/stale 两态，不报错。
 */
export function stateOfSlot(slot, kindKey) {
  const raw = slot && typeof slot === 'object' ? slot : {}
  const status = String(raw.status == null ? '' : raw.status).toLowerCase()
  if (status === 'oldalgo' || status === 'old' || status === 'old-algo') return 'oldAlgo'
  if (status === 'missing' || status === 'absent') return 'missing'
  if (status === 'stale') return 'stale'
  if (status === 'ok' || status === 'fresh') return raw.stale ? 'stale' : 'ok'
  // 兼容：旧契约只有 exists / stale
  if (!raw.exists) return 'missing'
  return raw.stale ? 'stale' : 'ok'
}

/** 后端行 → 页面内部结构（字段缺失一律补 false / 0，不抛错） */
export function normalizeDeriveRow(row) {
  const source = row && typeof row === 'object' ? row : {}
  const id = source.videoId != null ? source.videoId : source.id
  const slotOf = (key) => {
    const raw = source[key]
    return {
      exists: !!(raw && raw.exists),
      stale: !!(raw && raw.stale),
      // P5.10-A 三态：ok / missing（sprite）；ok / oldAlgo / missing（preview）。旧后端没有这两个字段
      status: raw && raw.status != null ? String(raw.status) : '',
      mtime: raw && raw.mtime != null ? raw.mtime : null,
      frames: Number(raw && raw.frames) || 0
    }
  }
  return {
    videoId: id == null ? '' : String(id),
    title: source.title == null ? '' : String(source.title),
    dur: Number(source.dur) || 0,
    thumb: slotOf('thumb'),
    sprite: slotOf('sprite'),
    preview: slotOf('preview'),
    bytes: Number(source.bytes) || 0
  }
}

/**
 * 一行的三个徽标（顺序固定：封面 / 精灵图 / 预览）。
 * options = { algoSince }：derive-status 顶层的算法分界时间，只用于「旧算法」徽标的 tooltip。
 */
export function deriveBadgesOf(row, options) {
  const ctx = options || {}
  const badgeOf = (kind, state, frames, mtime) => ({
    key: kind.key,
    abbr: kind.abbr,
    label: kind.label,
    state,
    frames,
    title: badgeTitleOf(kind.label, state, frames, { mtime: mtime, algoSince: ctx.algoSince })
  })
  if (!row) {
    return DERIVE_KINDS.map(kind => badgeOf(kind, 'unknown', 0, null))
  }
  return DERIVE_KINDS.map(kind => {
    const slot = row[kind.key] || {}
    const frames = kind.key === 'preview' ? (Number(slot.frames) || 0) : 0
    return badgeOf(kind, stateOfSlot(slot, kind.key), frames, slot.mtime)
  })
}

/** 某一类产物在当前页的分布（绿 / 橙 / 灰），给「预览片段：新 5 · 旧算法 171 · 缺失 0」那行用 */
export function summarizeDerive(rows, kindKey) {
  const counts = { ok: 0, stale: 0, oldAlgo: 0, missing: 0, unknown: 0, total: 0 }
  ;(Array.isArray(rows) ? rows : []).forEach(raw => {
    const row = normalizeDeriveRow(raw)
    const state = stateOfSlot(row[kindKey], kindKey)
    if (counts[state] == null) counts.unknown += 1
    else counts[state] += 1
    counts.total += 1
  })
  return counts
}

/** 顶部汇总文案：「预览片段：新 5 · 旧算法 171 · 缺失 0」（过期 > 0 时追加一段） */
export function previewSummaryText(counts) {
  const data = counts || {}
  const parts = [
    '新 ' + (data.ok || 0),
    '旧算法 ' + (data.oldAlgo || 0),
    '缺失 ' + (data.missing || 0)
  ]
  if (Number(data.stale) > 0) {
    parts.push('过期 ' + Number(data.stale))
  }
  return '预览片段：' + parts.join(' · ')
}

/** 「只看旧算法」用的判定：预览片段是旧算法产物（其它产物 / 缺失都不算） */
export function isOldAlgoPreview(row, options) {
  if (!row) return false
  const badge = deriveBadgesOf(row, options).filter(item => item.key === 'preview')[0]
  return !!badge && badge.state === 'oldAlgo'
}

/** derive-status 的 rows → { '<videoId>': 行 }，页面按 id 取徽标 */
export function deriveMapOf(rows) {
  const map = {}
  ;(Array.isArray(rows) ? rows : []).forEach(row => {
    const normalized = normalizeDeriveRow(row)
    if (normalized.videoId) {
      map[normalized.videoId] = normalized
    }
  })
  return map
}

const ITEM_RE = /\bITEM\s+video=(\S+)\s+task=(\S+)\s+result=(\S+)(.*)$/
const RESULT_RE = /\bRESULT\s+ok=(\d+)\s+skip=(\d+)\s+fail=(\d+)(.*)$/

/** ids=1,2,3 / ids=1 2 3 两种写法都收 */
function parseIds(tail) {
  const m = /\bids=([^\s]+)/.exec(tail || '')
  if (!m) return []
  return m[1].split(/[,;]+/).map(text => text.trim()).filter(Boolean)
}

/** ITEM 行尾部可能带 out= / file= / path=，有就当作输出文件 */
function outputOf(tail) {
  const m = /\b(?:out|file|path)=([^\s]+)/.exec(tail || '')
  return m ? m[1] : ''
}

function toLines(logTail) {
  if (Array.isArray(logTail)) return logTail
  if (typeof logTail === 'string') return logTail.split(/\r?\n/)
  return []
}

function toIdList(ids) {
  if (!Array.isArray(ids)) return []
  return ids.map(id => (id == null ? '' : String(id))).filter(Boolean)
}

/**
 * 解析 job 日志：拿 ITEM 明细 + RESULT 汇总。
 * 同一个 (video, task) 出现多次时以最后一行为准（重试场景）。
 */
export function parseJobLog(logTail) {
  const items = []
  const seen = new Map()
  let summary = null
  toLines(logTail).forEach(line => {
    const text = line == null ? '' : String(line)
    if (!text) return
    const item = ITEM_RE.exec(text)
    if (item) {
      const key = item[1] + '|' + item[2]
      seen.set(key, {
        videoId: String(item[1]),
        task: String(item[2]),
        taskLabel: taskLabelOf(item[2]),
        result: normalizeResult(item[3]),
        resultLabel: resultLabelOf(item[3]),
        out: outputOf(item[4])
      })
      return
    }
    const res = RESULT_RE.exec(text)
    if (res) {
      summary = {
        ok: Number(res[1]) || 0,
        skip: Number(res[2]) || 0,
        fail: Number(res[3]) || 0,
        ids: parseIds(res[4])
      }
    }
  })
  return { items: Array.from(seen.values()), summary, hasItems: seen.size > 0 }
}

/**
 * 结果对话框的数据模型。
 *
 * payload = { logTail, requestedIds, titles, mode }
 *   titles：{ '<videoId>': '<标题>' }，一般由当前列表页 + derive-status 的 title 合并而来。
 * 规则：
 *   1. 有 ITEM 行 → 一行一条明细（视频标题 / 任务类型 / 结果 / 输出文件）；
 *   2. 只有 RESULT 汇总（或连汇总都没有，只剩请求里的 videoIds）→ 退化为「已处理 videoId 列表」，
 *      degraded 置 true，对话框顶部提示「后端只给了汇总」；
 *   3. 什么都没有 → empty 置 true，调用方据此不弹窗。
 */
export function buildResultModel(payload) {
  const data = payload || {}
  const parsed = parseJobLog(data.logTail)
  const titles = data.titles && typeof data.titles === 'object' ? data.titles : {}
  const titleOf = (id) => (titles[String(id)] == null ? '' : String(titles[String(id)]))
  const rows = parsed.items.map(item => ({
    videoId: item.videoId,
    title: titleOf(item.videoId),
    task: item.task,
    taskLabel: item.taskLabel,
    result: item.result,
    resultLabel: item.resultLabel,
    out: item.out || deriveOutputHint(item.task, item.videoId)
  }))
  let degraded = false
  if (!rows.length) {
    const summaryIds = parsed.summary && Array.isArray(parsed.summary.ids) ? parsed.summary.ids : []
    const fallbackIds = summaryIds.length ? summaryIds : toIdList(data.requestedIds)
    degraded = fallbackIds.length > 0
    const fallbackTask = data.mode ? taskLabelOf(data.mode) : '派生资源'
    fallbackIds.forEach(rawId => {
      const id = String(rawId)
      rows.push({
        videoId: id,
        title: titleOf(id),
        task: '',
        taskLabel: fallbackTask,
        result: 'done',
        resultLabel: resultLabelOf('done'),
        out: deriveOutputHint(data.mode, id)
      })
    })
  }
  const counted = { ok: 0, skip: 0, fail: 0 }
  rows.forEach(row => {
    if (counted[row.result] != null) {
      counted[row.result] += 1
    }
  })
  const summary = parsed.summary
    ? { ok: parsed.summary.ok, skip: parsed.summary.skip, fail: parsed.summary.fail }
    : counted
  const total = summary.ok + summary.skip + summary.fail
  return {
    rows,
    summary,
    total,
    degraded,
    hasItems: parsed.items.length > 0,
    empty: rows.length === 0 && total === 0
  }
}

/**
 * 输出文件的「约定路径」：日志没给 out= 时兜底展示。
 * 真实文件名从 P4 起按 content_hash 落盘（thumbs/v/<hash>.jpg），这里只能给按 id 的约定名，
 * 所以对话框里明确标注「约定路径」。
 */
export function deriveOutputHint(task, videoId) {
  const id = videoId == null ? '' : String(videoId)
  if (!id) return ''
  const key = String(task == null ? '' : task).toLowerCase()
  if (key === 'video' || key === 'thumb') return 'thumbs/v/' + id + '.jpg'
  if (key === 'sprite') return 'thumbs/s/' + id + '.jpg'
  if (key === 'pvclip' || key === 'preview') return 'thumbs/pv2/' + id + '.mp4'
  return ''
}

/** 汇总一句话：「本次处理 3 条：成功 1 / 跳过 1 / 失败 1」 */
export function summaryText(summary) {
  const data = summary || {}
  const ok = Number(data.ok) || 0
  const skip = Number(data.skip) || 0
  const fail = Number(data.fail) || 0
  return '本次处理 ' + (ok + skip + fail) + ' 条：成功 ' + ok + ' / 跳过 ' + skip + ' / 失败 ' + fail
}
