<template>
  <div class="dup-panel">
    <!-- 列表 / 统计 / 三态展示全在 DuplicatesView（纯 props，可单独渲染验证）；这里只做数据与二次确认 -->
    <duplicates-view
      :kind="kind"
      :view="view"
      :rows="rows"
      :totals="totals"
      :empty-text="emptyText"
      :page="page"
      :size="size"
      :total="total"
      :loading="loading"
      @refresh="load"
      @kind-change="onKindChange"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @merge="askMerge"
      @keep="askKeep"
    />

    <!-- 清理副本：二次确认，勾选状态决定「移回收站」还是「仅删记录」 -->
    <el-dialog v-model="mergeVisible" title="清理副本（需确认）" width="min(560px, 94vw)" append-to-body>
      <el-alert type="warning" :closable="false" show-icon :title="'影响：' + (mergeDeleteFiles ? '副本文件移入回收站' : '只删除索引记录')">
        <template #default>
          <pre class="dup-confirm">{{ mergeText }}</pre>
        </template>
      </el-alert>
      <el-checkbox v-model="mergeDeleteFiles" class="dup-check">同时把副本文件移入回收站（可在回收站恢复）</el-checkbox>
      <p class="dup-hint">不勾选 = 仅删记录：磁盘文件保持原位，下一轮「重建索引」可能把它重新扫回来。</p>
      <template #footer>
        <el-button @click="mergeVisible = false">取 消</el-button>
        <el-button type="danger" :loading="merging" v-hasPermi="['media:admin:edit']" @click="doMerge">确认清理</el-button>
      </template>
    </el-dialog>

    <!-- 设为主文件：二次确认（只动记录） -->
    <el-dialog v-model="keepVisible" title="设为主文件（需确认）" width="min(520px, 94vw)" append-to-body>
      <el-alert type="info" :closable="false" show-icon title="只改索引记录，不移动、不删除文件">
        <template #default>
          <pre class="dup-confirm">{{ keepText }}</pre>
        </template>
      </el-alert>
      <template #footer>
        <el-button @click="keepVisible = false">取 消</el-button>
        <el-button type="primary" :loading="keeping" v-hasPermi="['media:admin:edit']" @click="doKeep">确认设为主文件</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="DuplicatesPanel">
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { listDuplicates, mergeDuplicates, keepDuplicate } from '@/api/media'
import {
  clampPage,
  duplicateTotals,
  isNotReadyError,
  keepConfirmText,
  mergeConfirmText,
  resolveViewState,
  rowKey
} from './duplicatesModel'
import DuplicatesView from './DuplicatesView'

const { proxy } = getCurrentInstance()

/** 当前 kind：video | photo（与后端 kind 参数一致） */
const kind = ref('video')
const page = ref(1)
const size = ref(20)
const total = ref(0)
/** 表格数据：每行补一个 __key，避免后端缺 contentHash 时 key 重复 */
const rows = ref([])
const loading = ref(false)
const error = ref('')
const notReady = ref(false)

const mergeVisible = ref(false)
const mergeDeleteFiles = ref(false)
const mergeRow = ref(null)
const merging = ref(false)
const keepVisible = ref(false)
const keepAlias = ref(null)
const keepRow = ref(null)
const keeping = ref(false)

const totals = computed(() => duplicateTotals(rows.value, total.value))

/** 四态判定（loading / error / empty / data）在 duplicatesModel 里，便于单测 */
const view = computed(() =>
  resolveViewState({ loading: loading.value, error: error.value, notReady: notReady.value, rows: rows.value })
)

const emptyText = computed(() =>
  kind.value === 'video' ? '没有重复的视频文件（内容哈希都不同）' : '没有重复的相册图片'
)

const mergeText = computed(() =>
  mergeConfirmText({ row: mergeRow.value, kind: kind.value, deleteFiles: mergeDeleteFiles.value })
)

const keepText = computed(() => keepConfirmText({ row: keepRow.value, alias: keepAlias.value, kind: kind.value }))

function errText(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  return err.message || String(err)
}

async function load() {
  loading.value = true
  error.value = ''
  notReady.value = false
  try {
    const res = await listDuplicates({ kind: kind.value, page: page.value, size: size.value })
    const list = Array.isArray(res && res.rows) ? res.rows : Array.isArray(res) ? res : []
    rows.value = list.map((r, i) => Object.assign({}, r, { __key: rowKey(r, i) }))
    const t = res && res.total != null ? Number(res.total) : rows.value.length
    total.value = isFinite(t) && t >= 0 ? t : rows.value.length
    page.value = clampPage(page.value, total.value, size.value)
  } catch (err) {
    rows.value = []
    total.value = 0
    notReady.value = isNotReadyError(err)
    error.value = notReady.value ? '' : errText(err) || '读取失败，请查看后端日志'
  } finally {
    loading.value = false
  }
}

function onKindChange(next) {
  kind.value = next || 'video'
  page.value = 1
  load()
}

function onPageChange(next) {
  page.value = Number(next) || 1
  load()
}

function onSizeChange(next) {
  size.value = Number(next) || 20
  page.value = 1
  load()
}

function askMerge(row) {
  mergeRow.value = row
  mergeDeleteFiles.value = false
  mergeVisible.value = true
}

function askKeep(row, alias) {
  keepRow.value = row
  keepAlias.value = alias || null
  keepVisible.value = true
}

async function doMerge() {
  const row = mergeRow.value
  if (!row || merging.value) return
  merging.value = true
  try {
    await mergeDuplicates({ kind: kind.value, contentHash: row.contentHash, deleteFiles: !!mergeDeleteFiles.value })
    proxy.$modal.msgSuccess(mergeDeleteFiles.value ? '副本已移入回收站，记录已清理' : '记录已清理（文件未动）')
    mergeVisible.value = false
    load()
  } catch (err) {
    const hint = isNotReadyError(err) ? '接口未就绪' : errText(err) || '请查看后端日志'
    proxy.$modal.msgError('清理失败：' + hint)
  } finally {
    merging.value = false
  }
}

async function doKeep() {
  const row = keepRow.value
  const alias = keepAlias.value
  if (!row || !alias || keeping.value) return
  keeping.value = true
  try {
    await keepDuplicate({ kind: kind.value, contentHash: row.contentHash, id: alias.id })
    proxy.$modal.msgSuccess('已设为主文件：' + (alias.relPath || alias.id))
    keepVisible.value = false
    load()
  } catch (err) {
    const hint = isNotReadyError(err) ? '接口未就绪' : errText(err) || '请查看后端日志'
    proxy.$modal.msgError('设为主文件失败：' + hint)
  } finally {
    keeping.value = false
  }
}

onMounted(load)

defineExpose({ load })
</script>

<style scoped>
.dup-panel {
  padding-bottom: 8px;
}

.dup-confirm {
  margin: 0;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.dup-check {
  margin: 12px 0 4px;
}

.dup-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
</style>
