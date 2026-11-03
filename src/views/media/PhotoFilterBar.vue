<template>
  <!-- 照片挑选的提示行 + 分级筛选条（P6.227 拆分，纯展示）。
       数据与切片逻辑仍在 index.vue：每个 chip 的数量、当前档位、是否磁盘回退态都由父级传入。 -->
  <!-- P6.228：不要包一层 div。position: sticky 的吸附范围受**父元素盒子**限制，
       外面套一层 wrap 后筛选条的可滚动空间等于自己的高度，实测就不再吸顶了。
       这里用多根节点（Vue 3 fragment），两个元素直接作为弹窗 body 的子元素。 -->
  <p class="photo-notice" v-if="notice">{{ notice }}</p>

  <div class="photo-filter" v-if="source !== 'disk' && hasRows" data-testid="photo-rating-filter">
      <span class="photo-filter-label">本册分级
        <b class="photo-album-rating" :class="'ar-' + albumRating">{{ albumRatingLabel }}</b>
      </span>
      <span class="photo-filter-divider"></span>
      <span class="photo-filter-label">筛选</span>
      <button v-for="opt in filters" :key="opt.value" type="button"
        class="photo-filter-chip" :class="{ on: filter === opt.value, empty: !counts[opt.value] }"
        :title="filterTitle(opt)"
        @click="emit('setFilter', opt.value)">
        <i class="photo-filter-dot" :class="'dot-' + opt.value"></i>{{ opt.label }}<b>{{ counts[opt.value] }}</b>
      </button>
      <el-button size="small" type="primary" plain icon="MagicStick" class="photo-auto-rate"
        v-hasPermi="['media:admin:edit']" @click="emit('autoRate')">自动分级</el-button>
  </div>
</template>

<script setup>
defineProps({
  notice: { type: String, default: '' },
  source: { type: String, default: 'db' },
  hasRows: { type: [Boolean, Number], default: false },
  albumRating: { type: String, default: 'general' },
  albumRatingLabel: { type: String, default: '' },
  filter: { type: String, default: 'all' },
  counts: { type: Object, default: () => ({}) },
  filters: { type: Array, default: () => [] },
  filterTitle: { type: Function, required: true }
})
const emit = defineEmits(['setFilter', 'autoRate'])
</script>

<style scoped>
.photo-notice {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-color-warning);
  word-break: break-all;
}
.photo-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  padding: 8px 0 6px;
  background: var(--el-bg-color);
}
/* P6.167：筛选条吸顶 + 自身模糊，滚动时缩略图从它的下边缘渐变淡出 */
.photo-filter {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 10px 20px;
  background: transparent;
  backdrop-filter: blur(10px) saturate(150%);
  -webkit-backdrop-filter: blur(10px) saturate(150%);
}
.photo-filter::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -12px;
  height: 12px;
  pointer-events: none;
  background: linear-gradient(to bottom, rgba(15, 23, 42, .06), transparent);
}
.photo-filter-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: 2px;
}
.photo-filter-divider {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: var(--el-border-color-lighter);
}
.photo-auto-rate { margin-left: auto; flex: 0 0 auto; }
.photo-album-rating { font-weight: 600; }
.photo-album-rating.ar-general { color: var(--el-color-success); }
.photo-album-rating.ar-guidance { color: var(--el-color-warning); }
.photo-album-rating.ar-restricted { color: var(--el-color-danger); }
.photo-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px 2px 8px;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.photo-filter-chip:hover { background: var(--el-fill-color); }
.photo-filter-chip b { font-weight: 600; color: var(--el-text-color-primary); }
.photo-filter-chip.on {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.photo-filter-chip.on b { color: var(--el-color-primary); }
.photo-filter-chip.empty { opacity: 0.45; }
.photo-filter-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--el-text-color-placeholder); }
.photo-filter-dot.dot-general { background: var(--el-color-success); }
.photo-filter-dot.dot-guidance { background: var(--el-color-warning); }
.photo-filter-dot.dot-restricted { background: var(--el-color-danger); }
</style>
