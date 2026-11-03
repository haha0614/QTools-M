/**
 * 选图状态机的行为测试（P6.241）
 * 跑法：npm run test:selection
 *
 * 为什么有它：Shift 连选这条路径在浏览器里我无法自动化验证（需要按住修饰键点击），
 * 而它已经出过一次真 bug ——「1~6 全选中 → Shift 点 1」只取消了第 1 张。
 * 这里用纯函数调用把这条路径钉死。
 */
import { ref, computed } from 'vue'
import { usePhotoSelection } from '../src/views/media/usePhotoSelection.js'

let failed = 0
function norm(v) {
  // 选中集合的**顺序无意义**（Set 插入顺序），比较前统一排序
  return Array.isArray(v) ? JSON.stringify(v.map(String).sort((x, y) => Number(x) - Number(y))) : JSON.stringify(v)
}

function check(name, actual, expected) {
  const a = norm(actual)
  const e = norm(expected)
  if (a === e) {
    console.log('  ✓ ' + name + ' → ' + a)
  } else {
    failed++
    console.error('  ✗ ' + name + ' → 实际 ' + a + '，期望 ' + e)
  }
}

const rows = ref(Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })))
const sortMode = ref(false)
const allPicked = computed(() => rows.value.every(p => false))
const api = usePhotoSelection({ rows, sortMode, onPreview: () => {}, allPicked })
const sel = () => api.photoSelected.value.slice()

console.log('Shift 连选：')
api.onPickClick({ id: 1 }, { shiftKey: false })
check('单击 1', sel(), ['1'])
api.onPickClick({ id: 6 }, { shiftKey: true })
check('Shift 点 6（连选 1~6）', sel(), ['1', '2', '3', '4', '5', '6'])
api.onPickClick({ id: 1 }, { shiftKey: true })
check('Shift 再点 1（整段取消）', sel(), [])
api.onPickClick({ id: 3 }, { shiftKey: false })
check('单击 3', sel(), ['3'])
api.onPickClick({ id: 5 }, { shiftKey: true })
check('Shift 点 5（连选 3~5）', sel(), ['3', '4', '5'])

console.log('全选 / 清除：')
api.toggleSelectAll()
check('全选本页', sel(), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
api.exitMultiMode()
check('退出多选（清空）', sel(), [])

if (failed) {
  console.error('[test:selection] 失败 ' + failed + ' 项')
  process.exit(1)
}
console.log('[test:selection] 全部通过')
