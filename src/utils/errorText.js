/**
 * 从后端错误体里取一句话。
 *
 * 本文件之前散落在 4 个页面里各写一份（views/media/index.vue、person、studio、
 * views/app/user），拆分组件时很容易漏 import —— 直接调用就是运行时 ReferenceError。
 * 新组件一律用这一份。
 */
export function errorText(err) {
  const data = err && err.response && err.response.data
  if (data && typeof data === 'object' && (data.error || data.msg)) return String(data.error || data.msg)
  if (typeof data === 'string' && data.trim()) return data.trim()
  if (typeof err === 'string') return err
  if (err && typeof err.message === 'string') return err.message
  return ''
}

export function errorStatus(err) {
  const status = err && err.response && err.response.status
  return Number(status) || 0
}
