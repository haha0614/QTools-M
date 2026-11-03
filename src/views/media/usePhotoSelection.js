import { computed, ref } from 'vue'

/**
 * 图片挑选的「选中」状态机（P6.240 从 media/index.vue 抽出）
 *
 * 覆盖三种选图手势：
 * 1. 勾选框点击：普通=单选切换；Shift+点击=从锚点连选（可反向，可再点一次取消整段）；
 * 2. 「选到此」：从锚点连选到目标（触屏用）；
 * 3. 长按 420ms 进入多选态，之后滑动手指整段覆盖选中（相册 App 手感）。
 *
 * 依赖由调用方注入，避免把整个页面状态拖进来：
 * @param {object} opts
 * @param {import('vue').Ref<Array>} opts.rows      当前页图片列表（顺序即 Shift 连选的范围）
 * @param {import('vue').Ref<boolean>} opts.sortMode 排序模式下禁用手势，把指针让给原生拖拽
 * @param {(photo) => void} opts.onPreview          非多选态点卡片 = 打开大图
 * @param {import('vue').ComputedRef<boolean>} opts.allPicked 本页是否已全选（决定全选框文案）
 */
export function usePhotoSelection({ rows, sortMode, onPreview, allPicked }) {
  const selected = ref([])
  const multiMode = ref(false)
  let pickAnchor = null
  let longPressTimer = null
  let dragAnchorId = null
  let dragSelecting = false
  let suppressClick = false

  /** 翻页/换册时清锚点（跨页的"看不见的范围选择"没有意义） */
  function clearAnchor() {
    pickAnchor = null
  }

  function onCardPointerDown(photo, event) {
    // 排序模式下：不启用连选/长按手势，把指针让给原生拖拽
    if (sortMode && sortMode.value) return
    if (!photo || photo.id == null) return
    suppressClick = false
    // 鼠标沿用 Shift + 勾选框，不做长按（长按鼠标很反直觉）
    if (event && event.pointerType === 'mouse') return
    dragAnchorId = String(photo.id)
    clearTimeout(longPressTimer)
    longPressTimer = setTimeout(() => {
      multiMode.value = true
      dragSelecting = true
      suppressClick = true
      const set = new Set(selected.value)
      set.add(dragAnchorId)
      selected.value = Array.from(set)
      if (navigator.vibrate) {
        try { navigator.vibrate(12) } catch { /* 忽略 */ }
      }
    }, 420)
  }

  /** 手指滑动：把「锚点 → 当前手指下的卡片」整段设为选中（覆盖式） */
  function onGridPointerMove(event) {
    if (!dragSelecting) return
    const el = document.elementFromPoint(event.clientX, event.clientY)
    const card = el && el.closest ? el.closest('.photo-item') : null
    if (!card) return
    const id = card.getAttribute('data-id')
    if (!id) return
    const list = rows.value || []
    const a = list.findIndex((p) => p && String(p.id) === dragAnchorId)
    const b = list.findIndex((p) => p && String(p.id) === id)
    if (a < 0 || b < 0) return
    const from = Math.min(a, b)
    const to = Math.max(a, b)
    selected.value = list.slice(from, to + 1).map((p) => String(p.id))
    if (event.cancelable) event.preventDefault()
    suppressClick = true
  }

  function onGridPointerUp() {
    clearTimeout(longPressTimer)
    if (dragSelecting) {
      dragSelecting = false
      suppressClick = true
      // 滑动结束后吞掉紧随其后的 click，避免顺手打开大图
      setTimeout(() => { suppressClick = false }, 60)
    }
  }

  /** 点卡片：多选态下 = 切换勾选；否则 = 打开预览 */
  function onPhotoClick(photo) {
    if (suppressClick) return
    if (multiMode.value) {
      const id = String(photo.id)
      const set = new Set(selected.value)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      selected.value = Array.from(set)
      pickAnchor = id
      return
    }
    // 预览不算「选中」，不更新锚点 —— 否则会选出断档的范围
    if (onPreview) onPreview(photo)
  }

  /** 「选到此」：从锚点连选到这张；没有锚点就先把它设为锚点并选中 */
  function selectToHere(photo) {
    if (!photo || photo.id == null) return
    const list = rows.value || []
    const id = String(photo.id)
    const toIdx = list.findIndex((p) => p && String(p.id) === id)
    const fromIdx = pickAnchor == null ? -1 : list.findIndex((p) => p && String(p.id) === pickAnchor)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
      const set = new Set(selected.value)
      set.add(id)
      selected.value = Array.from(set)
      pickAnchor = id
      return
    }
    const from = Math.min(fromIdx, toIdx)
    const to = Math.max(fromIdx, toIdx)
    const set = new Set(selected.value)
    list.slice(from, to + 1).forEach((p) => set.add(String(p.id)))
    selected.value = Array.from(set)
  }

  function exitMultiMode() {
    multiMode.value = false
    selected.value = []
    pickAnchor = null
  }

  function onPickClick(photo, event) {
    if (!photo || photo.id == null) return
    const list = rows.value || []
    const id = String(photo.id)
    const idx = list.findIndex((p) => p && String(p.id) === id)
    const anchorIdx = pickAnchor == null ? -1 : list.findIndex((p) => p && String(p.id) === pickAnchor)
    if (event && event.shiftKey && anchorIdx >= 0 && idx >= 0) {
      const from = Math.min(anchorIdx, idx)
      const to = Math.max(anchorIdx, idx)
      const rangeIds = list.slice(from, to + 1).map((p) => String(p.id))
      const set = new Set(selected.value)
      const allOn = rangeIds.every((x) => set.has(x))
      rangeIds.forEach((x) => (allOn ? set.delete(x) : set.add(x)))
      selected.value = Array.from(set)
      return   // 锚点保持不动，方便接着往另一个方向扩选
    }
    const set = new Set(selected.value)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    selected.value = Array.from(set)
    pickAnchor = id
  }

  /** 全选/取消全选本页（只作用于当前页） */
  function toggleSelectAll() {
    const list = rows.value || []
    if (!list.length) return
    const ids = list.map((p) => String(p.id))
    if (allPicked && allPicked.value) {
      selected.value = selected.value.filter((id) => !ids.includes(id))
    } else {
      const set = new Set(selected.value)
      ids.forEach((id) => set.add(id))
      selected.value = Array.from(set)
    }
  }

  return {
    photoSelected: selected,
    multiMode,
    clearAnchor,
    onCardPointerDown,
    onGridPointerMove,
    onGridPointerUp,
    onPhotoClick,
    selectToHere,
    exitMultiMode,
    onPickClick,
    toggleSelectAll
  }
}
