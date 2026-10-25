/**
 * duplicatesModel.js —— 重复文件管理页（P4-B）的纯逻辑层（无 Vue / 无网络）
 *
 * 为什么单独成文件：抽屉里真正要判定的东西只有三件事——
 *   1. 三种界面态（加载中 / 接口未就绪 / 空 / 有数据）怎么判；
 *   2. 体积与计数怎么格式化（后端给的是字节，界面要「1.20 GB」这种）；
 *   3. 二次确认要写清「会移到回收站 / 仅删记录」两种影响的哪一条。
 * 这三件事都不该缠在模板里，放这里可以直接跑单测（p4b-evidence/test-duplicates.mjs）。
 */

/** 与后端 kind 参数一一对应；顺序即抽屉里的切换顺序 */
export const KINDS = [
  { value: 'video', label: '视频', unit: '个视频' },
  { value: 'photo', label: '相册图片', unit: '张图片' }
]

export const PAGE_SIZES = [10, 20, 50]

export const NOT_READY_TEXT = '重复文件接口未就绪：后端部署 P4-A 后刷新页面即可（当前页面其余功能不受影响）'

function num(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

/** kind → 中文名（未知 kind 原样返回，不抛错） */
export function kindLabel(kind) {
  const hit = KINDS.find((k) => k.value === kind)
  return hit ? hit.label : String(kind == null ? '' : kind)
}

/** 字节 → 人类可读：与 MaintPanel / 媒体库其它地方的 GB/MB/KB 口径一致 */
export function formatBytes(bytes) {
  const n = num(bytes)
  if (n == null || n < 0) return '—'
  const KB = 1024
  const MB = 1024 * 1024
  const GB = 1024 * 1024 * 1024
  if (n >= GB) return (n / GB).toFixed(2) + ' GB'
  if (n >= MB) return (n / MB).toFixed(1) + ' MB'
  if (n >= KB) return Math.round(n / KB) + ' KB'
  return Math.round(n) + ' B'
}

/** 一组的副本数：后端给了 count 就用它，否则 = 别名数 + 主文件 */
export function groupCount(row) {
  const c = num(row && row.count)
  if (c != null && c > 0) return Math.round(c)
  const aliases = Array.isArray(row && row.aliases) ? row.aliases : []
  return aliases.length + 1
}

/** 一组可省空间：后端给了 bytesWasted 就用它，否则用副本体积之和兜底 */
export function groupWasted(row) {
  const w = num(row && row.bytesWasted)
  if (w != null && w >= 0) return w
  const aliases = Array.isArray(row && row.aliases) ? row.aliases : []
  return aliases.reduce((sum, a) => sum + (num(a && a.size) || 0), 0)
}

/** 主文件展示路径：relPath 优先，缺了就退 id（后端两种都可能给） */
export function primaryPath(row) {
  const p = row && row.primary
  return (p && (p.relPath || p.id)) || '（未知主文件）'
}

/** 别名列表（主文件不在其中）：展开行只列副本，避免和「主文件」列重复 */
export function groupAliases(row) {
  const aliases = Array.isArray(row && row.aliases) ? row.aliases : []
  return aliases.filter((a) => a && (a.relPath || a.id != null))
}

/**
 * 顶部统计：组数取后端 total（全库），可省空间按「本页」求和——
 * 接口一次只给一页，把本页合计冒充全库合计是错的，所以文案上明确写「本页」。
 */
export function duplicateTotals(rows, total) {
  const list = Array.isArray(rows) ? rows : []
  const bytes = list.reduce((sum, r) => sum + groupWasted(r), 0)
  const t = num(total)
  return {
    groups: t != null && t >= 0 ? Math.round(t) : list.length,
    pageGroups: list.length,
    bytes,
    bytesText: formatBytes(bytes)
  }
}

/** 是否是「后端还没部署这个接口」类错误：404 / 405 / 501 —— 只有这类才提示未就绪 */
export function isNotReadyError(err) {
  const status = err && err.response && err.response.status
  return status === 404 || status === 405 || status === 501
}

/**
 * 界面四态：loading / error（接口未就绪或网络异常）/ empty（0 组）/ data。
 * error 里再分「未就绪」与「真错误」，前者给引导文案，后者把后端消息带上。
 */
export function resolveViewState(input) {
  const s = input || {}
  const rows = Array.isArray(s.rows) ? s.rows : []
  if (s.loading) return { state: 'loading', message: '', notReady: false }
  // notReady 也算错误态：调用方在 404/405/501 时 deliberately 清空 error 文案（不当成网络错误提示）
  if (s.error || s.notReady) {
    const notReady = !!s.notReady
    return {
      state: 'error',
      notReady,
      message: notReady ? NOT_READY_TEXT : String(s.error)
    }
  }
  if (!rows.length) return { state: 'empty', message: '', notReady: false }
  return { state: 'data', message: '', notReady: false }
}

/** 页码合法性：total 变化后把超界页夹回最后一页 */
export function clampPage(page, total, size) {
  const p = num(page)
  const s = num(size) && size > 0 ? Math.round(size) : 20
  const t = num(total) && total > 0 ? Math.round(total) : 0
  const last = Math.max(1, Math.ceil(t / s))
  const cur = p == null || p < 1 ? 1 : Math.round(p)
  return Math.min(cur, last)
}

/**
 * 「清理副本」二次确认文案：必须把两种影响写清（deleteFiles 决定是移回收站还是只删记录）。
 * requireFiles=true 是当前勾选状态，文案随勾选实时变化。
 */
export function mergeConfirmText(input) {
  const s = input || {}
  const row = s.row || {}
  const kind = kindLabel(s.kind)
  const aliases = groupAliases(row)
  const primary = (row.primary && (row.primary.relPath || row.primary.id)) || '（未知主文件）'
  const effect = s.deleteFiles
    ? '副本文件会被移入回收站（可在回收站恢复，不会直接删除）'
    : '只删除索引记录，磁盘上的副本文件保持不动'
  return [
    '将把「' + primary + '」设为唯一主文件，清理同内容的 ' + aliases.length + ' 个' + kind + '副本。',
    '影响：' + effect + '。',
    '可省空间：' + formatBytes(groupWasted(row)) + '（仅统计被清理的副本体积）。'
  ].join('\n')
}

/** 「设为主文件」二次确认文案：只改记录，不动文件，但要说明旧主文件会变副本 */
export function keepConfirmText(input) {
  const s = input || {}
  const row = s.row || {}
  const alias = s.alias || {}
  const kind = kindLabel(s.kind)
  const target = alias.relPath || alias.id || '（未知路径）'
  return [
    '将把「' + target + '」设为这组' + kind + '的主文件。',
    '影响：只改索引记录，不移动、不删除任何文件；其余同内容文件（含原来的主文件）变成副本。',
    '副本数：' + Math.max(0, groupCount(row) - 1) + ' 个。'
  ].join('\n')
}

/** 行 key：contentHash 唯一；后端异常给空值时用下标兜底，避免 v-for 重复 key */
export function rowKey(row, index) {
  if (row && row.contentHash) return String(row.contentHash)
  return 'dup-' + String(index == null ? 0 : index)
}

/* ======================================================= P4.1 缩略图布局辅助 */
/* 下面这些都保持「纯函数 + 无 Vue」：缩略图 URL 规则 / 折叠行数 / 占位首字，都能直接单测。 */

/** 右栏默认最多显示几行副本，超出才出「展开全部」 */
export const ALIAS_PREVIEW_LIMIT = 6

/** 一组的稳定 key（与 rowKey 同口径，但优先用面板注入的 __key） */
export function groupKey(row, index) {
  if (row && row.__key) return String(row.__key)
  return rowKey(row, index)
}

/** 副本行 key：id 唯一，缺 id 用组 key + 下标兜底 */
export function aliasKey(alias, index, group) {
  if (alias && alias.id != null && alias.id !== '') return String(alias.id)
  return 'alias-' + String(group == null ? '' : group) + '-' + String(index == null ? 0 : index)
}

/** 单条记录（主文件或副本）的展示路径：relPath 优先，缺了退 id */
export function itemPath(item) {
  const it = item || {}
  if (it.relPath) return String(it.relPath)
  if (it.id != null && it.id !== '') return String(it.id)
  return '（未知路径）'
}

/**
 * 缩略图 URL —— 必须内容寻址，否则同一条记录换了内容还命中旧缓存：
 *   图片（kind=photo）：/api/media/thumb/p/<contentHash>（定位符就是内容哈希，后端单段路由）
 *   视频（kind=video）：/api/media/thumb/v/<id>（视频封面按 id，服务端内部再换内容寻址文件）
 * 拿不到定位符时返回空串，调用方据此渲染占位块，而不是拼一个必然 404 的地址。
 */
export function thumbPath(kind, item, groupHash) {
  const it = item || {}
  if (kind === 'photo') {
    const hash = String(it.contentHash || groupHash || '').trim()
    return hash ? '/api/media/thumb/p/' + encodeURIComponent(hash) : ''
  }
  const id = it.id == null || it.id === '' ? '' : String(it.id).trim()
  return id ? '/api/media/thumb/v/' + encodeURIComponent(id) : ''
}

/** 缩略图 404 / 加载失败时的占位字符：文件名首字（跳过标点），空路径给 '?' */
export function fileInitial(relPath) {
  const raw = String(relPath == null ? '' : relPath).trim()
  if (!raw) return '?'
  const base = raw.split(/[\\/]/).filter(Boolean).pop() || raw
  const hit = base.match(/[\p{L}\p{N}]/u)
  return (hit ? hit[0] : base.slice(0, 1)).toUpperCase()
}

/**
 * 右栏折叠窗口：折叠时只给前 limit 行，展开（expanded=true）时给全部。
 * more 只看总数是否超过上限——展开后仍要保留「收起」入口，所以 more 不随 expanded 变。
 */
export function aliasWindow(list, limit, expanded) {
  const all = Array.isArray(list) ? list : []
  const cap = num(limit) != null && limit > 0 ? Math.round(Number(limit)) : all.length
  const take = expanded ? all.length : cap
  return {
    visible: all.slice(0, take),
    hidden: Math.max(0, all.length - take),
    more: all.length > cap,
    collapsed: !expanded
  }
}

/** 缩略图坏掉后是否改写占位：url 为空或不处于 broken 集合里才算「还能显示」 */
export function thumbSrc(brokenMap, url) {
  if (!url) return ''
  const map = brokenMap || {}
  return map[url] ? '' : url
}

/** 标记某个缩略图地址已失败（404 / 解码失败），只记一次，避免反复重试打后端 */
export function markThumbBroken(brokenMap, url) {
  if (!brokenMap || !url) return false
  if (brokenMap[url]) return false
  brokenMap[url] = true
  return true
}

/* ======================================================= P4.2 大图预览（遮罩层）
 * 遮罩层要判定的东西和缩略图一样「纯」：URL 怎么拼、当前组的文件怎么排、第 i / N 怎么算、
 * 左右切换到头怎么办、ESC / 背景点击关不关、图片 404 怎么回退原图。
 * 全部放这里，模板只负责画（单测：p4b-evidence/test-duplicates-p42.mjs）。
 */

/** 原文件地址：/api/media/file?p=<urlencode(relPath)>；没有 relPath 给空串（不拼必然 404 的地址） */
export function filePath(relPath) {
  const rel = String(relPath == null ? '' : relPath).trim()
  return rel ? '/api/media/file?p=' + encodeURIComponent(rel) : ''
}

/** 图片大图预览地址：/api/media/preview/p/<contentHash>（内容寻址；后端可能没产物，调用方必须能回退） */
export function previewPath(contentHash) {
  const hash = String(contentHash == null ? '' : contentHash).trim()
  return hash ? '/api/media/preview/p/' + encodeURIComponent(hash) : ''
}

/** 文件名（去掉目录）：遮罩层标题用，免得长路径把标题顶飞 */
export function fileBaseName(relPath) {
  const raw = String(relPath == null ? '' : relPath).trim()
  if (!raw) return ''
  return raw.split(/[\\/]/).filter(Boolean).pop() || raw
}

/**
 * 一组的全部文件（遮罩层左右切换的范围）：主文件固定第 0 位，其后按后端顺序的副本。
 * 主文件缺失也占位——否则「第 i / N」少一个，切换顺序和卡片上的视觉顺序也会错开。
 */
export function groupFiles(row) {
  const files = [{ role: 'primary', pos: 0, item: (row && row.primary) || {} }]
  groupAliases(row).forEach((alias, i) => {
    files.push({ role: 'alias', pos: i + 1, item: alias })
  })
  return files
}

/**
 * 当前文件的大图加载方案：
 *   图片：优先 preview/p/<hash>（更小更快），fallback = 原图 /file?p= —— 预览缺产物时自动换；
 *   视频：直接播原文件 /file?p=（不转码，能播则播），封面地址一并给出，播不了由模板提示回退原画播放器。
 * src 为空 = 连原文件地址都拼不出来：直接进错误态，不渲染必然破图的 <img>/<video>。
 */
export function previewStage(kind, item, groupHash) {
  const it = item || {}
  const file = filePath(it.relPath)
  const thumb = thumbPath(kind, it, groupHash)
  if (kind === 'photo') {
    const pv = previewPath(it.contentHash || groupHash)
    const src = pv || file
    return { media: 'photo', src, fallback: pv && file ? file : '', thumb, status: src ? 'loading' : 'error', usedFallback: false }
  }
  return { media: 'video', src: file, fallback: '', thumb, status: file ? 'loading' : 'error', usedFallback: false }
}

/** 图片预览 404 / 解码失败：还有原图就换原图继续加载，没有才进「加载失败」（模板给重试按钮） */
export function previewFallbackStage(stage) {
  const st = stage || {}
  if (st.fallback && st.fallback !== st.src) {
    return { ...st, src: st.fallback, fallback: '', status: 'loading', usedFallback: true }
  }
  return { ...st, status: 'error' }
}

/** 加载完成：停转圈（失败路径不经这里，否则会把错误态盖掉） */
export function previewLoadedStage(stage) {
  return { ...(stage || {}), status: 'ready' }
}

/** 关闭态：open=false；其余字段留默认值，模板拿它判断时不必到处写可选链 */
export function closedLightbox() {
  return { open: false, kind: 'video', files: [], index: 0, hash: '', stage: null, token: 0 }
}

/** 点击缩略图要打开第几个文件：按对象身份找（其次 id / relPath），找不到退主文件（恒为第 0 位） */
export function resolveTargetIndex(files, target) {
  const list = Array.isArray(files) ? files : []
  if (!list.length) return 0
  const t = target || {}
  if (t.role === 'alias' && t.alias) {
    const alias = t.alias
    const hit = list.findIndex((f) => {
      if (!f || f.role !== 'alias' || !f.item) return false
      if (f.item === alias) return true
      if (alias.id != null && f.item.id != null && String(f.item.id) === String(alias.id)) return true
      return !!(alias.relPath && f.item.relPath === alias.relPath)
    })
    if (hit >= 0) return hit
  }
  return 0
}

/** 打开遮罩层：当前组全部文件 + 起始位置 + 首个加载方案 */
export function openLightbox(kind, row, target) {
  const files = groupFiles(row)
  const k = kind === 'photo' ? 'photo' : 'video'
  const hash = String((row && row.contentHash) || '')
  const index = resolveTargetIndex(files, target)
  const file = files[index]
  return {
    open: files.length > 0,
    kind: k,
    files,
    index,
    hash,
    stage: previewStage(k, file && file.item, hash),
    token: 0
  }
}

/** 跳到第 index 个文件（越界按首尾循环归一）：换文件就重建加载方案 + token++，让 <img>/<video> 重新挂载 */
export function lightboxAt(state, index) {
  const s = state || {}
  const files = Array.isArray(s.files) ? s.files : []
  if (!s.open || !files.length) return s
  const n = files.length
  const raw = Number(index)
  const base = isFinite(raw) ? Math.round(raw) : 0
  const i = ((base % n) + n) % n
  const file = files[i]
  return { ...s, index: i, stage: previewStage(s.kind, file && file.item, s.hash), token: (s.token || 0) + 1 }
}

/** 左右切换：delta=±1。到头**循环**（首尾相接）——键盘和按钮永远有反馈，不需要先想「到底了没」 */
export function lightboxStep(state, delta) {
  const s = state || {}
  const files = Array.isArray(s.files) ? s.files : []
  if (!s.open || !files.length) return s
  const d = Number(delta)
  return lightboxAt(s, (s.index || 0) + (isFinite(d) ? Math.round(d) : 0))
}

/** 重试：重建当前文件的加载方案（图片重走 preview → 原图；视频重新挂载 <video>） */
export function lightboxRetry(state) {
  const s = state || {}
  if (!s.open) return s
  return lightboxAt(s, s.index)
}

/**
 * 键盘状态机：ESC 关闭、←/→ 切换；其余键**原样返回同一个对象**——
 * 调用方用 `next === lightbox.value` 判断「这次按键归不归我管」，不用自己维护按键表。
 */
export function lightboxKey(state, key) {
  const s = state || {}
  if (!s.open) return s
  const k = String(key == null ? '' : key)
  if (k === 'Escape') return closedLightbox()
  if (k === 'ArrowLeft') return lightboxStep(s, -1)
  if (k === 'ArrowRight') return lightboxStep(s, 1)
  return s
}

/** 背景点击才关闭：点在遮罩自身（target === currentTarget）才算背景，点内容/按钮不关闭 */
export function isBackdropClick(event) {
  const e = event || {}
  return !!e.target && e.target === e.currentTarget
}

/** 当前文件（模板取大小 / 缩略图路径 / 主文件还是副本）；关闭态给空对象，模板不必写可选链 */
export function lightboxCurrent(state) {
  const s = state || {}
  const files = Array.isArray(s.files) ? s.files : []
  return files[s.index] || { role: 'primary', pos: 0, item: {} }
}

/** 底部「第 i / N」：关闭态给空串（不显示） */
export function lightboxLabel(state) {
  const s = state || {}
  const files = Array.isArray(s.files) ? s.files : []
  if (!s.open || !files.length) return ''
  const i = Math.min(Math.max(0, s.index || 0), files.length - 1)
  return '第 ' + (i + 1) + ' / ' + files.length
}

/** <img>/<video> 的 key：换文件或重试都要重新挂载，否则旧地址的破图/失败态会留下 */
export function lightboxStageKey(state) {
  const s = state || {}
  return String(s.index || 0) + ':' + String(s.token || 0)
}

/* ==================================================== P4.3 单条副本清理
 * 清理粒度从「整组」细化到「一条」：请求体 / 确认文案 / 乐观局部更新 / 空页回退
 * 都是纯函数，直接单测（p43-evidence/test-duplicates-p43.mjs）。
 */

/** 同一条别名：id 唯一（后端可能是数字或字符串），缺 id 时退回 rel_path 比对 */
export function sameAlias(alias, aliasId) {
  const a = alias || {}
  const id = aliasId == null ? '' : String(aliasId)
  if (a.id != null && a.id !== '') return String(a.id) === id
  return !!id && String(a.relPath || '') === id
}

/**
 * 单条清理的请求体：字段名与后端 `POST /duplicates/remove` 一一对应。
 * 传 aliasId（别名行 id）而不是 contentHash —— 这正是「只清这一条」与组级 merge 的区别。
 */
export function removeRequestBody(input) {
  const s = input || {}
  const alias = s.alias || {}
  return {
    kind: s.kind === 'photo' ? 'photo' : 'video',
    aliasId: alias.id,
    deleteFile: !!s.deleteFile
  }
}

/**
 * 确认框里「同时移入回收站」的默认值：继承卡片底部的组级勾选（不新增每行复选框）。
 * 组未被勾选 → 默认 false（仅删记录），与整组清理的默认口径一致。
 */
export function inheritedTrashFlag(trashKeys, key) {
  const list = Array.isArray(trashKeys) ? trashKeys : []
  return list.indexOf(String(key == null ? '' : key)) >= 0
}

/** 单条清理的二次确认文案：必须写清「只清这一条」以及文件是否进回收站 */
export function removeConfirmText(input) {
  const s = input || {}
  const alias = s.alias || {}
  const kind = kindLabel(s.kind)
  const target = itemPath(alias)
  const size = formatBytes(alias.size)
  const effect = s.deleteFile
    ? '这份副本文件会被移入回收站（可在回收站恢复，不会直接删除），本条释放 ' + size
    : '只删除这一条索引记录，磁盘上的副本文件保持不动（不释放磁盘，下一轮重建索引可能又扫回来）'
  return [
    '只清理这一条' + kind + '副本：「' + target + '」。',
    '影响：' + effect + '。',
    '本条体积：' + size + '。',
    '本组其余副本与主文件不受影响（要整组清理请用卡片底部的「清理本组」）。'
  ].join('\n')
}

/**
 * 乐观移除一条副本：返回<b>新的 rows</b>（不改原数组），并告知「这组是否已清空」。
 *
 * <p>同时重算 count / bytesWasted —— 卡片底部「共 N 个副本 · 可省 X MB」与顶部统计
 * 都直接读这两个字段，重算后界面立刻正确，不必等一次整页请求。</p>
 *
 * <p>组里最后一条副本被移除 → 该组整张卡片从 rows 里消失（`groupRemoved=true`）。</p>
 */
export function removeAliasRow(rows, key, aliasId) {
  const list = Array.isArray(rows) ? rows : []
  const target = String(key == null ? '' : key)
  const out = []
  let groupRemoved = false
  let removedAlias = null
  list.forEach((row, i) => {
    if (!row || groupKey(row, i) !== target) {
      out.push(row)
      return
    }
    const aliases = groupAliases(row)
    const hit = aliases.filter((a) => sameAlias(a, aliasId))
    if (!hit.length) {
      // 本地没有这条副本：原样保留（不做无根据的改写）
      out.push(row)
      return
    }
    const rest = aliases.filter((a) => !sameAlias(a, aliasId))
    if (!removedAlias) removedAlias = hit[0]
    if (!rest.length) {
      groupRemoved = true
      return
    }
    out.push({
      ...row,
      aliases: rest,
      count: rest.length + 1,
      bytesWasted: rest.reduce((sum, a) => sum + (num(a && a.size) || 0), 0)
    })
  })
  return { rows: out, groupRemoved, removedAlias, touched: !!removedAlias }
}

/** 清空后的页码回退：本页已空且不是第 1 页 → 退一页（调用方据此重拉，避免停在空页） */
export function fallbackPage(rows, page) {
  const list = Array.isArray(rows) ? rows : []
  const p = num(page) != null && page > 0 ? Math.round(num(page)) : 1
  return list.length === 0 && p > 1 ? p - 1 : p
}