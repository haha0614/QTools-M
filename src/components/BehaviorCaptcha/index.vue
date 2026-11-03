<template>
  <!-- 行为验证码：按住滑块拖到最右端，提交拖动轨迹给服务端判"是不是人手"。
       与滑块拼图不同的是没有图片缺口，考验的是拖动过程本身。 -->
  <div class="beh-cap">
    <div class="beh-cap-track" :class="{ done: verified, dragging }" @pointerdown="start">
      <div class="beh-cap-fill" :style="{ width: left + 18 + 'px' }"></div>
      <div class="beh-cap-handle" :style="{ left: left + 'px' }">
        <el-icon v-if="!verified"><DArrowRight /></el-icon>
        <el-icon v-else><Check /></el-icon>
      </div>
      <span class="beh-cap-tip">{{ tip }}</span>
    </div>
  </div>
</template>

<script setup>
import { getBehaviorCaptcha, verifyBehaviorCaptcha } from '@/api/login'

const emit = defineEmits(['verified'])

const HANDLE = 40
const trackRef = ref(null)
const uuid = ref('')
const left = ref(0)
const dragging = ref(false)
const verified = ref(false)
const checking = ref(false)
const tip = ref('按住滑块，拖到最右端')

let samples = []
let startedAt = 0

const trackWidth = computed(() => trackRef.value?.clientWidth || 0)

async function reset() {
  verified.value = false
  left.value = 0
  checking.value = false
  tip.value = '按住滑块，拖到最右端'
  samples = []
  try {
    const res = await getBehaviorCaptcha()
    uuid.value = res.data?.uuid || ''
    if (res.data?.captchaEnabled === false) {
      tip.value = '当前未开启验证码'
    }
  } catch (e) {
    tip.value = '验证码加载失败'
  }
}

function start(e) {
  if (verified.value || checking.value) return
  dragging.value = true
  startedAt = performance.now()
  samples = [{ x: 0, y: 0, t: 0 }]
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', end)
  e.preventDefault?.()
}

function onMove(e) {
  if (!dragging.value) return
  const el = trackRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const max = Math.max(0, el.clientWidth - HANDLE)
  const x = Math.min(max, Math.max(0, e.clientX - rect.left - HANDLE / 2))
  left.value = x
  samples.push({ x: Math.round(x), y: 0, t: Math.round(performance.now() - startedAt) })
}

async function end() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', end)
  if (!dragging.value) return
  dragging.value = false
  if (!uuid.value) return

  const width = trackWidth.value
  checking.value = true
  try {
    const res = await verifyBehaviorCaptcha({
      uuid: uuid.value,
      durationMs: Math.round(performance.now() - startedAt),
      trackWidth: width,
      endX: Math.round(left.value),
      samples
    })
    const permit = res.data?.permit
    if (permit) {
      verified.value = true
      left.value = Math.max(0, width - HANDLE)
      tip.value = '验证通过'
      emit('verified', { uuid: uuid.value, permit })
    } else {
      tip.value = res.msg || '验证失败，请重试'
      await reset()
    }
  } catch (err) {
    tip.value = err?.message || '验证失败，请重试'
    await reset()
  } finally {
    checking.value = false
  }
}

defineExpose({ reset })
onMounted(reset)
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', end)
})
</script>

<style scoped>
.beh-cap { width: 100%; max-width: 320px; }

.beh-cap-track {
  position: relative;
  height: 40px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  overflow: hidden;
  touch-action: none;
}

.beh-cap-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--el-color-primary) 22%, transparent);
}

.beh-cap-handle {
  position: absolute;
  top: 0;
  width: 40px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  border: 1px solid var(--el-border-color);
  color: var(--el-color-primary);
  cursor: grab;
}

.beh-cap-track.dragging .beh-cap-handle { cursor: grabbing; }
.beh-cap-track.done .beh-cap-handle { color: #16a34a; border-color: #16a34a; }

.beh-cap-tip {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  pointer-events: none;
}
</style>
