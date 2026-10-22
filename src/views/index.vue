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
}

/** 跳到工具维护页（菜单未授权时静默忽略） */
function goToolPage() {
  router.push("/qtool").catch(() => {})
}

onMounted(() => {
  load()
  window.addEventListener("resize", handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize)
  trendChart?.dispose()
  rankChart?.dispose()
  trendChart = null
  rankChart = null
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
</style>
