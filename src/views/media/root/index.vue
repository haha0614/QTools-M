<template>
  <RootView
    :rows="rows"
    :loading="loading"
    :not-ready="notReady"
    :page-error="pageError"
    :last-scan-map="lastScanMap"
    :toggling-id="togglingId"
    :deleting-id="deletingId"
    :form-visible="formVisible"
    :form="form"
    :saving="saving"
    :form-error="formError"
    :artifacts="artifacts"
    :preview="preview"
    :form-auto-scan="formAutoScan"
    :rating-policy="ratingPolicy"
    :rating-busy="ratingBusy"
    :rating-error="ratingError"
    @refresh="loadAll"
    @toggle-rating="toggleRating"
    @update:form-auto-scan="(v) => (formAutoScan = v)"
    @scan="openScan"
    @create="openCreate"
    @edit="openEdit"
    @delete="handleDelete"
    @submit="submitForm"
    @toggle-guest="toggleGuest"
    @load-artifacts="loadArtifacts"
    @update:form-visible="(v) => (formVisible = v)"
  />

  <!-- P5.97：扫描入口并入本页——每行「扫描」与「创建后立即扫描入库」都开这个抽屉 -->
  <el-drawer v-model="scanVisible" :title="scanTitle" size="min(920px, 96vw)" append-to-body destroy-on-close>
    <scan-page :root-id="scanRootId" :auto-start="scanAutoStart" embedded
      @finished="load" @started="scanAutoStart = false" />
  </el-drawer>
</template>

<script setup name="MediaRoot">
/**
 * 库根管理（P5.78 管理端页面）
 * 分层：本文件只做取数与保存（/api/media/admin/roots + /api/media/admin/watch），
 *       展示与三态在 RootView.vue（纯 props，可单独渲染验证）。
 *
 * 契约：
 *   GET    /api/media/admin/roots        → [{ id, name, path, kind, guestVisible, note, exists, readable,
 *                                            videoCount, albumCount, photoCount, isDefault }]
 *   POST   /api/media/admin/roots        { name, path, kind, guestVisible, note }
 *   PUT    /api/media/admin/roots/{id}   { name?, path?, guestVisible?, note? }（局部更新，不传不动）
 *   DELETE /api/media/admin/roots/{id}   （仍有 media_video/media_photo 引用时后端 400，message 带引用数）
 *   GET    /api/media/admin/watch        → { roots:[{ id, path, lastScanAt }], ... }（只用来补「最后扫描」）
 *   GET    /api/media/admin/roots/{id}/artifacts?refresh=true → 产物根子目录清单（P5.80，仅 kind=thumbs）
 *
 * 三态：接口未就绪（404 / 501 / 连不上）→ 页内黄色提示；其它错误 → 页内红色提示；正常 → 列表。
 *       全程不弹全局错误条、不抛未捕获异常。
 */
import { getCurrentInstance, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { listRoots, createRoot, updateRoot, deleteRoot, setRootGuestVisible, getRootArtifacts, previewScanRoot, getRatingPolicy, setRatingPolicy } from '@/api/media'
import { listWatchRoots, lastScanByRoot } from './rootsModel'
import RootView from './RootView.vue'
// P6.04：独立「扫描入库」页已删除；执行器在 media/ingest/，这里只嵌入抽屉
import ScanPage from '../ingest/index.vue'

const { proxy } = getCurrentInstance()

const rows = ref([])
const loading = ref(false)
const pageError = ref('')
const notReady = ref('')
const togglingId = ref(null)
const deletingId = ref(null)
const lastScanMap = ref({})

/** 产物根子目录清单：{ [rootId]: { loading, error, data } }（P5.80，60s 缓存由后端负责） */
const artifacts = ref({})

/**
 * 内容分级可见性策略（P5.99）：{ general, guidance, restricted, items:[{value,label,guestVisible}] }
 * null = 还没取到（接口未就绪 / 读取失败）→ RootView 显示提示而不是一排假开关
 */
const ratingPolicy = ref(null)
const ratingError = ref('')
/** 正在保存的分级 → true（逐档禁用） */
const ratingBusy = ref({})

const formVisible = ref(false)
const saving = ref(false)
const formError = ref('')
const form = reactive({ id: null, name: '', path: '', kind: 'root', guestVisible: true, note: '' })

/* ---------------- P5.97 A：新增库根时直接预演（不再去扫描页试） ----------------
   防抖 500ms：用户还在敲路径时不发请求；表单关闭 / 编辑既有根 / 非 root 类型都不预演
   （编辑改路径不需要预演：那时库根已有条目数，预演只会让人以为是「重扫」）。 */
const formAutoScan = ref(true)
const preview = reactive({ loading: false, error: '', data: null, path: '' })
let previewTimer = null
let previewSeq = 0

const scanVisible = ref(false)
const scanRootId = ref(null)
const scanAutoStart = ref(false)
const scanTitle = ref('扫描入库')

/** 后端错误体是媒体模块的 {error:"..."}（真实 HTTP 400/403/404），这里统一成一句话 */
function errText(err) {
  const data = err && err.response && err.response.data
  if (data && typeof data === 'object' && (data.error || data.msg)) return String(data.error || data.msg)
  if (typeof err === 'string') return err
  if (err && typeof err.message === 'string') return err.message
  return ''
}

function errStatus(err) {
  const status = err && err.response && err.response.status
  return Number(status) || 0
}

function notReadyText(err, what) {
  const status = errStatus(err)
  const text = errText(err)
  if (status === 404 || status === 501 || /404|not found|no static resource|未就绪/i.test(text)) {
    return what + '未就绪（后端还没部署 P5.78）：该页暂时不可用，部署后刷新即可，其它媒体功能不受影响。'
  }
  return what + '读取失败：' + (text || '请求失败，请查看后端日志')
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return value === 1 || value === '1' || value === 'true'
}

function normalize(row) {
  return {
    id: row && row.id,
    name: row && row.name,
    path: row && row.path,
    kind: row && row.kind,
    // 老后端没有这一列：按「未登录可见」渲染，与列默认值一致
    guestVisible: toBool(row && row.guestVisible, true),
    note: row && row.note,
    exists: row ? row.exists !== false : false,
    readable: row ? row.readable !== false : false,
    videoCount: row && row.videoCount,
    albumCount: row && row.albumCount,
    photoCount: row && row.photoCount,
    isDefault: !!(row && row.isDefault)
  }
}

/** 策略 + 库根一起刷新（页头「刷新」按钮走这里） */
function loadAll() {
  load()
  loadRatingPolicy()
}

function loadRatingPolicy() {
  ratingError.value = ''
  getRatingPolicy().then(res => {
    const body = res && typeof res === 'object' && res.data && !res.general ? res.data : res
    if (!body || typeof body !== 'object') throw new Error('策略返回体不认识')
    ratingPolicy.value = body
  }).catch(err => {
    ratingPolicy.value = null
    ratingError.value = ''
    if (errStatus(err) !== 404) {
      ratingError.value = '分级策略读取失败：' + (errText(err) || '请查看后端日志')
    }
  })
}

/**
 * 翻某一档开关：后端是逐项局部更新（只传这一档），回包是最新策略，直接覆盖本地。
 * 失败保持原值并弹错误 —— 可见性开关从不做乐观更新（看着关掉了其实没关最危险）。
 */
function toggleRating({ rating, value }) {
  if (!rating || ratingBusy.value[rating]) return
  ratingBusy.value = { ...ratingBusy.value, [rating]: true }
  setRatingPolicy({ [rating]: !!value }).then(res => {
    const body = res && typeof res === 'object' && res.data && !res.data.general ? res.data : res
    if (body && typeof body === 'object' && body.items) ratingPolicy.value = body
    else loadRatingPolicy()
    proxy.$modal.msgSuccess((value ? '已设为未登录可见：' : '已设为仅登录可见：') + rating)
  }).catch(err => {
    proxy.$modal.msgError('保存失败：' + (errText(err) || '未知错误'))
  }).finally(() => {
    ratingBusy.value = { ...ratingBusy.value, [rating]: false }
  })
}

function load() {
  loading.value = true
  pageError.value = ''
  notReady.value = ''
  listRoots(true).then(res => {
    const list = Array.isArray(res) ? res : (res && (res.list || res.roots)) || []
    rows.value = list.filter(r => r && typeof r === 'object').map(normalize)
    loadLastScan()
  }).catch(err => {
    rows.value = []
    notReady.value = notReadyText(err, '库根接口')
  }).finally(() => {
    loading.value = false
  })
}

/** 「最后扫描时间」来自自动扫描状态（同一份 data/scan 记录），取不到就留空，不影响主列表 */
function loadLastScan() {
  listWatchRoots().then(maps => {
    lastScanMap.value = lastScanByRoot(rows.value, maps)
  }).catch(() => {
    lastScanMap.value = {}
  })
}

/** 产物根展开 / 重扫：后端 60s 缓存 + refresh=true 强制重扫 */
function setArtifactState(id, patch) {
  const current = artifacts.value[id] || { loading: false, error: '', data: null }
  artifacts.value = { ...artifacts.value, [id]: { ...current, ...patch } }
}

function loadArtifacts({ row, force }) {
  if (!row || row.id === undefined || row.id === null) return
  if (String(row.kind || '').toLowerCase() !== 'thumbs') return
  const current = artifacts.value[row.id]
  if (current && current.loading) return
  // 已有数据且不是强制重扫：直接用（后端还有 60s 缓存，这里少打一次请求）
  if (!force && current && current.data) return
  setArtifactState(row.id, { loading: true, error: '' })
  getRootArtifacts(row.id, !!force, true).then(res => {
    const body = res && typeof res === 'object' && res.data && !res.dirs ? res.data : res
    if (!body || !Array.isArray(body.dirs)) throw new Error('产物清单返回体不认识')
    setArtifactState(row.id, { loading: false, error: '', data: body })
  }).catch(err => {
    setArtifactState(row.id, { loading: false, error: errText(err) || '产物清单读取失败（后端是否已部署 P5.80？）' })
  })
}

/** 预演：只读（后端 dry-run 不连库不写库），失败就明确报错——表单不会因此被拦，但用户看得到原因 */
function runPreview(path) {
  const text = String(path || '').trim()
  preview.path = text
  preview.data = null
  preview.error = ''
  if (!text) {
    preview.loading = false
    return
  }
  const seq = ++previewSeq
  preview.loading = true
  previewScanRoot(text).then(res => {
    if (seq !== previewSeq) return
    const body = res && typeof res === 'object' && res.data && !res.videos ? res.data : res
    preview.data = body && typeof body === 'object' ? body : null
    if (!preview.data) preview.error = '预演返回体不认识（后端是否已部署 P5.97？）'
  }).catch(err => {
    if (seq !== previewSeq) return
    preview.data = null
    preview.error = errText(err) || '预演失败（路径不存在 / 无权限 / 后端未部署）'
  }).finally(() => {
    if (seq === previewSeq) preview.loading = false
  })
}

function schedulePreview() {
  if (previewTimer) {
    clearTimeout(previewTimer)
    previewTimer = null
  }
  if (!formVisible.value || form.id || String(form.kind || 'root').toLowerCase() !== 'root') {
    preview.data = null
    preview.error = ''
    preview.loading = false
    return
  }
  previewTimer = setTimeout(() => runPreview(form.path), 500)
}

watch(() => form.path, schedulePreview)
watch(() => formVisible.value, () => {
  if (formVisible.value) {
    schedulePreview()
  } else {
    preview.data = null
    preview.error = ''
    preview.loading = false
  }
})

/** 行内「扫描」：打开抽屉（不自动开跑，用户自己点开始） */
function openScan(row) {
  if (!row) return
  scanRootId.value = row.id
  scanAutoStart.value = false
  scanTitle.value = '扫描入库：' + (row.name || ('#' + row.id))
  scanVisible.value = true
}

function openCreate() {
  form.id = null
  form.name = ''
  form.path = ''
  form.kind = 'root'
  form.guestVisible = true
  form.note = ''
  formError.value = ''
  formAutoScan.value = true
  preview.data = null
  preview.error = ''
  formVisible.value = true
}

function openEdit(row) {
  form.id = row.id
  form.name = row.name || ''
  form.path = row.path || ''
  form.kind = row.kind || 'root'
  form.guestVisible = row.guestVisible !== false
  form.note = row.note || ''
  formError.value = ''
  formVisible.value = true
}

function submitForm() {
  if (!form.name || !form.name.trim()) {
    formError.value = '名称必填'
    return
  }
  if (!form.path || !form.path.trim()) {
    formError.value = '路径必填（必须是服务器上已存在的目录）'
    return
  }
  const body = {
    name: form.name.trim(),
    path: form.path.trim(),
    guestVisible: !!form.guestVisible,
    note: form.note || ''
  }
  saving.value = true
  formError.value = ''
  const action = form.id ? updateRoot(form.id, body) : createRoot({ ...body, kind: form.kind || 'root' })
  const creating = !form.id
  action.then(res => {
    proxy.$modal.msgSuccess(creating ? '已新增库根' : '已保存库根')
    const row = res && typeof res === 'object' && (res.data || res)
    formVisible.value = false
    // P5.97 A：勾了「创建后立即扫描入库」→ 直接开抽屉自动跑一次真实扫描
    if (creating && formAutoScan.value && row && row.id != null) {
      scanRootId.value = row.id
      scanAutoStart.value = true
      scanTitle.value = '扫描入库：' + (row.name || ('#' + row.id))
      scanVisible.value = true
      proxy.$modal.msgSuccess('已按开关自动开始扫描入库：完成后会自动补元数据、生成缩略图并重建索引')
    } else {
      const hint = row && row.hint
      if (hint) proxy.$modal.msgSuccess(hint)
    }
    load()
  }).catch(err => {
    formError.value = errText(err) || '保存失败'
  }).finally(() => {
    saving.value = false
  })
}

/** 行内开关：切换即 PUT，成功后就地更新该行并 toast；失败回滚开关位置 */
function toggleGuest({ row, value }) {
  const next = !!value
  const previous = row.guestVisible !== false
  if (next === previous) return
  togglingId.value = row.id
  setRootGuestVisible(row.id, next).then(res => {
    row.guestVisible = res && res.guestVisible !== undefined ? toBool(res.guestVisible, next) : next
    proxy.$modal.msgSuccess(next
      ? '已设为未登录可见：未登录访客刷新后即可看到该库根'
      : '已设为仅登录可见：未登录访客在索引里看不到它，直接访问返回 404')
    // 条目数 / 可读性可能随后端状态变化，静默刷新一次（不闪 loading）
    listRoots(true).then(list => {
      if (Array.isArray(list)) rows.value = list.filter(r => r && typeof r === 'object').map(normalize)
    }).catch(() => {})
  }).catch(err => {
    row.guestVisible = previous
    proxy.$modal.msgError(errText(err) || '切换失败')
  }).finally(() => {
    togglingId.value = null
  })
}

function handleDelete(row) {
  const refs = Number(row.videoCount || 0) + Number(row.albumCount || 0) + Number(row.photoCount || 0)
  const tip = refs > 0
    ? '库根「' + (row.name || row.id) + '」下还有 ' + Number(row.videoCount || 0) + ' 条视频 / '
      + Number(row.albumCount || 0) + ' 个相册 / ' + Number(row.photoCount || 0) + ' 张照片。\n'
      + '删除只是把这条登记去掉，磁盘文件不动；但库里的 root_id 会变成悬空引用，后端会拒绝删除。\n'
      + '确认继续？'
    : '确认删除库根「' + (row.name || row.id) + '」？\n删除只是把这条登记去掉，磁盘文件不动。'
  proxy.$modal.confirm(tip, '删除库根').then(() => {
    deletingId.value = row.id
    return deleteRoot(row.id)
  }).then(res => {
    proxy.$modal.msgSuccess('已删除库根' + (res && res.name ? '：' + res.name : ''))
    load()
  }).catch(err => {
    if (err === 'cancel' || err === 'close') return
    const text = errText(err)
    if (text) proxy.$modal.msgError(text)
  }).finally(() => {
    deletingId.value = null
  })
}

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer)
})

onMounted(() => {
  load()
  // P5.99：分级可见性策略与库根并行取（互不阻塞：库根接口挂了，策略区照样能用）
  loadRatingPolicy()
})
</script>