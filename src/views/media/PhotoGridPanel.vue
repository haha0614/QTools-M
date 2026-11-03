<template>
  <!-- 照片网格（P6.226）：纯展示组件。
       勾选 / 分级 / 连选 / 拖拽排序 / 触屏长按拖动全部通过事件回传给页面，
       状态与业务逻辑仍在 index.vue；样式与拆分前逐条对齐（密度、悬停显形、选中描边）。 -->
  <div
    class="photo-grid"
    :class="{ 'range-on': multiMode }"
    v-loading="loading"
    @dragenter.prevent
    @dragover.prevent
    @drop.prevent
    @pointermove="emit('gridPointerMove', $event)"
    @pointerup="emit('gridPointerUp', $event)"
    @pointercancel="emit('gridPointerUp', $event)"
  >
    <div
      class="photo-item"
      :class="{ picked: selected.includes(String(photo.id)), 'sorting': sortMode, 'dragging': dragging === photoIndex }"
      :data-id="String(photo.id)"
      v-for="(photo, photoIndex) in rows"
      :key="photoKey(photo)"
      :draggable="sortMode"
      @dragstart="onDragStart(photoIndex, photo, $event)"
      @dragend="onDragEnd"
      @dragover.prevent
      @drop.prevent="emit('sortDrop', photoIndex)"
      @click="sortMode || emit('photoClick', photo)"
      @pointerdown="emit('cardPointerDown', photo, $event)"
    >
      <span
        class="photo-pick"
        :class="{ on: selected.includes(String(photo.id)) }"
        role="checkbox"
        :aria-checked="selected.includes(String(photo.id))"
        title="勾选；按住 Shift 点击可连选一段"
        @click.stop="emit('pick', photo, $event)"
      ></span>
      <div class="photo-thumb">
        <img :src="mediaSrc(photo.thumbUrl)" loading="lazy" draggable="false" :alt="'第 ' + photo.seq + ' 张'" />
        <span class="photo-seq">{{ photo.seq }}</span>
        <span class="photo-range" title="从上次点选的那张，连选到这里" @click.stop="emit('pickToHere', photo)">选到此</span>
        <el-dropdown
          trigger="click"
          class="photo-rating-dd"
          placement="bottom-end"
          @command="(v) => emit('rate', photo, v)"
          @click.stop
        >
          <span
            class="photo-rating"
            :class="['pr-' + (photo.contentRating || 'inherit'), { wider: isWider(photo) }]"
            :title="'这张图的分级：' + ratingLabel(photo) + (isWider(photo) ? '（比本册更宽，访客能单独看到这张）' : '')"
            @click.stop
          >{{ ratingShort(photo) }}</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="inherit">继承相册（{{ albumRatingLabel }}）</el-dropdown-item>
              <el-dropdown-item command="general">大众级</el-dropdown-item>
              <el-dropdown-item command="guidance">家长指导级</el-dropdown-item>
              <el-dropdown-item command="restricted">限制级</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <span class="photo-name" :title="photo.relPath || photoFileName(photo.relPath)">{{ photoFileName(photo.relPath) }}</span>
    </div>
  </div>
</template>

<script setup>
import { mediaSrc, photoFileName } from './mediaFormat'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] },
  sortMode: { type: Boolean, default: false },
  multiMode: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  albumRatingLabel: { type: String, default: '' },
  ratingShort: { type: Function, required: true },
  ratingLabel: { type: Function, required: true },
  isWider: { type: Function, required: true },
  photoKey: { type: Function, required: true }
})
const emit = defineEmits(['pick', 'pickToHere', 'rate', 'photoClick', 'cardPointerDown',
  'sortDragStart', 'sortDragEnd', 'sortDrop', 'gridPointerMove', 'gridPointerUp'])

const dragging = ref(-1)

/* P6.230：屏蔽浏览器原生拖放行为。
   原生拖拽会把 <img> 当负载 —— 拖到网格外会看到拖影、松手时浏览器可能直接打开那张图。
   这里把负载换成纯文本标记，拖影由 CSS 控制，松手/取消都清理状态。 */
function onDragStart(index, photo, event) {
  if (!props.sortMode) return
  dragging.value = index
  const dt = event && event.dataTransfer
  if (dt) {
    dt.effectAllowed = 'move'
    dt.dropEffect = 'move'
    try {
      dt.setData('text/plain', String((photo && photo.id) != null ? photo.id : index))
      // 显式清掉图片/URL 形态，避免浏览器把它们当可导航内容
      dt.setData('text/uri-list', '')
    } catch (e) { /* 某些浏览器只允许在 dragstart 里写一次，忽略 */ }
  }
  emit('sortDragStart', index)
}

function onDragEnd() {
  dragging.value = -1
  emit('sortDragEnd')
}
</script>

<style scoped>
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  align-items: stretch;
  gap: 8px;
  min-height: 40px;
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  padding: 10px 20px 6px;
  gap: 14px;
}
.photo-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
  line-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 8px;
}
.photo-item.sorting { cursor: grab; }
.photo-item.dragging { opacity: .45; }
.photo-item.sorting:active { cursor: grabbing; }
.photo-thumb { position: relative; line-height: 0; }
.photo-item img {
  display: block;
  width: 100%;
  height: 140px;
  object-fit: contain;
  object-position: center center;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}
.photo-item:hover img { box-shadow: 0 0 0 2px var(--el-color-primary-light-5); }
.photo-item.picked img { box-shadow: 0 0 0 2px var(--el-color-primary); }
.photo-item.picked .photo-thumb { outline: 2px solid var(--el-color-primary); outline-offset: -2px; border-radius: 5px; }
.photo-range {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  z-index: 3;
  padding: 3px 8px;
  font-size: 11px;
  line-height: 1.2;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
  border-radius: 10px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
  white-space: nowrap;
}
.photo-item:hover .photo-range,
.photo-grid.range-on .photo-range { opacity: 1; pointer-events: auto; }
.photo-range:hover { background: var(--el-color-primary); }
.photo-name {
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
  transition: opacity .12s;
}
.photo-item:hover .photo-name { opacity: 1; }
.photo-seq {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 11px;
  line-height: 1;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 3px;
  padding: 2px 4px;
}
.photo-pick {
  position: absolute;
  left: 6px;
  top: 6px;
  z-index: 2;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  box-sizing: border-box;
}
.photo-pick.on { background: var(--el-color-primary); border-color: var(--el-color-primary); }
.photo-pick.on::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.photo-rating-dd { position: absolute; right: 4px; top: 4px; z-index: 2; }
.photo-rating {
  min-width: 18px;
  text-align: center;
  font-size: 11px;
  line-height: 1;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 3px;
  padding: 2px 4px;
  cursor: pointer;
  user-select: none;
}
.photo-rating.pr-general { background: rgba(64, 158, 255, 0.85); }
.photo-rating.pr-guidance { background: rgba(230, 162, 60, 0.9); }
.photo-rating.pr-restricted { background: rgba(245, 108, 108, 0.9); }
.photo-rating.wider { outline: 1px dashed #fff; outline-offset: -2px; box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.9); }
</style>
