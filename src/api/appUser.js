import request from '@/utils/request'

// 后端前缀：AppUserAdminController 映射在 /api/app/admin/users（P5.79 用户端账号审核）
const BASE = '/api/app/admin/users'

// 分页列表：status ∈ pending/approved/rejected（空=全部），keyword 匹配用户名/昵称
export function listAppUsers(query) {
  return request({
    url: BASE,
    method: 'get',
    params: query
  })
}

// 各状态数量（待审核角标 / 顶部提示）
export function getAppUserStats() {
  return request({
    url: BASE + '/stats',
    method: 'get'
  })
}

// 单个账号详情
export function getAppUser(id) {
  return request({
    url: BASE + '/' + id,
    method: 'get'
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
