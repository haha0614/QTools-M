<template>
  <div class="login-page">
    <div class="login-glow" aria-hidden="true"></div>

    <main class="login-main">
      <div class="login-brand">
        <BrandMark class="brand-mark" :size="20" />
        <span class="brand-name">{{ brandName }}</span>
      </div>

      <section class="login-card">
        <header class="card-head">
          <h1 class="card-title">登录</h1>
          <p class="card-sub">使用管理账号进入后台</p>
        </header>

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
      </section>

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
/**
 * P6.94.3：按 Linear / Vercel 的实际取值重排（设计语言来源见 doc 里的记录）：
 * - 边框一律用"极细半透明发丝线"，不用实心灰：rgba(15,23,42,.08) / rgba(255,255,255,.06)
 * - 层次靠亮度而非颜色：强文本 #16181d、次文本 #5b6470、弱文本 #8a8f98
 * - 字号阶梯 20 / 14 / 13 / 12，字重 590 / 510 / 400（Linear 的 510 介于 regular 与 medium 之间）
 * - 控件等高 36px，8px 栅格：label 下 6、字段间 14、区块间 20
 * - 不用阴影：卡片靠发丝边框与背景亮度差立起来
 */
.login-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 40px 20px;
  background: #fbfbfd;
  overflow: hidden;
}

/* 顶部一层极淡的品牌色光晕：让"白底"不是死白，也不做网格那种装饰 */
.login-glow {
  position: absolute;
  inset: -20% -10% auto -10%;
  height: 60%;
  pointer-events: none;
  background: radial-gradient(60% 60% at 50% 0%, rgba(94, 106, 210, 0.10), transparent 70%);
}

.login-main {
  position: relative;
  width: 100%;
  max-width: 384px;
  display: flex;
  flex-direction: column;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 16px;
  color: #5b6470;
}

.brand-mark { color: var(--el-color-primary); flex: 0 0 auto; }
.brand-name { font-size: 13px; font-weight: 510; letter-spacing: 0.1px; }

.login-card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 10px;
  background: #fff;
  padding: 26px 26px 0;
}

.card-head { margin-bottom: 20px; }
.card-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 590;
  line-height: 1.3;
  letter-spacing: -0.2px;
  color: #16181d;
}
.card-sub { margin: 0; font-size: 13px; line-height: 1.5; color: #8a8f98; }

.login-form {
  :deep(.el-form-item) { margin-bottom: 14px; }
  :deep(.el-form-item:last-of-type) { margin-bottom: 8px; }
  :deep(.el-form-item__label) {
    padding-bottom: 6px;
    font-size: 13px;
    font-weight: 510;
    line-height: 1.4;
    color: #5b6470;
  }
  :deep(.el-input__wrapper) {
    box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.10) inset;
    transition: box-shadow 0.15s;

    &:hover { box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.20) inset; }
    &.is-focus {
      box-shadow: 0 0 0 1px var(--el-color-primary) inset, 0 0 0 3px rgba(64, 158, 255, 0.12);
    }
  }
  :deep(.el-input__inner) { font-size: 14px; }
}

.pwd-toggle {
  cursor: pointer;
  color: #b4b9c2;

  &:hover { color: var(--el-color-primary); }
}

.code-row { display: flex; align-items: center; gap: 8px; width: 100%; }
.code-input { flex: 1 1 auto; }

.code-box {
  flex: 0 0 100px;
  height: 32px;
  padding: 0;
  border: 1px solid rgba(15, 23, 42, 0.10);
  border-radius: 5px;
  background: #f7f8fa;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;

  &:hover { border-color: rgba(15, 23, 42, 0.24); }
}

.code-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.code-ph { font-size: 12px; color: #a8aeb8; }

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 16px;
  font-size: 13px;
}

.submit {
  width: 100%;
  height: 36px;
  font-size: 13.5px;
  font-weight: 510;
  letter-spacing: 0.2px;
  border-radius: 7px;
}

.card-foot {
  margin: 22px -26px 0;
  padding: 11px 26px;
  border-top: 1px solid rgba(15, 23, 42, 0.06);
  font-size: 12px;
  color: #a8aeb8;

  code {
    padding: 1px 5px;
    border-radius: 4px;
    background: #f2f3f6;
    color: #5b6470;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
}

.login-outer-foot {
  margin: 18px 0 0;
  text-align: center;
  font-size: 12px;
  color: #b4b9c2;
}

/* ---------------- 暗色：near-black 画布，靠白色透明度分级 ---------------- */
html.dark .login-page { background: #08090a; }

html.dark .login-glow {
  background: radial-gradient(60% 60% at 50% 0%, rgba(113, 112, 255, 0.16), transparent 70%);
}

html.dark .login-brand { color: #8a8f98; }

html.dark .login-card {
  background: #0e0f11;
  border-color: rgba(255, 255, 255, 0.06);
}

html.dark .card-title { color: #f7f8f8; }
html.dark .card-sub { color: #8a8f98; }

html.dark .login-form {
  :deep(.el-form-item__label) { color: #8a8f98; }
  :deep(.el-input__wrapper) {
    background: #131417;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.07) inset;

    &:hover { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.16) inset; }
    &.is-focus {
      box-shadow: 0 0 0 1px rgba(113, 112, 255, 0.8) inset, 0 0 0 3px rgba(113, 112, 255, 0.14);
    }
  }
  :deep(.el-input__inner) { color: #f7f8f8; }
}

html.dark .pwd-toggle { color: #62666d; }

html.dark .code-box {
  border-color: rgba(255, 255, 255, 0.07);
  background: #131417;

  &:hover { border-color: rgba(255, 255, 255, 0.18); }
}

html.dark .card-foot {
  border-top-color: rgba(255, 255, 255, 0.05);
  color: #62666d;

  code { background: #1a1c1f; color: #8a8f98; }
}

html.dark .login-outer-foot { color: #62666d; }
</style>
