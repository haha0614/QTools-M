<template>
  <!-- 标签管理（含改名/改色子弹窗）。
       从 index.vue（4739 行）整体拆出，P6.216：标签字典、父级推导、增删改都在这里，
       页面只保留 v-model 开关；数据变化后 emit('changed') 让页面刷新筛选下拉与统计。 -->
  <el-dialog
    :model-value="modelValue"
    title="标签管理"
    width="min(900px, 96vw)"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
    @open="loadTags"
  >
    <div class="tag-create">
      <el-input v-model="tagForm.name" placeholder="标签名称（1-32 字符）" clearable maxlength="32" show-word-limit class="tag-create-name"
        @keyup.enter="submitCreateTag" />
      <el-color-picker v-model="tagForm.color" title="标签颜色（可留空）" />
      <span class="tag-create-color">{{ tagForm.color || '不设颜色' }}</span>
      <el-button type="primary" icon="Plus" :loading="tagCreating" @click="submitCreateTag" v-hasPermi="['media:admin:edit']">新建</el-button>
    </div>

    <div class="tag-filter">
      <el-input v-model="tagQuery.keyword" placeholder="搜索名称 / 颜色" clearable prefix-icon="Search" class="tag-filter-input"
        @input="handleTagFilter" @clear="handleTagFilter" />
      <span class="tag-filter-count">共 {{ filteredTags.length }} 个标签 / 未过滤 {{ tagList.length }} 个</span>
      <el-button icon="Refresh" :loading="tagLoading" @click="loadTags">刷新</el-button>
    </div>

    <el-alert v-if="tagError" :title="tagError" type="error" :closable="false" show-icon class="tag-error" />
    <el-table v-if="tagLoading || tagPageList.length" v-loading="tagLoading" :data="tagPageList" class="media-table">
      <el-table-column label="名称" prop="name" min-width="200" :show-overflow-tooltip="true" />
      <el-table-column label="父标签" width="140" :show-overflow-tooltip="true">
        <template #default="scope">{{ tagParentLabel(scope.row) }}</template>
      </el-table-column>
      <el-table-column label="颜色" width="150" align="center">
        <template #default="scope">
          <span class="tag-swatch" :class="{ 'tag-swatch-empty': !scope.row.color }"
            :style="{ background: scope.row.color || 'transparent' }"></span>
          <span class="tag-color-text">{{ scope.row.color || '未设置' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="使用数" width="90" align="center">
        <template #default="scope">
          <el-tag :type="(scope.row.useCount || 0) > 0 ? 'primary' : 'info'" size="small">{{ scope.row.useCount || 0 }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" align="center" fixed="right">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="openTagEdit(scope.row)"
            v-hasPermi="['media:admin:edit']">改名/改色</el-button>
          <el-button link type="danger" icon="Delete" :loading="tagDeletingId === scope.row.id"
            @click="handleDeleteTag(scope.row)" v-hasPermi="['media:admin:edit']">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty :description="tagList.length ? '没有匹配的标签，换个关键词试试' : '还没有标签，先在上方新建一个'"
      v-if="!tagLoading && !tagError && !tagPageList.length" />
    <pagination v-show="filteredTags.length > tagQuery.pageSize" :total="filteredTags.length" :page-sizes="[20, 50, 100]"
      v-model:page="tagQuery.pageNum" v-model:limit="tagQuery.pageSize" />
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关 闭</el-button>
    </template>
  </el-dialog>

  <!-- 标签改名 / 改色：PATCH /api/media/admin/tags/{id} -->
  <el-dialog v-model="tagEditVisible" title="编辑标签" width="min(420px, 92vw)" append-to-body>
    <el-form :model="tagEditForm" label-width="72px">
      <el-form-item label="名称">
        <el-input v-model="tagEditForm.name" maxlength="32" show-word-limit placeholder="标签名称（1-32 字符）"
          @keyup.enter="submitTagEdit" />
      </el-form-item>
      <el-form-item label="颜色">
        <el-color-picker v-model="tagEditForm.color" />
        <span class="tag-create-color">{{ tagEditForm.color || '不设颜色' }}</span>
      </el-form-item>
      <el-form-item label="父标签">
        <el-select v-model="tagEditForm.parentId" clearable filterable placeholder="顶级标签（无父级）" style="width: 100%">
          <el-option label="（顶级标签）" :value="null" />
          <el-option v-for="opt in tagParentOptions" :key="'p-' + opt.id" :label="opt.label" :value="opt.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <p class="tag-edit-tip">改名会同步到所有已关联该标签的视频；改成已存在的名称会被拒绝。</p>
    <template #footer>
      <el-button @click="tagEditVisible = false">取 消</el-button>
      <el-button type="primary" :loading="tagEditSaving" @click="submitTagEdit" v-hasPermi="['media:admin:edit']">保 存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { listTags, createTag, updateTag, deleteTag } from '@/api/media'
import { errorText } from '@/utils/errorText'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'changed'])

const { proxy } = getCurrentInstance()

const TAG_NAME_MAX = 32

const tagVisible = computed(() => props.modelValue)
const tagLoading = ref(false)
const tagError = ref('')
const tagList = ref([])
const tagCreating = ref(false)
const tagDeletingId = ref(null)
const tagQuery = reactive({ keyword: '', pageNum: 1, pageSize: 20 })
const tagForm = reactive({ name: '', color: null })

const tagEditVisible = ref(false)
const tagEditSaving = ref(false)
const tagEditForm = reactive({ id: null, name: '', color: null, parentId: null })

const filteredTags = computed(() => {
  const kw = (tagQuery.keyword || '').trim().toLowerCase()
  if (!kw) return tagList.value
  return tagList.value.filter(item => {
    const name = (item.name || '').toLowerCase()
    const color = (item.color || '').toLowerCase()
    return name.indexOf(kw) > -1 || color.indexOf(kw) > -1
  })
})

const tagPageList = computed(() => {
  const start = (tagQuery.pageNum - 1) * tagQuery.pageSize
  return filteredTags.value.slice(start, start + tagQuery.pageSize)
})

/* ------------------------------------------------------ 标签父级推导 */
function tagChildrenMap(list) {
  const map = new Map()
  ;(list || []).forEach(item => {
    if (!item || item.id == null) return
    const key = item.parentId === null || item.parentId === undefined ? '' : String(item.parentId)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  })
  return map
}

function collectDescendantIds(list, rootId) {
  const childrenOf = tagChildrenMap(list)
  const out = new Set()
  const stack = [String(rootId)]
  while (stack.length) {
    const current = stack.pop()
    ;(childrenOf.get(current) || []).forEach(child => {
      const cid = String(child.id)
      if (out.has(cid)) return
      out.add(cid)
      stack.push(cid)
    })
  }
  return out
}

function tagDepthOf(id, list) {
  let depth = 0
  let current = (list || []).find(item => String(item.id) === String(id))
  let guard = 0
  while (current && current.parentId !== null && current.parentId !== undefined && guard < 32) {
    current = (list || []).find(item => String(item.id) === String(current.parentId))
    depth += 1
    guard += 1
  }
  return depth
}

const tagParentOptions = computed(() => {
  const list = tagList.value.filter(item => item && item.id != null)
  const banned = new Set()
  if (tagEditForm.id !== null && tagEditForm.id !== undefined) {
    banned.add(String(tagEditForm.id))
    collectDescendantIds(list, tagEditForm.id).forEach(id => banned.add(id))
  }
  return list
    .filter(item => !banned.has(String(item.id)))
    .map(item => ({
      id: item.id,
      label: (item.path ? String(item.path) : '— '.repeat(tagDepthOf(item.id, list)) + (item.name || String(item.id)))
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-Hans-CN'))
})

/* 「父标签」列：注意后端返回的 path 是**自己**的完整路径（顶层→自身），
   直接拿来当父标签会显示成"插入 → 插入"（实测如此）。这里改成按 parentId 找父级，
   有父级就用父级的 path，没有父级就是「顶级」。 */
function tagParentLabel(row) {
  if (!row) return '顶级'
  if (row.parentId === null || row.parentId === undefined) return '顶级'
  const parent = tagList.value.find(item => String(item.id) === String(row.parentId))
  if (!parent) return '#' + row.parentId + '（已删除）'
  return parent.path ? String(parent.path) : (parent.name || String(parent.id))
}

/* ------------------------------------------------------ 数据 */
function loadTags() {
  tagLoading.value = true
  tagError.value = ''
  listTags().then(res => {
    tagList.value = Array.isArray(res) ? res : []
    const maxPage = Math.max(1, Math.ceil(filteredTags.value.length / tagQuery.pageSize))
    if (tagQuery.pageNum > maxPage) tagQuery.pageNum = maxPage
  }).catch(err => {
    tagList.value = []
    tagError.value = '标签加载失败：' + (errorText(err) || '请求失败，请确认后端已启动')
  }).finally(() => {
    tagLoading.value = false
  })
}

function handleTagFilter() {
  tagQuery.pageNum = 1
}

function isConflict(err) {
  return !!(err && err.response && err.response.status === 409)
}

function submitCreateTag() {
  const name = (tagForm.name || '').trim()
  if (!name) {
    proxy.$modal.msgWarning('请填写标签名称')
    return
  }
  if (name.length > TAG_NAME_MAX) {
    proxy.$modal.msgWarning('标签名最长 ' + TAG_NAME_MAX + ' 个字符')
    return
  }
  const color = tagForm.color ? String(tagForm.color).trim() : ''
  tagCreating.value = true
  createTag({ name: name, color: color }).then(res => {
    if (res && res.created === false) {
      proxy.$modal.msgWarning('标签「' + (res.name || name) + '」已存在，已复用（颜色未改动）')
    } else {
      proxy.$modal.msgSuccess('标签「' + ((res && res.name) || name) + '」已创建')
    }
    tagForm.name = ''
    tagForm.color = null
    tagQuery.pageNum = 1
    loadTags()
    emit('changed')
  }).catch(err => {
    proxy.$modal.notifyError({ title: '新建标签失败', message: errorText(err) || '请求失败，请查看后端日志', duration: 8000 })
  }).finally(() => {
    tagCreating.value = false
  })
}

function handleDeleteTag(row) {
  const used = row.useCount || 0
  const tip = used > 0
    ? '删除标签「' + row.name + '」会同时解除 ' + used + ' 个视频的关联，且不可撤销。确认删除？'
    : '删除标签「' + row.name + '」？当前没有视频使用它。'
  proxy.$modal.confirm(tip, '删除标签', { confirmButtonText: '确认删除', type: 'error' }).then(() => {
    tagDeletingId.value = row.id
    return deleteTag(row.id).then(res => {
      const unlinked = res && typeof res.unlinked === 'number' ? res.unlinked : 0
      proxy.$modal.msgSuccess(unlinked > 0 ? '已删除标签，同时解除 ' + unlinked + ' 个视频的关联' : '已删除标签')
      loadTags()
      emit('changed')
    }).catch(err => {
      proxy.$modal.notifyError({ title: '删除标签失败', message: errorText(err) || '请求失败，请查看后端日志', duration: 8000 })
    }).finally(() => {
      tagDeletingId.value = null
    })
  }).catch(() => {})
}

function openTagEdit(row) {
  if (!row || row.id == null) return
  tagEditForm.id = row.id
  tagEditForm.name = row.name || ''
  tagEditForm.color = row.color || null
  tagEditForm.parentId = row.parentId === undefined ? null : row.parentId
  tagEditVisible.value = true
}

function submitTagEdit() {
  const name = (tagEditForm.name || '').trim()
  if (!name) {
    proxy.$modal.msgWarning('请填写标签名称')
    return
  }
  if (name.length > TAG_NAME_MAX) {
    proxy.$modal.msgWarning('标签名最长 ' + TAG_NAME_MAX + ' 个字符')
    return
  }
  if (tagEditSaving.value) return
  const color = tagEditForm.color ? String(tagEditForm.color).trim() : ''
  const parentId = tagEditForm.parentId === undefined ? null : tagEditForm.parentId
  tagEditSaving.value = true
  updateTag(tagEditForm.id, { name: name, color: color, parentId: parentId }).then(() => {
    proxy.$modal.msgSuccess('标签已更新')
    tagEditVisible.value = false
    loadTags()
    emit('changed')
  }).catch(err => {
    proxy.$modal.notifyError({
      title: isConflict(err) ? '标签名称已存在' : '更新标签失败',
      message: isConflict(err) ? '换一个名称再试，或先删除同名标签' : (errorText(err) || '请求失败，请查看后端日志'),
      duration: 8000
    })
  }).finally(() => {
    tagEditSaving.value = false
  })
}

defineExpose({ loadTags })
</script>

<style scoped>
.tag-create { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.tag-create-name { flex: 1 1 auto; }
.tag-create-color { font-size: 12px; color: var(--el-text-color-secondary); min-width: 64px; }
.tag-filter { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.tag-filter-input { flex: 0 0 240px; }
.tag-filter-count { font-size: 12px; color: var(--el-text-color-secondary); margin-left: auto; }
.tag-error { margin-bottom: 10px; }
.tag-swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; vertical-align: -2px; margin-right: 6px; border: 1px solid var(--el-border-color); }
.tag-swatch-empty { background-image: linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%), linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%); background-size: 8px 8px; background-position: 0 0, 4px 4px; }
.tag-color-text { font-size: 12px; color: var(--el-text-color-secondary); }
.tag-edit-tip { font-size: 13px; color: var(--el-text-color-regular); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
