<template>
  <!-- P6.08 路由级兜底：单页里的异常不许把整个 SPA 打死。
       捕获到后代组件的异常（渲染 / 生命周期 / 事件）后，这里换成「本页出错了」而不是留白，
       侧栏、标签页、路由切换照旧可用；「重试」重新挂载本页，「回首页」回 /index。 -->
  <slot v-if="!error" />
  <div v-else class="page-error" data-testid="page-error-fallback">
    <el-result icon="error" title="本页出错了" :sub-title="subTitle">
      <template #extra>
        <el-button type="primary" @click="retry">重试</el-button>
        <el-button @click="goHome">回首页</el-button>
      </template>
    </el-result>
    <details v-if="stack" class="page-error-stack">
      <summary>技术细节（截图给开发排查用）</summary>
      <pre>{{ stack }}</pre>
    </details>
  </div>
</template>

<script setup name="ErrorBoundary">
import { onBeforeUnmount, onErrorCaptured, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const error = ref(null)
const stack = ref('')
const subTitle = ref('')

/** 捕获后代异常：返回 false 表示已处理（不再冒泡到 app.config.errorHandler 之外） */
onErrorCaptured((err, instance, info) => {
  error.value = err || new Error('未知异常')
  stack.value = (err && err.stack) || String(err)
  subTitle.value = '页面 ' + route.path + ' 渲染中断（' + (info || 'unknown') + '），其它页面不受影响'
  // 兜底不等于掩盖：第一现场仍要留下一条 error 日志
  console.error('[本页出错了] ' + (info || '') + ' @ ' + route.path, err)
  return false
})

/** 重试：清掉错误态让 slot 重新渲染（子树会重新挂载一次） */
function retry() {
  error.value = null
  stack.value = ''
  subTitle.value = ''
}

function goHome() {
  retry()
  if (route.path !== '/index') router.push('/index')
}

/** 换页即复原：兜底组件只负责当前这一页，切到别页必须自动清掉错误态 */
watch(() => route.fullPath, () => retry())

onBeforeUnmount(() => {
  error.value = null
})

</script>

<style scoped>
.page-error {
  padding: 32px 16px;
}

.page-error-stack {
  margin: 0 auto;
  max-width: 720px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.page-error-stack pre {
  max-height: 280px;
  overflow: auto;
  padding: 10px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>