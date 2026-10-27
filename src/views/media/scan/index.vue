<template>
  <ScanView
    :roots="roots"
    :root-id="rootId"
    :options="options"
    :job="job"
    :loading="loadingRoots"
    :starting="starting"
    :canceling="canceling"
    :running="running"
    :finished="finished"
    :auto-scroll="autoScroll"
    :not-ready="notReady"
    :error="error"
    :notice="notice"
    :rebuild="rebuild"
    :log-limit="LOG_LIMIT"
    @update:root-id="(value) => (rootId = value)"
    @update:options="(value) => Object.assign(options, value)"
    @update:auto-scroll="(value) => (autoScroll = value)"
    @refresh="loadRoots"
    @start="start"
    @cancel="cancel"
    @rebuild="rebuildIndex"
  />
</template>

<script setup name="MediaScanIngest">
/**
 * 扫描入库（P5.91）：**真正遍历磁盘入库的入口**
 *
 * 与「重建索引」的区别（用户分不清的就是这两件事）：
 *   - 本页：起 node doc/media-import/scan-media.js 去读**磁盘**，把新文件写进 media_*；
 *   - 重建索引（mode=scan）：媒体根写死在配置 scanArgs 里，同样是扫盘，但只能扫那一个根，
 *     而且任务只在结束时把日志尾部落库——本页要的是「选根 + 实时日志 + 取消」。
 *
 * 契约（detail 见 api/media.js 末尾）：
 *   GET  /api/media/admin/roots                → 只挑 kind=root 的（thumbs 产物根不能扫）
 *   POST /api/media/admin/scan                 { rootId, dryRun?, withVideo?, withPhoto?, limit?, force? } → { jobId, ... }
 *   GET  /api/media/admin/scan/jobs/active     → 进页面时接管正在跑的任务（刷新 / 换设备都不会「看不见」）
 *   GET  /api/media/admin/scan/jobs/{id}?tail= → { status, lines[], counters, lineCount, exitCode, reason, ... }
 *   POST /api/media/admin/scan/jobs/{id}/cancel
 *
 * 三态：接口未就绪（404/501/连不上）→ 页内黄色提示；其它错误 → 页内红色提示；正常 → 表单 + 运行面板。
 *      全程不弹全局错误条、不抛未捕获异常（与「库根管理 / 维护面板」同口径）。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  cancelScanIngest, getScanIngestActive, getScanIngestJob, listRoots, startScan, startScanIngest, getScanLatest
} from '@/api/media'
import {
  errorStatus, errorText, isFinished, isJobGone, isRunning, linesTail, normalizeJob, normalizeRoots
} from './scanModel'
import ScanView from './ScanView.vue'

/** 日志区最多显示多少行（后端环形缓冲 2000 行，这里只按需取 500） */
const LOG_LIMIT = 500

/** 轮询间隔：脚本没有逐条进度输出，1s 足够让日志「像在流」 */
const POLL_MS = 1000

const roots = ref([])
const rootId = ref(null)
const loadingRoots = ref(false)
const notReady = ref('')
const error = ref('')
const notice = ref('')

const options = reactive({ dryRun: false, withVideo: true, withPhoto: true, limit: 0, force: false })

const job = ref(null)
const starting = ref(false)
const canceling = ref(false)
const autoScroll = ref(true)

const rebuild = reactive({ running: false, message: '' })

let pollTimer = null
let rebuildTimer = null

const running = computed(() => !!(job.value && isRunning(job.value.status)))
const finished = computed(() => !!(job.value && isFinished(job.value.status)))

function stopPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function notReadyText(err, what) {
  const status = errorStatus(err)
  const text = errorText(err)
  if (status === 404 || status === 501 || /404|not found|no static resource|未就绪/i.test(text)) {
    return what + '未就绪（后端还没部署 P5.91）：本页暂时不可用，部署后刷新即可，其它媒体功能不受影响。'
  }
  return what + '读取失败：' + (text || '请求失败，请查看后端日志')
}

/** 库根下拉：只列 kind=root（服务端也拒绝 thumbs，前端不显示只是少一次 400） */
function loadRoots() {
  loadingRoots.value = true
  notReady.value = ''
  listRoots(true).then((res) => {
    const list = Array.isArray(res) ? res : (res && (res.list || res.roots)) || []
    roots.value = normalizeRoots(list)
    if (!rootId.value && roots.value.length) {
      const first = roots.value.find((root) => root.exists && root.readable !== false) || roots.value[0]
      rootId.value = first.id
    }
  }).catch((err) => {
    roots.value = []
    notReady.value = notReadyText(err, '库根接口')
  }).finally(() => {
    loadingRoots.value = false
  })
}

/** 进页面先看有没有正在跑的任务：有就接管（否则一刷新就「任务不见了」） */
function takeOver() {
  getScanIngestActive().then((res) => {
    const active = normalizeJob(res)
    if (!active) return
    job.value = active
    if (active.rootId) rootId.value = active.rootId
    notice.value = '已接管正在运行的任务 ' + active.jobId + '（刷新页面不会中断后端任务）'
    poll()
  }).catch((err) => {
    // active 接口不可用不阻塞本页：用户照样能手动启动（启动时后端会再判一次 409）
    if (isJobGone(err)) return
  })
}

function start() {
  if (running.value || starting.value) return
  if (!rootId.value) {
    error.value = '请先选择库根'
    return
  }
  starting.value = true
  error.value = ''
  notice.value = ''
  const body = {
    rootId: Number(rootId.value),
    dryRun: !!options.dryRun,
    withVideo: !!options.withVideo,
    withPhoto: !!options.withPhoto,
    limit: Number(options.limit) || 0,
    force: !!options.force
  }
  startScanIngest(body).then((res) => {
    const view = normalizeJob(res)
    if (!view) {
      error.value = '后端没有返回 jobId，无法跟踪进度（检查 /api/media/admin/scan 的部署版本）'
      return
    }
    job.value = view
    notice.value = options.dryRun
      ? 'dry-run：只统计不写库，跑完对照日志里的条数即可确认参数对不对'
      : ''
    poll()
  }).catch((err) => {
    const status = errorStatus(err)
    const text = errorText(err)
    error.value = status === 409
      ? (text || '已有任务在运行，请等它结束或先取消')
      : (text || '启动失败')
  }).finally(() => {
    starting.value = false
  })
}

function poll() {
  stopPoll()
  const current = job.value
  if (!current) return
  pollTimer = setTimeout(() => {
    getScanIngestJob(current.jobId, LOG_LIMIT).then((res) => {
      const next = normalizeJob(res)
      if (!next) return
      // 日志只留最后 LOG_LIMIT 行：后端环形缓冲可能更多，页面不多渲染
      next.lines = linesTail(next.lines, LOG_LIMIT)
      job.value = next
      if (isFinished(next.status)) {
        stopPoll()
        // 条目数变了：静默刷新库根下拉（不闪 loading，不清用户已选的根）
        listRoots(true).then((list) => {
          const normalized = normalizeRoots(Array.isArray(list) ? list : (list && list.roots) || [])
          if (normalized.length) roots.value = normalized
        }).catch(() => {})
        return
      }
      poll()
    }).catch((err) => {
      if (isJobGone(err)) {
        // 进程重启后内存任务表清空：这不是错误，照实说一句
        job.value = null
        notice.value = '任务记录已丢失（后端重启过）：内存里的扫描入库任务不跨重启，重新点「开始扫描」即可'
        stopPoll()
        return
      }
      error.value = errorText(err) || '读取任务状态失败'
      poll()
    })
  }, POLL_MS)
}

function cancel() {
  const current = job.value
  if (!current || canceling.value) return
  canceling.value = true
  error.value = ''
  cancelScanIngest(current.jobId).then((res) => {
    const next = normalizeJob(res)
    if (next) {
      next.lines = linesTail(next.lines, LOG_LIMIT)
      job.value = next
    }
    notice.value = '已请求取消：子进程被 destroy，状态在任务线程收尾后落为 cancelled'
  }).catch((err) => {
    error.value = errorText(err) || '取消失败'
  }).finally(() => {
    canceling.value = false
  })
}

/** 「重建索引」快捷按钮：mode=scan 的维护任务（同一把锁，扫描入库在跑时后端会 409） */
function rebuildIndex() {
  if (rebuild.running) return
  rebuild.running = true
  rebuild.message = '已触发重建索引，等待后端完成…'
  startScan('scan', {}).then(() => {
    pollRebuild()
  }).catch((err) => {
    rebuild.running = false
    rebuild.message = ''
    error.value = errorText(err) || '触发重建索引失败'
  })
}

function pollRebuild() {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    getScanLatest().then((res) => {
      const status = res && res.status
      if (isRunning(status)) {
        rebuild.message = '重建索引运行中…'
        pollRebuild()
        return
      }
      rebuild.running = false
      rebuild.message = status === 'failed'
        ? '重建索引失败：去「维护面板」看该任务日志'
        : '重建索引已完成：站端刷新即可看到新内容'
      loadRoots()
    }).catch((err) => {
      rebuild.running = false
      rebuild.message = ''
      error.value = errorText(err) || '重建索引状态读取失败'
    })
  }, 2000)
}

onMounted(() => {
  loadRoots()
  takeOver()
})

onBeforeUnmount(() => {
  stopPoll()
  if (rebuildTimer) clearTimeout(rebuildTimer)
})
</script>
