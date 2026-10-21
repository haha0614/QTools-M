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

// 触发重建索引（异步，同一时刻只允许 1 个）
export function startScan(type) {
  return request({
    url: BASE + '/scan',
    method: 'post',
    data: { type: type }
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
