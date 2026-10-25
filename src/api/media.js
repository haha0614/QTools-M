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
export function listRoots(silent) {
  return request({
    url: BASE + '/roots',
    method: 'get',
    silent: !!silent
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
export function getWatchStatus(silent) {
  return request({
    url: BASE + '/watch',
    method: 'get',
    silent: silent !== false
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
