/**
 * personAvatar.js —— 管理端「换头像」的**纯逻辑**（无 Vue / 无网络 / 无 DOM）
 *
 * 为什么要一个模块（而不是全写在弹层里）：头像的「落库形状 ↔ 显示地址 ↔ 裁剪参数」是三件
 * 必须逐字对齐后端的事，写成纯函数才能在 node 里跑单测（p566-evidence/person-avatar.test.mjs），
 * 不用开浏览器就能证明「选的这一帧落库后卡片拿到的就是这张图」。
 *
 * 与用户端（QTools-C/src/views/media/personWall.js）的 parseAvatarRef / frameCandidateSeconds
 * **逐字同口径**（两仓独立，不跨仓 import：管理端照抄一份，单测各跑各的）：
 *   相册图 ref = "<albumId>:<seq>[#crop=x,y,w,h]"
 *   视频帧 ref = "frame:<videoId>:<sec>[#crop=x,y,w,h]"
 *   外链     ref = "http(s)://…" / "data:image/…"
 *
 * 后端契约（MediaPersonServiceImpl.avatarUrlOf，P5.48 / P5.64）：
 *   photo → /api/media/thumb/p/<albumId>/<pad4(seq)>[?crop=…]
 *   frame → /api/media/frame/<videoId>?t=<sec>&w=480[&crop=…]
 *   url   → ref 原样
 * 本模块的 avatarUrlFor() 就是这三行的前端实现 —— 只用于「点完立刻看到」的乐观 URL，
 * 落库之后一律以后端回包的 avatarUrl 为准。
 */

/** 头像 ref 上限：与 media_person.avatar_ref VARCHAR(512) 对齐（图片地址 tab 的校验口径） */
export const AVATAR_REF_MAX = 512

/** 头像框宽度（后端 AVATAR_FRAME_WIDTH）：frame 型头像 URL 的 w 参数 */
export const AVATAR_FRAME_WIDTH = 480

/** 「从视频画面挑一帧」的一组候选比例（P5.64；后端只有整秒那一支会落盘永久缓存） */
export const FRAME_RATIOS = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8]

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const text = (v) => (v == null ? '' : String(v).trim())

/** 相册内序号补零到 4 位（与后端 photoThumbUrl / 站端 photoThumbUrl 同一条规则） */
export function pad4(n) {
  return String(n == null ? '' : n).padStart(4, '0')
}

/**
 * 手动头像 ref 解析：把 {@code avatarRef} 拆成三种位置语义
 *
 * <pre>
 *   kind=photo  ref = "a164:4[#crop=x,y,w,h]"            → { type:'photo', albumId, seq, crop }
 *   kind=frame  ref = "frame:<videoId>:<sec>[#crop=…]"   → { type:'frame', videoId, sec, crop }
 *   kind=url    ref = "http(s)://…" / "data:image/…"     → { type:'url', raw, crop:'' }
 * </pre>
 *
 * <p><b>为什么必须分开解析</b>：两种 ref 的冒号位置语义不同（相册序号 vs 视频秒），
 * 「第一个冒号左边是 albumId、右边是 seq」直接套到 frame 上会拼出
 * {@code /thumb/p/frame/0} 这种永远 404 的地址。读不懂的 ref 一律 {@code type:'none'}。</p>
 *
 * @returns {{type:'photo'|'frame'|'url'|'none', albumId?:string, seq?:number, videoId?:string, sec?:number, crop:string, raw?:string}}
 */
export function parseAvatarRef(kind, ref) {
  const raw = text(ref)
  const k = text(kind).toLowerCase()
  const hash = raw.indexOf('#')
  const body = hash < 0 ? raw : raw.slice(0, hash)
  const tail = hash < 0 ? '' : raw.slice(hash)
  const crop = tail.slice(0, 6).toLowerCase() === '#crop=' ? tail.slice(6) : ''
  if (!raw) return { type: 'none', crop: '' }
  if (k === 'url') return { type: 'url', raw, crop: '' }
  if (k === 'frame') {
    if (!/^frame:/i.test(body)) return { type: 'none', crop: '' }
    const rest = body.slice(6)
    const colon = rest.lastIndexOf(':')
    if (colon <= 0) return { type: 'none', crop: '' }
    const videoId = rest.slice(0, colon)
    const secText = rest.slice(colon + 1)
    // 秒必须是纯数字：后端 frame 型 ref 只吃 [0-9]+（t 带小数走的是「精确取帧」，不落缓存，头像不能用它）
    if (!videoId || !/^\d+$/.test(secText)) return { type: 'none', crop: '' }
    return { type: 'frame', videoId, sec: Number(secText), crop }
  }
  if (k === 'photo') {
    const colon = body.indexOf(':')
    if (colon <= 0) return { type: 'none', crop: '' }
    const seqText = body.slice(colon + 1)
    if (!/^\d+$/.test(seqText)) return { type: 'none', crop: '' }
    return { type: 'photo', albumId: body.slice(0, colon), seq: Number(seqText), crop }
  }
  return { type: 'none', crop: '' }
}

/**
 * 「从视频画面挑一帧」的候选时间点：时长 × 0.05/0.2/0.35/0.5/0.65/0.8，**整秒**
 *
 * <p>整秒是硬要求：后端只有整秒那一支按 {@code <秒>.jpg} 永久落盘缓存，带小数走
 * 「精确取帧、每次真跑 ffmpeg」。同一秒只留一次（短片里 5% 与 20% 会撞到同一秒），
 * 所以返回长度可能 &lt; 6。{@code round} = 第几组（偏移 round × 10%），「换一组时间点」用它。
 * 时长未知（0）→ 只有一个 t=0。</p>
 *
 * @param {number} dur   时长（秒）
 * @param {number} round 第几组（0 起）
 * @returns {number[]} 非负整秒，去重后升序
 */
export function frameCandidateSeconds(dur, round) {
  const d = Number(dur) || 0
  const r = Math.max(0, Math.floor(Number(round) || 0))
  const maxSec = d > 0 ? Math.max(0, Math.floor(d) - 1) : 0
  const out = []
  for (const base of FRAME_RATIOS) {
    const ratio = Math.min(1, base + r * 0.1)
    const sec = d > 0 ? Math.min(maxSec, Math.max(0, Math.floor(d * ratio))) : 0
    if (out.indexOf(sec) >= 0) continue
    out.push(sec)
  }
  return out
}

/* ------------------------------------------------------------------ 资源地址 */

/** 相册图缩略图：/api/media/thumb/p/<albumId>/<pad4(seq)>（后端 photoThumbUrl 同一条规则） */
export function photoThumbPath(albumId, seq) {
  return '/api/media/thumb/p/' + encodeURIComponent(text(albumId)) + '/' + pad4(seq)
}

/** 相册图大图预览（裁剪态用，比缩略图清晰；比例与缩略图完全一致） */
export function photoPreviewPath(albumId, seq) {
  return '/api/media/preview/p/' + encodeURIComponent(text(albumId)) + '/' + pad4(seq)
}

/** 视频封面：/api/media/thumb/v/<id>（「从视频画面」的横向缩略条用） */
export function videoThumbPath(id) {
  return '/api/media/thumb/v/' + encodeURIComponent(text(id))
}

/**
 * 帧头像 URL：{@code /api/media/frame/<videoId>?t=<整秒>&w=480[&crop=x,y,w,h]}
 *
 * <p>与后端 {@code avatarUrlOf} 的 frame 分支**逐字同形**（不带 cache buster algo）：
 * 计算出来的乐观 URL 与落库后后端回包的 avatarUrl 一字不差，卡片「立即变」才是真的同一张图。</p>
 */
export function frameAvatarPath(videoId, sec, crop) {
  const c = text(crop)
  const base =
    '/api/media/frame/' + encodeURIComponent(text(videoId)) +
    '?t=' + Math.max(0, Math.floor(num(sec))) +
    '&w=' + AVATAR_FRAME_WIDTH
  return c ? base + '&crop=' + c : base
}

/**
 * kind + ref → 后端会返回的 avatarUrl（乐观 URL）
 *
 * <p>脏 ref（读不懂）→ 空串：调用方退回「等回包」，绝不拿一个 404 地址冒充头像。</p>
 *
 * @param {'photo'|'frame'|'url'} kind
 * @param {string} ref
 * @returns {string}
 */
export function avatarUrlFor(kind, ref) {
  const p = parseAvatarRef(kind, ref)
  if (p.type === 'url') return p.raw
  if (p.type === 'frame') return frameAvatarPath(p.videoId, p.sec, p.crop)
  if (p.type === 'photo') {
    const url = photoThumbPath(p.albumId, p.seq)
    return p.crop ? url + '?crop=' + p.crop : url
  }
  return ''
}

/**
 * 站内相对路径 → 可直接给 &lt;img src&gt; 的地址（与页面 mediaSrc 同一条规则）
 * http(s) / data: / blob: 原样用，其余加后端前缀（dev = /dev-api，prod = ''）。
 */
export function mediaSrc(path, base) {
  const s = text(path)
  if (!s) return ''
  if (/^(https?:|data:|blob:)/i.test(s)) return s
  return (base || '') + s
}

/* ------------------------------------------------------------------ 裁剪参数 */

/** 后端 MediaAvatarCrop.MIN_RATIO：宽高至少要占 2%，更小的框后端直接 400 */
export const CROP_MIN_RATIO = 0.02

const clampNum = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const round4 = (v) => Number(v.toFixed(4))

/**
 * 选框（图片内像素）→ 归一化 crop 串 {@code x,y,w,h}
 *
 * <p>存比例而不是像素：缩略图重建后裁剪框不会偏。宽高至少 0.02（后端下限）。
 * W / H 为 0（图片还没解码出来）→ 空串，调用方按整图处理。</p>
 *
 * @param {{x:number,y:number,w:number,h:number}} sel 选框（相对图片显示框的像素）
 * @param {number} W 图片显示宽
 * @param {number} H 图片显示高
 */
export function cropParam(sel, W, H) {
  const box = sel || {}
  const w = num(W)
  const h = num(H)
  if (w <= 0 || h <= 0) return ''
  const min = CROP_MIN_RATIO
  // 后端 normalize 的两条硬约束必须在这里就满足，否则保存必 400：
  //   ① 宽 / 高 >= 0.02（MIN_RATIO）  ② x+w <= 1.0001 / y+h <= 1.0001（不许越界）
  // 所以先把左上角夹到 [0, 1-min]，再把边长夹到 [min, 1-左上角]。
  let x = clampNum(num(box.x) / w, 0, 1 - min)
  let y = clampNum(num(box.y) / h, 0, 1 - min)
  let cw = clampNum(num(box.w) / w, min, 1 - x)
  let ch = clampNum(num(box.h) / h, min, 1 - y)
  x = round4(x)
  y = round4(y)
  cw = round4(cw)
  ch = round4(ch)
  // 四舍五入可能把 x+w 顶过 1（每条边各进 0.00005）：重算一次，宁可缩边长也不让后端 400
  if (x + cw > 1) {
    cw = round4(Math.max(min, 1 - x))
    if (x + cw > 1) x = round4(Math.min(x, 1 - cw))
  }
  if (y + ch > 1) {
    ch = round4(Math.max(min, 1 - y))
    if (y + ch > 1) y = round4(Math.min(y, 1 - ch))
  }
  return [x, y, cw, ch].map((v) => v.toFixed(4)).join(',')
}

/** 选框正好是整图（差 < 2px）→ 不带 #crop 尾巴（老形状，一字不变） */
export function isFullBox(sel, W, H) {
  const box = sel || {}
  return Math.abs(num(box.w) - num(W)) < 2 && Math.abs(num(box.h) - num(H)) < 2
}

/**
 * 当前落库的 ref 是不是这一张（打勾用；ref 可能带 #crop 尾巴，只比主体段）
 *
 * @param {{kind?:string, ref?:string}|null} current 弹层的 current 属性
 * @param {'photo'|'frame'} kind
 * @param {string} body 主体段（photo = "albumId:seq"，frame = "frame:videoId:sec"）
 */
export function isCurrentRef(current, kind, body) {
  const cur = current || {}
  if (text(cur.kind).toLowerCase() !== text(kind).toLowerCase()) return false
  return text(cur.ref).split('#')[0] === text(body)
}

/**
 * 管理端分页行 → 弹层的 current 属性 {@code {kind, ref, url}}
 * 只认后端解析好的三件套（avatarKind / avatarRef / avatarUrl）；没有手动头像 → null。
 */
export function currentAvatarOf(row) {
  const r = row || {}
  const kind = text(r.avatarKind || r.avatar_kind).toLowerCase()
  const ref = text(r.avatarRef || r.avatar_ref)
  if (!kind || !ref) return null
  return { kind, ref, url: text(r.avatarUrl || r.avatar_url) }
}

export default {
  AVATAR_REF_MAX,
  AVATAR_FRAME_WIDTH,
  FRAME_RATIOS,
  pad4,
  parseAvatarRef,
  frameCandidateSeconds,
  photoThumbPath,
  photoPreviewPath,
  videoThumbPath,
  frameAvatarPath,
  avatarUrlFor,
  mediaSrc,
  cropParam,
  isFullBox,
  isCurrentRef,
  currentAvatarOf
}
