/**
 * personFields.js —— 人物表单的字段模型与「后端行 ↔ 表单 ↔ 提交 body」映射（纯函数，可单测）
 * 用途：把 P5-A 新增字段的取值/回填规则从页面里抽出来，index.vue 只负责取数与保存。
 * 字段名与后端 persons 接口一致（snake_case）：
 *   measurements / career_start / career_end / tattoos / piercings / ethnicity / hair_color /
 *   eye_color / height_cm / weight_kg / fake_boobs / nationality / twitter / instagram
 * 兼容：后端过渡期可能返回 camelCase（heightCm…），取值时两种都认（snake_case 优先）。
 * 单测：p5c-evidence/person-fields.test.mjs
 */

/** 空表单：新建时的初值；id 为 null 表示 POST */
export const EMPTY_FORM = {
  id: null,
  // 基本
  name: '',
  alias: '',
  gender: '',
  remark: '',
  // 身体
  height_cm: null,
  weight_kg: null,
  measurements: '',
  ethnicity: '',
  hair_color: '',
  eye_color: '',
  tattoos: '',
  piercings: '',
  fake_boobs: false,
  nationality: '',
  // 事业
  career_start: null,
  career_end: null,
  // 社交
  twitter: '',
  instagram: ''
}

/** 数值字段：空串 / null / 非数字一律 null（不把「没填」写成 0） */
export function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** snake_case 优先、camelCase 兜底取字段（后端过渡期两种命名都可能出现） */
export function pick(row, snake, camel) {
  if (!row) return undefined
  if (row[snake] !== undefined) return row[snake]
  if (camel && row[camel] !== undefined) return row[camel]
  return undefined
}

/** 字符串字段统一成「trim 后的字符串或空串」 */
function str(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return s.trim()
}

/** 布尔字段：true / 1 / '1' / 'true' 都算真 */
export function toBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

/**
 * 后端行 → 表单对象
 * @param {object} row
 * @returns {object} 与 EMPTY_FORM 同结构的全新对象
 */
export function rowToForm(row) {
  const r = row || {}
  return Object.assign({}, EMPTY_FORM, {
    id: r.id != null ? r.id : null,
    name: str(r.name),
    alias: str(r.alias),
    gender: str(r.gender),
    remark: str(r.remark),
    height_cm: numOrNull(pick(r, 'height_cm', 'heightCm')),
    weight_kg: numOrNull(pick(r, 'weight_kg', 'weightKg')),
    measurements: str(pick(r, 'measurements')),
    ethnicity: str(pick(r, 'ethnicity')),
    hair_color: str(pick(r, 'hair_color', 'hairColor')),
    eye_color: str(pick(r, 'eye_color', 'eyeColor')),
    tattoos: str(pick(r, 'tattoos')),
    piercings: str(pick(r, 'piercings')),
    fake_boobs: toBool(pick(r, 'fake_boobs', 'fakeBoobs')),
    nationality: str(pick(r, 'nationality')),
    career_start: numOrNull(pick(r, 'career_start', 'careerStart')),
    career_end: numOrNull(pick(r, 'career_end', 'careerEnd')),
    twitter: str(pick(r, 'twitter')),
    instagram: str(pick(r, 'instagram'))
  })
}

/**
 * 表单对象 → 提交 body（POST / PUT 共用；id 不放进 body）
 * 字符串字段一律 trim；数值字段走 numOrNull；fake_boobs 归一成布尔。
 * @param {object} form
 */
export function formToPayload(form) {
  const f = form || {}
  return {
    name: str(f.name),
    alias: str(f.alias),
    gender: str(f.gender),
    remark: str(f.remark),
    // 身体
    height_cm: numOrNull(f.height_cm),
    weight_kg: numOrNull(f.weight_kg),
    measurements: str(f.measurements),
    ethnicity: str(f.ethnicity),
    hair_color: str(f.hair_color),
    eye_color: str(f.eye_color),
    tattoos: str(f.tattoos),
    piercings: str(f.piercings),
    fake_boobs: !!f.fake_boobs,
    nationality: str(f.nationality),
    // 事业
    career_start: numOrNull(f.career_start),
    career_end: numOrNull(f.career_end),
    // 社交
    twitter: str(f.twitter),
    instagram: str(f.instagram)
  }
}

export default { EMPTY_FORM, numOrNull, pick, toBool, rowToForm, formToPayload }
