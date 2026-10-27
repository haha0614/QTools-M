<template>
  <div class="app-container app-user-page" data-testid="app-user-page">
    <div class="page-head">
      <div class="head-left">
        <h2 class="page-title">用户管理</h2>
        <p class="page-sub">用户端账号（独立于后台 sys_user）：资料 / 密码 / 封禁 / 删除</p>
      </div>
      <div class="head-right">
        <el-button :loading="loading" :size="isNarrow ? 'small' : 'default'" @click="loadAll" data-testid="refresh-btn">
          刷新
        </el-button>
      </div>
    </div>

    <!-- 统计卡片：点卡片 = 按该状态筛选（再点一次回到全部） -->
    <div class="stats-row" data-testid="stats-row">
      <div
        v-for="card in statCards"
        :key="card.key"
        class="stat-card"
        :class="[card.tone, { active: query.status === card.key }]"
        :data-testid="'stat-' + (card.key || 'total')"
        @click="filterByCard(card.key)"
      >
        <span class="stat-value" :data-testid="'stat-value-' + (card.key || 'total')">{{ stats[card.field] }}</span>
        <span class="stat-label">{{ card.label }}</span>
      </div>
    </div>

    <!-- 筛选 + 搜索 + 批量操作 -->
    <el-form :inline="true" class="filter-bar" @submit.prevent>
      <el-form-item label="状态">
        <el-select
          v-model="query.status"
          placeholder="全部"
          class="status-select"
          data-testid="status-filter"
          @change="handleQuery"
        >
          <el-option label="全部" value="" />
          <el-option :label="'待审核（' + stats.pending + '）'" value="pending" />
          <el-option :label="'正常（' + stats.approved + '）'" value="approved" />
          <el-option :label="'已拒绝（' + stats.rejected + '）'" value="rejected" />
          <el-option :label="'已封禁（' + stats.banned + '）'" value="banned" />
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
      <el-form-item class="batch-bar">
        <el-button
          type="success"
          plain
          size="small"
          :disabled="selection.length === 0"
          :loading="batchLoading"
          data-testid="batch-approve"
          @click="handleBatchApprove"
        >
          批量通过{{ selection.length ? '（' + selection.length + '）' : '' }}
        </el-button>
        <el-button
          type="warning"
          plain
          size="small"
          :disabled="selection.length === 0"
          :loading="batchLoading"
          data-testid="batch-ban"
          @click="handleBatchBan"
        >
          批量封禁
        </el-button>
        <el-button
          plain
          size="small"
          :disabled="selection.length === 0"
          :loading="batchLoading"
          data-testid="batch-unban"
          @click="handleBatchUnban"
        >
          批量解封
        </el-button>
      </el-form-item>
    </el-form>

    <el-table
      v-loading="loading"
      :data="rows"
      class="user-table"
      row-key="id"
      :empty-text="emptyText"
      @selection-change="(v) => (selection = v)"
    >
      <el-table-column type="selection" width="36" />
      <el-table-column label="ID" width="40">
        <template #default="{ row }">
          <span class="mono" :data-testid="'user-id-' + row.username">{{ row.id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="用户名" min-width="80" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="u-name" :data-testid="'user-name-' + row.username">{{ row.username }}</span>
        </template>
      </el-table-column>
      <el-table-column label="昵称" width="132" show-overflow-tooltip>
        <template #default="{ row }">
          <span :data-testid="'nickname-' + row.username">{{ row.nickname || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="68">
        <template #default="{ row }">
          <el-tag :type="tagType(row)" effect="light" :data-testid="'status-' + row.username">
            {{ row.badgeText || row.statusText || row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <!-- P5.89：角色列（两档）—— 行内切换走 PUT /api/app/admin/users/{id} {role}（需 app:user:edit） -->
      <el-table-column label="角色" width="118">
        <template #default="{ row }">
          <el-select
            :model-value="row.role || 'user'"
            size="small"
            class="role-select"
            :data-testid="'role-' + row.username"
            :data-role-value="row.role || 'user'"
            @change="(v) => handleRoleChange(row, v)"
          >
            <el-option label="普通用户" value="user" />
            <el-option label="站长" value="owner" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="收藏数" width="58" align="right">
        <template #default="{ row }">
          <span class="num" :data-testid="'favorite-' + row.username">{{ showCount(row.favoriteCount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="播放列表数" width="88" align="right">
        <template #default="{ row }">
          <span class="num" :data-testid="'playlist-' + row.username">{{ showCount(row.playlistCount) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="封禁原因" min-width="84" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="ban-reason" :data-testid="'banreason-' + row.username">{{ row.bannedReason || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="84">
        <template #default="{ row }">
          <span class="mono dt" :data-testid="'created-' + row.username">{{ row.createdAt || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="84">
        <template #default="{ row }">
          <span class="mono dt" :data-testid="'lastlogin-' + row.username">{{ row.lastLoginAt || '—' }}</span>
        </template>
      </el-table-column>
      <!-- 操作列：一行等宽按钮（详情/通过/拒绝/封禁·解封/更多），次要且低频的操作收进「更多」 -->
      <el-table-column label="操作" width="300" :fixed="isNarrow ? false : 'right'" class-name="ops-column">
        <template #default="{ row }">
          <div class="ops-row" :data-testid="'ops-' + row.username">
            <el-button class="op-btn" size="small" :data-testid="'detail-' + row.username" @click="openDetail(row)">
              详情
            </el-button>
            <el-button
              class="op-btn"
              size="small"
              type="success"
              plain
              :disabled="row.status === 'approved'"
              :data-testid="'approve-' + row.username"
              @click="handleApprove(row)"
            >
              通过
            </el-button>
            <el-button
              class="op-btn"
              size="small"
              type="warning"
              plain
              :disabled="row.status === 'rejected'"
              :data-testid="'reject-' + row.username"
              @click="openReject(row)"
            >
              拒绝
            </el-button>
            <el-button
              class="op-btn"
              size="small"
              :type="row.banned ? 'success' : 'danger'"
              plain
              :data-testid="(row.banned ? 'unban-' : 'ban-') + row.username"
              @click="row.banned ? handleUnban(row) : openBan(row)"
            >
              {{ row.banned ? '解封' : '封禁' }}
            </el-button>
            <el-dropdown trigger="click" class="op-more" @command="(cmd) => handleRowCommand(cmd, row)">
              <el-button class="op-btn" size="small" :data-testid="'more-' + row.username">
                更多<el-icon class="op-caret"><arrow-down /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit" :data-testid="'edit-' + row.username">编辑资料</el-dropdown-item>
                  <el-dropdown-item command="resetPwd" :data-testid="'resetpwd-' + row.username">重置密码</el-dropdown-item>
                  <el-dropdown-item command="pending" :disabled="row.status === 'pending'" :data-testid="'pending-' + row.username">
                    撤销为待审核
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided :data-testid="'delete-' + row.username">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="query.page"
      v-model:page-size="query.size"
      :total="total"
      :page-sizes="[10, 20, 50]"
      :layout="isNarrow ? 'total, prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
      background
      data-testid="pager"
      @size-change="handleQuery"
      @current-change="loadList"
    />

    <!-- 拒绝原因 -->
    <el-dialog v-model="rejectVisible" title="拒绝注册" :width="dialogWidth" append-to-body destroy-on-close>
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
        <el-button type="danger" :loading="rejectSaving" data-testid="reject-confirm" @click="submitReject">
          确认拒绝
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑资料 -->
    <el-dialog v-model="editVisible" title="编辑资料" :width="dialogWidth" append-to-body destroy-on-close>
      <div data-testid="edit-dialog">
        <p class="dlg-tip">正在编辑 <b>{{ editRow && editRow.username }}</b>（用户名是登录名，不能在这里改）。</p>
        <el-form label-width="76px" label-position="top">
          <el-form-item label="昵称">
            <el-input v-model="editForm.nickname" maxlength="64" placeholder="展示用昵称" data-testid="edit-nickname" />
          </el-form-item>
          <el-form-item label="头像 URL">
            <el-input v-model="editForm.avatar" placeholder="https://… （留空 = 清空头像）" data-testid="edit-avatar" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="editForm.reviewNote"
              type="textarea"
              :rows="2"
              maxlength="200"
              show-word-limit
              placeholder="管理员备注（仅后台可见，留空 = 清空）"
              data-testid="edit-note"
            />
          </el-form-item>
        </el-form>
        <p v-if="editError" class="dlg-error" data-testid="edit-error">{{ editError }}</p>
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" data-testid="edit-save" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="pwdVisible" title="重置密码" :width="dialogWidth" append-to-body destroy-on-close>
      <div data-testid="pwd-dialog">
        <p class="dlg-tip">
          正在重置 <b>{{ pwdRow && pwdRow.username }}</b> 的密码。重置后旧密码立即失效，该账号所有已登录会话一并下线。
        </p>
        <el-form label-position="top">
          <el-form-item label="新密码（留空 = 自动生成随机密码）">
            <el-input v-model="pwdInput" maxlength="64" show-password placeholder="8~64 位，须含字母和数字" data-testid="pwd-input" />
          </el-form-item>
        </el-form>
        <div v-if="pwdResult" class="pwd-result" data-testid="pwd-result">
          <p class="pwd-result-title">新密码（只显示这一次，请立即复制）：</p>
          <div class="pwd-result-row">
            <code :data-testid="'pwd-value-' + pwdRow.username">{{ pwdResult }}</code>
            <el-button size="small" type="primary" plain data-testid="pwd-copy" @click="copyPassword">复制</el-button>
          </div>
          <p class="pwd-hint">会话已撤销 {{ pwdRevoked }} 个；关闭弹窗后无法再次查看该密码。</p>
        </div>
        <p v-if="pwdError" class="dlg-error" data-testid="pwd-error">{{ pwdError }}</p>
      </div>
      <template #footer>
        <el-button @click="pwdVisible = false">关闭</el-button>
        <el-button type="primary" :loading="pwdSaving" data-testid="pwd-confirm" @click="submitResetPwd">
          {{ pwdResult ? '再次重置' : '确认重置' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 封禁 -->
    <el-dialog v-model="banVisible" title="封禁账号" :width="dialogWidth" append-to-body destroy-on-close>
      <div data-testid="ban-dialog">
        <p class="dlg-tip">
          正在封禁 <b>{{ banRow && banRow.username }}</b>。封禁与审核状态互相独立：解封后会回到封禁前的审核状态。
        </p>
        <el-input
          v-model="banReason"
          type="textarea"
          :rows="3"
          maxlength="200"
          show-word-limit
          placeholder="封禁原因（可选），例如：发布违规内容"
          data-testid="ban-reason"
        />
        <p v-if="banError" class="dlg-error" data-testid="ban-error">{{ banError }}</p>
      </div>
      <template #footer>
        <el-button @click="banVisible = false">取消</el-button>
        <el-button type="warning" :loading="banSaving" data-testid="ban-confirm" @click="submitBan">确认封禁</el-button>
      </template>
    </el-dialog>

    <!-- 详情：弹窗（分区：基本信息 / 状态与审核 / 数据统计；开发者口径说明不再上屏，改挂 ? tooltip） -->
    <el-dialog
      v-model="detailVisible"
      title="账号详情"
      :width="detailWidth"
      class="detail-dialog"
      append-to-body
      destroy-on-close
      data-testid="detail-dialog"
    >
      <div v-if="detail" data-testid="detail-panel" class="detail-panel">
        <section class="detail-section" data-testid="detail-section-basic">
          <h4 class="section-title">基本信息</h4>
          <el-descriptions :column="detailColumns" border size="small">
            <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="用户名">{{ detail.username }}</el-descriptions-item>
            <el-descriptions-item label="昵称">{{ detail.nickname || '—' }}</el-descriptions-item>
            <el-descriptions-item label="邀请码">{{ detail.inviteCode || '—' }}</el-descriptions-item>
            <el-descriptions-item label="注册时间">{{ detail.createdAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="最后登录">{{ detail.lastLoginAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="最近修改">{{ detail.updateTime || '—' }}</el-descriptions-item>
            <el-descriptions-item label="注册 IP">{{ detail.registerIp || '—' }}</el-descriptions-item>
          </el-descriptions>
          <div class="identity-block">
            <span class="identity-label">登录身份</span>
            <span v-if="!detail.identities || !detail.identities.length" class="identity-empty">—</span>
            <span v-for="it in detail.identities" :key="it.type + it.identifier" class="identity-line">
              {{ it.type }}：{{ it.identifier }}
            </span>
          </div>
        </section>

        <section class="detail-section" data-testid="detail-section-status">
          <h4 class="section-title">状态与审核</h4>
          <el-descriptions :column="detailColumns" border size="small">
            <el-descriptions-item label="状态">
              <el-tag :type="tagType(detail)" effect="light">{{ detail.badgeText || detail.statusText }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="角色">
              <el-tag :type="roleTagType(detail.role)" effect="light" data-testid="detail-role">
                {{ detail.roleText || roleText(detail.role) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="封禁">{{ detail.banned ? '已封禁' : '未封禁' }}</el-descriptions-item>
            <el-descriptions-item label="封禁原因">{{ detail.bannedReason || '—' }}</el-descriptions-item>
            <el-descriptions-item label="封禁时间">{{ detail.bannedAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="审核备注">{{ detail.reviewNote || '—' }}</el-descriptions-item>
            <el-descriptions-item label="审核时间">{{ detail.reviewedAt || '—' }}</el-descriptions-item>
            <el-descriptions-item label="审核人 ID">{{ detail.reviewedBy || '—' }}</el-descriptions-item>
          </el-descriptions>
        </section>

        <section class="detail-section" data-testid="detail-section-stats">
          <h4 class="section-title">数据统计</h4>
          <el-descriptions :column="detailColumns" border size="small">
            <el-descriptions-item label="收藏数">
              <span class="stat-cell">
                <span :data-testid="'detail-favorite-' + detail.username">{{ showCount(detail.favoriteCount) }}</span>
                <el-tooltip :content="countHints.favorite" placement="top">
                  <el-icon class="stat-hint" data-testid="hint-favorite"><question-filled /></el-icon>
                </el-tooltip>
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="播放列表数">
              <span class="stat-cell">
                <span :data-testid="'detail-playlist-' + detail.username">{{ showCount(detail.playlistCount) }}</span>
                <el-tooltip :content="countHints.playlist" placement="top">
                  <el-icon class="stat-hint" data-testid="hint-playlist"><question-filled /></el-icon>
                </el-tooltip>
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="视频数">
              <span class="stat-cell">
                <span data-testid="detail-video">{{ showCount(detail.videoCount) }}</span>
                <el-tooltip :content="countHints.video" placement="top">
                  <el-icon class="stat-hint" data-testid="hint-video"><question-filled /></el-icon>
                </el-tooltip>
              </span>
            </el-descriptions-item>
          </el-descriptions>
        </section>
      </div>
      <template #footer>
        <el-button data-testid="detail-close" @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="AppUserManage">
/**
 * 用户管理（P5.81，管理端；P5.79 的「用户审核」升级版）
 *
 * 后端契约（AppUserAdminController，全部真实 HTTP 状态码 + {"error":"..."}）：
 *   GET    /api/app/admin/users?status=&keyword=&page=&size=  → { code, rows, total }
 *   GET    /api/app/admin/users/stats                        → { total, pending, approved, rejected, banned, newToday, activeRecently }
 *   GET    /api/app/admin/users/{id}                         → 单行详情（+ identities / counts）
 *   PUT    /api/app/admin/users/{id} { nickname?, avatar?, reviewNote? } → 改资料（只改传入字段）
 *   POST   /api/app/admin/users/{id}/reset-password { password? }        → 重置密码（空=生成随机）
 *   POST   /api/app/admin/users/{id}/ban { reason? }         → 封禁
 *   POST   /api/app/admin/users/{id}/unban                   → 解封
 *   DELETE /api/app/admin/users/{id}?confirm=1               → 真删除（返回被删用户名）
 *   POST   /api/app/admin/users/{id}/approve|reject、PUT /{id}/status、POST /batch/approve|ban|unban
 *
 * 分页与筛选都在服务端做（status / keyword 透传）；每次写操作后重新拉当前页 + 统计，
 * 保证「切完状态刷新保持」不是靠前端本地改行。
 */
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, QuestionFilled } from '@element-plus/icons-vue'
import {
  listAppUsers,
  getAppUserStats,
  getAppUser,
  updateAppUser,
  updateAppUserRole,
  resetAppUserPassword,
  banAppUser,
  unbanAppUser,
  deleteAppUser,
  approveAppUser,
  rejectAppUser,
  setAppUserStatus,
  batchApproveAppUsers,
  batchBanAppUsers,
  batchUnbanAppUsers
} from '@/api/appUser'

const { proxy } = getCurrentInstance()

const rows = ref([])
const total = ref(0)
const loading = ref(false)
const batchLoading = ref(false)
const selection = ref([])
const pageError = ref('')
const stats = reactive({ total: 0, pending: 0, approved: 0, rejected: 0, banned: 0, newToday: 0, activeRecently: 0 })
const query = reactive({ status: '', keyword: '', page: 1, size: 10 })

const statCards = [
  { key: '', label: '总数', field: 'total', tone: 'tone-total' },
  { key: 'pending', label: '待审核', field: 'pending', tone: 'tone-pending' },
  { key: 'approved', label: '正常', field: 'approved', tone: 'tone-approved' },
  { key: 'rejected', label: '已拒绝', field: 'rejected', tone: 'tone-rejected' },
  { key: 'banned', label: '已封禁', field: 'banned', tone: 'tone-banned' }
]

const rejectVisible = ref(false)
const rejectRow = ref(null)
const rejectNote = ref('')
const rejectError = ref('')
const rejectSaving = ref(false)

const editVisible = ref(false)
const editRow = ref(null)
const editForm = reactive({ nickname: '', avatar: '', reviewNote: '' })
const editError = ref('')
const editSaving = ref(false)

const pwdVisible = ref(false)
const pwdRow = ref(null)
const pwdInput = ref('')
const pwdResult = ref('')
const pwdRevoked = ref(0)
const pwdError = ref('')
const pwdSaving = ref(false)

const banVisible = ref(false)
const banRow = ref(null)
const banReason = ref('')
const banError = ref('')
const banSaving = ref(false)

const detailVisible = ref(false)
const detail = ref(null)

/* 窄屏（375）适配：弹窗/抽屉宽度与分页布局跟着视口走 */
const viewportWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
const isNarrow = computed(() => viewportWidth.value < 768)
const dialogWidth = computed(() => (isNarrow.value ? '92%' : '480px'))
/* 详情弹窗：宽 min(720px, 94vw)，窄屏自动全宽；描述列数跟着视口走 */
const detailWidth = 'min(720px, 94vw)'
const detailColumns = computed(() => (isNarrow.value ? 1 : 2))
function onResize() {
  viewportWidth.value = window.innerWidth
}

const emptyText = computed(() => (pageError.value ? pageError.value : '没有符合条件的账号'))

/* 三个统计口径的说明挂在 ? 上：只在需要时展开，不占正文（原抽屉底部那段开发者口径说明已删除） */
const countHints = {
  favorite: '收藏数：该账号在用户端收藏的媒体条数（media_owner.user_id 关联 media_favorite 统计）',
  playlist: '播放列表数：该账号在用户端创建的自建播放列表条数（media_owner.user_id 关联 media_playlist 统计）',
  video: '视频数：媒体库视频无归属账号，恒为空'
}

/** 徽标：封禁优先于审核态（后端 badgeText 已算好，这里兜底） */
function tagType(row) {
  if (row && row.banned) return 'danger'
  const status = row && row.status
  if (status === 'pending') return 'warning'
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'info'
  return 'info'
}

function showCount(value) {
  return value === null || value === undefined ? '—' : String(value)
}

/** 后端错误原文优先（{"error":"..."}），没拿到才用兜底文案 */
function errorText(err, fallback) {
  if (err && err.message) return String(err.message)
  return fallback
}

function unwrap(res) {
  return res && res.data ? res.data : res
}

async function loadStats() {
  try {
    const data = unwrap(await getAppUserStats())
    if (data && typeof data === 'object') {
      stats.total = Number(data.total || 0)
      stats.pending = Number(data.pending || 0)
      stats.approved = Number(data.approved || 0)
      stats.rejected = Number(data.rejected || 0)
      stats.banned = Number(data.banned || 0)
      stats.newToday = Number(data.newToday || 0)
      stats.activeRecently = Number(data.activeRecently || 0)
    }
  } catch (e) {
    // 统计失败不影响列表：只是卡片数字不更新
  }
}

async function loadList() {
  loading.value = true
  pageError.value = ''
  try {
    const data = unwrap(
      await listAppUsers({
        status: query.status || undefined,
        keyword: query.keyword || undefined,
        page: query.page,
        size: query.size
      })
    )
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

/** 点统计卡片筛选；点「总数」或再点同一张卡 = 回到全部 */
function filterByCard(key) {
  query.status = query.status === key ? '' : key
  query.page = 1
  loadAll()
}

/** 写操作后统一刷新：当前页 + 统计（不本地改行，保证刷新后状态保持） */
async function afterWrite() {
  await loadAll()
}

/** 「更多」菜单只放次要操作：通过 / 拒绝 / 封禁·解封已在操作列外露，不再从这里派发 */
async function handleRowCommand(command, row) {
  if (command === 'pending') return handleReset2Pending(row)
  if (command === 'edit') return openEdit(row)
  if (command === 'resetPwd') return openResetPwd(row)
  if (command === 'delete') return handleDelete(row)
}

/* ------------------------------------------------ P5.89 角色（两档：user 普通用户 / owner 站长） */

/** 角色徽标色：站长醒目（warning），普通用户中性 */
function roleTagType(role) {
  return role === 'owner' ? 'warning' : 'info'
}

function roleText(role) {
  return role === 'owner' ? '站长' : '普通用户'
}

/**
 * 行内切换角色（需 app:user:edit）：
 *   · 先确认（升站长 = 拿到站端 full 权限，降级 = 回到三档策略，都是影响面很大的动作）；
 *   · 提交后用 afterWrite() 重新拉当前页 + 统计，不本地改行（刷新后状态与库一致）；
 *   · 唯一 owner 降级由后端 400 拒绝，原文（含「请先把另一个账号设为站长」）直接弹出来。
 * select 用 :model-value + @change 而不是 v-model：取消 / 失败时不必回滚本地值。
 */
async function handleRoleChange(row, role) {
  if (!row || !role || row.role === role) return
  const next =
    role === 'owner'
      ? '站长（拥有站端 full 权限：无视编辑策略三档，人物卡背景等调整可持久化到服务端）'
      : '普通用户（按编辑策略三档：off / local 时站端写接口 403）'
  try {
    await ElMessageBox.confirm('把「' + row.username + '」设为' + next + '？', '切换角色', {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消'
    })
  } catch (e) {
    return
  }
  try {
    const res = unwrap(await updateAppUserRole(row.id, role))
    const changed = res && res.changed === false
    ElMessage.success(changed ? '「' + row.username + '」已经是' + roleText(role) : '已把「' + row.username + '」设为' + roleText(role))
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '切换角色失败'))
  }
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

/* ---------------------------------------------------------------- 编辑资料 */
function openEdit(row) {
  editRow.value = row
  editForm.nickname = row.nickname || ''
  editForm.avatar = row.avatar || ''
  editForm.reviewNote = row.reviewNote || ''
  editError.value = ''
  editVisible.value = true
  // 列表接口不带 avatar（MEDIUMTEXT 太大），进详情拿一次
  getAppUser(row.id)
    .then((res) => {
      const data = unwrap(res)
      if (data && typeof data === 'object' && editVisible.value) {
        editForm.avatar = data.avatar || ''
        editForm.reviewNote = data.reviewNote || ''
      }
    })
    .catch(() => {})
}

async function submitEdit() {
  const nickname = (editForm.nickname || '').trim()
  if (!nickname) {
    editError.value = '昵称不能为空'
    return
  }
  editSaving.value = true
  editError.value = ''
  try {
    await updateAppUser(editRow.value.id, {
      nickname,
      avatar: editForm.avatar || '',
      reviewNote: editForm.reviewNote || ''
    })
    editVisible.value = false
    ElMessage.success('资料已保存：' + editRow.value.username)
    await afterWrite()
  } catch (e) {
    editError.value = errorText(e, '保存失败')
  } finally {
    editSaving.value = false
  }
}

/* ---------------------------------------------------------------- 重置密码 */
function openResetPwd(row) {
  pwdRow.value = row
  pwdInput.value = ''
  pwdResult.value = ''
  pwdRevoked.value = 0
  pwdError.value = ''
  pwdVisible.value = true
}

async function submitResetPwd() {
  const typed = (pwdInput.value || '').trim()
  if (typed && (typed.length < 8 || typed.length > 64)) {
    pwdError.value = '密码长度必须是 8~64 位'
    return
  }
  if (typed && (!/[A-Za-z]/.test(typed) || !/[0-9]/.test(typed))) {
    pwdError.value = '密码必须同时包含字母和数字'
    return
  }
  try {
    await ElMessageBox.confirm(
      '确认重置 ' + pwdRow.value.username + ' 的密码？旧密码立即失效，该账号所有会话会被撤销。',
      '二次确认',
      { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  pwdSaving.value = true
  pwdError.value = ''
  try {
    const data = unwrap(await resetAppUserPassword(pwdRow.value.id, typed))
    pwdRevoked.value = Number((data && data.sessionsRevoked) || 0)
    pwdResult.value = (data && data.password) || typed
    pwdInput.value = ''
    ElMessage.success('密码已重置：' + pwdRow.value.username)
    await loadStats()
  } catch (e) {
    pwdError.value = errorText(e, '重置失败')
  } finally {
    pwdSaving.value = false
  }
}

async function copyPassword() {
  const value = pwdResult.value
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('已复制到剪贴板')
  } catch (e) {
    // 非安全上下文 / 无剪贴板权限：退回手选，不假装成功
    ElMessage.warning('浏览器不允许自动复制，请手动选中密码复制')
  }
}

/* ---------------------------------------------------------------- 封禁 / 解封 */
function openBan(row) {
  banRow.value = row
  banReason.value = ''
  banError.value = ''
  banVisible.value = true
}

async function submitBan() {
  banSaving.value = true
  banError.value = ''
  try {
    await banAppUser(banRow.value.id, (banReason.value || '').trim() || undefined)
    banVisible.value = false
    ElMessage.success('已封禁：' + banRow.value.username)
    await afterWrite()
  } catch (e) {
    banError.value = errorText(e, '封禁失败')
  } finally {
    banSaving.value = false
  }
}

async function handleUnban(row) {
  try {
    await ElMessageBox.confirm(
      '解封账号 ' + row.username + '？解封后会回到封禁前的审核状态。',
      '解封',
      { type: 'warning', confirmButtonText: '解封', cancelButtonText: '取消' }
    )
  } catch (e) {
    return
  }
  try {
    await unbanAppUser(row.id)
    ElMessage.success('已解封：' + row.username)
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '解封失败'))
  }
}

/* ---------------------------------------------------------------- 删除 */
async function handleDelete(row) {
  let input
  try {
    const res = await ElMessageBox.prompt(
      '真删除后不可恢复（会话 / 登录身份一并清理）。请输入用户名 ' + row.username + ' 以确认：',
      '删除账号 ' + row.username,
      {
        type: 'error',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        inputPlaceholder: row.username,
        inputValidator: (value) => (value === row.username ? true : '用户名不匹配')
      }
    )
    input = res.value
  } catch (e) {
    return
  }
  if (input !== row.username) return
  try {
    const data = unwrap(await deleteAppUser(row.id))
    ElMessage.success('已删除：' + ((data && data.username) || row.username))
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '删除失败'))
  }
}

/* ---------------------------------------------------------------- 批量 */
function selectedIds() {
  return selection.value.map((r) => r.id)
}

async function handleBatchApprove() {
  const ids = selection.value.filter((r) => r.status !== 'approved').map((r) => r.id)
  if (!ids.length) return
  batchLoading.value = true
  try {
    const data = unwrap(await batchApproveAppUsers(ids))
    ElMessage.success('批量通过完成：' + ((data && data.changed) || 0) + ' 个')
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '批量通过失败'))
  } finally {
    batchLoading.value = false
  }
}

async function handleBatchBan() {
  const ids = selection.value.filter((r) => !r.banned).map((r) => r.id)
  if (!ids.length) {
    ElMessage.warning('选中的账号都已封禁')
    return
  }
  let reason = ''
  try {
    const res = await ElMessageBox.prompt('批量封禁 ' + ids.length + ' 个账号，原因（可选）：', '批量封禁', {
      confirmButtonText: '确认封禁',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：批量注册的垃圾账号'
    })
    reason = (res.value || '').trim()
  } catch (e) {
    return
  }
  batchLoading.value = true
  try {
    const data = unwrap(await batchBanAppUsers(ids, reason || undefined))
    ElMessage.success('批量封禁完成：' + ((data && data.changed) || 0) + ' 个')
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '批量封禁失败'))
  } finally {
    batchLoading.value = false
  }
}

async function handleBatchUnban() {
  const ids = selection.value.filter((r) => r.banned).map((r) => r.id)
  if (!ids.length) {
    ElMessage.warning('选中的账号都没有被封禁')
    return
  }
  try {
    await ElMessageBox.confirm('解封 ' + ids.length + ' 个账号？', '批量解封', {
      type: 'warning',
      confirmButtonText: '解封',
      cancelButtonText: '取消'
    })
  } catch (e) {
    return
  }
  batchLoading.value = true
  try {
    const data = unwrap(await batchUnbanAppUsers(ids))
    ElMessage.success('批量解封完成：' + ((data && data.changed) || 0) + ' 个')
    await afterWrite()
  } catch (e) {
    ElMessage.error(errorText(e, '批量解封失败'))
  } finally {
    batchLoading.value = false
  }
}

/* ---------------------------------------------------------------- 详情 */
async function openDetail(row) {
  detail.value = row
  detailVisible.value = true
  try {
    const data = unwrap(await getAppUser(row.id))
    if (data && typeof data === 'object') detail.value = data
  } catch (e) {
    // 详情拿不到就展示列表行里的字段，不打断
  }
}

onMounted(() => {
  window.addEventListener('resize', onResize)
  loadAll()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
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
    margin-bottom: 12px;
  }
  .page-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }
  .page-sub {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  /* 统计卡片：亮暗都靠 element-plus 变量，不写死颜色 */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .stat-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 8px;
    background: var(--el-bg-color-overlay);
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    &:hover {
      border-color: var(--el-color-primary-light-5);
    }
    &.active {
      border-color: var(--el-color-primary);
      box-shadow: 0 0 0 1px var(--el-color-primary-light-7) inset;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 600;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-primary);
    }
    .stat-label {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
    &.tone-pending .stat-value {
      color: var(--el-color-warning);
    }
    &.tone-approved .stat-value {
      color: var(--el-color-success);
    }
    &.tone-rejected .stat-value {
      color: var(--el-text-color-secondary);
    }
    &.tone-banned .stat-value {
      color: var(--el-color-danger);
    }
  }

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  .batch-bar {
    margin-left: auto;
  }
  .status-select {
    width: 180px;
  }
  .kw-input {
    width: 200px;
  }
  .user-table {
    width: 100%;
    /* 单元格左右内边距收到 8px：11 列（含新增 3 列 + 300px 操作列）在 1440 视口下仍不横滚 */
    :deep(.cell) {
      padding-left: 8px;
      padding-right: 8px;
    }
  }
  .mono {
    font-variant-numeric: tabular-nums;
    color: var(--el-text-color-regular);
  }
  /* 时间戳两行（日期 / 时分秒）：96px 装得下，比原来 160px 省 128px；文本内容不变（只按空格折行） */
  .dt {
    display: inline-block;
    max-width: 100%;
    font-size: 12px;
    line-height: 1.25;
    white-space: normal;
    word-break: keep-all;
    overflow-wrap: normal;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .ban-reason {
    color: var(--el-color-danger);
  }
  .u-name {
    font-weight: 500;
  }
  /* P5.89：角色列的行内下拉 —— 118px 列宽里放得下「普通用户」四个字，窄屏表格本来就横向滚动 */
  .role-select {
    width: 104px;
  }
  /* 操作列：一行等宽按钮，垂直居中、左对齐；间距 6px 用 flex gap，不叠 el-button 的默认 margin */
  .ops-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
  }
  .op-btn {
    width: 52px;
    height: 28px;
    min-height: 28px;
    margin: 0;
    padding: 0 4px;
    font-size: 12px;
    line-height: 1;
  }
  .op-btn + .op-btn {
    margin-left: 0;
  }
  .op-more {
    margin: 0;
    vertical-align: middle;
  }
  .op-caret {
    margin-left: 2px;
    font-size: 11px;
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
  .pwd-result {
    margin-top: 8px;
    padding: 10px;
    border: 1px dashed var(--el-color-primary-light-5);
    border-radius: 6px;
    background: var(--el-fill-color-lighter);
  }
  .pwd-result-title {
    margin: 0 0 6px;
    font-size: 13px;
    color: var(--el-text-color-regular);
  }
  .pwd-result-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .pwd-result-row code {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--el-color-primary);
    word-break: break-all;
  }
  .pwd-hint {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
  .identity-block {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 10px;
    font-size: 12px;
  }
  .identity-label {
    flex: 0 0 auto;
    color: var(--el-text-color-secondary);
  }
  .identity-line {
    display: block;
    color: var(--el-text-color-regular);
  }
  .identity-empty {
    color: var(--el-text-color-secondary);
  }

  /* 详情弹窗：三段分区 + 统计项的 ? 说明 */
  .detail-section + .detail-section {
    margin-top: 16px;
  }
  .section-title {
    margin: 0 0 8px;
    padding-left: 8px;
    border-left: 3px solid var(--el-color-primary);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--el-text-color-primary);
  }
  .stat-cell {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .stat-hint {
    font-size: 14px;
    color: var(--el-text-color-secondary);
    cursor: help;
    &:hover {
      color: var(--el-color-primary);
    }
  }

  /* 窄屏（375）：筛选纵向排、卡片两列、表格横向滚动（不挤掉操作列） */
  @media (max-width: 768px) {
    .filter-bar {
      display: block;
    }
    /* block 之后 inline 表单不会自己撑满：否则 select / input 只剩内容宽度，看起来像坏掉 */
    .filter-bar :deep(.el-form-item) {
      display: block;
      width: 100%;
      margin-right: 0;
    }
    .status-select,
    .kw-input {
      width: 100%;
    }
    .batch-bar {
      margin-left: 0;
    }
    .stats-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
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

<style lang="scss">
/* 详情弹窗 append-to-body：scoped 选择器够不到，这里用唯一的 .detail-dialog 类兜住
   375 窄屏下三段分区会比视口高，给 body 定高内滚，标题栏与「关闭」按钮始终可见 */
.detail-dialog {
  .el-dialog__body {
    max-height: 70vh;
    overflow-y: auto;
  }
}
</style>
