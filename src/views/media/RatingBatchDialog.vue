<template>
  <!-- 批量设置分级（视频 / 相册）：只负责"选哪一档"，真正写库与列表同步留在页面里。
       从 index.vue（4774 行）拆出，P6.215。 -->
  <el-dialog
    :model-value="modelValue"
    :title="type === 'album' ? '批量设置相册分级' : '批量设置视频分级'"
    width="min(460px, 92vw)"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <p class="rating-batch-lead">
      将给选中的 {{ count }} 个{{ kindText }}统一设置分级。分级决定未登录访客能不能看到它。
    </p>
    <el-radio-group v-model="value" class="rating-batch-group">
      <el-radio v-for="opt in RATING_OPTIONS" :key="opt.value" :value="opt.value" :data-testid="'batch-rating-' + opt.value">
        {{ opt.label }}
      </el-radio>
    </el-radio-group>
    <p class="rating-batch-tip">
      分级本身不影响已登录用户；「未登录可见」的开关在<strong>库根管理</strong>页的「分级与可见性」里。
    </p>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取 消</el-button>
      <el-button type="primary" :loading="saving" data-testid="batch-rating-submit"
        @click="emit('confirm', value)">保 存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { RATING_OPTIONS } from './ratingOptions'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  type: { type: String, default: 'video' },
  count: { type: Number, default: 0 },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const value = ref('general')
const kindText = computed(() => (props.type === 'album' ? '相册' : '视频'))

/* 每次打开都回到默认档（与原实现一致） */
watch(() => props.modelValue, (open) => {
  if (open) value.value = 'general'
})
</script>

<style scoped>
.rating-batch-lead { margin: 0 0 12px; font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); }
.rating-batch-group { display: flex; flex-direction: column; gap: 6px; }
.rating-batch-tip { margin: 12px 0 0; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
</style>
