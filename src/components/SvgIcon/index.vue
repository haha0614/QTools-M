<template>
  <svg :class="svgClass" aria-hidden="true" :data-icon="resolvedIcon || ''" :data-icon-fallback="isFallback ? 'yes' : null">
    <use v-if="resolvedIcon" :xlink:href="iconName" :fill="color" />
  </svg>
</template>

<script>
import { DEFAULT_ICON, hasIcon, warnMissingIcon } from './iconNames'

export default defineComponent({
  props: {
    iconClass: {
      type: String,
      default: ''
    },
    className: {
      type: String,
      default: ''
    },
    color: {
      type: String,
      default: ''
    },
  },
  setup(props) {
    // 命中不到就回退默认图标，而不是渲染一个找不到 symbol 的空 <svg>
    // （浏览器对缺失的 <use> 不报错，界面上就是一块无法排查的空白）
    const resolvedIcon = computed(() => {
      const raw = (props.iconClass || '').trim()
      if (hasIcon(raw)) {
        return raw
      }
      // '' / '#' = 调用方本来就没配图标（按钮型菜单用 '#' 占位）：
      // 保持空白占位以免给所有无图标菜单挂上默认图标，也不打警告
      if (raw === '' || raw === '#') {
        return ''
      }
      warnMissingIcon(raw)
      return DEFAULT_ICON
    })
    const isFallback = computed(() => {
      const raw = (props.iconClass || '').trim()
      return raw !== '' && raw !== '#' && !hasIcon(raw)
    })
    return {
      resolvedIcon,
      isFallback,
      iconName: computed(() => `#icon-${resolvedIcon.value}`),
      svgClass: computed(() => {
        if (props.className) {
          return `svg-icon ${props.className}`
        }
        return 'svg-icon'
      })
    }
  }
})
</script>

<style scope lang="scss">
.sub-el-icon,
.nav-icon {
  display: inline-block;
  font-size: 15px;
  margin-right: 12px;
  position: relative;
}

.svg-icon {
  width: 1em;
  height: 1em;
  position: relative;
  fill: currentColor;
  vertical-align: -2px;
}
</style>
