<template>
  <el-dialog :model-value="modelValue" @update:model-value="(v) => emit('update:modelValue', v)"
    :title="'自动分级 · ' + (albumTitle || '本册')" width="min(780px, 94vw)" append-to-body
    class="auto-rate-dialog" @closed="reset">
    <div class="ar-body">
      <p class="ar-lead">
        用本机 NSFW 模型逐张判断，<b>能判的三档直接显式写入</b>（不写继承）；
        <b>判不了的进「待复核」</b>，不动库，交人工。<b>失败</b>是这一格压根没判出来（缩略图缺失 / 推理报错）。
        注意：本册是<b>限制级</b>时，被判「大众」的图会变成<b>单独可见</b>（图级优先）。
      </p>
      <p class="ar-rule">
        模型口径：Porn/Hentai ≥ 60% → 限制级；Sexy ≥ 45% 或 Porn ≥ 30% → 家长指导；其余 → 大众级。
      </p>

      <el-radio-group v-model="directWrite" size="small" class="ar-mode" :disabled="running || finished">
        <el-radio-button :value="false">先预览（推荐）</el-radio-button>
        <el-radio-button :value="true">直接写入（边扫边存）</el-radio-button>
      </el-radio-group>

      <div class="ar-bar">
        <el-progress :percentage="percent" :stroke-width="10" :status="finished ? 'success' : ''" />
        <span class="ar-count">{{ scanned }} / {{ total || '…' }}</span>
      </div>

      <div class="ar-stats">
        <span class="ar-stat s-restricted">限制 {{ counts.restricted }}</span>
        <span class="ar-stat s-guidance">指导 {{ counts.guidance }}</span>
        <span class="ar-stat s-general">大众 {{ counts.general }}</span>
        <span class="ar-stat s-review">待复核 {{ counts.review }}</span>
        <span class="ar-stat" v-if="counts.failed">失败 {{ counts.failed }}</span>
      </div>

      <div class="ar-hits" v-if="samples.length">
        <!-- P6.239：编号按**位置**（列表下标 + 1），不用库里的 seq —— seq 是历史排序号，
             排过序后会从 6、7 开始，显示成「第 7 张」与实际不符。 -->
        <div class="ar-hit" v-for="(s, sIdx) in samples" :key="s.id">
          <img :src="thumbOf(s.id)" :alt="'第 ' + (sIdx + 1) + ' 张'" loading="lazy"
            :title="'第 ' + (sIdx + 1) + ' 张 · 点击看大图'" @click="openBig(s, sIdx + 1)" />
          <span class="ar-hit-tag" :class="s.rating">{{ s.rating === 'restricted' ? '限' : '指' }}</span>
          <span class="ar-hit-score">{{ Math.round((s.porn || 0) * 100) }}%</span>
        </div>
      </div>

      <!-- P6.34：待复核清单 —— 模型判不了的图在这里逐张定档 -->
      <div class="ar-review" v-if="reviewItems.length">
        <div class="ar-review-head">
          待复核 {{ reviewItems.length }} 张（模型判不了）
          <span class="ar-review-hint">点「限 / 指 / 大」直接定档；不点就保持继承</span>
          <el-button size="small" text type="primary" @click="decideAll('restricted')">全部标限制</el-button>
        </div>
        <div class="ar-review-grid">
          <div class="ar-rv" v-for="(r, rIdx) in reviewItems" :key="r.id">
            <img :src="thumbOf(r.id)" :alt="'第 ' + (rIdx + 1) + ' 张'" loading="lazy"
              :title="'第 ' + (rIdx + 1) + ' 张 · 点击看大图'" @click="openBig(r, rIdx + 1)" />
            <div class="ar-rv-actions">
              <button type="button" @click="decide(r, 'restricted')">限</button>
              <button type="button" @click="decide(r, 'guidance')">指</button>
              <button type="button" @click="decide(r, 'general')">大</button>
            </div>
          </div>
        </div>
      </div>

      <p class="ar-direct" v-if="finished && directWrite">
        已直接写入：{{ writtenCount }} 张（边扫边存，中途关掉不丢）。
      </p>

      <p class="ar-error" v-if="error">{{ error }}</p>
    </div>

    <el-dialog v-model="bigVisible" :title="bigTitle" width="min(1100px, 96vw)" append-to-body>
      <img class="ar-big" :src="bigUrl" alt="" @error="onBigError" />
    </el-dialog>

    <template #footer>
      <el-button v-if="running" @click="stop">停止</el-button>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="!running" type="primary" :loading="scanning" @click="start">
        {{ finished ? '重新扫描' : '开始扫描' }}
      </el-button>
      <el-button v-if="finished && !directWrite" type="primary" plain
        :disabled="!applyCount || applying" :loading="applying" @click="apply">
        写入 {{ applyCount }} 张
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { classifyPhotos, setRatingBatch } from '@/api/media'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  albumId: { type: String, default: '' },
  albumTitle: { type: String, default: '' },
  items: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue', 'applied'])

const BATCH = 30
const APPLY_CHUNK = 500

const scanning = ref(false)
const running = ref(false)
const finished = ref(false)
const applying = ref(false)
const directWrite = ref(false)
const scanned = ref(0)
const total = ref(0)
const writtenCount = ref(0)
const error = ref('')
const samples = ref([])
const reviewItems = ref([])
const counts = ref(emptyCounts())
/** 分级 → id 列表（三档都会写） */
const byRating = ref({})
let stopFlag = false

function emptyCounts() {
  return { restricted: 0, guidance: 0, general: 0, review: 0, failed: 0 }
}

const percent = computed(() => (total.value ? Math.min(100, Math.round((scanned.value / total.value) * 100)) : 0))
const applyCount = computed(() => Object.values(byRating.value).reduce((n, list) => n + list.length, 0))

const thumbMap = computed(() => {
  const map = new Map()
  for (const item of props.items) map.set(String(item.id), item.thumb)
  return map
})
function thumbOf(id) {
  return thumbMap.value.get(String(id)) || ''
}

/* P6.41：点缩略图看大图 —— 大图地址优先取 items 里的 big / previewUrl，缺省退回缩略图 */
const bigMap = computed(() => {
  const map = new Map()
  for (const item of props.items || []) {
    map.set(String(item.id), item.big || item.previewUrl || item.thumb || '')
  }
  return map
})
const bigVisible = ref(false)
const bigUrl = ref('')
const bigTitle = ref('')
const bigSample = ref(null)

function openBig(sample, position) {
  const url = bigMap.value.get(String(sample.id)) || thumbOf(sample.id)
  if (!url) return
  bigUrl.value = url
  bigSample.value = sample
  bigTitle.value = '第 ' + (position || 1) + ' 张'
  bigVisible.value = true
}

function onBigError() {
  const fallback = bigSample.value ? thumbOf(bigSample.value.id) : ''
  if (fallback && bigUrl.value !== fallback) bigUrl.value = fallback
}

function reset() {
  scanning.value = false
  running.value = false
  finished.value = false
  applying.value = false
  scanned.value = 0
  total.value = 0
  writtenCount.value = 0
  error.value = ''
  samples.value = []
  reviewItems.value = []
  counts.value = emptyCounts()
  byRating.value = {}
  stopFlag = true
}

function stop() {
  stopFlag = true
}

function mergeIds(target, src) {
  if (!src) return
  for (const [rating, list] of Object.entries(src)) {
    if (!Array.isArray(list) || !list.length) continue
    const bucket = target[rating] || (target[rating] = [])
    for (const id of list) bucket.push(id)
  }
}

async function start() {
  if (!props.albumId) {
    error.value = '缺少 albumId'
    return
  }
  reset()
  stopFlag = false
  scanning.value = true
  running.value = true
  let offset = 0
  try {
    for (;;) {
      if (stopFlag) break
      const res = await classifyPhotos({ albumId: props.albumId, offset, limit: BATCH, dryRun: !directWrite.value })
      if (!res) break
      total.value = Number(res.total) || total.value
      scanned.value = Number(res.nextOffset) || scanned.value
      const c = res.counts || {}
      counts.value = {
        restricted: counts.value.restricted + (c.restricted || 0),
        guidance: counts.value.guidance + (c.guidance || 0),
        general: counts.value.general + (c.general || 0),
        review: counts.value.review + (c.review || 0),
        failed: counts.value.failed + (c.failed || 0)
      }
      if (directWrite.value) {
        writtenCount.value += (c.restricted || 0) + (c.guidance || 0) + (c.general || 0)
      } else {
        mergeIds(byRating.value, res.ids)
      }
      if (res.samples && res.samples.length) samples.value.push(...res.samples)
      if (res.reviewSamples && res.reviewSamples.length) {
        const seen = new Set(reviewItems.value.map((x) => String(x.id)))
        for (const r of res.reviewSamples) {
          if (!seen.has(String(r.id))) reviewItems.value.push(r)
        }
      }
      if (res.done || !res.checked) break
      offset = Number(res.nextOffset) || offset + BATCH
    }
    finished.value = true
    samples.value = samples.value.slice(0, 24)
  } catch (e) {
    error.value = '扫描失败：' + (e && e.message ? e.message : '请求失败')
  } finally {
    scanning.value = false
    running.value = false
  }
}

/** P6.34：把一张待复核图直接定档（立即写库，并从待复核清单里移除） */
async function decide(item, rating) {
  const id = String(item.id)
  try {
    await setRatingBatch({ type: 'photo', ids: [id], rating })
    reviewItems.value = reviewItems.value.filter((x) => String(x.id) !== id)
    counts.value.review = Math.max(0, counts.value.review - 1)
    counts.value[rating] = (counts.value[rating] || 0) + 1
    ElMessage.success('已定为' + ratingText(rating))
  } catch (e) {
    ElMessage.error('定档失败：' + ((e && e.message) || '请求失败'))
  }
}

/** 一键把剩下的待复核全部定为某一档 */
async function decideAll(rating) {
  const items = reviewItems.value.slice()
  if (!items.length) return
  for (const item of items) {
    if (!reviewItems.value.some((x) => String(x.id) === String(item.id))) continue
    await decide(item, rating)
  }
}

function ratingText(r) {
  return r === 'restricted' ? '限制级' : r === 'guidance' ? '家长指导级' : '大众级'
}

async function apply() {
  const groups = Object.entries(byRating.value).filter(([, list]) => list && list.length)
  if (!groups.length) return
  applying.value = true
  try {
    for (const [rating, list] of groups) {
      for (let i = 0; i < list.length; i += APPLY_CHUNK) {
        await setRatingBatch({ type: 'photo', ids: list.slice(i, i + APPLY_CHUNK), rating })
      }
    }
    ElMessage.success('已写入 ' + applyCount.value + ' 张（限制/指导/大众三档都写）')
    emit('applied', { byRating: byRating.value })
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error('写入失败：' + (e && e.message ? e.message : '请求失败'))
  } finally {
    applying.value = false
  }
}
</script>

<style scoped>
.ar-body { font-size: 13px; color: var(--el-text-color-regular); }
.ar-lead, .ar-rule { margin: 0 0 8px; line-height: 1.7; }
.ar-rule { font-size: 12px; color: var(--el-text-color-secondary); }
.ar-mode { margin: 4px 0 6px; }
.ar-bar { display: flex; align-items: center; gap: 12px; margin: 14px 0 6px; }
.ar-bar :deep(.el-progress) { flex: 1; }
.ar-count { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.ar-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 8px; font-size: 12px; }
.ar-stat { padding: 1px 8px; border-radius: 10px; background: var(--el-fill-color-light); }
.ar-stat.s-restricted { color: var(--el-color-danger); }
.ar-stat.s-guidance { color: var(--el-color-warning); }
.ar-stat.s-general { color: var(--el-color-success); }
.ar-stat.s-review { color: var(--el-text-color-secondary); }
.ar-hits {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  margin: 10px 0;
  max-height: 260px;
  overflow: auto;
}
.ar-hit { position: relative; line-height: 0; }
.ar-hit img { width: 100%; aspect-ratio: 1 / 1; object-fit: contain; border-radius: 4px; background: var(--el-fill-color-light); cursor: zoom-in; }
.ar-hit-tag {
  position: absolute; right: 3px; top: 3px; padding: 1px 5px; border-radius: 3px;
  font-size: 11px; line-height: 16px; color: #fff;
}
.ar-hit-tag.restricted { background: var(--el-color-danger); }
.ar-hit-tag.guidance { background: var(--el-color-warning); }
.ar-hit-score {
  position: absolute; left: 3px; bottom: 3px; padding: 0 4px; border-radius: 3px;
  font-size: 11px; line-height: 16px; color: #fff; background: rgba(0, 0, 0, 0.55);
}
.ar-review { margin: 10px 0 4px; border-top: 1px dashed var(--el-border-color); padding-top: 8px; }
.ar-review-head { font-size: 12px; color: var(--el-text-color-regular); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ar-review-hint { color: var(--el-text-color-secondary); }
.ar-review-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-top: 8px; max-height: 200px; overflow: auto; }
.ar-rv { line-height: 0; }
.ar-rv img { width: 100%; aspect-ratio: 1 / 1; object-fit: contain; border-radius: 4px; background: var(--el-fill-color-light); cursor: zoom-in; }
.ar-rv-actions { display: flex; gap: 4px; margin-top: 4px; }
.ar-rv-actions button {
  flex: 1; font-size: 11px; line-height: 18px; padding: 0; cursor: pointer;
  border: 1px solid var(--el-border-color); border-radius: 4px; background: var(--el-bg-color);
  color: var(--el-text-color-regular);
}
.ar-rv-actions button:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
.ar-big { display: block; max-width: 100%; max-height: 72vh; margin: 0 auto; object-fit: contain; }
.ar-direct { margin: 10px 0 0; font-size: 12px; color: var(--el-color-success); }
.ar-error { margin: 10px 0 0; font-size: 12px; color: var(--el-color-danger); }
</style>







