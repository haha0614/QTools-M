<template>
  <!-- P5.12：筛选结果为空时的友好空态（表格 #empty 槽用它；不过滤时仍是「暂无数据」） -->
  <div class="derive-empty" data-testid="derive-empty">{{ text }}</div>
</template>

<script setup name="DeriveEmptyState">
import { computed } from 'vue'
import { deriveEmptyText, isFilterActive } from './deriveModel'

/* 空态文案：过滤生效 + 当前页本来有行 → 说明「没有符合『类型 · 状态』的行」；
   其中「旧算法 + 封面/精灵图」这种必然为空的选择，直接说明该类型没有这个态。 */
const props = defineProps({
  /** 当前筛选 { kind, state } */
  filter: { type: Object, default: () => ({ kind: 'preview', state: 'all' }) },
  /** 当前页（未过滤时）本来有多少行；0 表示列表本身就是空的，不归咎于筛选 */
  hasRows: { type: Number, default: 0 }
})

const active = computed(() => isFilterActive(props.filter))
const text = computed(() => (active.value && Number(props.hasRows) > 0
  ? deriveEmptyText(props.filter)
  : '暂无数据'))
</script>

<style scoped>
.derive-empty {
  padding: 10px 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
