<template>
  <StudioView
    :rows="rows"
    :total="total"
    :loading="loading"
    :not-ready="notReady"
    :page-error="pageError"
    :q="query.q"
    :page-num="query.pageNum"
    :page-size="query.pageSize"
    :form-visible="formVisible"
    :form="form"
    :saving="saving"
    :deleting-id="deletingId"
    @update:q="(v) => (query.q = v)"
    @update:form-visible="(v) => (formVisible = v)"
    @search="handleQuery"
    @refresh="loadStudios"
    @back="goPersons"
    @create="openCreate"
    @edit="openEdit"
    @delete="handleDelete"
    @submit="submitForm"
    @pagination="onPagination"
  />
</template>

<script setup name="MediaStudio">
/**
 * 工作室管理（P5-A 管理端；P5-C 落地页面）
 * 分层：本文件只做取数与保存（GET/POST/PUT/DELETE /api/media/admin/studios），
 *       展示与三态在 StudioView.vue（纯 props，可单独渲染验证）。
 * 契约：GET  /api/media/admin/studios?q=&page=&size= → { rows|list, total }，行内 { id, name, remark?, videoCount? }
 *       POST /api/media/admin/studios           { name, remark? }
 *       PUT  /api/media/admin/studios/{id}      { name?, remark? }
 *       DELETE /api/media/admin/studios/{id}    （仍有引用时后端 4xx，前端原样展示并阻止）
 *       归属：PUT /api/media/admin/videos/{id}/studios { studioIds }（api/media.js 已导出 setVideoStudios）
 * 三态：接口未就绪（404 / 501 / 连不上）→ 页内黄色提示；其它错误 → 页内红色提示；正常 → 列表。
 *       全程不弹全局错误、不抛未捕获异常。
 */
import { getCurrentInstance, onMounted, reactive, ref } from 'vue'
import { listStudios, createStudio, updateStudio, deleteStudio } from '@/api/media'
import StudioView from './StudioView.vue'

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
const form = reactive({ id: null, name: '', remark: '' })

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 后端可能是 {rows,total} / {list,total} / 裸数组，三种形态都收（与人物管理页同一套归一化） */
function normalizePage(res) {
  if (Array.isArray(res)) return { rows: res, total: res.length }
  const body = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res
  const list = (body && (body.rows || body.list || body.items || body.records)) || []
  const count = body && (body.total != null ? body.total : body.size != null ? body.size : list.length)
  return { rows: Array.isArray(list) ? list : [], total: toNum(count) }
}

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

const NOT_READY_TEXT = '工作室数据暂不可用：后端工作室接口（/admin/studios）尚未就绪，稍后重试或联系管理员升级后端'

function loadStudios() {
  loading.value = true
  pageError.value = ''
  notReady.value = ''
  const params = { q: (query.q || '').trim(), page: query.pageNum, size: query.pageSize }
  listStudios(params).then(res => {
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
    else pageError.value = '工作室列表加载失败：' + (errorText(err) || '请求失败，请确认后端已启动')
  }).finally(() => { loading.value = false })
}

function handleQuery() {
  query.pageNum = 1
  loadStudios()
}

function onPagination(p) {
  const page = Number(p && p.page) || 1
  const limit = Number(p && p.limit) || query.pageSize
  query.pageNum = page
  query.pageSize = limit
  loadStudios()
}

function goPersons() {
  proxy.$router.push('/media-person')
}

function openCreate() {
  form.id = null
  form.name = ''
  form.remark = ''
  formVisible.value = true
}

function openEdit(row) {
  form.id = row.id
  form.name = row.name || ''
  form.remark = row.remark || ''
  formVisible.value = true
}

function submitForm() {
  const name = (form.name || '').trim()
  if (!name) {
    proxy.$modal.msgWarning('请填写工作室名称')
    return
  }
  if (saving.value) return
  const payload = { name: name, remark: (form.remark || '').trim() }
  saving.value = true
  const task = form.id ? updateStudio(form.id, payload) : createStudio(payload)
  task.then(() => {
    proxy.$modal.msgSuccess(form.id ? '工作室已更新' : '工作室已创建')
    formVisible.value = false
    loadStudios()
  }).catch(err => {
    proxy.$modal.notifyError({
      title: form.id ? '更新工作室失败' : '新建工作室失败',
      message: statusOf(err) === 409 ? '名称已存在，换一个再试' : (errorText(err) || '请求失败，请查看后端日志'),
      duration: 8000
    })
  }).finally(() => { saving.value = false })
}

/** 有引用：直接把后端给的计数摊开讲清楚，不发起删除请求 */
function handleDelete(row) {
  if (!row || row.id == null) return
  const videoCount = toNum(row.videoCount)
  const albumCount = toNum(row.albumCount)
  if (videoCount + albumCount > 0) {
    proxy.$modal.alertWarning(
      '工作室「' + (row.name || row.id) + '」仍被引用：关联视频 ' + videoCount + ' 条' +
      (albumCount ? '、相册 ' + albumCount + ' 本' : '') + '。请先在媒体库里解除关联，再删除。'
    )
    return
  }
  proxy.$modal.confirm('删除工作室「' + (row.name || row.id) + '」？', '删除工作室', { confirmButtonText: '确认删除', type: 'error' }).then(() => {
    deletingId.value = row.id
    return deleteStudio(row.id).then(() => {
      proxy.$modal.msgSuccess('已删除工作室')
      loadStudios()
    }).catch(err => {
      proxy.$modal.notifyError({
        title: statusOf(err) === 409 ? '工作室仍被引用' : '删除工作室失败',
        message: errorText(err) || '请求失败，请查看后端日志',
        duration: 8000
      })
      loadStudios()
    }).finally(() => { deletingId.value = null })
  }).catch(() => {
    /* 用户取消 */
  })
}

onMounted(loadStudios)
</script>
