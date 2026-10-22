<template>
  <el-drawer
    :title="drawerTitle"
    v-model="visible"
    direction="rtl"
    :size="drawerSize"
    append-to-body
    :before-close="handleClose"
    class="detail-drawer"
  >
    <div v-loading="loading" class="drawer-frame-wrap" :class="{ resizing }">
      <!-- 左边缘拖拽调宽手柄：拖动调整、双击恢复默认，宽度写入 localStorage -->
      <div
        class="resize-handle"
        :class="{ active: resizing }"
        title="拖动调整宽度，双击恢复默认（80%）"
        @pointerdown="startResize"
        @dblclick="resetWidth"
      />
      <template v-if="toolUrl">
        <!-- 地址栏：显示真实地址，并提供"在新标签页打开"作为兜底（内嵌受限时可改用这个） -->
        <div class="frame-bar">
          <span class="frame-url">{{ toolUrl }}</span>
          <el-link
            type="primary"
            :underline="false"
            :href="toolUrl"
            target="_blank"
            rel="noopener noreferrer"
          >在新标签页打开</el-link>
        </div>
        <iframe :src="toolUrl" class="tool-frame" title="工具页面预览" referrerpolicy="no-referrer" />
      </template>
      <el-empty v-else-if="!loading" :description="emptyText" />
    </div>
  </el-drawer>
</template>

<script setup name="InfoViewDrawer">
import { getInfo } from "@/api/qtool/info"
import { resolveToolUrl } from "@/utils/qtool"

/** 抽屉宽度：百分比（随窗口自适应），范围 30% ~ 100% */
const DEFAULT_WIDTH = 80
const MIN_WIDTH = 30
const MAX_WIDTH = 100
const WIDTH_KEY = "qtool:detail-drawer-width"

const visible = ref(false)
const loading = ref(false)
const info = reactive({})
// 抽屉内嵌的工具页地址（由记录里的 toolRoute 解析而来）
const toolUrl = ref("")
const emptyText = ref("该工具未配置前端访问路由")

// 宽度持久化：上次拖动的结果存在 localStorage，下次打开沿用
const drawerWidth = ref(readSavedWidth())
const drawerSize = computed(() => `${drawerWidth.value}%`)
const resizing = ref(false)
const handleEl = ref(null)

const drawerTitle = computed(() => (info.toolName ? `工具预览 · ${info.toolName}` : "工具预览"))

function readSavedWidth() {
  const saved = Number(localStorage.getItem(WIDTH_KEY))
  return saved >= MIN_WIDTH && saved <= MAX_WIDTH ? saved : DEFAULT_WIDTH
}

function persistWidth() {
  localStorage.setItem(WIDTH_KEY, String(drawerWidth.value))
}

let startX = 0
let startWidth = 0

/**
 * 开始拖动：用 pointer capture 把后续事件锁定到手柄上。
 * 否则光标一旦移到 iframe 上方，事件会被 iframe 的文档吃掉，拖动就"卡住"。
 */
function startResize(e) {
  resizing.value = true
  startX = e.clientX
  startWidth = drawerWidth.value
  handleEl.value = e.currentTarget
  e.currentTarget?.setPointerCapture?.(e.pointerId)
  document.body.style.userSelect = "none"
  window.addEventListener("pointermove", onResize)
  window.addEventListener("pointerup", stopResize)
  window.addEventListener("pointercancel", stopResize)
}

/** 向左拖变宽、向右拖变窄；宽度换算成占窗口的百分比并夹在允许范围内 */
function onResize(e) {
  if (!resizing.value) return
  const deltaPercent = ((startX - e.clientX) / window.innerWidth) * 100
  drawerWidth.value = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + deltaPercent)))
}

/** 结束拖动：解绑事件并把当前宽度记住 */
function stopResize(e) {
  if (!resizing.value) return
  resizing.value = false
  document.body.style.userSelect = ""
  window.removeEventListener("pointermove", onResize)
  window.removeEventListener("pointerup", stopResize)
  window.removeEventListener("pointercancel", stopResize)
  try {
    handleEl.value?.releasePointerCapture?.(e?.pointerId)
  } catch {
    // 指针已释放时忽略
  }
  handleEl.value = null
  persistWidth()
}

/** 双击手柄恢复默认宽度 */
function resetWidth() {
  drawerWidth.value = DEFAULT_WIDTH
  persistWidth()
}

/**
 * 打开抽屉：按 id 取工具记录，解析出前端地址后交给 iframe 加载。
 * 抽屉里展示的是工具在前台的真实页面（与「打开」链接同源，只是内嵌显示）。
 */
const open = async (id) => {
  visible.value = true
  loading.value = true
  toolUrl.value = ""
  try {
    const res = await getInfo(id)
    Object.assign(info, res.data || {})
    toolUrl.value = resolveToolUrl(info.toolRoute)
    if (!toolUrl.value) {
      emptyText.value = info.toolRoute ? `无法解析前端地址：${info.toolRoute}` : "该工具未配置前端访问路由"
    }
  } catch (error) {
    console.error("获取工具信息失败:", error)
    toolUrl.value = ""
    emptyText.value = "工具信息加载失败"
  } finally {
    loading.value = false
  }
}

function handleClose() {
  visible.value = false
  // 清空 iframe 地址，避免关闭后页面仍在后台运行（定时器 / 媒体播放等）
  toolUrl.value = ""
  Object.keys(info).forEach(key => delete info[key])
}

// 组件卸载时确保事件与样式复位，避免拖动中切页留下残留监听
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onResize)
  window.removeEventListener("pointerup", stopResize)
  window.removeEventListener("pointercancel", stopResize)
  document.body.style.userSelect = ""
})

defineExpose({ open })
</script>

<style scoped>
/* 抽屉内部改为纵向布局，让 iframe 撑满剩余高度 */
.drawer-frame-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}
/* 左边缘拖拽条：贴着手柄区域才显示高亮，不干扰内容 */
.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  z-index: 10;
  cursor: col-resize;
  background: transparent;
  transition: background-color 0.15s;
}
.resize-handle:hover,
.resize-handle.active {
  background: var(--el-color-primary-light-5);
}
/* 拖动过程中让 iframe 忽略指针事件，避免它抢走 pointermove */
.drawer-frame-wrap.resizing .tool-frame {
  pointer-events: none;
}
.frame-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--el-fill-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.frame-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.tool-frame {
  flex: 1 1 auto;
  width: 100%;
  min-height: 400px;
  border: 0;
  background: var(--el-bg-color);
}
/* 去掉抽屉默认内边距，页面才能铺满 */
.detail-drawer :deep(.el-drawer__body) {
  padding: 0;
  overflow: hidden;
}
.detail-drawer :deep(.el-drawer__header) {
  margin-bottom: 0;
}
</style>
