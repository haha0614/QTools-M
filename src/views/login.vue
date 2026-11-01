<template>
  <div class="login-page">
    <main class="login-main">
      <div class="login-lockup">
        <BrandMark class="lockup-mark" :size="28" />
        <span class="lockup-name">{{ brandName }}</span>
      </div>

      <div class="login-card">
        <div class="card-head">
          <h2 class="card-title">登录</h2>
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

        <p class="card-tip">默认账号 admin / admin123</p>
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
/* P6.94.1：单列居中版 —— 去掉左右分栏与左栏营销文案，只留一张卡 */
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px;
  background:
    radial-gradient(900px 520px at 50% -10%, var(--el-color-primary-light-9), transparent 70%),
    var(--el-bg-color-page);
}

.login-main {
  width: 100%;
  max-width: 384px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 顶部小标识：一行字而已，不做营销版面 */
.login-lockup {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 22px;
  color: var(--el-text-color-regular);
}

.lockup-mark { color: var(--el-color-primary); flex: 0 0 auto; }
.lockup-name { font-size: 15px; font-weight: 600; letter-spacing: 0.3px; }

.login-card {
  width: 100%;
  padding: 30px 30px 22px;
  border-radius: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.06);
}

.card-head { text-align: center; margin-bottom: 22px; }
.card-title { margin: 0; font-size: 20px; font-weight: 600; color: var(--el-text-color-primary); letter-spacing: 1px; }

.login-form {
  .input-icon { height: 38px; width: 14px; color: var(--el-text-color-placeholder); }
  :deep(.el-form-item) { margin-bottom: 18px; }
}

.pwd-toggle {
  cursor: pointer;
  color: var(--el-text-color-placeholder);

  &:hover { color: var(--el-color-primary); }
}

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
  margin-top: 16px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}

/* 暗色：卡片提亮一档，否则与页面几乎同色 */
html.dark .login-card {
  background: #1b1d20;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
}

html.dark .login-page {
  background:
    radial-gradient(900px 520px at 50% -10%, rgba(64, 128, 255, 0.12), transparent 70%),
    var(--el-bg-color-page);
}
</style>
