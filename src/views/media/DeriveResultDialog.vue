<template>
  <el-dialog :model-value="modelValue" title="本次生成结果" width="min(880px, 96vw)" append-to-body class="derive-result-dialog"
    @update:model-value="val => emit('update:modelValue', val)">
    <derive-result-body :model="model" :refreshing="refreshing"
      @close="emit('update:modelValue', false)" @refresh="emit('refresh')" />
  </el-dialog>
</template>

<script setup name="DeriveResultDialog">
import DeriveResultBody from './DeriveResultBody.vue'

/* 生成任务完成后的「本次生成了哪些」清单（P5.10-B 交付 3）：
   本组件只是 el-dialog 外壳（标题 / 宽度 / append-to-body），正文与按钮在 DeriveResultBody（可 SSR / 单测）。 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** buildResultModel 的返回值 */
  model: { type: Object, default: () => ({ rows: [], summary: { ok: 0, skip: 0, fail: 0 }, total: 0, degraded: false }) },
  /** 「刷新列表派生资源列」按钮的 loading */
  refreshing: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'refresh'])
</script>
