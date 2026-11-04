/**
 * 安全 JSON 解析（P6.261）
 *
 * 起因：菜单的 query 字段是**后台菜单管理里手填的字符串**，前端在跳转时直接 JSON.parse。
 * 管理员填错一个引号，所有人点这个菜单都会白屏 —— 一个纯配置失误不该让整页崩掉。
 *
 * 用法：const query = parseJson(menu.query, {})
 */
export function parseJson(text, fallback = null) {
  if (text == null || text === '') return fallback
  if (typeof text === 'object') return text
  try {
    return JSON.parse(text)
  } catch (e) {
    if (import.meta.env && import.meta.env.DEV) {
      console.warn('[parseJson] 不是合法 JSON，已按兜底处理：', text, e && e.message)
    }
    return fallback
  }
}
