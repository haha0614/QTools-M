<!--
  RootView.vue —— 库根管理页的展示层（P5.78 / P5.80）
  纯展示：数据与状态全部来自 props，所有动作以事件交回 index.vue（不发请求、不改数据）。
  拆出来的理由与 studio/StudioView.vue 一致：三态（未就绪 / 出错 / 正常）与「列表 / 新增 / 编辑 /
  删除 / 行内开关」的结构可以单独渲染断言，取数与保存逻辑留在 index.vue。
  P5.80 新增：
    1) 类型列语义化：kind=root → 内容根，kind=thumbs → 产物根（保留小号原值便于排查）+ hover 说明；
    2) 顶部可折叠说明「库根登记的是存放位置」；
    3) 产物根行的「子目录」展开（内嵌小表：子目录 / 含义 / 文件数 / 占用 / 状态 + 重扫），
       数据由 props.artifacts 注入，展开与重扫只 emit('loadArtifacts')。
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

    <!-- 顶部说明：库根登记的是「存放位置」（可折叠，默认收起一行摘要） -->
    <div class="root-intro" :data-open="introOpen ? '1' : '0'" data-testid="root-intro">
      <div class="root-intro-head" @click="introOpen = !introOpen">
        <el-icon class="root-intro-icon"><InfoFilled /></el-icon>
        <span class="root-intro-summary">库根登记的是<b>存放位置</b>：内容根放源文件，产物根放派生产物；只有内容根会产生媒体条目。</span>
        <el-button link type="primary" size="small" data-testid="root-intro-toggle">{{ introOpen ? '收起' : '展开' }}</el-button>
      </div>
      <p v-show="introOpen" class="root-intro-body" data-testid="root-intro-body">
        库根登记的是<b>存放位置</b>：内容根放源文件，产物根放派生产物。只有内容根会产生媒体条目，
        产物根恒为 0 视频 / 0 相册。同一块盘上两者可以并存（例如内容根 <code>E:/111/视频</code>、
        产物根 <code>data/media/thumbs</code>），换盘时改各自的路径即可。
      </p>
    </div>

    <!-- P5.99：分级与可见性 —— 三个分级的「未登录是否可见」开关。
         为什么放在库根管理页顶部：它是同一个问题的另一维（库根 = 位置，分级 = 内容门类），
         两者都决定未登录访客能看到什么，分散到两页只会让人漏掉其中一维。 -->
    <div class="rating-policy-card" data-testid="rating-policy-card">
      <div class="rating-policy-head">
        <span class="rating-policy-title">分级与可见性</span>
        <span class="rating-policy-sub">
          未登录访客对每一档内容的可见性；与上面的「未登录可见」（库根）叠加：两者都通过才看得见。
        </span>
      </div>
      <p v-if="ratingError" class="rating-policy-error" data-testid="rating-policy-error">{{ ratingError }}</p>
      <p v-else-if="!ratingPolicy" class="rating-policy-hint" data-testid="rating-policy-unavailable">
        分级策略接口未就绪（/api/media/admin/rating-policy）：部署 P5.99 后端并执行
        doc/media_content_rating.sql 后刷新即可，其它功能不受影响。
      </p>
      <div v-else class="rating-policy-rows">
        <div v-for="item in ratingPolicyItems" :key="item.value" class="rating-policy-row"
          :data-testid="'rating-row-' + item.value">
          <span class="rating-policy-label">{{ item.label }}</span>
          <el-switch :model-value="item.guestVisible" :loading="!!ratingBusy[item.value]"
            :disabled="!!ratingBusy[item.value]" v-hasPermi="['media:admin:edit']"
            :data-testid="'rating-switch-' + item.value"
            @update:model-value="(v) => emit('toggleRating', { rating: item.value, value: v })" />
          <span class="rating-policy-state">{{ item.guestVisible ? '未登录可见' : '仅登录可见' }}</span>
        </div>
        <p class="rating-policy-tip">
          关掉某一档后：未登录访客的索引里不会出现该档内容，直链一律 404，站点的分级筛选里也不再出现这一档；
          只剩一档可见时，站点不再显示分级筛选。
        </p>
      </div>
    </div>

    <el-alert v-if="notReady" :title="notReady" type="warning" :closable="false" show-icon class="root-alert" />
    <el-alert v-else-if="pageError" :title="pageError" type="error" :closable="false" show-icon class="root-alert" />

    <!-- P5.95：唯一内容根（或全部内容根）被关掉「未登录可见」→ 未登录访客看到的是空站点，
         这种事故已经发生过两次（测试改 flag 后忘记恢复），必须在页面顶部主动喊出来 -->
    <el-alert v-if="hiddenWarning" :title="hiddenWarning" type="error" :closable="false" show-icon
      class="root-alert root-guest-warning" data-testid="guest-hidden-warning" />

    <el-table ref="tableRef" v-if="loading || rows.length" v-loading="loading" :data="rows" class="root-table"
      row-key="id" :row-class-name="rowClass" @expand-change="onExpandChange">
      <el-table-column type="expand" width="34" class-name="root-expand-col">
        <template #default="scope">
          <div class="root-artifact-panel" :data-testid="'artifact-panel-' + scope.row.id">
            <p v-if="!isArtifactRoot(scope.row)" class="root-artifact-hint">
              内容根没有产物子目录：派生资源（缩略图 / 封面 / 精灵图 / 预览片段 / 取帧缓存）统一放在产物根里。
            </p>
            <template v-else>
              <div class="root-artifact-head">
                <span class="root-artifact-title">产物子目录</span>
                <span class="root-artifact-path">{{ scope.row.path }}</span>
                <el-button link type="primary" size="small" class="root-artifact-rescan"
                  :loading="artifactOf(scope.row).loading" :data-testid="'artifact-rescan-' + scope.row.id"
                  @click="emit('loadArtifacts', { row: scope.row, force: true })">重扫</el-button>
              </div>

              <p v-if="artifactOf(scope.row).error" class="root-artifact-error"
                :data-testid="'artifact-error-' + scope.row.id">{{ artifactOf(scope.row).error }}</p>
              <p v-else-if="artifactOf(scope.row).loading && !artifactOf(scope.row).data" class="root-artifact-loading">
                统计中…（目录很大时首次要几秒）
              </p>

              <template v-else-if="artifactOf(scope.row).data">
                <div class="root-artifact-meta" :data-testid="'artifact-meta-' + scope.row.id">
                  <el-tag size="small" type="info">合计 {{ humanBytes(artifactOf(scope.row).data.total.bytes) }}
                    · {{ toNum(artifactOf(scope.row).data.total.files) }} 个文件</el-tag>
                  <el-tag size="small" :type="artifactOf(scope.row).data.partial ? 'warning' : 'success'">
                    {{ artifactOf(scope.row).data.partial ? '部分统计' : '统计完整' }}</el-tag>
                  <el-tag size="small" :type="artifactOf(scope.row).data.cached ? 'info' : 'primary'">
                    {{ artifactOf(scope.row).data.cached ? '缓存 ' + cacheAgeText(artifactOf(scope.row).data) : '刚统计' }}</el-tag>
                  <span class="root-artifact-meta-text">{{ artifactOf(scope.row).data.scannedAt || '—' }}
                    · 耗时 {{ toNum(artifactOf(scope.row).data.durationMs) }} ms</span>
                </div>
                <p v-if="artifactOf(scope.row).data.note" class="root-artifact-note">{{ artifactOf(scope.row).data.note }}</p>

                <div class="root-artifact-scroll">
                  <table class="root-artifact-table" :data-testid="'artifact-table-' + scope.row.id">
                    <thead>
                      <tr><th>子目录</th><th>含义</th><th class="num">文件数</th><th class="num">占用</th><th>状态</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in artifactRows(artifactOf(scope.row).data)" :key="item.name"
                        :data-testid="'artifact-row-' + scope.row.id + '-' + item.name"
                        :data-unknown="item.unknown ? '1' : '0'">
                        <td class="mono">{{ item.name }}</td>
                        <td>{{ item.label }}</td>
                        <td class="num">{{ toNum(item.files) }}</td>
                        <td class="num">{{ humanBytes(item.bytes) }}</td>
                        <td :class="item.exists ? '' : 'muted'">{{ item.exists ? '有' : '未生成' }}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr :data-testid="'artifact-total-' + scope.row.id">
                        <td colspan="2">合计（根内全部文件）</td>
                        <td class="num">{{ toNum(artifactOf(scope.row).data.total.files) }}</td>
                        <td class="num">{{ humanBytes(artifactOf(scope.row).data.total.bytes) }}</td>
                        <td class="muted">{{ artifactOf(scope.row).data.exists ? '' : '根目录不可用' }}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p v-if="toNum(artifactOf(scope.row).data.looseFiles) > 0" class="root-artifact-note">
                  根目录下还散落 {{ toNum(artifactOf(scope.row).data.looseFiles) }} 个文件
                  （{{ humanBytes(artifactOf(scope.row).data.looseBytes) }}），已计入合计。
                </p>
              </template>
            </template>
          </div>
        </template>
      </el-table-column>

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
      <el-table-column label="类型" width="104" align="center">
        <template #default="scope">
          <el-tooltip placement="top" :content="kindTip(scope.row.kind)" popper-class="root-kind-tip">
            <span class="root-kind" :data-testid="'kind-' + scope.row.id" :data-kind="scope.row.kind || ''">
              <el-tag size="small" :type="kindTagType(scope.row.kind)" class="root-kind-tag">{{ kindText(scope.row.kind) }}</el-tag>
              <span class="root-kind-raw">{{ scope.row.kind || '—' }}</span>
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="未登录可见" width="112" align="center">
        <template #default="scope">
          <el-tooltip :disabled="!isArtifactRoot(scope.row)" placement="top"
            content="产物根没有媒体条目（恒为 0 视频 / 0 相册），这个开关对它没有影响">
            <el-switch :model-value="scope.row.guestVisible !== false" :loading="togglingId === scope.row.id"
              :disabled="togglingId === scope.row.id" v-hasPermi="['media:admin:edit']"
              :data-testid="'guest-switch-' + scope.row.id"
              @update:model-value="(v) => emit('toggleGuest', { row: scope.row, value: v })" />
          </el-tooltip>
          <!-- P5.95：这一行就是「让站点看起来空了」的那个根：开关旁挂一个小警示图标 + 同样的文案 -->
          <el-tooltip v-if="warnOnRow(scope.row)" placement="top" :content="hiddenWarning">
            <el-icon class="root-guest-warn-icon" :data-testid="'guest-hidden-icon-' + scope.row.id" color="#f56c6c">
              <WarningFilled />
            </el-icon>
          </el-tooltip>
          <div v-if="isArtifactRoot(scope.row)" class="root-kind-raw">产物根无内容</div>
        </template>
      </el-table-column>
      <el-table-column label="可读" width="70" align="center">
        <template #default="scope">
          <el-tag :type="isReadable(scope.row) ? 'success' : 'danger'" size="small">{{ isReadable(scope.row) ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="条目数（视频 / 相册 / 照片）" width="186" align="center">
        <template #default="scope">
          <span class="root-counts">{{ toNum(scope.row.videoCount) }} / {{ toNum(scope.row.albumCount) }} / {{ toNum(scope.row.photoCount) }}</span>
          <div v-if="isArtifactRoot(scope.row)" class="root-kind-raw">产物根恒为 0</div>
        </template>
      </el-table-column>
      <el-table-column label="最后扫描" width="150" align="center">
        <template #default="scope">{{ scanText(scope.row) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="196" align="center" fixed="right" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-tooltip :content="scanTip(scope.row)" placement="top">
            <span>
              <el-button link type="primary" icon="VideoPlay" :disabled="!canScan(scope.row)"
                :data-testid="'scan-' + scope.row.id" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
                @click="emit('scan', scope.row)">扫描</el-button>
            </span>
          </el-tooltip>
          <el-tooltip content="子目录清单（各产物类型的文件数与占用）" placement="top" :disabled="!isArtifactRoot(scope.row)">
            <el-button link type="primary" icon="Files" :disabled="!isArtifactRoot(scope.row)"
              :data-testid="'subdirs-btn-' + scope.row.id" @click="toggleArtifacts(scope.row)">子目录</el-button>
          </el-tooltip>
          <el-tooltip content="编辑（名称 / 路径 / 类型 / 未登录可见）" placement="top">
            <el-button link type="primary" icon="Edit" :data-testid="'edit-' + scope.row.id" @click="emit('edit', scope.row)" v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
          <el-tooltip :content="defaultTip(scope.row)" placement="top">
            <el-button link type="warning" icon="Star" :disabled="true" v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
          <el-tooltip :content="hasRefs(scope.row) ? '有内容，删除前会二次确认' : '删除'" placement="top">
            <el-button link type="danger" icon="Delete" :loading="deletingId === scope.row.id"
              :data-testid="'delete-' + scope.row.id" @click="emit('delete', scope.row)" v-hasPermi="['media:admin:edit']" />
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <el-empty v-if="!loading && !notReady && !pageError && !rows.length"
      description="还没有库根（media_root 为空）：先点右上角「新增库根」" :image-size="60" />

    <p class="root-tip">
      「未登录可见」＝ 未登录访客（浏览器无有效 app token）能否看到这个根下的内容：
      关掉后它的视频 / 相册 / 图片不会出现在站端索引里，直接访问其资源一律 404；登录用户不受影响。
      开关<b>即点即存</b>，下一次请求即生效。产物根没有媒体条目，这个开关对它没有影响。
    </p>
    <p class="root-tip" data-testid="guest-rule-tip">
      什么时候会出现顶部的红色警告：<b>全部内容根都关掉「未登录可见」时</b>（只有一个内容根的部署里，
      那就是「唯一内容根被关掉」）。有多个内容根、但还有根是可见的，则不警告 —— 访客仍然看得到东西。
    </p>
    <p class="root-tip">
      产物根里的 7 类派生资源：<code>p</code> 图片缩略图 / <code>v</code> 视频封面 / <code>s</code> 精灵图 /
      <code>pv</code> 照片大图预览 / <code>pv2</code> 预览片段（视频）/ <code>frames</code> 取帧缓存 / <code>avcrop</code> 头像裁剪缓存。
      全部可重建，清理前请先看 <code>docs/库根与产物根.md</code>。
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
            <el-option label="内容根（root，放源文件）" value="root" />
            <el-option label="产物根（thumbs，放派生产物）" value="thumbs" />
            <el-option label="回收站根（trash）" value="trash" />
          </el-select>
          <div class="root-form-hint" v-if="form.id">类型只在新增时生效，后端改库根不接受 kind</div>
        </el-form-item>
        <el-form-item label="未登录可见">
          <el-switch v-model="form.guestVisible" />
          <div class="root-form-hint">
            关闭 = 仅登录可见：未登录访客在索引里看不到本根内容，直接访问其资源 404。
            产物根没有媒体条目，此项对它没有影响。
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="可选" />
        </el-form-item>

        <!-- P5.97 A：填完路径立刻预演（防抖 500ms，后端 dry-run 不写库），所见即真实将入库的数量 -->
        <el-form-item v-if="!form.id && isFormContentRoot" label="预演">
          <div class="root-preview" data-testid="root-preview" :data-state="previewState">
            <p v-if="preview.loading" class="root-preview-line">正在预演（只读，不写库）：走一遍目录…</p>
            <p v-else-if="preview.error" class="root-form-error" data-testid="root-preview-error">{{ preview.error }}</p>
            <p v-else-if="preview.data" class="root-preview-line" data-testid="root-preview-text">
              识别到 <b>{{ toNum(preview.data.videos) }}</b> 个视频 /
              <b>{{ toNum(preview.data.albums) }}</b> 本相册 /
              <b>{{ toNum(preview.data.photos) }}</b> 张图片
              <template v-if="toNum(preview.data.ignoredTotal) > 0">
                ；另有 {{ toNum(preview.data.ignoredTotal) }} 个文件不会入库（{{ ignoredText }}）
              </template>
              <template v-if="toNum(preview.data.files) > 0">
                ；目录共 {{ toNum(preview.data.files) }} 个文件 {{ humanBytes(preview.data.bytes) }}
              </template>
              <span class="root-preview-eta">预计首次扫描约 {{ estimateText }}</span>
            </p>
            <p v-else class="root-preview-line muted">填完绝对路径后会自动预演：这条路径下有多少能入库、多少会被忽略</p>
            <p v-if="preview.data && preview.data.walkTruncated" class="root-form-hint">
              忽略类型统计提前收工（{{ preview.data.walkTruncatedReason }}）：上面的忽略数是「至少这么多」
            </p>
          </div>
        </el-form-item>

        <!-- P5.97 A：创建后立即扫描入库（默认开）：一次点击跑完扫盘 → 补哈希 → 补元数据 → 缩略图 → 索引 -->
        <el-form-item v-if="!form.id && isFormContentRoot" label="保存后">
          <el-switch :model-value="formAutoScan"
            @update:model-value="(v) => emit('update:formAutoScan', v)" data-testid="root-auto-scan" />
          <div class="root-form-hint">
            创建后立即扫描入库（推荐）：保存即开始扫描，完成后自动补内容哈希 / 补元数据 / 生成封面缩略图 / 重建索引；
            进度在抽屉里，可随时停止。关掉它就只登记路径，之后在行上点「扫描」。
          </div>
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
import { computed, nextTick, ref } from 'vue'
import { RATING_OPTIONS } from '../ratingOptions'

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
  /** 产物根子目录清单：{ [rootId]: { loading, error, data } }（P5.80，取数在 index.vue） */
  artifacts: { type: Object, default: () => ({}) },
  /** 正在切开关的行 id */
  togglingId: { type: [String, Number], default: null },
  deletingId: { type: [String, Number], default: null },
  formVisible: { type: Boolean, default: false },
  form: { type: Object, default: () => ({ id: null, name: '', path: '', kind: 'root', guestVisible: true, note: '' }) },
  saving: { type: Boolean, default: false },
  formError: { type: String, default: '' },
  /** 预演结果：{ loading, error, data:{ videos, albums, photos, files, bytes, ignored, ignoredTotal, estimateSeconds } } */
  preview: { type: Object, default: () => ({ loading: false, error: '', data: null }) },
  /** 「创建后立即扫描入库」开关（默认开） */
  formAutoScan: { type: Boolean, default: true },
  /**
   * 内容分级可见性策略（P5.99）：{ general: true, guidance: true, restricted: true, items:[{value,label,guestVisible}] }
   * null = 还没取到（后端未部署 / 读取失败），面板显示提示而不是一排假开关
   */
  ratingPolicy: { type: Object, default: null },
  /** 正在保存的分级 → true（逐档禁用，避免连点） */
  ratingBusy: { type: Object, default: () => ({}) },
  /** 策略接口的错误文案（非空时面板内红字） */
  ratingError: { type: String, default: '' }
})

const emit = defineEmits([
  'refresh',
  'create',
  'edit',
  'delete',
  'submit',
  'toggleGuest',
  'loadArtifacts',
  'scan',
  'update:formVisible',
  'update:formAutoScan',
  'toggleRating'
])

/** 三档开关的展示模型：策略对象 → [{value,label,guestVisible}]（顺序固定 general → guidance → restricted） */
const ratingPolicyItems = computed(() => {
  const policy = props.ratingPolicy || {}
  const items = Array.isArray(policy.items) ? policy.items : []
  if (items.length) {
    return items.map(it => ({
      value: String(it.value || ''),
      label: String(it.label || it.value || ''),
      guestVisible: it.guestVisible !== false
    }))
  }
  return RATING_OPTIONS.map(opt => ({
    value: opt.value,
    label: opt.label,
    guestVisible: policy[opt.value] !== false
  }))
})

const tableRef = ref(null)
const introOpen = ref(false)
const expandedKeys = ref([])

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function isReadable(row) {
  return !!row && row.exists !== false && row.readable !== false
}

/** 只有产物根（kind=thumbs）有子目录清单；kind 取值不动，只在这里判定 */
function isArtifactRoot(row) {
  return !!row && String(row.kind || '').toLowerCase() === 'thumbs'
}

/** 内容根（kind=root）：只有它会产出媒体条目，也只有它影响「未登录访客看到什么」 */
function isContentRoot(row) {
  return !!row && String(row.kind || '').toLowerCase() === 'root'
}

/** 表单里的类型是不是内容根（只有内容根能预演 / 能扫描入库） */
const isFormContentRoot = computed(() => String((props.form && props.form.kind) || 'root').toLowerCase() === 'root')

/** 预演面板状态（给 data-state 断言用） */
const previewState = computed(() => {
  const p = props.preview || {}
  if (p.loading) return 'loading'
  if (p.error) return 'error'
  return p.data ? 'ready' : 'idle'
})

/** 被忽略的文件类型：取数量最多的前几类，拼成「.txt×3 / .zip×1」 */
const ignoredText = computed(() => {
  const data = props.preview && props.preview.data
  const map = (data && data.ignored) || {}
  const rows = Object.keys(map).map((ext) => ({ ext: ext || '无扩展名', count: toNum(map[ext]) }))
  rows.sort((a, b) => b.count - a.count)
  if (!rows.length) return ''
  const text = rows.slice(0, 5).map((row) => row.ext + '×' + row.count).join(' / ')
  return rows.length > 5 ? text + ' …' : text
})

/** 预计耗时文本：预演已实测走盘时间，再加文件数的粗估（页面必须带「约」，不是 SLA） */
const estimateText = computed(() => {
  const data = props.preview && props.preview.data
  const seconds = toNum(data && data.estimateSeconds)
  if (!seconds) return '—'
  if (seconds < 60) return '约 ' + seconds + ' 秒'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return '约 ' + minutes + ' 分钟'
  return '约 ' + (minutes / 60).toFixed(1) + ' 小时'
})

/** 内容根才能扫描入库（thumbs 产物根里全是派生产物，扫进来都是无主文件） */
function canScan(row) {
  return isContentRoot(row) && isReadable(row)
}

function scanTip(row) {
  if (!isContentRoot(row)) return '只有内容根能扫描入库：产物根 / 回收站根里没有源文件'
  if (!isReadable(row)) return '路径不可读（或不存在），先修好路径再扫'
  return '扫描这个根：扫盘写库 → 补哈希 → 补元数据 → 生成封面缩略图 → 重建索引（可中途停止）'
}

/** 该行是否被关掉了「未登录可见」（缺省 = 可见，与后端 guestVisibleOf 同口径） */
function isGuestHiddenRow(row) {
  return !!row && row.guestVisible === false
}

/** 类型列：root → 内容根 / thumbs → 产物根（原值以小字保留，排查时对得上库） */
function kindText(kind) {
  const text = String(kind || '').toLowerCase()
  if (text === 'root') return '内容根'
  if (text === 'thumbs') return '产物根'
  if (text === 'trash') return '回收站根'
  return kind || '—'
}

function kindTagType(kind) {
  const text = String(kind || '').toLowerCase()
  if (text === 'root') return 'primary'
  if (text === 'thumbs') return 'warning'
  return 'info'
}

function kindTip(kind) {
  const text = String(kind || '').toLowerCase()
  if (text === 'root') return '原始视频 / 相册 / 图片所在目录，是扫描入库的对象'
  if (text === 'thumbs') {
    return '派生产物统一存放：p 图片缩略图 / v 视频封面 / s 精灵图 / pv2 预览片段 / frames 取帧缓存 / avcrop 头像裁剪'
  }
  if (text === 'trash') return '回收站根：软删的文件 MOVED 到这里（媒体条目仍在库里）'
  return '未知类型：只有 root（内容根）/ thumbs（产物根）/ trash 三种'
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

/** 占用人类可读：1.2 GB / 345 MB / 12 KB（字节数由后端给，前端只做单位换算） */
function humanBytes(value) {
  const n = toNum(value)
  if (n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let x = n
  let i = 0
  while (x >= 1024 && i < units.length - 1) {
    x = x / 1024
    i++
  }
  if (i === 0) return Math.round(x) + ' B'
  return (x >= 100 ? x.toFixed(0) : x.toFixed(1)) + ' ' + units[i]
}

function cacheAgeText(data) {
  const seconds = Math.round(toNum(data && data.cacheAgeMs) / 1000)
  return seconds > 0 ? seconds + 's 前' : '刚刚'
}

function artifactOf(row) {
  return props.artifacts[row && row.id] || { loading: false, error: '', data: null }
}

/** 小表行：白名单 7 项（顺序来自后端） + 未知子目录（标「未登记」） */
function artifactRows(data) {
  const known = (data && Array.isArray(data.dirs) ? data.dirs : []).map(item => ({ ...item, unknown: false }))
  const unknown = (data && Array.isArray(data.unknown) ? data.unknown : []).map(item => ({
    ...item,
    label: item.label || '未登记的子目录',
    unknown: true
  }))
  return known.concat(unknown)
}

/** 「子目录」按钮：展开 / 收起该行，展开时让 index.vue 去取数（已取过就走 60s 缓存） */
function toggleArtifacts(row) {
  if (!isArtifactRoot(row)) return
  const open = expandedKeys.value.indexOf(row.id) < 0
  if (tableRef.value) tableRef.value.toggleRowExpansion(row, open)
  if (open) emit('loadArtifacts', { row, force: false })
}

/** 原生展开箭头与按钮共用一套状态；非产物根即使被展开也立刻收起（内容根没有清单） */
function onExpandChange(row, expanded) {
  if (expanded) {
    if (!isArtifactRoot(row)) {
      nextTick(() => tableRef.value && tableRef.value.toggleRowExpansion(row, false))
      return
    }
    if (expandedKeys.value.indexOf(row.id) < 0) expandedKeys.value = expandedKeys.value.concat([row.id])
    emit('loadArtifacts', { row, force: false })
    return
  }
  expandedKeys.value = expandedKeys.value.filter(id => id !== row.id)
}

/** 路径不可读的行整行标红（要求：「路径不存在的行标红并提示目录不可读」） */
function rowClass({ row }) {
  const classes = []
  if (!isReadable(row)) classes.push('root-row-bad')
  if (!isArtifactRoot(row)) classes.push('root-row-noexpand')
  return classes.join(' ')
}

const hiddenCount = computed(() => props.rows.filter(r => r && r.guestVisible === false).length)

/** 内容根清单（P5.95 的警告只看它们：产物根 / 回收站根没有媒体条目） */
const contentRoots = computed(() => props.rows.filter(isContentRoot))

/**
 * 红色警告文案（空串 = 不警告）
 *
 * <p>规则：**全部内容根都不可见**时才警告。</p>
 *   - 只有一个内容根时，它就是「唯一内容根被关掉」——访客必然看到空站点；
 *   - 有多个内容根时，只要还有一个可见的根，访客就看得到东西，这时提示只会变成噪音；
 *     全都关掉才是真正的空站点。
 *
 * <p>文案与站端兜底提示（QTools-C 的 GuestHiddenEmpty）是同一件事的两端：管理端提前喊，
 * 站端兜住已经发生的。</p>
 */
const hiddenWarning = computed(() => {
  const roots = contentRoots.value
  if (!roots.length) return ''
  if (!roots.every(isGuestHiddenRow)) return ''
  if (roots.length === 1) {
    return '当前唯一的内容根已设为「未登录不可见」，未登录访客将看到空站点。若非本意，请打开「未登录可见」。'
  }
  return '全部 ' + roots.length + ' 个内容根都已设为「未登录不可见」，未登录访客将看到空站点。若非本意，请打开「未登录可见」。'
})

/** 行内警示图标只挂在「确实被关掉的内容根」上，且只在顶部警告成立时出现（同一套口径，不各判一套） */
function warnOnRow(row) {
  return !!hiddenWarning.value && isContentRoot(row) && isGuestHiddenRow(row)
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
/* ---------- 分级与可见性（P5.99） ---------- */
.rating-policy-card {
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
}

.rating-policy-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.rating-policy-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.rating-policy-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.rating-policy-rows {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
}

.rating-policy-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.rating-policy-label {
  font-size: 13px;
  color: var(--el-text-color-primary);
  min-width: 70px;
}

.rating-policy-state {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 70px;
}

.rating-policy-tip {
  flex-basis: 100%;
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.rating-policy-error {
  margin: 0;
  font-size: 12px;
  color: var(--el-color-danger);
}

.rating-policy-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.root-page {
  padding-bottom: 8px;
}

/* P5.95：库根被关掉「未登录可见」的红色警告（比普通错误条更醒目：粗描边 + 略浓的底色） */
.root-guest-warning {
  border: 1px solid var(--el-color-error);
  margin-bottom: 10px;
}

.root-guest-warning :deep(.el-alert__title) {
  font-weight: 600;
}

/* 行内小警示图标：跟在开关后面，与开关同一行居中 */
.root-guest-warn-icon {
  margin-left: 4px;
  vertical-align: middle;
  font-size: 14px;
  cursor: help;
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

/* 顶部说明（可折叠）：一行摘要常驻，展开看完整口径 */
.root-intro {
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}

.root-intro-head {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.7;
}

.root-intro-icon {
  color: var(--el-color-primary);
  flex: none;
}

.root-intro-summary {
  flex: 1 1 auto;
  min-width: 0;
}

.root-intro-body {
  margin: 6px 0 0;
  padding-left: 22px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--el-text-color-regular);
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

/* 类型列：中文语义 + 小号原值（排查时对得上 media_root.kind） */
.root-kind {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: help;
}

.root-kind-raw {
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
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

.root-tip code,
.root-intro-body code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--el-fill-color);
  font-family: Consolas, Monaco, monospace;
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

/* P5.97 预演面板：亮暗主题都用 --el-* 变量；375 窄屏下自动换行 */
.root-preview {
  width: 100%;
  padding: 8px 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}

.root-preview[data-state='ready'] {
  border-style: solid;
  border-color: var(--el-color-success-light-5);
  background: var(--el-color-success-light-9);
}

.root-preview[data-state='error'] {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}

.root-preview-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.root-preview-line.muted {
  color: var(--el-text-color-secondary);
}

.root-preview-eta {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
}

:deep(.root-row-bad) td {
  background: var(--el-color-danger-light-9, rgba(245, 108, 108, 0.08));
}

/* 内容根的展开箭头不可点（它没有产物子目录） */
:deep(.root-row-noexpand) .el-table__expand-icon {
  visibility: hidden;
  pointer-events: none;
}

/* ---------------- 产物根子目录清单（内嵌小表） ---------------- */
.root-artifact-panel {
  padding: 10px 14px 12px 42px;
  background: var(--el-fill-color-lighter);
}

.root-artifact-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.root-artifact-title {
  font-weight: 600;
  font-size: 13px;
}

.root-artifact-path {
  flex: 1 1 220px;
  min-width: 0;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.root-artifact-rescan {
  flex: none;
}

.root-artifact-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
}

.root-artifact-meta-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.root-artifact-note,
.root-artifact-hint,
.root-artifact-loading {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.root-artifact-error {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-color-danger);
}

/* 窄屏：小表横向滚动，不挤压页面 */
.root-artifact-scroll {
  overflow-x: auto;
}

.root-artifact-table {
  width: 100%;
  min-width: 460px;
  border-collapse: collapse;
  font-size: 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.root-artifact-table th,
.root-artifact-table td {
  padding: 6px 10px;
  text-align: left;
  border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
}

.root-artifact-table th {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-light);
  white-space: nowrap;
}

.root-artifact-table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.root-artifact-table .mono {
  font-family: Consolas, Monaco, monospace;
}

.root-artifact-table .muted {
  color: var(--el-text-color-secondary);
}

.root-artifact-table tfoot td {
  font-weight: 600;
  background: var(--el-fill-color-light);
  border-bottom: none;
}

@media (max-width: 768px) {
  .root-toolbar-right {
    width: 100%;
  }

  .root-page-title {
    font-size: 16px;
  }

  /* 窄屏：库根表本身要横向滚动（列多），展开面板贴住左边界，
     宽度按视口算，于是「子目录小表」在自己的容器里横向滚动，不用先拖动整张表 */
  .root-artifact-panel {
    position: sticky;
    left: 0;
    width: calc(100vw - 28px);
    padding: 8px 10px 10px 14px;
  }

  .root-artifact-table {
    min-width: 380px;
  }
}
</style>