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
          <!-- 新增的 3 个指标：完播率 / 今日 UV / 累计 UV（独立一行，不影响上面 5 卡布局） -->
          <el-row :gutter="16">
            <el-col v-for="card in mediaExtraCards" :key="card.key" :xs="12" :sm="8" :md="8">
              <div class="stat-card media-metric">
                <div class="stat-card__body">
                  <div class="stat-card__icon" :style="{ color: card.color }">
                    <el-icon :size="22"><component :is="card.icon" /></el-icon>
                  </div>
                  <div class="stat-card__meta">
                    <div class="stat-card__value">{{ card.value }}</div>
                    <div class="stat-card__label">{{ card.label }}</div>
                    <el-tooltip v-if="card.tip" :content="card.tip" placement="bottom" :show-after="200">
                      <div class="stat-card__hint">{{ card.hint }}</div>
                    </el-tooltip>
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

    <!-- 下钻弹窗：单个视频播放 / 单张图片点击的近 N 天趋势 -->
    <el-dialog
      v-model="targetDialogVisible"
      :title="targetDialogTitle"
      width="640px"
      append-to-body
      @opened="renderTargetChart"
      @closed="disposeTargetChart"
    >
      <div v-loading="targetLoading">
        <el-row :gutter="12">
          <el-col v-for="item in targetNumbers" :key="item.key" :span="item.span">
            <div class="target-num">
              <div class="target-num__value">{{ item.value }}</div>
              <div class="target-num__label">{{ item.label }}</div>
            </div>
          </el-col>
        </el-row>
        <div class="target-chart-title">
          {{ targetStats.targetType === "photo" ? "近 7 天点击趋势" : "近 7 天播放趋势" }}
        </div>
        <div class="chart-hold">
          <div v-show="targetStats.daily.length" ref="targetChartRef" class="chart chart--target" />
          <el-empty v-if="!targetStats.daily.length" :image-size="60" description="暂无趋势数据" />
        </div>
      </div>
    </el-dialog>

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
import { ElMessage } from "element-plus"
import { getStatsOverview } from "@/api/qtool/info"
import { getMediaStats, getMediaTargetStats } from "@/api/media"

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
  // 后端 stats/overview 新增字段：UV 与完播
  uvToday: 0,
  uvTotal: 0,
  playEndCount: 0,
  completedPlayCount: 0,
  completionRate: 0,
  trendDays: 7,
  topVideos: [],
  topPhotos: []
})

const mediaVideoRef = ref(null)
const mediaPhotoRef = ref(null)
let mediaVideoChart = null
let mediaPhotoChart = null

// ---- 下钻弹窗：单个媒体目标的趋势（视频播放 / 图片点击） ----
const targetDialogVisible = ref(false)
const targetLoading = ref(false)
const targetChartRef = ref(null)
let targetChart = null
const targetStats = reactive({
  targetType: "video",
  targetKey: "",
  title: "",
  playCount: 0,
  playEndCount: 0,
  completedCount: 0,
  completionRate: 0,
  totalPlayMs: 0,
  daily: []
})

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

// 媒体站新增 3 个小指标卡（完播率 / 今日 UV / 累计 UV）
const mediaExtraCards = computed(() => [
  {
    key: "completionRate",
    label: "完播率",
    value: formatPercent(mediaStats.completionRate),
    icon: "Odometer",
    color: "#409eff",
    hint: `播放完成 ${mediaStats.completedPlayCount ?? 0} / ${mediaStats.playEndCount ?? 0}`,
    tip: `播放完成 ${mediaStats.completedPlayCount ?? 0} / ${mediaStats.playEndCount ?? 0}（完播次数 / 播放结束事件数）`
  },
  { key: "uvToday", label: "今日 UV", value: mediaStats.uvToday ?? 0, icon: "User", color: "#67c23a" },
  { key: "uvTotal", label: "累计 UV", value: mediaStats.uvTotal ?? 0, icon: "UserFilled", color: "#e6a23c" }
])

// 弹窗顶部数字：视频看完播率与时长，图片只看点击量
const targetNumbers = computed(() => {
  if (targetStats.targetType === "photo") {
    return [{ key: "playCount", label: "点击量", value: targetStats.playCount ?? 0, span: 24 }]
  }
  return [
    { key: "playCount", label: "播放量", value: targetStats.playCount ?? 0, span: 6 },
    { key: "completionRate", label: "完播率", value: formatPercent(targetStats.completionRate), span: 6 },
    { key: "totalPlayMs", label: "累计观看时长", value: formatPlayMs(targetStats.totalPlayMs), span: 6 },
    { key: "completedCount", label: "完播次数", value: targetStats.completedCount ?? 0, span: 6 }
  ]
})

// 弹窗标题：优先用后端回填的 title，没有就退回 targetKey
const targetDialogTitle = computed(() => {
  const name = targetStats.title || targetStats.targetKey || "统计详情"
  return `${targetStats.targetType === "photo" ? "图片" : "视频"}统计 · ${name}`
})

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

/** 百分比展示：后端已是 0-100 的数值，最多保留 2 位小数并去掉多余的 0 */
function formatPercent(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return "0%"
  const fixed = num >= 100 ? "100" : num.toFixed(2).replace(/\.?0+$/, "")
  return `${fixed}%`
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
  // 弹窗里的图表只在可见时重绘：隐藏时容器尺寸为 0，resize 会把它画坏
  if (targetDialogVisible.value) targetChart?.resize()
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
      // 新增字段：后端未升级时这里是 undefined，统一兜底为 0
      uvToday: data.uvToday ?? 0,
      uvTotal: data.uvTotal ?? 0,
      playEndCount: data.playEndCount ?? 0,
      completedPlayCount: data.completedPlayCount ?? 0,
      completionRate: data.completionRate ?? 0,
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
      // series.data 用对象挂载 key/title：点击时从 params.data 直接反查 targetKey，
      // 不依赖 y 轴 label（label 可能是 title，也可能重名）
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
            cursor: "pointer",
            itemStyle: { borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: "right", formatter: param => String(param.value ?? 0) },
            data: mediaVideoRows.value.map(item => ({
              value: item.count ?? 0,
              key: item.key,
              title: item.title || null
            }))
          }
        ]
      })
      bindMediaBarClick(mediaVideoChart, "video")
    }
  }

  if (mediaPhotoRef.value) {
    if (!mediaPhotoRows.value.length) {
      mediaPhotoChart?.dispose()
      mediaPhotoChart = null
    } else {
      mediaPhotoChart = mediaPhotoChart || echarts.init(mediaPhotoRef.value)
      // 图片同理：key 形如 albumId:seq，直接挂在 data 对象上
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
            cursor: "pointer",
            itemStyle: { borderRadius: [0, 4, 4, 0] },
            label: { show: true, position: "right", formatter: param => String(param.value ?? 0) },
            data: mediaPhotoRows.value.map(item => ({
              value: item.count ?? 0,
              key: item.key,
              title: item.title || null
            }))
          }
        ]
      })
      bindMediaBarClick(mediaPhotoChart, "photo")
    }
  }
}

/**
 * 给排行条形图绑定点击下钻。
 * 先 off 再 on，保证重复渲染不会叠加监听器（setOption 会复用同一实例）。
 */
function bindMediaBarClick(chart, targetType) {
  if (!chart) return
  chart.off("click")
  chart.on("click", params => {
    // params.data 就是 series.data 里的对象 {value, key, title}
    const datum = params?.data
    const targetKey = datum && typeof datum === "object" ? datum.key : null
    if (!targetKey) return
    const title = datum.title || null
    openTargetStats(targetType, targetKey, title)
  })
}

/** 打开下钻弹窗并拉取该目标的趋势；失败只提示，不阻塞页面 */
async function openTargetStats(targetType, targetKey, title) {
  // 重置上一个目标的数据，避免切换时闪现旧内容
  Object.assign(targetStats, {
    targetType,
    targetKey,
    title: title || "",
    playCount: 0,
    playEndCount: 0,
    completedCount: 0,
    completionRate: 0,
    totalPlayMs: 0,
    daily: []
  })
  targetDialogVisible.value = true
  targetLoading.value = true
  try {
    const res = await getMediaTargetStats({ targetType, targetKey, days: 7 })
    const data = res.data || {}
    Object.assign(targetStats, {
      targetType: data.targetType || targetType,
      targetKey: data.targetKey || targetKey,
      title: data.title || title || "",
      playCount: data.playCount ?? 0,
      playEndCount: data.playEndCount ?? 0,
      completedCount: data.completedCount ?? 0,
      completionRate: data.completionRate ?? 0,
      totalPlayMs: data.totalPlayMs ?? 0,
      daily: Array.isArray(data.daily) ? data.daily : []
    })
    await nextTick()
    renderTargetChart()
  } catch (err) {
    console.error("[Dashboard] 媒体目标统计加载失败：", err)
    ElMessage.warning("该目标的统计数据加载失败，请稍后再试")
  } finally {
    targetLoading.value = false
  }
}

/** 绘制弹窗里的近 7 天折线（实例复用，无数据不画） */
function renderTargetChart() {
  const el = targetChartRef.value
  if (!el || !targetStats.daily.length) return
  targetChart = targetChart || echarts.init(el)
  const isPhoto = targetStats.targetType === "photo"
  const daily = targetStats.daily
  // notMerge = true：切换不同目标时完全替换配置，避免残留上一个目标的点
  targetChart.setOption(
    {
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 16, top: 24, bottom: 32 },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: daily.map(item => String(item.date || "").slice(5))
      },
      yAxis: { type: "value", minInterval: 1 },
      series: [
        {
          name: isPhoto ? "点击量" : "播放量",
          type: "line",
          smooth: true,
          symbolSize: 6,
          areaStyle: { opacity: 0.15 },
          data: daily.map(item => item.count ?? 0)
        }
      ]
    },
    true
  )
  targetChart.resize()
}

/** 弹窗关闭：销毁图表实例，下次打开重新 init（容器随弹窗销毁） */
function disposeTargetChart() {
  targetChart?.dispose()
  targetChart = null
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
  targetChart?.dispose()
  trendChart = null
  rankChart = null
  mediaVideoChart = null
  mediaPhotoChart = null
  targetChart = null
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

/* 完播率卡片下的补充说明（el-tooltip 触发区） */
.stat-card__hint {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-placeholder);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 只在媒体指标卡内允许文字收缩，避免长副标题撑破窄屏卡片（不影响工具看板） */
.media-metric .stat-card__meta {
  min-width: 0;
}

/* ---- 下钻弹窗 ---- */
.target-num {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  text-align: center;
  background: var(--el-fill-color-lighter);

  &__value {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--el-text-color-primary);
  }

  &__label {
    margin-top: 2px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.target-chart-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

/* 弹窗折线图固定 240px 高 */
.chart--target {
  height: 240px;
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
