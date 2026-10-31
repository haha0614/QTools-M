<template>
  <div class="app-container review-page" v-loading="loading">
    <div class="rv-head">
      <h2 class="rv-title">内容审核</h2>
      <p class="rv-sub">
        新扫描 / 新导入的相册与视频默认「待审核」，<b>不对外展示</b>；通过后才按分级对访客可见，驳回的永不展示（后台保留）。
        表格里可以直接<b>预览内容、改分级、改人物</b>，确认没问题再点「通过」。
      </p>
      <el-radio-group v-model="mode" class="rv-mode" @change="onModeChange">
        <el-radio-button value="content">内容审核</el-radio-button>
        <el-radio-button value="inbound">入站队列</el-radio-button>
        <el-radio-button value="rating">分级复核</el-radio-button>
      </el-radio-group>
    </div>

    <!-- ============================== 入站队列（P6.55） ============================== -->
    <template v-if="mode === 'inbound'">
      <p class="rv-sub rv-inbound-tip">
        扫进来但还没被「采纳 + 通过」的册：<b>建议册</b>（扫描按目录给的）与<b>待审册</b>。
        每本册在这里定三件事之一：通过并采纳（站端可见）、并入另一册、打散为未归类。
      </p>
      <div class="rv-tools">
        <el-input v-model="keyword" placeholder="搜索标题 / 目录" clearable style="width: 220px"
          @keyup.enter="loadInbound" @clear="loadInbound" />
        <el-button @click="loadInbound">搜索</el-button>
        <span class="rv-spacer" />
        <el-button type="success" :disabled="!inboundSelection.length"
          data-testid="inbound-batch-approve" @click="approveInboundIds(inboundSelection.map((r) => r.id))">
          通过并采纳选中（{{ inboundSelection.length }}）
        </el-button>
      </div>
      <el-table v-loading="inboundLoading" :data="inboundRows" class="rv-table" row-key="id"
        @selection-change="(rows) => (inboundSelection = rows)">
        <el-table-column type="selection" width="44" align="center" />
        <el-table-column label="封面" width="76" align="center">
          <template #default="scope">
            <img class="rv-thumb" :src="mediaSrc(inboundThumb(scope.row))" loading="lazy" alt="封面" />
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="220">
          <template #default="scope">
            <span>{{ scope.row.title }}</span>
            <el-tag v-if="!scope.row.confirmed" size="small" type="warning" class="rv-suggest">建议册</el-tag>
            <el-tag v-if="scope.row.reviewState === 'pending'" size="small" type="info" class="rv-suggest">待审核</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="目录" prop="dir" min-width="200" :show-overflow-tooltip="true" />
        <el-table-column label="张数" prop="count" width="80" align="right" />
        <el-table-column label="决定" width="300" align="center">
          <template #default="scope">
            <el-button link type="success" size="small" data-testid="inbound-approve"
              @click="approveInboundIds([scope.row.id])">通过并采纳</el-button>
            <el-button link type="primary" size="small" data-testid="inbound-merge"
              @click="openInboundMerge(scope.row)">并入另一册…</el-button>
            <el-button link type="danger" size="small" data-testid="inbound-detach"
              @click="detachInboundAlbum(scope.row)">打散为未归类</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!inboundLoading && !inboundRows.length" description="入站队列已清空" />
      <pagination v-show="inboundTotal > 0" :page-sizes="[10, 20, 50]" :total="inboundTotal"
        v-model:page="inboundQuery.page" v-model:limit="inboundQuery.size" @pagination="loadInbound" />

      <el-dialog v-model="inboundMergeVisible" title="并入另一册" width="min(560px, 92vw)" append-to-body>
        <p class="rv-sub">把「{{ inboundMergeSource && inboundMergeSource.title }}」整本并到目标册；册会消失，照片归目标册。</p>
        <el-select v-model="inboundMergeTarget" filterable remote clearable placeholder="搜索目标相册"
          :remote-method="searchInboundTargets" :loading="inboundMergeLoading" style="width: 100%">
          <el-option v-for="a in inboundMergeOptions" :key="a.id"
            :label="(a.title || a.id) + '（' + (a.photoCount || 0) + ' 张）'" :value="a.id" />
        </el-select>
        <template #footer>
          <el-button @click="inboundMergeVisible = false">取消</el-button>
          <el-button type="primary" :loading="inboundMergeBusy" :disabled="!inboundMergeTarget"
            @click="doInboundMerge">确认并入</el-button>
        </template>
      </el-dialog>
    </template>

    <!-- ============================== 内容审核 ============================== -->
    <template v-if="mode === 'content'">
      <div class="rv-cards">
        <div class="rv-card" v-for="c in cards" :key="c.key" :class="{ active: type === c.key }" @click="switchType(c.key)">
          <div class="rv-card-title">{{ c.label }}</div>
          <div class="rv-card-nums">
            <span class="n-pending">待审 {{ c.pending }}</span>
            <span class="n-approved">通过 {{ c.approved }}</span>
            <span class="n-rejected">驳回 {{ c.rejected }}</span>
          </div>
        </div>
      </div>

      <el-tabs v-model="state" @tab-change="reload">
        <el-tab-pane label="待审核" name="pending" />
        <el-tab-pane label="已通过" name="approved" />
        <el-tab-pane label="已驳回" name="rejected" />
      </el-tabs>

      <div class="rv-tools">
        <el-input v-model="keyword" placeholder="搜索标题 / 目录" clearable style="width: 220px" @keyup.enter="reload" />
        <el-button @click="reload">搜索</el-button>
        <el-button @click="resetFilters">重置</el-button>
        <span class="rv-spacer" />
        <el-button type="success" :disabled="!selection.length" @click="batch('approved')">通过选中（{{ selection.length }}）</el-button>
        <el-button type="danger" plain :disabled="!selection.length" @click="batch('rejected')">驳回选中</el-button>
      </div>

      <el-table :data="rows" border row-key="id" @selection-change="onSelect">
        <el-table-column type="selection" width="42" />
        <el-table-column label="封面" width="100">
          <template #default="{ row }">
            <img class="rv-cover" :src="mediaSrc(thumbOf(row))" loading="lazy" alt=""
              :title="type === 'video' ? '点击播放' : '点击预览本册'" @click="openPreview(row)" />
          </template>
        </el-table-column>
        <el-table-column label="标题 / 目录" min-width="210">
          <template #default="{ row }">
            <div class="rv-title-cell rv-link" @click="openPreview(row)">{{ row.title || row.id }}</div>
            <div class="rv-dir">{{ row.dir }}</div>
          </template>
        </el-table-column>
        <el-table-column label="人物" width="180">
          <template #default="{ row }">
            <el-select :model-value="personIdsOf(row)" multiple collapse-tags collapse-tags-tooltip
              size="small" placeholder="未设置" class="rv-person" @change="(v) => changePersons(row, v)">
              <el-option v-for="p in people" :key="p.id" :label="p.name" :value="Number(p.id)" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :label="type === 'album' ? '张数' : '大小'" width="92" align="right">
          <template #default="{ row }">
            {{ type === 'album' ? (row.count || 0) + ' 张' : formatBytes(row.bytes) }}
          </template>
        </el-table-column>
        <el-table-column label="分级" width="140">
          <template #default="{ row }">
            <el-select :model-value="row.contentRating || 'general'" size="small" class="rv-rating-select"
              @change="(v) => changeRating(row, v)">
              <el-option label="大众级" value="general" />
              <el-option label="家长指导" value="guidance" />
              <el-option label="限制级" value="restricted" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="84">
          <template #default="{ row }">
            <span class="rv-state" :class="row.reviewState">{{ stateText(row.reviewState) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="196" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openPreview(row)">预览</el-button>
            <el-button v-if="row.reviewState !== 'approved'" link type="success" @click="setOne(row, 'approved')">通过</el-button>
            <el-button v-if="row.reviewState !== 'rejected'" link type="danger" @click="setOne(row, 'rejected')">驳回</el-button>
            <el-button v-if="row.reviewState !== 'pending'" link @click="setOne(row, 'pending')">退回</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination class="rv-page" background layout="total, sizes, prev, pager, next"
        :total="total" :page-size="query.size" :current-page="query.page"
        :page-sizes="[20, 50, 100]" @size-change="onSize" @current-change="onPage" />
    </template>

    <!-- ============================== 分级复核 ============================== -->
    <template v-else>
      <div class="rv-rhead">
        <span>模型判不了、需要人工定档的照片：<b>{{ ratingTotal }}</b> 张</span>
        <span class="rv-hint">点「限 / 指 / 大」直接定档（写入图片分级，并从队列消失）；不点就保持继承</span>
      </div>
      <div class="rv-rgrid" v-if="ratingRows.length">
        <div class="rv-ritem" v-for="p in ratingRows" :key="p.id">
          <img :src="mediaSrc('/api/media/thumb/p/' + p.albumId + '/' + padSeq(p.seq))" loading="lazy" alt="" />
          <div class="rv-rmeta" :title="p.albumTitle">
            {{ p.albumTitle }} · #{{ Number(p.seq) + 1 }} · {{ Math.round((p.autoPorn || 0) * 100) }}%
          </div>
          <div class="rv-rbtns">
            <button type="button" @click="decideRating(p, 'restricted')">限</button>
            <button type="button" @click="decideRating(p, 'guidance')">指</button>
            <button type="button" @click="decideRating(p, 'general')">大</button>
          </div>
        </div>
      </div>
      <el-empty v-else description="没有待复核的照片（跑一次自动分级后，模型判不了的会出现在这里）" />
      <el-pagination class="rv-page" background layout="total, prev, pager, next"
        :total="ratingTotal" :page-size="ratingQuery.size" :current-page="ratingQuery.page"
        @current-change="onRatingPage" />
    </template>



    <el-dialog v-model="videoVisible" :title="videoTitle" width="min(1100px, 94vw)" append-to-body destroy-on-close>
      <video v-if="videoSrc" :src="videoSrc" controls autoplay class="rv-video"></video>
    </el-dialog>

    <!-- 本册图片：预览 + 单张/批量定级（就在审核页里做，不再跳转） -->
    <el-dialog v-model="pvVisible" :title="'预览 · ' + pvTitle" width="min(1180px, 96vw)" append-to-body>
      <div class="pv-bar">
        <span class="pv-count">共 {{ pvRows.length }} 张</span>
        <span class="pv-count" v-if="pvSelected.length">已选 {{ pvSelected.length }}</span>
        <el-button size="small" @click="pvSelectAll">{{ pvSelected.length === pvRows.length && pvRows.length ? '取消全选' : '全选' }}</el-button>
        <el-button size="small" :disabled="!pvSelected.length" @click="pvSelected = []">清空选择</el-button>
        <span class="pv-spacer" />
        <el-button size="small" type="primary" plain @click="pvAutoVisible = true">自动分级</el-button>
        <template v-if="pvSelected.length">
          <el-button size="small" type="success" :disabled="pvBusy" @click="pvBatch('general')">设大众</el-button>
          <el-button size="small" type="warning" :disabled="pvBusy" @click="pvBatch('guidance')">设指导</el-button>
          <el-button size="small" type="danger" :disabled="pvBusy" @click="pvBatch('restricted')">设限制</el-button>
          <el-button size="small" :disabled="pvBusy" @click="pvBatch(null)">继承相册</el-button>
        </template>
      </div>
      <div class="pv-grid" v-if="pvRows.length">
        <div class="pv-item" v-for="p in pvRows" :key="p.id" :class="{ on: pvIsSelected(p.id) }">
          <img :src="mediaSrc(p.thumb)" loading="lazy" alt="" :title="'第 ' + (Number(p.seq) + 1) + ' 张 · ' + pvRatingLabel(p.rating)"
            @click="openBig(p)" />
          <span class="pv-badge" :class="p.rating || 'inherit'">{{ pvRatingShort(p.rating) }}</span>
          <span class="pv-check" @click.stop="togglePv(p.id)">{{ pvIsSelected(p.id) ? '✓' : '' }}</span>
        </div>
      </div>
      <el-empty v-else description="没有图片" />
    </el-dialog>

    <!-- 大图 + 单张定级 -->
    <el-dialog v-model="pvBigVisible" :title="pvBig ? ('第 ' + (Number(pvBig.seq) + 1) + ' 张 · ' + pvRatingLabel(pvBig.rating)) : ''"
      width="min(1200px, 96vw)" append-to-body>
      <div class="pv-big-status" v-if="pvBig">
        当前分级
        <b class="pv-big-rating" :class="pvBig.rating || 'inherit'">{{ pvRatingLabel(pvBig.rating) }}</b>
        <span class="pv-big-sub">册级：{{ pvRatingLabel(pvAlbum.rating) }}（没单独设过的图跟着册级走）</span>
        <span class="pv-big-keys">← → 切换上下一张</span>
      </div>
      <div class="pv-big" v-if="pvBig">
        <img :src="mediaSrc(pvBig.big)" alt="" @error="onBigError" />
        <span class="pv-big-hint" v-if="bigFailed">大图不可用，已回退到缩略图</span>
      </div>
      <div class="pv-big-bar">
        <el-button size="small" :disabled="pvBigIndex <= 0" @click="stepBig(-1)">上一张</el-button>
        <el-button size="small" :disabled="pvBigIndex >= pvRows.length - 1" @click="stepBig(1)">下一张</el-button>
        <span class="pv-spacer" />
        <template v-if="pvBig">
          <el-button size="small" type="success" :plain="pvBig.rating !== 'general'" :disabled="pvBusy" @click="pvSetRating([pvBig.id], 'general')">大众</el-button>
          <el-button size="small" type="warning" :plain="pvBig.rating !== 'guidance'" :disabled="pvBusy" @click="pvSetRating([pvBig.id], 'guidance')">指导</el-button>
          <el-button size="small" type="danger" :plain="pvBig.rating !== 'restricted'" :disabled="pvBusy" @click="pvSetRating([pvBig.id], 'restricted')">限制</el-button>
          <el-button size="small" :plain="!!pvBig.rating" :disabled="pvBusy" @click="pvSetRating([pvBig.id], null)">继承相册</el-button>
        </template>
      </div>
    </el-dialog>

    <PhotoAutoRateDialog v-model="pvAutoVisible" :album-id="pvAlbum.id" :album-title="pvTitle"
      :items="pvRows" @applied="onAutoRated" />

  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getReviewSummary, listReview, setReviewState, listRatingReview, decideRatingReview,
  listPeople, setAlbumRating, setVideoRating, setAlbumPersons, setVideoPersons, setRatingBatch, getAlbumPhotos,
  approveInbound, detachAlbum, mergeAlbums, listAlbums
} from '@/api/media'
import PhotoAutoRateDialog from './PhotoAutoRateDialog.vue'

const MEDIA_BASE = import.meta.env.VITE_APP_BASE_API || ''

const loading = ref(false)
const mode = ref('content')
const type = ref('album')
const state = ref('pending')
const keyword = ref('')
const rows = ref([])
const total = ref(0)
const selection = ref([])
const summary = ref({ album: {}, video: {} })
const query = reactive({ page: 1, size: 20 })
const people = ref([])

/* P6.55：入站队列（建议册 + 待审册，一行三个决定） */
const inboundRows = ref([])
const inboundTotal = ref(0)
const inboundLoading = ref(false)
const inboundSelection = ref([])
const inboundQuery = reactive({ page: 1, size: 10 })
const inboundMergeVisible = ref(false)
const inboundMergeSource = ref(null)
const inboundMergeTarget = ref('')
const inboundMergeOptions = ref([])
const inboundMergeLoading = ref(false)
const inboundMergeBusy = ref(false)

const ratingRows = ref([])
const ratingTotal = ref(0)
const ratingQuery = reactive({ page: 1, size: 60 })


const cards = computed(() => [
  { key: 'album', label: '相册', ...(summary.value.album || {}) },
  { key: 'video', label: '视频', ...(summary.value.video || {}) }
])

/** 入站队列的封面：封面路径可能还没生成，用相册 id + 首图序号兜底 */
function inboundThumb(row) {
  return row && row.cover ? row.cover : '/api/media/thumb/p/' + (row && row.id) + '/0000'
}

async function loadInbound() {
  inboundLoading.value = true
  try {
    const res = await listReview({
      type: 'album',
      inbound: true,
      keyword: keyword.value,
      page: inboundQuery.page,
      size: inboundQuery.size
    })
    inboundRows.value = (res && res.rows) || []
    inboundTotal.value = (res && res.total) || 0
  } catch (e) {
    inboundRows.value = []
    inboundTotal.value = 0
    proxy.$modal.msgError('读取入站队列失败：' + errText(e))
  } finally {
    inboundLoading.value = false
  }
}

/** 通过并采纳：一次点击 = 审核通过 + 采纳（站端可见） */
async function approveInboundIds(ids) {
  const list = (ids || []).filter(Boolean)
  if (!list.length) return
  try {
    const res = await approveInbound(list)
    proxy.$modal.msgSuccess('已通过并采纳 ' + ((res && res.approved) || list.length) + ' 本册（站端可见）')
    loadInbound()
    loadSummary()
  } catch (e) {
    proxy.$modal.msgError('操作失败：' + errText(e))
  }
}

/** 打散为未归类：册里的照片全部变无册，册本身下一轮扫描自动清掉 */
async function detachInboundAlbum(row) {
  if (!row || !row.id) return
  try {
    await proxy.$modal.confirm('把「' + (row.title || row.id) + '」里的 ' + (row.count || 0)
      + ' 张全部打散成「未归类」？\n\n照片不会删除，只是不再属于任何册；这本册下一轮扫描会被清掉。')
  } catch (e) {
    return
  }
  try {
    const res = await detachAlbum(row.id)
    proxy.$modal.msgSuccess('已打散 ' + ((res && res.detached) || 0) + ' 张 → 未归类')
    loadInbound()
    loadSummary()
  } catch (e) {
    proxy.$modal.msgError('打散失败：' + errText(e))
  }
}

function openInboundMerge(row) {
  inboundMergeSource.value = row
  inboundMergeTarget.value = ''
  inboundMergeOptions.value = []
  inboundMergeVisible.value = true
  searchInboundTargets('')
}

async function searchInboundTargets(kw) {
  inboundMergeLoading.value = true
  try {
    const res = await listAlbums({ keyword: kw || '', pageNum: 1, pageSize: 30, hidden: 'all' })
    const selfId = inboundMergeSource.value && inboundMergeSource.value.id
    inboundMergeOptions.value = ((res && res.rows) || []).filter((a) => a.id !== selfId)
  } catch (e) {
    inboundMergeOptions.value = []
  } finally {
    inboundMergeLoading.value = false
  }
}

async function doInboundMerge() {
  if (!inboundMergeSource.value || !inboundMergeTarget.value) return
  inboundMergeBusy.value = true
  try {
    const res = await mergeAlbums(inboundMergeSource.value.id, inboundMergeTarget.value)
    proxy.$modal.msgSuccess('已并入：移动 ' + ((res && res.moved) || 0) + ' 张')
    inboundMergeVisible.value = false
    loadInbound()
    loadSummary()
  } catch (e) {
    proxy.$modal.msgError('并入失败：' + errText(e))
  } finally {
    inboundMergeBusy.value = false
  }
}

function mediaSrc(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : MEDIA_BASE + path
}

function padSeq(seq) {
  return String(Number(seq) || 0).padStart(4, '0')
}

function thumbOf(row) {
  if (type.value === 'video') return '/api/media/thumb/v/' + row.id
  const matched = /\/p\/[^/]+\/(\d+)\./.exec((row && row.cover) || '')
  const seq = matched ? matched[1] : '0000'
  return '/api/media/thumb/p/' + row.id + '/' + seq
}

function formatBytes(n) {
  const v = Number(n) || 0
  if (v < 1024) return v + ' B'
  if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB'
  if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
  return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function ratingText(r) {
  return r === 'restricted' ? '限制级' : r === 'guidance' ? '家长指导' : '大众级'
}

function stateText(s) {
  return s === 'approved' ? '已通过' : s === 'rejected' ? '已驳回' : '待审核'
}

function personIdsOf(row) {
  return String(row.personIds || '')
    .split(',')
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0)
}

async function loadPeople() {
  try {
    const list = await listPeople()
    people.value = Array.isArray(list) ? list : (list && list.rows) || []
  } catch (e) {
    people.value = []
  }
}

async function loadSummary() {
  try {
    summary.value = (await getReviewSummary()) || { album: {}, video: {} }
  } catch (e) {
    // 统计失败不阻塞列表
  }
}

async function reload() {
  loading.value = true
  try {
    const res = await listReview({ type: type.value, state: state.value, keyword: keyword.value, ...query })
    rows.value = (res && res.rows) || []
    total.value = (res && res.total) || 0
  } catch (e) {
    ElMessage.error('加载失败：' + ((e && e.message) || '请求失败'))
  } finally {
    loading.value = false
  }
  loadSummary()
}

async function loadRating() {
  loading.value = true
  try {
    const res = await listRatingReview({ ...ratingQuery })
    ratingRows.value = (res && res.rows) || []
    ratingTotal.value = (res && res.total) || 0
  } catch (e) {
    ElMessage.error('加载失败：' + ((e && e.message) || '请求失败'))
  } finally {
    loading.value = false
  }
}

function onModeChange(value) {
  if (value === 'rating') loadRating()
  else if (value === 'inbound') loadInbound()
  else reload()
}

/** 后端错误体是 {"error":"..."}；axios 只有 "Request failed with status code 500" */
function errText(e) {
  const data = e && e.response && e.response.data
  if (data && typeof data === 'object') return data.error || data.msg || ''
  return (e && e.message) || '请求失败'
}

function switchType(kind) {
  if (type.value === kind) return
  type.value = kind
  query.page = 1
  reload()
}

function resetFilters() {
  keyword.value = ''
  query.page = 1
  reload()
}

function onSelect(list) {
  selection.value = list || []
}

function onSize(size) {
  query.size = size
  query.page = 1
  reload()
}

function onPage(page) {
  query.page = page
  reload()
}

function onRatingPage(page) {
  ratingQuery.page = page
  loadRating()
}

/* ---------------------------------------------------------------- 预览 */
function openPreview(row) {
  if (type.value === 'video') {
    if (!row.relPath) {
      ElMessage.warning('这条视频没有文件路径')
      return
    }
    // P6.46：视频在页内播放，不再新开标签
    videoTitle.value = row.title || row.id
    videoSrc.value = mediaSrc('/api/media/file?p=' + encodeURIComponent(row.relPath))
    videoVisible.value = true
    return
  }
  openAlbumPhotos(row)
}

/* -------------------------------------------------- 本册图片弹窗（预览 + 定级） */
const videoVisible = ref(false)
const videoSrc = ref('')
const videoTitle = ref('')

const pvVisible = ref(false)
const pvAlbum = ref({ id: '', title: '' })
const pvRows = ref([])
const pvSelected = ref([])
const pvBusy = ref(false)
const pvBig = ref(null)
const pvBigVisible = ref(false)
const bigFailed = ref(false)
const pvBigIndex = ref(-1)
const pvAutoVisible = ref(false)

const pvTitle = computed(() => pvAlbum.value.title || pvAlbum.value.id)

function pvRatingLabel(r) {
  return r === 'restricted' ? '限制级' : r === 'guidance' ? '家长指导级' : r === 'general' ? '大众级' : '继承相册'
}

function pvRatingShort(r) {
  return r === 'restricted' ? '限' : r === 'guidance' ? '指' : r === 'general' ? '大' : '继'
}

function pvIsSelected(id) {
  return pvSelected.value.some((x) => String(x) === String(id))
}

function togglePv(id) {
  const key = String(id)
  pvSelected.value = pvIsSelected(id)
    ? pvSelected.value.filter((x) => String(x) !== key)
    : pvSelected.value.concat([key])
}

function pvSelectAll() {
  pvSelected.value = pvSelected.value.length === pvRows.value.length
    ? []
    : pvRows.value.map((p) => String(p.id))
}

async function openAlbumPhotos(row) {
  pvAlbum.value = { id: String(row.id), title: row.title || '', rating: row.contentRating || 'general' }
  pvRows.value = []
  pvSelected.value = []
  pvVisible.value = true
  try {
    const list = await getAlbumPhotos(row.id)
    const arr = Array.isArray(list) ? list : (list && list.rows) || []
    pvRows.value = arr.map((p) => ({
      id: p.id,
      seq: p.seq,
      relPath: p.relPath,
      rating: p.contentRating || '',
      thumb: p.thumbUrl || '/api/media/thumb/p/' + row.id + '/' + padSeq(p.seq),
      // 大图直接用原图（预览产物不一定生成过：库里 pv 只有 896 个，相册却有一千多张）
      big: p.relPath ? '/api/media/file?p=' + encodeURIComponent(p.relPath) : (p.previewUrl || p.thumbUrl || '')
    }))
  } catch (e) {
    ElMessage.error('预览加载失败：' + ((e && e.message) || '请求失败'))
  }
}

function onBigError() {
  // 大图（preview 产物）没生成 / 404：回退到缩略图，别留一个空白弹窗
  if (pvBig.value && pvBig.value.big !== pvBig.value.thumb) {
    pvBig.value = { ...pvBig.value, big: pvBig.value.thumb }
    bigFailed.value = true
  }
}

function openBig(p) {
  pvBigIndex.value = pvRows.value.findIndex((x) => String(x.id) === String(p.id))
  pvBig.value = p
  bigFailed.value = false
  pvBigVisible.value = true
}

/* P6.43：左右方向键切换上一张 / 下一张（只在大图弹窗打开时生效） */
function onPreviewKeydown(e) {
  if (!pvBigVisible.value) return
  const el = e.target
  const tag = (el && el.tagName) || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    stepBig(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    stepBig(1)
  }
}

watch(pvBigVisible, (open) => {
  if (open) window.addEventListener('keydown', onPreviewKeydown)
  else window.removeEventListener('keydown', onPreviewKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onPreviewKeydown))

function stepBig(delta) {
  bigFailed.value = false
  const next = pvBigIndex.value + delta
  if (next < 0 || next >= pvRows.value.length) return
  pvBigIndex.value = next
  pvBig.value = pvRows.value[next]
}

/** 给指定图片设分级（rating=null → 继承相册） */
async function pvSetRating(ids, rating) {
  const list = (ids || []).map(String).filter(Boolean)
  if (!list.length) return
  pvBusy.value = true
  try {
    await setRatingBatch({ type: 'photo', ids: list, rating: rating || null })
    ElMessage.success('已设置 ' + list.length + ' 张' + (rating ? '为' + ratingText(rating) : '继承相册'))
    // 本地回写分级角标（大册不重拉，重拉太慢）
    // 原地改：整表替换会让千张缩略图集体重渲染，视觉上就是「闪一下」
    const hit = new Set(list)
    for (const p of pvRows.value) {
      if (hit.has(String(p.id))) p.rating = rating || ''
    }
    if (pvBig.value && hit.has(String(pvBig.value.id))) {
      pvBig.value.rating = rating || ''
    }
    pvSelected.value = []
  } catch (e) {
    ElMessage.error('设置失败：' + ((e && e.message) || '请求失败'))
  } finally {
    pvBusy.value = false
  }
}

function pvBatch(rating) {
  pvSetRating(pvSelected.value, rating)
}

/** 自动分级写完回填：重新拉一遍本册，保证缩略图上的分级是最新的 */
async function onAutoRated() {
  if (pvAlbum.value.id) {
    const row = { id: pvAlbum.value.id, title: pvAlbum.value.title }
    await openAlbumPhotos(row)
  }
  reload()
}


/* ---------------------------------------------------------------- 行内编辑 */
async function changeRating(row, rating) {
  if (!rating || rating === row.contentRating) return
  try {
    if (type.value === 'video') await setVideoRating(row.id, rating)
    else await setAlbumRating(row.id, rating)
    row.contentRating = rating
    ElMessage.success('分级已改为' + ratingText(rating))
  } catch (e) {
    ElMessage.error('改分级失败：' + ((e && e.message) || '请求失败'))
  }
}

async function changePersons(row, ids) {
  const list = (ids || []).map((x) => Number(x)).filter((x) => Number.isFinite(x))
  try {
    if (type.value === 'video') {
      await setVideoPersons(row.id, { personIds: list, roles: {} })
    } else {
      await setAlbumPersons(row.id, list)
    }
    row.personIds = list.join(',')
    row.persons = list
      .map((id) => (people.value.find((p) => Number(p.id) === id) || {}).name)
      .filter(Boolean)
      .join(' / ')
    ElMessage.success('人物已更新')
  } catch (e) {
    ElMessage.error('改人物失败：' + ((e && e.message) || '请求失败'))
  }
}

async function setOne(row, next) {
  try {
    await setReviewState({ type: type.value, ids: [row.id], state: next })
    row.reviewState = next
    ElMessage.success('已设为「' + stateText(next) + '」')
    loadSummary()
  } catch (e) {
    ElMessage.error('操作失败：' + ((e && e.message) || '请求失败'))
  }
}

async function batch(next) {
  const ids = selection.value.map((r) => r.id)
  if (!ids.length) return
  const label = next === 'approved' ? '通过' : '驳回'
  try {
    await ElMessageBox.confirm('把选中的 ' + ids.length + ' 项' + label + '？', '批量' + label, { type: 'warning' })
  } catch (e) {
    return
  }
  try {
    const res = await setReviewState({ type: type.value, ids, state: next })
    ElMessage.success('已' + label + ' ' + ((res && res.updated) || ids.length) + ' 项')
    reload()
  } catch (e) {
    ElMessage.error('操作失败：' + ((e && e.message) || '请求失败'))
  }
}

async function decideRating(photo, rating) {
  try {
    await decideRatingReview({ ids: [photo.id], rating })
    ratingRows.value = ratingRows.value.filter((p) => String(p.id) !== String(photo.id))
    ratingTotal.value = Math.max(0, ratingTotal.value - 1)
    ElMessage.success('已定为' + ratingText(rating))
  } catch (e) {
    ElMessage.error('定档失败：' + ((e && e.message) || '请求失败'))
  }
}

onMounted(() => {
  loadPeople()
  loadSummary()
  reload()
})
</script>

<style scoped>
.pv-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.pv-count { font-size: 12px; color: var(--el-text-color-secondary); }
.pv-spacer { flex: 1; }
.pv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; max-height: 65vh; overflow: auto; }
.pv-item { position: relative; line-height: 0; border-radius: 4px; overflow: hidden; }
.pv-item img { width: 100%; height: 130px; object-fit: cover; cursor: zoom-in; background: var(--el-fill-color-light); }
.pv-item.on { outline: 2px solid var(--el-color-primary); }
.pv-badge {
  position: absolute; left: 4px; top: 4px; padding: 0 5px; border-radius: 3px;
  font-size: 11px; line-height: 16px; color: #fff; background: rgba(0, 0, 0, 0.55);
}
.pv-badge.general { background: var(--el-color-success); }
.pv-badge.guidance { background: var(--el-color-warning); }
.pv-badge.restricted { background: var(--el-color-danger); }
.pv-badge.inherit { background: rgba(0, 0, 0, 0.45); }
.pv-check {
  position: absolute; right: 4px; top: 4px; width: 20px; height: 20px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.45); color: #fff; font-size: 12px; line-height: 20px; text-align: center;
  cursor: pointer; user-select: none;
}
.pv-item.on .pv-check { background: var(--el-color-primary); }
.pv-big { position: relative; display: flex; justify-content: center; align-items: center; min-height: 320px; background: #000; border-radius: 4px; }
.rv-video { width: 100%; max-height: 70vh; background: #000; }
.pv-big-status { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.pv-big-rating { padding: 0 8px; border-radius: 10px; color: #fff; background: var(--el-color-info); }
.pv-big-rating.general { background: var(--el-color-success); }
.pv-big-rating.guidance { background: var(--el-color-warning); }
.pv-big-rating.restricted { background: var(--el-color-danger); }
.pv-big-rating.inherit { background: var(--el-text-color-secondary); }
.pv-big-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.pv-big-keys { margin-left: auto; font-size: 12px; color: var(--el-text-color-placeholder); }
.pv-big-hint { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); font-size: 12px; color: var(--el-color-warning); }
.pv-big img { max-width: 100%; max-height: 72vh; object-fit: contain; }
.pv-big-bar { display: flex; align-items: center; gap: 8px; margin-top: 10px; }.review-page { padding: 16px 18px; }
.rv-head { margin-bottom: 6px; }
.rv-title { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
.rv-sub { margin: 0 0 10px; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.7; }
.rv-mode { margin-bottom: 10px; }
.rv-cards { display: flex; gap: 12px; margin-bottom: 8px; }
.rv-card {
  flex: 1; max-width: 320px; padding: 10px 14px; border: 1px solid var(--el-border-color);
  border-radius: 8px; cursor: pointer; background: var(--el-bg-color);
}
.rv-card.active { border-color: var(--el-color-primary); box-shadow: 0 0 0 1px var(--el-color-primary) inset; }
.rv-card-title { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.rv-card-nums { display: flex; gap: 12px; font-size: 12px; }
.n-pending { color: var(--el-color-warning); }
.n-approved { color: var(--el-color-success); }
.n-rejected { color: var(--el-color-danger); }
.rv-tools { display: flex; align-items: center; gap: 8px; margin: 4px 0 10px; }
.rv-spacer { flex: 1; }
.rv-cover { width: 72px; height: 46px; object-fit: cover; border-radius: 4px; cursor: pointer; background: var(--el-fill-color-light); }
.rv-title-cell { font-size: 13px; }
.rv-link { cursor: pointer; }
.rv-link:hover { color: var(--el-color-primary); }
.rv-dir { font-size: 11px; color: var(--el-text-color-secondary); word-break: break-all; }
.rv-person { width: 160px; }
.rv-rating-select { width: 126px; }
.rv-state { font-size: 12px; }
.rv-state.pending { color: var(--el-color-warning); }
.rv-state.approved { color: var(--el-color-success); }
.rv-state.rejected { color: var(--el-color-danger); }
.rv-page { margin-top: 12px; justify-content: flex-end; }
.rv-rhead { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; margin: 2px 0 10px; font-size: 13px; }
.rv-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.rv-rgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
.rv-ritem { line-height: 0; }
.rv-ritem img { width: 100%; height: 140px; object-fit: cover; border-radius: 5px; background: var(--el-fill-color-light); }
.rv-rmeta {
  margin-top: 4px; font-size: 11px; line-height: 1.4; color: var(--el-text-color-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.rv-rbtns { display: flex; gap: 4px; margin-top: 4px; }
.rv-rbtns button {
  flex: 1; font-size: 11px; line-height: 20px; padding: 0; cursor: pointer;
  border: 1px solid var(--el-border-color); border-radius: 4px; background: var(--el-bg-color);
  color: var(--el-text-color-regular);
}
.rv-rbtns button:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
</style>















