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

        <el-tooltip content="源码地址" effect="dark" placement="bottom">
          <ruo-yi-git id="ruoyi-git" class="right-menu-item hover-effect" />
        </el-tooltip>

        <el-tooltip content="文档地址" effect="dark" placement="bottom">
          <ruo-yi-doc id="ruoyi-doc" class="right-menu-item hover-effect" />
        </el-tooltip>

        <screenfull id="screenfull" class="right-menu-item hover-effect" />

        <el-tooltip content="主题模式" effect="dark" placement="bottom">
          <div class="right-menu-item hover-effect theme-switch-wrapper" @click="toggleTheme">
            <svg-icon v-if="settingsStore.isDark" icon-class="sunny" />
            <svg-icon v-if="!settingsStore.isDark" icon-class="moon" />
          </div>
        </el-tooltip>

        <el-tooltip content="布局大小" effect="dark" placement="bottom">
          <size-select id="size-select" class="right-menu-item hover-effect" />
        </el-tooltip>

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
import SizeSelect from '@/components/SizeSelect'
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

async function toggleTheme(event) {
  const x = event?.clientX || window.innerWidth / 2
  const y = event?.clientY || window.innerHeight / 2
  const wasDark = settingsStore.isDark

  const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const isSupported = document.startViewTransition && !isReducedMotion

  if (!isSupported) {
    settingsStore.toggleTheme()
    return
  }

  try {
    const transition = document.startViewTransition(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      settingsStore.toggleTheme()
      await nextTick()
    })
    await transition.ready

    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
    document.documentElement.animate(
      {
        clipPath: !wasDark ? [...clipPath].reverse() : clipPath
      }, {
        duration: 650,
        easing: "cubic-bezier(0.4, 0, 0.2, 1)",
        fill: "forwards",
        pseudoElement: !wasDark ? "::view-transition-old(root)" : "::view-transition-new(root)"
      }
    )
    await transition.finished
  } catch (error) {
    console.warn("View transition failed, falling back to immediate toggle:", error)
    settingsStore.toggleTheme()
  }
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

    /* P6.190：功能图标与账号区之间加一条发丝线，账号区自成一块 */
    .avatar-container {
      margin-left: 8px;
      padding-left: 10px;
      border-left: 1px solid var(--shell-border);
      width: auto;
      padding-right: 2px;
      margin-right: 0px;
      padding-right: 0px;

      .avatar-wrapper {
        margin-top: 10px;
        right: 8px;
        position: relative;

        .user-avatar {
          cursor: pointer;
          width: 30px;
          height: 30px;
          margin-right: 8px;
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