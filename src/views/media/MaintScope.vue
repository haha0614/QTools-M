<template>
  <span class="maint-scope" :data-selected-count="safeSelectedCount" :data-filter-count="safeFilterCount">
    <span class="maint-scope-label">范围</span>
    <el-select :model-value="modelValue" size="small" class="maint-scope-select" :disabled="disabled"
      :data-testid="'maint-scope-' + testid" @update:model-value="$emit('update:modelValue', $event)">
      <el-option label="全部" value="all" />
      <el-option v-if="supported" :label="'当前筛选结果（' + safeFilterCount + '）'" value="filter" :disabled="!canFilter" />
      <el-option v-if="supported" :label="'选中项（' + safeSelectedCount + '）'" value="selected" :disabled="!canSelected" />
    </el-select>
    <span class="maint-scope-hint" :data-testid="'maint-scope-hint-' + testid">{{ hintText }}</span>
  </span>
</template>

<script setup name="MaintScope">
/**
 * 维护抽屉里的「范围」下拉（P6.04）
 *
 * 只有后端真支持按 ids 处理的功能才给三个选项（缩略图 / 精灵图 / 预览片段 → videoIds）；
 * 其它功能传 supported=false，只显示「全部」，并用一行小字说明「后端只支持整库」——
 * 不假装支持范围。
 */
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: 'all' },
  /** 后端是否支持按 ids / 筛选处理（false 时只有「全部」） */
  supported: { type: Boolean, default: false },
  /** 当前视频页是否真的设置了筛选条件 */
  filterActive: { type: Boolean, default: false },
  /** 当前筛选结果条数（用于下拉文案与禁用判断） */
  filterCount: { type: Number, default: 0 },
  /** 当前勾选的视频条数 */
  selectedCount: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  /** data-testid 后缀：maint-scope-<testid> */
  testid: { type: String, default: '' },
  /** 外部附加说明（例如 GC 只支持整库的原因） */
  note: { type: String, default: '' }
})

defineEmits(['update:modelValue'])

const safeFilterCount = computed(() => Math.max(0, Number(props.filterCount) || 0))
const safeSelectedCount = computed(() => Math.max(0, Number(props.selectedCount) || 0))
const canFilter = computed(() => props.filterActive && safeFilterCount.value > 0)
const canSelected = computed(() => safeSelectedCount.value > 0)

const hintText = computed(() => {
  if (!props.supported) {
    return props.note || '后端只支持整库'
  }
  if (props.modelValue === 'filter' && !canFilter.value) {
    return props.filterActive ? '当前筛选结果为空' : '先在视频页设置筛选条件'
  }
  if (props.modelValue === 'selected' && !canSelected.value) {
    return '先在视频列表勾选要处理的行'
  }
  if (!canFilter.value && !canSelected.value) {
    return '当前筛选为空、也未勾选：暂时只能用「全部」'
  }
  if (!canFilter.value) {
    return '当前筛选为空：「当前筛选结果」不可用'
  }
  if (!canSelected.value) {
    return '当前未勾选：「选中项」不可用'
  }
  return props.note || ''
})
</script>

<style scoped>
.maint-scope {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.maint-scope-label {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
.maint-scope-select {
  width: 168px;
}
.maint-scope-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
