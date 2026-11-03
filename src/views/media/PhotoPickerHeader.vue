<template>
  <!-- 图片弹窗的自定义标题头（P6.229 拆分，纯展示）：标题 / 已选数 / 操作提示 / 排序 / 全选本页。 -->
  <div class="photos-head">
    <span class="photos-head-title">{{ title }}</span>
    <span class="photos-head-picked" v-if="pickedCount">已选 {{ pickedCount }} 张</span>
    <span class="photos-head-tip">Shift+点击 / 触屏长按拖动 可连选</span>
    <el-button v-if="canSort" link :type="sortMode ? 'success' : 'primary'" size="small"
      data-testid="photo-sort-toggle" v-hasPermi="['media:admin:edit']" @click="emit('toggleSort')">
      {{ sortMode ? '完成排序' : '排序' }}
    </el-button>
    <el-button v-if="listCount" link type="primary" size="small" class="photos-head-all"
      data-testid="photo-select-all" @click="emit('selectAll')">
      {{ allPicked ? '取消全选本页' : '全选本页（' + listCount + '）' }}
    </el-button>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  pickedCount: { type: Number, default: 0 },
  canSort: { type: [Boolean, Number], default: false },
  sortMode: { type: Boolean, default: false },
  allPicked: { type: Boolean, default: false },
  listCount: { type: Number, default: 0 }
})
const emit = defineEmits(['toggleSort', 'selectAll'])
</script>

<style scoped>
.photos-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px 12px;
  background: transparent;
  border-bottom: 0;
  box-sizing: border-box;
  width: 100%;
}
.photos-head-title { font-size: 15px; font-weight: 600; }
.photos-head-picked { font-size: 12px; color: var(--el-color-primary); }
.photos-head-tip { font-size: 12px; color: var(--el-text-color-secondary); }
.photos-head-all { margin-left: auto; }
</style>
