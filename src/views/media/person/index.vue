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
      <el-table-column label="别名" min-width="130" :show-overflow-tooltip="true">
        <template #default="scope">{{ textOr(scope.row.alias) }}</template>
      </el-table-column>
      <el-table-column label="备注" min-width="180" :show-overflow-tooltip="true">
        <template #default="scope">{{ textOr(scope.row.remark) }}</template>
      </el-table-column>
      <el-table-column label="性别" width="90" align="center">
        <template #default="scope">{{ textOr(scope.row.gender) }}</template>
      </el-table-column>
      <el-table-column label="视频数" width="96" align="right">
        <template #default="scope">
          <el-tag :type="toNum(scope.row.videoCount) > 0 ? 'primary' : 'info'" size="small">{{ toNum(scope.row.videoCount) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="相册数" width="96" align="right">
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

    <!-- 新建 / 编辑：同一个表单，靠 form.id 区分 POST 与 PUT -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑人物' : '新建人物'" width="min(480px, 94vw)" append-to-body>
      <el-form :model="form" label-width="72px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="120" show-word-limit placeholder="人物名（与目录 / 站内分组一致）"
            @keyup.enter="submitForm" />
        </el-form-item>
        <el-form-item label="别名">
          <el-input v-model="form.alias" maxlength="120" placeholder="选填，多个别名用 / 分隔" />
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="form.gender" placeholder="未设置" clearable filterable allow-create style="width: 100%">
            <el-option label="女" value="女" />
            <el-option label="男" value="男" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="选填" />
        </el-form-item>
      </el-form>
      <p class="person-form-tip">名称需唯一；改成已存在的名称会被后端拒绝。</p>
      <template #footer>
        <el-button @click="formVisible = false">取 消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm" v-hasPermi="['media:admin:edit']">保 存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="MediaPerson">
/**
 * 人物管理（P3-B 管理端）
 * 用途：媒体库旁的独立页，维护 media_person（名称 / 别名 / 备注 / 性别）并展示引用数。
 * 契约：GET /api/media/admin/persons?q=&page=&size=；POST/PUT/DELETE /api/media/admin/persons[/{id}]。
 *       后端未部署 P3-A 时统一 404 —— 页面给出「人物数据暂不可用」的可读提示，不抛异常、不弹全局错误。
 * 删除：有引用（视频数 / 相册数 > 0）时前端直接拦住并展示后端返回的计数；后端 4xx 时原样展示其 message。
 */
import { getCurrentInstance, onMounted, reactive, ref } from 'vue'
import { listPersons, createPerson, updatePerson, deletePerson } from '@/api/media'

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
const form = reactive({ id: null, name: '', alias: '', gender: '', remark: '' })

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

function openCreate() {
  form.id = null
  form.name = ''
  form.alias = ''
  form.gender = ''
  form.remark = ''
  formVisible.value = true
}

function openEdit(row) {
  form.id = row.id
  form.name = row.name || ''
  form.alias = row.alias || ''
  form.gender = row.gender || ''
  form.remark = row.remark || ''
  formVisible.value = true
}

function submitForm() {
  const name = (form.name || '').trim()
  if (!name) {
    proxy.$modal.msgWarning('请填写人物名称')
    return
  }
  if (saving.value) return
  const payload = { name: name, alias: (form.alias || '').trim(), gender: (form.gender || '').trim(), remark: (form.remark || '').trim() }
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

onMounted(loadPersons)
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

@media (max-width: 768px) {
  .person-search {
    width: 160px;
  }

  .person-toolbar-right {
    width: 100%;
  }
}
</style>
