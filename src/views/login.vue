<template>
  <div class="login-page">
    <!-- 背景装饰：4 团光斑 + 2 圈细环。细环的作用是让"玻璃后面的模糊"看得出来 -->
    <div class="bg" aria-hidden="true">
      <span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="blob b4"></span>
      <span class="arc a1"></span><span class="arc a2"></span><span class="arc a3"></span><span class="arc a4"></span>
      <span class="arc a5"></span><span class="arc a6"></span><span class="arc a7"></span>
    </div>

    <section class="glass" ref="cardRef" :class="{ 'glass-webgl': glassReady }">
      <div class="spec" aria-hidden="true"></div>
      <div class="grain" aria-hidden="true"></div>

      <!-- WebGL 折射层（dashersw/liquid-glass-js, MIT）：画在表单下面，
           拿不到 WebGL 时它不渲染，CSS 的 blur 兜底仍然在 -->
      <div class="glass-canvas" ref="glassHost" aria-hidden="true"></div>

      <!-- 左：有色玻璃封面 -->
      <aside class="cover">
        <div class="cover-brand">
          <span class="cover-logo"><BrandMark class="cover-mark" :size="34" /></span>
          <span class="cover-brand-text">
            <span class="cover-name">{{ brandShort }}</span>
            <span class="cover-brand-sub">媒体库管理后台</span>
          </span>
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
/** VITE_APP_TITLE 形如「青兔工具箱 · 管理后台」：左栏大字只取主名，副标另写，避免"管理后台"出现两次 */
const brandShort = brandName.split('·')[0].trim()
const footerContent = defaultSettings.footerContent
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const { proxy } = getCurrentInstance()

/** 密码可见性（P6.94：重做登录页时加的，纯 UI） */
const showPassword = ref(false)

/** WebGL 液态玻璃（dashersw/liquid-glass-js, MIT）。创建失败就保持 CSS 玻璃 */
const glassHost = ref(null)
const glassReady = ref(false)

/** 玻璃卡元素：hyalite 会给它算透镜位移图（SVG 滤镜），非 Chromium 内核自动退化为普通模糊 */
const cardRef = ref(null)


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

/**
 * 玻璃渲染：dashersw/liquid-glass-js 的 Container。
 *
 * <p>它用 html2canvas 抓整页快照当纹理，再用 WebGL 着色器做折射——折射的是**真实页面像素**，
 * 所以边缘的网格会真的弯。放在表单下面一层，表单本身仍是普通 DOM。</p>
 *
 * <p>懒加载：html2canvas 有 ~199KB，只在真正需要时才 import；失败/不支持时静默回退 CSS 玻璃。</p>
 */
onMounted(async () => {
  const host = glassHost.value
  if (!host) return
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  try {
    // html2canvas 是 UMD：被 Vite 当 CJS 处理后不会挂到 window，
    // 而 container.js 里是裸调用 html2canvas(...)，所以这里手动补一个全局
    const h2c = await import('@/utils/liquidglass/html2canvas.min.js')
    const realH2C = h2c.default || h2c
    /**
     * 包一层 html2canvas：只在它内部的**克隆文档**里把登录卡隐藏掉。
     *
     * <p>为什么：库是 html2canvas(document.body) 抓整页，会把登录卡自己拍进去，
     * 折射时出现双重影像。上一版的做法是在真实页面上把卡片 opacity 置 0 ——
     * 用户能看到"一张空白玻璃卡闪一下"。onclone 只改克隆，屏幕上没有任何变化。</p>
     */
    window.html2canvas = (el, opts) => realH2C(el, {
      ...(opts || {}),
      onclone: (doc) => {
        const card = doc.querySelector('.glass')
        if (card) card.style.visibility = 'hidden'
      }
    })
    window.html2canvas.__real = realH2C
    const mod = await import('@/utils/liquidglass/container.js')
    const Container = mod.default || window.Container
    if (!Container) return
    const c = new Container({ borderRadius: 28, type: 'rounded', tintOpacity: 0.16 })
    host.appendChild(c.element)
    // 这个库从 .element 的 rect 量尺寸；没带它自己的 glass.css 时 element 是 auto 高度，
    // 会量出 860x0（实测 canvas height=0，整块画不出来）。这里显式铺满宿主。
    Object.assign(c.element.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      padding: '0',
      display: 'block'
    })
    const rect = host.getBoundingClientRect()
    if (c.canvas) {
      // 只改 CSS 尺寸：直接写 canvas.width/height 会重置绘图缓冲并清空画面（库之后不再重绘）
      c.canvas.style.width = '100%'
      c.canvas.style.height = '100%'
      c.canvas.style.display = 'block'
      c.canvas.style.borderRadius = '28px'
    }
    // 等库把整页快照拍完，再让出 CSS 模糊层
    const t0 = Date.now()
    while (!Container.pageSnapshot && Date.now() - t0 < 4000) {
      await new Promise((r) => setTimeout(r, 100))
    }
    glassReady.value = true

    console.info('[login] WebGL 玻璃已就绪', c.canvas.width + 'x' + c.canvas.height)
  } catch (e) {
    console.warn('[login] WebGL 玻璃不可用，走 CSS 玻璃', e)
  }
})

/**
 * 液态玻璃（hyalite 0.5.0，MIT，单文件无依赖）。
 *
 * <p>它按元素的真实尺寸/圆角算一张位移图，交给 SVG 滤镜，再通过 backdrop-filter: url() 让
 * 浏览器弯**卡片背后真实的背景**——这是 CSS 做不到的"折射"。参数按登录卡尺寸调过：
 * bevel 30 / thickness 34 在 860×500 的卡上边缘弯曲可见且不糊；shade/rim 给棱边明暗与高光。</p>
 *
 * <p>失败不阻断登录：拿不到 Hyalite 或内核不支持时，CSS 里的 var(--hyalite, blur(...))
 * 兜底成普通模糊，输入框/验证码/提交全部照常。</p>
 */

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
/**
 * P6.96：背景从"几团大色块"换成"细网格 + 点阵 + 多圈 1px 细弧 + 低饱和光斑"。
 *
 * <p>原因：backdrop-filter 只能模糊背后**已有的细节**。之前背景是几团大渐变，
 * 模糊之后还是一模一样的几团颜色，所以卡片永远像半透明白板；
 * 加了网格/点阵/细弧之后，卡内能看见被揉开的结构，玻璃感才成立。</p>
 */
.login-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px;
  overflow: hidden;
  background: #f6f8fc;
}

/* ---------------- 背景 ---------------- */
.bg { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }

/* 细网格 */
.bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(37, 99, 235, 0.07) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(37, 99, 235, 0.07) 1px, transparent 1px);
  background-size: 56px 56px;
}

/* 点阵（向四周淡出，避免整屏噪点） */
.bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(15, 23, 42, 0.16) 1px, transparent 1.2px);
  background-size: 22px 22px;
  mask-image: radial-gradient(900px 640px at 50% 46%, #000 30%, transparent 78%);
  -webkit-mask-image: radial-gradient(900px 640px at 50% 46%, #000 30%, transparent 78%);
}

.blob { position: absolute; border-radius: 50%; filter: blur(46px); }
.b1 { width: 520px; height: 520px; left: 2%; top: -6%; background: radial-gradient(circle, #c7d2fe, #818cf8); opacity: 0.75; }
.b2 { width: 460px; height: 460px; right: 0; top: 2%; background: radial-gradient(circle, #a5f3fc, #22d3ee); opacity: 0.6; }
.b3 { width: 560px; height: 560px; left: 26%; bottom: -22%; background: radial-gradient(circle, #fbcfe8, #f472b6); opacity: 0.5; }
.b4 { width: 360px; height: 360px; right: 18%; bottom: -6%; background: radial-gradient(circle, #fde68a, #fbbf24); opacity: 0.42; }

/* 七圈 1px 细弧：这是"玻璃里能看到结构"的关键，不要删 */
.arc { position: absolute; border-radius: 50%; border: 1px solid rgba(37, 99, 235, 0.16); }
.a1 { width: 760px; height: 760px; left: calc(50% - 460px); top: calc(50% - 440px); }
.a2 { width: 660px; height: 660px; left: calc(50% - 410px); top: calc(50% - 390px); border-color: rgba(13, 148, 136, 0.16); }
.a3 { width: 560px; height: 560px; left: calc(50% - 360px); top: calc(50% - 340px); border-color: rgba(219, 39, 119, 0.14); }
.a4 { width: 460px; height: 460px; left: calc(50% - 310px); top: calc(50% - 290px); border-color: rgba(37, 99, 235, 0.13); }
.a5 { width: 360px; height: 360px; left: calc(50% - 260px); top: calc(50% - 240px); border-color: rgba(13, 148, 136, 0.13); }
.a6 { width: 900px; height: 900px; left: calc(50% - 700px); top: calc(50% - 200px); border-color: rgba(15, 23, 42, 0.06); }
.a7 { width: 820px; height: 820px; right: calc(50% - 760px); bottom: calc(50% - 260px); border-color: rgba(15, 23, 42, 0.06); }

/* ---------------- 玻璃卡 ---------------- */
.glass-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: 28px;
  overflow: hidden;
}

/* canvas 的尺寸由库按元素 rect 写 px，这里不要再覆盖成 100%（会量出 0 高） */
.glass-canvas :deep(canvas) { display: block; }

/* WebGL 画布就绪后把 CSS 模糊层让开，避免两层叠加发灰 */
.glass-webgl::before {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: none !important;
  box-shadow: none !important;
}

.glass {
  position: relative;
  z-index: 2;
  display: flex;
  width: min(860px, 94vw);
  height: min(500px, 88vh);
  border-radius: 28px;
  overflow: hidden;
  isolation: isolate;
  /* 外阴影留在容器上；内沿高光改由 ::before 承担 */
  box-shadow: 0 32px 80px rgba(24, 32, 48, 0.24), 0 2px 10px rgba(24, 32, 48, 0.1);
}

/**
 * 玻璃本体单独一层。
 *
 * <p>为什么不用 .glass 自己带 backdrop-filter：滤镜层与父级的 box-shadow / inset 阴影
 * 同属一层时，部分 GPU 与 Chrome 版本会在元素边缘画出一条亮带（P6.95.1 实测到的
 * 那条"白色圆角条"就是它）。拆成伪元素后滤镜与阴影各自成层，边缘干净。</p>
 */
.glass::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: linear-gradient(152deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.14));
  backdrop-filter: blur(14px) saturate(190%) brightness(1.05);
  -webkit-backdrop-filter: blur(14px) saturate(190%) brightness(1.05);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.6),
    inset 0 1.5px 0 rgba(255, 255, 255, 0.95);
}


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
  /* P6.97.1：不写不行 —— 实测 .cover 高度只有 480（卡片 500），底部 20px 空出来，
     正是用户两次圈到的那道"白条"。显式拉伸到卡片满高。 */
  align-self: stretch;
  min-height: 100%;
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

/* P6.98：logo 放到左栏顶部并放大 —— 图形带一块玻璃底座，与卡片语言一致 */
.cover-brand { display: flex; align-items: center; gap: 12px; }

.cover-logo {
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.45);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 8px 20px rgba(15, 23, 42, 0.18);
}

.cover-mark { color: #fff; flex: 0 0 auto; filter: drop-shadow(0 1px 6px rgba(0, 0, 0, 0.25)); }

.cover-brand-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cover-name { font-size: 14px; font-weight: 650; color: #fff; text-shadow: 0 1px 10px rgba(0, 0, 0, 0.3); }
.cover-brand-sub { font-size: 11.5px; color: rgba(255, 255, 255, 0.78); letter-spacing: 0.4px; }

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

.glass-switch {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 20;
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);

  &:hover { border-color: var(--el-color-primary); color: var(--el-color-primary); }
}

/* ---------------- 窄屏：竖排，封面压成一条 ---------------- */
@media (max-width: 860px) {
  .glass { flex-direction: column; height: auto; max-height: none; width: min(420px, 94vw); }
  .cover { flex: 0 0 auto; padding: 16px 22px; border-right: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.45); }
  .cover-logo { width: 44px; height: 44px; border-radius: 13px; }
  .cover-brand-sub { display: none; }
  .cover-line { display: none; }
  .cover-chip { display: none; }
  .form { padding: 26px 22px 22px; }
  .outer-foot { position: static; margin-top: 14px; text-align: center; }
}

/* ---------------- 兜底：不支持 backdrop-filter 的内核 ---------------- */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { box-shadow: 0 24px 60px rgba(24, 32, 48, 0.18); }
  .glass::before { background: rgba(255, 255, 255, 0.94); }
  .cover { background: linear-gradient(158deg, #2563eb, #0d9488); }
  .lens, .spec, .grain { display: none; }
}

/* ---------------- 暗色：黑玻璃 ---------------- */
html.dark .login-page { background: #0a0c12; }

html.dark .bg::before {
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
}

html.dark .bg::after { background-image: radial-gradient(circle, rgba(255, 255, 255, 0.12) 1px, transparent 1.2px); }

html.dark .b1 { opacity: 0.45; }
html.dark .b2 { opacity: 0.4; }
html.dark .b3 { opacity: 0.3; }
html.dark .b4 { opacity: 0.24; }
html.dark .arc { border-color: rgba(255, 255, 255, 0.09); }

html.dark .a2, html.dark .a5 { border-color: rgba(94, 234, 212, 0.12); }
html.dark .a3 { border-color: rgba(244, 114, 182, 0.1); }

html.dark .glass { box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6); }

html.dark .glass::before {
  /* 暗色底本来就深，玻璃若只有 .10 的白会读成"一块黑板"，所以这里抬到 .20/.08 */
  background: linear-gradient(152deg, rgba(255, 255, 255, 0.20), rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14), inset 0 1.5px 0 rgba(255, 255, 255, 0.26);
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
