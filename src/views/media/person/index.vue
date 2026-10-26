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
        <!-- P5.63：表格列开关 → 卡片「资料 chip」开关（卡片上最多显示 3 个，选择记在本浏览器） -->
        <el-popover placement="bottom-end" :width="260" trigger="click">
          <template #reference>
            <el-button icon="Operation">资料</el-button>
          </template>
          <p class="person-cols-tip">卡片上显示的资料（按顺序取前 3 个，记住在本浏览器）</p>
          <el-checkbox v-for="c in CHIP_FIELDS" :key="c.key" v-model="chipsOn[c.key]" :label="c.label"
            class="person-cols-item" />
        </el-popover>
        <el-button icon="Folder" @click="goStudios">工作室管理</el-button>
        <el-button type="primary" icon="Plus" @click="openCreate" v-hasPermi="['media:admin:edit']">新建人物</el-button>
      </div>
    </div>

    <!-- 接口未就绪（P3-A 未部署）时的可读提示：不弹全局错误、页面不白屏 -->
    <el-alert v-if="notReady" :title="notReady" type="warning" :closable="false" show-icon class="person-alert" />
    <el-alert v-else-if="pageError" :title="pageError" type="error" :closable="false" show-icon class="person-alert" />

    <!-- P5.63：表格 → 卡片网格（与站端人物墙同一套视觉语言：头像 + 名字（别名）+ 数量 + 资料 chip） -->
    <div v-if="loading || cards.length" v-loading="loading" class="person-wall">
      <article v-for="c in cards" :key="c.key" class="person-card" :data-person-id="c.id" :data-avatar="c.avatar.kind">
        <div class="person-card-main">
          <span class="person-avatar">
            <img v-if="c.avatar.url && !avatarFailed[c.key]" :src="mediaSrc(c.avatar.url)" alt="" loading="lazy"
              decoding="async"
              @error="markAvatarFailed(c)" />
            <template v-else>{{ c.initial }}</template>
          </span>
          <span class="person-card-body">
            <span class="person-card-name" :title="c.alias ? c.name + '（' + c.alias + '）' : c.name">
              <span class="person-name">{{ c.name || '—' }}</span>
              <i v-if="c.alias" class="person-alias">（{{ c.alias }}）</i>
            </span>
            <span class="person-card-id">#{{ c.id }}<el-tag v-if="c.hidden" type="info" size="small"
                class="person-tag">隐藏</el-tag></span>
            <span v-if="c.counts" class="person-counts">{{ c.counts }}</span>
            <span v-if="c.chips.length" class="person-chips">
              <span v-for="chip in c.chips" :key="chip" class="person-chip" :title="chip">{{ chip }}</span>
            </span>
          </span>
        </div>
        <div class="person-card-actions">
          <el-button link type="primary" icon="Edit" :disabled="c.id === ''" @click="openEdit(c.row)"
            v-hasPermi="['media:admin:edit']"><span class="person-act-text">编辑</span></el-button>
          <el-button link type="danger" icon="Delete" :disabled="c.id === ''" :loading="deletingId === c.id"
            @click="handleDelete(c.row)" v-hasPermi="['media:admin:edit']"><span class="person-act-text">删除</span></el-button>
          <el-button link icon="Link" :disabled="c.id === ''" title="新窗口打开站端人物详情"
            @click="openSiteDetail(c.row)"><span class="person-act-text">站内</span></el-button>
        </div>
      </article>
    </div>

    <el-empty v-if="!loading && !notReady && !pageError && !cards.length"
      :description="query.q ? '没有匹配的人物，换个关键词试试' : '还没有人物，先点右上角「新建人物」'" />

    <pagination v-show="total > 0" :total="total" :page-sizes="[10, 20, 50, 100]"
      v-model:page="query.pageNum" v-model:limit="query.pageSize" @pagination="loadPersons" />

    <!-- 新建 / 编辑：仍然是 P5-C 的 PersonForm（未重写表单），靠 form.id 区分 POST 与 PUT -->
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
 * 人物管理（P3-B 管理端；P5-C 补全身体 / 事业 / 社交字段；P5.63 表格 → 卡片网格）
 *
 * 用途：媒体库旁的独立页，维护 media_person 并展示引用数。
 * 契约：GET /api/media/admin/persons?q=&page=&size=；POST/PUT/DELETE /api/media/admin/persons[/{id}]。
 *       同一组接口接受 measurements / career_start / career_end / tattoos / piercings /
 *       ethnicity / hair_color / eye_color / height_cm / weight_kg / fake_boobs /
 *       nationality / twitter / instagram（后端 P5-A 起支持；旧后端忽略未知字段，保存不报错）。
 *       后端未部署 P3-A 时统一 404 —— 页面给出「人物数据暂不可用」的可读提示，不抛异常、不弹全局错误。
 * 删除：有引用（视频数 / 相册数 > 0）时前端直接拦住并展示后端返回的计数；两次确认通过后才发 DELETE。
 *
 * P5.63 卡片（与站端人物墙 QTools-C/src/views/media/PersonsPage.vue 同一套信息）：
 *   头像 + 姓名（别名）+ #id + 「X 部视频 · Y 本相册 · Z 张照片」+ ≤3 个资料 chip + 行内操作（编辑 / 删除 / 站内）。
 *   数据来源两份，拼装规则唯一实现在 personCards.js（纯函数，单测 p563-evidence/person-cards.test.mjs）：
 *     1. 管理端分页行：name / alias / avatarUrl（手动头像，后端解析）/ videoCount / albumCount / 14 个资料字段；
 *     2. 站端只读 /api/media/person/{id}/albums —— 分页行**没有**照片数与相册封面：
 *        count 求和 = 「Z 张照片」，首册 cover = 头像第二级；名下有视频但无相册时再补 /videos 拿首个视频封面。
 *        补充请求失败只让卡片少一块信息（照片数不显示、头像退回首字），不报错、不阻塞列表。
 */
import { computed, getCurrentInstance, onMounted, reactive, ref, watch } from 'vue'
import {
  listPersons, createPerson, updatePerson, deletePerson, listPersonAlbums, listPersonVideos
} from '@/api/media'
import { resolveToolUrl } from '@/utils/qtool'
import PersonForm from './PersonForm.vue'
// 字段模型与「行 ↔ 表单 ↔ body」映射收在纯函数里（单测见 p5c-evidence/person-fields.test.mjs）
import { EMPTY_FORM, formToPayload, rowToForm } from './personFields'
// 卡片信息（头像 / 数量 / 资料 chip / 隐藏标记）的唯一实现（单测见 p563-evidence/person-cards.test.mjs）
import { CHIP_FIELDS, CHIP_MAX, buildCard, hasRefs } from './personCards'

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

/** 非 axios 资源统一加后端前缀（与媒体库页 index.vue:512 同一条规则：dev 走 /dev-api 代理，prod 与 axios baseURL 一致） */
const MEDIA_BASE = import.meta.env.VITE_APP_BASE_API || ''
function mediaSrc(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : MEDIA_BASE + path
}

/** 头像加载失败的人物（失败后退回首字占位，不显示碎图）；键 = 卡片 key（人物 id） */
const avatarFailed = reactive({})
/** 站端补充数据（键 = 人物 id 字符串）：{ photos, albumCover, videoId } —— 见 personCards.avatarOf / countsText */
const extras = reactive({})
/** 补充请求的并发上限：一页最多 100 张卡，也只开 6 条连接（与站端人物墙同一口径） */
const EXTRA_CONCURRENCY = 6
/** 代数号：翻页 / 搜索后旧请求回来一律丢弃，避免把上一页的封面贴到这一页的卡片上 */
let extrasGen = 0

/* ------------------------------------------------------------- 资料 chip 开关（P5.63） */
/* 原「列」开关随表格一起变成「资料」开关：勾掉的字段不参与 chip 取值（卡片仍只取前 3 个有值项）。
   键 media.person.chips，值是 { <字段key>: boolean }，损坏时回落到「全开」。 */
const CHIPS_KEY = 'media.person.chips'
const chipsOn = reactive(Object.fromEntries(CHIP_FIELDS.map((c) => [c.key, true])))

function loadChips() {
  try {
    const raw = localStorage.getItem(CHIPS_KEY)
    if (!raw) return
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return
    for (const c of CHIP_FIELDS) if (typeof o[c.key] === 'boolean') chipsOn[c.key] = o[c.key]
  } catch {
    /* 隐私模式 / 损坏值：用默认（全开） */
  }
}

watch(chipsOn, () => {
  try {
    localStorage.setItem(CHIPS_KEY, JSON.stringify(Object.assign({}, chipsOn)))
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

/* --------------------------------------------------------------- 卡片（P5.63） */

/**
 * 卡片 = rows 每行 + 该行的站端补充数据（extras）。
 * 拼装规则全在 personCards.buildCard：谁优先 / 缺哪个降级到哪个 / chip 取哪 3 个 —— 页面只做 v-for。
 * row 原样挂在卡片上：行内操作（编辑 / 删除 / 站内）直接用它，不再按 id 二次查表。
 */
const cards = computed(() => rows.value.map((row) => {
  const card = buildCard(row, {
    extra: extras[String(row && row.id)] || null,
    enabled: chipsOn,
    maxChips: CHIP_MAX
  })
  return Object.assign(card, { row })
}))

function markAvatarFailed(card) {
  if (card && card.key) avatarFailed[String(card.key)] = true
}

function clearAvatarFailed() {
  for (const k of Object.keys(avatarFailed)) delete avatarFailed[k]
}

/** 一页内的相册分页行 → { photos, albumCover }（照片数只在拿到**全部**相册时才算得准） */
function albumExtraOf(res) {
  const body = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res
  const albums = (body && (Array.isArray(body.rows) ? body.rows : Array.isArray(body.list) ? body.list : [])) || []
  const totalAlbums = toNum(body && body.total)
  const complete = !totalAlbums || totalAlbums <= albums.length
  const photos = complete ? albums.reduce((sum, a) => sum + toNum(a && a.count), 0) : null
  const cover = albums.length && albums[0] ? albums[0].cover : ''
  return { photos, albumCover: cover ? String(cover) : '', videoId: '' }
}

/** 单个补充请求：相册（照片数 + 封面）优先；没有相册封面时再要一条视频拿封面。失败一律静默降级 */
function loadOneExtra(row) {
  return listPersonAlbums(row.id).then((res) => {
    const extra = albumExtraOf(res)
    if (extra.albumCover) return extra
    return listPersonVideos(row.id).then((vres) => {
      const body = vres && vres.data && typeof vres.data === 'object' ? vres.data : vres
      const videos = (body && (Array.isArray(body.rows) ? body.rows : Array.isArray(body.list) ? body.list : [])) || []
      const first = videos[0]
      return { photos: extra.photos, albumCover: '', videoId: first && first.id != null ? String(first.id) : '' }
    }).catch(() => ({ photos: extra.photos, albumCover: '', videoId: '' }))
  }).catch(() => null)
}

/** 给一页卡片补站端数据：并发上限 6，任一失败只少一块信息（不报错、不阻塞列表） */
function loadExtras(list) {
  const gen = ++extrasGen
  const queue = (list || []).filter((r) => r && r.id != null && r.id !== '')
  if (!queue.length) return Promise.resolve()
  let cursor = 0
  const worker = () => {
    if (gen !== extrasGen || cursor >= queue.length) return Promise.resolve()
    const row = queue[cursor]
    cursor += 1
    const key = String(row.id)
    return loadOneExtra(row).then((patch) => {
      if (gen === extrasGen && patch) extras[key] = Object.assign({}, extras[key], patch)
    }).then(worker)
  }
  const lanes = []
  for (let i = 0; i < Math.min(EXTRA_CONCURRENCY, queue.length); i++) lanes.push(worker())
  return Promise.all(lanes)
}

function loadPersons() {
  loading.value = true
  pageError.value = ''
  notReady.value = ''
  const params = { q: (query.q || '').trim(), page: query.pageNum, size: query.pageSize }
  listPersons(params).then(res => {
    const page = normalizePage(res)
    rows.value = page.rows
    total.value = page.total
    clearAvatarFailed()
    // 站端补充数据与列表并行取：晚到只是卡片信息少一块，不影响卡片出现
    loadExtras(page.rows)
    // 删除 / 过滤后页码越界时拉回有效范围
    const maxPage = Math.max(1, Math.ceil(page.total / query.pageSize))
    if (query.pageNum > maxPage) query.pageNum = maxPage
  }).catch(err => {
    rows.value = []
    total.value = 0
    extrasGen += 1
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
    // 保存后立即重取当前页：卡片文案（姓名 / 别名 / chip）与站端补充数据一起刷新
    loadPersons()
  }).catch(err => {
    proxy.$modal.notifyError({
      title: form.id ? '更新人物失败' : '新建人物失败',
      message: statusOf(err) === 409 ? '名称已存在，换一个再试' : (errorText(err) || '请求失败，请查看后端日志'),
      duration: 8000
    })
  }).finally(() => { saving.value = false })
}

/**
 * 删除（P5.63：**两次确认**后才发请求）
 *   第 1 次：说明「不可恢复」+ 仍然被引用时的计数拦截（有引用直接拦下，连第一次确认都不弹）；
 *   第 2 次：最终确认（带 id，防止误删同名人物）；
 *   两次都点确认才 DELETE；任一步取消 → 什么都不发生。
 */
async function handleDelete(row) {
  if (!row || row.id == null) return
  const videoCount = toNum(row.videoCount)
  const albumCount = toNum(row.albumCount)
  if (hasRefs(row)) {
    proxy.$modal.alertWarning(
      '人物「' + (row.name || row.id) + '」仍被引用：关联视频 ' + videoCount + ' 条、相册 ' + albumCount + ' 本。' +
      '请先在媒体库的行内「人物」操作里解除关联，再删除。'
    )
    return
  }
  const label = row.name || row.id
  try {
    await proxy.$modal.confirm(
      '删除人物「' + label + '」？删除后不可恢复。',
      '删除人物（第 1 步 / 共 2 步）',
      { confirmButtonText: '继续', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await proxy.$modal.confirm(
      '再次确认：删除「' + label + '」（id ' + row.id + '）。这一步之后不可撤销。',
      '删除人物（第 2 步 / 共 2 步）',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'error' }
    )
  } catch {
    return
  }
  deletingId.value = row.id
  try {
    await deletePerson(row.id)
    proxy.$modal.msgSuccess('已删除人物')
    loadPersons()
  } catch (err) {
    // 后端仍判定有引用（并发写入 / 计数过期）：展示后端原文，不吞错
    proxy.$modal.notifyError({
      title: statusOf(err) === 409 ? '人物仍被引用' : '删除人物失败',
      message: errorText(err) || '请求失败，请查看后端日志',
      duration: 8000
    })
    loadPersons()
  } finally {
    deletingId.value = null
  }
}

/** 新窗口打开站端人物详情（QTools-C 路由 /media/person/:id；站点源可用 VITE_APP_USER_SITE_URL 覆盖） */
function openSiteDetail(row) {
  if (!row || row.id == null || row.id === '') return
  const url = resolveToolUrl('/media/person/' + encodeURIComponent(String(row.id)))
  if (url) window.open(url, '_blank', 'noopener')
}

onMounted(() => {
  loadChips()
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

/* 卡片网格（P5.63）：最小列宽 260px（站端人物墙 P5.60 定的是 280px，管理端卡片底部还有一行操作，
   260 就能让「X 部视频 · Y 本相册 · Z 张照片」维持在 1-2 行）；grid-auto-rows: 1fr 让**整面墙**
   等高 —— 某张卡因 chip / 数量文案换行变高时，其它卡片跟着长到同一高度。 */
.person-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  grid-auto-rows: 1fr;
  gap: 12px;
}

.person-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  height: 100%;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-bg-color);
  transition: border-color 0.12s, box-shadow 0.12s;
}

.person-card:hover {
  border-color: var(--el-border-color);
  box-shadow: var(--el-box-shadow-lighter);
}

.person-card-main {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

/* 头像：有图时圆形裁切（object-fit: cover），无图时是首字占位（同一个盒子，尺寸不抖） */
.person-avatar {
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 18px;
  font-weight: 600;
}

.person-avatar img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.person-card-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.person-card-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.person-name {
  font-weight: 500;
}

/* 别名跟在名字后面的括号里：不抢主名（次级色 + 小一号），太长就一起被省略号截掉 */
.person-alias {
  margin-left: 2px;
  font-style: normal;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.person-card-id {
  font-size: 11px;
  line-height: 1.3;
  color: var(--el-text-color-placeholder);
  font-variant-numeric: tabular-nums;
}

/* 数量行：允许换行不裁切（窄屏两列时最长文案会折成 2-3 行，由 grid-auto-rows: 1fr 统一拉平） */
.person-counts {
  font-size: 11.5px;
  line-height: 1.35;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

/* chip 区：可换行、不裁切 —— 「3 个 chip 都能看见」；「最多 3 个」由 personCards.chipsOf 决定 */
.person-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  row-gap: 3px;
  min-width: 0;
}

.person-chip {
  flex: 0 0 auto;
  max-width: 100%;
  padding: 0 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 999px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 10.5px;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 行内操作：靠 gap 排版，抹掉 el-button 相邻的 margin-left，避免窄卡换行时右侧多出空白 */
.person-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  padding-top: 6px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.person-card-actions :deep(.el-button) {
  margin: 0;
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

/* 窄屏（≤768px，含 375 档）：两列；卡片内边距与头像缩一号，操作按钮只留图标避免溢出 */
@media (max-width: 768px) {
  .person-search {
    width: 160px;
  }

  .person-toolbar-right {
    width: 100%;
  }

  .person-wall {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .person-card {
    padding: 9px 10px;
  }

  .person-card-main {
    gap: 8px;
  }

  .person-avatar {
    flex-basis: 40px;
    width: 40px;
    height: 40px;
    font-size: 16px;
  }

  .person-counts {
    font-size: 11px;
  }

  .person-act-text {
    display: none;
  }
}
</style>
