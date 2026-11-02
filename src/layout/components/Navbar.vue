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

/* 主题切换：View Transition 版本（真快照，动画里能看到页面内容）。
   P6.199 —— 之前判定"finished 从不 resolve"是在一个被反复实验玩脏的标签页里测的，
   结论不成立。这里只保留两条确定的修复：
     1. 旧实现 catch 里又切一次主题（等于切回去）—— 现在用 toggled 标记，只切一次；
     2. 连点会打断进行中的 transition —— 切换期间忽略点击。 */
let themeSwitching = false

function toggleTheme(event) {
  if (themeSwitching) return
  const x = event?.clientX ?? window.innerWidth / 2
  const y = event?.clientY ?? window.innerHeight / 2
  const wasDark = settingsStore.isDark
  const root = document.documentElement
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  let released = false
  const release = () => {
    if (released) return
    released = true
    root.classList.remove("theme-switching", "theme-expand", "theme-shrink")
    themeSwitching = false
  }
  /* 兜底：transition.finished 若因某种原因不 resolve，不能把开关永久锁死
     （实测有过第二次点击被忽略的情况）。900ms 后强制释放。 */
  setTimeout(release, 900)

  if (reduced || !document.startViewTransition) {
    settingsStore.toggleTheme()
    return
  }

  themeSwitching = true
  root.classList.add("theme-switching")

  /* P6.200：暗转亮会闪一下白 —— 原因是从 startViewTransition 拍照到
     transition.ready 之间有几帧，此时 ::view-transition-new(root)（亮色快照）
     是**未被裁剪**的整屏，于是先白一下，我们的圆形动画才开始接管。
     这里在拍照前就把起点裁剪写进 CSS（变量 + expand/shrink 类），
     让第一帧就是 circle(0)，WAAPI 动画随后从同一个值继续，视觉上无缝。 */
  const endR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  root.style.setProperty("--wipe-x", x + "px")
  root.style.setProperty("--wipe-y", y + "px")
  root.style.setProperty("--wipe-r", endR + "px")
  root.classList.add(wasDark ? "theme-expand" : "theme-shrink")

  let toggled = false

  try {
    const transition = document.startViewTransition(async () => {
      toggled = true
      settingsStore.toggleTheme()
      await nextTick()
    })

    transition.finished.finally(release)

    transition.ready
      .then(() => {
        const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endR}px at ${x}px ${y}px)`]
        root.animate(
          { clipPath: !wasDark ? [...clipPath].reverse() : clipPath },
          {
            duration: 460,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
            fill: "forwards",
            pseudoElement: !wasDark ? "::view-transition-old(root)" : "::view-transition-new(root)"
          }
        )
      })
      .catch(release)
  } catch (err) {
    console.warn("[theme] view transition unavailable:", err)
    if (!toggled) settingsStore.toggleTheme()
    release()
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