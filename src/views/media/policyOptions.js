/* 站端编辑策略（三档）：与后端 GET/PUT /api/media/admin/edit-policy 对齐。
   抽成独立文件，供页面（显示当前档位文案）与弹窗组件共用。 */
export const POLICY_OPTIONS = [
  { value: 'off', label: '禁止编辑', desc: '站端所有编辑入口禁用：只能浏览，不能评分 / 打标签 / 加标记' },
  { value: 'local', label: '本地编辑', desc: '允许编辑，但只写访客自己的浏览器（localStorage），服务端数据不变' },
  { value: 'full', label: '完全编辑', desc: '允许编辑并写入服务端（匿名访客也能修改媒体库）' }
]

export function policyLabel(level) {
  const hit = POLICY_OPTIONS.find(opt => opt.value === level)
  return hit ? hit.label : level
}
