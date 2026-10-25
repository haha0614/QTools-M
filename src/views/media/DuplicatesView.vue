<template>
  <div class="dup-view">
    <p class="dup-lead">
      按<strong>文件内容哈希</strong>分组的重复文件：一组里只有一条主文件，其余都是副本。
      副本行上的<strong>清理</strong>只清这一条，卡片底部的<strong>清理本组</strong>才按内容哈希整组清理。
      清理默认只删索引记录（磁盘文件不动），勾选／确认后再把副本文件移入回收站（可在回收站恢复）。
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
            <div
              class="dup-thumb dup-thumb--main is-clickable"
              role="button"
              tabindex="0"
              title="点击查看大图"
              @click.stop="openPreview(row, 'primary')"
              @keydown.enter.prevent="openPreview(row, 'primary')"
              @keydown.space.prevent="openPreview(row, 'primary')"
            >
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
                <div
                  class="dup-thumb dup-thumb--alias is-clickable"
                  role="button"
                  tabindex="0"
                  title="点击查看大图"
                  @click.stop="openPreview(row, 'alias', a)"
                  @keydown.enter.prevent="openPreview(row, 'alias', a)"
                  @keydown.space.prevent="openPreview(row, 'alias', a)"
                >
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
                  <!-- .stop：点在行内操作上不能顺手弹出大图遮罩层 -->
                  <el-button link type="primary" size="small" v-hasPermi="['media:admin:edit']" @click.stop="emit('keep', row, a)">
                    设为主文件
                  </el-button>
                  <!-- P4.3：只清这一条（后端 remove 按 aliasId 定位）；整组清理在卡片底部「清理本组」 -->
                  <el-button
                    link
                    type="danger"
                    size="small"
                    title="只清理这一条副本"
                    v-hasPermi="['media:admin:edit']"
                    @click.stop="emit('remove', row, a)"
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
            @click.stop="emit('merge', row)"
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

    <!--
      P4.2 大图预览遮罩层（点主文件大图 / 副本小图打开）：
      ESC 关闭、点背景关闭、右上角关闭按钮、←/→ 在本组全部文件（主文件 + 副本）间循环切换。
      判定全在 duplicatesModel（openLightbox / lightboxStep / lightboxKey / previewFallbackStage），这里只搬状态。
    -->
    <teleport to="body">
      <div
        v-if="lightbox.open"
        class="dup-lb"
        role="dialog"
        aria-modal="true"
        :aria-label="'重复文件预览 ' + lightboxLabel(lightbox)"
        @click="onBackdrop"
      >
        <div class="dup-lb-panel">
          <div class="dup-lb-head">
            <span class="dup-lb-role">{{ lbCurrent.role === 'primary' ? '主文件' : '副本' }}</span>
            <span class="dup-lb-name" :title="lbPath">{{ lbName }}</span>
            <button type="button" class="dup-lb-btn dup-lb-close" title="关闭（ESC）" aria-label="关闭" @click.stop="closePreview">
              ×
            </button>
          </div>

          <!-- 舞台：点内容不关闭（背景点击才关），加载中转圈，失败给「加载失败 + 重试」，不出现破图 -->
          <div class="dup-lb-stage" @click.stop>
            <div v-if="lightbox.stage && lightbox.stage.status === 'loading'" class="dup-lb-spin" aria-label="加载中"></div>

            <!-- 图片：优先 preview/p/<contentHash>（更小更快），404 / 解码失败自动回退原图 -->
            <template v-if="lightbox.stage && lightbox.stage.media === 'photo'">
              <div v-if="lightbox.stage.status === 'error'" class="dup-lb-err">
                <p class="dup-lb-err-text">加载失败</p>
                <p class="dup-lb-err-hint">{{ lbPath }}</p>
                <el-button size="small" icon="Refresh" @click="retryPreview">重试</el-button>
              </div>
              <img
                v-else
                :key="lbStageKey"
                class="dup-lb-img"
                :src="mediaSrc(lightbox.stage.src)"
                :alt="lbName"
                @load="onPreviewLoaded"
                @error="onPreviewError"
              />
            </template>

            <!-- 视频：直接播原文件（不转码，能播则播），播不了提示可回退原画播放器 -->
            <template v-else-if="lightbox.stage">
              <div v-if="lightbox.stage.status === 'error'" class="dup-lb-err">
                <p class="dup-lb-err-text">该编码浏览器可能不支持，可回退原画播放器</p>
                <p class="dup-lb-err-hint">{{ lbPath }}</p>
                <div class="dup-lb-err-ops">
                  <el-button size="small" icon="Refresh" @click="retryPreview">重试</el-button>
                  <el-button v-if="lightbox.stage.src" size="small" type="primary" link @click="openOriginal">
                    用原画播放器打开
                  </el-button>
                </div>
              </div>
              <video
                v-else
                :key="lbStageKey"
                class="dup-lb-video"
                controls
                autoplay
                playsinline
                :poster="lbPoster"
                :src="mediaSrc(lightbox.stage.src)"
                @loadedmetadata="onPreviewLoaded"
                @error="onPreviewError"
              ></video>
            </template>

            <button type="button" class="dup-lb-btn dup-lb-nav is-prev" title="上一个（←）" aria-label="上一个" @click.stop="stepPreview(-1)">
              ‹
            </button>
            <button type="button" class="dup-lb-btn dup-lb-nav is-next" title="下一个（→）" aria-label="下一个" @click.stop="stepPreview(1)">
              ›
            </button>
          </div>

          <div class="dup-lb-foot">
            <span class="dup-lb-count">{{ lightboxLabel(lightbox) }}</span>
            <span class="dup-lb-name dup-lb-foot-name" :title="lbPath">{{ lbName }}</span>
            <span class="dup-lb-meta">{{ formatBytes(lbCurrent.item.size) }}</span>
            <span class="dup-lb-thumb" :title="(lightbox.stage && lightbox.stage.thumb) || ''">
              缩略图：{{ (lightbox.stage && lightbox.stage.thumb) || '—' }}
            </span>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup name="DuplicatesView">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  ALIAS_PREVIEW_LIMIT,
  KINDS,
  PAGE_SIZES,
  aliasKey,
  aliasWindow,
  closedLightbox,
  fileBaseName,
  fileInitial,
  formatBytes,
  groupAliases,
  groupCount,
  groupKey,
  groupWasted,
  isBackdropClick,
  itemPath,
  lightboxCurrent,
  lightboxKey,
  lightboxLabel,
  lightboxRetry,
  lightboxStageKey,
  lightboxStep,
  markThumbBroken,
  openLightbox,
  previewFallbackStage,
  previewLoadedStage,
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
  trashKeys: { type: Array, default: () => [] },
  /**
   * 遮罩层初始状态（默认 null = 关闭）：{ row, role:'primary'|'alias', alias }。
   * 只给 SSR / 证据脚本渲染「已打开」的 DOM 用；正常交互一律由点击缩略图产生，Panel 不传。
   */
  previewSeed: { type: Object, default: null }
})

const emit = defineEmits(['refresh', 'kind-change', 'page-change', 'size-change', 'merge', 'keep', 'remove', 'trash-change'])

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

/** 非 axios 资源加后端前缀（与 media/index.vue 的 mediaSrc 同口径） */
function mediaSrc(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : BASE_API + path
}

/** 可显示时才给 src；空串 = 渲染占位块 */
function imgSrc(path) {
  return mediaSrc(thumbSrc(broken, path))
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

/* ====================================================== P4.2 大图预览（遮罩层）
 * 判定全在 duplicatesModel；这里只负责：把 model 的纯函数结果写回 ref、锁/放页面滚动、挂键盘监听。
 */

/** 遮罩层状态（关闭态 = closedLightbox()，非 open 时整块不渲染） */
const lightbox = ref(seedLightbox())
/** 打开前的 body overflow：关闭时原样还回去，别把别的弹窗的锁顶掉 */
let savedOverflow = ''

/** previewSeed 只用于 SSR / 证据脚本；正常交互（点击缩略图）由 openPreview 产生 */
function seedLightbox() {
  const seed = props.previewSeed
  if (!seed || !seed.row) return closedLightbox()
  return openLightbox(props.kind, seed.row, { role: seed.role || 'primary', alias: seed.alias })
}

const lbCurrent = computed(() => lightboxCurrent(lightbox.value))
const lbPath = computed(() => itemPath(lbCurrent.value.item))
/** 标题用文件名（长路径放 title 里），缺 relPath 才退回 id */
const lbName = computed(() => fileBaseName(lbCurrent.value.item && lbCurrent.value.item.relPath) || lbPath.value)
/** 换文件 / 重试都要换 key，否则 <img>/<video> 会留着上一次的失败态 */
const lbStageKey = computed(() => lightboxStageKey(lightbox.value))
const lbPoster = computed(() => mediaSrc(lightbox.value.stage && lightbox.value.stage.thumb))

/** 点主文件大图：打开本组第 1 个（主文件） */
function openPreview(row, role, alias) {
  lightbox.value = openLightbox(props.kind, row, { role, alias })
}

function closePreview() {
  lightbox.value = closedLightbox()
}

function stepPreview(delta) {
  lightbox.value = lightboxStep(lightbox.value, delta)
}

/** 重试：图片重新走 preview → 原图，视频重新挂载 <video> */
function retryPreview() {
  lightbox.value = lightboxRetry(lightbox.value)
}

function onPreviewLoaded() {
  lightbox.value = { ...lightbox.value, stage: previewLoadedStage(lightbox.value.stage) }
}

/** 图片 404 / 解码失败：先自动回退原图，原图也失败才进「加载失败」 */
function onPreviewError() {
  lightbox.value = { ...lightbox.value, stage: previewFallbackStage(lightbox.value.stage) }
}

/** 背景点击才关闭：点舞台 / 按钮时事件被 .stop 拦住，这里再按 target 判一次 */
function onBackdrop(event) {
  if (isBackdropClick(event)) closePreview()
}

/** 视频编码浏览器不认时的出口：新窗口用原画播放器打开原文件 */
function openOriginal() {
  const url = mediaSrc(lightbox.value.stage && lightbox.value.stage.src)
  if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
}

/** 键盘：ESC 关闭、←/→ 切换；lightboxKey 不认的键原样返回同一对象，用 === 判断是否归自己管 */
function onKeydown(event) {
  const next = lightboxKey(lightbox.value, event && event.key)
  if (next === lightbox.value) return
  if (event && typeof event.preventDefault === 'function') event.preventDefault()
  lightbox.value = next
}

/** 打开时锁页面滚动（与 TagsView 抽屉同一做法：直接改 body.style.overflow） */
watch(
  () => lightbox.value.open,
  (open) => {
    if (typeof document === 'undefined' || !document.body) return
    if (open) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = savedOverflow || ''
      savedOverflow = ''
    }
  }
)

onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown)
  // 卸载时遮罩层还开着：滚动锁必须还回去，否则整页再也滚不动
  if (typeof document !== 'undefined' && document.body && lightbox.value.open) {
    document.body.style.overflow = savedOverflow || ''
    savedOverflow = ''
  }
})
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
/* ==================================================== P4.2 大图预览（遮罩层） */

/* 缩略图可点：光标 + 轻微放大，明确「这张图能点」，但没有行内其它副作用 */
.dup-thumb.is-clickable {
  cursor: zoom-in;
}

.dup-thumb.is-clickable .dup-img {
  transition: transform 0.15s;
}

.dup-thumb.is-clickable:hover .dup-img {
  transform: scale(1.04);
}

.dup-thumb.is-clickable:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}

/* 遮罩层：固定铺满，点击背景关闭（内容区块 .stop 拦住） */
.dup-lb {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--el-overlay-color-lighter, rgba(0, 0, 0, 0.5));
}

.dup-lb-panel {
  display: flex;
  flex-direction: column;
  width: min(1080px, 94vw);
  max-height: 92vh;
  overflow: hidden;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background-color: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-dark, 0 8px 32px rgba(0, 0, 0, 0.35));
}

.dup-lb-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.dup-lb-role {
  flex: 0 0 auto;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 18px;
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.dup-lb-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dup-lb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--el-text-color-regular);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.dup-lb-btn:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.dup-lb-close {
  font-size: 22px;
}

.dup-lb-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background-color: var(--el-fill-color-darker);
}

.dup-lb-img {
  display: block;
  max-width: 100%;
  max-height: 72vh;
  border-radius: 4px;
  object-fit: contain;
}

.dup-lb-video {
  display: block;
  max-width: 100%;
  max-height: 72vh;
  border-radius: 4px;
  background-color: #000;
}

/* 加载态：转圈压在舞台上，图片就绪后由 status=ready 移除 */
.dup-lb-spin {
  position: absolute;
  width: 30px;
  height: 30px;
  border: 3px solid var(--el-border-color-lighter);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: dup-lb-rotate 0.8s linear infinite;
}

@keyframes dup-lb-rotate {
  to {
    transform: rotate(360deg);
  }
}

/* 错误态：绝不渲染破图，只给文案 + 重试 */
.dup-lb-err {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
  color: var(--el-text-color-primary);
}

.dup-lb-err-text {
  margin: 0;
  font-size: 14px;
}

.dup-lb-err-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
  word-break: break-all;
}

.dup-lb-err-ops {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.dup-lb-nav {
  position: absolute;
  top: 50%;
  width: 40px;
  height: 40px;
  font-size: 26px;
  transform: translateY(-50%);
  border: 1px solid var(--el-border-color-light);
  background-color: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-light);
}

.dup-lb-nav.is-prev {
  left: 8px;
}

.dup-lb-nav.is-next {
  right: 8px;
}

.dup-lb-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.dup-lb-count {
  color: var(--el-color-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dup-lb-name.dup-lb-foot-name {
  flex: 0 1 auto;
  max-width: 46%;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.dup-lb-meta {
  font-variant-numeric: tabular-nums;
}

.dup-lb-thumb {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* 移动端：遮罩全屏，切换按钮加大（手指点得到） */
@media (max-width: 768px) {
  .dup-lb {
    padding: 0;
  }

  .dup-lb-panel {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    border: none;
    border-radius: 0;
  }

  .dup-lb-img,
  .dup-lb-video {
    max-height: 64vh;
  }

  .dup-lb-nav {
    width: 52px;
    height: 52px;
    font-size: 32px;
  }

  .dup-lb-nav.is-prev {
    left: 6px;
  }

  .dup-lb-nav.is-next {
    right: 6px;
  }

  .dup-lb-foot {
    gap: 8px;
  }
}

</style>
