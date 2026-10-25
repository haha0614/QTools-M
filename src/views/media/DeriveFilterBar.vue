<template>
  <!-- P5.12：派生资源筛选条（汇总文案随「资源类型」变化 + 资源类型/状态两个下拉）
       语义：只过滤「当前页」的前端显示，不动请求参数与分页总数；状态=全部 即不过滤。 -->
  <div class="derive-bar" data-testid="derive-bar">
    <span class="derive-bar-text" data-testid="derive-summary">{{ summaryText }}</span>
    <el-select :model-value="normalized.kind" size="small" class="derive-filter-kind" data-testid="derive-filter-kind"
      :disabled="!ready" placeholder="资源类型" title="资源类型：全部 / 封面 / 精灵图 / 预览片段" @update:model-value="patchKind">
      <el-option v-for="opt in kinds" :key="opt.value" :label="opt.label" :value="opt.value" />
    </el-select>
    <el-select :model-value="normalized.state" size="small" class="derive-filter-state" data-testid="derive-filter-state"
      :disabled="!ready" placeholder="状态" title="状态：全部 / 新算法 / 旧算法 / 过期 / 缺失" @update:model-value="patchState">
      <el-option v-for="opt in states" :key="opt.value" :label="opt.label" :value="opt.value" />
    </el-select>
    <el-button v-if="active" link type="primary" size="small" data-testid="derive-filter-clear" @click="resetFilter">清空筛选</el-button>
    <!-- thumb / sprite 没有 oldAlgo 态：先说明原因，而不是给一片空白 -->
    <span v-if="unsupported" class="derive-bar-warn" data-testid="derive-no-oldalgo">该资源类型没有『旧算法』态</span>
    <!-- 旧后端（200 但 rows 里没有 status 字段）：只有 正常/缺失/过期 三态，说清楚而不是假装能筛旧算法 -->
    <span v-if="legacy && ready" class="derive-bar-note" data-testid="derive-legacy">接口未返回 status：仅「正常 / 缺失 / 过期」可筛</span>
    <span v-if="algoSince" class="derive-bar-note" :title="algoSinceSource || ''">算法更新于 {{ algoSince }}</span>
    <el-button link type="primary" icon="Refresh" :loading="loading" data-testid="derive-refresh"
      @click="$emit('refresh')">刷新派生资源</el-button>
  </div>
</template>

<script setup name="DeriveFilterBar">
import { computed } from 'vue'
import {
  DERIVE_FILTER_KINDS, DERIVE_FILTER_STATES, DERIVE_FILTER_DEFAULT,
  deriveSummaryText, isFilterActive, isFilterUnsupported, normalizeFilter
} from './deriveModel'

/* 媒体库「视频」页顶部筛选条（P5.12）：
   汇总文案 + 资源类型（全部/封面/精灵图/预览片段）+ 状态（全部/新算法/旧算法/过期/缺失）。
   过滤与文案全在 deriveModel 的纯函数里（可单测 / SSR），本组件只负责把结果画出来。 */
const props = defineProps({
  /** 接口是否就绪；false（404/405/501）时两个下拉禁用并提示未就绪，列表其它功能不受影响 */
  ready: { type: Boolean, default: true },
  /** 当前页的 derive-status 行（已 normalizeDeriveRow 过） */
  rows: { type: Array, default: () => [] },
  /** { kind, state }：kind ∈ 全部/封面/精灵图/预览片段，state ∈ 全部/新算法/旧算法/过期/缺失 */
  filter: { type: Object, default: () => ({ ...DERIVE_FILTER_DEFAULT }) },
  /** derive-status 顶层的 algoSince：小字「算法更新于 …」 */
  algoSince: { type: [String, Number], default: '' },
  algoSinceSource: { type: [String, Number], default: '' },
  /** 刷新中的 loading（只用于按钮，不影响选项） */
  loading: { type: Boolean, default: false },
  /** 旧后端：接口 200 但每个产物的 status 字段都没有（只有 exists/stale 两态） */
  legacy: { type: Boolean, default: false }
})

const emit = defineEmits(['update:filter', 'refresh'])

const kinds = DERIVE_FILTER_KINDS
const states = DERIVE_FILTER_STATES

const normalized = computed(() => normalizeFilter(props.filter))
const active = computed(() => isFilterActive(normalized.value))
const unsupported = computed(() => isFilterUnsupported(normalized.value))

/** 汇总文案随「资源类型」变化；接口未就绪时给一句降级说明（该列显示「—」） */
const summaryText = computed(() => (props.ready
  ? deriveSummaryText(props.rows, normalized.value.kind)
  : '派生资源接口未就绪：派生资源列显示「—」'))

function patch(next) {
  const merged = normalizeFilter({ kind: normalized.value.kind, state: normalized.value.state })
  emit('update:filter', normalizeFilter(Object.assign(merged, next || {})))
}

function patchKind(value) {
  patch({ kind: value })
}

function patchState(value) {
  patch({ state: value })
}

/** 清空筛选：回到默认（预览片段 / 全部），已勾选的行由页面自己保留 */
function resetFilter() {
  emit('update:filter', { kind: DERIVE_FILTER_DEFAULT.kind, state: DERIVE_FILTER_DEFAULT.state })
}
</script>

<style scoped>
.derive-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}
.derive-bar-text {
  color: var(--el-text-color-regular);
}
.derive-bar-note {
  color: var(--el-text-color-secondary);
}
.derive-filter-kind {
  width: 108px;
}
.derive-filter-state {
  width: 104px;
}
/* 选了「旧算法」但该资源类型没有这个态：用 warning 色说明，而不是静默 0 行 */
.derive-bar-warn {
  color: var(--el-color-warning);
}
/* 窄屏：两个下拉各占一行，不挤爆汇总文案 */
@media (max-width: 640px) {
  .derive-filter-kind,
  .derive-filter-state {
    flex: 1 1 120px;
    width: auto;
  }
}
</style>
