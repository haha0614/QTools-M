<template>
  <!-- 批量设置人物 / 工作室（P6.217 拆分）。
       三个入口共用一个壳：视频人物（多选）、视频工作室（多选）、相册人物（单选）。
       子组件只管"选了哪些"，写库与列表刷新留在页面 —— 与批量分级同一套约定。 -->
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(460px, 92vw)"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <p class="batch-lead">{{ lead }}</p>

    <el-select
      v-if="multiple"
      v-model="values"
      multiple
      filterable
      :placeholder="placeholder"
      style="width: 100%"
    >
      <el-option v-for="item in options" :key="item.id" :label="optionLabel(item)" :value="item.id" />
    </el-select>

    <el-select
      v-else
      v-model="single"
      filterable
      clearable
      :placeholder="placeholder"
      style="width: 100%"
    >
      <el-option v-for="item in options" :key="item.id" :label="optionLabel(item)" :value="item.id" />
    </el-select>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** videoPerson | videoStudio | albumPerson */
  kind: { type: String, default: 'videoPerson' },
  count: { type: Number, default: 0 },
  options: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const values = ref([])
const single = ref(null)

const multiple = computed(() => props.kind !== 'albumPerson')

const title = computed(() => {
  if (props.kind === 'videoStudio') return '批量设置工作室'
  if (props.kind === 'albumPerson') return '批量设置相册人物'
  return '批量设置人物'
})

const placeholder = computed(() => {
  if (props.kind === 'videoStudio') return '选择工作室（可多选）'
  if (props.kind === 'albumPerson') return '选择人物'
  return '选择人物（可多选）'
})

const lead = computed(() => {
  if (props.kind === 'videoStudio') return `将替换选中 ${props.count} 个视频的工作室；留空 = 清空。`
  if (props.kind === 'albumPerson') return `将把选中 ${props.count} 本相册归到同一人物（相册是单人物字段）；留空 = 未归类。`
  return `将替换选中 ${props.count} 个视频的人物归属；留空 = 清空（回到「素人」兜底）。`
})

function optionLabel(item) {
  if (!item) return ''
  if (props.kind === 'videoStudio') return item.name || String(item.id)
  const n = props.kind === 'albumPerson' ? item.albumCount : item.videoCount
  return (item.name || String(item.id)) + (n == null ? '' : ' (' + n + ')')
}

/* 每次打开重置选择（与原实现一致） */
watch(() => props.modelValue, (open) => {
  if (!open) return
  values.value = []
  single.value = null
})

function submit() {
  emit('confirm', multiple.value ? values.value : single.value)
}
</script>

<style scoped>
.batch-lead { margin: 0 0 12px; font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); }
</style>
