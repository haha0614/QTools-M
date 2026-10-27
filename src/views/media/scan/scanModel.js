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
    costMs: raw.costMs === undefined || raw.costMs === null ? null : Number(raw.costMs)
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
