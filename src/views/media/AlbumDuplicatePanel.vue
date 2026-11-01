<template>
  <div class="album-dup">
    <el-alert type="info" :closable="false" show-icon class="album-tip"
      title="册级重复：两本册其实装的是同一套图。">
      <template #default>
        <p>
          逐张看太慢。这里把相似组按册摊开，累计「两本册各有多少张落在同一组里」，
          于是能一眼看出哪两本册高度重合（例如 019 写真合集 ↔ 130 全裸写真）。
        </p>
        <p class="album-warn">
          清理只删**你选的那一侧**，另一册原样保留：先决定留哪本，再清另一本里的重叠项。
          文件一律进回收站，可恢复。
        </p>
      </template>
    </el-alert>

    <div class="album-bar">
      <span class="album-label">阈值</span>
      <el-radio-group v-model="threshold" size="small" data-testid="album-threshold" @change="load">
        <el-radio-button :value="0">0（几乎肯定同一张）</el-radio-button>
        <el-radio-button :value="1">1</el-radio-button>
        <el-radio-button :value="2">2（会混进连拍）</el-radio-button>
      </el-radio-group>
      <span class="album-label">最少重叠</span>
      <el-input-number v-model="minOverlap" :min="1" :max="2000" size="small" controls-position="right"
        class="album-min" data-testid="album-min" @change="load" />
      <span class="album-spacer"></span>
      <span class="album-stat">共 {{ total }} 对册</span>
      <el-button size="small" :loading="loading" data-testid="album-refresh" @click="load">刷新</el-button>
    </div>

    <div v-loading="loading" class="album-body">
      <el-card v-for="p in rows" :key="p.albumA.id + '|' + p.albumB.id" shadow="never" class="album-card">
        <div class="album-head">
          <el-button size="small" text type="primary" data-testid="album-toggle"
            @click="toggleDetail(p)">
            {{ detailOpen[p.albumA.id + '|' + p.albumB.id] ? '收起重叠明细' : '查看重叠的 ' + p.overlap + ' 张' }}
          </el-button>
          <span v-if="detailLoading === keyOf(p)" class="album-loading">加载中…</span>
        </div>
        <div class="album-pair">
          <div class="album-side">
            <div class="album-title" :title="p.albumA.title">{{ p.albumA.title }}</div>
            <div class="album-count">{{ p.albumA.photoCount }} 张</div>
            <el-button size="small" type="danger" plain :loading="busy === p.albumA.id + '|' + p.albumB.id"
              data-testid="album-clean-a" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
              @click="cleanSide(p, p.albumA, p.albumB)">
              清理 A 中重叠的 {{ p.overlap }} 张
            </el-button>
          </div>
          <div class="album-mid">
            <div class="album-overlap">重叠 <b>{{ p.overlap }}</b> 张</div>
            <div class="album-ratio">占小册 {{ ratioMin(p) }}% · 占大册 {{ ratioMax(p) }}%</div>
          </div>
          <div class="album-side right">
            <div class="album-title" :title="p.albumB.title">{{ p.albumB.title }}</div>
            <div class="album-count">{{ p.albumB.photoCount }} 张</div>
            <el-button size="small" type="danger" plain :loading="busy === p.albumA.id + '|' + p.albumB.id"
              data-testid="album-clean-b" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
              @click="cleanSide(p, p.albumB, p.albumA)">
              清理 B 中重叠的 {{ p.overlap }} 张
            </el-button>
          </div>
        </div>
        <div v-if="detailOpen[keyOf(p)]" class="album-detail">
          <div class="album-detail-tip">
            每一行是同一组相似里「A 一张 ↔ B 一张」。缩略图可点开看原图；
            只想删某一对里的那一张时，点右侧「清理」。
            <span v-if="detailTotal[keyOf(p)] > detailRows[keyOf(p)].length">
              （共 {{ detailTotal[keyOf(p)] }} 对，只列前 {{ detailRows[keyOf(p)].length }} 对）
            </span>
          </div>
          <div class="album-pairs">
            <div v-for="row in detailRows[keyOf(p)]" :key="row.a.id + '-' + row.b.id" class="album-pairrow">
              <div class="album-cell">
                <el-image class="album-thumb" fit="contain" :src="thumbSrc(row.a)"
                  :preview-src-list="[bigSrc(row.a)]" :initial-index="0" :z-index="3000"
                  hide-on-click-modal teleported>
                  <template #error><span class="album-ph">无图</span></template>
                </el-image>
                <div class="album-cell-meta" :title="row.a.relPath">#{{ row.a.seq }} {{ baseName(row.a.relPath) }}</div>
                <el-button link type="danger" size="small" :loading="busyId === row.a.id"
                  data-testid="album-remove-a" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
                  @click="removeOne(row.a, 'A')">清理这张(A)</el-button>
              </div>
              <div class="album-arrow">≈</div>
              <div class="album-cell">
                <el-image class="album-thumb" fit="contain" :src="thumbSrc(row.b)"
                  :preview-src-list="[bigSrc(row.b)]" :initial-index="0" :z-index="3000"
                  hide-on-click-modal teleported>
                  <template #error><span class="album-ph">无图</span></template>
                </el-image>
                <div class="album-cell-meta" :title="row.b.relPath">#{{ row.b.seq }} {{ baseName(row.b.relPath) }}</div>
                <el-button link type="danger" size="small" :loading="busyId === row.b.id"
                  data-testid="album-remove-b" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
                  @click="removeOne(row.b, 'B')">清理这张(B)</el-button>
              </div>
            </div>
          </div>
        </div>
      </el-card>

      <el-empty v-if="!loading && !rows.length" description="这个阈值/重叠门槛下没有高度重合的册对" />
    </div>
  </div>
</template>

<script setup name="AlbumDuplicatePanel">
import { getCurrentInstance, onMounted, ref } from 'vue'
import {
  listNearAlbumPairs, cleanNearAlbumOverlap, listNearAlbumOverlapPhotos, removeNearDuplicates
} from '@/api/media'

const { proxy } = getCurrentInstance()
const rows = ref([])
const total = ref(0)
const threshold = ref(0)
const minOverlap = ref(2)
const loading = ref(false)
const busy = ref('')
const busyId = ref(null)
const BASE_API = (import.meta.env && import.meta.env.VITE_APP_BASE_API) || ''
/** 哪些册对展开了明细 / 明细数据与总数 */
const detailOpen = ref({})
const detailRows = ref({})
const detailTotal = ref({})
const detailLoading = ref('')

function keyOf(p) {
  return p.albumA.id + '|' + p.albumB.id
}
function thumbSrc(m) {
  return m && m.thumb ? BASE_API + m.thumb : ''
}
function bigSrc(m) {
  if (!m) return ''
  return m.relPath ? BASE_API + '/api/media/file?p=' + encodeURIComponent(m.relPath) : thumbSrc(m)
}
function baseName(rel) {
  const s = String(rel || '')
  const k = s.lastIndexOf('/')
  return k >= 0 ? s.slice(k + 1) : s
}

async function toggleDetail(p) {
  const key = keyOf(p)
  if (detailOpen.value[key]) {
    detailOpen.value = { ...detailOpen.value, [key]: false }
    return
  }
  detailOpen.value = { ...detailOpen.value, [key]: true }
  if (detailRows.value[key]) return
  detailLoading.value = key
  try {
    const res = await listNearAlbumOverlapPhotos({
      albumId: p.albumA.id,
      otherAlbumId: p.albumB.id,
      threshold: threshold.value,
      limit: 200
    })
    detailRows.value = { ...detailRows.value, [key]: (res && res.rows) || [] }
    detailTotal.value = { ...detailTotal.value, [key]: (res && res.total) || 0 }
  } catch (e) {
    proxy.$modal.msgError('读取重叠明细失败：' + errText(e))
  } finally {
    detailLoading.value = ''
  }
}

/** 明细里删单张：一次确认，走同一个"进回收站"接口 */
async function removeOne(m, side) {
  try {
    await proxy.$modal.confirm('清理这一张（' + side + ' 侧）：移入回收站 + 删行，可恢复。确认？')
  } catch (e) {
    return
  }
  busyId.value = m.id
  try {
    const res = await removeNearDuplicates({ ids: [m.id] })
    proxy.$modal.msgSuccess('已清理 ' + ((res && res.removed) || 0) + ' 张')
    // 明细与册对一起刷新
    detailRows.value = {}
    detailTotal.value = {}
    await load()
  } catch (e) {
    proxy.$modal.msgError('清理失败：' + errText(e))
  } finally {
    busyId.value = null
  }
}

function errText(e) {
  const body = e && e.response && e.response.data
  if (body && body.error) return body.error
  if (body && body.msg) return body.msg
  return (e && e.message) || '请求失败'
}

function ratioMin(p) {
  const a = Number(p.albumA.photoCount) || 0
  const b = Number(p.albumB.photoCount) || 0
  const s = Math.max(1, Math.min(a, b))
  return Math.round((Number(p.overlap) / s) * 1000) / 10
}
function ratioMax(p) {
  const a = Number(p.albumA.photoCount) || 0
  const b = Number(p.albumB.photoCount) || 0
  const s = Math.max(1, Math.max(a, b))
  return Math.round((Number(p.overlap) / s) * 1000) / 10
}

async function load() {
  loading.value = true
  detailRows.value = {}
  detailTotal.value = {}
  try {
    const res = await listNearAlbumPairs({ threshold: threshold.value, minOverlap: minOverlap.value, limit: 50 })
    rows.value = (res && res.rows) || []
    total.value = (res && res.total) || 0
  } catch (e) {
    rows.value = []
    total.value = 0
    proxy.$modal.msgError('读取册级重复失败：' + errText(e))
  } finally {
    loading.value = false
  }
}

/** 只清「victim 这本册」里与 other 重叠的图，另一个册原样保留 */
async function cleanSide(p, victim, other) {
  const key = p.albumA.id + '|' + p.albumB.id
  const label = '清理「' + (victim.title || victim.id) + '」里与「' + (other.title || other.id) + '」重叠的 '
    + p.overlap + ' 张'
  try {
    await proxy.$modal.confirm(label + '：\n只删这一侧，另一册保留；文件进回收站，可恢复。确认？')
  } catch (e) {
    return
  }
  busy.value = key
  try {
    const res = await cleanNearAlbumOverlap({
      albumId: victim.id,
      otherAlbumId: other.id,
      threshold: threshold.value
    })
    proxy.$modal.msgSuccess('已清理 ' + ((res && res.removed) || 0) + ' 张')
    const failed = (res && res.failed) || []
    const gone = failed.filter((f) => String(f.reason || '').indexOf('照片不存在') > -1)
    if (gone.length) proxy.$modal.msgWarning(gone.length + ' 张已经不在了，已跳过')
    await load()
  } catch (e) {
    proxy.$modal.msgError('清理失败：' + errText(e))
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.album-tip { margin-bottom: 10px; }
.album-tip p { margin: 4px 0; line-height: 1.7; }
.album-warn { color: var(--el-color-warning); }
.album-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.album-label { font-size: 12px; color: var(--el-text-color-secondary); }
.album-min { width: 110px; }
.album-spacer { flex: 1; }
.album-stat { font-size: 12px; color: var(--el-text-color-secondary); }
.album-card { margin-bottom: 10px; }
.album-pair { display: flex; align-items: center; gap: 16px; }
.album-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.album-side.right { align-items: flex-end; text-align: right; }
.album-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.album-count { font-size: 12px; color: var(--el-text-color-secondary); }
.album-mid { flex: none; text-align: center; padding: 0 12px; border-left: 1px solid var(--el-border-color-lighter); border-right: 1px solid var(--el-border-color-lighter); }
.album-overlap { font-size: 13px; }
.album-overlap b { font-size: 18px; color: var(--el-color-danger); }
.album-ratio { font-size: 12px; color: var(--el-text-color-secondary); }
/* P6.80.1：重叠明细（删之前先看一眼） */
.album-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.album-loading { font-size: 12px; color: var(--el-text-color-secondary); }
.album-detail { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--el-border-color); }
.album-detail-tip { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 8px; line-height: 1.6; }
.album-pairs { display: flex; flex-direction: column; gap: 10px; }
.album-pairrow {
  display: flex; align-items: center; gap: 12px;
  padding: 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px;
}
.album-cell { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.album-thumb { width: 100%; height: 160px; background: var(--el-fill-color-light); cursor: zoom-in; }
.album-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 12px; color: var(--el-text-color-secondary); }
.album-cell-meta { font-size: 12px; color: var(--el-text-color-secondary); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-arrow { flex: none; color: var(--el-color-danger); font-size: 16px; }
</style>
