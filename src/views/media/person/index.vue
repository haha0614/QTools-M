<template>
  <div class="app-container person-page">
    <!-- 工具栏：与媒体库页同一套 .media-toolbar 语义（标题左、操作右），移动端自动换行 -->
    <div class="person-toolbar">
      <div class="person-toolbar-left">
        <span class="person-page-title">人物管理</span>
        <span class="person-page-sub">共 {{ total }} 人{{ query.q ? '（已按「' + query.q + '」过滤）' : '' }}</span>
      </div>
      <div class="person-toolbar-right">
        <el-input v-model="query.q" placeholder="名称 / 别名" clearable prefix-icon="Search" class="person-search"
          @keyup.enter="handleQuery" @clear="handleQuery" />
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" :loading="loading" @click="loadPersons">刷新</el-button>
        <!-- 列可切换（P5-C）：把「身体 / 事业 / 社交」这些新字段按需显示，默认只留常用列 -->
        <el-popover placement="bottom-end" :width="260" trigger="click">
          <template #reference>
            <el-button icon="Operation">列</el-button>
          </template>
          <p class="person-cols-tip">显示的列（记住在本浏览器）</p>
          <el-checkbox v-for="c in COLS" :key="c.key" v-model="colsOn[c.key]" :label="c.label" class="person-cols-item" />
        </el-popover>
        <el-button icon="Folder" @click="goStudios">工作室管理</el-button>
        <el-button type="primary" icon="Plus" @click="openCreate" v-hasPermi="['media:admin:edit']">新建人物</el-button>
      </div>
    </div>

    <!-- 接口未就绪（P3-A 未部署）时的可读提示：不弹全局错误、页面不白屏 -->
    <el-alert v-if="notReady" :title="notReady" type="warning" :closable="false" show-icon class="person-alert" />
    <el-alert v-else-if="pageError" :title="pageError" type="error" :closable="false" show-icon class="person-alert" />

    <el-table v-if="loading || rows.length" v-loading="loading" :data="rows" class="person-table">
      <el-table-column label="名称" min-width="140" :show-overflow-tooltip="true">
        <template #default="scope">
          <span class="person-name">{{ scope.row.name || '—' }}</span>
          <el-tag v-if="isHidden(scope.row)" type="info" size="small" class="person-tag">隐藏</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="colsOn.alias" label="别名" min-width="130" :show-overflow-tooltip="true">
        <template #default="scope">{{ textOr(scope.row.alias) }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.gender" label="性别" width="90" align="center">
        <template #default="scope">{{ textOr(scope.row.gender) }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.height_cm" label="身高" width="90" align="right">
        <template #default="scope">{{ withUnit(scope.row.height_cm, 'cm') }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.weight_kg" label="体重" width="90" align="right">
        <template #default="scope">{{ withUnit(scope.row.weight_kg, 'kg') }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.nationality" label="国籍" width="100" :show-overflow-tooltip="true">
        <template #default="scope">{{ textOr(scope.row.nationality) }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.hair_color" label="发色 / 瞳色" width="130" :show-overflow-tooltip="true">
        <template #default="scope">{{ pairText(scope.row.hair_color, scope.row.eye_color) }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.career" label="事业" width="120" align="center">
        <template #default="scope">{{ careerText(scope.row) }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.social" label="社交" min-width="140" :show-overflow-tooltip="true">
        <template #default="scope">{{ socialText(scope.row) }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.remark" label="备注" min-width="180" :show-overflow-tooltip="true">
        <template #default="scope">{{ textOr(scope.row.remark) }}</template>
      </el-table-column>
      <el-table-column v-if="colsOn.videoCount" label="视频数" width="96" align="right">
        <template #default="scope">
          <el-tag :type="toNum(scope.row.videoCount) > 0 ? 'primary' : 'info'" size="small">{{ toNum(scope.row.videoCount) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="colsOn.albumCount" label="相册数" width="96" align="right">
        <template #default="scope">
          <el-tag :type="toNum(scope.row.albumCount) > 0 ? 'primary' : 'info'" size="small">{{ toNum(scope.row.albumCount) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" align="center" fixed="right" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-tooltip content="编辑" placement="top">
            <el-button link type="primary" icon="Edit" @click="openEdit(scope.row)"
              v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
          <el-tooltip :content="hasRefs(scope.row) ? '有引用，需先解除关联' : '删除'" placement="top">
            <el-button link type="danger" icon="Delete" :loading="deletingId === scope.row.id"
              @click="handleDelete(scope.row)" v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && !notReady && !pageError && !rows.length"
      :description="query.q ? '没有匹配的人物，换个关键词试试' : '还没有人物，先点右上角「新建人物」'" />

    <pagination v-show="total > 0" :total="total" :page-sizes="[10, 20, 50, 100]"
      v-model:page="query.pageNum" v-model:limit="query.pageSize" @pagination="loadPersons" />

    <!-- 新建 / 编辑：同一个表单，靠 form.id 区分 POST 与 PUT。
         P5-C：字段分区（基本 / 身体 / 事业 / 社交）抽到 PersonForm.vue，便于单独渲染与扩展 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑人物' : '新建人物'" width="min(720px, 94vw)" append-to-body>
      <PersonForm :model="form" @enter="submitForm" />
      <p class="person-form-tip">名称需唯一；改成已存在的名称会被后端拒绝。身体 / 事业 / 社交字段留空表示该字段为空值。</p>
      <template #footer>
        <el-button @click="formVisible = false">取 消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm" v-hasPermi="['media:admin:edit']">保 存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="MediaPerson">
/**
 * 人物管理（P3-B 管理端；P5-C 补全身体 / 事业 / 社交字段与列开关）
 * 用途：媒体库旁的独立页，维护 media_person 并展示引用数。
 * 契约：GET /api/media/admin/persons?q=&page=&size=；POST/PUT/DELETE /api/media/admin/persons[/{id}]。
 *       P5-C：同一组接口接受 measurements / career_start / career_end / tattoos / piercings /
 *             ethnicity / hair_color / eye_color / height_cm / weight_kg / fake_boobs /
 *             nationality / twitter / instagram（后端 P5-A 起支持；旧后端忽略未知字段，保存不报错）。
 *       后端未部署 P3-A 时统一 404 —— 页面给出「人物数据暂不可用」的可读提示，不抛异常、不弹全局错误。
 * 删除：有引用（视频数 / 相册数 > 0）时前端直接拦住并展示后端返回的计数；后端 4xx 时原样展示其 message。
 */
import { getCurrentInstance, onMounted, reactive, ref, watch } from 'vue'
import { listPersons, createPerson, updatePerson, deletePerson } from '@/api/media'
import PersonForm from './PersonForm.vue'
// 字段模型与「行 ↔ 表单 ↔ body」映射收在纯函数里（单测见 p5c-evidence/person-fields.test.mjs）
import { EMPTY_FORM, formToPayload, rowToForm } from './personFields'

const { proxy } = getCurrentInstance()

const rows = ref([])
const total = ref(0)
const loading = ref(false)
const pageError = ref('')
const notReady = ref('')
const deletingId = ref(null)

const query = reactive({ q: '', pageNum: 1, pageSize: 10 })

const formVisible = ref(false)
const saving = ref(false)
/** 表单：结构见 personFields.EMPTY_FORM（基本 + 身体 + 事业 + 社交，键名与后端 persons 接口一致） */
const form = reactive(Object.assign({}, EMPTY_FORM))

/* ------------------------------------------------------------- 列显示（P5-C） */
/* 默认只留常用列；身体 / 事业 / 社交列按需打开，选择记在本浏览器（localStorage）。
   键名 media.person.cols，值是 { <列key>: boolean }，损坏时回落到默认。 */
const COLS = [
  { key: 'alias', label: '别名', def: true },
  { key: 'gender', label: '性别', def: true },
  { key: 'height_cm', label: '身高', def: false },
  { key: 'weight_kg', label: '体重', def: false },
  { key: 'nationality', label: '国籍', def: false },
  { key: 'hair_color', label: '发色 / 瞳色', def: false },
  { key: 'career', label: '事业（出道/引退）', def: false },
  { key: 'social', label: '社交（Twitter/IG）', def: false },
  { key: 'remark', label: '备注', def: true },
  { key: 'videoCount', label: '视频数', def: true },
  { key: 'albumCount', label: '相册数', def: true }
]
const COLS_KEY = 'media.person.cols'
const colsOn = reactive(Object.fromEntries(COLS.map((c) => [c.key, c.def])))

function loadCols() {
  try {
    const raw = localStorage.getItem(COLS_KEY)
    if (!raw) return
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return
    for (const c of COLS) if (typeof o[c.key] === 'boolean') colsOn[c.key] = o[c.key]
  } catch {
    /* 隐私模式 / 损坏值：用默认列 */
  }
}

watch(colsOn, () => {
  try {
    localStorage.setItem(COLS_KEY, JSON.stringify(Object.assign({}, colsOn)))
  } catch {
    /* 忽略：存不下不影响本次会话 */
  }
})

/** 后端可能返回 {rows,total} / {list,total} / 裸数组，三种形态都收 */
const normalizePage = (res) => {
  if (Array.isArray(res)) return { rows: res, total: res.length }
  const body = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res
  const list = (body && (body.rows || body.list || body.items || body.records)) || []
  const count = body && (body.total != null ? body.total : body.size != null ? body.size : list.length)
  return { rows: Array.isArray(list) ? list : [], total: toNum(count) }
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function textOr(v) {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s || '—'
}

/** 数值列带单位（0 / null 一律显示 —，避免把「没填」误读成 0cm） */
function withUnit(v, unit) {
  const n = Number(v)
  if (v === null || v === undefined || v === '' || !Number.isFinite(n) || n <= 0) return '—'
  return n + ' ' + unit
}

function pairText(a, b) {
  const x = (a === null || a === undefined ? '' : String(a).trim()) || '—'
  const y = (b === null || b === undefined ? '' : String(b).trim()) || '—'
  return x + ' / ' + y
}

/** 事业：2015 → 2019，缺一端时显示 2015 → 至今 / → 2019 */
function careerText(row) {
  const s = toNum(row && row.career_start)
  const e = toNum(row && row.career_end)
  if (!s && !e) return '—'
  return (s || '?') + ' → ' + (e || '至今')
}

function socialText(row) {
  const t = row && row.twitter ? String(row.twitter).trim() : ''
  const i = row && row.instagram ? String(row.instagram).trim() : ''
  if (!t && !i) return '—'
  const out = []
  if (t) out.push('X: ' + t)
  if (i) out.push('IG: ' + i)
  return out.join(' · ')
}

function isHidden(row) {
  return !!(row && (row.hidden === 1 || row.hidden === true))
}

function hasRefs(row) {
  return toNum(row && row.videoCount) + toNum(row && row.albumCount) > 0
}

/** 从 axios 错误体里取可读文案（媒体模块用 {error}，若依用 {msg}） */
function errorText(err) {
  const data = err && err.response && err.response.data
  if (data && typeof data === 'object') return data.error || data.msg || ''
  if (typeof data === 'string' && data) return data.slice(0, 200)
  return (err && err.message) || ''
}

function statusOf(err) {
  return err && err.response && err.response.status ? err.response.status : 0
}

const isNotReady = (err) => {
  const st = statusOf(err)
  return st === 404 || st === 501 || st === 0
}

const NOT_READY_TEXT = '人物数据暂不可用：后端人物接口（/admin/persons）尚未就绪，稍后重试或联系管理员升级后端'

function loadPersons() {
  loading.value = true
  pageError.value = ''
  notReady.value = ''
  const params = { q: (query.q || '').trim(), page: query.pageNum, size: query.pageSize }
  listPersons(params).then(res => {
    const page = normalizePage(res)
    rows.value = page.rows
    total.value = page.total
    // 删除 / 过滤后页码越界时拉回有效范围
    const maxPage = Math.max(1, Math.ceil(page.total / query.pageSize))
    if (query.pageNum > maxPage) query.pageNum = maxPage
  }).catch(err => {
    rows.value = []
    total.value = 0
    if (isNotReady(err)) notReady.value = NOT_READY_TEXT
    else pageError.value = '人物列表加载失败：' + (errorText(err) || '请求失败，请确认后端已启动')
  }).finally(() => { loading.value = false })
}

function handleQuery() {
  query.pageNum = 1
  loadPersons()
}

function goStudios() {
  proxy.$router.push('/media-studios')
}

function resetForm() {
  Object.assign(form, EMPTY_FORM)
}

function openCreate() {
  resetForm()
  formVisible.value = true
}

/** 行 → 表单：字段映射（含 snake_case / camelCase 兼容与数值归一）全在 personFields.rowToForm */
function openEdit(row) {
  Object.assign(form, rowToForm(row))
  formVisible.value = true
}

function submitForm() {
  const name = (form.name || '').trim()
  if (!name) {
    proxy.$modal.msgWarning('请填写人物名称')
    return
  }
  if (saving.value) return
  // 提交 body：13 个 P5-A 字段一并提交（空值语义由后端决定，前端只做 trim / 数值归一）
  const payload = formToPayload(form)
  saving.value = true
  const task = form.id ? updatePerson(form.id, payload) : createPerson(payload)
  task.then(() => {
    proxy.$modal.msgSuccess(form.id ? '人物已更新' : '人物已创建')
    formVisible.value = false
    loadPersons()
  }).catch(err => {
    proxy.$modal.notifyError({
      title: form.id ? '更新人物失败' : '新建人物失败',
      message: statusOf(err) === 409 ? '名称已存在，换一个再试' : (errorText(err) || '请求失败，请查看后端日志'),
      duration: 8000
    })
  }).finally(() => { saving.value = false })
}

/** 有引用：直接把后端返回的计数摊开讲清楚，不发起删除请求 */
function handleDelete(row) {
  if (!row || row.id == null) return
  const videoCount = toNum(row.videoCount)
  const albumCount = toNum(row.albumCount)
  if (videoCount + albumCount > 0) {
    proxy.$modal.alertWarning(
      '人物「' + (row.name || row.id) + '」仍被引用：关联视频 ' + videoCount + ' 条、相册 ' + albumCount + ' 本。' +
      '请先在媒体库的行内「人物」操作里解除关联，再删除。'
    )
    return
  }
  proxy.$modal.confirm('删除人物「' + (row.name || row.id) + '」？', '删除人物', { confirmButtonText: '确认删除', type: 'error' }).then(() => {
    deletingId.value = row.id
    return deletePerson(row.id).then(() => {
      proxy.$modal.msgSuccess('已删除人物')
      loadPersons()
    }).catch(err => {
      // 后端仍判定有引用（并发写入 / 计数过期）：展示后端原文，不吞错
      proxy.$modal.notifyError({
        title: statusOf(err) === 409 ? '人物仍被引用' : '删除人物失败',
        message: errorText(err) || '请求失败，请查看后端日志',
        duration: 8000
      })
      loadPersons()
    }).finally(() => { deletingId.value = null })
  }).catch(() => {
    /* 用户取消：不做任何事 */
  })
}

onMounted(() => {
  loadCols()
  loadPersons()
})
</script>

<style scoped>
.person-page {
  padding-bottom: 8px;
}

.person-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.person-toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.person-page-title {
  font-size: 18px;
  font-weight: 600;
}

.person-page-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.person-toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.person-search {
  width: 220px;
}

.person-alert {
  margin-bottom: 12px;
}

.person-name {
  font-weight: 500;
}

.person-tag {
  margin-left: 6px;
}

.person-form-tip {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.person-cols-tip {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.person-cols-item {
  display: flex;
  width: 100%;
  margin: 0 0 2px;
}

@media (max-width: 768px) {
  .person-search {
    width: 160px;
  }

  .person-toolbar-right {
    width: 100%;
  }
}
</style>
