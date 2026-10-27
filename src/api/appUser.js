import request from '@/utils/request'

// 后端前缀：AppUserAdminController 映射在 /api/app/admin/users（P5.79 审核 → P5.81 用户管理）
const BASE = '/api/app/admin/users'

// 分页列表：status ∈ pending/approved/rejected/banned（空=全部），keyword 匹配用户名/昵称
export function listAppUsers(query) {
  return request({
    url: BASE,
    method: 'get',
    params: query
  })
}

// 统计：total / pending / approved / rejected / banned / newToday / activeRecently
export function getAppUserStats() {
  return request({
    url: BASE + '/stats',
    method: 'get'
  })
}

// 单个账号详情（含审核记录 / 封禁字段 / 登录身份 / 收藏数）
export function getAppUser(id) {
  return request({
    url: BASE + '/' + id,
    method: 'get'
  })
}

// 改资料：只改传入字段（nickname / avatar / reviewNote）
export function updateAppUser(id, data) {
  return request({
    url: BASE + '/' + id,
    method: 'put',
    data
  })
}

// 重置密码：password 为空则后端生成随机密码并一次性返回
export function resetAppUserPassword(id, password) {
  return request({
    url: BASE + '/' + id + '/reset-password',
    method: 'post',
    data: { password: password || undefined }
  })
}

// 封禁（独立于审核状态）：reason 会回显到登录/接口拒绝文案
export function banAppUser(id, reason) {
  return request({
    url: BASE + '/' + id + '/ban',
    method: 'post',
    data: { reason }
  })
}

// 解封：回到封禁前的审核态
export function unbanAppUser(id) {
  return request({
    url: BASE + '/' + id + '/unban',
    method: 'post'
  })
}

// 真删除：必须带 confirm=1（防误删），后端返回被删除的用户名
export function deleteAppUser(id) {
  return request({
    url: BASE + '/' + id,
    method: 'delete',
    params: { confirm: 1 }
  })
}

// 通过（后端幂等：已是 approved 时返回当前状态 + changed:false）
export function approveAppUser(id) {
  return request({
    url: BASE + '/' + id + '/approve',
    method: 'post'
  })
}

// 拒绝：note = 拒绝原因（可空，但页面要求填）
export function rejectAppUser(id, note) {
  return request({
    url: BASE + '/' + id + '/reject',
    method: 'post',
    data: { note }
  })
}

// 通用改状态：撤销为待审核用 pending
export function setAppUserStatus(id, status, note) {
  return request({
    url: BASE + '/' + id + '/status',
    method: 'put',
    data: { status, note }
  })
}

// 批量通过（多选行）
export function batchApproveAppUsers(ids) {
  return request({
    url: BASE + '/batch/approve',
    method: 'post',
    data: { ids }
  })
}

// 批量封禁（多选行）
export function batchBanAppUsers(ids, reason) {
  return request({
    url: BASE + '/batch/ban',
    method: 'post',
    data: { ids, reason }
  })
}

// 批量解封（多选行）
export function batchUnbanAppUsers(ids) {
  return request({
    url: BASE + '/batch/unban',
    method: 'post',
    data: { ids }
  })
}
