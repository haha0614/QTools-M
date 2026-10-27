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
          <!-- 头像 + hover 才出现的「换」：点它只开换头像弹层，不触发卡片上任何其它动作 -->
          <span class="person-avatar-wrap">
            <span class="person-avatar">
              <img v-if="c.avatar.url && !avatarFailed[c.key]" :src="mediaSrc(c.avatar.url)" alt="" loading="lazy"
                decoding="async"
                @error="markAvatarFailed(c)" />
              <template v-else>{{ c.initial }}</template>
            </span>
            <button v-if="c.id !== ''" type="button" class="person-avatar-change" title="换头像"
              data-role="card-avatar-change" @click.stop.prevent="openAvatar(c)"
              v-hasPermi="['media:admin:edit']">换</button>
          </span>
          <span class="person-card-body">
            <span class="person-card-name" :title="c.alias ? c.name + '（' + c.alias + '）' : c.name">
              <span class="person-name">{{ c.name || '—' }}</span>
              <i v-if="c.alias" class="person-alias">（{{ c.alias }}）</i>
            </span>
            <span class="person-card-id">#{{ c.id }}<el-tag v-if="c.hidden" type="info" size="small"
                class="person-tag">隐藏</el-tag></span>
            <!-- 数量行单行不折（超长才省略号，title 里有全文）—— 折行是改动前「卡片高矮不一 → 无资料卡留大片空档」的主因 -->
            <span v-if="c.counts" class="person-counts" :title="c.counts">{{ c.counts }}</span>
          </span>
        </div>
        <!-- chip 行放在卡片层（整卡宽 256-278px）而不是头像右侧的文字列（190-212px）：
             3 个「标签 值」chip 约 226px，只有整卡宽才放得下一行 —— 这一行搬出来之后
             3 个 chip 在 280/302px 两档列宽下都完整显示（不再靠省略号） -->
        <span v-if="c.chips.length" class="person-chips">
          <span v-for="chip in c.chips" :key="chip" class="person-chip" :title="chip">{{ chip }}</span>
        </span>
        <div class="person-card-actions">
          <el-button link type="primary" icon="Edit" :disabled="c.id === ''" @click="openEdit(c.row)"
            v-hasPermi="['media:admin:edit']"><span class="person-act-text">编辑</span></el-button>
          <el-button link type="danger" icon="Delete" :disabled="c.id === ''" :loading="deletingId === c.id"
            @click="handleDelete(c.row)" v-hasPermi="['media:admin:edit']"><span class="person-act-text">删除</span></el-button>
          <el-button link icon="Camera" :disabled="c.id === ''" title="换头像" data-role="card-avatar-btn"
            @click="openAvatar(c)" v-hasPermi="['media:admin:edit']"><span class="person-act-text">换头像</span></el-button>
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

    <!-- 换头像（P5.66）：三个 tab（相册 / 视频画面 / 图片地址）+ 裁剪；组件不发写请求，
         保存与回滚都在本页（见 saveAvatar / clearAvatarAction） -->
    <PersonAvatarDialog :open="avatarOpen" :person="avatarTarget" :current="avatarCurrent" :busy="avatarBusy"
      @close="avatarOpen = false" @save="saveAvatar" @clear="clearAvatarAction" />
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
 *   头像 + 姓名（别名）+ #id + 「X 部视频 · Y 本相册 · Z 张照片」+ ≤3 个资料 chip +
 *   行内操作（编辑 / 删除 / 换头像 / 站内，P5.66 起多了「换头像」）。
 *
 * P5.66 两件事：
 *   ① 布局「紧凑流式」：列宽对齐站端人物墙 minmax(280px,1fr)；数量行改单行不折、chip 行单行且
 *      移到整卡宽（256-278px 才放得下 3 个 chip）；头像与文字块垂直居中；内容靠上 + 操作行
 *      margin-top:auto 贴底。改动前（geom-before-*.json）：1600 档无资料卡与分隔线之间 48-50px、
 *      375 档 100px、头像圆心比文字块中线高 20/46px；改动后分别是 ≤31/44px 与 0px。
 *   ② 换头像：PersonAvatarDialog（三个 tab + 裁剪，从站端整体搬过来）+
 *      PUT/DELETE /api/media/admin/persons/{id}/avatar（管理端自己的接口，media:admin:edit 权限，
 *      不过站端编辑策略闸门）。保存后卡片头像**乐观更新**、失败回滚并明确提示（403 单独文案）。
 *   数据来源（P5.65 起只剩一份），拼装规则唯一实现在 personCards.js（纯函数，单测 p563-evidence/person-cards.test.mjs）：
 *     · 管理端分页行：name / alias / avatarUrl / videoCount / albumCount / **photoCount / coverPath /
 *       coverVideoId**（后端 personNode 一条 SQL 聚合）+ 14 个资料字段 —— 照片数与相册封面直接在这里；
 *     · 老后端（行里没有 photoCount）才走改前的补充请求：/person/{id}/albums 求和 + 首册封面，
 *       缺封面再补 /videos 拿首个视频，判定见 personCards.extrasNeeded。
 *     所以改前「一页 1+N 个请求」变成「1 个请求」；补充请求失败只让卡片少一块信息，不报错、不阻塞列表。
 */
import { computed, getCurrentInstance, onMounted, reactive, ref, watch } from 'vue'
import {
  listPersons, createPerson, updatePerson, deletePerson, listPersonAlbums, listPersonVideos,
  setPersonAvatar, clearPersonAvatar
} from '@/api/media'
import { resolveToolUrl } from '@/utils/qtool'
import PersonForm from './PersonForm.vue'
import PersonAvatarDialog from './PersonAvatarDialog.vue'
// 字段模型与「行 ↔ 表单 ↔ body」映射收在纯函数里（单测见 p5c-evidence/person-fields.test.mjs）
import { EMPTY_FORM, formToPayload, rowToForm } from './personFields'
// 卡片信息（头像 / 数量 / 资料 chip / 隐藏标记）的唯一实现（单测见 p563-evidence/person-cards.test.mjs）
import { CHIP_FIELDS, CHIP_MAX, avatarOf, buildCard, extrasNeeded, hasRefs } from './personCards'
// 换头像的纯逻辑（ref 解析 / 乐观 URL / 裁剪参数；单测见 p566-evidence/person-avatar.test.mjs）
import { avatarUrlFor, currentAvatarOf } from './personAvatar'

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
  // 换头像的乐观 URL 盖在卡片头像上（键 = 人物 id）：请求成功 / 失败后这份盖层都会被撤掉，
  // 最终显示的是后端回包解析好的 avatarUrl（或自动三级）—— 见 saveAvatar / clearAvatarAction
  const ov = avatarOverride[card.key]
  if (ov) card.avatar = { url: ov.url, kind: ov.kind || card.avatar.kind }
  return Object.assign(card, { row })
}))

/* ---------------------------------------------------------------- 换头像（P5.66）

   契约：PUT    /api/media/admin/persons/{id}/avatar  body {kind:'photo'|'frame'|'url', ref}
         DELETE /api/media/admin/persons/{id}/avatar（回三级自动）
         —— 管理端自己的接口（media:admin:edit 权限，不过站端编辑策略闸门），后端复用同一份
            IMediaPersonService.setAvatar / clearAvatar。**不调用**站端匿名的
            PUT/DELETE /api/media/person/{id}/avatar（用户口径：管理端用自己的接口）。详见 api/media.js。

   状态机（乐观 + 回滚）：
     1. 点「用这张」→ 立刻把 avatarOverride[personId] 换成 avatarUrlFor(kind, ref)（本地算出来、
        与后端 avatarUrlOf 逐字同形），卡片头像**当场变**；
     2. 请求成功 → 把后端回包的 avatarKind/avatarRef/avatarUrl 写回行对象，撤掉盖层（此时卡片读的就是
        后端解析值，与盖层一字不差）；
     3. 请求失败 → 撤掉盖层（卡片回到改前那张），并给一条明确的红色提示（403 = 编辑策略不是 full）。 */

/** 弹层开关 / 目标人物 / 当前手动头像 / 进行中 */
const avatarOpen = ref(false)
const avatarTarget = ref(null)
const avatarCurrent = ref(null)
const avatarBusy = ref(false)
/** 人物 id → { url, kind }：乐观头像盖层（成功后撤掉，失败后撤掉并提示） */
const avatarOverride = reactive({})

/** 头像相关错误 → {title, message}（403 必须说清楚原因，不许静默失败） */
function avatarError(err) {
  const st = statusOf(err)
  const detail = errorText(err)
  if (st === 403) {
    return {
      title: '头像保存被拒绝（403）',
      message: '当前账号没有「媒体库-编辑」（media:admin:edit）权限，或登录已过期。' +
        '请联系管理员授权后重新登录；改完再回来换头像。'
    }
  }
  if (st === 401) {
    return { title: '登录已过期（401）', message: '请重新登录后再换头像' }
  }
  if (st === 400) {
    return { title: '头像参数被拒绝（400）', message: detail || '这张图不在该人物名下，或视频帧的时间点越界' }
  }
  if (st === 404) return { title: '人物不存在（404）', message: '列表可能已过期，刷新后重试' }
  return { title: '头像保存失败', message: detail || '请求失败，请查看后端日志' }
}

/** 打开换头像弹层（卡片头像上的「换」与操作行的「换头像」都走这里） */
function openAvatar(card) {
  if (!card || card.id === '' || card.id == null) return
  avatarTarget.value = { id: card.id, name: card.name }
  avatarCurrent.value = currentAvatarOf(card.row)
  avatarOpen.value = true
}

/** 行对象上的手动头像三件套 → 就地写回（卡片 / 弹层 / 下次重渲染都读它） */
function patchRowAvatar(row, node) {
  if (!row || !node) return
  row.avatarKind = node.avatarKind || null
  row.avatarRef = node.avatarRef || null
  row.avatarUrl = node.avatarUrl || null
}

/** 弹层「用这张 / 保存」→ 乐观更新 + PUT + 失败回滚 */
function saveAvatar(payload) {
  const target = avatarTarget.value
  const row = rows.value.find((r) => String(r && r.id) === String(target && target.id))
  if (!target || !row || avatarBusy.value) return
  const kind = String((payload && payload.kind) || '')
  const ref = String((payload && payload.ref) || '')
  if (!kind || !ref) return
  const key = String(target.id)
  const optimistic = avatarUrlFor(kind, ref)
  avatarBusy.value = true
  // 1) 乐观：卡片头像当场换成这张
  if (optimistic) {
    avatarOverride[key] = { url: optimistic, kind: 'profile' }
    delete avatarFailed[key]
  }
  setPersonAvatar(key, kind, ref).then((res) => {
    const node = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res || {}
    // 2) 成功：以后端解析值为准（与乐观 URL 同形），撤掉盖层
    patchRowAvatar(row, node)
    delete avatarOverride[key]
    delete avatarFailed[key]
    avatarCurrent.value = currentAvatarOf(row)
    proxy.$modal.msgSuccess('头像已更新')
    avatarOpen.value = false
  }).catch((err) => {
    // 3) 失败：撤掉盖层 → 卡片回到改前那张，并明确提示
    delete avatarOverride[key]
    const info = avatarError(err)
    proxy.$modal.notifyError({ title: info.title, message: info.message, duration: 8000 })
  }).finally(() => { avatarBusy.value = false })
}

/** 弹层「恢复自动头像」→ DELETE，回三级自动（相册首图 → 视频封面 → 首字占位） */
function clearAvatarAction() {
  const target = avatarTarget.value
  const row = rows.value.find((r) => String(r && r.id) === String(target && target.id))
  if (!target || !row || avatarBusy.value) return
  const key = String(target.id)
  // 乐观：先按「没有手动头像」算一遍自动三级（avatarOf 的入参就是 row 与站端补充数据）
  const autoRow = Object.assign({}, row, { avatarKind: null, avatarRef: null, avatarUrl: null })
  const auto = avatarOf(autoRow, extras[key] || null)
  avatarOverride[key] = { url: auto.url, kind: auto.kind }
  delete avatarFailed[key]
  avatarBusy.value = true
  clearPersonAvatar(key).then((res) => {
    const node = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res || {}
    patchRowAvatar(row, node)
    delete avatarOverride[key]
    delete avatarFailed[key]
    avatarCurrent.value = currentAvatarOf(row)
    proxy.$modal.msgSuccess('已恢复自动头像')
    avatarOpen.value = false
  }).catch((err) => {
    delete avatarOverride[key]
    const info = avatarError(err)
    proxy.$modal.notifyError({ title: info.title, message: info.message, duration: 8000 })
  }).finally(() => { avatarBusy.value = false })
}

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

/** 名下第一个视频的 id（老后端兜底路径用；只取一行的分页接口） */
function firstVideoIdOf(vres) {
  const body = vres && vres.data && typeof vres.data === 'object' ? vres.data : vres
  const videos = (body && (Array.isArray(body.rows) ? body.rows : Array.isArray(body.list) ? body.list : [])) || []
  const first = videos[0]
  return first && first.id != null ? String(first.id) : ''
}

/**
 * 单个补充请求。两条路（P5.65）：
 *   · 分页行已经带 photoCount（新后端）→ 照片数不用问；只有在「没封面 + 没有手动头像 + 名下有视频」
 *     时才补一次 videos 拿首个视频 id（头像第三级），其余情况**一次请求都不发**；
 *   · 老后端（行里没有 photoCount）→ 原样：相册（照片数 + 封面）优先，没有相册封面时再补一条视频。
 * 失败一律静默降级（卡片少一块信息，不报错、不阻塞列表）。
 */
function loadOneExtra(row) {
  const plan = extrasNeeded(row)
  if (!plan.albums && !plan.videos) return Promise.resolve(null)
  if (!plan.albums) {
    return listPersonVideos(row.id)
      .then((vres) => ({ photos: null, albumCover: '', videoId: firstVideoIdOf(vres) }))
      .catch(() => null)
  }
  return listPersonAlbums(row.id).then((res) => {
    const extra = albumExtraOf(res)
    if (extra.albumCover) return extra
    return listPersonVideos(row.id).then((vres) => {
      return { photos: extra.photos, albumCover: '', videoId: firstVideoIdOf(vres) }
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

/* 卡片网格（P5.66）：列宽与站端人物墙（QTools-C PersonsPage P5.60）一致 —— minmax(280px, 1fr)。
   280 = 12px 内边距 ×2 + 56px 头像 + 10px gap 之后还剩 190px 文本宽，
   「0 部视频 · 144 本相册 · 9017 张照片」这种最长实测文案（约 181px @11.5px）**单行**放得下，
   数量行因此不必折行、卡片也不必为了容纳两行而拉高 —— 折行正是改动前「卡片高矮不一、
   无资料卡底下留一大片空档」的根源（改动前 375 档实测数量行 30px = 2 行）。
   grid-auto-rows: 1fr 让整面墙等高；卡片内部靠上对齐、操作行贴底（见 .person-card-actions）。 */
.person-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  grid-auto-rows: 1fr;
  gap: 12px;
}

/* 内容区「紧凑流式」：不再用 justify-content: space-between 把卡片劈成上下两半
   （那会让无资料卡在中间留出 48-100px 的空洞），改成内容自然靠上 + 操作行 margin-top:auto 贴底。 */
.person-card {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 6px;
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

/* 头像与文字块垂直居中对齐（改动前是 flex-start：1600 档实测头像圆心比文字块中线高 20px、
   375 档高 46px，看起来像「头像挂在文字上方」）。 */
.person-card-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 头像外层：只负责给「换」按钮定位，尺寸口径与旧 .person-avatar 完全一致 */
.person-avatar-wrap {
  position: relative;
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
}

/* 头像：有图时圆形裁切（object-fit: cover），无图时是首字占位（同一个盒子，尺寸不抖） */
.person-avatar {
  width: 100%;
  height: 100%;
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

/* 头像 hover 才出现的「换」：默认 opacity 0（不占视觉、仍可聚焦），
   hover / 键盘 focus 时点亮；点它只开换头像弹层（prevent + stop，不触发卡片其它动作）。
   22px 圆里居中：box-sizing 把 border 算进盒子，flex 居中让文字盒中心与按钮中心重合。 */
.person-avatar-change {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 50%;
  background: var(--el-bg-color);
  color: var(--el-text-color-secondary);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s, border-color 0.12s, color 0.12s;
}

.person-avatar-wrap:hover .person-avatar-change,
.person-avatar-wrap:focus-within .person-avatar-change {
  opacity: 1;
}

.person-avatar-change:hover,
.person-avatar-change:focus-visible {
  opacity: 1;
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
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

/* 数量行（P5.66）：**单行、不折**（站端人物墙 P5.60 同一口径）。
   改动前是「允许换行」，375 档实测高度 30px = 折成 2 行，正是卡片高矮不一的主因；
   现在明令 nowrap，省略号只是窄屏（146px 文本宽）的超长兜底，title 里有全文。 */
.person-counts {
  font-size: 11.5px;
  line-height: 1.35;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* chip 区（P5.66）：**单行**（flex-nowrap）—— 折行会让卡片长高，那正是「有 chip 的卡拥挤、
   没有的卡留空档」的来源。280px 一列时 3 个 chip 基本一行放得下；个别超长值让 chip 自己
   压缩、文字打省略号（title 里有原文），容器绝不折行。「最多 3 个」仍由 personCards.chipsOf 决定。 */
.person-chips {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.person-chip {
  flex: 0 1 auto;
  min-width: 0;
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

/* 行内操作（P5.66）：margin-top: auto 让它在整墙等高时**贴住卡片底部**，
   多余高度全部落在内容与操作行之间（不在操作行之后留白）。
   按钮口径统一：flex:1 1 0 让四个按钮**等分整行**（「换头像」三个汉字比其它三个宽，
   min-width 统一不了，等分才行）+ gap:4 + 抹掉 el-button 相邻的 margin-left；
   字号收到 12px，280-320px 的卡里四个按钮始终一行放得下、等宽、文字不裁。

   颜色选择：**常显但弱化**（默认 --el-text-color-secondary，hover 提亮到 primary / danger），
   不做「hover 才出现」——触屏没有 hover，入口会变成看不见的死按钮；
   弱化到与数量行同一档灰，视觉上不与姓名抢注意力。 */
.person-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.person-card-actions :deep(.el-button) {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  padding: 0 2px;
  font-size: 12px;
  justify-content: center;
  color: var(--el-text-color-secondary);
}

.person-card-actions :deep(.el-button.el-button--danger) {
  color: var(--el-text-color-secondary);
}

.person-card-actions :deep(.el-button:hover:not(.is-disabled)) {
  color: var(--el-color-primary);
}

.person-card-actions :deep(.el-button.el-button--danger:hover:not(.is-disabled)) {
  color: var(--el-color-danger);
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

  .person-avatar-wrap {
    flex-basis: 40px;
    width: 40px;
    height: 40px;
  }

  .person-avatar {
    font-size: 16px;
  }

  /* 窄屏四列图标按钮：等宽 24px、等距 2px（375 档实测一行 102px，卡内 143px 富余） */
  .person-card-actions {
    gap: 2px;
  }

  .person-card-actions :deep(.el-button) {
    min-width: 24px;
    padding: 0;
  }

  .person-counts {
    font-size: 11px;
  }

  /* 窄屏（375 档保持 2 列 ≈ 143px 卡内宽）：3 个 chip 会有 226px，一行放不下。
     这里只留**第 1 个**（"身高 160cm" 约 67px，完整可读），其余在手机上隐藏 ——
     比「一排被省略号切碎的 身高… 体… 三围…」可读得多，卡片也仍然是整墙等高。
     第 1 个是谁仍由工具栏「资料」开关的优先顺序决定；完整的 3 个 chip 在 ≥769px 显示，
     全部资料在站内详情页。 */
  .person-chip:nth-child(n + 2) {
    display: none;
  }

  .person-chip {
    font-size: 10px;
    padding: 0 5px;
  }

  .person-act-text {
    display: none;
  }
}
</style>
