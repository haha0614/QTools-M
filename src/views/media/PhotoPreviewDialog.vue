<template>
  <!-- 通用大图查看框（P6.248 抽出复用）
       原来有两套：媒体库页面自己的 preview 弹窗（标题 + 明细 + 失败降级），以及未归类照片里
       el-image 自带的全屏查看器（样式与信息都不同）。现在统一成这一个：
       标题 + 大图 + 明细行，加载失败自动降级到 fallback（通常是缩略图）并说明原因。 -->
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(920px, 94vw)"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
    @closed="onClosed"
  >
    <div class="preview-stage">
      <img v-if="currentSrc" class="preview-img" :src="mediaSrc(currentSrc)" :alt="title"
        @error="onError" @load="onLoaded" />
      <el-empty v-else description="没有可用的预览图" />
    </div>
    <p class="preview-meta">{{ metaText }}</p>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { mediaSrc } from './mediaFormat'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  /** 主图地址（相对，mediaSrc 会补前缀） */
  src: { type: String, default: '' },
  /** 主图失败时的兜底（一般是缩略图） */
  fallback: { type: String, default: '' },
  /** 明细行：相对路径 / 体积 / 尺寸等，调用方拼好 */
  meta: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const currentSrc = ref('')
const noticeText = ref('')

/* 每次打开都从主图开始，不要带上一次的降级结果 */
watch(() => [props.modelValue, props.src, props.fallback], () => {
  if (!props.modelValue) return
  currentSrc.value = props.src || props.fallback || ''
  noticeText.value = ''
})

const metaText = computed(() => (noticeText.value ? noticeText.value : props.meta))

function onLoaded(event) {
  const img = event && event.target
  if (!img || !img.naturalWidth) return
  if (!noticeText.value) noticeText.value = ''
}

function onError() {
  if (props.fallback && currentSrc.value !== props.fallback) {
    currentSrc.value = props.fallback
    noticeText.value = '原图/大图不可用，已降级为缩略图'
    return
  }
  currentSrc.value = ''
  noticeText.value = '预览图加载失败：' + props.title
}

function onClosed() {
  noticeText.value = ''
}
</script>

<style scoped>
.preview-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  background: transparent;
  border-radius: 4px;
  padding: 8px;
}
.preview-img {
  border-radius: 10px;
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  background: transparent;
}
.preview-meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
</style>
