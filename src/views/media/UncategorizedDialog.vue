<template>
  <!-- 未归类照片（P6.222 拆分）：规则模式下扫描不再按目录建册，新目录的照片都停在这里。
       组件自读自写（列表 / 目录汇总 / 建册并入），页面只保留开关与"移到另一册"的跳转。 -->
  <el-dialog
    :model-value="modelValue"
    title="未归类照片"
    width="min(1120px, 96vw)"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
    @open="onOpen"
  >
    <div class="uncat-bar">
      <span class="uncat-count">共 {{ total }} 张 · 站端不展示 · 以后可以再移进别的册</span>
      <el-button size="small" :loading="loading" data-testid="uncat-refresh" @click="loadUncat">刷新</el-button>
      <span v-if="selected.length" class="uncat-picked">已选 {{ selected.length }} 张</span>
      <el-button v-if="selected.length" size="small" type="primary" v-hasPermi="['media:admin:edit']"
        data-testid="uncat-claim-picked" @click="claimPicked">建册并入（勾选的 {{ selected.length }} 张）</el-button>
      <!-- P6.247：勾选后只能「建册并入」（新建一本），没有「移进已有册」的入口 —— 用户实测提出。
           这里补一个，与卡片上的「移入另一册…」走同一个弹窗。 -->
      <el-button v-if="selected.length" size="small" plain v-hasPermi="['media:admin:edit']"
        data-testid="uncat-move-picked" @click="emit('relocateIds', selected.slice())">移入已有册（{{ selected.length }} 张）</el-button>
      <el-button v-if="selected.length" size="small" text @click="selected = []">清空选择</el-button>
    </div>

    <div v-if="dirs.length" class="uncat-dirs">
      <div class="uncat-dirs-head">
        <!-- P6.258：规则会改变以后扫描的行为，给一个开关；默认仍然建（保持原行为） -->
        按目录归册
        <el-checkbox v-model="createRule" size="small" class="uncat-rule-check" data-testid="uncat-create-rule">
          同时建归属规则（之后同目录新文件自动归到这里）
        </el-checkbox>
      </div>
      <div v-for="d in dirs" :key="d.dir" class="uncat-dir-row">
        <span class="uncat-dir-name" :title="d.dir || '（媒体根）'">{{ d.dir || '（媒体根）' }}</span>
        <span class="uncat-dir-count">{{ d.photos }} 张 · {{ formatVolume(d.bytes) }}</span>
        <el-tag v-if="d.ruleCount" size="small" type="info">已有 {{ d.ruleCount }} 条规则</el-tag>
        <span class="uncat-spacer"></span>
        <el-button size="small" type="primary" plain :loading="claiming === d.dir"
          v-hasPermi="['media:admin:edit']" data-testid="uncat-claim" @click="claimDir(d)">建册并入</el-button>
      </div>
    </div>

    <div v-loading="loading" class="uncat-grid">
      <div v-for="p in rows" :key="p.id" class="uncat-card" :class="{ 'is-picked': isPicked(p.id) }">
        <span class="uncat-check" :title="isPicked(p.id) ? '取消勾选' : '勾选这一张'"
          data-testid="uncat-check" @click.stop="togglePick(p.id)">{{ isPicked(p.id) ? '✓' : '' }}</span>
        <!-- P6.248：点图改用页面统一的大图查看框（PhotoPreviewDialog），
             不再用 el-image 自带的全屏查看器 —— 那套没有标题/明细、样式也与其它地方不一致。 -->
        <el-image class="uncat-thumb" fit="cover" :src="thumbSrcOf(p)" @click="openBig(p)">
          <template #error><span class="uncat-ph">{{ photoFileName(p.relPath).slice(0, 1) }}</span></template>
        </el-image>
        <div class="uncat-name" :title="p.relPath">{{ photoFileName(p.relPath) }}</div>
        <div class="uncat-actions">
          <el-button size="small" plain icon="FolderOpened" v-hasPermi="['media:admin:edit']"
            data-testid="uncat-move" @click="emit('relocate', p)">移入另一册…</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && !rows.length" description="没有未归类照片" />

    <!-- 大图查看框：与媒体库共用同一个组件 -->
    <photo-preview-dialog v-model="bigVisible" :title="bigTitle" :src="bigSrc" :fallback="thumbSrcOf(currentRow || {})"
      :meta="bigMeta" />
    <pagination v-show="total > 0" :page-sizes="[24, 48, 96]" :total="total"
      v-model:page="page" v-model:limit="pageSize" @pagination="loadUncat" />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { listUncategorizedPhotos, listUncategorizedDirs, splitAlbumPhotos, claimUncategorizedDir } from '@/api/media'
import { errorText } from '@/utils/errorText'
import { formatVolume, photoFileName, mediaSrc } from './mediaFormat'
import PhotoPreviewDialog from './PhotoPreviewDialog.vue'

/* 供大图查看框兜底用：当前打开的那一行（找不到就返回 null，组件里会退回空缩略图） */
const currentRow = computed(() => {
  const hit = (rows.value || []).find(x => x && mediaSrc(bigSrcOf(x)) === bigSrc.value)
  return hit || null
})

defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'relocate', 'relocateIds', 'changed'])

const { proxy } = getCurrentInstance()

const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(48)
const loading = ref(false)
const dirs = ref([])
const claiming = ref('')
const createRule = ref(true)
const selected = ref([])

/* 缩略图：优先用内容寻址的缩略产物，没有就退回原图（避免整格空白） */
function thumbSrcOf(p) {
  if (p && p.thumbUrl) return mediaSrc(p.thumbUrl)
  if (p && p.relPath) return mediaSrc('/api/media/file?p=' + encodeURIComponent(p.relPath))
  return ''
}

/* 大图：一律走原图接口 —— 未归类照片通常没有 preview 产物，用它必然 404 */
function bigSrcOf(p) {
  if (p && p.relPath) return mediaSrc('/api/media/file?p=' + encodeURIComponent(p.relPath))
  return thumbSrcOf(p)
}

/* 大图查看框（与相册/视频封面同一套）：标题取文件名，明细给相对路径与体积 */
const bigVisible = ref(false)
const bigTitle = ref('')
const bigSrc = ref('')
const bigMeta = ref('')

function openBig(p) {
  if (!p) return
  bigTitle.value = photoFileName(p.relPath)
  bigSrc.value = bigSrcOf(p)
  bigMeta.value = [p.relPath, p.bytes ? formatVolume(p.bytes) : ''].filter(Boolean).join(' · ')
  bigVisible.value = true
}

function isPicked(id) {
  return selected.value.indexOf(String(id)) > -1
}

function togglePick(id) {
  const key = String(id)
  selected.value = isPicked(key)
    ? selected.value.filter(x => x !== key)
    : selected.value.concat([key])
}

function onOpen() {
  page.value = 1
  loadUncat()
  loadDirs()
}

async function loadDirs() {
  try {
    const res = await listUncategorizedDirs()
    dirs.value = Array.isArray(res) ? res : ((res && res.rows) || [])
  } catch (e) {
    dirs.value = []
  }
}

async function loadUncat() {
  loading.value = true
  selected.value = []
  try {
    const res = await listUncategorizedPhotos({ page: page.value, size: pageSize.value })
    rows.value = (res && res.rows) || []
    total.value = (res && res.total) || 0
  } catch (e) {
    rows.value = []
    total.value = 0
    proxy.$modal.msgError('读取未归类照片失败：' + (errorText(e) || (e && e.message) || '请求失败'))
  } finally {
    loading.value = false
  }
}

/** 勾选的几张 → 建一本新册并入（不落规则：人工挑的不代表整个目录） */
async function claimPicked() {
  const ids = selected.value.slice()
  if (!ids.length) return
  let title
  try {
    const r = await proxy.$prompt('把这 ' + ids.length + ' 张放进一本新册，标题：', '建册并入', {
      confirmButtonText: '建册并入',
      cancelButtonText: '取消',
      inputValue: '未命名册',
      inputValidator: v => (v && v.trim() ? true : '标题不能为空')
    })
    title = (r && r.value ? r.value : '').trim()
  } catch (e) {
    return
  }
  if (!title) return
  try {
    const res = await splitAlbumPhotos(ids, title)
    const moved = (res && (res.moved != null ? res.moved : res.count)) || ids.length
    proxy.$modal.msgSuccess('已建册「' + title + '」并入 ' + moved + ' 张')
    selected.value = []
    emit('changed')
    await loadUncat()
    await loadDirs()
  } catch (e) {
    proxy.$modal.msgError('建册失败：' + errorText(e))
  }
}

/** 一键：按目录建册 + 建规则 + 把该目录未归类照片移进去 */
async function claimDir(d) {
  const dir = d && d.dir ? String(d.dir) : ''
  const parts = dir.split('/')
  const guess = parts.length && parts[parts.length - 1] ? parts[parts.length - 1] : '未命名册'
  let title
  try {
    const ruleHint = createRule.value ? '，并自动建一条归属规则' : '（不建归属规则）'
    const r = await proxy.$prompt('新册标题（该目录下 ' + d.photos + ' 张会移进去' + ruleHint + '）', '按目录建册', {
      confirmButtonText: '建册并入',
      cancelButtonText: '取消',
      inputValue: guess,
      inputValidator: v => (v && v.trim() ? true : '标题不能为空')
    })
    title = (r && r.value ? r.value : '').trim()
  } catch (e) {
    return
  }
  if (!title) return
  claiming.value = dir
  try {
    const res = await claimUncategorizedDir({ dir, title, createRule: createRule.value })
    const ruleTip = createRule.value ? '；同目录以后的扫描会自动归到这里' : '（未建规则：以后同目录新文件不会自动认领）'
    proxy.$modal.msgSuccess('已建册「' + ((res && res.title) || title) + '」，移入 '
      + ((res && res.moved) || 0) + ' 张' + ruleTip)
    emit('changed')
    await loadUncat()
    await loadDirs()
  } catch (e) {
    proxy.$modal.msgError('建册失败：' + errorText(e))
  } finally {
    claiming.value = ''
  }
}

defineExpose({ loadUncat })
</script>

<style scoped>
.uncat-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.uncat-count { font-size: 13px; color: var(--el-text-color-secondary); }
.uncat-grid { display: flex; flex-wrap: wrap; gap: 12px; min-height: 160px; }
.uncat-picked { font-size: 12px; color: var(--el-color-primary); }
.uncat-card { position: relative; }
.uncat-card.is-picked { outline: 2px solid var(--el-color-primary); border-radius: 6px; }
.uncat-check {
  position: absolute; right: 6px; top: 6px; z-index: 2;
  width: 20px; height: 20px; line-height: 20px; text-align: center;
  border-radius: 50%; background: rgba(255, 255, 255, .86);
  border: 1px solid var(--el-border-color); cursor: pointer; font-size: 12px;
}
.uncat-card.is-picked .uncat-check { background: var(--el-color-primary); color: #fff; }
.uncat-dirs { margin-bottom: 10px; padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-fill-color-lighter); }
.uncat-dirs-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.uncat-rule-check { font-size: 12px; }
.uncat-dir-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-top: 1px dashed var(--el-border-color-lighter); }
.uncat-dir-name { font-size: 13px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uncat-dir-count { font-size: 12px; color: var(--el-text-color-secondary); }
.uncat-spacer { flex: 1; }
.uncat-thumb { width: 108px; height: 108px; display: block; border-radius: 6px; overflow: hidden; }
.uncat-ph { display: flex; align-items: center; justify-content: center; width: 108px; height: 108px; background: var(--el-fill-color-light); font-size: 20px; color: var(--el-text-color-placeholder); }
.uncat-name { font-size: 12px; max-width: 108px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uncat-actions { margin-top: 2px; }
</style>
