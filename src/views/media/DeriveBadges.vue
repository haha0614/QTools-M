<template>
  <span v-if="!ready" class="derive-cell">
    <el-tooltip content="派生资源接口未就绪：该列暂时不可用，其它功能不受影响" placement="top">
      <span class="derive-cell-na">—</span>
    </el-tooltip>
  </span>
  <span v-else-if="!badges.length" class="derive-cell">
    <el-tooltip content="派生资源接口没有返回这一行：状态未知（可点「刷新」重试）" placement="top">
      <span class="derive-cell-na">—</span>
    </el-tooltip>
  </span>
  <span v-else class="derive-cell" :class="{ 'derive-cell-loading': loading }">
    <el-tooltip v-for="badge in badges" :key="badge.key" :content="badge.title" placement="top">
      <span class="derive-badge" :class="'derive-badge-' + badge.state" :data-derive="badge.key" :data-state="badge.state"
        :title="badge.title">
        <span class="derive-dot"></span><span class="derive-abbr">{{ badge.abbr }}</span>
      </span>
    </el-tooltip>
  </span>
</template>

<script setup name="DeriveBadges">
import { computed } from 'vue'
import { deriveBadgesOf } from './deriveModel'

/* 媒体库「视频」列表的「派生资源」单元格（P5.10-B）：
   一格里三个小徽标（封面 / 精灵图 / 预览），三态配色：绿=正常 / 橙=过期或旧算法 / 灰=缺失。
   状态判定与文案全在 deriveModel.deriveBadgesOf（纯函数，可单测 / SSR）。 */
const props = defineProps({
  /** derive-status 的一行（已 normalizeDeriveRow 过）；缺失 = 状态未知（灰） */
  row: { type: Object, default: null },
  /** 接口是否就绪；false 时整列显示「—」（404 降级，不阻塞列表） */
  ready: { type: Boolean, default: true },
  /** 首次加载中，仅用于轻微置灰，不改变三态语义 */
  loading: { type: Boolean, default: false },
  /** derive-status 顶层的 algoSince：只用于「旧算法产物」徽标的 tooltip */
  algoSince: { type: [String, Number], default: '' }
})

const badges = computed(() => (props.row ? deriveBadgesOf(props.row, { algoSince: props.algoSince }) : []))
</script>

<style scoped>
.derive-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.derive-cell-loading {
  opacity: 0.55;
}
.derive-cell-na {
  color: var(--el-text-color-disabled);
}
.derive-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 3px;
  border: 1px solid transparent;
  color: var(--el-text-color-secondary);
  cursor: default;
}
.derive-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid var(--el-border-color);
  background: transparent;
  display: inline-block;
}
/* 绿：正常（实心） */
.derive-badge-ok {
  color: var(--el-color-success);
  border-color: var(--el-color-success-light-7);
  background: var(--el-color-success-light-9);
}
.derive-badge-ok .derive-dot {
  border-color: var(--el-color-success);
  background: var(--el-color-success);
}
/* 橙：存在但过期（实心） */
.derive-badge-stale {
  color: var(--el-color-warning);
  border-color: var(--el-color-warning-light-7);
  background: var(--el-color-warning-light-9);
}
.derive-badge-stale .derive-dot {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning);
}
/* 橙：旧算法产物（半实心：深描边 + 浅填充，与「过期」区分） */
.derive-badge-oldAlgo {
  color: var(--el-color-warning-dark-2);
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-8);
}
.derive-badge-oldAlgo .derive-dot {
  border: 2px solid var(--el-color-warning);
  background: var(--el-color-warning-light-5);
}
/* 灰：不存在（空心） */
.derive-badge-missing {
  color: var(--el-text-color-disabled);
  border-color: var(--el-border-color-lighter);
}
.derive-badge-missing .derive-dot {
  border-color: var(--el-text-color-disabled);
  background: transparent;
}
/* 灰：状态未知（行没返回 / 接口降级） */
.derive-badge-unknown {
  color: var(--el-text-color-disabled);
}
.derive-badge-unknown .derive-dot {
  border-color: var(--el-border-color);
  background: transparent;
}
</style>
