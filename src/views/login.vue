<template>
  <div class="login-page">
    <div class="login-bg" aria-hidden="true"></div>

    <main class="login-main">
      <!-- 品牌行：左对齐，像 Linear / Vercel 那样只占一行 -->
      <div class="login-brand">
        <BrandMark class="brand-mark" :size="22" />
        <span class="brand-name">{{ brandName }}</span>
      </div>

      <div class="login-card">
        <header class="card-head">
          <h1 class="card-title">登录</h1>
          <p class="card-sub">使用管理账号进入后台</p>
        </header>

        <!-- hide-required-asterisk：三个字段都是必填，红色星号只是噪音 -->
        <el-form ref="loginRef" :model="loginForm" :rules="loginRules" class="login-form"
          label-position="top" hide-required-asterisk @keyup.enter="handleLogin">
          <el-form-item prop="username" label="账号">
            <el-input v-model="loginForm.username" clearable auto-complete="off" placeholder="请输入账号" />
          </el-form-item>

          <el-form-item prop="password" label="密码">
            <el-input v-model="loginForm.password" :type="showPassword ? 'text' : 'password'" auto-complete="off"
              placeholder="请输入密码" @keyup.enter="handleLogin">
              <template #suffix>
                <el-icon class="pwd-toggle" @click="showPassword = !showPassword">
                  <component :is="showPassword ? 'View' : 'Hide'" />
                </el-icon>
              </template>
            </el-input>
          </el-form-item>

          <el-form-item prop="code" label="验证码" v-if="captchaEnabled">
            <div class="code-row">
              <el-input v-model="loginForm.code" auto-complete="off" placeholder="请输入验证码"
                class="code-input" @keyup.enter="handleLogin" />
              <button type="button" class="code-box" title="看不清？点击换一张" @click="getCode">
                <img v-if="codeUrl" :src="codeUrl" alt="验证码" class="code-img" />
                <span v-else class="code-ph">加载中</span>
              </button>
            </div>
          </el-form-item>

          <div class="form-row">
            <el-checkbox v-model="loginForm.rememberMe">记住密码</el-checkbox>
            <router-link v-if="register" class="link-type" to="/register">注册账号</router-link>
          </div>

          <el-button class="submit" :loading="loading" type="primary" @click.prevent="handleLogin">
            {{ loading ? '登录中…' : '登录' }}
          </el-button>
        </el-form>

        <footer class="card-foot">
          默认账号 <code>admin</code> / <code>admin123</code>
        </footer>
      </div>

      <p class="login-outer-foot">{{ footerContent }}</p>
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
/* P6.94.2：换成"左对齐 + 细边框卡片 + 网格背景"这一派（Linear / Vercel / GitHub 的登录观感），
   去掉中心大标题与浮动感的厚阴影；表单字段改成 label 在上，信息层次更像产品而不是"模板"。 */
.login-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 40px 20px;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

/* 背景：极淡网格 + 顶部主色柔光，给空白一点结构，但不抢视线 */
.login-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    radial-gradient(760px 420px at 50% -8%, var(--el-color-primary-light-8), transparent 72%),
    linear-gradient(to right, var(--el-border-color-lighter) 1px, transparent 1px),
    linear-gradient(to bottom, var(--el-border-color-lighter) 1px, transparent 1px);
  background-size: 100% 100%, 44px 44px, 44px 44px;
  opacity: 0.55;
  mask-image: radial-gradient(720px 520px at 50% 22%, #000 35%, transparent 82%);
}

.login-main {
  position: relative;
  width: 100%;
  max-width: 392px;
  display: flex;
  flex-direction: column;
}

/* 品牌行（左对齐） */
.login-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  color: var(--el-text-color-regular);
}

.brand-mark { color: var(--el-color-primary); flex: 0 0 auto; }
.brand-name { font-size: 14px; font-weight: 600; letter-spacing: 0.2px; }

/* 卡片：细边框、几乎无阴影——这是"产品感"与"模板感"的分水岭 */
.login-card {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-bg-color);
  padding: 24px 24px 0;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.card-head { margin-bottom: 20px; }
.card-title {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--el-text-color-primary);
}
.card-sub { margin: 0; font-size: 13px; color: var(--el-text-color-secondary); }

.login-form {
  :deep(.el-form-item) { margin-bottom: 16px; }
  :deep(.el-form-item__label) {
    padding-bottom: 6px;
    font-size: 13px;
    line-height: 1.4;
    color: var(--el-text-color-regular);
  }
}

.pwd-toggle {
  cursor: pointer;
  color: var(--el-text-color-placeholder);

  &:hover { color: var(--el-color-primary); }
}

.code-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.code-input { flex: 1 1 auto; }

.code-box {
  flex: 0 0 104px;
  height: 32px;
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
  margin: -2px 0 18px;
}

.submit { width: 100%; }

/* 卡片底栏：用一条发丝线分开，替代"再挂一行说明文字" */
.card-foot {
  margin: 20px -24px 0;
  padding: 12px 24px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-placeholder);

  code {
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-regular);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
}

.login-outer-foot {
  margin: 16px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* 暗色：卡片用浮层色 + 更暗的网格，避免"死黑一片" */
html.dark .login-bg {
  background-image:
    radial-gradient(760px 420px at 50% -8%, rgba(64, 128, 255, 0.16), transparent 72%),
    linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  opacity: 0.6;
}

html.dark .login-card {
  background: var(--el-bg-color-overlay);
  box-shadow: none;
}
</style>
