<template>
  <el-drawer
    :title="drawerTitle"
    v-model="visible"
    direction="rtl"
    size="80%"
    append-to-body
    :before-close="handleClose"
    class="detail-drawer"
  >
    <div v-loading="loading" class="drawer-frame-wrap">
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

const visible = ref(false)
const loading = ref(false)
const info = reactive({})
// 抽屉内嵌的工具页地址（由记录里的 toolRoute 解析而来）
const toolUrl = ref('')
const emptyText = ref('该工具未配置前端访问路由')

const drawerTitle = computed(() => (info.toolName ? `工具预览 · ${info.toolName}` : '工具预览'))

/**
 * 打开抽屉：按 id 取工具记录，解析出前端地址后交给 iframe 加载。
 * 抽屉里展示的是工具在前台的真实页面（与「打开」按钮同源，只是内嵌显示）。
 */
const open = async (id) => {
  visible.value = true
  loading.value = true
  toolUrl.value = ''
  try {
    const res = await getInfo(id)
    Object.assign(info, res.data || {})
    toolUrl.value = resolveToolUrl(info.toolRoute)
    if (!toolUrl.value) {
      emptyText.value = info.toolRoute ? `无法解析前端地址：${info.toolRoute}` : '该工具未配置前端访问路由'
    }
  } catch (error) {
    console.error('获取工具信息失败:', error)
    toolUrl.value = ''
    emptyText.value = '工具信息加载失败'
  } finally {
    loading.value = false
  }
}

function handleClose() {
  visible.value = false
  // 清空 iframe 地址，避免关闭后页面仍在后台运行（定时器 / 媒体播放等）
  toolUrl.value = ''
  Object.keys(info).forEach(key => delete info[key])
}

defineExpose({ open })
</script>

<style scoped>
/* 抽屉内部改为纵向布局，让 iframe 撑满剩余高度 */
.drawer-frame-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
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
