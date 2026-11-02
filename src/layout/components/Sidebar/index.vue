<template>
  <div :class="['sidebar-theme-wrapper', {'has-logo':showLogo}, sideTheme]" class="sidebar-container">
    <logo v-if="showLogo" :collapse="isCollapse" />
    <el-scrollbar wrap-class="scrollbar-wrapper">
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        :background-color="getMenuBackground"
        :text-color="getMenuTextColor"
        :unique-opened="true"
        :active-text-color="theme"
        :collapse-transition="false"
        mode="vertical"
        :class="sideTheme"
      >
        <sidebar-item
          v-for="(route, index) in sidebarRouters"
          :key="route.path + index"
          :item="route"
          :base-path="route.path"
        />
      </el-menu>
    </el-scrollbar>
  </div>
</template>

<script setup>
import Logo from './Logo'
import SidebarItem from './SidebarItem'
import variables from '@/assets/styles/variables.module.scss'
import useAppStore from '@/store/modules/app'
import useSettingsStore from '@/store/modules/settings'
import usePermissionStore from '@/store/modules/permission'

const route = useRoute()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const permissionStore = usePermissionStore()

const sidebarRouters = computed(() => permissionStore.sidebarRouters)
const showLogo = computed(() => settingsStore.sidebarLogo)
const sideTheme = computed(() => settingsStore.sideTheme)
const theme = computed(() => settingsStore.theme)
const isCollapse = computed(() => !appStore.sidebar.opened)

// 获取菜单背景色
const getMenuBackground = computed(() => {
  if (settingsStore.isDark) {
    return 'var(--sidebar-bg)'
  }
  return sideTheme.value === 'theme-dark' ? variables.menuBg : variables.menuLightBg
})

// 获取菜单文字颜色
const getMenuTextColor = computed(() => {
  if (settingsStore.isDark) {
    return 'var(--sidebar-text)'
  }
  return sideTheme.value === 'theme-dark' ? variables.menuText : variables.menuLightText
})

const activeMenu = computed(() => {
  const { meta, path } = route
  if (meta.activeMenu) {
    return meta.activeMenu
  }
  return path
})
</script>

<style lang="scss" scoped>
.sidebar-container {
  background-color: v-bind(getMenuBackground);
  /* P6.125：侧栏玻璃化。
     P6.124 翻车的真正原因不是"侧栏不该玻璃"，而是**它背后有网格**：
     48px 网格被 blur 成横向亮带。现在网格在左侧 200px 内已被 mask 淡出，
     侧栏背后只剩平滑柔光，backdrop-filter 出来就是干净的水玻璃。 */
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.07), transparent 220px);
  box-shadow:
    inset -1px 0 0 rgba(255, 255, 255, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.10);
  
  .scrollbar-wrapper {
    background-color: v-bind(getMenuBackground);
  }

  .el-menu {
    border: none;
    height: 100%;
    width: 100% !important;
    
    .el-menu-item, .el-sub-menu__title {
      &:hover {
        background-color: var(--menu-hover, rgba(0, 0, 0, 0.06)) !important;
      }
    }

    .el-menu-item {
      color: v-bind(getMenuTextColor);
      
      &.is-active {
        color: var(--menu-active-text, #409eff);
        background-color: var(--menu-hover, rgba(0, 0, 0, 0.06)) !important;
      }
    }

    .el-sub-menu__title {
      color: v-bind(getMenuTextColor);
    }
  }
}
</style>
