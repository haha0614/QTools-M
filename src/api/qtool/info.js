import request from '@/utils/request'

// 查询工具信息列表
export function listInfo(query) {
  return request({
    url: '/api/qtool/info/list',
    method: 'get',
    params: query
  })
}

// 查询工具信息详细
export function getInfo(id) {
  return request({
    url: '/api/qtool/info/' + id,
    method: 'get'
  })
}

// 新增工具信息
export function addInfo(data) {
  return request({
    url: '/api/qtool/info',
    method: 'post',
    data: data
  })
}

// 修改工具信息
export function updateInfo(data) {
  return request({
    url: '/api/qtool/info',
    method: 'put',
    data: data
  })
}

// 删除工具信息
export function delInfo(id) {
  return request({
    url: '/api/qtool/info/' + id,
    method: 'delete'
  })
}
