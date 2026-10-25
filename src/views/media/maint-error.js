/**
 * 维护面板的错误文案归一化。
 *
 * RuoYi 的响应拦截器在不同失败路径下 reject 的东西不一样：
 *  - HTTP 层失败（404 / 500 / 网络断）→ 带 response 的 axios 错误
 *  - 后端 code=500（业务异常）→ new Error(msg)，没有 response
 *  - 会话过期（code=401）→ 直接 reject 一个字符串
 * 面板要在这三种情况下都给出「一句能看懂的话」，并且在接口未就绪（404）时说清是没部署而不是页面坏了。
 */

/** 取错误里的可读文案（拿不到就返回空串，由调用方兜底） */
export function errText(err) {
  const data = err && err.response && err.response.data
  if (data && typeof data === 'object') {
    const text = data.error || data.msg
    if (text) {
      return String(text)
    }
  }
  if (typeof err === 'string') {
    return err
  }
  if (err && typeof err.message === 'string' && err.message) {
    return err.message
  }
  return ''
}

/** HTTP 状态码（RuoYi 的业务码不在 HTTP 层，这里拿不到就返回 0） */
export function errStatus(err) {
  const status = err && err.response && err.response.status
  return Number(status) || 0
}

/** 接口未就绪（后端还没部署 P1-A）时给出「该分组暂时不可用、其它功能不受影响」的解释 */
export function notReadyText(err, what) {
  const status = errStatus(err)
  const text = errText(err)
  if (status === 404 || status === 501 || /404|not found|no static resource|未就绪/i.test(text)) {
    return what + '未就绪（后端 P1-A 还没部署）：该分组暂时不可用，部署后刷新页面即可，其它功能不受影响。'
  }
  return what + '读取失败：' + (text || '请求失败，请查看后端日志')
}
