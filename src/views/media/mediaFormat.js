/**
 * media 页面与各子组件共用的几个小格式化函数（P6.222 提取）。
 * 原本散在 index.vue 里，拆组件时需要同一份语义，避免各写一份出现显示差异。
 */

/** 体积：>=1024MB 用 GB，>=1MB 用 MB，否则 KB */
export function formatVolume(bytes) {
  const num = Number(bytes) || 0
  const mb = num / 1048576
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
  if (mb >= 1) return mb.toFixed(1) + ' MB'
  return (num / 1024).toFixed(1) + ' KB'
}

/** relPath 的最后一段 */
export function photoFileName(relPath) {
  const parts = String(relPath || '').split(/[\\/]/)
  return parts[parts.length - 1] || ''
}
/** 媒体资源前缀（与若依的 VITE_APP_BASE_API 一致） */
export const MEDIA_BASE = import.meta.env.VITE_APP_BASE_API || ''

/** 媒体资源地址：http(s) 原样返回，相对路径加前缀 */
export function mediaSrc(path, base = MEDIA_BASE) {
  if (!path) return ''
  return path.startsWith('http') ? path : base + path
}