<template>
  <div class="near-dup">
    <el-alert type="info" :closable="false" show-icon class="near-tip"
      title="相似图片 = 感知指纹相近，不是「文件完全相同」。">
      <template #default>
        <p>
          用 800 宽缩略图算 64 位 dHash，汉明距离 ≤ 阈值就算「可疑同一张」。
          典型场景：同一张图被重新压缩/缩放后字节变了，<code>content_hash</code> 完全不同，
          所以「同内容多份」永远抓不到它。
        </p>
        <p class="near-warn">
          <b>不会自动删</b>：写真连拍、同场景换姿势的两张指纹也很近。所以每一组都要人眼确认，
          清理一律「文件移入回收站 + 删行」，可恢复。
        </p>
      </template>
    </el-alert>

    <div class="near-bar">
      <span class="near-label">阈值</span>
      <el-radio-group v-model="threshold" size="small" data-testid="near-threshold" @change="onThreshold">
        <el-radio-button :value="0">0（几乎肯定同一张）</el-radio-button>
        <el-radio-button :value="1">1</el-radio-button>
        <el-radio-button :value="2">2（会混进连拍）</el-radio-button>
      </el-radio-group>
      <span class="near-label">范围</span>
      <el-radio-group v-model="mode" size="small" data-testid="near-mode" @change="onModeChange">
        <el-radio-button value="cross">只看跨册（更可能是重复）</el-radio-button>
        <el-radio-button value="same">只看同册（多半是连拍）</el-radio-button>
        <el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>
      <span class="near-spacer"></span>
      <span class="near-stat" v-if="status.total">
        指纹 {{ status.hashed }} / {{ status.total }}
        <el-button v-if="status.remaining > 0" size="small" type="primary" plain :loading="building"
          v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="near-build"
          @click="buildPhash">算指纹（剩 {{ status.remaining }}）</el-button>
      </span>
      <el-button size="small" :loading="loading" data-testid="near-refresh" @click="load">刷新</el-button>
    </div>

    <div class="near-bar" v-if="status.total && !status.remaining">
      <span class="near-label">批量</span>
      <el-radio-group v-model="keepRule" size="small" data-testid="near-keeprule">
        <el-radio-button value="largest">保留体积最大的</el-radio-button>
        <el-radio-button value="earliest">保留最早进库的</el-radio-button>
      </el-radio-group>
      <el-button size="small" type="primary" plain :disabled="!rows.length" data-testid="near-clean-page"
        v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="cleanGroups(rows.map(g => g.groupKey), '本页 ' + rows.length + ' 组')">
        本页 {{ rows.length }} 组一键处理
      </el-button>
      <el-button size="small" type="danger" plain :disabled="!total" data-testid="near-clean-all"
        v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="cleanGroups(null, '全部 ' + total + ' 组')">
        全部 {{ total }} 组一键处理
      </el-button>
      <span class="near-spacer"></span>
      <span class="near-stat">共 {{ total }} 组 · 本页 {{ photoCount }} 张</span>
    </div>

    <div v-loading="loading" class="near-body">
      <el-card v-for="(g, gi) in rows" :key="g.groupKey" shadow="never" class="near-card">
        <template #header>
          <div class="near-head">
            <el-tag size="small" :type="isCross(g) ? 'danger' : 'info'" data-testid="near-group-tag">
              {{ isCross(g) ? '跨 ' + albumCountOf(g) + ' 册 · 更可能是重复' : '同册 · 可能是连拍' }}
            </el-tag>
            <span class="near-copies">相似组 · <b>{{ g.length }}</b> 张 · 可省 {{ bytesText(savingOf(g)) }}</span>
            <span class="near-spacer"></span>
            <el-button size="small" type="primary" plain :disabled="!picked[gi]"
              :loading="busy === g.groupKey" data-testid="near-keep-group"
              v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="keepGroup(g, gi)">
              保留选中的，其余清理
            </el-button>
          </div>
        </template>
        <el-radio-group v-model="picked[gi]" class="near-list">
          <div v-for="(m, mi) in g" :key="m.id" class="near-item"
            :class="{ 'is-picked': picked[gi] === m.id, 'is-album-start': mi > 0 && m.albumId !== g[mi - 1].albumId }">
            <el-image class="near-thumb" fit="contain" :src="thumbSrc(m)"
              :preview-src-list="[bigSrc(m)]" :initial-index="0" :z-index="3000"
              hide-on-click-modal teleported>
              <template #error><span class="near-ph">{{ fileInitial(m.relPath) }}</span></template>
            </el-image>
            <div class="near-meta">
              <div class="near-title" :title="m.albumTitle || m.albumId">
                {{ m.albumTitle || m.albumId }} <span class="near-seq">#{{ m.seq }}</span>
              </div>
              <div class="near-sub">
                <span class="near-size">{{ bytesText(m.bytes) }}</span>
                <span class="near-path" :title="m.relPath">{{ baseName(m.relPath) }}</span>
              </div>
              <div class="near-actions">
                <el-radio :value="m.id" class="near-radio">保留这份</el-radio>
                <el-button link type="danger" size="small" :loading="busyId === m.id"
                  data-testid="near-remove-one" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
                  @click.stop.prevent="removeOne(m)">清理这份</el-button>
              </div>
            </div>
          </div>
        </el-radio-group>
      </el-card>

      <el-empty v-if="!loading && !rows.length" description="这个阈值下没有相似组" />
      <pagination v-show="total > 0" :page-sizes="[5, 10, 20]" :total="total"
        v-model:page="page" v-model:limit="size" @pagination="load" />
    </div>
  </div>
</template>

<script setup name="NearDuplicatePanel">
import { getCurrentInstance, onMounted, reactive, ref } from 'vue'
import {
  listNearDuplicates, nearDuplicateStatus, buildNearDuplicate,
  cleanNearDuplicates, keepNearDuplicates, removeMainDuplicate
} from '@/api/media'

const { proxy } = getCurrentInstance()
const BASE_API = (import.meta.env && import.meta.env.VITE_APP_BASE_API) || ''

const rows = ref([])
const total = ref(0)
const photoCount = ref(0)
const page = ref(1)
const size = ref(5)
const loading = ref(false)
const threshold = ref(0)
/** cross=只看跨册（默认：同册相似多半是连拍，跨册才更可能是重复）/ same / all */
const mode = ref('cross')
const keepRule = ref('largest')
const status = reactive({ total: 0, hashed: 0, remaining: 0 })
const picked = ref({})
const busy = ref('')
const busyId = ref(null)
const building = ref(false)

function errText(e) {
  const body = e && e.response && e.response.data
  if (body && body.error) return body.error
  if (body && body.msg) return body.msg
  return (e && e.message) || '请求失败'
}

/** 后端给的就是站内完整路径（/api/media/thumb/p8/<hash>），直接拼 BASE_API 即可 */
function thumbSrc(m) {
  if (!m || !m.thumb) return ''
  return BASE_API + m.thumb
}
/**
 * 点开看的大图：优先**原图**（/api/media/file?p=相对路径），与同页签「同内容多份」一致。
 * 不能用 /api/media/preview/p/<hash>：那是 pv 档产物，只有 is_big=1 的 342 张大图才有，
 * 普通图点开就是 404——"点了没反应"正是这个原因。
 */
function bigSrc(m) {
  if (!m) return ''
  if (m.relPath) return BASE_API + '/api/media/file?p=' + encodeURIComponent(m.relPath)
  return m.thumb ? BASE_API + m.thumb : ''
}
function bytesText(n) {
  const v = Number(n) || 0
  if (v < 1024) return v + ' B'
  const units = ['KB', 'MB', 'GB']
  let x = v / 1024
  let i = 0
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i += 1
  }
  return (x >= 100 ? Math.round(x) : x.toFixed(1)) + ' ' + units[i]
}
function isCross(g) {
  return g && g.length > 0 && g[0].crossAlbum === true
}
function albumCountOf(g) {
  if (!g || !g.length) return 0
  return Number(g[0].albumCount) || new Set(g.map((m) => m.albumId)).size
}
function baseName(rel) {
  const s = String(rel || '')
  const k = s.lastIndexOf('/')
  return k >= 0 ? s.slice(k + 1) : s
}
function fileInitial(rel) {
  const s = String(rel || '')
  const k = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  const name = k >= 0 ? s.slice(k + 1) : s
  return name.slice(0, 2).toUpperCase() || '?'
}
/** 组内除「体积最大那份」以外的字节合计 = 这一组最大可省 */
function savingOf(g) {
  if (!g || !g.length) return 0
  let max = 0
  let sum = 0
  for (const m of g) {
    const b = Number(m.bytes) || 0
    sum += b
    if (b > max) max = b
  }
  return sum - max
}

async function loadStatus() {
  try {
    const res = await nearDuplicateStatus()
    status.total = (res && res.total) || 0
    status.hashed = (res && res.hashed) || 0
    status.remaining = (res && res.remaining) || 0
  } catch (e) {
    // 状态失败不阻塞列表
  }
}

async function load() {
  loading.value = true
  picked.value = {}
  try {
    const res = await listNearDuplicates({ threshold: threshold.value, mode: mode.value, page: page.value, size: size.value })
    rows.value = (res && res.rows) || []
    total.value = (res && res.total) || 0
    photoCount.value = rows.value.reduce((s, g) => s + g.length, 0)
    const next = {}
    rows.value.forEach((g, gi) => {
      // 默认选中体积最大的那份（后端已按字节降序排好）
      if (g.length) next[gi] = g[0].id
    })
    picked.value = next
  } catch (e) {
    rows.value = []
    total.value = 0
    proxy.$modal.msgError('读取相似组失败：' + errText(e))
  } finally {
    loading.value = false
  }
}

function onThreshold() {
  page.value = 1
  load()
}

function onModeChange() {
  page.value = 1
  load()
}

/** 增量算指纹：循环调用直到 remaining=0（后端每次最多 400 张，避免 HTTP 超时） */
async function buildPhash() {
  building.value = true
  try {
    for (let i = 0; i < 40; i += 1) {
      const res = await buildNearDuplicate({ limit: 400 })
      status.total = (res && res.total) || 0
      status.hashed = (res && res.hashed) || 0
      status.remaining = (res && res.remaining) || 0
      if (!status.remaining) break
    }
    proxy.$modal.msgSuccess('指纹已补齐：' + status.hashed + ' / ' + status.total)
    await load()
  } catch (e) {
    proxy.$modal.msgError('算指纹失败：' + errText(e))
  } finally {
    building.value = false
  }
}

async function removeOne(m) {
  try {
    await proxy.$modal.confirm('清理这一份：文件移入回收站，连同记录一起删除（可恢复）。确认？')
  } catch (e) {
    return
  }
  busyId.value = m.id
  try {
    const res = await removeMainDuplicate(m.id)
    proxy.$modal.msgSuccess(res && res.trashed ? '已清理：文件移入回收站' : '已清理：记录已删（文件本就不在磁盘上）')
  } catch (e) {
    const text = errText(e)
    // 那一行已经被删掉了（别处清过 / 上一次其实成功）：不是错误，刷新即可
    if (text.indexOf('照片不存在') > -1 || text.indexOf('可能已被删除') > -1) {
      proxy.$modal.msgWarning('这一份已经不在了，已刷新列表')
    } else {
      proxy.$modal.msgError('清理失败：' + text)
    }
  } finally {
    busyId.value = null
    await load()
    await loadStatus()
  }
}

async function keepGroup(g, gi) {
  const keepId = picked.value[gi]
  if (!keepId) return
  const ids = g.map((m) => m.id)
  const removing = ids.filter((id) => id !== keepId)
  // 一次确认，不是每张一次
  try {
    await proxy.$modal.confirm(
      '本组保留 1 张，清理 ' + removing.length + ' 张（合计 ' + bytesText(savingOf(g)) + '）。\n'
      + '全部移入回收站，可恢复。确认？'
    )
  } catch (e) {
    return
  }
  busy.value = g.groupKey
  try {
    const res = await keepNearDuplicates({ keepId, memberIds: ids })
    proxy.$modal.msgSuccess('已清理 ' + ((res && res.removed) || 0) + ' 张')
    await load()
    await loadStatus()
  } catch (e) {
    proxy.$modal.msgError('清理失败：' + errText(e))
  } finally {
    busy.value = ''
  }
}

/** groupKeys=null 表示该阈值下全部分组；一次确认，不是每组一次 */
async function cleanGroups(groupKeys, label) {
  const scope = groupKeys ? label : label
  try {
    await proxy.$modal.confirm(
      scope + '：每组只保留 ' + (keepRule.value === 'largest' ? '体积最大的' : '最早进库的') + ' 一份，其余全部清理。\n'
      + '文件移入回收站，可恢复。这一步会动 ' + scope + '，确认？'
    )
  } catch (e) {
    return
  }
  try {
    const res = await cleanNearDuplicates({
      threshold: threshold.value,
      keepRule: keepRule.value,
      mode: mode.value,
      groupKeys
    })
    proxy.$modal.msgSuccess('处理 ' + ((res && res.groups) || 0) + ' 组，清理 ' + ((res && res.removed) || 0) + ' 张')
    if (res && res.failed && res.failed.length) {
      const gone = res.failed.filter((f) => String(f.reason || '').indexOf('照片不存在') > -1)
      const real = res.failed.filter((f) => String(f.reason || '').indexOf('照片不存在') === -1)
      if (gone.length) {
        proxy.$modal.msgWarning(gone.length + ' 张已经不在了（别处清过），已跳过')
      }
      if (real.length) {
        proxy.$modal.msgError(real.length + ' 张没清掉：' + errText({ message: JSON.stringify(real[0]) }))
        console.warn('清理失败明细', real)
      }
    }
    await load()
    await loadStatus()
  } catch (e) {
    proxy.$modal.msgError('批量清理失败：' + errText(e))
  }
}

onMounted(async () => {
  await loadStatus()
  await load()
})
</script>

<style scoped>
.near-tip { margin-bottom: 10px; }
.near-tip p { margin: 4px 0; line-height: 1.7; }
.near-warn { color: var(--el-color-warning); }
.near-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.near-label { font-size: 12px; color: var(--el-text-color-secondary); }
.near-spacer { flex: 1; }
.near-stat { font-size: 12px; color: var(--el-text-color-secondary); }
.near-card { margin-bottom: 12px; }
.near-head { display: flex; align-items: center; gap: 8px; }
.near-copies { font-size: 13px; }
/* P6.77.2：竖版卡片——图片占满宽度（240px 高），文字压在下面，别再挤在 96px 的小图里 */
.near-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.near-item {
  display: flex; flex-direction: column; height: 100%;
  border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden;
  background: var(--el-bg-color); transition: border-color 0.15s, box-shadow 0.15s;
}
.near-item:hover { border-color: var(--el-color-primary-light-5); box-shadow: var(--el-box-shadow-light); }
.near-item.is-picked { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary) inset; }
/* 组内换册处留一道间隔：同册的连续排在一起，一眼看出"是不是两本册里各有一张" */
.near-item.is-album-start { margin-left: 14px; position: relative; }
.near-item.is-album-start::before {
  content: ''; position: absolute; left: -8px; top: 8px; bottom: 8px; width: 1px;
  background: var(--el-border-color);
}
.near-thumb { width: 100%; height: 240px; background: var(--el-fill-color-light); cursor: zoom-in; }
.near-ph {
  display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
  font-size: 13px; color: var(--el-text-color-secondary);
}
.near-meta { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 4px; }
.near-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.near-seq { font-weight: 400; color: var(--el-text-color-secondary); }
.near-sub { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-text-color-secondary); }
.near-size { flex: none; }
.near-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.near-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px; }
</style>
