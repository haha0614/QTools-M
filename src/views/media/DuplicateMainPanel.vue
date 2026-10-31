<template>
  <div class="dup-main">
    <el-alert type="info" :closable="false" show-icon class="dup-main-tip"
      title="一张照片只属于一个册，所以同一份内容出现在库里两次以上就是重复文件——不管它们在哪本册里。">
      <template #default>
        <p>
          按内容哈希（<code>content_hash</code>）分组，组内每一份都是**平级的主行**（没有主/副之分）。
          清理一律「文件移入回收站 + 删行 + 重算所属册」，不提供「只删行」：文件还在媒体根里时删行，
          下一轮扫描会原地复活。
        </p>
      </template>
    </el-alert>

    <div class="dup-main-bar">
      <span class="dup-main-count" v-if="total">共 {{ total }} 组同内容</span>
      <span class="dup-main-count" v-else-if="!loading">没有发现同内容多份</span>
      <el-button size="small" :loading="loading" data-testid="dup-main-refresh" @click="load">刷新</el-button>
    </div>

    <div v-loading="loading" class="dup-main-body">
      <el-card v-for="(g, gi) in rows" :key="g.contentHash" shadow="never" class="dup-main-card">
        <template #header>
          <div class="dup-main-head">
            <span class="dup-main-hash" :title="g.contentHash">哈希 {{ shortHash(g.contentHash) }}</span>
            <span class="dup-main-copies">共 <b>{{ g.copies }}</b> 份 · 可省 {{ bytesText(g.totalBytes) }}</span>
            <span class="dup-main-spacer"></span>
            <el-button size="small" type="primary" plain :loading="busy === g.contentHash"
              :disabled="!picked[gi]" data-testid="dup-main-keep"
              v-hasPermi="['media:admin:edit']" @click="askKeep(g, gi)">
              保留选中的，其余清理
            </el-button>
          </div>
        </template>

        <!-- 并列显示：组内每一份同等大小，谁都不是「主文件」 -->
        <el-radio-group v-model="picked[gi]" class="dup-main-list">
          <div v-for="m in g.members" :key="m.id" class="dup-main-item"
            :class="{ 'is-picked': picked[gi] === m.id }">
            <el-image class="dup-main-thumb" fit="cover" :src="thumbSrc(m)"
              :preview-src-list="[bigSrc(m)]" :initial-index="0" hide-on-click-modal teleported>
              <template #error>
                <span class="dup-main-ph">{{ fileInitial(m.relPath) }}</span>
              </template>
            </el-image>
            <div class="dup-main-meta">
              <div class="dup-main-album" :title="m.albumTitle || m.albumId">
                {{ m.albumTitle || m.albumId }} <span class="dup-main-seq">#{{ m.seq }}</span>
              </div>
              <div class="dup-main-path" :title="m.relPath">{{ m.relPath }}</div>
              <div class="dup-main-size">
                {{ bytesText(m.size) }}
                <el-tag v-if="m.pinned" size="small" type="warning" class="dup-main-tag">人工归属</el-tag>
                <el-tag v-if="m.missing" size="small" type="danger" class="dup-main-tag">文件缺失</el-tag>
              </div>
              <div class="dup-main-actions">
                <el-radio :value="m.id" class="dup-main-radio">保留这份</el-radio>
                <el-button link type="danger" size="small" :loading="busyId === m.id"
                  data-testid="dup-main-remove" v-hasPermi="['media:admin:edit']"
                  @click.stop.prevent="askRemove(m)">清理这份</el-button>
              </div>
            </div>
          </div>
        </el-radio-group>
      </el-card>

      <el-empty v-if="!loading && !rows.length" description="没有同内容多份的照片" />
      <pagination v-show="total > 0" :page-sizes="[5, 10, 20]" :total="total"
        v-model:page="page" v-model:limit="size" @pagination="load" />
    </div>
  </div>
</template>

<script setup name="DuplicateMainPanel">
import { getCurrentInstance, onMounted, ref } from 'vue'
import { listMainDuplicates, removeMainDuplicate, keepMainDuplicate } from '@/api/media'

const { proxy } = getCurrentInstance()
const BASE_API = (import.meta.env && import.meta.env.VITE_APP_BASE_API) || ''

const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(5)
const loading = ref(false)
/** 每组选中的「保留」成员：{ [组下标]: memberId } */
const picked = ref({})
const busy = ref('')
const busyId = ref(null)

/** 后端错误体是 {"error":"..."}，axios 的 e.message 只有「Request failed with status code 500」，要把真话取出来 */
function errText(e) {
  const data = e && e.response && e.response.data
  if (data && typeof data === 'object') return data.error || data.msg || ''
  return ''
}

function shortHash(h) {
  return String(h || '').slice(0, 8)
}

function bytesText(n) {
  const v = Number(n) || 0
  if (v >= 1024 * 1024 * 1024) return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
  if (v >= 1024) return (v / 1024).toFixed(0) + ' KB'
  return v + ' B'
}

/** 缩略图与老「副本路径」面板同口径：内容寻址 /api/media/thumb/p/<content_hash> */
function thumbSrc(m) {
  const hash = String((m && (m.contentHash || m.hash)) || '').trim()
  if (!hash) return ''
  return BASE_API + '/api/media/thumb/p/' + encodeURIComponent(hash)
}

/** 原图（点缩略图放大用）：按路径取，不走内容寻址 */
function bigSrc(m) {
  const rel = m && m.relPath
  return rel ? BASE_API + '/api/media/file?p=' + encodeURIComponent(rel) : thumbSrc(m)
}

function fileInitial(relPath) {
  const base = String(relPath || '').split(/[\\/]/).filter(Boolean).pop() || ''
  const hit = base.match(/[\p{L}\p{N}]/u)
  return (hit ? hit[0] : base.slice(0, 1) || '?').toUpperCase()
}

async function load() {
  loading.value = true
  try {
    const res = await listMainDuplicates({ kind: 'photo', page: page.value, size: size.value })
    rows.value = (res && res.rows) || []
    total.value = (res && res.total) || 0
    // 每组默认选中第一份（按 album_id, seq 排序后的第一条），用户可改
    const next = {}
    rows.value.forEach((g, i) => {
      if (g.members && g.members.length) next[i] = g.members[0].id
    })
    picked.value = next
  } catch (e) {
    rows.value = []
    total.value = 0
    proxy.$modal.msgError('读取同内容多份失败：' + (errText(e) || (e && e.message) || '请求失败'))
  } finally {
    loading.value = false
  }
}

async function askRemove(row) {
  let ok = true
  try {
    await proxy.$modal.confirm(
      '把这一份的文件移入回收站并删除记录？\n\n册：' + (row.albumTitle || row.albumId)
      + '  #' + row.seq + '\n路径：' + row.relPath
      + '\n\n文件会进 _媒体站/trash（可恢复），不会被重新扫描到。'
    )
  } catch (e) {
    ok = false
  }
  if (!ok) return
  busyId.value = row.id
  try {
    const res = await removeMainDuplicate(row.id)
    proxy.$modal.msgSuccess(res && res.trashed ? '已清理：文件移入回收站' : '已清理：记录已删（文件本就不在磁盘上）')
    await load()
  } catch (e) {
    proxy.$modal.msgError('清理失败：' + (errText(e) || (e && e.message) || '请求失败'))
  } finally {
    busyId.value = null
  }
}

async function askKeep(group, gi) {
  const keepId = picked.value[gi]
  if (!keepId) {
    proxy.$modal.msgWarning('先在组内选一份要保留的')
    return
  }
  const others = (group.members || []).filter((m) => m.id !== keepId)
  let ok = true
  try {
    await proxy.$modal.confirm(
      '保留选中的那一份，其余 ' + others.length + ' 份全部清理？\n\n'
      + others.map((m) => '· ' + (m.albumTitle || m.albumId) + ' #' + m.seq + '  ' + m.relPath).join('\n')
      + '\n\n这些文件会进回收站（可恢复）。'
    )
  } catch (e) {
    ok = false
  }
  if (!ok) return
  busy.value = group.contentHash
  try {
    const res = await keepMainDuplicate(group.contentHash, keepId)
    const removed = (res && res.removed) || []
    const failed = (res && res.failed) || []
    proxy.$modal.msgSuccess('已保留 1 份，清理 ' + removed.length + ' 份'
      + (failed.length ? '，失败 ' + failed.length + ' 份' : ''))
    await load()
  } catch (e) {
    proxy.$modal.msgError('清理失败：' + (errText(e) || (e && e.message) || '请求失败'))
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.dup-main-tip { margin-bottom: 12px; }
.dup-main-tip p { margin: 6px 0 0; line-height: 1.7; }
.dup-main-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.dup-main-count { font-size: 13px; color: var(--el-text-color-secondary); }
.dup-main-body { min-height: 200px; }
.dup-main-card { margin-bottom: 14px; }
.dup-main-head { display: flex; align-items: center; gap: 10px; }
.dup-main-hash { font-family: var(--el-font-family-monospace, monospace); font-size: 13px; }
.dup-main-copies { font-size: 13px; color: var(--el-text-color-secondary); }
.dup-main-spacer { flex: 1; }

/* 并列：组内每一份同等大小，横排、可换行 */
.dup-main-list { display: flex; flex-wrap: wrap; gap: 12px; width: 100%; align-items: stretch; }
.dup-main-item {
  flex: 1 1 240px;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
  background: var(--el-bg-color);
}
.dup-main-item.is-picked { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary) inset; }
.dup-main-thumb { width: 100%; height: 150px; background: var(--el-fill-color-light); }
.dup-main-ph {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; font-size: 28px; color: var(--el-text-color-secondary);
}
.dup-main-meta { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 4px; }
.dup-main-album { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dup-main-seq { color: var(--el-text-color-secondary); font-weight: 400; font-size: 12px; }
.dup-main-path {
  font-size: 12px; color: var(--el-text-color-regular);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dup-main-size { font-size: 12px; color: var(--el-text-color-secondary); display: flex; align-items: center; gap: 6px; }
.dup-main-tag { transform: scale(0.9); }
.dup-main-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.dup-main-radio :deep(.el-radio__label) { font-size: 12px; padding-left: 6px; }
</style>
