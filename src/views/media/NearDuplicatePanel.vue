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
          <div v-for="m in g" :key="m.id" class="near-item" :class="{ 'is-picked': picked[gi] === m.id }">
            <el-image class="near-thumb" fit="contain" :src="thumbSrc(m)"
              :preview-src-list="[bigSrc(m)]" :initial-index="0" hide-on-click-modal teleported>
              <template #error><span class="near-ph">{{ fileInitial(m.relPath) }}</span></template>
            </el-image>
            <div class="near-meta">
              <div class="near-album" :title="m.albumTitle || m.albumId">
                {{ m.albumTitle || m.albumId }} <span class="near-seq">#{{ m.seq }}</span>
              </div>
              <div class="near-path" :title="m.relPath">{{ m.relPath }}</div>
              <div class="near-size">{{ bytesText(m.bytes) }}</div>
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
function bigSrc(m) {
  if (!m) return ''
  const p = m.preview || m.thumb
  return p ? BASE_API + p : ''
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
    const res = await listNearDuplicates({ threshold: threshold.value, page: page.value, size: size.value })
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
    await load()
    await loadStatus()
  } catch (e) {
    proxy.$modal.msgError('清理失败：' + errText(e))
  } finally {
    busyId.value = null
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
      groupKeys
    })
    proxy.$modal.msgSuccess('处理 ' + ((res && res.groups) || 0) + ' 组，清理 ' + ((res && res.removed) || 0) + ' 张')
    if (res && res.failed && res.failed.length) {
      proxy.$modal.msgWarning('有 ' + res.failed.length + ' 张没清掉，见控制台')
      console.warn('清理失败明细', res.failed)
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
.near-list { display: flex; flex-wrap: wrap; gap: 12px; }
.near-item { display: flex; gap: 10px; width: 340px; padding: 8px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.near-item.is-picked { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.near-thumb { width: 96px; height: 120px; flex: none; background: var(--el-fill-color-light); }
.near-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; font-size: 12px; color: var(--el-text-color-secondary); }
.near-meta { min-width: 0; flex: 1; }
.near-album { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.near-seq { font-weight: 400; color: var(--el-text-color-secondary); }
.near-path { font-size: 12px; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.near-size { font-size: 12px; color: var(--el-text-color-secondary); }
.near-actions { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
</style>
