<template>
  <div class="login-page">
    <!-- 背景装饰：4 团光斑 + 2 圈细环。细环的作用是让"玻璃后面的模糊"看得出来 -->
    <div class="bg" aria-hidden="true">
      <span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="blob b4"></span>
      <span class="ring ring1"></span><span class="ring ring2"></span>
    </div>

    <section class="glass">
      <!-- 折射层：卡内再画一遍放大 1.3 倍的光斑，模拟透镜 -->
      <div class="lens" aria-hidden="true">
        <span class="l l1"></span><span class="l l2"></span><span class="l l3"></span>
      </div>
      <div class="spec" aria-hidden="true"></div>
      <div class="grain" aria-hidden="true"></div>

      <!-- 左：有色玻璃封面 -->
      <aside class="cover">
        <div class="cover-top">
          <BrandMark class="cover-mark" :size="18" />
          <span class="cover-name">{{ brandName }}</span>
        </div>
        <div class="cover-body">
          <p class="cover-line">一个目录进来，<br><b>一本可以翻的册</b>出去。</p>
          <span class="cover-chip">扫描 → 个体 → 规则归属</span>
        </div>
      </aside>

      <!-- 右：表单 -->
      <main class="form">
        <h1 class="form-title">登录</h1>
        <p class="form-sub">使用管理账号进入后台</p>

        <el-form ref="loginRef" :model="loginForm" :rules="loginRules" class="login-form"
          label-position="top" hide-required-asterisk @keyup.enter="handleLogin">
          <el-form-item prop="username" label="账号">
            <el-input v-model="loginForm.username" auto-complete="off" placeholder="请输入账号" />
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
            {{ loading ? '登录中…' : '登 录' }}
          </el-button>
        </el-form>

        <p class="form-hint">默认账号 <code>admin</code> / <code>admin123</code></p>
      </main>
    </section>

    <p class="outer-foot">{{ footerContent }}</p>
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
 * P6.95：登录页定稿 —— 分栏大卡（原 09）+ 液态玻璃（P6.94 那套手法）。
 *
 * 玻璃成立的五个条件，少一个就变"半透明白板"：
 *   1. 背景必须有内容可折射（光斑 + 细环），纯色渐变被模糊等于没模糊；
 *   2. 模糊要小（10px）：模糊大了就成奶白塑料；
 *   3. saturate/brightness 上提，通透感来自"更艳"，不是"更白"；
 *   4. 四边亮色内沿 + 斜向镜面扫光（真实玻璃的棱与反射）；
 *   5. 卡内再画一层放大的光斑，模拟透镜折射。
 * 不支持 backdrop-filter 的内核走 @supports 兜底（纯色板 + 正常阴影）。
 */
.login-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px;
  overflow: hidden;
  background: linear-gradient(150deg, #eef2ff 0%, #e0f2fe 46%, #eefaf3 100%);
}

/* ---------------- 背景 ---------------- */
.bg { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }

.blob { position: absolute; border-radius: 50%; filter: blur(30px); }
.b1 { width: 460px; height: 460px; left: 4%; top: 4%; background: radial-gradient(circle at 35% 35%, #a5b4fc, #4f46e5); opacity: 0.85; }
.b2 { width: 400px; height: 400px; right: 6%; top: 10%; background: radial-gradient(circle at 60% 40%, #67e8f9, #0891b2); opacity: 0.8; }
.b3 { width: 520px; height: 520px; left: 30%; bottom: -16%; background: radial-gradient(circle at 50% 50%, #fbcfe8, #db2777); opacity: 0.65; }
.b4 { width: 300px; height: 300px; right: 20%; bottom: 4%; background: radial-gradient(circle at 45% 45%, #fde68a, #f59e0b); opacity: 0.6; }

.ring { position: absolute; border-radius: 50%; filter: blur(5px); }
.ring1 { width: 560px; height: 560px; left: calc(50% - 330px); top: calc(50% - 320px); border: 10px solid rgba(99, 102, 241, 0.3); }
.ring2 { width: 260px; height: 260px; right: 13%; top: calc(50% - 130px); border: 8px solid rgba(8, 145, 178, 0.26); }

/* ---------------- 玻璃卡 ---------------- */
.glass {
  position: relative;
  z-index: 2;
  display: flex;
  width: min(860px, 94vw);
  height: min(500px, 88vh);
  border-radius: 28px;
  overflow: hidden;
  background: linear-gradient(152deg, rgba(255, 255, 255, 0.44), rgba(255, 255, 255, 0.18));
  backdrop-filter: blur(10px) saturate(220%) brightness(1.1) contrast(1.02);
  -webkit-backdrop-filter: blur(10px) saturate(220%) brightness(1.1) contrast(1.02);
  box-shadow:
    0 32px 80px rgba(24, 32, 48, 0.24),
    0 2px 10px rgba(24, 32, 48, 0.1),
    0 0 0 1px rgba(255, 255, 255, 0.5),
    inset 0 1.5px 0 rgba(255, 255, 255, 1),
    inset 0 -1.5px 1px rgba(255, 255, 255, 0.5),
    inset 1.5px 0 0 rgba(255, 255, 255, 0.8),
    inset -1.5px 0 0 rgba(255, 255, 255, 0.8);
}

.lens { position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0.36; overflow: hidden; }
.lens .l { position: absolute; border-radius: 50%; filter: blur(16px) saturate(160%); transform: scale(1.3); }
.l1 { width: 280px; height: 280px; left: -50px; top: -40px; background: radial-gradient(circle, #818cf8, #4f46e5); }
.l2 { width: 240px; height: 240px; right: -60px; top: 60px; background: radial-gradient(circle, #22d3ee, #0e7490); }
.l3 { width: 300px; height: 300px; left: 120px; bottom: -90px; background: radial-gradient(circle, #f9a8d4, #db2777); }

.spec,
.grain { position: absolute; inset: 0; z-index: 3; pointer-events: none; }

.spec {
  background: linear-gradient(118deg,
    rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.08) 16%,
    rgba(255, 255, 255, 0) 40%, rgba(255, 255, 255, 0) 66%,
    rgba(255, 255, 255, 0.36) 100%);
  mix-blend-mode: screen;
}

.grain {
  opacity: 0.15;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/><feColorMatrix type='saturate' values='0'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='0.6'/></svg>");
  background-size: 120px 120px;
}

/* ---------------- 左：有色玻璃封面 ---------------- */
.cover {
  position: relative;
  z-index: 2;
  flex: 0 0 45%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 30px 28px;
  background: linear-gradient(158deg, rgba(37, 99, 235, 0.42), rgba(13, 148, 136, 0.34));
  backdrop-filter: blur(6px) saturate(180%);
  -webkit-backdrop-filter: blur(6px) saturate(180%);
  border-right: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.cover-top { display: flex; align-items: center; gap: 9px; color: #fff; font-size: 13px; font-weight: 600; }
.cover-mark { color: #fff; flex: 0 0 auto; }
.cover-name { text-shadow: 0 1px 10px rgba(0, 0, 0, 0.25); }

.cover-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.95;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.25);

  b { font-weight: 650; }
}

.cover-chip {
  display: inline-block;
  margin-top: 16px;
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 11.5px;
  color: #fff;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.5);
}

/* ---------------- 右：表单 ---------------- */
.form {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 42px 44px;
}

.form-title { margin: 0 0 5px; font-size: 22px; font-weight: 650; letter-spacing: -0.3px; color: #0f172a; }
.form-sub { margin: 0 0 24px; font-size: 12.5px; color: #475569; }

.login-form {
  :deep(.el-form-item) { margin-bottom: 14px; }
  :deep(.el-form-item__label) {
    padding-bottom: 6px;
    font-size: 12.5px;
    font-weight: 520;
    line-height: 1.4;
    color: #334155;
  }
  :deep(.el-input__wrapper) {
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.42));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.85),
      0 1px 2px rgba(15, 23, 42, 0.06);
    transition: box-shadow 0.15s;

    &:hover { box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 0 0 1px rgba(37, 99, 235, 0.35), 0 1px 2px rgba(15, 23, 42, 0.08); }
    &.is-focus { box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.7), 0 0 0 4px rgba(37, 99, 235, 0.16); }
  }
  :deep(.el-input__inner) { font-size: 13.5px; color: #0f172a; }
  :deep(.el-input__inner::placeholder) { color: #7c8798; }
}

.pwd-toggle { cursor: pointer; color: #6b7a90; &:hover { color: #2563eb; } }

.code-row { display: flex; align-items: center; gap: 9px; width: 100%; }
.code-input { flex: 1 1 auto; }

.code-box {
  flex: 0 0 100px;
  height: 32px;
  padding: 0;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.66), rgba(255, 255, 255, 0.46));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover { border-color: rgba(37, 99, 235, 0.45); }
}

.code-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.code-ph { font-size: 12px; color: #7c8798; }

.form-row { display: flex; align-items: center; justify-content: space-between; margin: 2px 0 16px; font-size: 12.5px; }

.submit {
  width: 100%;
  height: 38px;
  border: 0;
  border-radius: 14px;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 2px;
  color: #fff;
  background: linear-gradient(180deg, #60a5fa, #2563eb);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12);

  &:hover { background: linear-gradient(180deg, #6fb0fb, #2f6ce8); }
}

.form-hint {
  margin: 16px 0 0;
  font-size: 11.5px;
  text-align: center;
  color: #64748b;

  code {
    padding: 1px 5px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.6);
    color: #334155;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
}

.outer-foot { position: absolute; bottom: 14px; margin: 0; font-size: 11.5px; color: #7d8798; }

/* ---------------- 窄屏：竖排，封面压成一条 ---------------- */
@media (max-width: 860px) {
  .glass { flex-direction: column; height: auto; max-height: none; width: min(420px, 94vw); }
  .cover { flex: 0 0 auto; padding: 18px 22px; border-right: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.45); }
  .cover-line { display: none; }
  .cover-chip { display: none; }
  .form { padding: 26px 22px 22px; }
  .outer-foot { position: static; margin-top: 14px; text-align: center; }
}

/* ---------------- 兜底：不支持 backdrop-filter 的内核 ---------------- */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: rgba(255, 255, 255, 0.94); box-shadow: 0 24px 60px rgba(24, 32, 48, 0.18); }
  .cover { background: linear-gradient(158deg, #2563eb, #0d9488); }
  .lens, .spec, .grain { display: none; }
}

/* ---------------- 暗色：黑玻璃 ---------------- */
html.dark .login-page { background: #0a0c12; }
html.dark .b1 { opacity: 0.5; }
html.dark .b2 { opacity: 0.45; }
html.dark .b3 { opacity: 0.35; }
html.dark .b4 { opacity: 0.3; }
html.dark .ring1 { border-color: rgba(129, 140, 248, 0.24); }
html.dark .ring2 { border-color: rgba(34, 211, 238, 0.2); }

html.dark .glass {
  background: linear-gradient(152deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
  box-shadow:
    0 32px 80px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.12),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1.5px 1px rgba(255, 255, 255, 0.08);
}

html.dark .cover { background: linear-gradient(158deg, rgba(37, 99, 235, 0.5), rgba(13, 148, 136, 0.42)); }
html.dark .form-title { color: #f2f5f9; }
html.dark .form-sub { color: #98a3b3; }

html.dark .login-form {
  :deep(.el-form-item__label) { color: #a9b3c1; }
  :deep(.el-input__wrapper) {
    background: rgba(255, 255, 255, 0.07);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.12);

    &.is-focus { box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.8), 0 0 0 4px rgba(96, 165, 250, 0.16); }
  }
  :deep(.el-input__inner) { color: #f2f5f9; }
  :deep(.el-input__inner::placeholder) { color: #7a8598; }
}

html.dark .pwd-toggle { color: #8a94a6; }

/* 深色玻璃上 EP 的复选框会渲染成一块黑方块，这里显式给底色/边线/文字色 */
html.dark .form-row {
  :deep(.el-checkbox__inner) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.34);
  }
  :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
    background: var(--el-color-primary);
    border-color: var(--el-color-primary);
  }
  :deep(.el-checkbox__label) { color: #a9b3c1; }
}
html.dark .code-box { border-color: rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.07); }
html.dark .form-hint {
  color: #a8b2c0;

  code { background: rgba(255, 255, 255, 0.13); color: #dfe6ee; }
}
html.dark .outer-foot { color: #6f7a8c; }
</style>
