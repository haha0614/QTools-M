<template>
  <div class="app-container app-user-page" data-testid="app-user-page">
    <div class="page-head">
      <div class="head-left">
        <h2 class="page-title">用户审核</h2>
        <el-alert
          v-if="stats.pending > 0"
          class="pending-alert"
          type="warning"
          :closable="false"
          show-icon
          data-testid="pending-tip"
          :title="'有 ' + stats.pending + ' 个账号等待审核，审核通过后才能登录'"
        />
        <span v-else class="pending-none" data-testid="pending-tip">当前没有待审核账号</span>
      </div>
      <div class="head-right">
        <el-button :loading="loading" @click="loadAll" data-testid="refresh-btn">刷新</el-button>
      </div>
    </div>

    <!-- 顶部状态筛选 + 搜索 -->
    <el-form :inline="true" class="filter-bar" @submit.prevent>
      <el-form-item label="状态">
        <el-select
          v-model="query.status"
          placeholder="全部"
          clearable
          class="status-select"
          data-testid="status-filter"
          @change="handleQuery"
        >
          <el-option label="全部" value="" />
          <el-option :label="'待审核（' + stats.pending + '）'" value="pending" />
          <el-option :label="'已通过（' + stats.approved + '）'" value="approved" />
          <el-option :label="'未通过（' + stats.rejected + '）'" value="rejected" />
        </el-select>
      </el-form-item>
      <el-form-item label="搜索">
        <el-input
          v-model="query.keyword"
          placeholder="用户名 / 昵称"
          clearable
          class="kw-input"
          data-testid="kw-input"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery" data-testid="search-btn">搜索</el-button>
        <el-button @click="handleReset" data-testid="reset-btn">重置</el-button>
      </el-form-item>
      <el-form-item>
        <el-button
          type="success"
          plain
          :disabled="selection.length === 0"
          :loading="batchLoading"
          data-testid="batch-approve"
          @click="handleBatchApprove"
        >
          批量通过{{ selection.length ? '（' + selection.length + '）' : '' }}
        </el-button>
      </el-form-item>
    </el-form>

    <!-- 列表 -->
    <el-table
      v-loading="loading"
      :data="rows"
      class="user-table"
      row-key="id"
      :empty-text="emptyText"
      @selection-change="(v) => (selection = v)"
    >
      <el-table-column type="selection" width="42" :selectable="(row) => row.status !== 'approved'" />
      <el-table-column label="用户名" min-width="130">
        <template #default="{ row }">
          <span class="u-name" :data-testid="'user-name-' + row.username">{{ row.username }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="nickname" label="昵称" min-width="120" show-overflow-tooltip />
      <el-table-column label="状态" width="96">
        <template #default="{ row }">
          <el-tag :type="tagType(row.status)" effect="light" :data-testid="'status-' + row.username">
            {{ row.statusText || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="160">
        <template #default="{ row }">
          <span class="mono">{{ row.createdAt || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="邀请码" width="118">
        <template #default="{ row }">
          <span class="mono">{{ row.inviteCode || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="150">
        <template #default="{ row }">
          <span class="note" :data-testid="'note-' + row.username">{{ row.reviewNote || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <el-button
            link
            type="success"
            :disabled="row.status === 'approved'"
            :data-testid="'approve-' + row.username"
            @click="handleApprove(row)"
          >
            通过
          </el-button>
          <el-button
            link
            type="danger"
            :disabled="row.status === 'rejected'"
            :data-testid="'reject-' + row.username"
            @click="openReject(row)"
          >
            拒绝
          </el-button>
          <el-button
            link
            type="warning"
            :disabled="row.status === 'pending'"
            :data-testid="'reset-' + row.username"
            @click="handleReset2Pending(row)"
          >
            撤销为待审核
          </el-button>
          <el-button link type="primary" :data-testid="'detail-' + row.username" @click="openDetail(row)">
            详情
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="query.page"
      v-model:page-size="query.size"
      :total="total"
      :page-sizes="[10, 20, 50]"
      layout="total, sizes, prev, pager, next, jumper"
      background
      data-testid="pager"
      @size-change="handleQuery"
      @current-change="loadList"
    />

    <!-- 拒绝原因 -->
    <el-dialog v-model="rejectVisible" title="拒绝注册" width="440px" append-to-body destroy-on-close>
      <div data-testid="reject-dialog">
        <p class="dlg-tip">
          正在拒绝账号 <b>{{ rejectRow && rejectRow.username }}</b>。原因会写进审核备注，用户登录时能看到。
        </p>
        <el-input
          v-model="rejectNote"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="拒绝原因（必填），例如：邀请码来源无法核对"
          data-testid="reject-note"
        />
        <p v-if="rejectError" class="dlg-error" data-testid="reject-error">{{ rejectError }}</p>
      </div>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button
          type="danger"
          :loading="rejectSaving"
          data-testid="reject-confirm"
          @click="submitReject"
        >
          确认拒绝
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" title="账号详情" size="420px" append-to-body destroy-on-close>
      <div v-if="detail" data-testid="detail-panel" class="detail-panel">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="用户名">{{ detail.username }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ detail.nickname }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="tagType(detail.status)" effect="light">{{ detail.statusText }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="邀请码">{{ detail.inviteCode || '—' }}</el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ detail.createdAt || '—' }}</el-descriptions-item>
          <el-descriptions-item label="最近登录">{{ detail.lastLoginAt || '—' }}</el-descriptions-item>
          <el-descriptions-item label="注册 IP">{{ detail.registerIp || '—' }}</el-descriptions-item>
          <el-descriptions-item label="审核备注">{{ detail.reviewNote || '—' }}</el-descriptions-item>
          <el-descriptions-item label="审核时间">{{ detail.reviewedAt || '—' }}</el-descriptions-item>
          <el-descriptions-item label="审核人 ID">{{ detail.reviewedBy || '—' }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-drawer>
  </div>
</template>

<script setup name="AppUserReview">
/**
 * 用户端账号审核（P5.79 管理端）
 *
 * 后端契约（AppUserAdminController，全部真实 HTTP 状态码 + {"error":"..."}）：
 *   GET  /api/app/admin/users?status=&keyword=&page=&size=  → { code, rows, total }
 *   GET  /api/app/admin/users/stats                        → { pending, approved, rejected, total }
 *   GET  /api/app/admin/users/{id}                         → 单行详情
 *   POST /api/app/admin/users/{id}/approve                 → 通过（幂等）
 *   POST /api/app/admin/users/{id}/reject { note }         → 拒绝
 *   PUT  /api/app/admin/users/{id}/status { status, note } → 通用（撤销为待审核）
 *   POST /api/app/admin/users/batch/approve { ids }        → 批量通过
 *
 * 分页与筛选都在服务端做（status / keyword 透传）；每次写操作后重新拉当前页 + 统计，
 * 保证「切完状态刷新保持」不是靠前端本地改行。
 */
import { computed, getCurrentInstance, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listAppUsers,
  getAppUserStats,
  getAppUser,
  approveAppUser,
  rejectAppUser,
  setAppUserStatus,
  batchApproveAppUsers
} from '@/api/appUser'

const { proxy } = getCurrentInstance()

const rows = ref([])
const total = ref(0)
const loading = ref(false)
const batchLoading = ref(false)
const selection = ref([])
const pageError = ref('')
const stats = reactive({ pending: 0, approved: 0, rejected: 0, total: 0 })
const query = reactive({ status: '', keyword: '', page: 1, size: 10 })

const rejectVisible = ref(false)
const rejectRow = ref(null)
const rejectNote = ref('')
const rejectError = ref('')
const rejectSaving = ref(false)

const detailVisible = ref(false)
const detail = ref(null)

const emptyText = computed(() => (pageError.value ? pageError.value : '没有符合条件的账号'))

function tagType(status) {
  if (status === 'pending') return 'warning'
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  return 'info'
}

/** 后端错误原文优先（{"error":"..."}），没拿到才用兜底文案 */
function errorText(err, fallback) {
  if (err && err.message) return String(err.message)
  return fallback
}

async function loadStats() {
  try {
    const res = await getAppUserStats()
    const data = res && res.data ? res.data : res
    if (data && typeof data === 'object') {
      stats.pending = Number(data.pending || 0)
      stats.approved = Number(data.approved || 0)
      stats.rejected = Number(data.rejected || 0)
      stats.total = Number(data.total || 0)
    }
  } catch (e) {
    // 统计失败不影响列表：只是顶部提示不显示
  }
}

async function loadList() {
  loading.value = true
  pageError.value = ''
  try {
    const res = await listAppUsers({
      status: query.status || undefined,
      keyword: query.keyword || undefined,
      page: query.page,
      size: query.size
    })
    const data = res && res.data ? res.data : res
    rows.value = Array.isArray(data.rows) ? data.rows : []
    total.value = Number(data.total || 0)
  } catch (e) {
    rows.value = []
    total.value = 0
    pageError.value = errorText(e, '列表加载失败，请稍后重试')
    ElMessage.error(pageError.value)
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  await Promise.all([loadList(), loadStats()])
}

function handleQuery() {
  query.page = 1
  loadList()
}

function handleReset() {
  query.status = ''
  query.keyword = ''
  query.page = 1
  loadAll()
}

/** 写操作后统一刷新：当前页 + 统计（不本地改行，保证刷新保持） */
async function afterWrite() {
  await loadAll()
}

async function handleApprove(row) {
  try {
    await approveAppUser(row.id)
    ElMessage.success('已通过：' + row.username)
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '通过失败'))
  }
}

function openReject(row) {
  rejectRow.value = row
  rejectNote.value = ''
  rejectError.value = ''
  rejectVisible.value = true
}

async function submitReject() {
  const note = (rejectNote.value || '').trim()
  if (!note) {
    rejectError.value = '请填写拒绝原因（用户登录时会看到）'
    return
  }
  rejectSaving.value = true
  rejectError.value = ''
  try {
    await rejectAppUser(rejectRow.value.id, note)
    rejectVisible.value = false
    ElMessage.success('已拒绝：' + rejectRow.value.username)
    await afterWrite()
  } catch (e) {
    rejectError.value = errorText(e, '拒绝失败')
  } finally {
    rejectSaving.value = false
  }
}

async function handleReset2Pending(row) {
  try {
    await ElMessageBox.confirm(
      '把账号 ' + row.username + ' 撤销为待审核？撤销后该账号立即无法登录。',
      '撤销为待审核',
      { type: 'warning', confirmButtonText: '撤销', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  try {
    await setAppUserStatus(row.id, 'pending')
    ElMessage.success('已撤销为待审核：' + row.username)
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '撤销失败'))
  }
}

async function handleBatchApprove() {
  const ids = selection.value.filter((r) => r.status !== 'approved').map((r) => r.id)
  if (!ids.length) return
  batchLoading.value = true
  try {
    const res = await batchApproveAppUsers(ids)
    const data = res && res.data ? res.data : res
    ElMessage.success('批量通过完成：' + ((data && data.changed) || 0) + ' 个')
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '批量通过失败'))
  } finally {
    batchLoading.value = false
  }
}

async function openDetail(row) {
  detail.value = row
  detailVisible.value = true
  try {
    const res = await getAppUser(row.id)
    const data = res && res.data ? res.data : res
    if (data && typeof data === 'object') detail.value = data
  } catch (e) {
    // 详情拿不到就展示列表行里的字段，不打断
  }
}

onMounted(() => {
  loadAll()
})
</script>

<style scoped lang="scss">
.app-user-page {
  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .page-title {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 600;
  }
  .pending-alert {
    max-width: 520px;
  }
  .pending-none {
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  .status-select {
    width: 180px;
  }
  .kw-input {
    width: 200px;
  }
  .user-table {
    width: 100%;
  }
  .mono {
    font-variant-numeric: tabular-nums;
  }
  .note {
    color: var(--el-text-color-regular);
  }
  .pager {
    margin-top: 12px;
    justify-content: flex-end;
  }
  .dlg-tip {
    margin: 0 0 10px;
    color: var(--el-text-color-regular);
  }
  .dlg-error {
    margin: 8px 0 0;
    color: var(--el-color-danger);
  }

  /* 窄屏：筛选条纵向排、表格横向滚动（不挤掉操作列） */
  @media (max-width: 768px) {
    .filter-bar {
      display: block;
    }
    .status-select,
    .kw-input {
      width: 100%;
    }
    .user-table {
      overflow-x: auto;
    }
    .pager {
      justify-content: center;
      flex-wrap: wrap;
    }
  }
}
</style>
