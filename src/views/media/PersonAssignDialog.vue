<template>
  <!-- 人物归属（三个入口共用）：P6.218 拆分
       1. albumSingle  修改人物归属（单本相册 → 单个人物）
       2. videoMulti   视频人物（多选 + 每个选中的角色）
       3. albumMulti   相册人物（整本覆盖）
       子组件只负责选人与角色，写库与列表刷新留在页面。 -->
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    :width="kind === 'albumSingle' ? 'min(420px, 92vw)' : (kind === 'videoMulti' ? 'min(560px, 94vw)' : 'min(520px, 94vw)')"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
    @open="onOpen"
  >
    <!-- 单本相册改人物 -->
    <el-form v-if="kind === 'albumSingle'" :model="form" label-width="80px">
      <el-form-item label="相册">
        <span class="person-album">{{ targetText }}</span>
      </el-form-item>
      <el-form-item label="人物">
        <el-select v-model="form.personId" placeholder="请选择人物" style="width: 100%">
          <el-option label="（未归类 / 清空）" value="" />
          <el-option v-for="item in peopleOptions" :key="item.id" :label="item.name + ' (' + item.albumCount + ')'" :value="item.id" />
        </el-select>
      </el-form-item>
    </el-form>

    <template v-else>
      <p class="vp-target">{{ targetText }}</p>
      <el-alert v-if="pickError" :title="pickError" type="warning" :closable="false" show-icon class="vp-alert" />
      <el-select v-model="picked" multiple filterable clearable placeholder="选择人物（可多选）"
        :loading="pickLoading" :disabled="!!pickError" style="width: 100%">
        <el-option v-for="item in pickOptions" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>

      <div v-if="kind === 'videoMulti' && picked.length" class="vp-role-list">
        <div v-for="pid in picked" :key="'role-' + pid" class="vp-role-row">
          <span class="vp-role-name">{{ personNameOf(pid) }}</span>
          <el-input v-model="roles[pid]" maxlength="40" clearable placeholder="角色（选填，如 主角 / 配角）" />
        </div>
      </div>

      <p class="vp-tip">{{ tip }}</p>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取 消</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="kind !== 'albumSingle' && !!pickError"
        @click="submit"
        v-hasPermi="['media:admin:edit']"
      >{{ kind === 'albumSingle' ? '确 定' : '保 存' }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { listPersons } from '@/api/media'
import { errorText } from '@/utils/errorText'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** albumSingle | videoMulti | albumMulti */
  kind: { type: String, default: 'albumSingle' },
  /** 当前操作的行（视频或相册） */
  row: { type: Object, default: null },
  /** 单本相册改人物用的候选（带 albumCount） */
  peopleOptions: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const PERSON_PICK_NOT_READY = '人物列表暂不可用：/admin/persons 接口未就绪，稍后重试或联系管理员升级后端'

const pickOptions = ref([])
const pickLoading = ref(false)
const pickError = ref('')

const picked = ref([])
const roles = reactive({})
const form = reactive({ personId: '' })

const dialogTitle = computed(() => {
  if (props.kind === 'videoMulti') return '视频人物'
  if (props.kind === 'albumMulti') return '相册人物'
  return '修改人物归属'
})

const targetText = computed(() => {
  const row = props.row || {}
  if (props.kind === 'videoMulti') return row.title || row.relPath || String(row.id || '')
  return row.title || row.dir || String(row.id || '')
})

const tip = computed(() => (props.kind === 'videoMulti'
  ? '保存会整条覆盖该视频的人物集合与角色（不是增量追加）。'
  : '保存会整本覆盖该相册的人物集合；「改人物」按钮仍保留单本单人的旧写法。'))

function isNotFoundErr(err) {
  const status = err && err.response && err.response.status ? err.response.status : 0
  return status === 404 || status === 501 || status === 0
}

function unwrapPersonList(res) {
  const body = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res
  if (Array.isArray(body)) return body
  return (body && (body.rows || body.list || body.items || body.records)) || []
}

function loadPersonPickOptions(force) {
  if (pickLoading.value) return
  if (!force && pickOptions.value.length) return
  pickLoading.value = true
  pickError.value = ''
  listPersons({ page: 1, size: 200 }).then(res => {
    pickOptions.value = unwrapPersonList(res).filter(item => item && item.id != null)
    if (!pickOptions.value.length) {
      pickError.value = '还没有人物：先到「人物管理」新建，再回来关联'
    }
  }).catch(err => {
    pickOptions.value = []
    pickError.value = isNotFoundErr(err)
      ? PERSON_PICK_NOT_READY
      : ('人物列表加载失败：' + (errorText(err) || '请求失败，请确认后端已启动'))
  }).finally(() => { pickLoading.value = false })
}

function personNameOf(id) {
  const hit = pickOptions.value.find(item => String(item.id) === String(id))
  return hit ? hit.name : String(id)
}

/** 每次打开按行数据回填初始选择（与原实现一致） */
function onOpen() {
  const row = props.row || {}
  picked.value = []
  Object.keys(roles).forEach(k => { delete roles[k] })

  if (props.kind === 'albumSingle') {
    form.personId = row.personId === null || row.personId === undefined ? '' : row.personId
    return
  }
  if (props.kind === 'videoMulti') {
    ;(row.persons || []).forEach(item => {
      const pid = item && item.id !== undefined ? item.id : null
      if (pid === null) return
      picked.value.push(pid)
      if (item.role) roles[pid] = item.role
    })
    loadPersonPickOptions(false)
    return
  }
  if (Array.isArray(row.personIds)) picked.value = row.personIds.slice()
  else if (row.personId !== null && row.personId !== undefined && row.personId !== '') picked.value = [row.personId]
  loadPersonPickOptions(false)
}

function submit() {
  if (props.kind === 'albumSingle') {
    const personId = form.personId === '' || form.personId === null ? null : form.personId
    emit('confirm', { kind: props.kind, personId })
    return
  }
  if (props.kind === 'videoMulti') {
    const out = {}
    picked.value.forEach(id => {
      const role = (roles[id] || '').trim()
      if (role) out[id] = role
    })
    emit('confirm', { kind: props.kind, personIds: picked.value.slice(), roles: out })
    return
  }
  emit('confirm', { kind: props.kind, personIds: picked.value.slice() })
}
</script>

<style scoped>
.person-album { font-size: 13px; color: var(--el-text-color-regular); word-break: break-all; }
.vp-target { margin: 0 0 10px; font-size: 13px; color: var(--el-text-color-secondary); word-break: break-all; }
.vp-alert { margin-bottom: 10px; }
.vp-role-list { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; }
.vp-role-row { display: flex; align-items: center; gap: 8px; }
.vp-role-name { flex: 0 0 96px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vp-tip { margin: 10px 0 0; font-size: 12px; line-height: 1.6; color: var(--el-text-color-secondary); }
</style>
