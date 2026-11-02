<template>
  <!-- P6.183：404 与全站统一 —— 原来用若依那套 404 插画 + 蓝底，与门面语言无关。
       现在：一张玻璃卡 + 大号 404 数字 + 一句人话 + 主按钮，沿用卡片材质。 -->
  <div class="qt-error">
    <div class="qt-error-card">
      <div class="qt-error-code">404</div>
      <h1 class="qt-error-title">{{ message }}</h1>
      <p class="qt-error-sub">
        页面不存在或已被移动。检查一下地址，或者从这里回去。
      </p>
      <router-link to="/index" class="qt-error-btn">返回首页</router-link>
    </div>
  </div>
</template>

<script setup>
let message = computed(() => {
  return '找不到网页！'
})
</script>

<style lang="scss" scoped>
/* P6.185：异常页是独立路由（没有 layout），自己铺页面底色 + 网格 ——
   否则浅色下玻璃卡贴在纯白上等于看不见。 */
.qt-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background-color: var(--el-bg-color-page);
  background-image:
    radial-gradient(900px 520px at 12% 4%, var(--qt-glow-1), transparent 70%),
    radial-gradient(820px 480px at 88% 10%, var(--qt-glow-2), transparent 70%),
    radial-gradient(900px 560px at 46% 100%, var(--qt-glow-3), transparent 70%),
    linear-gradient(to right, var(--qt-grid-line) 1px, transparent 1px),
    linear-gradient(to bottom, var(--qt-grid-line) 1px, transparent 1px);
  background-size: 100% 100%, 100% 100%, 100% 100%, 48px 48px, 48px 48px;
}

.qt-error-card {
  width: min(520px, 92vw);
  padding: 40px 36px;
  text-align: center;
  border-radius: 16px;
  border: 1px solid var(--qt-glass-border);
  background: var(--qt-glass-surface);
  backdrop-filter: blur(28px) saturate(170%);
  -webkit-backdrop-filter: blur(28px) saturate(170%);
  box-shadow: var(--qt-glass-shadow), inset 0 1px 0 var(--qt-glass-inner);
}

.qt-error-code {
  font-size: 72px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 2px;
  background: linear-gradient(180deg, var(--el-color-primary), var(--el-color-primary-light-5));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.qt-error-title {
  margin: 14px 0 8px;
  font-size: 18px;
  font-weight: 650;
  color: var(--el-text-color-primary);
}

.qt-error-sub {
  margin: 0 0 22px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--el-text-color-secondary);
}

.qt-error-btn {
  display: inline-block;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  color: #fff;
  text-decoration: none;
  background: linear-gradient(180deg, #60a5fa, #2563eb);
  transition: filter .12s;
}

.qt-error-btn:hover { filter: brightness(1.06); }
</style>
