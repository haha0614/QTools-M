<template>
  <!-- 滑块拼图验证码：拖动拼图块到缺口，位置正确才发放一次性凭证。
       替代原来那块扭曲字母图片 —— 那个既要辨认、暗色下还刺眼。 -->
  <div class="slider-cap">
    <div class="slider-cap-stage" ref="stageRef" :style="{ aspectRatio: width + ' / ' + height }">
      <img v-if="bg" :src="bg" class="slider-cap-bg" alt="" draggable="false" />
      <img
        v-if="piece"
        :src="piece"
        class="slider-cap-piece"
        alt=""
        draggable="false"
        :style="pieceStyle"
      />

      <div v-if="verified" class="slider-cap-ok">
        <el-icon><CircleCheck /></el-icon>
        <span>验证通过</span>
      </div>

      <div v-if="!bg" class="slider-cap-loading">加载中…</div>
    </div>

    <div class="slider-cap-track" :class="{ dragging, verified }" @pointerdown="onTrackDown">
      <div class="slider-cap-fill" :style="{ width: handleLeft + 'px' }"></div>
      <div
        class="slider-cap-handle"
        :style="{ left: handleLeft + 'px' }"
        @pointerdown.stop="onHandleDown"
      >
        <el-icon v-if="!verified"><DArrowRight /></el-icon>
        <el-icon v-else><Check /></el-icon>
      </div>
      <span class="slider-cap-tip">{{ tip }}</span>
    </div>
  </div>
</template>

<script setup>
import { getSliderCaptcha, verifySliderCaptcha } from '@/api/login'

const emit = defineEmits(['verified'])

const stageRef = ref(null)
const bg = ref('')
const piece = ref('')
const uuid = ref('')
const width = ref(320)
const height = ref(160)
const y = ref(0)
const size = ref(48)

const offset = ref(0)
const dragging = ref(false)
const verified = ref(false)
const checking = ref(false)
const tip = ref('拖动滑块，把拼图对进缺口')

const handleWidth = 40

/* 舞台宽度随布局变化（弹窗/窄屏），拖动用的原始像素坐标要按比例换算 */
const scale = ref(1)
const PIECE_INSET = 4
const handleLeft = computed(() => (scale.value === 1 ? offset.value : offset.value * scale.value))
const pieceStyle = computed(() => ({
  left: handleLeft.value + PIECE_INSET + 'px',
  top: y.value * scale.value + 'px',
  width: size.value * scale.value + 'px',
  height: size.value * scale.value + 'px'
}))

function measure() {
  const el = stageRef.value
  if (!el) return
  const w = el.clientWidth
  if (w > 0) scale.value = w / width.value
}

async function load() {
  verified.value = false
  offset.value = 0
  checking.value = false
  tip.value = '拖动滑块，把拼图对进缺口'
  bg.value = ''
  piece.value = ''
  try {
    const res = await getSliderCaptcha()
    const d = res.data || {}
    if (d.captchaEnabled === false) {
      tip.value = '当前未开启验证码'
      return
    }
    bg.value = 'data:image/png;base64,' + d.bg
    piece.value = 'data:image/png;base64,' + d.piece
    uuid.value = d.uuid
    width.value = d.width || 320
    height.value = d.height || 160
    y.value = d.y || 0
    size.value = d.size || 48
    await nextTick()
    measure()
  } catch (e) {
    tip.value = '验证码加载失败，点击重试'
  }
}

function maxOffset() {
  const el = stageRef.value
  const stageW = el ? el.clientWidth : 0
  return Math.max(0, stageW - handleWidth)
}

function setOffsetByClientX(clientX) {
  const el = stageRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const raw = clientX - rect.left - handleWidth / 2
  const clamped = Math.min(maxOffset(), Math.max(0, raw))
  offset.value = scale.value === 1 ? clamped : clamped / scale.value
}

function onTrackDown(e) {
  if (verified.value || checking.value) return
  dragging.value = true
  setOffsetByClientX(e.clientX)
  bind()
}

function onHandleDown(e) {
  if (verified.value || checking.value) return
  dragging.value = true
  bind(e)
}

function bind(e) {
  e?.preventDefault?.()
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onMove(e) {
  if (!dragging.value) return
  setOffsetByClientX(e.clientX)
}

async function onUp() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  if (!dragging.value) return
  dragging.value = false
  if (!uuid.value) return

  checking.value = true
  try {
    const res = await verifySliderCaptcha({ uuid: uuid.value, x: Math.round(offset.value) })
    const permit = res.data?.permit
    if (permit) {
      verified.value = true
      tip.value = '验证通过'
      emit('verified', { uuid: uuid.value, permit })
    } else {
      tip.value = res.msg || '位置不对，再来一次'
      await load()
    }
  } catch (err) {
    tip.value = err?.message || '校验失败，请重试'
    await load()
  } finally {
    checking.value = false
  }
}

function reset() {
  load()
}

defineExpose({ reset, load })

onMounted(() => {
  load()
  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
</script>

<style scoped>
.slider-cap { width: 100%; max-width: 320px; }

.slider-cap-stage {
  position: relative;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  user-select: none;
}

.slider-cap-bg { display: block; width: 100%; height: 100%; object-fit: cover; }

.slider-cap-piece {
  position: absolute;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .35));
  pointer-events: none;
}

.slider-cap-ok {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  color: #fff;
  background: rgba(22, 163, 74, .86);
  backdrop-filter: blur(3px);
}

.slider-cap-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.slider-cap-track {
  position: relative;
  margin-top: 8px;
  height: 40px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color);
  overflow: hidden;
  touch-action: none;
}

.slider-cap-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--el-color-primary) 22%, transparent);
}

.slider-cap-handle {
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
  touch-action: none;
}

.slider-cap-track.dragging .slider-cap-handle { cursor: grabbing; }
.slider-cap-track.verified .slider-cap-handle { color: #16a34a; border-color: #16a34a; }

.slider-cap-tip {
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
