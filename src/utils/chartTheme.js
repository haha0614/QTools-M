/**
 * P6.117 · 图表配色统一入口
 *
 * 全站 echarts 都从这里取色：色板走主色系（--el-color-primary = #2563eb），
 * 文字与网格线走 Element 的文字/边框变量。这样切主题、改主色时图表自动跟随，
 * 不会再出现"页面 #2563eb、图表 #5470c6、另一个页面 macarons 主题"这种三套蓝。
 *
 * 用法：
 *   const theme = chartTheme()
 *   chart.setOption({ color: theme.palette, xAxis: { axisLabel: { color: theme.sub } }, ... })
 */
export function chartTheme() {
  const css = getComputedStyle(document.documentElement)
  const pick = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback
  return {
    palette: [
      pick('--el-color-primary', '#2563eb'),
      pick('--el-color-success', '#67c23a'),
      pick('--el-color-warning', '#e6a23c'),
      pick('--el-color-danger', '#f56c6c'),
      pick('--el-color-primary-light-3', '#6692f1'),
      pick('--el-color-primary-light-5', '#92b1f5')
    ],
    /**
     * 单色梯度：给饼图/玫瑰图这类"同一维度的多个分类"用。
     * 用语义色（成功绿/警告橙/危险红）画分类饼会让人误读成"红=错误"，
     * 主色的深浅梯度才是中性的分类色。
     */
    ramp: [
      pick('--el-color-primary', '#2563eb'),
      pick('--el-color-primary-light-3', '#6692f1'),
      pick('--el-color-primary-light-5', '#92b1f5'),
      pick('--el-color-primary-light-7', '#bed1f9'),
      pick('--el-color-primary-light-8', '#d3e0fb'),
      pick('--el-color-primary-dark-2', '#1e4fbc')
    ],
    text: pick('--el-text-color-regular', '#606266'),
    sub: pick('--el-text-color-secondary', '#909399'),
    line: pick('--el-border-color-lighter', '#ebeef5')
  }
}

export default chartTheme