import request from '@/utils/request'

// 后端前缀：MediaAdminController 映射在 /api/media/admin
const BASE = '/api/media/admin'

// 视频分页列表
export function listVideos(query) {
  return request({
    url: BASE + '/videos',
    method: 'get',
    params: query
  })
}

// 相册分页列表
export function listAlbums(query) {
  return request({
    url: BASE + '/albums',
    method: 'get',
    params: query
  })
}

// 某册图片分页列表
export function listPhotos(query) {
  return request({
    url: BASE + '/photos',
    method: 'get',
    params: query
  })
}

// 详情：kind ∈ video / album / photo
export function getDetail(kind, id) {
  return request({
    url: BASE + '/detail/' + kind + '/' + id,
    method: 'get'
  })
}

// 隐藏 / 取消隐藏
export function setHidden(kind, id, hidden) {
  return request({
    url: BASE + '/hidden/' + kind + '/' + id,
    method: 'patch',
    data: { hidden: hidden }
  })
}

// 软删（移入回收站，不真删）
export function removeMedia(kind, id) {
  return request({
    url: BASE + '/' + kind + '/' + id,
    method: 'delete'
  })
}

// 从回收站恢复
export function restoreMedia(kind, id) {
  return request({
    url: BASE + '/restore/' + kind + '/' + id,
    method: 'post'
  })
}

// 回收站分页列表（以磁盘为准；同 id 多份软删各占一行）
export function listTrash(query) {
  return request({
    url: BASE + '/trash',
    method: 'get',
    params: query
  })
}

// 回收站统计：{count, bytes, byKind:{video,album,photo}}
export function trashStats() {
  return request({
    url: BASE + '/trash/stats',
    method: 'get'
  })
}

// 彻底删除（真删，不可恢复）：trashRel 用于同 id 多份时精确指定某一条
export function purgeTrash(kind, id, trashRel) {
  return request({
    url: BASE + '/trash/' + kind + '/' + encodeURIComponent(id),
    method: 'delete',
    params: trashRel ? { trashRel: trashRel } : {}
  })
}


// ------------------------------------------------------------------ 内容分级（P5.99）

// 单条视频改分级：body {rating:'general'|'guidance'|'restricted'}
export function setVideoRating(id, rating) {
  return request({
    url: BASE + '/video/' + encodeURIComponent(id) + '/rating',
    method: 'put',
    data: { rating: rating }
  })
}

// 单本相册改分级（整册属性：册里的图片继承它）
export function setAlbumRating(id, rating) {
  return request({
    url: BASE + '/album/' + encodeURIComponent(id) + '/rating',
    method: 'put',
    data: { rating: rating }
  })
}

// 批量改分级：{type:'video'|'album', ids:[], rating}
export function setRatingBatch(payload) {
  return request({
    url: BASE + '/rating/batch',
    method: 'post',
    data: payload
  })
}

// 读分级可见性策略：{general, guidance, restricted, items:[{value,label,guestVisible}]}
export function getRatingPolicy(signal) {
  return request({
    url: BASE + '/rating-policy',
    method: 'get',
    signal: signal
  })
}

// 局部改分级可见性策略：只传要改的那几档（true = 未登录可见）
export function setRatingPolicy(payload) {
  return request({
    url: BASE + '/rating-policy',
    method: 'put',
    data: payload
  })
}

// 自动分级（P6.02）：{dryRun, only, limit, useLlm, force} → 报告（每档计数 / 命中词 / 20 条样例 / 模型兜底）
// dryRun 缺省 true：不传就是预览。超时给到 15 分钟 —— 开了模型兜底时后端要逐条问本地模型
// （并发 2、单条 15s），默认 10s 的全局超时必然先断，用户看到的是「接口超时」而不是报告。
export function classifyRating(payload) {
  return request({
    url: BASE + '/rating/classify',
    method: 'post',
    data: payload || {},
    timeout: 900000
  })
}

// 改相册人物归属（personId 传 null 表示未归类）
export function setAlbumPerson(id, personId) {
  return request({
    url: BASE + '/album/' + id + '/person',
    method: 'patch',
    data: { personId: personId }
  })
}

// 人物下拉
export function listPeople() {
  return request({
    url: BASE + '/people',
    method: 'get'
  })
}

// 占用统计
export function getStats() {
  return request({
    url: BASE + '/stats',
    method: 'get'
  })
}

// 媒体站数据看板（播放量/点击量/浏览量/观看时长/收藏量/排行）
export function getMediaStats() {
  return request({
    url: BASE + '/stats/overview',
    method: 'get'
  })
}

// 单个媒体目标的统计（视频播放曲线 / 图片点击曲线 / 相册打开曲线）
// 参数：{ targetType: 'video'|'photo'|'album', targetKey: string, days: number }
// 返回：{ targetType, targetKey, title, playCount, playEndCount, completedCount,
//        completionRate, totalPlayMs, daily: [{ date, count }] }
export function getMediaTargetStats(params) {
  return request({
    url: BASE + '/stats/target',
    method: 'get',
    params
  })
}

// 触发扫描 / 生成类任务（异步，同一时刻只允许 1 个）
// mode：scan（重建索引）| thumb（重建缩略图）| sprite | preview | sprite,preview（精灵图+预览）| gc
//       | enrich（补元数据 ffprobe）| backfill-hash（补内容哈希）| fix-poster（修复封面路径）| export（导出便携包）
// - gc 会真删孤儿派生文件，必须传 { confirm: true }，否则后端 400
// - limit 只对 thumb / sprite / preview 生效（0 或省略 = 不限），用于先小批量试跑
// - 其余可选参数（P1-A 新增，旧后端会忽略）：albumMode(dir|prefix)、exclude(排除规则)、noFresh(关闭新鲜度)、force(强制重建)
export function startScan(mode, options) {
  const data = { mode: mode || 'scan' }
  const extra = options || {}
  if (extra.confirm) {
    data.confirm = true
  }
  if (extra.limit) {
    data.limit = extra.limit
  }
  if (extra.noFresh) {
    data.noFresh = true
  }
  if (extra.force) {
    data.force = true
  }
  if (extra.albumMode) {
    data.albumMode = extra.albumMode
  }
  if (extra.exclude) {
    data.exclude = extra.exclude
  }
  // P5.10-B：只处理勾选的视频。videoIds 只对 thumb / sprite / preview 生效，其它 mode 后端忽略
  if (Array.isArray(extra.videoIds) && extra.videoIds.length) {
    data.videoIds = extra.videoIds
  }
  return request({
    url: BASE + '/scan',
    method: 'post',
    data: data
  })
}

// 维护任务：语义化包装，统一走上面的 startScan（因此共用同一把「同时只跑一个」的锁）
export function enrichMeta(options) {
  return startScan('enrich', options)
}

export function backfillHash(options) {
  return startScan('backfill-hash', options)
}

export function fixPoster(options) {
  return startScan('fix-poster', options)
}

export function exportBundle(options) {
  return startScan('export', options)
}

// 最近的导出包（最多 10 次）：[{ dir, files: [{ name, size }] }]
// silent=true 时请求失败不弹全局提示，由调用方在面板里就地提示（接口未就绪时的降级）
export function listExports(silent) {
  return request({
    url: BASE + '/export/list',
    method: 'get',
    silent: !!silent
  })
}

// 导出文件的下载地址（相对后端前缀，便于直接展示 / 复制）
export function downloadUrl(dir, file) {
  return BASE + '/export/download?dir=' + encodeURIComponent(dir || '') + '&file=' + encodeURIComponent(file || '')
}

// 带鉴权的下载（token 走请求头，所以不能直接把 downloadUrl 丢给 <a>）：返回 blob，由调用方 saveAs
export function downloadExport(dir, file) {
  return request({
    url: downloadUrl(dir, file),
    method: 'get',
    responseType: 'blob',
    timeout: 120000,
    silent: true
  })
}

// 库根列表：[{ id, name, path, kind, note, exists, readable, videoCount, photoCount }]
export function listRoots(silent, signal) {
  return request({
    url: BASE + '/roots',
    method: 'get',
    silent: !!silent,
    signal: signal
  })
}

// 新增库根：body { name, path, kind, note }
// silent：错误体是媒体模块的 {error:"..."}（真实 HTTP 400/403/404），由维护面板就地展示，不再叠一层全局提示
export function createRoot(data) {
  return request({
    url: BASE + '/roots',
    method: 'post',
    data: data || {},
    silent: true
  })
}

// 修改库根：body { name?, path?, note? }（返回体可能带 pathChanged / hint，提示还要跑一次重建索引）
export function updateRoot(id, data) {
  return request({
    url: BASE + '/roots/' + encodeURIComponent(id),
    method: 'put',
    data: data || {},
    silent: true
  })
}

// 删除库根：后端有引用时会 400（message 里带 videos/photos 引用数），前端原样展示
export function deleteRoot(id) {
  return request({
    url: BASE + '/roots/' + encodeURIComponent(id),
    method: 'delete',
    silent: true
  })
}

// 指定扫描任务
export function getScanJob(jobId) {
  return request({
    url: BASE + '/scan/' + jobId,
    method: 'get'
  })
}

// 最近一次扫描任务
export function getScanLatest() {
  return request({
    url: BASE + '/scan/latest',
    method: 'get'
  })
}

/* P6.04：维护抽屉的「上次执行」回填。
   后端任务视图只有 type=full|thumb，没有 mode 列；这里拿最近 N 条日志尾部，
   由前端按 START / enrich / EXPORT / poster / 回填 等标记识别能确定归属的那几条。
   silent=true：缺少 media:admin:scan 权限（403）或旧后端（404）时静默降级到 localStorage。 */
export function listScanJobs(limit) {
  return request({
    url: BASE + '/scan/list',
    method: 'get',
    params: { limit: limit || 30 },
    silent: true
  })
}

/* P6.04：数据一致性检查用的缺失清单（只读，total 就是缺失条数） */
export function listMissing(query) {
  return request({
    url: BASE + '/missing',
    method: 'get',
    params: query,
    silent: true
  })
}

// 标签字典：[{id,name,color,useCount}]，按 useCount 降序
export function listTags() {
  return request({
    url: BASE + '/tags',
    method: 'get'
  })
}

// 新建标签：body { name, color? }；name 唯一，重名直接复用既有行
// 返回 { id, name, color, useCount, created }，created=false 表示重名复用
export function createTag(data) {
  return request({
    url: BASE + '/tags',
    method: 'post',
    data: data
  })
}

// 删除标签字典项：同时解除 media_video_tag 里该标签的全部关联
// 返回 { deleted: 1, unlinked: N }
export function deleteTag(id) {
  return request({
    url: BASE + '/tags/' + id,
    method: 'delete'
  })
}

// 标签改名 / 改色：body { name?, color? }（改名同样做重名校验，重名后端返回 409）
export function updateTag(id, data) {
  return request({
    url: BASE + '/tags/' + id,
    method: 'patch',
    data: data || {}
  })
}

// 标签规范化（P6.03）：body { dryRun }（缺省 true = 只预览不写库）
// 后端跑 doc/media-import/normalize-tags.js，返回脚本统计：
//   { mode, backup, before, changes, after, oldTags[], atomSet[], facetGroups{}, stdout }
// dryRun=false 时脚本会先 mysqldump 备份 media_tag / media_video_tag 再单事务写库（幂等）
export function normalizeTags(dryRun) {
  return request({
    url: BASE + '/tags/normalize',
    method: 'post',
    data: { dryRun: dryRun !== false }
  })
}

// 站端编辑策略（三档）：GET → { level: 'off' | 'local' | 'full' }
// off = 禁止编辑；local = 只能本地编辑（localStorage）；full = 完全编辑（写接口）
export function getEditPolicy() {
  return request({
    url: BASE + '/edit-policy',
    method: 'get'
  })
}

// 修改编辑策略：body { level }，level ∈ off / local / full
export function setEditPolicy(level) {
  return request({
    url: BASE + '/edit-policy',
    method: 'put',
    data: { level: level }
  })
}

/* ---------------------------------------------------------------- 自动扫描（监听） */
/* 契约（P2-A）：GET /api/media/admin/watch → { enabled, running, roots:[{ id, path, registered,
   lastEventAt, lastScanAt, pending }], debounceSeconds }；POST /watch/pause | /watch/resume | /watch/scan-now。
   后端未部署时统一 404：全部 silent，由维护面板就地给出「未启用或接口未就绪」，不弹全局提示。 */

// 监听状态
export function getWatchStatus(silent, signal) {
  return request({
    url: BASE + '/watch',
    method: 'get',
    silent: silent !== false,
    signal: signal
  })
}

// 暂停监听
export function pauseWatch() {
  return request({
    url: BASE + '/watch/pause',
    method: 'post',
    silent: true
  })
}

// 继续监听
export function resumeWatch() {
  return request({
    url: BASE + '/watch/resume',
    method: 'post',
    silent: true
  })
}

// 立即扫描一次（不等防抖）
export function scanNow() {
  return request({
    url: BASE + '/watch/scan-now',
    method: 'post',
    silent: true
  })
}

/* 运行期改监听配置（P2-C）：body { enabled?, debounceSeconds?, quietMinutes? }，成功回同 GET 结构。
   部署层 qtools.media.watch.allowRuntimeToggle=false 时后端 403；失败文案由调用方 toast 后端原文，
   所以这里是 silent（拦截器不再弹第二条）。 */
export function updateWatchConfig(data) {
  return request({
    url: BASE + '/watch/config',
    method: 'put',
    data: data || {},
    silent: true
  })
}

/* ---------------------------------------------------------------- 相册图片（P2-D） */
/* 契约（P2-D-A）：GET /api/media/admin/album/{id}/photos → [{id,seq,relPath,bytes,w,h,thumbUrl}]，
   只读索引、不碰磁盘。和上面 /photos 的区别：/photos 按物理目录列举（会把 _说明.txt、无扩展名文件
   也当成图片），管理端预览弹窗必须用这个库数据入口，两者不能混用。
   后端未部署 P2-D-A 时该路由 404：silent，由弹窗自行回退并就地提示，不弹全局提示。 */

// 某册图片（库数据）：albumId 为空时后端 400，调用方保证有值
export function getAlbumPhotos(albumId, silent) {
  return request({
    url: BASE + '/album/' + encodeURIComponent(albumId) + '/photos',
    method: 'get',
    silent: silent !== false
  })
}

/* ------------------------------------------------------------ 人物管理（P3-B） */
/* 契约（P3-A）：GET /admin/persons?q=&page=&size= → { rows|list, total }；
   POST/PUT/DELETE /admin/persons[/{id}]；PUT /admin/videos/{id}/persons {personIds,roles}；
   PUT /admin/albums/{id}/persons {personIds}。
   后端未部署 P3-A 时这些路由统一 404：全部 silent，由人物管理页 / 弹窗就地给出可读提示，
   不弹全局提示、不抛异常（与 /watch、/export 等未就绪接口的处理方式一致）。 */

// 人物分页列表：q 同时匹配名称 / 别名（后端决定），page 从 1 开始
export function listPersons(query) {
  return request({
    url: BASE + '/persons',
    method: 'get',
    params: query,
    silent: true
  })
}

// 新建人物：body { name, alias?, remark?, gender? }，名称唯一
export function createPerson(data) {
  return request({
    url: BASE + '/persons',
    method: 'post',
    data: data || {},
    silent: true
  })
}

// 修改人物：body { name?, alias?, remark?, gender? }
export function updatePerson(id, data) {
  return request({
    url: BASE + '/persons/' + encodeURIComponent(id),
    method: 'put',
    data: data || {},
    silent: true
  })
}

// 删除人物：仍有引用时后端返回 4xx 并带视频 / 相册计数，前端原样展示并阻止
export function deletePerson(id) {
  return request({
    url: BASE + '/persons/' + encodeURIComponent(id),
    method: 'delete',
    silent: true
  })
}

/* ------------------------------------------------- 人物卡片补充（P5.63，站端只读） */
/* 管理端分页（/admin/persons）带 videoCount / albumCount，但**没有**照片数、也没有相册封面：
   卡片上的「Z 张照片」（al.photo_count 求和）和「头像第二级（相册封面）」只能走站端这两个只读接口。
   两者都是匿名可读的 /api/media/person/{id}/*，与管理端权限无关；失败时静默，卡片降级即可。 */

// 某人物名下的相册分页：行里带 count（照片数）与 cover（thumbs/ 相对路径）
export function listPersonAlbums(id, query) {
  return request({
    url: '/api/media/person/' + encodeURIComponent(id) + '/albums',
    method: 'get',
    params: query || { page: 1, size: 200 },
    silent: true
  })
}

// 某人物名下的视频分页：只需一行的 id 去拼 /api/media/thumb/v/{id}（头像第三级）
export function listPersonVideos(id, query) {
  return request({
    url: '/api/media/person/' + encodeURIComponent(id) + '/videos',
    method: 'get',
    params: query || { page: 1, size: 1 },
    silent: true
  })
}

/* ------------------------------------------------- 人物手动头像（P5.66，管理端自己的写接口） */
/* 契约（P5.66 后端同批落地，MediaAdminController）：
     PUT    /api/media/admin/persons/{id}/avatar   body { kind: 'photo'|'frame'|'url', ref }
     DELETE /api/media/admin/persons/{id}/avatar
   两条都返整条 personNode（含后端解析好的 avatarKind / avatarRef / avatarUrl）。
   权限 @PreAuthorize('media:admin:edit')，**不过**站端编辑策略闸门。

   为什么不用站端那两条（PUT/DELETE /api/media/person/{id}/avatar）：
     1. 用户口径「管理端用自己的接口，不共用用户端接口」——站端那两条是 @Anonymous，
        为「访客在 full 档位下也能改」而开，管理端借道会让权限模型变成两套;
     2. 站端那条会被「站端编辑策略」闸门挡住（off / local 档 403）——管理员不该被访客策略挡住;
     3. 业务实现仍是同一份 IMediaPersonService.setAvatar / clearAvatar，后端没有复制逻辑，
        差别只在入口与权限（详见后端两个方法的 javadoc）。
   注意：老的 POST /api/media/admin/persons/{id}/avatar（body {path}）只写历史列 avatar_path，
   表达不了「相册第 N 张 / 视频第 S 秒 + 裁剪」这三档，本模块不用它（本页仍然兼容读 avatarPath）。 */

// 设人物手动头像：body { kind, ref }
export function setPersonAvatar(id, kind, ref) {
  return request({
    url: BASE + '/persons/' + encodeURIComponent(id) + '/avatar',
    method: 'put',
    data: { kind: kind, ref: ref },
    silent: true
  })
}

// 清除人物手动头像（回到相册首图 → 视频封面 → 首字占位三级自动）
export function clearPersonAvatar(id) {
  return request({
    url: BASE + '/persons/' + encodeURIComponent(id) + '/avatar',
    method: 'delete',
    silent: true
  })
}

// 整条视频的人物集合：body { personIds: [], roles: { <personId>: '角色名' } }
export function setVideoPersons(id, data) {
  return request({
    url: BASE + '/videos/' + encodeURIComponent(id) + '/persons',
    method: 'put',
    data: data || {},
    silent: true
  })
}

// 整本相册的人物集合：body { personIds: [] }
export function setAlbumPersons(id, personIds) {
  return request({
    url: BASE + '/albums/' + encodeURIComponent(id) + '/persons',
    method: 'put',
    data: { personIds: personIds || [] },
    silent: true
  })
}

/* ------------------------------------------------------------ 工作室管理（P5-A） */
/* 契约（P5-A）：GET /api/media/admin/studios?q=&page=&size= → { rows|list, total }，
    行内至少带 { id, name, videoCount }；
   POST/PUT/DELETE /api/media/admin/studios[/{id}]；
   PUT /api/media/admin/videos/{id}/studios { studioIds }（整条视频的工作室集合）。
   后端未部署 P5-A 时这些路由统一 404：全部 silent，由工作室管理页就地给出可读提示，
   不弹全局提示、不抛异常（与 /persons、/duplicates 等未就绪接口同一套处理）。 */

// 工作室分页列表：q 匹配名称（后端决定），page 从 1 开始
export function listStudios(query) {
  return request({
    url: BASE + '/studios',
    method: 'get',
    params: query,
    silent: true
  })
}

// 新建工作室：body { name, remark? }，名称唯一
export function createStudio(data) {
  return request({
    url: BASE + '/studios',
    method: 'post',
    data: data || {},
    silent: true
  })
}

// 修改工作室：body { name?, remark? }
export function updateStudio(id, data) {
  return request({
    url: BASE + '/studios/' + encodeURIComponent(id),
    method: 'put',
    data: data || {},
    silent: true
  })
}

// 删除工作室：仍有引用时后端返回 4xx 并带视频计数，前端原样展示并阻止
export function deleteStudio(id) {
  return request({
    url: BASE + '/studios/' + encodeURIComponent(id),
    method: 'delete',
    silent: true
  })
}

// 整条视频的工作室集合：body { studioIds: [] }（媒体库行内操作可直接复用）
export function setVideoStudios(id, studioIds) {
  return request({
    url: BASE + '/videos/' + encodeURIComponent(id) + '/studios',
    method: 'put',
    data: { studioIds: studioIds || [] },
    silent: true
  })
}

/* ========================================================================
   P4-B：重复文件管理（纯新增，不改上面任何既有导出）
   契约（P4-A）：
     GET  /api/media/admin/duplicates?kind=video|photo&page=&size=
          → { rows: [{ contentHash, primary:{id,relPath,size},
                       aliases:[{id,relPath,size}], count, bytesWasted }], total }
     POST /api/media/admin/duplicates/merge  { kind, contentHash, deleteFiles }
     POST /api/media/admin/duplicates/keep   { kind, contentHash, id }
     POST /api/media/admin/duplicates/remove { kind, aliasId, deleteFile }   ← P4.3 单条清理
   全部 silent：接口未就绪（404/405/501）时由抽屉就地提示，不弹全局错误。
   ======================================================================== */

// 重复文件分组分页列表
export function listDuplicates(query) {
  return request({
    url: BASE + '/duplicates',
    method: 'get',
    params: query,
    silent: true
  })
}

// 清理副本：deleteFiles=false 只删索引记录；true 同时把副本文件移入回收站（后端负责，不真删）
export function mergeDuplicates(data) {
  return request({
    url: BASE + '/duplicates/merge',
    method: 'post',
    data: data || {},
    silent: true
  })
}

// 清理【一条】副本（P4.3）：按别名行 id 定位，deleteFile=true 时把那份文件移入回收站。
// 与 mergeDuplicates 的区别是定位方式：merge 按 contentHash 整组删，这里只动一条。
export function removeDuplicate(data) {
  return request({
    url: BASE + '/duplicates/remove',
    method: 'post',
    data: data || {},
    silent: true
  })
}

// 设为主文件：只改索引记录，不动磁盘文件
export function keepDuplicate(data) {
  return request({
    url: BASE + '/duplicates/keep',
    method: 'post',
    data: data || {},
    silent: true
  })
}

/* ========================================================================
   P5.10-B：派生资源状态（纯新增，不改上面任何既有导出）
   契约（P5.10-A）：
     GET /api/media/admin/derive-status?page=&size=&ids=&q=&kind=
       → { rows: [{ videoId, title, dur,
                    thumb:   { exists, stale },
                    sprite:  { exists, stale },
                    preview: { exists, stale, frames }, bytes }], total }
   ids 是逗号分隔的 videoId 列表：把主列表当前页的 id 传过去，两次查询条件因此完全一致。
   接口未就绪（404/501）时 silent：由列表就地降级成「—」并在首次提示一次，不弹全局错误、不抛异常。
   ======================================================================== */

// 派生资源状态（封面 / 精灵图 / 预览是否存在、是否过期）
export function getDeriveStatus(query) {
  return request({
    url: BASE + '/derive-status',
    method: 'get',
    params: query,
    silent: true
  })
}

/* ========================================================================
   P5.78：库根「未登录是否可见」（纯新增，不改上面任何既有导出）
   契约：
     GET  /api/media/admin/roots            → [{ id, name, path, kind, guestVisible, note,
                                                  exists, readable, videoCount, albumCount,
                                                  photoCount, isDefault }]
     PUT  /api/media/admin/roots/{id}  { guestVisible: true|false }
          → 局部更新（不传的字段不动），返回体与 GET 行同形 + { updated, pathChanged }
   语义：guestVisible=false 的根下，未登录访客在 /api/media/index 里看不到它的视频 / 相册 /
         图片，直接访问其资源（按 id 或 hash）一律 404；登录用户不受影响。
   改动写完立即清掉站端判定缓存与索引快照，所以开关切完下一次请求就生效（无需等 60s）。
   ======================================================================== */

// 行内开关：只改 guestVisible，一个字段一条请求（不把整行回传，避免覆盖别的列）
export function setRootGuestVisible(id, guestVisible) {
  return request({
    url: BASE + '/roots/' + encodeURIComponent(id),
    method: 'put',
    data: { guestVisible: !!guestVisible },
    silent: true
  })
}
/* ========================================================================
   P5.80：产物根（kind=thumbs）子目录清单
   契约：
     GET /api/media/admin/roots/{id}/artifacts?refresh=true|false
       → { rootId, name, kind, path, exists, readable,
           dirs:[{ name, label, files, bytes, exists }]（固定 7 项：p v s pv pv2 frames avcrop）,
           unknown:[{ name, label, files, bytes, exists }]（白名单外的子目录）,
           total:{ files, bytes }, looseFiles, looseBytes,
           partial, partialReason, limits:{ maxFiles, maxMillis, maxDepth, cacheTtlMs },
           cached, cacheAgeMs, scannedAt, durationMs, note }
   语义：一个产物根包含全部派生资源。kind 不是 thumbs → 400（错误体 {error}）；id 不存在 → 404；
         根目录当前不可用（盘没挂）→ 200 + exists:false + note。统计带边界（20 万文件 / 8 秒 /
         6 层深），超限 partial=true 且已统计量仍是真数；结果缓存 60s，refresh=true 强制重扫。
   权限：media:admin:list（与 GET /roots 一致）。
   ======================================================================== */

export function getRootArtifacts(id, refresh, silent, signal) {
  return request({
    url: BASE + '/roots/' + encodeURIComponent(id) + '/artifacts',
    method: 'get',
    params: refresh ? { refresh: 'true' } : {},
    silent: silent !== false,
    timeout: 30000,
    signal: signal
  })
}
/* ---------------- 扫描入库（P5.91）：遍历某个库根目录写库 + 实时日志 + 取消 ----------------
   契约：
     POST /api/media/admin/scan                         { rootId, dryRun?, withVideo?, withPhoto?, limit?, force? }
                                                        → { jobId, command, startedAt, status, rootId, ... }
     GET  /api/media/admin/scan/jobs/active             → 任务视图 | null（进页面时接管正在跑的任务）
     GET  /api/media/admin/scan/jobs/{jobId}?tail=500   → { jobId, status, lines[], counters{videos,albums,photos,skipped,errors},
                                                          lineCount, warnings, startedAt, finishedAt, exitCode, reason, ... }
     POST /api/media/admin/scan/jobs/{jobId}/cancel     → 同一份视图（status=cancelled）
   权限：启动 / 取消 media:admin:edit（启动另接受 media:admin:scan）；读状态 media:admin:list。
   任务只存在后端内存：进程重启后旧 jobId 一律 404 —— 页面按「任务丢了」处理，不报红。 */
export function startScanIngest(body) {
  return request({
    url: BASE + '/scan',
    method: 'post',
    data: body || {},
    silent: true
  })
}

export function getScanIngestActive() {
  return request({
    url: BASE + '/scan/jobs/active',
    method: 'get',
    silent: true
  })
}

export function getScanIngestJob(jobId, tail) {
  return request({
    url: BASE + '/scan/jobs/' + encodeURIComponent(jobId),
    method: 'get',
    params: tail ? { tail: tail } : undefined,
    silent: true
  })
}

export function cancelScanIngest(jobId) {
  return request({
    url: BASE + '/scan/jobs/' + encodeURIComponent(jobId) + '/cancel',
    method: 'post',
    silent: true
  })
}

/* ---------------- P5.97：建根前预演 + 流水线单步重试 ----------------
   契约：
     POST /api/media/admin/scan/preview   { path }
       → { path, exists, readable, videos, albums, photos, files, bytes,
           ignored: { '.txt': 3, … }, ignoredTotal, walkTruncated, walkTruncatedReason,
           dryRunMs, estimateSeconds, command }
       只读（dry-run 不连库、不写库），因此接受一个**还没登记**的路径：
       新增库根表单填完路径就能看到「下面有多少东西」，不必先建根再回扫描页试。
       参数 media:admin:edit；路径不存在 / 不是目录 / 无权限 → 400（错误体是 {error}）。
     POST /api/media/admin/scan/jobs/{jobId}/retry?phase=scan|hash|meta|thumb|sprite|index
       → 同一份任务视图（该阶段重置为 pending，成功后自动接上后面没成功的阶段）
   两条都 silent：错误由页面就地展示（与扫描入库其它调用一致）。 */
export function previewScanRoot(path, signal) {
  return request({
    url: BASE + '/scan/preview',
    method: 'post',
    data: { path: path },
    silent: true,
    timeout: 200000,
    signal: signal
  })
}

export function retryScanIngestPhase(jobId, phase) {
  return request({
    url: BASE + '/scan/jobs/' + encodeURIComponent(jobId) + '/retry',
    method: 'post',
    params: { phase: phase },
    silent: true
  })
}
