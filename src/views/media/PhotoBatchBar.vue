<template>
  <!-- 图片弹窗底部批量条（P6.229 拆分，纯展示）：只在勾选后出现，关闭按钮常驻。 -->
  <div class="photo-batch" data-testid="photo-batch-bar">
    <template v-if="pickedCount">
      <span class="photo-batch-count">已选 {{ pickedCount }} 张</span>
      <el-button size="small" :title="'设为继承相册（实际生效：' + albumRatingLabel + '）'"
        @click="emit('rate', null)">继承相册</el-button>
      <el-button size="small" type="primary" plain @click="emit('rate', 'general')">大众</el-button>
      <el-button size="small" type="warning" plain @click="emit('rate', 'guidance')">家长指导</el-button>
      <el-button size="small" type="danger" plain @click="emit('rate', 'restricted')">限制</el-button>
      <el-button size="small" plain data-testid="photo-move" @click="emit('relocate', 'move')">移到另一册…</el-button>
      <el-button size="small" plain data-testid="photo-split" @click="emit('relocate', 'split')">拆出新册…</el-button>
      <el-button size="small" plain data-testid="photo-detach" @click="emit('detach')">移出相册（未归类）</el-button>
      <el-button size="small" link @click="emit('clear')">清空</el-button>
      <el-button size="small" v-if="multiMode" @click="emit('finish')">完成</el-button>
    </template>
    <el-button size="small" @click="emit('close')">关闭</el-button>
  </div>
</template>

<script setup>
defineProps({
  pickedCount: { type: Number, default: 0 },
  albumRatingLabel: { type: String, default: '' },
  multiMode: { type: Boolean, default: false }
})
const emit = defineEmits(['rate', 'relocate', 'detach', 'clear', 'finish', 'close'])
</script>

<style scoped>
.photo-batch {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin: 10px 0 4px;
  padding: 8px 10px;
  background: transparent;
  border-radius: 6px;
}
.photo-batch-count { font-size: 12.5px; color: var(--el-text-color-regular); }
</style>
