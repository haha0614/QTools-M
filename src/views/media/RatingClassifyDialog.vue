<template>
  <el-dialog :model-value="modelValue" title="内容自动分级" width="min(1080px, 96vw)" append-to-body destroy-on-close
    class="rc-dialog" @update:model-value="onVisibleChange">
    <p class="rc-lead">
      规则词表在后端 <code>rating-rules.json</code>（管理端按钮与脚本 <code>classify-rating.js</code> 共用同一份，
      判定完全在后端完成）。<strong>默认只预览不写库</strong>；看清楚每档计数与下面 20 条样例，再点「确认执行」。
      默认只把大众级升级成更严的档，已人工设过家长指导 / 限制级的条目不覆盖。
    </p>

    <div class="rc-params">
      <el-radio-group v-model="only" size="small" :disabled="loading || applying" @change="preview">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="video">只看视频</el-radio-button>
        <el-radio-button value="album">只看相册</el-radio-button>
      </el-radio-group>
      <span class="rc-inline">
        <el-switch v-model="useLlm" active-text="本地模型兜底" size="small" :disabled="loading || applying" />
        <span class="rc-note">只对规则一条未命中的条目调用（并发 2、单条 15s，失败保持原值）</span>
      </span>
      <span class="rc-inline">
        每类上限
        <el-input-number v-model="limit" :min="0" :max="5000" :step="50" size="small" controls-position="right"
          :disabled="loading || applying" class="rc-limit" />
        <span class="rc-note">0 = 全量</span>
      </span>
      <el-button size="small" icon="Refresh" :loading="loading" :disabled="applying" @click="preview">重新预览</el-button>
    </div>

    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="rc-alert" />
    <el-alert v-if="appliedText" :title="appliedText" type="success" :closable="false" show-icon class="rc-alert" />

    <div v-if="loading && !report" class="rc-loading">
      <el-icon class="is-loading"><Loading /></el-icon>
      正在跑规则（开了模型兜底时还要等不确定条目逐条判完，可能几分钟）…
    </div>

    <template v-if="report">
      <div class="rc-stats">
        <div class="rc-stat">
          <div class="rc-stat-head">本次审视</div>
          <div class="rc-stat-body">
            视频 {{ report.totals.videos }} · 相册 {{ report.totals.albums }} · 合计 {{ report.totals.items }}
          </div>
          <div class="rc-stat-foot">词表 {{ report.rules.total }} 条（{{ report.rules.source }}）</div>
        </div>
        <div class="rc-stat">
          <div class="rc-stat-head">跑完后的分级分布（预期）</div>
          <div class="rc-stat-body">
            <el-tag type="success" size="small">大众级 {{ report.counts.general }}</el-tag>
            <el-tag type="warning" size="small">家长指导 {{ report.counts.guidance }}</el-tag>
            <el-tag type="danger" size="small">限制级 {{ report.counts.restricted }}</el-tag>
          </div>
          <div class="rc-stat-foot">
            跑之前：{{ report.existing.general }} / {{ report.existing.guidance }} / {{ report.existing.restricted }}
          </div>
        </div>
        <div class="rc-stat">
          <div class="rc-stat-head">判定来源</div>
          <div class="rc-stat-body">
            规则 {{ report.sources.rule }} · 模型 {{ report.sources.llm }} · 保持原值 {{ report.sources.default }}
          </div>
          <div class="rc-stat-foot">耗时 {{ report.elapsedMs }} ms</div>
        </div>
        <div class="rc-stat">
          <div class="rc-stat-head">写库口径</div>
          <div class="rc-stat-body">
            可写 {{ report.applied.eligible }} 条<span v-if="report.applied.updated">（已写 {{ report.applied.updated }}）</span>
          </div>
          <div class="rc-stat-foot">跳过已人工分级 {{ report.applied.protected }} 条</div>
        </div>
      </div>

      <div class="rc-sub">命中词统计（点开规则表可核对词义，见后端 rating-rules.json 的 note）</div>
      <el-table :data="report.hitsTop" size="small" max-height="240" class="rc-table">
        <el-table-column label="命中词" prop="word" width="120" />
        <el-table-column label="档位" width="110" align="center">
          <template #default="scope">
            <el-tag :type="ratingTagType(scope.row.rating)" size="small">{{ ratingLabel(scope.row.rating) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="命中字段" width="120">
          <template #default="scope">{{ (scope.row.fields || []).join(' / ') }}</template>
        </el-table-column>
        <el-table-column label="条目数" prop="count" width="90" align="right" />
        <el-table-column label="规则 id" prop="ruleId" min-width="180" :show-overflow-tooltip="true" />
      </el-table>
      <el-empty v-if="!report.hitsTop.length" description="一条规则都没命中（词表可能没加载？）" :image-size="50" />

      <div class="rc-sub">前 {{ report.samples.length }} 条样例（标题 → 判定 → 理由；*会改库* = 与现状不同）</div>
      <el-table :data="report.samples" size="small" max-height="320" class="rc-table">
        <el-table-column label="类型" width="66" align="center">
          <template #default="scope">{{ scope.row.kind === 'album' ? '相册' : '视频' }}</template>
        </el-table-column>
        <el-table-column label="标题" min-width="240" :show-overflow-tooltip="true">
          <template #default="scope">{{ scope.row.title }}<span class="rc-group"> · {{ scope.row.group || '根目录' }}</span></template>
        </el-table-column>
        <el-table-column label="判定" width="118" align="center">
          <template #default="scope">
            <el-tag :type="ratingTagType(scope.row.rating)" size="small">{{ ratingLabel(scope.row.rating) }}</el-tag>
            <span v-if="scope.row.changed" class="rc-changed">*会改库*</span>
          </template>
        </el-table-column>
        <el-table-column label="理由" min-width="260" :show-overflow-tooltip="true">
          <template #default="scope">{{ scope.row.reason }}</template>
        </el-table-column>
      </el-table>

      <div class="rc-sub">本地模型兜底（只处理规则未命中的不确定条目）</div>
      <div class="rc-llm-line">
        <el-tag size="small" :type="report.llm.enabled ? 'success' : 'info'">{{ report.llm.enabled ? '已开启' : '未开启' }}</el-tag>
        <span class="rc-note">
          模型 {{ report.llm.model }}（{{ report.llm.provider }}）· 不确定 {{ report.llm.candidates }} 条 ·
          判成功 {{ report.llm.judged }} · 失败 {{ report.llm.failed }} · 耗时 {{ report.llm.elapsedMs }} ms
          <template v-if="report.llm.truncated"> · 超出上限未判 {{ report.llm.truncated }} 条</template>
        </span>
      </div>
      <el-alert v-if="report.llm.note" :title="report.llm.note" type="info" :closable="false" show-icon class="rc-alert" />
      <el-table v-if="report.llm.samples.length" :data="report.llm.samples" size="small" max-height="240" class="rc-table">
        <el-table-column label="标题" min-width="240" :show-overflow-tooltip="true">
          <template #default="scope">{{ scope.row.title }}<span class="rc-group"> · {{ scope.row.group || '根目录' }}</span></template>
        </el-table-column>
        <el-table-column label="模型判定" width="110" align="center">
          <template #default="scope">
            <el-tag :type="ratingTagType(scope.row.rating)" size="small">{{ ratingLabel(scope.row.rating) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="模型原话" prop="raw" min-width="150" :show-overflow-tooltip="true" />
        <el-table-column label="耗时" width="90" align="right">
          <template #default="scope">{{ scope.row.ms }} ms</template>
        </el-table-column>
      </el-table>
      <el-table v-if="report.llm.failedSamples.length" :data="report.llm.failedSamples" size="small" max-height="180" class="rc-table">
        <el-table-column label="兜底失败（保持原值）" min-width="240" :show-overflow-tooltip="true">
          <template #default="scope">{{ scope.row.title }}</template>
        </el-table-column>
        <el-table-column label="原因" prop="raw" min-width="220" :show-overflow-tooltip="true" />
      </el-table>
    </template>

    <template #footer>
      <el-button @click="onVisibleChange(false)">关 闭</el-button>
      <el-button type="primary" :loading="applying" :disabled="loading || applying || plannedCount <= 0"
        v-hasPermi="['media:admin:edit']" @click="apply">
        确认执行（写库 {{ plannedCount }} 条）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup name="RatingClassifyDialog">
import { ref, watch, computed, getCurrentInstance } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { classifyRating } from '@/api/media'
import { ratingLabel, ratingTagType } from './ratingOptions'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'applied'])

const { proxy } = getCurrentInstance()

/* 预览参数：只在点「重新预览 / 确认执行」时提交，改选项不立刻打接口（避免每点一下都跑一轮模型） */
const only = ref('all')
const useLlm = ref(true)
const limit = ref(0)

const loading = ref(false)
const applying = ref(false)
const error = ref('')
const report = ref(null)
const appliedText = ref('')

const plannedCount = computed(() => {
  const applied = report.value && report.value.applied
  return applied && applied.eligible ? applied.eligible : 0
})

function onVisibleChange(visible) {
  emit('update:modelValue', visible)
  if (visible) {
    // 每次打开都重新预览：分级分布会随扫描 / 人工调整变化，拿旧报告去执行是最容易出错的做法
    appliedText.value = ''
    preview()
  }
}

function payloadOf(dryRun) {
  const body = { dryRun: dryRun, only: only.value, useLlm: useLlm.value }
  const cap = Number(limit.value) || 0
  if (cap > 0) body.limit = cap
  return body
}

function preview() {
  loading.value = true
  error.value = ''
  appliedText.value = ''
  classifyRating(payloadOf(true)).then((res) => {
    report.value = normalize(res)
  }).catch((e) => {
    error.value = '预览失败：' + (e && e.message ? e.message : e)
  }).finally(() => {
    loading.value = false
  })
}

function apply() {
  const count = plannedCount.value
  proxy.$modal.confirm(
    '确认把自动判定的结果写进库？本次预计写入 ' + count + ' 条（默认不覆盖已人工设过家长指导 / 限制级的条目）。',
    '自动分级写库'
  ).then(() => {
    applying.value = true
    error.value = ''
    return classifyRating(payloadOf(false)).then((res) => {
      report.value = normalize(res)
      const applied = report.value.applied || {}
      appliedText.value = '已写库：视频 ' + applied.videos + ' 条、相册 ' + applied.albums + ' 条（本次可写 ' + applied.eligible +
        ' 条，跳过人工分级 ' + applied.protected + ' 条）。站点索引缓存已失效，刷新列表即可看到新分级。'
      proxy.$modal.msgSuccess('自动分级完成：写入 ' + applied.updated + ' 条')
      emit('applied', report.value)
    })
  }).catch(() => {
    /* 用户取消 / 接口报错已在 catch 分支处理 */
  }).finally(() => {
    applying.value = false
  })
}

/** 兼容两种返回形态：裸报告，或 AjaxResult{code,msg,data} */
function normalize(res) {
  if (res && res.data && res.data.totals) {
    return res.data
  }
  return res || {}
}

watch(() => props.modelValue, (visible) => {
  if (visible) {
    onVisibleChange(true)
  }
})
</script>

<style scoped>
.rc-lead {
  margin: 0 0 10px;
  color: #606266;
  font-size: 13px;
  line-height: 1.7;
}
.rc-params {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.rc-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #606266;
}
.rc-limit {
  width: 110px;
}
.rc-note {
  color: #909399;
  font-size: 12px;
}
.rc-alert {
  margin-bottom: 10px;
}
.rc-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  color: #909399;
}
.rc-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin-bottom: 6px;
}
.rc-stat {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 10px;
}
.rc-stat-head {
  font-size: 12px;
  color: #909399;
}
.rc-stat-body {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 4px 0;
}
.rc-stat-foot {
  font-size: 12px;
  color: #909399;
}
.rc-sub {
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}
.rc-table {
  margin-bottom: 4px;
}
.rc-group {
  color: #a8abb2;
}
.rc-changed {
  margin-left: 4px;
  font-size: 12px;
  color: #e6a23c;
}
.rc-llm-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
</style>
