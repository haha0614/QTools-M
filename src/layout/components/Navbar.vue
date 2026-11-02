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

        <el-tooltip content="消息通知" effect="dark" placement="bottom">
          <header-notice id="header-notice" class="right-menu-item hover-effect" />
        </el-tooltip>
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

/* 主题切换的圆形揭示：自绘覆盖层，不再用 View Transition。
   P6.197 —— 实测证据：startViewTransition 之后 transition.finished 从不 resolve
   （trace 一行都没打印），Chromium 因此一直持有伪元素快照层；那层亮色快照盖在页面上
   就是白屏，同时截图接口连续 30s 超时。
   现在自己画：
     1. 切换前把 .app-wrapper 的底色 + 网格柔光拷到覆盖层（等于"旧主题的一张底图"）；
     2. 立刻切换主题（下面已经是新主题）；
     3. 覆盖层以点击点为圆心收缩到 0 —— 旧主题从圆心退开，新主题显出来。
   动画时长、缓动、方向都可控，没有任何快照机制参与。 */
let themeSwitching = false

function toggleTheme(event) {
  if (themeSwitching) return

  const x = event?.clientX ?? window.innerWidth / 2
  const y = event?.clientY ?? window.innerHeight / 2
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  if (reduced) {
    settingsStore.toggleTheme()
    return
  }

  const source = document.querySelector(".app-wrapper") || document.body
  const cs = getComputedStyle(source)

  /* 用 transform: scale 做圆形收缩（合成层动画），不用 clip-path ——
     clip-path 每帧都要重新光栅化整块全屏区域，实测切完立刻截图 30s 拿不到帧。
     圆盘本身按半径先画满全屏，之后只做缩放。 */
  const diameter = Math.ceil(2 * Math.hypot(window.innerWidth, window.innerHeight))
  const disc = document.createElement("div")
  disc.className = "theme-wipe"
  disc.style.width = diameter + "px"
  disc.style.height = diameter + "px"
  disc.style.borderRadius = "50%"
  disc.style.left = x - diameter / 2 + "px"
  disc.style.top = y - diameter / 2 + "px"
  disc.style.backgroundColor = cs.backgroundColor
  disc.style.backgroundImage = cs.backgroundImage
  disc.style.backgroundSize = cs.backgroundSize
  disc.style.backgroundPosition = `${diameter / 2 - x}px ${diameter / 2 - y}px`

  themeSwitching = true
  /* 切换的 460ms 内关掉模糊与过渡：全站十几处 backdrop-filter 同时换主题时
     会一次性重建合成层，是这一下卡顿的主要来源。 */
  document.documentElement.classList.add("theme-switching")
  document.body.appendChild(disc)
  settingsStore.toggleTheme()

  const done = () => {
    disc.remove()
    document.documentElement.classList.remove("theme-switching")
    themeSwitching = false
  }

  requestAnimationFrame(() => {
    const anim = disc.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0)", opacity: 1 }
      ],
      { duration: 460, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
    )
    anim.finished.then(done).catch(done)
  })
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