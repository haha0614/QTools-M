<template>
  <el-dialog :model-value="modelValue" title="标签规范化（标签原子化重建）" width="min(1120px, 96vw)"
    append-to-body destroy-on-close class="tn-dialog" @update:model-value="onVisibleChange">
    <p class="tn-lead">
      规则全在 <code>doc/media-import/tag-map.json</code>（映射 + facet 归属 + 保留白名单），执行的是同一个脚本
      <code>normalize-tags.js</code>。<strong>默认只预览不写库</strong>；确认后<strong>执行前会自动备份</strong>
      <code>media_tag</code> / <code>media_video_tag</code> 到 <code>doc/backup/tags_before_&lt;时间戳&gt;.sql</code>，
      再单事务写库（连跑两遍第二遍 0 变更）。
    </p>

    <div class="tn-params">
      <el-switch v-model="onlyChanged" active-text="只看要改的标签" size="small" :disabled="loading || applying" />
      <el-button size="small" icon="Refresh" :loading="loading" :disabled="applying" @click="preview">重新预览</el-button>
      <span class="tn-note">映射表：{{ (report.map && report.map.file) || '-' }}</span>
    </div>

    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="tn-alert" />
    <el-alert v-if="appliedText" :title="appliedText" type="success" :closable="false" show-icon class="tn-alert" />

    <div v-if="loading && !report" class="tn-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      正在跑 dry-run（读全量标签行 + 算目标态，几百行的量级，通常 1~2 秒）…
    </div>

    <template v-if="report">
      <div class="tn-stats">
        <div class="tn-stat">
          <div class="tn-stat-head">现状 → 迁移后</div>
          <div class="tn-stat-body">
            标签 {{ num(before.tags) }} → <strong>{{ num(afterTags) }}</strong> ·
            标签行 {{ num(before.videoTagRows) }} → <strong>{{ num(afterRows) }}</strong> ·
            facet {{ num(before.facets) }} → <strong>{{ num(afterFacets) }}</strong>
          </div>
          <div class="tn-stat-foot">distinct 标签名 {{ num(before.distinctNames) }} · 视频 {{ num(before.videos) }}</div>
        </div>
        <div class="tn-stat">
          <div class="tn-stat-head">本次影响面</div>
          <div class="tn-stat-body">
            重建 {{ num(changes.changedVideos) }} 个视频的标签行 · 删 {{ num(changes.deleteRows) }} 行 · 插 {{ num(changes.insertRows) }} 行
          </div>
          <div class="tn-stat-foot">
            新建标签 {{ (changes.createdTags || []).length }} 个<span v-if="(changes.createdTags || []).length">：{{ changes.createdTags.join(' ') }}</span>
          </div>
        </div>
        <div class="tn-stat">
          <div class="tn-stat-head">处置统计</div>
          <div class="tn-stat-body">
            <el-tag size="small" type="info">保留 {{ counts.keep }}</el-tag>
            <el-tag size="small" type="warning">合并 {{ counts.merge }}</el-tag>
            <el-tag size="small" type="success">拆分 {{ counts.split }}</el-tag>
            <el-tag size="small" type="danger">删除 {{ counts.drop }}</el-tag>
          </div>
          <div class="tn-stat-foot">白名单保留（use_count=0 也不删）：{{ (report.map && (report.map.keep || []).join(' ')) || '无' }}</div>
        </div>
        <div class="tn-stat">
          <div class="tn-stat-head">备份</div>
          <div class="tn-stat-body">
            <span v-if="backup">{{ backup.file }}</span>
            <span v-else class="tn-note">点「确认执行」时自动备份，预览不备份</span>
          </div>
          <div class="tn-stat-foot">{{ backup ? bytesText(backup.bytes) + ' · ' + (backup.tables || []).join(' ') : '目标：doc/backup/tags_before_<时间戳>.sql' }}</div>
        </div>
      </div>

      <div class="tn-sub">每个旧标签的处置（{{ rows.length }} 条{{ onlyChanged ? '，已过滤掉「保留」' : '' }}）</div>
      <el-table :data="rows" size="small" max-height="300" class="tn-table">
        <el-table-column label="旧标签" min-width="130" :show-overflow-tooltip="true">
          <template #default="scope">{{ scope.row.name }}</template>
        </el-table-column>
        <el-table-column label="处置" width="80" align="center">
          <template #default="scope">
            <el-tag :type="dispositionType(scope.row.disposition)" size="small">{{ dispositionText(scope.row.disposition) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="映射到" min-width="170" :show-overflow-tooltip="true">
          <template #default="scope">{{ (scope.row.to || []).join(' + ') || '-' }}</template>
        </el-table-column>
        <el-table-column label="视频数" prop="videos" width="80" align="right" />
        <el-table-column label="行数" prop="rows" width="70" align="right" />
        <el-table-column label="facet 前 → 后" min-width="150" :show-overflow-tooltip="true">
          <template #default="scope">
            {{ (scope.row.fromFacets || []).join(',') || '-' }} → {{ (scope.row.toFacets || []).join(',') || '-' }}
          </template>
        </el-table-column>
      </el-table>

      <div class="tn-sub">迁移后的原子标签集合（{{ atomTotal }} 个，按 facet 分组 · 一个标签 = 一种含义）</div>
      <div class="tn-facets">
        <div v-for="(names, facet) in (report.facetGroups || {})" :key="facet" class="tn-facet-row">
          <span class="tn-facet-name">{{ facet }}</span>
          <span class="tn-facet-count">{{ names.length }}</span>
          <span class="tn-facet-names">
            <el-tag v-for="n in names" :key="n" size="small" class="tn-facet-tag">{{ n }}</el-tag>
          </span>
        </div>
      </div>

      <el-collapse class="tn-collapse">
        <el-collapse-item title="脚本输出（尾部 40 行，排错用）" name="stdout">
          <pre class="tn-pre">{{ tailStdout }}</pre>
        </el-collapse-item>
      </el-collapse>
    </template>

    <template #footer>
      <span class="tn-foot-note">执行前会自动备份；写库后站点索引快照立即失效</span>
      <el-button size="small" :disabled="loading || applying" @click="onVisibleChange(false)">关闭</el-button>
      <el-button size="small" type="danger" :loading="applying" :disabled="loading || applying || !canApply"
        @click="apply">确认执行</el-button>
    </template>
  </el-dialog>
</template>

<script setup name="TagNormalizeDialog">
import { ref, computed, getCurrentInstance, watch } from 'vue'
import { normalizeTags } from '@/api/media'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'applied'])

const { proxy } = getCurrentInstance()

const loading = ref(false)
const applying = ref(false)
const error = ref('')
const appliedText = ref('')
const report = ref(null)
const onlyChanged = ref(false)

const before = computed(() => (report.value && report.value.before) || {})
const changes = computed(() => (report.value && report.value.changes) || {})
const backup = computed(() => (report.value && report.value.backup) || null)
const after = computed(() => (report.value && report.value.after) || null)

const afterTags = computed(() => {
  if (after.value) return after.value.tags
  return (report.value && report.value.atomSet || []).length
})
const afterRows = computed(() => {
  if (after.value) return after.value.videoTagRows
  const c = changes.value
  return (Number(before.value.videoTagRows) || 0) - (Number(c.deleteRows) || 0) + (Number(c.insertRows) || 0)
})
const afterFacets = computed(() => {
  if (after.value) return after.value.facets
  return Object.keys((report.value && report.value.facetGroups) || {}).length
})
const atomTotal = computed(() => ((report.value && report.value.atomSet) || []).length)

const counts = computed(() => {
  const out = { keep: 0, merge: 0, split: 0, drop: 0, done: 0 }
  ;((report.value && report.value.oldTags) || []).forEach(item => {
    if (out[item.disposition] != null) out[item.disposition] += 1
  })
  return out
})

const rows = computed(() => {
  const list = (report.value && report.value.oldTags) || []
  if (!onlyChanged.value) return list
  return list.filter(item => item.disposition !== 'keep' && item.disposition !== 'done')
})

const canApply = computed(() => Boolean(report.value) && Number(changes.value.changedVideos) > 0)

const tailStdout = computed(() => {
  const text = (report.value && report.value.stdout) || ''
  const lines = text.split('\n')
  return lines.slice(Math.max(0, lines.length - 40)).join('\n')
})

function num(v) {
  return v == null ? '-' : v
}

function bytesText(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(1) + ' KB'
  return n + ' B'
}

function dispositionText(d) {
  if (d === 'keep') return '保留'
  if (d === 'merge') return '合并'
  if (d === 'split') return '拆分'
  if (d === 'drop') return '删除'
  return '已完成'
}

function dispositionType(d) {
  if (d === 'merge') return 'warning'
  if (d === 'split') return 'success'
  if (d === 'drop') return 'danger'
  if (d === 'done') return 'info'
  return 'info'
}

function onVisibleChange(visible) {
  emit('update:modelValue', visible)
  if (visible) {
    appliedText.value = ''
    preview()
  }
}

/** 兼容两种返回形态：裸统计，或 AjaxResult{code,msg,data} */
function normalize(res) {
  if (res && res.data && (res.data.before || res.data.oldTags)) {
    return res.data
  }
  return res || {}
}

function preview() {
  loading.value = true
  error.value = ''
  appliedText.value = ''
  normalizeTags(true).then((res) => {
    report.value = normalize(res)
  }).catch((e) => {
    report.value = null
    error.value = '预览失败：' + (e && e.message ? e.message : e)
  }).finally(() => {
    loading.value = false
  })
}

function apply() {
  const c = changes.value
  proxy.$modal.confirm(
    '确认执行标签规范化？将重建 ' + num(c.changedVideos) + ' 个视频的标签行（删 ' + num(c.deleteRows) +
    ' 行 / 插 ' + num(c.insertRows) + ' 行），并删除无引用的旧标签。执行前会自动备份三张标签表。',
    '标签规范化写库'
  ).then(() => {
    applying.value = true
    error.value = ''
    return normalizeTags(false).then((res) => {
      const data = normalize(res)
      report.value = data
      const a = data.after || {}
      const removed = (a.deletedTags || []).length
      appliedText.value = '已写库：标签 ' + num(data.before && data.before.tags) + ' → ' + num(a.tags) +
        '，标签行 ' + num(data.before && data.before.videoTagRows) + ' → ' + num(a.videoTagRows) +
        '，删除旧标签 ' + removed + ' 个。备份：' + ((data.backup && data.backup.file) || '(本次无变更，未备份)') +
        '。站点索引已失效，刷新视频库即可看到原子标签。'
      proxy.$modal.msgSuccess('标签规范化完成')
      emit('applied', data)
    })
  }).catch(() => {
    /* 用户取消，或错误已由上方 error 展示 */
  }).finally(() => {
    applying.value = false
  })
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    onVisibleChange(true)
  }
})
</script>

<style scoped>
.tn-lead {
  margin: 0 0 10px;
  color: #606266;
  font-size: 13px;
  line-height: 1.7;
}
.tn-params {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.tn-note {
  color: #909399;
  font-size: 12px;
}
.tn-alert {
  margin-bottom: 10px;
}
.tn-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
  font-size: 13px;
  padding: 24px 0;
}
.tn-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.tn-stat {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 10px;
}
.tn-stat-head {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}
.tn-stat-body {
  font-size: 13px;
  color: #303133;
  line-height: 1.7;
}
.tn-stat-foot {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  word-break: break-all;
}
.tn-sub {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin: 12px 0 6px;
}
.tn-table {
  margin-bottom: 4px;
}
.tn-facets {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 6px 10px;
}
.tn-facet-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed #f2f6fc;
}
.tn-facet-row:last-child {
  border-bottom: none;
}
.tn-facet-name {
  width: 56px;
  flex: 0 0 56px;
  font-size: 12.5px;
  font-weight: 600;
  color: #606266;
}
.tn-facet-count {
  width: 34px;
  flex: 0 0 34px;
  font-size: 12px;
  color: #909399;
}
.tn-facet-names {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tn-facet-tag {
  margin: 0;
}
.tn-collapse {
  margin-top: 10px;
}
.tn-pre {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.6;
  color: #606266;
  background: #fafafa;
  padding: 8px;
  border-radius: 4px;
}
.tn-foot-note {
  float: left;
  color: #909399;
  font-size: 12px;
  line-height: 32px;
}
</style>
