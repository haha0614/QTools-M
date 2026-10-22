<!--
  管理端首页 —— 整站数据看板
  数据来源：GET /api/qtool/stats/overview（tool_info 工具维度 + tool_visit 访问埋点）
  展示内容：4 个总量指标卡 + 近 7 天访问趋势折线 + 工具访问排行条形图
  说明：埋点只记录"哪个工具被打开一次"，不记录用户在工具页内输入的任何内容。
-->
<template>
  <div class="app-container dashboard">
    <!-- 总量指标 -->
    <el-row :gutter="16">
      <el-col v-for="card in cards" :key="card.key" :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-card__body">
            <div class="stat-card__icon" :style="{ color: card.color }">
              <el-icon :size="26"><component :is="card.icon" /></el-icon>
            </div>
            <div class="stat-card__meta">
              <div class="stat-card__value">{{ card.value }}</div>
              <div class="stat-card__label">{{ card.label }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 趋势 + 排行 -->
    <el-row :gutter="16" class="mt16">
      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>近 {{ overview.trendDays || 7 }} 天访问趋势</span>
              <el-tag size="small" type="info">按天统计 tool_visit</el-tag>
            </div>
          </template>
          <div ref="trendRef" v-loading="loading" class="chart" />
        </el-card>
      </el-col>
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>工具访问排行</span>
              <el-link type="primary" :underline="false" @click="goToolPage">工具维护 →</el-link>
            </div>
          </template>
          <div ref="rankRef" v-loading="loading" class="chart" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 媒体站数据：播放/点击/浏览/时长/收藏 + 热门视频、热门图片排行 -->
    <el-row :gutter="16" class="mt16">
      <el-col :span="24">
        <el-card v-loading="mediaLoading" shadow="never">
          <template #header>
            <div class="card-header">
              <span>
                媒体站数据
                <el-tag size="small" type="info">近 {{ mediaStats.trendDays || 7 }} 天埋点</el-tag>
              </span>
              <el-link type="primary" :underline="false" @click="goMediaPage">媒体库 →</el-link>
            </div>
          </template>
          <el-row :gutter="16">
            <el-col v-for="card in mediaCards" :key="card.key" :xs="12" :sm="8" :md="4">
              <div class="stat-card media-metric">
                <div class="stat-card__body">
                  <div class="stat-card__icon" :style="{ color: card.color }">
                    <el-icon :size="22"><component :is="card.icon" /></el-icon>
                  </div>
                  <div class="stat-card__meta">
                    <div class="stat-card__value">{{ card.value }}</div>
                    <div class="stat-card__label">{{ card.label }}</div>
                  </div>
                </div>
              </div>
            </el-col>
          </el-row>
          <!-- 全部指标为 0 时的引导文案（不遮挡图表，仅在无任何埋点时提示） -->
          <div v-if="mediaAllZero" class="media-empty-tip">暂无媒体埋点数据，先在媒体站产生一些播放/点击</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 媒体站排行：左热门视频、右热门图片 -->
    <el-row :gutter="16" class="mt16">
      <el-col :xs="24" :md="12">
        <el-card v-loading="mediaLoading" shadow="never">
          <template #header>
            <div class="card-header">
              <span>热门视频 Top</span>
              <el-tag size="small" type="info">按播放次数</el-tag>
            </div>
          </template>
          <div class="chart-hold">
            <div v-show="mediaVideoRows.length" ref="mediaVideoRef" class="chart chart--media" />
            <el-empty v-if="!mediaVideoRows.length" :image-size="70" description="暂无视频播放数据" />
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card v-loading="mediaLoading" shadow="never">
          <template #header>
            <div class="card-header">
              <span>热门图片 Top</span>
              <el-tag size="small" type="info">按点击次数</el-tag>
            </div>
          </template>
          <div class="chart-hold">
            <div v-show="mediaPhotoRows.length" ref="mediaPhotoRef" class="chart chart--media" />
            <el-empty v-if="!mediaPhotoRows.length" :image-size="70" description="暂无图片点击数据" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 媒体站看板加载失败提示（独立于工具看板，互不覆盖） -->
    <el-alert
      v-if="mediaErrorMsg"
      class="mt16"
      type="warning"
      :title="mediaErrorMsg"
      show-icon
      :closable="false"
    />

    <!-- 加载失败提示（多为缺少 qtool:admin:list 权限或后端未启动） -->
    <el-alert
      v-if="errorMsg"
      class="mt16"
      type="warning"
      :title="errorMsg"
      show-icon
      :closable="false"
    />
  </div>
</template>

<script setup name="Index">
import * as echarts from "echarts"
import { getStatsOverview } from "@/api/qtool/info"
import { getMediaStats } from "@/api/media"

const router = useRouter()

const loading = ref(true)
const errorMsg = ref("")
const overview = reactive({
  totalVisits: 0,
  todayVisits: 0,
  totalTools: 0,
  enabledTools: 0,
  trendDays: 7,
  dailyVisits: [],
  topTools: []
})

const trendRef = ref(null)
const rankRef = ref(null)
let trendChart = null
let rankChart = null

// ---- 媒体站数据（独立状态，与工具看板互不影响） ----
const mediaLoading = ref(true)
const mediaErrorMsg = ref("")
const mediaStats = reactive({
  totalEvents: 0,
  todayEvents: 0,
  playCount: 0,
  photoClickCount: 0,
  pageViewCount: 0,
  totalPlayMs: 0,
  favCount: 0,
  trendDays: 7,
  topVideos: [],
  topPhotos: []
})

const mediaVideoRef = ref(null)
const mediaPhotoRef = ref(null)
let mediaVideoChart = null
let mediaPhotoChart = null

// 横向条形图默认从下往上画，反转后第一名在最上方
const mediaVideoRows = computed(() => [...(mediaStats.topVideos || [])].reverse())
const mediaPhotoRows = computed(() => [...(mediaStats.topPhotos || [])].reverse())

// 媒体站 5 个小指标卡
const mediaCards = computed(() => [
  { key: "playCount", label: "播放量", value: mediaStats.playCount, icon: "VideoPlay", color: "#409eff" },
  { key: "photoClickCount", label: "图片点击量", value: mediaStats.photoClickCount, icon: "Picture", color: "#67c23a" },
  { key: "pageViewCount", label: "浏览量", value: mediaStats.pageViewCount, icon: "View", color: "#e6a23c" },
  { key: "totalPlayMs", label: "累计观看时长", value: formatPlayMs(mediaStats.totalPlayMs), icon: "Timer", color: "#909399" },
  { key: "favCount", label: "收藏量", value: mediaStats.favCount, icon: "Star", color: "#f56c6c" }
])

// 全部计数为 0 时说明还没产生埋点
const mediaAllZero = computed(
  () =>
    !mediaStats.playCount &&
    !mediaStats.photoClickCount &&
    !mediaStats.pageViewCount &&
    !mediaStats.totalPlayMs &&
    !mediaStats.favCount
)

/**
 * 把毫秒格式化成可读时长：
 * ≥1 小时 → 「x 小时 y 分」；≥1 分钟 → 「y 分 z 秒」；其余 → 「z 秒」
 */
function formatPlayMs(ms) {
  const total = Number(ms) > 0 ? Number(ms) : 0
  if (!total) return "0 秒"
  const totalSec = Math.max(1, Math.round(total / 1000))
  const hour = Math.floor(totalSec / 3600)
  const minute = Math.floor((totalSec % 3600) / 60)
  const second = totalSec % 60
  if (hour > 0) return minute > 0 ? `${hour} 小时 ${minute} 分` : `${hour} 小时`
  if (minute > 0) return second > 0 ? `${minute} 分 ${second} 秒` : `${minute} 分`
  return `${second} 秒`
}

// 顶部四个指标卡（值随接口刷新）
const cards = computed(() => [
  { key: "totalVisits", label: "累计访问量", value: overview.totalVisits, icon: "DataLine", color: "#409eff" },
  { key: "todayVisits", label: "今日访问量", value: overview.todayVisits, icon: "TrendCharts", color: "#67c23a" },
  { key: "totalTools", label: "工具总数", value: overview.totalTools, icon: "Grid", color: "#e6a23c" },
  { key: "enabledTools", label: "启用中的工具", value: overview.enabledTools, icon: "CircleCheck", color: "#909399" }
])

/** 拉看板数据：成功则覆盖总览并重绘图表，失败给出可读提示（不影响页面其它部分） */
async function load() {
  loading.value = true
  errorMsg.value = ""
  try {
    const res = await getStatsOverview()
    const data = res.data || {}
    Object.assign(overview, {
      totalVisits: data.totalVisits ?? 0,
      todayVisits: data.todayVisits ?? 0,
      totalTools: data.totalTools ?? 0,
      enabledTools: data.enabledTools ?? 0,
      trendDays: data.trendDays ?? 7,
      dailyVisits: Array.isArray(data.dailyVisits) ? data.dailyVisits : [],
      topTools: Array.isArray(data.topTools) ? data.topTools : []
    })
    await nextTick()
    renderCharts()
  } catch (err) {
    console.error("[Dashboard] 看板数据加载失败：", err)
    errorMsg.value = "看板数据加载失败：请确认后端已启动，且当前账号具备 qtool:admin:list 权限"
  } finally {
    loading.value = false
  }
}

/** 绘制两张图：左折线（近 N 天趋势）、右横条（工具访问排行） */
function renderCharts() {
  const trend = overview.dailyVisits || []
  if (trendRef.value) {
    trendChart = trendChart || echarts.init(trendRef.value)
    trendChart.setOption({
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 16, top: 24, bottom: 32 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        // 只显示 MM-DD，年份在提示框里再补
        data: trend.map(item => String(item.date || "").slice(5))
      },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        {
          name: "访问量",
          type: "line",
          smooth: true,
          symbolSize: 6,
          areaStyle: { opacity: 0.15 },
          data: trend.map(item => item.count ?? 0)
        }
      ]
    })
  }

  const top = overview.topTools || []
  if (rankRef.value) {
    rankChart = rankChart || echarts.init(rankRef.value)
    // 横向条形图默认从下往上画，反转后第一名在最上方
    const rows = [...top].reverse()
    rankChart.setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { left: 8, right: 40, top: 16, bottom: 16, containLabel: true },
      xAxis: { type: "value", minInterval: 1 },
      yAxis: {
        type: "category",
        data: rows.map(item => item.toolName || "-")
      },
      series: [
        {
          name: "访问量",
          type: "bar",
          barMaxWidth: 18,
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right" },
          data: rows.map(item => item.visitCount ?? 0)
        }
      ]
    })
  }
}

/** 窗口尺寸变化时重绘，避免图表被拉伸变形 */
function handleResize() {
  trendChart?.resize()
  rankChart?.resize()
  mediaVideoChart?.resize()
  mediaPhotoChart?.resize()
}

/** 跳到工具维护页（菜单未授权时静默忽略） */
function goToolPage() {
  router.push("/qtool").catch(() => {})
}

/** 跳到媒体库（菜单未授权或路由不存在时静默忽略） */
function goMediaPage() {
  router.push("/tool/media").catch(() => {})
}

/** 拉媒体站数据：与工具看板各自独立，失败只影响本区块 */
async function loadMedia() {
  mediaLoading.value = true
  mediaErrorMsg.value = ""
  try {
    const res = await getMediaStats()
    const data = res.data || {}
    Object.assign(mediaStats, {
      totalEvents: data.totalEvents ?? 0,
      todayEvents: data.todayEvents ?? 0,
      playCount: data.playCount ?? 0,
      photoClickCount: data.photoClickCount ?? 0,
      pageViewCount: data.pageViewCount ?? 0,
      totalPlayMs: data.totalPlayMs ?? 0,
      favCount: data.favCount ?? 0,
      trendDays: data.trendDays ?? 7,
      topVideos: Array.isArray(data.topVideos) ? data.topVideos : [],
      topPhotos: Array.isArray(data.topPhotos) ? data.topPhotos : []
    })
    await nextTick()
    renderMediaCharts()
  } catch (err) {
    console.error("[Dashboard] 媒体站数据加载失败：", err)
    mediaErrorMsg.value = "媒体站数据加载失败：请确认后端已启动，且当前账号具备 media:admin:list 权限"
  } finally {
    mediaLoading.value = false
  }
}

/** 绘制两站排行：左热门视频（label 用 title || key）、右热门图片（label 用 key） */
function renderMediaCharts() {
  if (mediaVideoRef.value) {
    if (!mediaVideoRows.value.length) {
      // 无数据时销毁旧实例，避免容器被隐藏后残留
      mediaVideoChart?.dispose()
      mediaVideoChart = null
    } else {
      mediaVideoChart = mediaVideoChart || echarts.init(mediaVideoRef.value)
      mediaVideoChart.setOption({
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { left: 8, right: 40, top: 16, bottom: 16, containLabel: true },
        xAxis: { type: "value", minInterval: 1 },
        yAxis: {
          type: "category",
          data: mediaVideoRows.value.map(item => item.title || item.key || "-")
        },
        series: [
          {
            name: "播放量",
            type: "bar",
            barMaxWidth: 18,
            itemStyle: { borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: "right" },
            data: mediaVideoRows.value.map(item => item.count ?? 0)
          }
        ]
      })
    }
  }

  if (mediaPhotoRef.value) {
    if (!mediaPhotoRows.value.length) {
      mediaPhotoChart?.dispose()
      mediaPhotoChart = null
    } else {
      mediaPhotoChart = mediaPhotoChart || echarts.init(mediaPhotoRef.value)
      mediaPhotoChart.setOption({
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { left: 8, right: 40, top: 16, bottom: 16, containLabel: true },
        xAxis: { type: "value", minInterval: 1 },
        yAxis: {
          type: "category",
          data: mediaPhotoRows.value.map(item => item.key || "-")
        },
        series: [
          {
            name: "点击量",
            type: "bar",
            barMaxWidth: 18,
            itemStyle: { borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: "right" },
            data: mediaPhotoRows.value.map(item => item.count ?? 0)
          }
        ]
      })
    }
  }
}

onMounted(() => {
  load()
  loadMedia()
  window.addEventListener("resize", handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize)
  trendChart?.dispose()
  rankChart?.dispose()
  mediaVideoChart?.dispose()
  mediaPhotoChart?.dispose()
  trendChart = null
  rankChart = null
  mediaVideoChart = null
  mediaPhotoChart = null
})
</script>

<style scoped lang="scss">
.mt16 {
  margin-top: 16px;
}

.stat-card {
  margin-bottom: 16px;
  border-radius: 8px;

  &__body {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  &__value {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--el-text-color-primary);
  }

  &__label {
    margin-top: 4px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 图表容器固定高度：echarts 需要一个确定高度的父元素 */
.chart {
  height: 320px;
}

@media (max-width: 767px) {
  .chart {
    height: 260px;
  }
}

/* ---- 媒体站数据区块（独立类名，避免影响上方工具看板样式） ---- */
/* 卡片内的 5 个指标块：复用 .stat-card 排版，只覆盖卡片化外观 */
.media-metric {
  margin-bottom: 12px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
}

/* 媒体站排行图固定 300px 高（.chart 默认 320px，这里以更靠后的同名优先级覆盖） */
.chart--media {
  height: 300px;
}

/* 图表空态容器：保证 el-empty 与图表切换时高度稳定 */
.chart-hold {
  min-height: 300px;
}

/* 全 0 时的灰字引导 */
.media-empty-tip {
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 767px) {
  .chart--media {
    height: 260px;
  }

  .chart-hold {
    min-height: 260px;
  }
}
</style>
