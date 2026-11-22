<template>
  <!-- 相册归属规则（P6.220 拆分）：列表 + 新增规则子弹窗，自身读写接口。
       规则决定扫描时一张照片归哪本册；命中不了就是「未归类」。 -->
  <el-dialog
    :model-value="modelValue"
    title="相册归属规则"
    width="min(1100px, 96vw)"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
    @open="loadRules"
  >
    <el-alert type="info" :closable="false" show-icon class="rule-tip"
      title="扫描只认领文件，不再按目录建册；一张照片归哪本册由这里的规则决定，命中不了就是「未归类」。">
      <template #default>
        <p>规则 = 目录（+ 可选文件名前缀）→ 某本册。优先级数字小的先匹配；停用等于临时关掉。</p>
      </template>
    </el-alert>
    <div class="rule-bar">
      <el-input v-model="keyword" placeholder="搜索目录 / 册名" clearable style="width: 220px" @keyup.enter="loadRules" />
      <el-button size="small" :loading="loading" data-testid="rule-refresh" @click="loadRules">搜索</el-button>
      <span class="uncat-spacer"></span>
      <span class="rule-count">共 {{ rows.length }} 条</span>
      <el-button size="small" type="primary" plain v-hasPermi="['media:admin:edit']"
        data-testid="rule-create" @click="openCreate">新增规则…</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" size="small" class="rule-table"
          :tooltip-options="{ appendTo: 'body' }">
      <el-table-column label="册" min-width="220">
        <template #default="scope">
          <span class="rule-album">{{ scope.row.albumTitle || scope.row.albumId }}</span>
          <span class="rule-sub">（{{ scope.row.albumPhotoCount }} 张）</span>
        </template>
      </el-table-column>
      <el-table-column label="目录" min-width="240" :show-overflow-tooltip="true">
        <template #default="scope">{{ scope.row.dirPattern || '（媒体根）' }}</template>
      </el-table-column>
      <el-table-column label="文件名前缀" width="120" align="center">
        <template #default="scope">{{ scope.row.filePrefix || '—' }}</template>
      </el-table-column>
      <el-table-column label="优先级" prop="priority" width="90" align="center" />
      <el-table-column label="状态" width="90" align="center">
        <template #default="scope">
          <el-tag size="small" :type="scope.row.enabled ? 'success' : 'info'">
            {{ scope.row.enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" align="center">
        <template #default="scope">
          <el-button link type="primary" size="small" v-hasPermi="['media:admin:edit']"
            :data-testid="'rule-toggle-' + scope.row.id"
            @click="toggle(scope.row)">{{ scope.row.enabled ? '停用' : '启用' }}</el-button>
          <el-button link type="danger" size="small" v-hasPermi="['media:admin:edit']"
            :data-testid="'rule-delete-' + scope.row.id" @click="remove(scope.row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !rows.length" description="还没有规则" />
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 新增规则：选册 + 目录 + 可选前缀 -->
  <el-dialog v-model="formVisible" title="新增归属规则" width="min(520px, 92vw)" append-to-body>
    <el-form label-width="92px">
      <el-form-item label="目标册">
        <el-select v-model="form.albumId" filterable placeholder="选择一本册" style="width: 100%">
          <el-option v-for="a in albumOptions" :key="a.id" :label="a.title + '（' + a.photoCount + ' 张）'" :value="a.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="目录">
        <el-select v-model="form.dirPattern" filterable allow-create default-first-option
          placeholder="相对目录（可从「未归类」的目录里挑）" style="width: 100%">
          <el-option v-for="d in dirOptions" :key="d.dir" :label="(d.dir || '（媒体根）') + ' · ' + d.photos + ' 张'" :value="d.dir" />
        </el-select>
      </el-form-item>
      <el-form-item label="文件名前缀">
        <el-input v-model="form.filePrefix" placeholder="留空 = 该目录全部文件；给了就只认以它开头的文件名" />
      </el-form-item>
      <el-form-item label="优先级">
        <el-input-number v-model="form.priority" :min="1" :max="9999" controls-position="right" />
        <span class="rule-sub">数字小的先匹配（带前缀的规则一般给 10）</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="formVisible = false">取 消</el-button>
      <el-button type="primary" :loading="saving" data-testid="rule-save" @click="save">保 存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { listAlbumRules, createAlbumRule, updateAlbumRule, deleteAlbumRule, listAlbumRuleDirs, listAlbums } from '@/api/media'
import { errorText } from '@/utils/errorText'

defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'changed'])

const { proxy } = getCurrentInstance()

const loading = ref(false)
const rows = ref([])
const keyword = ref('')

const formVisible = ref(false)
const saving = ref(false)
const albumOptions = ref([])
const dirOptions = ref([])
const form = reactive({ albumId: '', dirPattern: '', filePrefix: '', priority: 100 })

async function loadRules() {
  loading.value = true
  try {
    const res = await listAlbumRules({ keyword: keyword.value })
    rows.value = Array.isArray(res) ? res : ((res && res.rows) || [])
  } catch (e) {
    rows.value = []
    proxy.$modal.msgError('读取规则失败：' + errorText(e))
  } finally {
    loading.value = false
  }
}

async function toggle(row) {
  try {
    await updateAlbumRule(row.id, { enabled: !row.enabled })
    proxy.$modal.msgSuccess(row.enabled ? '已停用' : '已启用')
    loadRules()
    emit('changed')
  } catch (e) {
    proxy.$modal.msgError('操作失败：' + errorText(e))
  }
}

async function remove(row) {
  try {
    await proxy.$modal.confirm('删除这条规则？\n只影响以后扫描的自动归属，已经归好的照片不动。')
  } catch (e) {
    return
  }
  try {
    await deleteAlbumRule(row.id)
    proxy.$modal.msgSuccess('已删除')
    loadRules()
    emit('changed')
  } catch (e) {
    proxy.$modal.msgError('删除失败：' + errorText(e))
  }
}

async function openCreate() {
  form.albumId = ''
  form.dirPattern = ''
  form.filePrefix = ''
  form.priority = 100
  formVisible.value = true
  try {
    const res = await listAlbums({ pageNum: 1, pageSize: 200 })
    albumOptions.value = ((res && res.rows) || []).map(a => ({ id: a.id, title: a.title, photoCount: a.photoCount }))
  } catch (e) {
    albumOptions.value = []
  }
  try {
    const dirs = await listAlbumRuleDirs()
    dirOptions.value = Array.isArray(dirs) ? dirs : ((dirs && dirs.rows) || [])
  } catch (e) {
    dirOptions.value = []
  }
}

async function save() {
  if (!form.albumId) {
    proxy.$modal.msgWarning('先选一本目标册')
    return
  }
  saving.value = true
  try {
    await createAlbumRule({
      albumId: form.albumId,
      dirPattern: form.dirPattern,
      filePrefix: form.filePrefix,
      priority: Number(form.priority) || 100
    })
    proxy.$modal.msgSuccess('规则已保存')
    formVisible.value = false
    loadRules()
    emit('changed')
  } catch (e) {
    proxy.$modal.msgError('保存失败：' + errorText(e))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.rule-tip { margin-bottom: 10px; }
.rule-tip p { margin: 4px 0; line-height: 1.6; }
.rule-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rule-count { font-size: 12px; color: var(--el-text-color-secondary); }
.rule-album { font-weight: 600; }
.rule-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-left: 4px; }
</style>
