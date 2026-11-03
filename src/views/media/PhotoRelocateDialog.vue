<template>
  <!-- 按图改归属（P6.234 拆分）：移到另一本册 / 从当前册拆出一本新册。
       文件不动，只改库里归属并打 album_pinned（以后扫描不会按目录拽回）。
       组件自读自写，页面通过 ref.open(mode, ids, albumId) 打开，成功后 emit('done')。 -->
  <el-dialog
    :model-value="modelValue"
    :title="mode === 'split' ? '拆出新册' : '移到另一册'"
    width="min(560px, 92vw)"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <p class="album-merge-tip">
      把选中的 {{ ids.length }} 张改成<b>人工归属</b>：只改库里的归属，
      不动磁盘文件，<b>以后扫描不会再按目录把它们拽回去</b>。
    </p>

    <el-input v-if="mode === 'split'" v-model="title" maxlength="300" show-word-limit
      placeholder="新册标题（例如：马吉 · 精选）" data-testid="photo-split-title" />

    <el-select v-else v-model="target" filterable remote clearable placeholder="搜索目标相册（标题/目录）"
      :remote-method="searchTargets" :loading="loading" style="width: 100%"
      data-testid="photo-move-target" @change="onTargetChange">
      <el-option v-for="a in options" :key="a.id"
        :label="(a.title || a.id) + '（' + (a.photoCount || 0) + ' 张）'" :value="a.id">
        <div class="album-opt">
          <img class="album-opt-cover" :src="mediaSrc(albumThumb(a))" loading="lazy" alt="" @error="hideBrokenCover" />
          <span class="album-opt-title">{{ a.title || a.id }}</span>
          <span class="album-opt-count">{{ a.photoCount || 0 }} 张</span>
        </div>
      </el-option>
    </el-select>

    <!-- P6.249：原来只取前 30 本、没有翻页也没有提示，册一多就「找不到目标册」。
         现在按张数倒序取第一页，并给出「已显示 X / Y 本 + 加载更多」。 -->
    <div v-if="mode === 'move'" class="relocate-more">
      <span>按张数倒序 · 已显示 {{ options.length }} / {{ total }} 本</span>
      <el-button v-if="options.length < total" link type="primary" size="small"
        :loading="loading" data-testid="relocate-more" @click="loadMore">加载更多</el-button>
      <span v-else-if="total > 0" class="relocate-more-done">已全部加载</span>
    </div>

    <div v-if="mode === 'move' && preview.duplicates" class="relocate-dup">
      <el-alert type="warning" :closable="false" show-icon
        :title="'目标册已有同内容：选中的 ' + preview.moving + ' 张里有 ' + preview.duplicates + ' 张重复'">
        <template #default>
          <p>
            全库共 {{ preview.globalCopies }} 处同内容。一张照片只属于一个系列，
            所以同一本册里出现两份相同的图就是重复文件。
          </p>
        </template>
      </el-alert>
      <el-radio-group v-model="dupPolicy" class="relocate-dup-group">
        <el-radio value="skip">跳过重复（重复的那几张不搬）</el-radio>
        <el-radio value="keep">同时存在（都留着，之后在重复文件页处理）</el-radio>
        <el-radio value="replace">只保留一份（目标册里旧的那份文件移入回收站）</el-radio>
      </el-radio-group>
    </div>

    <p class="album-merge-preview" v-if="mode === 'split'">
      新册没有目录（不进目录册体系），扫描不会认领也不会当空壳清理；
      封面留空，审核状态默认「待审核」，要上站请先在审核页通过。
    </p>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="busy"
        :disabled="mode === 'split' ? !title.trim() : !target"
        data-testid="photo-relocate-submit" @click="submit">
        {{ mode === 'split' ? '确认拆出' : '确认移动' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { listAlbums, previewPhotoMove, moveAlbumPhotos, splitAlbumPhotos } from '@/api/media'
import { errorText } from '@/utils/errorText'
import { mediaSrc } from './mediaFormat'

defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'done'])

const { proxy } = getCurrentInstance()

const mode = ref('move')
const ids = ref([])
const albumId = ref('')
const target = ref('')
const title = ref('')
const options = ref([])
const loading = ref(false)
const busy = ref(false)
const preview = ref({ moving: 0, duplicates: 0, globalCopies: 0, targetCopies: 0 })
const dupPolicy = ref('keep')

function albumThumb(row) {
  return (row && (row.cover || row.thumbUrl)) || ''
}

function hideBrokenCover(e) {
  if (e && e.target) e.target.style.visibility = 'hidden'
}

/** 页面调用入口：open(mode, photoIds, currentAlbumId) */
function open(nextMode, photoIds, currentAlbumId) {
  const list = (photoIds || []).slice()
  if (!list.length) return
  mode.value = nextMode === 'split' ? 'split' : 'move'
  ids.value = list
  albumId.value = currentAlbumId || ''
  target.value = ''
  title.value = ''
  options.value = []
  preview.value = { moving: 0, duplicates: 0, globalCopies: 0, targetCopies: 0 }
  dupPolicy.value = 'keep'
  emit('update:modelValue', true)
  if (mode.value === 'move') searchTargets('')
}

const PAGE_SIZE = 50
const page = ref(1)
const total = ref(0)
const keyword = ref('')

/* 拉一页目标册；append=true 时接着上一页往下堆 */
async function fetchTargets(append) {
  loading.value = true
  try {
    /* 按张数倒序：目标册通常是“量大的那几本”，比默认顺序好找得多 */
    const res = await listAlbums({
      keyword: keyword.value || '', pageNum: page.value, pageSize: PAGE_SIZE,
      hidden: 'all', sort: 'photoCount-desc'
    })
    const selfId = albumId.value
    const rows = ((res && res.rows) || []).filter(a => String(a.id) !== String(selfId))
    total.value = Number((res && res.total) || rows.length)
    options.value = append ? options.value.concat(rows) : rows
  } catch (e) {
    if (!append) options.value = []
  } finally {
    loading.value = false
  }
}

/** 搜索框的 remote-method：换了关键字就从第一页重来 */
function searchTargets(kw) {
  keyword.value = kw || ''
  page.value = 1
  return fetchTargets(false)
}

function loadMore() {
  if (options.value.length >= total.value) return
  page.value += 1
  return fetchTargets(true)
}

/** 选中目标册后立刻预检：目标册里有几张同内容（决定要不要弹三选一） */
async function onTargetChange(value) {
  preview.value = { moving: 0, duplicates: 0, globalCopies: 0, targetCopies: 0 }
  if (!value || !ids.value.length) return
  try {
    const res = await previewPhotoMove(ids.value.slice(), value)
    preview.value = {
      moving: (res && res.moving) || 0,
      duplicates: (res && res.duplicates) || 0,
      globalCopies: (res && res.globalCopies) || 0,
      targetCopies: (res && res.targetCopies) || 0
    }
  } catch (e) {
    preview.value = { moving: 0, duplicates: 0, globalCopies: 0, targetCopies: 0 }
  }
}

async function submit() {
  const selected = ids.value.slice()
  if (!selected.length) return
  busy.value = true
  try {
    const res = mode.value === 'split'
      ? await splitAlbumPhotos(selected, title.value.trim())
      : await moveAlbumPhotos(selected, target.value, dupPolicy.value)
    const moved = (res && res.moved) || 0
    const skipped = (res && res.skipped) || 0
    const replaced = (res && res.replaced) || 0
    const total = selected.length
    let msg
    if (mode.value === 'split') {
      msg = '已拆出新册：搬入 ' + moved + ' 张（人工归属，重扫不会再拽回）'
    } else if (moved === 0 && skipped > 0) {
      msg = '没有搬动：选中 ' + total + ' 张，' + skipped + ' 张在目标册里都有同内容，已按「跳过重复」跳过'
    } else if (skipped > 0) {
      msg = '选中 ' + total + ' 张：搬移 ' + moved + ' 张、跳过重复 ' + skipped + ' 张'
        + '（跳过的是目标册里已有同内容的）'
    } else {
      msg = '已移动：' + moved + ' 张（人工归属，重扫不会再拽回）'
    }
    if (replaced > 0) msg += '；目标册里旧的那份已进回收站 ' + replaced + ' 份'
    proxy.$modal.msgSuccess(msg)
    emit('update:modelValue', false)
    emit('done')
  } catch (e) {
    proxy.$modal.msgError('改归属失败：' + (errorText(e) || (e && e.message) || '请求失败'))
  } finally {
    busy.value = false
  }
}

defineExpose({ open })
</script>

<style scoped>
.album-merge-tip { margin: 0 0 10px; font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); }
.album-merge-preview { margin: 10px 0 0; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
.relocate-dup { margin-top: 12px; }
.relocate-dup-group { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.relocate-more { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; color: var(--el-text-color-secondary); }
.relocate-more-done { color: var(--el-text-color-placeholder); }
.album-opt { display: flex; align-items: center; gap: 8px; }
.album-opt-cover { width: 28px; height: 28px; border-radius: 4px; object-fit: cover; }
.album-opt-title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-opt-count { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
