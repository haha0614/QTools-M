<template>
  <!-- 数字/字母验证码：保持原来的"输入框 + 图片"形态，抽成独立组件，
       由后台参数 sys.account.captchaType=char 决定是否使用。 -->
  <div class="char-cap">
    <el-input v-model="code" auto-complete="off" placeholder="请输入验证码" @input="emitChange" @keyup.enter="$emit('submit')" />
    <button type="button" class="char-cap-img" title="看不清？点击换一张" @click="load">
      <img v-if="src" :src="src" alt="验证码" />
      <span v-else>加载中</span>
    </button>
  </div>
</template>

<script setup>
import { getCodeImg } from '@/api/login'

const emit = defineEmits(['change', 'submit'])

const src = ref('')
const code = ref('')
const uuid = ref('')

function emitChange() {
  emit('change', { code: code.value, uuid: uuid.value })
}

async function load() {
  code.value = ''
  emitChange()
  try {
    const res = await getCodeImg()
    if (res.captchaEnabled === false) {
      src.value = ''
      return
    }
    src.value = 'data:image/gif;base64,' + res.img
    uuid.value = res.uuid || ''
    emitChange()
  } catch (e) {
    src.value = ''
  }
}

defineExpose({ load })
onMounted(load)
</script>

<style scoped>
.char-cap { display: flex; align-items: center; gap: 9px; width: 100%; }
.char-cap :deep(.el-input) { flex: 1 1 auto; }

.char-cap-img {
  flex: 0 0 100px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.char-cap-img img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
  mix-blend-mode: multiply;
}

html.dark .char-cap-img img {
  filter: invert(1) hue-rotate(180deg) contrast(1.05);
  mix-blend-mode: screen;
}
</style>
