/**
 * 内容分级（P5.99）—— 管理端唯一的分级值 / 中文名 / 标签色
 *
 * 与后端 {@code com.qtools.media.support.MediaRating} 一一对应（general / guidance / restricted）。
 * 为什么前端也存一份：列表里的行内下拉与「分级与可见性」面板在后端未部署（老版本）时也要能渲染，
 * 拉不到 {@code /rating-policy} 就按这份兜底，绝不因为一个接口 404 让整张表只剩空列。
 */

export const RATING_OPTIONS = [
  { value: 'general', label: '大众级' },
  { value: 'guidance', label: '家长指导级' },
  { value: 'restricted', label: '限制级' }
]

const LABELS = RATING_OPTIONS.reduce((m, o) => {
  m[o.value] = o.label
  return m
}, {})

/** 分级值 → 中文名；未知 / 空 → 大众级（与后端 normalize 同方向：脏值按最宽处理） */
export function ratingLabel(value) {
  const key = String(value == null ? '' : value).trim().toLowerCase()
  return LABELS[key] || LABELS.general
}

/** 分级值 → el-tag 类型（视觉区分：大众绿 / 家长指导橙 / 限制红） */
export function ratingTagType(value) {
  const key = String(value == null ? '' : value).trim().toLowerCase()
  if (key === 'restricted') return 'danger'
  if (key === 'guidance') return 'warning'
  return 'success'
}

/** 行内下拉用：把 row.contentRating 归一成合法值（老行 / 未迁移库给的 null 一律当大众级） */
export function ratingOf(row) {
  const key = String(row && row.contentRating ? row.contentRating : '').trim().toLowerCase()
  return LABELS[key] ? key : 'general'
}
