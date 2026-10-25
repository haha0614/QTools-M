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
      :trash-keys="trashKeys"
      @refresh="load"
      @kind-change="onKindChange"
      @page-change="onPageChange"
      @size-change="onSizeChange"
      @merge="askMerge"
      @keep="askKeep"
      @remove="askRemove"
      @trash-change="onTrashChange"
    />

    <!-- P4.3 清理单条副本：二次确认，确认框里的勾选决定「移回收站」还是「仅删记录」（默认继承组级勾选） -->
    <el-dialog v-model="removeVisible" title="清理这一条副本（需确认）" width="min(560px, 94vw)" append-to-body>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        :title="'影响：' + (removeDeleteFile ? '这条副本文件移入回收站' : '只删除这一条索引记录')"
      >
        <template #default>
          <pre class="dup-confirm">{{ removeText }}</pre>
        </template>
      </el-alert>
      <el-checkbox v-model="removeDeleteFile" class="dup-check">同时把副本文件移入回收站（可在回收站恢复）</el-checkbox>
      <p class="dup-hint">默认值来自卡片底部的组级勾选；这里只影响当前这一条，组内其它副本不受影响。</p>
      <template #footer>
        <el-button @click="removeVisible = false">取 消</el-button>
        <el-button type="danger" :loading="removing" v-hasPermi="['media:admin:edit']" @click="doRemove">确认清理这条</el-button>
      </template>
    </el-dialog>

    <!-- 清理整组副本：二次确认，勾选状态决定「移回收站」还是「仅删记录」 -->
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
import { listDuplicates, mergeDuplicates, keepDuplicate, removeDuplicate } from '@/api/media'
import {
  clampPage,
  duplicateTotals,
  fallbackPage,
  inheritedTrashFlag,
  isNotReadyError,
  keepConfirmText,
  mergeConfirmText,
  removeAliasRow,
  removeConfirmText,
  removeRequestBody,
  resolveViewState,
  rowKey
} from './duplicatesModel'
import DuplicatesView from './DuplicatesView'

const { proxy } = getCurrentInstance()

/** 当前 kind：video | photo（与后端 kind 参数一致） */
const kind = ref('video')
const page = ref(1)
const size = ref(10)
const total = ref(0)
/** 表格数据：每行补一个 __key，避免后端缺 contentHash 时 key 重复 */
const rows = ref([])
const loading = ref(false)
const error = ref('')
const notReady = ref(false)

const mergeVisible = ref(false)
/** 「移入回收站」勾选状态：按组 key 存，卡片勾选与弹窗勾选共用同一份真值（同组共享，换组/刷新回落到「仅删记录」） */
const trashByKey = ref({})
const mergeRow = ref(null)
const merging = ref(false)
const keepVisible = ref(false)
const keepAlias = ref(null)
const keepRow = ref(null)
const keeping = ref(false)
/** P4.3 单条清理：确认框状态 + 打开时从组级勾选继承的「移入回收站」默认值 */
const removeVisible = ref(false)
const removeAlias = ref(null)
const removeRow = ref(null)
const removeDeleteFile = ref(false)
const removing = ref(false)

const totals = computed(() => duplicateTotals(rows.value, total.value))

/** 四态判定（loading / error / empty / data）在 duplicatesModel 里，便于单测 */
const view = computed(() =>
  resolveViewState({ loading: loading.value, error: error.value, notReady: notReady.value, rows: rows.value })
)

const emptyText = computed(() =>
  kind.value === 'video' ? '没有重复的视频文件（内容哈希都不同）' : '没有重复的相册图片'
)

/** 已勾选移入回收站的组 key（传给 DuplicatesView 决定复选框勾选态） */
const trashKeys = computed(() => Object.keys(trashByKey.value).filter((k) => !!trashByKey.value[k]))

/** 当前确认中的这一组是否移入回收站：与卡片上的复选框同一份状态 */
const mergeDeleteFiles = computed({
  get: () => !!trashByKey.value[mergeRow.value && mergeRow.value.__key],
  set: (v) => {
    const key = mergeRow.value && mergeRow.value.__key
    if (key) trashByKey.value[key] = !!v
  }
})

const mergeText = computed(() =>
  mergeConfirmText({ row: mergeRow.value, kind: kind.value, deleteFiles: mergeDeleteFiles.value })
)

const keepText = computed(() => keepConfirmText({ row: keepRow.value, alias: keepAlias.value, kind: kind.value }))

/** 单条清理的确认文案：随确认框里的勾选实时变化 */
const removeText = computed(() =>
  removeConfirmText({
    row: removeRow.value,
    alias: removeAlias.value,
    kind: kind.value,
    deleteFile: removeDeleteFile.value
  })
)

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
    // 换页 / 换 kind / 刷新后组 key 已变，勾选态一律回落到默认「仅删记录」
    trashByKey.value = {}
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
  size.value = Number(next) || 10
  page.value = 1
  load()
}

function askMerge(row) {
  mergeRow.value = row
  mergeVisible.value = true
}

/** 卡片上的「移入回收站」：写同一份组状态，本组所有入口（副本行「清理」/「清理本组」）都读它 */
function onTrashChange(row, value) {
  const key = row && row.__key
  if (!key) return
  trashByKey.value[key] = !!value
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
    // 请求体与 P4-B 完全一致：只有 deleteFiles 的取值来自「卡片/弹窗共用的组勾选态」
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

/** P4.3 点副本行的「清理」：只清这一条；「移入回收站」默认值继承卡片底部组级勾选 */
function askRemove(row, alias) {
  if (!row || !alias || alias.id == null || alias.id === '') {
    proxy.$modal.msgError('这条副本缺少 id，无法单条清理（可改用「清理本组」）')
    return
  }
  removeRow.value = row
  removeAlias.value = alias
  removeDeleteFile.value = inheritedTrashFlag(trashKeys.value, row.__key)
  removeVisible.value = true
}

/**
 * 单条清理：乐观更新 + 失败整份回滚。
 *
 * 顺序是刻意的：先在本地移除这条副本（副本数与可省空间立刻更新，组清空则卡片消失），
 * 再发请求；失败就把快照原样写回并 toast 后端原错误——不让界面停在「看起来清了、其实没清」。
 */
async function doRemove() {
  const row = removeRow.value
  const alias = removeAlias.value
  if (!row || !alias || removing.value) return
  const deleteFile = !!removeDeleteFile.value
  const snapshot = { rows: rows.value, total: total.value }
  const applied = removeAliasRow(rows.value, row.__key, alias.id)
  if (!applied.touched) {
    removeVisible.value = false
    return
  }

  rows.value = applied.rows
  // 整组清空 → 卡片消失，组数也少一组（后端 total 是组数）
  if (applied.groupRemoved) total.value = Math.max(0, total.value - 1)
  removeVisible.value = false
  removing.value = true
  try {
    await removeDuplicate(removeRequestBody({ kind: kind.value, alias, deleteFile }))
    proxy.$modal.msgSuccess(deleteFile ? '这条副本已移入回收站' : '这条副本记录已清理（文件未动）')
    if (applied.groupRemoved && !rows.value.length) {
      // 本页被清空：退一页重拉（第 1 页则重拉本页，让后一页的组补位）
      page.value = fallbackPage(rows.value, page.value)
      load()
    }
  } catch (err) {
    // 回滚到请求前的整份快照（行、组数），再原样报后端错误
    rows.value = snapshot.rows
    total.value = snapshot.total
    const hint = isNotReadyError(err) ? '接口未就绪' : errText(err) || '请查看后端日志'
    proxy.$modal.msgError('清理这一条失败：' + hint)
  } finally {
    removing.value = false
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
