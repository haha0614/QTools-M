<template>
  <div class="app-container scan-page" data-testid="scan-page" :data-status="job ? job.status : 'idle'"
    :data-roots="roots.length">
    <div class="scan-toolbar">
      <div class="scan-toolbar-left">
        <span class="scan-title">扫描入库</span>
        <span class="scan-sub">遍历库根目录里的视频 / 图片写进库：新增 + 更新，磁盘上没了的只标 missing（不删行）</span>
      </div>
      <div class="scan-toolbar-right">
        <el-button icon="Refresh" :loading="loading" data-testid="scan-refresh" @click="emit('refresh')">刷新库根</el-button>
      </div>
    </div>

    <el-alert v-if="notReady" :title="notReady" type="warning" :closable="false" show-icon class="scan-alert" />
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" show-icon class="scan-alert" />
    <el-alert v-if="notice" :title="notice" type="info" :closable="false" show-icon class="scan-alert" />

    <el-card class="scan-form" shadow="never">
      <div class="scan-field">
        <label class="scan-label">库根</label>
        <el-select :model-value="rootId" class="scan-root-select" placeholder="选择一个内容根（kind=root）"
          :disabled="running || starting" data-testid="scan-root-select"
          @update:model-value="(value) => emit('update:rootId', value)">
          <el-option v-for="root in roots" :key="root.id" :label="rootOptionLabel(root)" :value="root.id">
            <span class="scan-option-label">{{ rootOptionLabel(root) }}</span>
            <span class="scan-option-detail">{{ rootOptionDetail(root) }}</span>
          </el-option>
        </el-select>
        <span class="scan-hint">{{ selectedRoot ? rootOptionDetail(selectedRoot) : '还没有内容根：先去「库根管理」新增一个 kind=root 的库根' }}</span>
      </div>

      <div class="scan-options">
        <el-checkbox :model-value="options.withVideo" :disabled="running || starting" data-testid="scan-with-video"
          @update:model-value="(value) => setOption('withVideo', value)">扫描视频</el-checkbox>
        <el-checkbox :model-value="options.withPhoto" :disabled="running || starting" data-testid="scan-with-photo"
          @update:model-value="(value) => setOption('withPhoto', value)">扫描图片（相册）</el-checkbox>
        <el-checkbox :model-value="options.dryRun" :disabled="running || starting" data-testid="scan-dry-run"
          @update:model-value="(value) => setOption('dryRun', value)">只预演（dry-run：不写库，先验参数）</el-checkbox>
        <el-checkbox :model-value="options.force" :disabled="running || starting" data-testid="scan-force"
          @update:model-value="(value) => setOption('force', value)">强制（顺手清掉没被认领的 0 图旧相册）</el-checkbox>
        <span class="scan-limit">
          <span class="scan-label">limit</span>
          <el-input-number :model-value="options.limit" :min="0" :max="10000" :step="50" size="small"
            controls-position="right" :disabled="running || starting" data-testid="scan-limit"
            @update:model-value="(value) => setOption('limit', Number(value) || 0)" />
          <span class="scan-hint">0 = 不限（按目录顺序取前 n 个视频 / 前 n 张图）</span>
        </span>
      </div>

      <!-- P5.97：扫完之后要不要自动把后续步骤串起来（默认要）。关掉它就退回「只扫盘写库」。 -->
      <div class="scan-options">
        <el-checkbox :model-value="options.pipeline" :disabled="running || starting || options.dryRun"
          data-testid="scan-pipeline"
          @update:model-value="(value) => setOption('pipeline', value)">扫描后自动整理（补哈希 → 补元数据 → 封面缩略图 → 重建索引）</el-checkbox>
        <span class="scan-limit">
          <span class="scan-label">派生资源</span>
          <el-select :model-value="options.derive" size="small" class="scan-derive"
            :disabled="running || starting || options.dryRun || !options.pipeline" data-testid="scan-derive"
            @update:model-value="(value) => setOption('derive', value)">
            <el-option label="不生成（只入库）" value="none" />
            <el-option label="封面 + 图片缩略图（默认，最省时间）" value="thumb" />
            <el-option label="再加精灵图 + 预览片段（全片解码，很慢）" value="full" />
          </el-select>
        </span>
        <span class="scan-hint">dry-run 只预演：不会跑后续任何阶段</span>
      </div>

      <div class="scan-actions">
        <el-button type="primary" icon="Search" :loading="starting" :disabled="running || starting || !rootId"
          v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="scan-start" @click="emit('start')">开始扫描</el-button>
        <el-button v-if="running" type="danger" plain icon="CircleClose" :loading="canceling"
          v-hasPermi="['media:admin:edit']" data-testid="scan-cancel" @click="emit('cancel')">取消</el-button>
        <span v-if="running" class="scan-hint scan-busy" data-testid="scan-busy">任务运行中：同一时刻只允许一个任务，按钮已禁用</span>
        <span v-else-if="!roots.length" class="scan-hint">没有可扫描的库根：本页只列 kind=root（thumbs 产物根不能扫）</span>
      </div>
    </el-card>

    <el-card v-if="job" class="scan-run" shadow="never" :data-job="job.jobId">
      <div class="scan-run-head">
        <el-tag :type="statusTagType(job.status)" size="small" data-testid="scan-status">{{ statusText(job.status) }}</el-tag>
        <span class="scan-run-title">{{ job.rootName || job.rootPath }}</span>
        <span class="scan-run-meta">{{ job.startedAt }}<template v-if="job.finishedAt"> → {{ job.finishedAt }}</template></span>
        <span class="scan-run-meta">日志 {{ job.lineCount }} 行<template v-if="job.warnings">（WARN {{ job.warnings }}）</template></span>
        <el-tag v-if="job.dryRun" type="info" size="small">dry-run</el-tag>
      </div>

      <!-- P5.97 阶段条：每段一个状态 + 耗时，失败/跳过的段可以直接点「重试这一步」 -->
      <ol v-if="job.phases && job.phases.length" class="scan-phases" data-testid="scan-phases">
        <li v-for="phase in job.phases" :key="phase.key" class="scan-phase" :data-phase="phase.key"
          :data-status="phase.status">
          <div class="scan-phase-head">
            <el-tag :type="phaseTagType(phase.status)" size="small" :data-testid="'scan-phase-tag-' + phase.key">
              {{ phaseStatusText(phase.status) }}
            </el-tag>
            <span class="scan-phase-label">{{ phase.label }}</span>
            <span v-if="phase.costMs" class="scan-phase-cost">{{ phaseCostText(phase.costMs) }}</span>
          </div>
          <p v-if="phase.message" class="scan-phase-msg">{{ phase.message }}</p>
          <el-button v-if="canRetryPhase(phase, running)" link type="primary" size="small"
            :loading="retrying === phase.key" :disabled="!!retrying"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" :data-testid="'scan-phase-retry-' + phase.key"
            @click="emit('retry', phase.key)">重试这一步</el-button>
        </li>
      </ol>
      <p v-if="pipelineText" class="scan-pipeline-text" data-testid="scan-pipeline-text">{{ pipelineText }}</p>

      <div class="scan-bar" :data-indeterminate="progress.indeterminate ? '1' : '0'" data-testid="scan-progress">
        <div class="scan-bar-inner" :style="{ width: progress.percent + '%' }"></div>
      </div>

      <div class="scan-counters" data-testid="scan-counters">
        <span class="scan-chip">视频 <b>{{ job.counters.videos }}</b></span>
        <span class="scan-chip">相册 <b>{{ job.counters.albums }}</b></span>
        <span class="scan-chip">图片 <b>{{ job.counters.photos }}</b></span>
        <span class="scan-chip">跳过 <b>{{ job.counters.skipped }}</b></span>
        <span class="scan-chip" :class="{ 'scan-chip-bad': job.counters.errors > 0 }">错误 <b>{{ job.counters.errors }}</b></span>
      </div>

      <p class="scan-command" data-testid="scan-command">{{ job.command }}</p>

      <div class="scan-log-head">
        <span class="scan-log-title">实时日志（最多显示最后 {{ logLimit }} 行，共 {{ job.lineCount }} 行）</span>
        <el-switch :model-value="autoScroll" size="small" active-text="自动滚动"
          @update:model-value="(value) => emit('update:autoScroll', value)" />
      </div>
      <pre ref="logRef" class="scan-log" data-testid="scan-log">{{ logText }}</pre>

      <div v-if="finished" class="scan-result">
        <div class="scan-result-line" data-testid="scan-result-text">
          <b>{{ statusText(job.status) }}</b>：{{ countersText(job.counters) }}
          <span v-if="job.costMs !== null" class="scan-run-meta">（耗时 {{ costText }}）</span>
        </div>
        <div v-if="job.status === 'failed'" class="scan-fail" data-testid="scan-fail">
          <div class="scan-fail-title">任务失败：{{ failSummary(job) }}</div>
          <pre class="scan-fail-log">{{ failText }}</pre>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup name="MediaScanView">
import { computed, nextTick, ref, watch } from 'vue'
import {
  canRetryPhase, countersText, failLines, failSummary, phaseCostText, phaseStatusText, phaseTagType,
  pipelineProgressOf, pipelineSummary, rootOptionDetail, rootOptionLabel, statusTagType, statusText
} from './scanModel'

const props = defineProps({
  roots: { type: Array, default: () => [] },
  rootId: { type: [Number, String], default: null },
  options: {
    type: Object,
    default: () => ({ dryRun: false, withVideo: true, withPhoto: true, limit: 0, force: false, pipeline: true, derive: 'thumb' })
  },
  job: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  starting: { type: Boolean, default: false },
  canceling: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  finished: { type: Boolean, default: false },
  autoScroll: { type: Boolean, default: true },
  notReady: { type: String, default: '' },
  error: { type: String, default: '' },
  notice: { type: String, default: '' },
  /** 正在单步重试的阶段键（空串 = 没有在重试） */
  retrying: { type: String, default: '' },
  /** 日志区最多显示多少行（超出的由容器先切掉，CSS 只负责滚动） */
  logLimit: { type: Number, default: 500 }
})

const emit = defineEmits(['update:rootId', 'update:options', 'update:autoScroll', 'refresh', 'start', 'cancel', 'retry'])

const logRef = ref(null)

const selectedRoot = computed(() => props.roots.find((root) => String(root.id) === String(props.rootId)) || null)
const progress = computed(() => pipelineProgressOf(props.job))
const pipelineText = computed(() => pipelineSummary(props.job))
const logText = computed(() => (props.job && props.job.lines.length ? props.job.lines.join('\n') : '（等子进程第一行输出…）'))
const failText = computed(() => {
  const lines = failLines(props.job)
  return lines.length ? lines.join('\n') : '（没有日志行：子进程可能根本没起来，检查 node / 脚本路径配置）'
})
const costText = computed(() => {
  const ms = props.job && props.job.costMs
  if (!ms && ms !== 0) return '-'
  if (ms < 1000) return ms + 'ms'
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm' + (seconds % 60) + 's'
})

function setOption(key, value) {
  emit('update:options', { ...props.options, [key]: value })
}

/** 日志跟随：只有「用户还开着自动滚动」且贴在底部时才滚（手动往上翻不该被拽回来） */
function scrollToBottom() {
  const el = logRef.value
  if (!el || !props.autoScroll) return
  el.scrollTop = el.scrollHeight
}

watch(() => (props.job ? props.job.lineCount : 0), () => {
  nextTick(scrollToBottom)
})

watch(() => props.autoScroll, (value) => {
  if (value) nextTick(scrollToBottom)
})
</script>

<style scoped>
.scan-page {
  padding-bottom: 8px;
}

.scan-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.scan-toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.scan-title {
  font-size: 18px;
  font-weight: 600;
}

.scan-sub,
.scan-hint,
.scan-run-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.scan-alert {
  margin-bottom: 12px;
}

.scan-form {
  margin-bottom: 14px;
}

.scan-field {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.scan-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.scan-root-select {
  min-width: 320px;
  max-width: 100%;
}

.scan-option-label {
  margin-right: 8px;
}

.scan-option-detail {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.scan-options {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.scan-limit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.scan-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scan-busy {
  color: var(--el-color-warning);
}

.scan-run-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.scan-run-title {
  font-weight: 600;
}

/* 进度条：运行期是不确定进度的滚动条纹（脚本没有逐条 PROGRESS 行），结束即 100% */
.scan-bar {
  position: relative;
  height: 10px;
  border-radius: 5px;
  background: var(--el-fill-color);
  overflow: hidden;
  margin-bottom: 10px;
}

.scan-bar-inner {
  height: 100%;
  border-radius: 5px;
  background: var(--el-color-primary);
  transition: width 0.3s ease;
}

.scan-bar[data-indeterminate='1'] .scan-bar-inner {
  position: absolute;
  width: 40% !important;
  animation: scan-bar-slide 1.4s ease-in-out infinite;
  background: linear-gradient(90deg, var(--el-color-primary-light-5), var(--el-color-primary), var(--el-color-primary-light-5));
}

@keyframes scan-bar-slide {
  0% { left: -40%; }
  100% { left: 100%; }
}

.scan-derive {
  min-width: 240px;
}

/* P5.97 阶段条：一格一段，窄屏自动换行（375 上两列一屏看得完） */
.scan-phases {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}

.scan-phase {
  flex: 1 1 180px;
  min-width: 160px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-left: 3px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}

.scan-phase[data-status='running'] {
  border-left-color: var(--el-color-warning);
}

.scan-phase[data-status='done'] {
  border-left-color: var(--el-color-success);
}

.scan-phase[data-status='failed'] {
  border-left-color: var(--el-color-danger);
}

.scan-phase-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.scan-phase-label {
  font-size: 13px;
  font-weight: 500;
}

.scan-phase-cost {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.scan-phase-msg {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.scan-pipeline-text {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.scan-counters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.scan-chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}

.scan-chip-bad {
  color: var(--el-color-danger);
}

.scan-command {
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
  margin: 0 0 10px;
}

.scan-log-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.scan-log-title {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.scan-log,
.scan-fail-log {
  margin: 0;
  padding: 10px;
  min-height: 180px;
  max-height: 420px;
  overflow: auto;
  white-space: pre;
  font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.scan-result {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.scan-result-line {
  font-size: 13px;
  margin-bottom: 8px;
}

.scan-result-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scan-fail {
  margin-top: 10px;
}

.scan-fail-title {
  font-size: 13px;
  color: var(--el-color-danger);
  margin-bottom: 6px;
}

.scan-fail-log {
  min-height: 80px;
  max-height: 260px;
  color: var(--el-color-danger);
}

/* 375 窄屏：下拉占满一行，日志区收紧并允许横向滚动（长路径不换行才对得上脚本输出） */
@media (max-width: 480px) {
  .scan-root-select {
    min-width: 0;
    width: 100%;
  }

  .scan-options {
    gap: 8px;
  }

  .scan-limit {
    width: 100%;
  }

  .scan-log,
  .scan-fail-log {
    max-height: 300px;
    padding: 8px;
    font-size: 11px;
  }
}
</style>