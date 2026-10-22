/**
 * 工具站前端地址解析（管理端共用）。
 *
 * 规则：
 *  - 已是完整地址（http/https）时原样返回；
 *  - 以 / 开头的站内路由拼当前站点源（前台与后台同源：nginx / 8080 统一入口）；
 *  - 前后台分开部署时，可用 VITE_APP_USER_SITE_URL 覆盖站点源。
 *
 * @param {string} route 工具记录里配置的前端访问路由，如 /tool/json
 * @returns {string} 可直接用于 href / iframe src 的地址；无路由时返回空串
 */
export function resolveToolUrl(route) {
  if (!route) return ''
  if (/^https?:\/\//i.test(route)) return route
  const origin = import.meta.env.VITE_APP_USER_SITE_URL || window.location.origin
  return origin.replace(/\/+$/, '') + (route.startsWith('/') ? route : '/' + route)
}
