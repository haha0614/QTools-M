import { createApp } from 'vue'

import Cookies from 'js-cookie'

import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import locale from 'element-plus/es/locale/lang/zh-cn'

import '@/assets/styles/index.scss' // global css

import App from './App'
import store from './store'
import router from './router'
import directive from './directive' // directive

// 注册指令
import plugins from './plugins' // plugins
import { download } from '@/utils/request'

// svg图标
import 'virtual:svg-icons-register'
import SvgIcon from '@/components/SvgIcon'
import elementIcons from '@/components/SvgIcon/svgicon'

import './permission' // permission control

import { useDict } from '@/utils/dict'
import { getConfigKey } from "@/api/system/config"
import { parseTime, resetForm, addDateRange, handleTree, selectDictLabel, selectDictLabels } from '@/utils/ruoyi'

// 分页组件
import Pagination from '@/components/Pagination'
// 自定义表格工具组件
import RightToolbar from '@/components/RightToolbar'
// 富文本组件
import Editor from "@/components/Editor"
// 文件上传组件
import FileUpload from "@/components/FileUpload"
// 图片上传组件
import ImageUpload from "@/components/ImageUpload"
// 图片预览组件
import ImagePreview from "@/components/ImagePreview"
// 字典标签组件
import DictTag from '@/components/DictTag'

const app = createApp(App)

// 全局方法挂载
app.config.globalProperties.useDict = useDict
app.config.globalProperties.download = download
app.config.globalProperties.parseTime = parseTime
app.config.globalProperties.resetForm = resetForm
app.config.globalProperties.handleTree = handleTree
app.config.globalProperties.addDateRange = addDateRange
app.config.globalProperties.getConfigKey = getConfigKey
app.config.globalProperties.selectDictLabel = selectDictLabel
app.config.globalProperties.selectDictLabels = selectDictLabels

// 全局组件挂载
app.component('DictTag', DictTag)
app.component('Pagination', Pagination)
app.component('FileUpload', FileUpload)
app.component('ImageUpload', ImageUpload)
app.component('ImagePreview', ImagePreview)
app.component('RightToolbar', RightToolbar)
app.component('Editor', Editor)

app.use(router)
app.use(store)
app.use(plugins)
app.use(elementIcons)
app.component('svg-icon', SvgIcon)

directive(app)

/**
 * P6.08 全局兜底：任何组件里逃出来的异常只记录、不放大。
 *
 * 为什么需要：Vue 3 把渲染 / 生命周期 / 事件里的异常交给 app.config.errorHandler，
 * 未配置时默认只 console.error，界面却可能停在半截（页面全空、侧栏还在），
 * 用户看到的就是「白屏且之后点什么都是白屏」。这里统一收口，保证：
 *   1) 控制台一定有一条带 info 与组件名的记录（排查要第一现场）；
 *   2) 配置了 VITE_APP_ERROR_REPORT 时异步上报（上报失败绝不影响页面）；
 *   3) 不 rethrow、不弹全局红色错误条 —— 页面级展示交给 AppMain 里的 <error-boundary>。
 */
app.config.errorHandler = (err, instance, info) => {
  const name = (instance && instance.type && (instance.type.name || instance.type.__name || instance.type.__file)) || 'unknown'
  const payload = {
    info: String(info || ''),
    component: String(name),
    message: String((err && err.message) || err),
    stack: String((err && err.stack) || ''),
    url: typeof location !== 'undefined' ? location.href : '',
    at: new Date().toISOString()
  }
  // 说明：这里用 console.error 而不是 console.warn —— 兜底不等于吞掉，测试与线上排查都靠它
  console.error('[全局异常] ' + payload.info + ' @ ' + payload.component, err)
  reportError(payload)
}

/**
 * 上报端点（可选）：VITE_APP_ERROR_REPORT=/admin-api/client-error 之类。
 * 没配就只打日志；sendBeacon 在页面即将跳走时也能发出去，失败静默。
 */
function reportError(payload) {
  const url = import.meta.env.VITE_APP_ERROR_REPORT
  if (!url) return
  try {
    const body = JSON.stringify(payload)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    } else if (typeof fetch === 'function') {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  } catch (e) {
    // 上报自身出错不影响页面
  }
}

/**
 * 未处理的 Promise 拒绝同样只记录：异步回包里访问已销毁组件的状态是常见事故，
 * 记录下来即可，绝不让它把页面推进不可恢复的状态。
 */
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason
    console.error('[未处理的 Promise 拒绝]', reason)
    reportError({
      info: 'unhandledrejection',
      component: '-',
      message: String((reason && reason.message) || reason),
      stack: String((reason && reason.stack) || ''),
      url: typeof location !== 'undefined' ? location.href : '',
      at: new Date().toISOString()
    })
  })
}

// 使用element-plus 并且设置全局的大小
app.use(ElementPlus, {
  locale: locale,
  // 支持 large、default、small
  size: Cookies.get('size') || 'default'
})

app.mount('#app')
