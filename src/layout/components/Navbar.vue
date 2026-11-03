<template>
  <div class="navbar" :class="'nav' + settingsStore.navType">
    <hamburger id="hamburger-container" :is-active="appStore.sidebar.opened" class="hamburger-container" @toggleClick="toggleSideBar" />
    <breadcrumb v-if="settingsStore.navType == 1" id="breadcrumb-container" class="breadcrumb-container" />
    <top-nav v-if="settingsStore.navType == 2" id="topmenu-container" class="topmenu-container" />
    <template v-if="settingsStore.navType == 3">
      <logo v-show="settingsStore.sidebarLogo" :collapse="false"></logo>
      <top-bar id="topbar-container" class="topbar-container" />
    </template>

    <div class="right-menu">
      <template v-if="appStore.device !== 'mobile'">
        <header-search id="header-search" class="right-menu-item" />

        <!-- P6.193：源码 / 文档入口保留，但改成指向本项目自己的仓库与文档目录
             （原来链的是若依官网 doc.ruoyi.vip 与若依源码 gitee.com/y_project/RuoYi-Vue）。 -->
        <el-tooltip content="源码仓库" effect="dark" placement="bottom">
          <ruo-yi-git id="ruoyi-git" class="right-menu-item hover-effect" />
        </el-tooltip>

        <el-tooltip content="项目文档" effect="dark" placement="bottom">
          <ruo-yi-doc id="ruoyi-doc" class="right-menu-item hover-effect" />
        </el-tooltip>

        <screenfull id="screenfull" class="right-menu-item hover-effect" />

        <el-tooltip content="主题模式" effect="dark" placement="bottom">
          <div class="right-menu-item hover-effect theme-switch-wrapper" @click="toggleTheme">
            <svg-icon v-if="settingsStore.isDark" icon-class="sunny" />
            <svg-icon v-if="!settingsStore.isDark" icon-class="moon" />
          </div>
        </el-tooltip>

        <!-- P6.192：移除「布局大小」（字号切换）——
             它通过 Cookies(size) 改 Element 的全局 size，会把定好的 32px 控件高度、
             13.5px 基础字号整体打乱；本项目没有依赖这个开关的地方。 -->

        <!-- P6.211：暂时移除「消息通知」铃铛。
             sys_notice 表当前 0 行，菜单「通知公告」在、但这颗铃铛点开永远是空的；
             等真要给管理员发站内公告时再加回来（组件 HeaderNotice 与接口都还在）。 -->
      </template>

      <el-dropdown @command="handleCommand" class="avatar-container right-menu-item hover-effect" trigger="hover">
        <div class="avatar-wrapper">
          <img :src="userStore.avatar" class="user-avatar" />
          <span class="user-nickname"> {{ userStore.nickName }} </span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <router-link to="/user/profile">
              <el-dropdown-item>个人中心</el-dropdown-item>
            </router-link>
            <el-dropdown-item command="setLayout" v-if="settingsStore.showSettings">
                <span>布局设置</span>
            </el-dropdown-item>
            <el-dropdown-item command="lockScreen">
                <span>锁定屏幕</span>
            </el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <span>退出登录</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { ElMessageBox } from 'element-plus'
import Breadcrumb from '@/components/Breadcrumb'
import TopNav from './TopNav'
import TopBar from './TopBar'
import Logo from './Sidebar/Logo'
import Hamburger from '@/components/Hamburger'
import Screenfull from '@/components/Screenfull'
import HeaderSearch from '@/components/HeaderSearch'
import RuoYiGit from '@/components/RuoYi/Git'
import RuoYiDoc from '@/components/RuoYi/Doc'
import useAppStore from '@/store/modules/app'
import useUserStore from '@/store/modules/user'
import useLockStore from '@/store/modules/lock'
import useSettingsStore from '@/store/modules/settings'
import HeaderNotice from './HeaderNotice'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()
const lockStore = useLockStore()
const settingsStore = useSettingsStore()

function toggleSideBar() {
  appStore.toggleSideBar()
}

function handleCommand(command) {
  switch (command) {
    case "setLayout":
      setLayout()
      break
    case "lockScreen":
      lockScreen()
      break
    case "logout":
      logout()
      break
    default:
      break
  }
}

function logout() {
  ElMessageBox.confirm('确定注销并退出系统吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    userStore.logOut().then(() => {
      // 用 base 拼绝对路径：生产 base 为 /admin-ui/，写死 '/index' 会跳到用户端 SPA
      location.href = import.meta.env.BASE_URL + 'index'
    })
  }).catch(() => { })
}

const emits = defineEmits(['setLayout'])
function setLayout() {
  emits('setLayout')
}

function lockScreen() {
  const currentPath = route.fullPath
  lockStore.lockScreen(currentPath)
  router.push('/lock')
}

/* 主题切换的圆形揭示：对**活的 DOM** 做遮罩动画，不用 View Transition 快照。
   P6.201 —— 快照方案在这个项目里反复出问题（首帧白闪、被中断后整页发白），
   因为全站十几处 backdrop-filter 让快照合成很不稳定。现在改为：
     亮 → 暗（收）：内容保持亮色，遮罩从全屏收到 0；遮罩外的区域先铺成暗色；
     暗 → 亮（放）：先切到亮色，遮罩从 0 放到全屏；遮罩外先铺成暗色。
   两种情况下圆形边界内都是**真实页面内容**，不经过任何快照。 */
let themeSwitching = false
const WIPE_MS = 460

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

/* 取深色主题的页面底色。
   注意不能读 body 的 background —— 本项目只有 .app-wrapper 铺了底色，
   body/html 是透明的，读出来是 rgba(0,0,0,0)，铺上去就是白底板（正好复现白屏）。
   这里直接读 token 变量。 */
/* 取某个主题下 .app-wrapper 的完整背景（底色 + 柔光 + 网格）。
   只取纯色会让遮罩外变成一块"死黑"，看起来就是黑屏；
   把网格柔光一起拷过来，暗色那边才像真实的暗色页面。 */
function readSurface(wrapper, forceDark) {
  const root = document.documentElement
  const had = root.classList.contains("dark")
  if (forceDark) root.classList.add("dark")
  const cs = getComputedStyle(wrapper)
  const surface = {
    color: cs.backgroundColor || "#0b0d10",
    image: cs.backgroundImage,
    size: cs.backgroundSize,
    attachment: cs.backgroundAttachment
  }
  if (forceDark && !had) root.classList.remove("dark")
  return surface
}

function paintUnderlay(el, surface) {
  el.style.backgroundColor = surface.color
  el.style.backgroundImage = surface.image === "none" ? "" : surface.image
  el.style.backgroundSize = surface.size
  el.style.backgroundAttachment = "fixed"
}

function toggleTheme(event) {
  if (themeSwitching) return

  const x = event?.clientX ?? window.innerWidth / 2
  const y = event?.clientY ?? window.innerHeight / 2
  const wasDark = settingsStore.isDark
  const root = document.documentElement
  const wrapper = document.querySelector(".app-wrapper") || document.body
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  if (reduced) {
    settingsStore.toggleTheme()
    return
  }

  const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  /* 遮罩外要露出来的那一侧：收方向是"切过去后的深色"，放方向是"切之前的深色" —— 都是深色。 */
  const darkSurface = readSurface(wrapper, true)

  themeSwitching = true
  root.classList.add("theme-switching")
  paintUnderlay(root, darkSurface)
  paintUnderlay(document.body, darkSurface)

  const setMask = (radius) => {
    const v = `radial-gradient(circle ${radius}px at ${x}px ${y}px, #000 99%, transparent 100%)`
    wrapper.style.maskImage = v
    wrapper.style.webkitMaskImage = v
  }

  // 暗 → 亮：先切主题（内容是亮色），遮罩从小放大 —— 放
  if (wasDark) {
    settingsStore.toggleTheme()
    setMask(0)
  } else {
    // 亮 → 暗：内容先保持亮色，遮罩从全屏收到 0 —— 收
    setMask(maxR)
  }

  const start = performance.now()
  const tick = (now) => {
    const t = Math.min(1, (now - start) / WIPE_MS)
    /* 收方向用"慢起快收"（t³）：圆在前半程保持较大，最后才收干净 ——
       线性的感觉是一开始就塌成一小块，看起来像黑屏。
       放方向仍用 easeOut，张开时先快后稳。 */
    const radius = wasDark ? maxR * easeOutCubic(t) : maxR * (1 - t * t * t)

    setMask(radius)

    if (t < 1) {
      requestAnimationFrame(tick)
      return
    }

    // 收方向到这里才真正切主题
    if (!wasDark) settingsStore.toggleTheme()

    wrapper.style.maskImage = ""
    wrapper.style.webkitMaskImage = ""
    document.body.style.backgroundColor = ""
    for (const el of [root, document.body]) {
      el.style.backgroundColor = ""
      el.style.backgroundImage = ""
      el.style.backgroundSize = ""
      el.style.backgroundAttachment = ""
    }
    root.classList.remove("theme-switching")
    themeSwitching = false
  }
  requestAnimationFrame(tick)
}
</script>

<style lang='scss' scoped>
.navbar.nav3 {
  .hamburger-container {
    display: none !important;
  }
}

.navbar {
  height: 50px;
  overflow: hidden;
  position: relative;
  background: var(--navbar-bg);
  /* P6.123：顶栏跟侧栏/页签条统一玻璃化（之前漏了它，是最上面一条实心白） */
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  /* P6.104：投影 → 发丝线，避免每个区块都浮起来 */
  border-bottom: 1px solid var(--shell-border);
  /* P6.123：玻璃要有"棱"才读得出材质 —— 顶沿一条内高光，和卡片同一手法 */
  box-shadow: inset 0 1px 0 var(--qt-glass-inner);
  display: flex;
  align-items: center;
  // padding: 0 8px;
  box-sizing: border-box;

  .hamburger-container {
    line-height: 46px;
    height: 100%;
    cursor: pointer;
    transition: background 0.3s;
    -webkit-tap-highlight-color: transparent;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-right: 8px;

    &:hover {
      background: rgba(0, 0, 0, 0.025);
    }
  }

  .breadcrumb-container {
    flex-shrink: 0;
  }

  .topmenu-container {
    position: absolute;
    left: 50px;
  }

  .topbar-container {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
    margin-left: 8px;
  }

  .right-menu {
    height: 100%;
    line-height: 50px;
    display: flex;
    align-items: center;
    margin-left: auto;
    /* 账号块右侧留 8px，否则头像贴窗口边缘 */
    padding-right: 8px;

    &:focus {
      outline: none;
    }

    /* P6.190：右侧图标簇统一热区 —— 原来每个图标 padding 8px、行高撑满 50px，
       悬停变色是一整条竖条，而且图标之间没有节奏。改成 32×32 圆角热区。 */
    .right-menu-item {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      margin-left: 2px;
      border-radius: 8px;
      font-size: 17px;
      color: var(--el-text-color-regular);
      vertical-align: middle;

      &.hover-effect {
        cursor: pointer;
        transition: background 0.3s;

        &:hover {
          background: rgba(15, 23, 42, 0.06);
          color: var(--el-text-color-primary);
        }
      }

      &.theme-switch-wrapper {
        display: flex;
        align-items: center;

        svg {
          transition: transform 0.3s;
          
          &:hover {
            transform: scale(1.15);
          }
        }
      }
    }

    /* P6.191：账号区重写 —— 上一版把 .right-menu-item 的 32×32 固定热区套到了账号块上，
       又叠了 margin-top/right 的旧偏移，结果头像贴着窗口右边缘、比图标低 4px。
       这里给账号块自己的尺寸与内距，头像与昵称用 flex 居中对齐。 */
    .avatar-container {
      width: auto;
      height: 34px;
      margin-left: 8px;
      padding: 0 4px 0 10px;
      border-left: 1px solid var(--shell-border);

      .avatar-wrapper {
        display: flex;
        align-items: center;
        gap: 7px;
        height: 100%;

        .user-avatar {
          cursor: pointer;
          width: 28px;
          height: 28px;
          margin: 0;
          border-radius: 50%;
        }

        /* P6.190：原来是 14px 粗体 + relative 偏移（bottom:10px），
           和 30px 头像不在一条基线上；改成常规字重、居中显示，窄屏隐藏只留头像。 */
        .user-nickname {
          font-size: 13px;
          font-weight: 500;
          color: var(--el-text-color-primary);
          max-width: 96px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 1400px) {
          .user-nickname { display: none; }
        }

        i {
          cursor: pointer;
          position: absolute;
          right: -20px;
          top: 25px;
          font-size: 12px;
        }
      }
    }
  }
}
</style>