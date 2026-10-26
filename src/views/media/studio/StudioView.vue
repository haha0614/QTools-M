<!--
  StudioView.vue —— 工作室管理页的展示层（P5-C）
  纯展示：数据与状态全部来自 props，所有动作以事件交回 index.vue（不发请求、不改数据）。
  拆出来的理由：三态（未就绪 / 出错 / 正常）与「列表 / 新建 / 编辑 / 删除 / 计数」这套结构与人物管理页一致，
  单独渲染即可断言三态，页面的取数与保存逻辑仍留在 index.vue。
  样式：--el-* 变量（若依管理端主题），亮暗与移动端通用。
-->
<template>
  <!-- data-state 把「当前处于哪一态」写进 DOM：未就绪 / 出错 / 加载中 / 空 / 有数据，
       便于 QA 与自动化断言三态（也方便排查线上「页面空白」到底是哪一态） -->
  <div class="app-container studio-page" :data-state="state" :data-rows="rows.length">
    <!-- 与人物管理同一套工具栏语义：标题左、操作右，移动端自动换行 -->
    <div class="studio-toolbar">
      <div class="studio-toolbar-left">
        <span class="studio-page-title">工作室管理</span>
        <span class="studio-page-sub">共 {{ total }} 个{{ q ? '（已按「' + q + '」过滤）' : '' }}</span>
      </div>
      <div class="studio-toolbar-right">
        <el-input :model-value="q" placeholder="名称 / 备注" clearable prefix-icon="Search" class="studio-search"
          @update:model-value="(v) => emit('update:q', v)" @keyup.enter="emit('search')" @clear="emit('search')" />
        <el-button type="primary" icon="Search" @click="emit('search')">搜索</el-button>
        <el-button icon="Refresh" :loading="loading" @click="emit('refresh')">刷新</el-button>
        <el-button icon="ArrowLeft" @click="emit('back')">返回人物管理</el-button>
        <el-button type="primary" icon="Plus" @click="emit('create')" v-hasPermi="['media:admin:edit']">新建工作室</el-button>
      </div>
    </div>

    <!-- 三态：① 未就绪（接口 404/501/连不上）② 出错 ③ 正常（列表 / 空） -->
    <el-alert v-if="notReady" :title="notReady" type="warning" :closable="false" show-icon class="studio-alert" />
    <el-alert v-else-if="pageError" :title="pageError" type="error" :closable="false" show-icon class="studio-alert" />

    <el-table v-if="loading || rows.length" v-loading="loading" :data="rows" class="studio-table">
      <el-table-column label="名称" min-width="160" :show-overflow-tooltip="true">
        <template #default="scope">
          <span class="studio-name">{{ scope.row.name || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="200" :show-overflow-tooltip="true">
        <template #default="scope">{{ textOr(scope.row.note) }}</template>
      </el-table-column>
      <el-table-column label="视频数" width="110" align="right">
        <template #default="scope">
          <el-tag :type="toNum(scope.row.videoCount) > 0 ? 'primary' : 'info'" size="small">{{ toNum(scope.row.videoCount) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="相册数" width="110" align="right">
        <template #default="scope">
          <el-tag :type="toNum(scope.row.albumCount) > 0 ? 'primary' : 'info'" size="small">{{ toNum(scope.row.albumCount) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" align="center" fixed="right" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-tooltip content="编辑" placement="top">
            <el-button link type="primary" icon="Edit" @click="emit('edit', scope.row)"
              v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
          <el-tooltip :content="hasRefs(scope.row) ? '有引用，需先解除关联' : '删除'" placement="top">
            <el-button link type="danger" icon="Delete" :loading="deletingId === scope.row.id"
              @click="emit('delete', scope.row)" v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && !notReady && !pageError && !rows.length"
      :description="q ? '没有匹配的工作室，换个关键词试试' : '还没有工作室，先点右上角「新建工作室」'" />

    <pagination v-show="total > 0" :total="total" :page-sizes="[10, 20, 50, 100]"
      :page="pageNum" :limit="pageSize" @pagination="(p) => emit('pagination', p)" />

    <el-dialog :model-value="formVisible" :title="form.id ? '编辑工作室' : '新建工作室'" width="min(480px, 94vw)" append-to-body
      @update:model-value="(v) => emit('update:formVisible', v)">
      <el-form :model="form" label-width="72px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="120" show-word-limit placeholder="工作室名（与站端 /media/studios 显示一致）"
            @keyup.enter="emit('submit')" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="选填" />
        </el-form-item>
      </el-form>
      <p class="studio-form-tip">名称需唯一；视频与工作室的归属在媒体库 / 视频接口里维护（PUT /admin/videos/{id}/studios）。</p>
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
  /** 当前页数据：{ id, name, note?, videoCount?, albumCount? }[] */
  rows: { type: Array, default: () => [] },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false },
  /** 非空 → 走「接口未就绪」黄条 */
  notReady: { type: String, default: '' },
  /** 非空 → 走「加载失败」红条 */
  pageError: { type: String, default: '' },
  /** 搜索词 */
  q: { type: String, default: '' },
  pageNum: { type: Number, default: 1 },
  pageSize: { type: Number, default: 10 },
  /** 新建 / 编辑对话框状态与表单对象（由父组件持有，双向绑定到 form 上） */
  formVisible: { type: Boolean, default: false },
  form: { type: Object, default: () => ({ id: null, name: '', note: '' }) },
  saving: { type: Boolean, default: false },
  deletingId: { type: [String, Number], default: null }
})

const emit = defineEmits([
  'update:q',
  'update:formVisible',
  'search',
  'refresh',
  'back',
  'create',
  'edit',
  'delete',
  'submit',
  'pagination'
])

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function textOr(v) {
  const s = v === null || v === undefined ? '' : String(v).trim()
  return s || '—'
}

function hasRefs(row) {
  return toNum(row && row.videoCount) + toNum(row && row.albumCount) > 0
}

/** 三态归一：not-ready > error > loading > ready > empty（顺序即优先级） */
const state = computed(() => {
  if (props.notReady) return 'not-ready'
  if (props.pageError) return 'error'
  if (props.loading) return 'loading'
  return props.rows.length ? 'ready' : 'empty'
})
</script>

<style scoped>
.studio-page {
  padding-bottom: 8px;
}

.studio-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}

.studio-toolbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.studio-page-title {
  font-size: 18px;
  font-weight: 600;
}

.studio-page-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.studio-toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.studio-search {
  width: 220px;
}

.studio-alert {
  margin-bottom: 12px;
}

.studio-name {
  font-weight: 500;
}

.studio-form-tip {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .studio-search {
    width: 160px;
  }

  .studio-toolbar-right {
    width: 100%;
  }
}
</style>
