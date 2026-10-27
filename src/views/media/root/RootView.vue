<!--
  RootView.vue —— 库根管理页的展示层（P5.78）
  纯展示：数据与状态全部来自 props，所有动作以事件交回 index.vue（不发请求、不改数据）。
  拆出来的理由与 studio/StudioView.vue 一致：三态（未就绪 / 出错 / 正常）与「列表 / 新增 / 编辑 /
  删除 / 行内开关」的结构可以单独渲染断言，取数与保存逻辑留在 index.vue。
  样式：只用 --el-* 变量（若依管理端主题），亮暗与窄屏通用；不引入任何新依赖。
-->
<template>
  <div class="app-container root-page" :data-state="state" :data-rows="rows.length">
    <div class="root-toolbar">
      <div class="root-toolbar-left">
        <span class="root-page-title">库根管理</span>
        <span class="root-page-sub">共 {{ rows.length }} 个库根{{ hiddenCount ? '（' + hiddenCount + ' 个仅登录可见）' : '' }}</span>
      </div>
      <div class="root-toolbar-right">
        <el-button icon="Refresh" :loading="loading" @click="emit('refresh')">刷新</el-button>
        <el-button type="primary" icon="Plus" @click="emit('create')" v-hasPermi="['media:admin:edit']">新增库根</el-button>
      </div>
    </div>

    <el-alert v-if="notReady" :title="notReady" type="warning" :closable="false" show-icon class="root-alert" />
    <el-alert v-else-if="pageError" :title="pageError" type="error" :closable="false" show-icon class="root-alert" />

    <el-table v-if="loading || rows.length" v-loading="loading" :data="rows" class="root-table"
      :row-class-name="rowClass">
      <el-table-column label="ID" prop="id" width="64" align="center" />
      <el-table-column label="名称" min-width="110" :show-overflow-tooltip="true">
        <template #default="scope">
          <span class="root-name">{{ scope.row.name || '—' }}</span>
          <el-tag v-if="scope.row.isDefault" size="small" type="success" class="root-badge">默认根</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="路径" min-width="220" :show-overflow-tooltip="true">
        <template #default="scope">
          <div class="root-path" :class="{ 'root-path-bad': !isReadable(scope.row) }">{{ scope.row.path || '—' }}</div>
          <div v-if="!isReadable(scope.row)" class="root-path-hint">目录不可读{{ scope.row.exists === false ? '（路径不存在）' : '（无读取权限）' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="86" align="center">
        <template #default="scope">
          <el-tag size="small" :type="scope.row.kind === 'root' ? 'primary' : 'info'">{{ kindText(scope.row.kind) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="未登录可见" width="106" align="center">
        <template #default="scope">
          <el-switch :model-value="scope.row.guestVisible !== false" :loading="togglingId === scope.row.id"
            :disabled="togglingId === scope.row.id" v-hasPermi="['media:admin:edit']"
            @update:model-value="(v) => emit('toggleGuest', { row: scope.row, value: v })" />
        </template>
      </el-table-column>
      <el-table-column label="可读" width="76" align="center">
        <template #default="scope">
          <el-tag :type="isReadable(scope.row) ? 'success' : 'danger'" size="small">{{ isReadable(scope.row) ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="条目数（视频 / 相册 / 照片）" width="186" align="center">
        <template #default="scope">
          <span class="root-counts">{{ toNum(scope.row.videoCount) }} / {{ toNum(scope.row.albumCount) }} / {{ toNum(scope.row.photoCount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="最后扫描" width="160" align="center">
        <template #default="scope">{{ scanText(scope.row) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="170" align="center" fixed="right" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-tooltip content="编辑（名称 / 路径 / 类型 / 未登录可见）" placement="top">
            <el-button link type="primary" icon="Edit" @click="emit('edit', scope.row)" v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
          <el-tooltip :content="defaultTip(scope.row)" placement="top">
            <el-button link type="warning" icon="Star" :disabled="true" v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
          <el-tooltip :content="hasRefs(scope.row) ? '有内容，删除前会二次确认' : '删除'" placement="top">
            <el-button link type="danger" icon="Delete" :loading="deletingId === scope.row.id"
              @click="emit('delete', scope.row)" v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && !notReady && !pageError && !rows.length"
      description="还没有库根（media_root 为空）：先点右上角「新增库根」" :image-size="60" />

    <p class="root-tip">
      「未登录可见」＝ 未登录访客（浏览器无有效 app token）能否看到这个根下的内容：
      关掉后它的视频 / 相册 / 图片不会出现在站端索引里，直接访问其资源一律 404；登录用户不受影响。
      开关<b>即点即存</b>，下一次请求即生效。
    </p>

    <el-dialog :model-value="formVisible" :title="form.id ? '编辑库根' : '新增库根'" width="min(560px, 94vw)" append-to-body
      @update:model-value="(v) => emit('update:formVisible', v)">
      <el-form :model="form" label-width="92px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="64" show-word-limit placeholder="展示用名称，如 主库 / 备份盘"
            @keyup.enter="emit('submit')" />
        </el-form-item>
        <el-form-item label="路径" required>
          <el-input v-model="form.path" placeholder="服务器上的绝对路径，如 E:/111/视频" />
          <div class="root-form-hint">必须当前就存在且是目录；同一路径只能登记一次。</div>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.kind" :disabled="!!form.id" class="root-form-select">
            <el-option label="媒体根（root）" value="root" />
            <el-option label="缩略图根（thumbs）" value="thumbs" />
            <el-option label="回收站根（trash）" value="trash" />
          </el-select>
          <div class="root-form-hint" v-if="form.id">类型只在新增时生效，后端改库根不接受 kind</div>
        </el-form-item>
        <el-form-item label="未登录可见">
          <el-switch v-model="form.guestVisible" />
          <div class="root-form-hint">关闭 = 仅登录可见：未登录访客在索引里看不到本根内容，直接访问其资源 404。</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="可选" />
        </el-form-item>
      </el-form>
      <p v-if="formError" class="root-form-error">{{ formError }}</p>
      <template #footer>
        <el-button @click="emit('update:formVisible', false)">取 消</el-button>
        <el-button type="primary" :loading="saving" @click="emit('submit')" v-hasPermi="['media:admin:edit']">保 存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** 当前列表：[{ id, name, path, kind, guestVisible, exists, readable, videoCount, albumCount, photoCount, isDefault }] */
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  /** 非空 → 走「接口未就绪」黄条 */
  notReady: { type: String, default: '' },
  /** 非空 → 走「加载失败」红条 */
  pageError: { type: String, default: '' },
  /** 「最后扫描时间」映射：{ [rootId]: 'yyyy-MM-dd HH:mm:ss' }（来自 /admin/watch，取不到就是空对象） */
  lastScanMap: { type: Object, default: () => ({}) },
  /** 正在切开关的行 id */
  togglingId: { type: [String, Number], default: null },
  deletingId: { type: [String, Number], default: null },
  formVisible: { type: Boolean, default: false },
  form: { type: Object, default: () => ({ id: null, name: '', path: '', kind: 'root', guestVisible: true, note: '' }) },
  saving: { type: Boolean, default: false },
  formError: { type: String, default: '' }
})

const emit = defineEmits([
  'refresh',
  'create',
  'edit',
  'delete',
  'submit',
  'toggleGuest',
  'update:formVisible'
])

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function isReadable(row) {
  return !!row && row.exists !== false && row.readable !== false
}

function kindText(kind) {
  if (kind === 'root') return '媒体根'
  if (kind === 'thumbs') return '缩略图'
  if (kind === 'trash') return '回收站'
  return kind || '—'
}

function scanText(row) {
  const value = props.lastScanMap[row && row.id]
  return value || '—'
}

function hasRefs(row) {
  return toNum(row && row.videoCount) + toNum(row && row.albumCount) + toNum(row && row.photoCount) > 0
}

function defaultTip(row) {
  return row && row.isDefault
    ? '当前已是默认根（kind=root 的 id 最小行）'
    : '设为默认根本期不支持：默认根由 media_root 里 kind=root 的最小 id 决定（扫描器 --root-id 缺省口径），改动需要调整 id 顺序'
}

/** 路径不可读的行整行标红（要求：「路径不存在的行标红并提示目录不可读」） */
function rowClass({ row }) {
  return isReadable(row) ? '' : 'root-row-bad'
}

const hiddenCount = computed(() => props.rows.filter(r => r && r.guestVisible === false).length)

/** 三态归一：not-ready > error > loading > ready > empty（顺序即优先级） */
const state = computed(() => {
  if (props.notReady) return 'not-ready'
  if (props.pageError) return 'error'
  if (props.loading) return 'loading'
  return props.rows.length ? 'ready' : 'empty'
})
</script>

<style scoped>
.root-page {
  padding-bottom: 8px;
}

.root-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.root-toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.root-page-title {
  font-size: 18px;
  font-weight: 600;
}

.root-page-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.root-toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.root-alert {
  margin-bottom: 12px;
}

.root-name {
  font-weight: 500;
}

.root-badge {
  margin-left: 6px;
}

.root-path {
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  word-break: break-all;
}

/* 路径不可读：红字 + 红底提示条（亮暗主题都用 --el-color-danger，不写死颜色） */
.root-path-bad {
  color: var(--el-color-danger);
  font-weight: 500;
}

.root-path-hint {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-color-danger);
}

.root-counts {
  font-variant-numeric: tabular-nums;
}

.root-tip {
  margin: 12px 0 4px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.root-form-hint {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.root-form-select {
  width: 100%;
}

.root-form-error {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--el-color-danger);
}

:deep(.root-row-bad) td {
  background: var(--el-color-danger-light-9, rgba(245, 108, 108, 0.08));
}

@media (max-width: 768px) {
  .root-toolbar-right {
    width: 100%;
  }

  .root-page-title {
    font-size: 16px;
  }
}
</style>
