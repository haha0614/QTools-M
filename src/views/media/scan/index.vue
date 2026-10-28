<template>
  <div :class="embedded ? 'scan-embed' : ''">
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
      :retrying="retrying"
      :log-limit="LOG_LIMIT"
      @update:root-id="(value) => (rootId = value)"
      @update:options="(value) => Object.assign(options, value)"
      @update:auto-scroll="(value) => (autoScroll = value)"
      @refresh="loadRoots"
      @start="start"
      @cancel="cancel"
      @retry="retry"
    />
  </div>
</template>

<script setup name="MediaScanIngest">
/**
 * 扫描入库执行器（P5.91 起；P5.97 起是「流水线」而不是单一步骤）
 *
 * 一次点击跑完：扫盘写库 → 补 content_hash（扫描已写就跳过）→ 补元数据(ffprobe)
 *               → 封面 + 图片缩略图 →（可选精灵图 / 预览片段）→ 重建索引快照。
 * 每一步都是一个阶段：状态与耗时都在阶段条上，失败/跳过的阶段能只重试那一步。
 *
 * 入口（P5.97 合并后只剩两处，独立菜单已隐藏）：
 *   - 媒体库页工具栏「扫描 / 导入」（抽屉）；
 *   - 库根管理页：新增库根表单的预演 + 每行「扫描」按钮 + 「创建后立即扫描入库」开关。
 *
 * 契约（detail 见 api/media.js 末尾）：
 *   POST /api/media/admin/scan                { rootId, pipeline?, derive?, hash?, rebuildIndex?,
 *                                               withVideo?, withPhoto?, limit?, force?, dryRun? }
 *   GET  /api/media/admin/scan/jobs/active    → 进页面接管正在跑的任务
 *   GET  /api/media/admin/scan/jobs/{id}?tail → { status, phases[], lines[], counters, ... }
 *   POST /api/media/admin/scan/jobs/{id}/cancel
 *   POST /api/media/admin/scan/jobs/{id}/retry?phase=scan|hash|meta|thumb|sprite|index
 *
 * 三态：接口未就绪（404/501/连不上）→ 页内黄色提示；其它错误 → 页内红色提示；正常 → 表单 + 运行面板。
 *      全程不弹全局错误条、不抛未捕获异常（与「库根管理 / 维护面板」同口径）。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { cancelScanIngest, getScanIngestActive, getScanIngestJob, listRoots, startScanIngest, retryScanIngestPhase } from '@/api/media'
import { errorStatus, errorText, isFinished, isJobGone, isRunning, linesTail, normalizeJob, normalizeRoots } from './scanModel'
import ScanView from './ScanView.vue'

const props = defineProps({
  /** 进页面就选中的库根（库根管理页「扫描」按钮 / 新建后立即扫描时传进来） */
  rootId: { type: [Number, String], default: null },
  /** 抽屉里渲染：去掉页面级内边距，其余不变 */
  embedded: { type: Boolean, default: false },
  /** 挂载后自动点一次「开始扫描」（库根管理页「创建后立即扫描入库」用它） */
  autoStart: { type: Boolean, default: false }
})

const emit = defineEmits(['started', 'finished'])

/** 日志区最多显示多少行（后端环形缓冲 2000 行，这里只按需取 500） */
const LOG_LIMIT = 500

/** 轮询间隔：脚本没有逐条进度输出，1s 足够让日志「像在流」 */
const POLL_MS = 1000

const roots = ref([])
const rootId = ref(props.rootId || null)
const loadingRoots = ref(false)
const notReady = ref('')
const error = ref('')
const notice = ref('')
const retrying = ref('')

/**
 * 流水线默认值（P5.97）：
 *   pipeline=true 一次点击跑完整条链；derive=thumb 只做封面/缩略图（精灵图与预览是全片解码，很慢）
 */
const options = reactive({
  dryRun: false,
  withVideo: true,
  withPhoto: true,
  limit: 0,
  force: false,
  pipeline: true,
  derive: 'thumb'
})

const job = ref(null)
const starting = ref(false)
const canceling = ref(false)
const autoScroll = ref(true)

let pollTimer = null

/** autoStart 只生效一次：轮询刷新库根列表时不该反复开新的扫描 */
let autoStarted = false

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
function loadRoots(keepSelection) {
  loadingRoots.value = true
  notReady.value = ''
  listRoots(true).then((res) => {
    const list = Array.isArray(res) ? res : (res && (res.list || res.roots)) || []
    roots.value = normalizeRoots(list)
    if (!rootId.value && roots.value.length) {
      const first = roots.value.find((root) => root.exists && root.readable !== false) || roots.value[0]
      rootId.value = first.id
    } else if (keepSelection && rootId.value) {
      // 新根刚建好就来扫：它可能还不在上一次的列表里，重建后仍保持选中
      const found = roots.value.find((root) => String(root.id) === String(rootId.value))
      if (!found) rootId.value = roots.value.length ? roots.value[0].id : null
    }
    // 库根管理页勾了「创建后立即扫描入库」：根一出现在列表里就自动开跑（只自动一次）
    if (props.autoStart && !autoStarted && rootId.value && !running.value && !starting.value) {
      autoStarted = true
      start()
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
    force: !!options.force,
    // P5.97：一次点击把后续步骤串起来（dry-run 时后端强制不串）
    pipeline: !!options.pipeline && !options.dryRun,
    derive: options.derive,
    hash: true,
    rebuildIndex: true
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
      : (view.phases && view.phases.length > 1
        ? '已启动：扫描完成后会自动接着补哈希 / 补元数据 / 生成缩略图 / 重建索引，可随时中途停止'
        : '')
    emit('started', view)
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
        emit('finished', next)
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
    notice.value = '已请求取消：当前阶段的子进程被 destroy，状态在任务线程收尾后落为 cancelled'
  }).catch((err) => {
    error.value = errorText(err) || '取消失败'
  }).finally(() => {
    canceling.value = false
  })
}

/** 单步重试（P5.97）：只重跑那一步，成功后后端会自动接上后面还没成功的阶段 */
function retry(phaseKey) {
  const current = job.value
  if (!current || !phaseKey || retrying.value) return
  retrying.value = phaseKey
  error.value = ''
  retryScanIngestPhase(current.jobId, phaseKey).then((res) => {
    const next = normalizeJob(res)
    if (next) {
      next.lines = linesTail(next.lines, LOG_LIMIT)
      job.value = next
    }
    notice.value = '已重试阶段「' + phaseKey + '」：成功后会自动接上后面还没成功的阶段'
    poll()
  }).catch((err) => {
    error.value = errorText(err) || '重试失败'
  }).finally(() => {
    retrying.value = ''
  })
}

onMounted(() => {
  loadRoots()
  takeOver()
})

onBeforeUnmount(stopPoll)

defineExpose({ start, loadRoots })
</script>

<style scoped>
.scan-embed {
  padding: 0;
}
</style>
