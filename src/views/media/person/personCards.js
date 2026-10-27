/**
 * personCards.js —— 管理端「人物管理」卡片信息的**纯逻辑**（无 Vue / 无网络 / 无 DOM）
 *
 * 为什么要单独一个模块：P5.63 把表格换成卡片网格后，一张卡片要同时读两份数据源：
 *   1. GET /api/media/admin/persons?q=&page=&size=  —— 管理端分页（personNode 输出）：
 *      { id, name, alias, note, isPlaceholder, avatarPath, avatarKind, avatarRef, avatarUrl,
 *        gender, birthday, useCount, videoCount, albumCount, + P5-A 的 14 个资料字段（非空才有）}
 *      videoCount / albumCount 是 SQL 里的两个子查询（distinct 视频 / 相册并集），不用前端再算；
 *   2. **老后端兜底**（P5.65 之前）：分页行没有照片数 / 封面时才补两个站端只读接口 ——
 *      GET /api/media/person/{id}/albums?page=1&size=200（行里 al.photo_count → 「Z 张照片」求和、
 *      al.cover_path → 相册封面），缺封面时再补 GET /api/media/person/{id}/videos?page=1&size=1
 *      拿首个视频 id。P5.65 起 personNode 直接带 photoCount / coverPath / coverVideoId，
 *      extrasNeeded() 判定「行里已经够了」→ 一张卡片的补充请求都不发（一页 1 个请求，改前是 1+N）。
 *
 * 头像优先级（与 QTools-C 的 personWall.js 同一口径，少一级「历史 avatarPath 单独落」）：
 *   0. 手动头像 avatarUrl（后端按 avatarKind/avatarRef 解析好的最终地址，有就用）
 *   1. 历史 avatarPath（老列，与 0 同一套归一规则）
 *   2. 名下第一个相册的封面 → /api/media/thumb/p/<albumId>/<pad4(seq)>
 *   3. 名下第一个视频的封面 → /api/media/thumb/v/<videoId>
 *   4. 首字彩色圆底占位（initialOf）
 *
 * 约定：本模块不 import 任何运行时依赖，node 直接跑单测（p563-evidence/person-cards.test.mjs）。
 */

/** 卡片最多显示几个资料 chip（与站端人物墙一致） */
export const CHIP_MAX = 3

/**
 * 资料 chip 的字段与**取值优先级**（与 QTools-C personWall.PROFILE_FIELDS 逐项一致）。
 * 键名用后端 personNode 的 camelCase 输出，alt 是过渡期可能出现的 snake_case 列名。
 * 顺序 = chip 优先顺序：卡片只取前 3 个有值项，所以顺序本身就是「撑爆之前先保住重要的那几个」。
 */
export const CHIP_FIELDS = [
  { key: 'heightCm', alt: 'height_cm', label: '身高', fmt: (v) => v + 'cm' },
  { key: 'weightKg', alt: 'weight_kg', label: '体重', fmt: (v) => v + 'kg' },
  { key: 'measurements', label: '三围' },
  { key: 'birthday', label: '出生' },
  { key: 'nationality', label: '国籍' },
  { key: 'ethnicity', label: '族裔' },
  { key: 'gender', label: '性别' },
  { key: 'hairColor', alt: 'hair_color', label: '发色' },
  { key: 'eyeColor', alt: 'eye_color', label: '瞳色' },
  { key: 'careerStart', alt: 'career_start', label: '出道', fmt: (v) => String(v) + ' 年' },
  { key: 'careerEnd', alt: 'career_end', label: '退役', fmt: (v) => String(v) + ' 年' },
  { key: 'tattoos', label: '纹身' },
  { key: 'piercings', label: '穿孔' },
  { key: 'fakeBoobs', alt: 'fake_boobs', label: '隆胸', fmt: (v) => (v === true || v === 1 || v === '1' || v === 'true' ? '是' : '否') },
  { key: 'twitter', label: '推特' },
  { key: 'instagram', label: 'IG' }
]

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const text = (v) => (v == null ? '' : String(v).trim())

/** 首字占位：中文取第一个字，英文取首字母大写（Array.from 保证 emoji / 代理对不被截断） */
export function initialOf(name) {
  const s = text(name)
  if (!s) return '?'
  const first = Array.from(s)[0]
  return /[a-z]/.test(first) ? first.toUpperCase() : first
}

/** 站内路径归一：http(s) / '//' / 以 '/' 开头原样用；否则当成站点根相对（后端约定「站内相对路径」） */
export function normalizeAvatarPath(raw) {
  const s = text(raw)
  if (!s) return ''
  if (/^https?:\/\//i.test(s) || s.indexOf('//') === 0) return s
  if (s.charAt(0) === '/') return s
  return '/' + s
}

/**
 * 显式（手动 / 历史）头像 URL：后端解析好的 avatarUrl 优先，其次老列 avatarPath 自己归一。
 * data: 内联图不能走 normalizeAvatarPath（会被加上 '/' 前缀变成无效地址），原样返回。
 */
export function explicitAvatarUrl(row) {
  const r = row || {}
  const resolved = text(r.avatarUrl || r.avatar_url)
  if (resolved) return /^data:/i.test(resolved) ? resolved : normalizeAvatarPath(resolved)
  return normalizeAvatarPath(r.avatarPath || r.avatar_path)
}

/**
 * 封面相对路径 → 缩略图 URL（与 QTools-C useMediaApi.thumbUrlFromRel 同一条规则）：
 *   thumbs/p/a154/0000.jpg → /api/media/thumb/p/a154/0000   （后端按内容寻址出图）
 *   其它相对路径          → /api/media/file?p=<encodeURIComponent(rel)>
 */
export function thumbUrlFromRel(rel) {
  const s = text(rel)
  if (!s) return ''
  if (s.indexOf('thumbs/') === 0) return '/api/media/thumb/' + s.slice(7).replace(/\.jpg$/i, '')
  return '/api/media/file?p=' + encodeURIComponent(s)
}

/**
 * 卡片头像：显式 → 相册封面 → 视频封面 → 首字占位。
 * @param {object} row   管理端分页的一行（avatarUrl / avatarPath 取得到就用）
 * @param {{albumCover?:string, videoId?:string|number}} extra 站端补充数据（可空：接口失败时整级跳过）
 * @returns {{url:string, kind:'profile'|'album'|'video'|'initial'}}
 */
export function avatarOf(row, extra) {
  const e = extra || {}
  const r = row || {}
  const explicit = explicitAvatarUrl(r)
  if (explicit) return { url: explicit, kind: 'profile' }
  // P5.65：后端 personNode 直接给首册封面（coverPath）与首个视频 id（coverVideoId），
  // 有就走它 —— 这两档与改前由站端补充接口现拼出来的值同一个来源、同一套 URL 规则。
  const album = thumbUrlFromRel(text(e.albumCover) || text(r.coverPath || r.cover_path))
  if (album) return { url: album, kind: 'album' }
  const tmp = text(e.videoId) || text(r.coverVideoId || r.cover_video_id)
  if (tmp) return { url: '/api/media/thumb/v/' + encodeURIComponent(tmp), kind: 'video' }
  return { url: '', kind: 'initial' }
}

/**
 * 卡片「Z 张照片」的取值（P5.65）：行内 photoCount 优先（后端一条 SQL 聚合），
 * 老后端没有这个键时才用站端补充接口求和的结果；两边都没有 → null（countsText 少渲染一段）。
 */
export function photosOf(row, extra) {
  const r = row || {}
  const raw = r.photoCount !== undefined ? r.photoCount : r.photo_count
  if (raw !== undefined && raw !== null) return num(raw)
  return extra ? extra.photos : null
}

/**
 * 这一行还需要发哪些补充请求（P5.65 把 N+1 收掉的关键判定）。
 *
 * 新后端：personNode 带 photoCount + （coverPath 或 coverVideoId）→ { albums:false, videos:false }，
 * 页面因此**一个补充请求都不发**；手动头像（avatarUrl / avatarPath）本来就压过相册封面，
 * 有它时连封面都不用问。
 * 老后端（行里没有 photoCount）→ 原样走改前那条路（albums → 缺封面再 videos），行为不变。
 *
 * @returns {{albums:boolean, videos:boolean}} 需要发的补充请求
 */
export function extrasNeeded(row) {
  const r = row || {}
  const known = (r.photoCount !== undefined && r.photoCount !== null) || (r.photo_count !== undefined && r.photo_count !== null)
  if (!known) return { albums: true, videos: false }
  const coverKnown = !!text(r.coverPath || r.cover_path) || !!text(r.coverVideoId || r.cover_video_id)
  const videos = !coverKnown && !explicitAvatarUrl(r) && num(r.videoCount) > 0
  return { albums: false, videos }
}

/**
 * 数量行：`X 部视频 · Y 本相册 · Z 张照片`。
 *
 * photos 传 null / undefined 表示**还不知道**（站端相册补充接口没回来 / 失败）：
 * 此时只显示「视频 · 相册」两段，不拿 0 冒充（用户要的是「有多少显示多少」）；
 * 三个数都是 0（且 photos 已知为 0）→ 空串，卡片不渲染这一行。
 */
export function countsText(videos, albums, photos) {
  const v = num(videos)
  const a = num(albums)
  const p = photos == null ? null : num(photos)
  if (!v && !a && !p) return ''
  const head = v + ' 部视频 · ' + a + ' 本相册'
  return p == null ? head : head + ' · ' + p + ' 张照片'
}

/**
 * 资料 chip：按 CHIP_FIELDS 顺序取有值的前 max 个（默认 3）。
 * 空 / 空串 / 纯空白一律算没填（后端 personNode 对空值整键不输出，这里两种都吃）。
 * @param {object} row 管理端分页的一行
 * @param {object} [enabled] 字段开关（工具栏「资料」弹层），键 = CHIP_FIELDS[].key；缺省视为开
 * @param {number} [max]
 * @returns {string[]} 形如 ['身高 160cm', '出生 1996-01-01']
 */
export function chipsOf(row, enabled, max) {
  const src = row && typeof row === 'object' ? row : {}
  const on = enabled && typeof enabled === 'object' ? enabled : null
  const limit = max == null ? CHIP_MAX : Math.max(0, num(max))
  const out = []
  for (const field of CHIP_FIELDS) {
    if (out.length >= limit) break
    if (on && on[field.key] === false) continue
    const raw = src[field.key] !== undefined ? src[field.key] : field.alt ? src[field.alt] : undefined
    if (raw == null) continue
    if (typeof raw === 'string' && !raw.trim()) continue
    const value = typeof field.fmt === 'function' ? field.fmt(raw) : String(raw)
    if (!value) continue
    out.push(field.label + ' ' + value)
  }
  return out
}

/** 隐藏标记：管理端分页目前按 hidden = 0 过滤，这里保留字段判定，后端一旦放开就直接生效 */
export function isHidden(row) {
  return !!(row && (row.hidden === 1 || row.hidden === true))
}

/**
 * 一条卡片的渲染数据（页面只做 v-for）。
 * @param {object} row   /api/media/admin/persons 的一行
 * @param {{extra?:{photos?:number, albumCover?:string, videoId?:string|number}, enabled?:object, maxChips?:number}} ctx
 */
export function buildCard(row, ctx) {
  const r = row || {}
  const c = ctx || {}
  const extra = c.extra || null
  const name = text(r.name)
  const id = r.id == null ? '' : r.id
  return {
    key: id === '' ? name : String(id),
    id,
    name,
    alias: text(r.alias),
    initial: initialOf(name),
    avatar: avatarOf(r, extra),
    counts: countsText(r.videoCount, r.albumCount, photosOf(r, extra)),
    chips: chipsOf(r, c.enabled, c.maxChips),
    hidden: isHidden(r)
  }
}

/** 有引用（视频 / 相册 > 0）→ 删除前就拦下，不发起请求 */
export function hasRefs(row) {
  return num(row && row.videoCount) + num(row && row.albumCount) > 0
}
