<template>
  <div :class="classObj" class="app-wrapper" :style="{ '--current-color': theme, '--current-color-light': theme + '1a', '--current-color-dark-bg': theme + '33' }">
    <div v-if="device === 'mobile' && sidebar.opened" class="drawer-bg" @click="handleClickOutside"/>
    <sidebar v-if="!sidebar.hide" class="sidebar-container" />
    <div :class="{ hasTagsView: needTagsView, sidebarHide: sidebar.hide }" class="main-container">
      <div :class="{ 'fixed-header': fixedHeader }">
        <navbar @setLayout="setLayout" />
        <tags-view v-if="needTagsView" />
      </div>
      <app-main />
      <settings ref="settingRef" />
    </div>
  </div>
</template>

<script setup>
import { useWindowSize } from '@vueuse/core'
import Sidebar from './components/Sidebar/index.vue'
import { AppMain, Navbar, Settings, TagsView } from './components'
import useAppStore from '@/store/modules/app'
import useSettingsStore from '@/store/modules/settings'

const settingsStore = useSettingsStore()
const theme = computed(() => settingsStore.theme)
const sidebar = computed(() => useAppStore().sidebar)
const device = computed(() => useAppStore().device)
const needTagsView = computed(() => settingsStore.tagsView)
const fixedHeader = computed(() => settingsStore.fixedHeader)

const classObj = computed(() => ({
  hideSidebar: !sidebar.value.opened,
  openSidebar: sidebar.value.opened,
  withoutAnimation: sidebar.value.withoutAnimation,
  mobile: device.value === 'mobile'
}))

const { width, height } = useWindowSize()
const WIDTH = 992 // refer to Bootstrap's responsive design

watch(() => device.value, () => {
  if (device.value === 'mobile' && sidebar.value.opened) {
    useAppStore().closeSideBar({ withoutAnimation: false })
  }
})

watchEffect(() => {
  if (width.value - 1 < WIDTH) {
    useAppStore().toggleDevice('mobile')
    useAppStore().closeSideBar({ withoutAnimation: true })
  } else {
    useAppStore().toggleDevice('desktop')
  }
})

function handleClickOutside() {
  useAppStore().closeSideBar({ withoutAnimation: false })
}

const settingRef = ref(null)
function setLayout() {
  settingRef.value.openSetting()
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/mixin.scss" as mix;
@use "@/assets/styles/variables.module.scss" as vars;

.app-wrapper {
  @include mix.clearfix;
  position: relative;
  height: 100%;
  width: 100%;
  /* P6.125：底色与柔光铺满全视口（侧栏做玻璃时背后要有平滑色，不能是空白）；
     细网格单独放进 ::before 并**在左侧 240px 内淡出** ——
     网格若直接铺到侧栏背后，被 blur 会糊成一条条横向亮带（P6.124 就是这么翻车的）。 */
  position: relative;
  background-color: var(--el-bg-color-page);
  background-image:
    radial-gradient(900px 520px at 12% 4%, var(--qt-glow-1), transparent 70%),
    radial-gradient(820px 480px at 88% 10%, var(--qt-glow-2), transparent 70%),
    radial-gradient(900px 560px at 45% 108%, var(--qt-glow-3), transparent 70%);
  background-attachment: fixed;

  &::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    background-image:
      linear-gradient(to right, var(--qt-grid-line) 1px, transparent 1px),
      linear-gradient(to bottom, var(--qt-grid-line) 1px, transparent 1px);
    background-size: 48px 48px, 48px 48px;
    /* P6.132：网格不再在侧栏后面淡出 —— 让侧栏"透出"它才是真的透明感。
       过去糊成横条是因为 blur 18-20px，这里侧栏只留 3px 轻模糊。 */
  }

  /* P6.132：侧栏背后垫一层"平滑的浅色渐变"。
     侧栏是半透明白（rgba(255,255,255,.62)），但如果背后是单一浅色，
     透明就看不出来 —— 玻璃的"透"必须由背后的明暗变化体现，
     而这块背景又不能有高频细节（网格会被 blur 糊成条纹，见 P6.124）。
     所以用大面积平滑渐变：顶部偏冷、底部偏灰。 */
  &::after {
    content: '';
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 184px;
    pointer-events: none;
    z-index: 0;
    background: linear-gradient(180deg, #c2d1ee 0%, #d3ddef 42%, #e2e7f0 100%);
  }

  /* P6.134：暗黑模式下这块浅色底板必须消失，否则侧栏透出浅色，
     深色界面里出现一条白色竖条（实测暗色截图就是这种情况）。 */
  html.dark &::after { display: none; }

  &.mobile.openSidebar {
    position: fixed;
    top: 0;
  }
}

.main-container:has(.fixed-header) {
  height: 100vh;
  overflow: hidden;
}

.drawer-bg {
  background: #000;
  opacity: 0.3;
  width: 100%;
  top: 0;
  height: 100%;
  position: absolute;
  z-index: 999;
}

.fixed-header {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 9;
  width: calc(100% - #{vars.$base-sidebar-width});
  transition: width 0.28s;
}

.hideSidebar .fixed-header {
  width: calc(100% - 54px);
}

.sidebarHide .fixed-header {
  width: 100%;
}

.mobile .fixed-header {
  width: 100%;
}
</style>