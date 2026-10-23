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
// - gc 会真删孤儿派生文件，必须传 { confirm: true }，否则后端 400
// - limit 只对 thumb / sprite / preview 生效（0 或省略 = 不限），用于先小批量试跑
export function startScan(mode, options) {
  const data = { mode: mode || 'scan' }
  const extra = options || {}
  if (extra.confirm) {
    data.confirm = true
  }
  if (extra.limit) {
    data.limit = extra.limit
  }
  return request({
    url: BASE + '/scan',
    method: 'post',
    data: data
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
