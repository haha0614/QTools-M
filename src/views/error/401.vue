<template>
  <!-- P6.184：401 与 404 同一套（原来是一张冰淇淋 GIF + 墨绿按钮，与门面无关） -->
  <div class="qt-error">
    <div class="qt-error-card">
      <div class="qt-error-code">401</div>
      <h1 class="qt-error-title">您没有访问权限！</h1>
      <p class="qt-error-sub">
        当前账号无权访问该页面。请确认是否登录了正确的账号，或联系管理员开通权限。
      </p>
      <div class="qt-error-actions">
        <button type="button" class="qt-error-btn ghost" @click="back">返回上一页</button>
        <router-link to="/index" class="qt-error-btn">返回首页</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
let { proxy } = getCurrentInstance()

function back() {
  if (proxy.$route.query.noGoBack) {
    proxy.$router.push({ path: "/" })
  } else {
    proxy.$router.go(-1)
  }
}
</script>

<style lang="scss" scoped>
.qt-error {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 120px);
  padding: 24px;
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

.qt-error-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.qt-error-btn {
  display: inline-block;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  color: #fff;
  text-decoration: none;
  border: 0;
  cursor: pointer;
  background: linear-gradient(180deg, #60a5fa, #2563eb);
  transition: filter .12s;

  &:hover { filter: brightness(1.06); }

  &.ghost {
    background: transparent;
    color: var(--el-text-color-regular);
    border: 1px solid var(--el-border-color);

    &:hover { filter: none; border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); }
  }
}
</style>
