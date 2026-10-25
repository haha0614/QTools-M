<template>
  <div class="dup-view">
    <p class="dup-lead">
      按<strong>文件内容哈希</strong>分组的重复文件：一组里只有一条主文件，其余都是副本。
      <strong>清理副本</strong>默认只删索引记录（磁盘文件不动），勾选后才会把副本文件移入回收站（可在回收站恢复）。
      <strong>设为主文件</strong>只改索引记录，不移动任何文件。
    </p>

    <!-- 顶部：kind 切换 + 统计（组数取后端 total，可省空间只统计本页并明确标注） -->
    <div class="dup-head">
      <el-radio-group :model-value="kind" size="small" :disabled="!!loading" @update:model-value="(v) => emit('kind-change', v)">
        <el-radio-button v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</el-radio-button>
      </el-radio-group>
      <div class="dup-stats">
        <span class="dup-stat">重复组 <b>{{ totals.groups }}</b></span>
        <span class="dup-stat">可省空间 <b>{{ totals.bytesText }}</b><i class="dup-stat-note">（本页合计）</i></span>
      </div>
      <el-button icon="Refresh" size="small" :loading="!!loading" @click="emit('refresh')">刷新</el-button>
    </div>

    <!-- 接口未就绪 / 读取失败：就地提示，不弹全局错误，也不影响页面其它标签页 -->
    <el-alert
      v-if="view.state === 'error'"
      :title="view.notReady ? '接口未就绪' : '读取失败'"
      type="warning"
      :closable="false"
      show-icon
      class="dup-alert"
    >
      <template #default>
        <div class="dup-alert-body">
          <p class="dup-alert-text">{{ view.message }}</p>
          <el-button size="small" icon="Refresh" @click="emit('refresh')">重试</el-button>
        </div>
      </template>
    </el-alert>

    <!-- 空态：后端正常但没有重复 -->
    <el-empty v-else-if="view.state === 'empty'" :description="emptyText" :image-size="72" class="dup-empty" />

    <!--
      数据态（P4.1）：每组一张卡片，左主文件大图 / 右副本小图列表。
      窄屏（<1200px）改上下：主文件在上，副本列表在下并横向滚动（.is-stacked）。
    -->
    <div v-else v-loading="view.state === 'loading'" class="dup-grid" :class="{ 'is-stacked': narrow }">
      <article v-for="(row, index) in rows" :key="keyOf(row, index)" class="dup-card">
        <div class="dup-card-body">
          <!-- 左栏：主文件大缩略图 + 路径 + 大小 -->
          <div class="dup-card-main">
            <div class="dup-thumb dup-thumb--main">
              <img
                v-if="imgSrc(primaryThumb(row))"
                :src="imgSrc(primaryThumb(row))"
                class="dup-img"
                :alt="primaryPath(row)"
                loading="lazy"
                @error="onThumbError(primaryThumb(row))"
              />
              <span v-else class="dup-img-ph dup-img-ph--main">{{ fileInitial(primaryPath(row)) }}</span>
              <span class="dup-badge">主文件</span>
            </div>
            <div class="dup-main-meta">
              <span class="dup-path" :title="primaryPath(row)">{{ primaryPath(row) }}</span>
              <span class="dup-meta">{{ formatBytes(row.primary && row.primary.size) }}</span>
            </div>
          </div>

          <!-- 右栏：副本列表（72×48 小图 + 路径 + 大小 + 两个操作），超过 6 行展开并内部滚动 -->
          <div class="dup-card-alias">
            <div class="dup-alias-head">重复文件 <b>{{ aliasCount(row) }}</b></div>
            <div v-if="!aliasCount(row)" class="dup-alias-empty">这组没有副本（只有一条主文件）</div>
            <ul v-else class="dup-alias-list" :class="{ 'is-expanded': isExpanded(row, index) }">
              <li v-for="(a, ai) in shownAliases(row, index)" :key="aliasKey(a, ai, keyOf(row, index))" class="dup-alias">
                <div class="dup-thumb dup-thumb--alias">
                  <img
                    v-if="imgSrc(aliasThumb(row, a))"
                    :src="imgSrc(aliasThumb(row, a))"
                    class="dup-img"
                    :alt="itemPath(a)"
                    loading="lazy"
                    @error="onThumbError(aliasThumb(row, a))"
                  />
                  <span v-else class="dup-img-ph">{{ fileInitial(itemPath(a)) }}</span>
                </div>
                <div class="dup-alias-meta">
                  <span class="dup-path" :title="itemPath(a)">{{ itemPath(a) }}</span>
                  <span class="dup-meta">{{ formatBytes(a.size) }}</span>
                </div>
                <div class="dup-alias-ops">
                  <el-button link type="primary" size="small" v-hasPermi="['media:admin:edit']" @click="emit('keep', row, a)">
                    设为主文件
                  </el-button>
                  <!-- 后端 merge 按 contentHash 整组清理，单副本行只是同一动作的入口 -->
                  <el-button
                    link
                    type="danger"
                    size="small"
                    title="清理本组副本（后端按内容哈希整组清理）"
                    v-hasPermi="['media:admin:edit']"
                    @click="emit('merge', row)"
                  >
                    清理
                  </el-button>
                </div>
              </li>
            </ul>
            <el-button
              v-if="hasMore(row)"
              link
              type="primary"
              size="small"
              class="dup-more"
              @click="toggleExpand(row, index)"
            >
              {{ isExpanded(row, index) ? '收起' : '展开全部' }}
              <template v-if="!isExpanded(row, index)">（还有 {{ hiddenCount(row) }} 个）</template>
            </el-button>
          </div>
        </div>

        <!-- 卡片底部：合计 + 组级勾选（决定移回收站还是仅删记录）+ 组级清理 -->
        <div class="dup-card-foot">
          <span class="dup-card-sum">
            共 {{ aliasCount(row) }} 个副本 · 可省 {{ formatBytes(groupWasted(row)) }}
          </span>
          <span class="dup-card-hash" :title="row.contentHash || ''">哈希 {{ row.contentHash || '（后端未返回）' }}</span>
          <span class="dup-foot-spacer"></span>
          <el-checkbox
            size="small"
            :model-value="isTrash(row, index)"
            :disabled="!aliasCount(row)"
            @update:model-value="(v) => emit('trash-change', row, v)"
          >
            移入回收站
          </el-checkbox>
          <el-button
            type="danger"
            plain
            size="small"
            :disabled="!aliasCount(row)"
            v-hasPermi="['media:admin:edit']"
            @click="emit('merge', row)"
          >
            清理本组
          </el-button>
        </div>
      </article>
    </div>

    <div v-if="view.state === 'data'" class="dup-foot">
      <el-pagination
        :current-page="page"
        :page-size="size"
        :page-sizes="PAGE_SIZES"
        :total="total"
        layout="total, sizes, prev, pager, next"
        background
        size="small"
        @current-change="(p) => emit('page-change', p)"
        @size-change="(s) => emit('size-change', s)"
      />
    </div>
  </div>
</template>

<script setup name="DuplicatesView">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  ALIAS_PREVIEW_LIMIT,
  KINDS,
  PAGE_SIZES,
  aliasKey,
  aliasWindow,
  fileInitial,
  formatBytes,
  groupAliases,
  groupCount,
  groupKey,
  groupWasted,
  itemPath,
  markThumbBroken,
  primaryPath,
  thumbPath,
  thumbSrc
} from './duplicatesModel'

const props = defineProps({
  /** video | photo */
  kind: { type: String, default: 'video' },
  /** resolveViewState() 的结果：{ state: loading|error|empty|data, message, notReady } */
  view: { type: Object, required: true },
  rows: { type: Array, default: () => [] },
  totals: { type: Object, default: () => ({ groups: 0, bytesText: '—' }) },
  emptyText: { type: String, default: '没有重复文件' },
  page: { type: Number, default: 1 },
  size: { type: Number, default: 10 },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  /** 已勾选「移入回收站」的组 key（勾选状态按组共享，面板持有唯一真值） */
  trashKeys: { type: Array, default: () => [] }
})

const emit = defineEmits(['refresh', 'kind-change', 'page-change', 'size-change', 'merge', 'keep', 'trash-change'])

/** 非 axios 资源统一加后端前缀（dev 走 /dev-api 代理，prod 与 axios baseURL 一致） */
const BASE_API = (import.meta.env && import.meta.env.VITE_APP_BASE_API) || ''

/** 缩略图 404 记录：按 URL 记，命中后改渲染占位块，不显示破图也不再重试 */
const broken = reactive({})
/** 展开全部：按组 key 记，收起后回到前 6 行 */
const expanded = reactive({})

const NARROW_QUERY = '(max-width: 1200px)'
const narrow = useNarrow()

/** 断点判定：同步读 matchMedia（首屏即正确），挂载后再跟随变化 */
function useNarrow() {
  const state = ref(false)
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return state
  const mq = window.matchMedia(NARROW_QUERY)
  state.value = !!(mq && mq.matches)
  const onChange = (e) => {
    state.value = !!(e && 'matches' in e ? e.matches : mq.matches)
  }
  onMounted(() => {
    if (mq && typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
    else if (mq && typeof mq.addListener === 'function') mq.addListener(onChange)
  })
  onUnmounted(() => {
    if (mq && typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange)
    else if (mq && typeof mq.removeListener === 'function') mq.removeListener(onChange)
  })
  return state
}

function keyOf(row, index) {
  return groupKey(row, index)
}

/** 副本数（主文件之外的条数） */
function aliasCount(row) {
  const list = groupAliases(row)
  return list.length || Math.max(0, groupCount(row) - 1)
}

function primaryThumb(row) {
  return thumbPath(props.kind, row && row.primary, row && row.contentHash)
}

function aliasThumb(row, alias) {
  return thumbPath(props.kind, alias, row && row.contentHash)
}

/** 可显示时才给 src；空串 = 渲染占位块 */
function imgSrc(path) {
  const url = thumbSrc(broken, path)
  if (!url) return ''
  return url.startsWith('http') ? url : BASE_API + url
}

function onThumbError(path) {
  markThumbBroken(broken, path)
}

function shownAliases(row, index) {
  return aliasWindow(groupAliases(row), ALIAS_PREVIEW_LIMIT, isExpanded(row, index)).visible
}

function hasMore(row) {
  return aliasWindow(groupAliases(row), ALIAS_PREVIEW_LIMIT).more
}

function hiddenCount(row) {
  return aliasWindow(groupAliases(row), ALIAS_PREVIEW_LIMIT).hidden
}

function isExpanded(row, index) {
  return !!expanded[keyOf(row, index)]
}

function toggleExpand(row, index) {
  const key = keyOf(row, index)
  expanded[key] = !expanded[key]
}

function isTrash(row, index) {
  const list = Array.isArray(props.trashKeys) ? props.trashKeys : []
  return list.indexOf(keyOf(row, index)) >= 0
}
</script>

<style scoped>
.dup-view {
  padding-bottom: 8px;
}

.dup-lead {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
}

.dup-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.dup-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.dup-stat b {
  font-size: 15px;
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}

.dup-stat-note {
  font-style: normal;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 2px;
}

.dup-alert {
  margin-bottom: 10px;
}

.dup-alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.dup-alert-text {
  margin: 0;
  flex: 1 1 240px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.dup-empty {
  padding: 18px 0;
}

/* ============================================================ 卡片列表 */

.dup-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 120px;
}

.dup-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background-color: var(--el-bg-color);
  padding: 12px;
  transition: border-color 0.15s;
}

.dup-card:hover {
  border-color: var(--el-color-primary-light-5);
}

/* 左主文件 / 右副本 */
.dup-card-body {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.dup-card-main {
  flex: 0 0 180px;
  width: 180px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dup-main-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dup-card-alias {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dup-alias-head {
  font-size: 12.5px;
  color: var(--el-text-color-secondary);
}

.dup-alias-head b {
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}

/* 缩略图：主图 180×112.5（16:10），副本小图 72×48（3:2） */
.dup-thumb {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  background-color: var(--el-fill-color-dark);
}

.dup-thumb--main {
  width: 180px;
  aspect-ratio: 16 / 10;
}

.dup-thumb--alias {
  flex: 0 0 72px;
  width: 72px;
  aspect-ratio: 3 / 2;
}

.dup-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 缩略图缺失 / 404：灰底 + 文件名首字，不出破图 */
.dup-img-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background-color: var(--el-fill-color-dark);
  color: var(--el-text-color-secondary);
  font-size: 15px;
  font-weight: 600;
  user-select: none;
}

.dup-img-ph--main {
  font-size: 26px;
}

.dup-badge {
  position: absolute;
  left: 0;
  bottom: 0;
  padding: 0 6px;
  border-radius: 0 6px 0 0;
  background-color: var(--el-color-primary);
  color: var(--el-color-white);
  font-size: 11px;
  line-height: 18px;
}

/* 副本行：72×48 小图 + 路径 + 大小 + 操作 */
.dup-alias-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.dup-alias-list.is-expanded {
  max-height: 348px;
  overflow-y: auto;
  padding-right: 2px;
}

.dup-alias {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.dup-alias:last-child {
  border-bottom: none;
}

.dup-alias-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dup-alias-ops {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dup-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  color: var(--el-text-color-primary);
}

.dup-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.dup-alias-empty {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.dup-more {
  align-self: flex-start;
}

/* 卡片底部：合计 / 哈希 / 勾选 / 组级清理 */
.dup-card-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color-lighter);
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}

.dup-card-sum {
  font-variant-numeric: tabular-nums;
}

.dup-card-hash {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}

.dup-foot-spacer {
  flex: 1 1 auto;
}

/* ====================================================== 窄屏（<1200px） */

/* 主文件在上，副本列表在下并横向滚动 */
.dup-grid.is-stacked .dup-card-body {
  flex-direction: column;
}

.dup-grid.is-stacked .dup-card-main {
  flex: 0 0 auto;
  width: 100%;
}

.dup-grid.is-stacked .dup-alias-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.dup-grid.is-stacked .dup-alias-list.is-expanded {
  max-height: none;
  overflow-y: visible;
}

.dup-grid.is-stacked .dup-alias {
  flex: 0 0 320px;
  border-bottom: none;
}

.dup-grid.is-stacked .dup-alias-ops {
  flex-wrap: wrap;
}

.dup-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

@media (max-width: 768px) {
  .dup-foot {
    justify-content: center;
  }

  .dup-card-hash {
    max-width: 100%;
  }
}
</style>
