<template>
  <div class="dr-body">
    <div class="dr-summary" :data-total="summaryTotal" :data-ok="summary.ok" :data-skip="summary.skip" :data-fail="summary.fail">
      <span class="dr-summary-text">{{ summaryLine }}</span>
      <el-tag type="success" size="small">成功 {{ summary.ok }}</el-tag>
      <el-tag type="info" size="small">跳过 {{ summary.skip }}</el-tag>
      <el-tag type="danger" size="small">失败 {{ summary.fail }}</el-tag>
    </div>

    <el-alert v-if="model.degraded" type="info" :closable="false" show-icon class="dr-alert"
      title="后端只给了汇总（日志里没有 ITEM 明细行）：下面退化为「已处理的 videoId 列表」，标题会用列表 / 派生资源接口补齐。" />

    <el-table v-if="rows.length" :data="rows" size="small" max-height="380" class="dr-table">
      <el-table-column label="视频标题" min-width="240" :show-overflow-tooltip="true">
        <template #default="scope">{{ titleOf(scope.row) }}</template>
      </el-table-column>
      <el-table-column label="任务类型" width="130" align="center">
        <template #default="scope">{{ scope.row.taskLabel || '—' }}</template>
      </el-table-column>
      <el-table-column label="结果" width="100" align="center">
        <template #default="scope">
          <el-tag :type="resultTagType(scope.row.result)" size="small">{{ scope.row.resultLabel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="输出文件" min-width="220" :show-overflow-tooltip="true">
        <template #default="scope">
          <span v-if="scope.row.out">{{ scope.row.out }}</span>
          <span v-else class="dr-muted">—</span>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else description="本次任务没有可展示的条目（日志里既没有 ITEM 行也没有 RESULT 汇总）" :image-size="60" />

    <p class="dr-hint">
      「输出文件」优先用日志里的 <code>out=</code> / <code>file=</code> 原文；没有则是按 id 的约定路径
      （P4 起真实文件名按 <code>content_hash</code> 落盘，封面可能叫 <code>thumbs/v/&lt;hash&gt;.jpg</code>）。
    </p>

    <div class="dr-actions">
      <el-button @click="emit('close')">关 闭</el-button>
      <el-button type="primary" :loading="refreshing" @click="emit('refresh')">刷新列表派生资源列</el-button>
    </div>
  </div>
</template>

<script setup name="DeriveResultBody">
import { computed } from 'vue'
import { summaryText } from './deriveModel'

/* 「本次生成了哪些」的正文（P5.10-B 交付 3）：summary + 明细表 + 两个按钮。
   单独成组件是为了能被 SSR / 单测直接渲染（el-dialog 首次挂载时并不渲染内容，套在对话框里测不到）。 */
const props = defineProps({
  /** buildResultModel 的返回值：{ rows, summary:{ok,skip,fail}, total, degraded, hasItems, empty } */
  model: { type: Object, default: () => ({ rows: [], summary: { ok: 0, skip: 0, fail: 0 }, total: 0, degraded: false }) },
  /** 「刷新列表派生资源列」按钮的 loading */
  refreshing: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'refresh'])

const rows = computed(() => (props.model && Array.isArray(props.model.rows) ? props.model.rows : []))
const summary = computed(() => {
  const data = (props.model && props.model.summary) || {}
  return { ok: Number(data.ok) || 0, skip: Number(data.skip) || 0, fail: Number(data.fail) || 0 }
})
const summaryTotal = computed(() => summary.value.ok + summary.value.skip + summary.value.fail)
const summaryLine = computed(() => {
  if (props.model && props.model.degraded && !summaryTotal.value) {
    return '后端未给结果汇总：下面是本次请求的 videoId 清单'
  }
  return summaryText(summary.value)
})

function titleOf(row) {
  if (!row) return '—'
  return row.title || ('#' + row.videoId)
}

function resultTagType(result) {
  if (result === 'ok') return 'success'
  if (result === 'skip') return 'info'
  if (result === 'fail') return 'danger'
  return 'primary'
}
</script>

<style scoped>
.dr-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.dr-summary-text {
  font-weight: 600;
}
.dr-alert {
  margin-bottom: 10px;
}
.dr-table {
  width: 100%;
}
.dr-muted {
  color: var(--el-text-color-disabled);
}
.dr-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
}
.dr-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
