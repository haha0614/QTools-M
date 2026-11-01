<template>
  <div class="login-page">
    <!-- 左：品牌面板（窄屏隐藏） -->
    <aside class="login-brand">
      <div class="brand-inner">
        <div class="brand-head">
          <BrandMark class="brand-mark" :size="34" />
          <span class="brand-name">{{ brandName }}</span>
        </div>
        <h1 class="brand-title">媒体库管理后台</h1>
        <p class="brand-sub">把磁盘上的文件变成原子个体，归属由你和规则决定——路径是事实，册是解释。</p>
        <ul class="brand-points">
          <li><span class="dot"></span>扫描只产出个体，归属走规则，未命中即「未归类」</li>
          <li><span class="dot"></span>册 / 标签 / 人物 / 工作室四类维度，互不干扰</li>
          <li><span class="dot"></span>重复文件按内容哈希与感知指纹分组，清理进回收站可恢复</li>
          <li><span class="dot"></span>审核与策展同一道门，未通过的内容站端不可见</li>
        </ul>
      </div>
      <div class="brand-foot">© {{ year }} {{ brandName }}</div>
    </aside>

    <!-- 右：登录表单 -->
    <main class="login-main">
      <div class="login-card">
        <div class="card-head">
          <BrandMark class="card-mark" :size="26" />
          <h2 class="card-title">登录</h2>
          <p class="card-sub">请使用管理账号登录后台</p>
        </div>

        <el-form ref="loginRef" :model="loginForm" :rules="loginRules" class="login-form" @keyup.enter="handleLogin">
          <el-form-item prop="username">
            <el-input v-model="loginForm.username" size="large" clearable auto-complete="off"
              placeholder="账号">
              <template #prefix><svg-icon icon-class="user" class="input-icon" /></template>
            </el-input>
          </el-form-item>

          <el-form-item prop="password">
            <el-input v-model="loginForm.password" :type="showPassword ? 'text' : 'password'" size="large"
              auto-complete="off" placeholder="密码" @keyup.enter="handleLogin">
              <template #prefix><svg-icon icon-class="password" class="input-icon" /></template>
              <template #suffix>
                <el-icon class="pwd-toggle" @click="showPassword = !showPassword">
                  <component :is="showPassword ? 'View' : 'Hide'" />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="code" v-if="captchaEnabled">
            <div class="code-row">
              <el-input v-model="loginForm.code" size="large" auto-complete="off" placeholder="验证码"
                class="code-input" @keyup.enter="handleLogin">
                <template #prefix><svg-icon icon-class="validCode" class="input-icon" /></template>
              </el-input>
              <button type="button" class="code-box" :title="'看不清？点击换一张'" @click="getCode">
                <img v-if="codeUrl" :src="codeUrl" alt="验证码" class="code-img" />
                <span v-else class="code-ph">加载中…</span>
              </button>
            </div>
          </el-form-item>

          <div class="form-row">
            <el-checkbox v-model="loginForm.rememberMe">记住密码</el-checkbox>
            <router-link v-if="register" class="link-type" to="/register">立即注册</router-link>
          </div>

          <el-button class="submit" :loading="loading" size="large" type="primary" @click.prevent="handleLogin">
            {{ loading ? '登 录 中…' : '登 录' }}
          </el-button>
        </el-form>

        <p class="card-tip">首次使用默认为 admin / admin123，登录后请及时修改密码。</p>
      </div>
      <div class="login-footer">{{ footerContent }}</div>
    </main>
  </div>
</template>

<script setup>
import { getCodeImg } from "@/api/login"
import Cookies from "js-cookie"
import { encrypt, decrypt } from "@/utils/jsencrypt"
import useUserStore from '@/store/modules/user'
import defaultSettings from '@/settings'
import BrandMark from '@/components/BrandMark.vue'

const title = import.meta.env.VITE_APP_TITLE
const brandName = title || '青兔工具箱'
const footerContent = defaultSettings.footerContent
const year = new Date().getFullYear()
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const { proxy } = getCurrentInstance()

/** 密码可见性（P6.94：重做登录页时加的，纯 UI） */
const showPassword = ref(false)

const loginForm = ref({
  username: "admin",
  password: "admin123",
  rememberMe: false,
  code: "",
  uuid: ""
})

const loginRules = {
  username: [{ required: true, trigger: "blur", message: "请输入您的账号" }],
  password: [{ required: true, trigger: "blur", message: "请输入您的密码" }],
  code: [{ required: true, trigger: "change", message: "请输入验证码" }]
}

const codeUrl = ref("")
const loading = ref(false)
// 验证码开关
const captchaEnabled = ref(true)
// 注册开关
const register = ref(false)
const redirect = ref(undefined)

watch(route, (newRoute) => {
  redirect.value = newRoute.query && newRoute.query.redirect
}, { immediate: true })

function handleLogin() {
  proxy.$refs.loginRef.validate(valid => {
    if (valid) {
      loading.value = true
      // 勾选了需要记住密码设置在 cookie 中设置记住用户名和密码
      if (loginForm.value.rememberMe) {
        Cookies.set("username", loginForm.value.username, { expires: 30 })
        Cookies.set("password", encrypt(loginForm.value.password), { expires: 30 })
        Cookies.set("rememberMe", loginForm.value.rememberMe, { expires: 30 })
      } else {
        // 否则移除
        Cookies.remove("username")
        Cookies.remove("password")
        Cookies.remove("rememberMe")
      }
      // 调用action的登录方法
      userStore.login(loginForm.value).then(() => {
        const query = route.query
        const otherQueryParams = Object.keys(query).reduce((acc, cur) => {
          if (cur !== "redirect") {
            acc[cur] = query[cur]
          }
          return acc
        }, {})
        router.push({ path: redirect.value || "/", query: otherQueryParams })
      }).catch(() => {
        loading.value = false
        // 重新获取验证码
        if (captchaEnabled.value) {
          getCode()
        }
      })
    }
  })
}

function getCode() {
  getCodeImg().then(res => {
    captchaEnabled.value = res.captchaEnabled === undefined ? true : res.captchaEnabled
    if (captchaEnabled.value) {
      codeUrl.value = "data:image/gif;base64," + res.img
      loginForm.value.uuid = res.uuid
    }
  })
}

function getCookie() {
  const username = Cookies.get("username")
  const password = Cookies.get("password")
  const rememberMe = Cookies.get("rememberMe")
  loginForm.value = {
    username: username === undefined ? loginForm.value.username : username,
    password: password === undefined ? loginForm.value.password : decrypt(password),
    rememberMe: rememberMe === undefined ? false : Boolean(rememberMe)
  }
}

getCode()
getCookie()
</script>

<style lang='scss' scoped>
/* P6.94：登录页重做 —— 左侧品牌 + 右侧卡片的两栏布局；颜色全部走 Element Plus 变量，明暗主题自适应 */
.login-page {
  display: flex;
  height: 100%;
  background: var(--el-bg-color-page);
}

/* ---------------- 左：品牌面板 ---------------- */
.login-brand {
  flex: 1 1 46%;
  min-width: 360px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 48px 56px;
  color: #fff;
  background:
    radial-gradient(1200px 600px at 12% 8%, rgba(255, 255, 255, 0.22), transparent 60%),
    linear-gradient(140deg, #2563eb 0%, #1d4ed8 42%, #0f766e 100%);
}

.brand-inner { max-width: 520px; }

.brand-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 40px;
}

.brand-mark { flex: 0 0 auto; color: #fff; }
.brand-name { font-size: 18px; font-weight: 600; letter-spacing: 0.5px; }

.brand-title {
  margin: 0 0 12px;
  font-size: 34px;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: 1px;
}

.brand-sub {
  margin: 0 0 28px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.82);
}

.brand-points {
  list-style: none;
  margin: 0;
  padding: 0;

  li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 13.5px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 12px;
  }

  .dot {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    margin-top: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
  }
}

.brand-foot { font-size: 12px; color: rgba(255, 255, 255, 0.6); letter-spacing: 0.5px; }

/* ---------------- 右：表单 ---------------- */
.login-main {
  flex: 1 1 54%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 32px 32px 24px;
  border-radius: 14px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.08);
}

.card-head { margin-bottom: 22px; text-align: center; }
.card-mark { color: var(--el-color-primary); margin-bottom: 6px; }
.card-title { margin: 0; font-size: 22px; font-weight: 600; color: var(--el-text-color-primary); }
.card-sub { margin: 6px 0 0; font-size: 13px; color: var(--el-text-color-secondary); }

.login-form {
  .input-icon { height: 38px; width: 14px; color: var(--el-text-color-placeholder); }
  :deep(.el-form-item) { margin-bottom: 18px; }
}

.pwd-toggle {
  cursor: pointer;
  color: var(--el-text-color-placeholder);

  &:hover { color: var(--el-color-primary); }
}

/* 验证码：输入框 + 图块一行 */
.code-row { display: flex; align-items: center; gap: 10px; width: 100%; }
.code-input { flex: 1 1 auto; }

.code-box {
  flex: 0 0 132px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-fill-color-lighter);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;

  &:hover { border-color: var(--el-color-primary); }
}

.code-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.code-ph { font-size: 12px; color: var(--el-text-color-placeholder); }

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -4px 0 18px;
}

.submit { width: 100%; letter-spacing: 2px; }

.card-tip {
  margin: 16px 0 0;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
  color: var(--el-text-color-placeholder);
}

.login-footer {
  margin-top: 18px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}

/* 窄屏：隐藏品牌面板，只留表单 */
@media (max-width: 900px) {
  .login-brand { display: none; }
  .login-main { flex: 1 1 100%; }
  .login-card { max-width: 420px; box-shadow: none; }
}

/* 暗色：卡片用浮层色，避免和页面底色贴在一起 */
html.dark .login-card {
  /* 暗色下 el-bg-color-overlay 与页面底色几乎同色，卡片刻意提亮一档 */
  background: #1b1d20;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 18px 56px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}

/* 暗色下右侧补一点极淡的径向光，避免整块死黑 */
html.dark .login-main {
  background: radial-gradient(680px 420px at 55% 40%, rgba(64, 128, 255, 0.1), transparent 70%);
}
</style>
