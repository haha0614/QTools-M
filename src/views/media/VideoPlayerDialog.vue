<template>
  <!-- 视频页内播放（P6.223 拆分）：只负责"给个 src 就播"，
       destroy-on-close 保证关掉就停止拉流。 -->
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="min(1100px, 94vw)"
    append-to-body
    destroy-on-close
    class="video-dialog"
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <video v-if="src" :src="src" controls autoplay class="video-player"></video>
  </el-dialog>
</template>

<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  src: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.video-player { width: 100%; max-height: 70vh; background: #000; }
</style>
