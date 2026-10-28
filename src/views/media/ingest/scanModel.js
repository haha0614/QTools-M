/**
 * 扫描入库页的纯函数（P5.91）
 *
 * 抽出来的理由：视图里「哪些库根能选 / 日志留多少行 / counters 怎么读 / 失败文案」这些判断
 * 与 Vue 无关，放在这里可以脱离浏览器直接断言（evidence 里的 node 探针就是 import 它跑的），
 * 页面只负责取数、轮询与渲染。
 */

/** 只有 kind=root 的库根能扫描入库（thumbs 根里是派生产物，扫进来全是无主文件） */
export function normalizeRoots(list) {
  const rows = Array.isArray(list) ? list : []
  return rows
    .filter((row) => row && typeof row === 'object' && String(row.kind || '').toLowerCase() === 'root')
    .map((row) => ({
      id: row.id,
      name: row.name || ('#' + row.id),
      path: row.path || '',
      exists: row.exists !== false,
      readable: row.readable !== false,
      videoCount: Number(row.videoCount || 0),
      albumCount: Number(row.albumCount || 0),
      photoCount: Number(row.photoCount || 0)
    }))
}

/** 下拉项主文案：名称（#id） */
export function rootOptionLabel(root) {
  return root ? root.name + '（#' + root.id + '）' : ''
}

/** 下拉项副文案：路径 + 当前条目数（「这个根里现在有多少东西」的唯一可视入口） */
export function rootOptionDetail(root) {
  if (!root) return ''
  const counts = root.videoCount + ' 视频 / ' + root.albumCount + ' 相册 / ' + root.photoCount + ' 图'
  const state = root.exists === false ? '（路径不存在）' : (root.readable === false ? '（不可读）' : '')
  return (root.path || '（无路径）') + ' · ' + counts + state
}


/* ---------------------------------------------------------------- P5.97 流水线阶段 */

/**
 * 阶段中文名（后端带 label，这里只做兜底：老后端没有 phases 时页面不显示阶段条）
 *
 * 阶段顺序就是执行顺序：scan → hash → meta → thumb →（sprite）→ index。
 * 「补元数据」是 P5.96 起扫描的自然延续（scan-media.js 不跑 ffprobe）。
 */
export const PHASE_LABELS = {
  scan: '扫描入库',
  hash: '补内容哈希',
  meta: '补元数据',
  thumb: '生成封面缩略图',
  sprite: '生成精灵图预览',
  index: '重建索引'
}

/** 阶段状态 → 中文 */
export function phaseStatusText(status) {
  const text = String(status || '')
  if (text === 'pending') return '等待'
  if (text === 'running') return '进行中'
  if (text === 'done') return '完成'
  if (text === 'failed') return '失败'
  if (text === 'skipped') return '跳过'
  if (text === 'cancelled') return '已取消'
  return text || '等待'
}

/** 阶段状态 → Element Plus tag 类型 */
export function phaseTagType(status) {
  const text = String(status || '')
  if (text === 'running') return 'warning'
  if (text === 'done') return 'success'
  if (text === 'failed') return 'danger'
  if (text === 'skipped') return 'info'
  if (text === 'cancelled') return 'info'
  return 'info'
}

/** 阶段是否值得单独重试：失败 / 跳过 / 取消都能再点一次（阶段动作全部幂等） */
export function canRetryPhase(phase, jobRunning) {
  if (!phase || jobRunning) return false
  return ['failed', 'skipped', 'cancelled'].indexOf(String(phase.status || '')) >= 0
}

/** 阶段耗时：1.2s / 2m30s（未开始给空串，别显示 0ms 骗人） */
export function phaseCostText(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1000) return value + 'ms'
  const seconds = Math.round(value / 1000)
  return seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm' + (seconds % 60) + 's'
}

/** 后端任务视图 → 阶段数组（缺字段一律按「没有」处理） */
export function normalizePhases(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list
    .filter((item) => item && typeof item === 'object' && item.key)
    .map((item) => ({
      key: String(item.key),
      label: String(item.label || PHASE_LABELS[item.key] || item.key),
      status: String(item.status || 'pending'),
      startedAt: item.startedAt || '',
      finishedAt: item.finishedAt || '',
      costMs: item.costMs === undefined || item.costMs === null ? null : Number(item.costMs),
      message: String(item.message || '')
    }))
}

/**
 * 阶段式进度条：每段等权（阶段数固定 3~6，等权比按耗时加权更可读——用户关心「走到第几步」）
 *
 * - 有阶段表：percent = (已完成阶段数 + 当前阶段的部分) / 总阶段数；
 * - 没有阶段表（老后端 / dry-run）：退回原来那条「不确定进度」的滚动条。
 */
export function pipelineProgressOf(job) {
  const phases = job && Array.isArray(job.phases) ? job.phases : []
  if (!phases.length) return progressOf(job)
  const settled = phases.filter((phase) => ['done', 'skipped', 'cancelled'].indexOf(phase.status) >= 0).length
  const current = phases.find((phase) => phase.status === 'running') || null
  if (isRunning(job.status)) {
    const percent = Math.min(99, Math.round(((settled + (current ? 0.5 : 0)) / phases.length) * 100))
    return { indeterminate: false, percent, current: current ? current.key : null }
  }
  return { indeterminate: false, percent: 100, current: null }
}

/** 阶段条一句话：当前阶段 / 全部完成 / 哪一步失败 */
export function pipelineSummary(job) {
  const phases = job && Array.isArray(job.phases) ? job.phases : []
  if (!phases.length) return ''
  const failed = phases.find((phase) => phase.status === 'failed')
  if (failed) return '阶段「' + failed.label + '」失败：' + (failed.message || '见日志')
  const running = phases.find((phase) => phase.status === 'running')
  if (running) return '正在执行「' + running.label + '」'
  const skipped = phases.filter((phase) => phase.status === 'skipped')
  const done = phases.filter((phase) => phase.status === 'done')
  return '全部阶段完成：' + done.length + ' 步成功'
    + (skipped.length ? '，' + skipped.length + ' 步跳过（' + skipped.map((p) => p.label).join(' / ') + '）' : '')
}

/** 后端任务视图 → 页面模型；字段缺一律按「没有」处理（旧后端 / 半截响应都不该让页面崩） */
export function normalizeJob(raw) {
  if (!raw || typeof raw !== 'object' || !raw.jobId) return null
  return {
    jobId: String(raw.jobId),
    status: String(raw.status || 'running'),
    lines: Array.isArray(raw.lines) ? raw.lines.filter((line) => typeof line === 'string') : [],
    counters: countersOf(raw),
    lineCount: Number(raw.lineCount || 0),
    warnings: Number(raw.warnings || 0),
    command: String(raw.command || ''),
    rootId: raw.rootId === undefined ? null : Number(raw.rootId),
    rootName: String(raw.rootName || ''),
    rootPath: String(raw.rootPath || ''),
    dryRun: !!raw.dryRun,
    withVideo: raw.withVideo !== false,
    withPhoto: raw.withPhoto !== false,
    limit: Number(raw.limit || 0),
    force: !!raw.force,
    startedAt: raw.startedAt || '',
    finishedAt: raw.finishedAt || '',
    exitCode: raw.exitCode === undefined || raw.exitCode === null ? null : Number(raw.exitCode),
    reason: raw.reason || '',
    costMs: raw.costMs === undefined || raw.costMs === null ? null : Number(raw.costMs),
    // P5.97 流水线：解析 / 派生档位 / 当前阶段 / 阶段表（老后端没有这些键 → 空，页面退化成单阶段）
    pipeline: !!raw.pipeline,
    derive: String(raw.derive || ''),
    currentPhase: raw.currentPhase || null,
    phases: normalizePhases(raw.phases)
  }
}

/** counters 归一到 5 个非负整数（后端只回这 5 个键，缺的按 0） */
export function countersOf(raw) {
  const src = (raw && raw.counters) || {}
  return {
    videos: Math.max(0, Number(src.videos || 0)),
    albums: Math.max(0, Number(src.albums || 0)),
    photos: Math.max(0, Number(src.photos || 0)),
    skipped: Math.max(0, Number(src.skipped || 0)),
    errors: Math.max(0, Number(src.errors || 0))
  }
}

/** counters 汇总文案（结束面板与落库对照都用它，口径只此一处） */
export function countersText(counters) {
  const c = counters || countersOf(null)
  return '视频 ' + c.videos + ' · 相册 ' + c.albums + ' · 图片 ' + c.photos
    + ' · 跳过 ' + c.skipped + ' · 错误 ' + c.errors
}

/** 只留最后 max 行（页面最多显示 500 行；后端环形缓冲是 2000 行） */
export function linesTail(lines, max) {
  const all = Array.isArray(lines) ? lines : []
  const limit = Math.max(0, Number(max || 0))
  if (!limit || all.length <= limit) return all.slice()
  return all.slice(all.length - limit)
}

export function isRunning(status) {
  return String(status || '') === 'running'
}

export function isFinished(status) {
  return ['done', 'failed', 'cancelled'].indexOf(String(status || '')) >= 0
}

/** 状态中文：running / done / failed / cancelled */
export function statusText(status) {
  const text = String(status || '')
  if (text === 'running') return '运行中'
  if (text === 'done') return '已完成'
  if (text === 'failed') return '失败'
  if (text === 'cancelled') return '已取消'
  return text || '未知'
}

/** Element Plus tag 的类型（status 决定颜色） */
export function statusTagType(status) {
  const text = String(status || '')
  if (text === 'running') return 'warning'
  if (text === 'done') return 'success'
  if (text === 'failed') return 'danger'
  return 'info'
}

/**
 * 进度条：扫描脚本只在结束时打汇总行（没有逐条 PROGRESS），所以运行期只能给「不确定进度」的
 * 滚动条 + counters 实时数字；结束后固定 100%。硬凑一个百分比等于骗人。
 */
export function progressOf(job) {
  if (!job) return { indeterminate: false, percent: 0 }
  if (isRunning(job.status)) return { indeterminate: true, percent: 30 }
  return { indeterminate: false, percent: 100 }
}

/** 后端错误体是媒体模块的 {error:"..."}；其它异常取 message，保证页面永远有一句话可显示 */
export function errorText(err) {
  const data = err && err.response && err.response.data
  if (data && typeof data === 'object' && (data.error || data.msg)) return String(data.error || data.msg)
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (typeof err === 'string') return err
  if (err && typeof err.message === 'string') return err.message
  return ''
}

export function errorStatus(err) {
  const status = err && err.response && err.response.status
  return Number(status) || 0
}

/** 任务丢了（进程重启后内存清空）：404 单独给一句话，不当成失败 */
export function isJobGone(err) {
  return errorStatus(err) === 404
}

/** 失败面板的一句话：exitCode + 原因（原因里已经带「超时 / 退出码」） */
export function failSummary(job) {
  if (!job) return ''
  const parts = []
  if (job.exitCode !== null && job.exitCode !== undefined) parts.push('exitCode=' + job.exitCode)
  if (job.reason) parts.push(job.reason)
  return parts.join(' · ') || '任务失败（后端没有给出退出码）'
}

/** 失败面板展示的最后 30 行（与日志区独立的红框，窄屏也不挤掉 counters） */
export function failLines(job) {
  return linesTail(job && job.lines, 30)
}