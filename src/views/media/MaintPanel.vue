<template>
  <div class="maint-panel">
    <p class="maint-lead">
      把命令行维护操作变成按钮。<strong>任一时刻只允许一个任务</strong>（与工具栏那 4 个扫描按钮共用同一把锁：任务运行中所有按钮都会禁用）。
      危险操作（GC / 删除库根 / 修复封面路径）都会先弹二次确认。
    </p>
    <p class="maint-lead">
      权限：查看本面板需要 <code>media:admin:list</code>；执行扫描类任务由后端校验 <code>media:admin:scan</code>（按钮同时接受
      <code>media:admin:edit</code>），库根的增删改需要 <code>media:admin:edit</code>。缺权限时后端返回 403，面板会就地给出错误。
    </p>

    <!-- ============================== 自动扫描 ============================== -->
    <section class="maint-group">
      <div class="maint-group-head">
        <span class="maint-group-title">自动扫描</span>
        <span class="maint-group-desc">后端文件监听：库根里出现新文件（防抖 {{ watchDebounceText }}）后自动重建索引</span>
        <el-tag :type="watchBadge.type" size="small" class="watch-badge">{{ watchBadge.text }}</el-tag>
      </div>
      <el-alert v-if="watchError" :title="watchError" type="warning" :closable="false" show-icon class="maint-alert" />
      <div class="maint-actions">
        <el-button icon="Refresh" :loading="watchLoading" v-hasPermi="['media:admin:list']" @click="loadWatch">刷新状态</el-button>
        <el-button v-if="watchInfo.running" icon="VideoPause" :loading="watchBusy" :disabled="watchBusy"
          v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="toggleWatch(false)">暂停</el-button>
        <el-button v-else type="primary" plain icon="VideoPlay" :loading="watchBusy" :disabled="watchBusy"
          v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="toggleWatch(true)">继续</el-button>
        <el-button type="primary" plain icon="RefreshRight" :loading="scanNowLoading" :disabled="scanNowLoading || scanRunning"
          v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="doScanNow">立即扫描</el-button>
        <span class="maint-inline-note">暂停只停监听，不打断已在跑的任务</span>
      </div>
      <el-table v-if="watchRoots.length" :data="watchRoots" size="small" class="maint-table">
        <el-table-column label="路径" prop="path" min-width="240" :show-overflow-tooltip="true" />
        <el-table-column label="已注册" width="80" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.registered ? 'success' : 'info'" size="small">{{ scope.row.registered ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最后事件" width="150" align="center">
          <template #default="scope">{{ formatWatchTime(scope.row.lastEventAt) }}</template>
        </el-table-column>
        <el-table-column label="最后扫描" width="150" align="center">
          <template #default="scope">{{ formatWatchTime(scope.row.lastScanAt) }}</template>
        </el-table-column>
        <el-table-column label="排队" width="70" align="center">
          <template #default="scope">{{ scope.row.pending != null ? scope.row.pending : '-' }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="watchEmptyText" :image-size="60" />
      <p class="maint-hint">
        <strong>「已注册」为否</strong>：该根当前没有监听句柄（路径不存在 / 不可读 / 触达监听上限），先跑一次「重建索引」把它重新纳入。
        监听开关来自后端配置 <code>qtools.media.watch.enabled</code>，改完需重启后端。
      </p>
    </section>

    <!-- ============================== 扫描 ============================== -->
    <section class="maint-group">
      <div class="maint-group-head">
        <span class="maint-group-title">扫描</span>
        <span class="maint-group-desc">重扫媒体根并刷新索引库：不删除任何文件，会保留隐藏状态与人物归属</span>
      </div>
      <div class="maint-row">
        <span class="maint-label">分册方式</span>
        <el-radio-group v-model="albumMode" :disabled="scanRunning" size="small">
          <el-radio-button value="dir">按目录 (dir)</el-radio-button>
          <el-radio-button value="prefix">按文件名前缀 (prefix)</el-radio-button>
        </el-radio-group>
      </div>
      <div class="maint-row">
        <span class="maint-label">排除规则</span>
        <el-input v-model="exclude" :disabled="scanRunning" clearable placeholder="如 *.tmp,sample/**（留空 = 不排除任何路径）" />
      </div>
      <div class="maint-actions">
        <el-button type="primary" plain icon="RefreshRight" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'scan', options: scanOptions() })">
          重建索引
        </el-button>
        <el-button icon="Stamp" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'backfill-hash', options: {} })">
          补内容哈希
        </el-button>
        <el-button icon="SetUp" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'fix-poster', options: {}, confirm: FIX_POSTER_CONFIRM, title: '修复封面路径' })">
          修复封面路径
        </el-button>
      </div>
      <p class="maint-hint">
        <strong>补内容哈希</strong>：按文件内容算哈希写回索引，<strong>幂等</strong>——已算过的记录不会重算，只补空值；视频多时耗时较久，可挑空闲时段跑。
      </p>
      <p class="maint-hint">
        <strong>修复封面路径</strong>：把索引里失效的封面路径按磁盘实况纠正。<strong>必须先跑「重建缩略图」</strong>，否则磁盘上没有缩略图可指向，任务修不到东西。
      </p>
    </section>

    <!-- ============================== 元数据 ============================== -->
    <section class="maint-group">
      <div class="maint-group-head">
        <span class="maint-group-title">元数据</span>
        <span class="maint-group-desc">用 ffprobe 补齐时长 / 分辨率 / 编码等字段：只补空值，不覆盖已有值</span>
      </div>
      <div class="maint-actions">
        <el-button type="primary" plain icon="Cpu" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'enrich' })">
          补元数据(ffprobe)
        </el-button>
        <span class="maint-inline-label">试跑条数</span>
        <el-input-number v-model="limitProxy" :min="0" :max="10000" :step="1" :disabled="scanRunning" controls-position="right"
          class="maint-limit" title="只对按住逐条处理的模式生效（补元数据 / 缩略图 / 精灵图预览），0 = 不限" />
        <span class="maint-inline-note">（与工具栏那个「试跑条数」是同一个值）</span>
      </div>
      <p class="maint-hint">先填 3 之类的小数字跑一小批，确认 ffprobe 路径可用后再全量。</p>
    </section>

    <!-- ============================== 派生资源 ============================== -->
    <section class="maint-group">
      <div class="maint-group-head">
        <span class="maint-group-title">派生资源</span>
        <span class="maint-group-desc">缩略图 / 精灵图 / 预览视频都在 thumbs 下，属于可随时重建的产物</span>
      </div>
      <div class="maint-row">
        <span class="maint-label">缩略图选项</span>
        <el-checkbox v-model="thumbForce" :disabled="scanRunning">强制重建（覆盖已有缩略图）</el-checkbox>
        <el-checkbox v-model="thumbNoFresh" :disabled="scanRunning">关闭新鲜度（不比较源文件时间）</el-checkbox>
      </div>
      <div class="maint-actions">
        <el-button type="primary" plain icon="Picture" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'thumb', options: { force: thumbForce, noFresh: thumbNoFresh } })">
          重建缩略图
        </el-button>
        <el-button type="primary" plain icon="Film" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'sprite,preview' })">
          生成精灵图/预览
        </el-button>
        <el-button type="danger" plain icon="Delete" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="$emit('gc')">
          清理孤儿(GC)
        </el-button>
      </div>
      <p class="maint-hint">
        <strong>清理孤儿(GC)</strong> 会真删 thumbs/v、thumbs/s、thumbs/pv2 下「既不在索引中、也没有同名源文件」的派生文件：媒体源与索引不受影响，但删除不可撤销。
        精灵图 / 预览是<strong>全片解码</strong>，先用上面的试跑条数跑一小批更稳。
      </p>
    </section>

    <!-- ============================== 备份 ============================== -->
    <section class="maint-group">
      <div class="maint-group-head">
        <span class="maint-group-title">备份</span>
        <span class="maint-group-desc">导出便携包到服务器目录（任务日志里会打印落盘路径）</span>
      </div>
      <div class="maint-actions">
        <el-button type="primary" plain icon="Box" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'export', options: {} })">
          导出便携包
        </el-button>
        <el-button icon="Refresh" :loading="exportLoading" v-hasPermi="['media:admin:list']" @click="loadExports">刷新导出列表</el-button>
      </div>
      <div class="maint-sub-title">最近导出（最多 10 次）</div>
      <el-alert v-if="exportError" :title="exportError" type="warning" :closable="false" show-icon class="maint-alert" />
      <el-table v-if="exportRows.length" :data="exportRows" size="small" class="maint-table">
        <el-table-column label="目录" prop="dir" min-width="200" :show-overflow-tooltip="true" />
        <el-table-column label="文件" prop="name" min-width="180" :show-overflow-tooltip="true" />
        <el-table-column label="大小" width="100" align="right">
          <template #default="scope">{{ formatFileSize(scope.row.size) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="scope">
            <el-button link type="primary" icon="Download" :loading="downloadingKey === fileKey(scope.row)"
              :disabled="!!downloadingKey" v-hasPermi="['media:admin:list']" @click="downloadFile(scope.row)">下载</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty :description="exportLoading ? '正在读取导出列表…' : '还没有导出记录（点「导出便携包」生成一个）'" :image-size="60"
        v-if="!exportLoading && !exportError && !exportRows.length" />
      <p class="maint-hint">
        导入恢复<strong>只能走命令行</strong>，并且需要显式加 <code>--force</code>（会覆盖目标库的索引，所以不在界面上开放）。
      </p>
    </section>

    <!-- ============================== 库根 ============================== -->
    <section class="maint-group">
      <div class="maint-group-head">
        <span class="maint-group-title">库根</span>
        <span class="maint-group-desc">媒体根目录清单：改完需要跑一次「重建索引」才会生效</span>
      </div>
      <div class="maint-actions">
        <el-button type="primary" plain icon="FolderOpened" :loading="rootsLoading" v-hasPermi="['media:admin:list']" @click="loadRoots">刷新库根</el-button>
        <el-button icon="Plus" v-hasPermi="['media:admin:edit']" @click="openRootDialog(null)">新增库根</el-button>
      </div>
      <el-alert v-if="rootsError" :title="rootsError" type="warning" :closable="false" show-icon class="maint-alert" />
      <el-alert v-if="rootActionError" :title="rootActionError" type="error" :closable="true" show-icon class="maint-alert"
        @close="rootActionError = ''" />
      <el-table v-if="roots.length" v-loading="rootsLoading" :data="roots" size="small" class="maint-table">
        <el-table-column label="名称" prop="name" min-width="110" :show-overflow-tooltip="true" />
        <el-table-column label="路径" prop="path" min-width="200" :show-overflow-tooltip="true" />
        <el-table-column label="类型" prop="kind" width="80" align="center" />
        <el-table-column label="存在" width="70" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.exists ? 'success' : 'danger'" size="small">{{ scope.row.exists ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="可读" width="70" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.readable ? 'success' : 'danger'" size="small">{{ scope.row.readable ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="视频数" width="80" align="center">
          <template #default="scope">{{ scope.row.videoCount != null ? scope.row.videoCount : '-' }}</template>
        </el-table-column>
        <el-table-column label="图片数" width="80" align="center">
          <template #default="scope">{{ scope.row.photoCount != null ? scope.row.photoCount : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center" fixed="right">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" v-hasPermi="['media:admin:edit']" @click="openRootDialog(scope.row)">编辑</el-button>
            <el-button link type="danger" icon="Delete" :loading="rootDeletingId === scope.row.id" v-hasPermi="['media:admin:edit']"
              @click="confirmDeleteRoot(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty :description="rootsLoading ? '正在读取库根…' : '还没有库根（接口未就绪时这里也会是空的）'" :image-size="60"
        v-if="!rootsLoading && !rootsError && !roots.length" />
    </section>

    <!-- 库根新增 / 编辑 -->
    <el-dialog v-model="rootVisible" :title="rootForm.id ? '编辑库根' : '新增库根'" width="min(520px, 94vw)" append-to-body>
      <el-form :model="rootForm" label-width="72px">
        <el-form-item label="名称">
          <el-input v-model="rootForm.name" maxlength="64" show-word-limit placeholder="展示用名称，如 主视频库" />
        </el-form-item>
        <el-form-item label="路径">
          <el-input v-model="rootForm.path" placeholder="服务器上的绝对路径，如 D:/media/videos" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="rootForm.kind" filterable allow-create default-first-option :disabled="!!rootForm.id"
            placeholder="video / photo / both（可直接输入）" style="width: 100%">
            <el-option label="video（只放视频）" value="video" />
            <el-option label="photo（只放图片）" value="photo" />
            <el-option label="both（两者都有）" value="both" />
          </el-select>
          <span class="maint-inline-note" v-if="rootForm.id">类型只在新增时生效，后端改库根不接受 kind</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="rootForm.note" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="可选" />
        </el-form-item>
      </el-form>
      <p class="maint-hint">保存后不会立即扫描；要生效请跑一次「重建索引」。</p>
      <template #footer>
        <el-button @click="rootVisible = false">取 消</el-button>
        <el-button type="primary" :loading="rootSaving" v-hasPermi="['media:admin:edit']" @click="submitRoot">保 存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="MaintPanel">
import { ref, computed, onMounted, watch, getCurrentInstance } from 'vue'
import fileSaver from 'file-saver'
import { blobValidate } from '@/utils/ruoyi'
import {
  listExports, downloadExport, listRoots, createRoot, updateRoot, deleteRoot,
  getWatchStatus, pauseWatch, resumeWatch, scanNow
} from '@/api/media'
import { errText, notReadyText } from './maint-error'

const props = defineProps({
  /** 与工具栏共用的试跑条数 */
  scanLimit: { type: Number, default: 0 },
  /** 与工具栏共用的运行锁：为 true 时所有按钮禁用 */
  scanRunning: { type: Boolean, default: false },
  /** 任务结束后父级自增，用它触发「最近导出 / 库根」重新读一次 */
  refreshKey: { type: Number, default: 0 }
})

const emit = defineEmits(['update:scanLimit', 'run', 'gc'])

const { proxy } = getCurrentInstance()

// 只在「先跑缩略图」之后才有意义，所以把前置条件也写进确认文案
const FIX_POSTER_CONFIRM = '修复封面路径会把索引里失效的封面指向按磁盘实况纠正：不改媒体源、不重新解码。'
  + '前提是缩略图已经生成——若还没跑过「重建缩略图」，先跑缩略图再修，否则修不到东西。确认执行？'

/* ---------------------------------------------------------------- 自动扫描（监听） */
/* 契约（P2-A）：GET /watch → { enabled, running, roots:[{id,path,registered,lastEventAt,lastScanAt,pending}], debounceSeconds }
   未部署 / 未开启时统一给 NOT_READY_TEXT：面板其余分组照常可用，不弹全局错误。 */

const NOT_READY_TEXT = '自动扫描未启用或接口未就绪（可在配置中开启 qtools.media.watch.enabled）'

const watchInfo = ref({ enabled: false, running: false, debounceSeconds: 0 })
const watchRoots = ref([])
const watchLoading = ref(false)
const watchError = ref('')
const watchBusy = ref(false)
const scanNowLoading = ref(false)

/** 兼容两种返回形态：裸对象，或 AjaxResult{ code, msg, data } */
function unwrapWatch(res) {
  if (res && typeof res === 'object' && !Array.isArray(res) && typeof res.code === 'number') {
    return res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : {}
  }
  return res && typeof res === 'object' && !Array.isArray(res) ? res : {}
}

function applyWatch(res) {
  const body = unwrapWatch(res)
  watchInfo.value = {
    enabled: !!body.enabled,
    running: !!body.running,
    debounceSeconds: Number(body.debounceSeconds) || 0
  }
  const roots = Array.isArray(body.roots) ? body.roots : []
  watchRoots.value = roots.filter(r => r && typeof r === 'object').map(r => ({
    id: r.id != null ? r.id : (r.path || ''),
    path: r.path || '',
    registered: !!r.registered,
    lastEventAt: r.lastEventAt == null ? null : r.lastEventAt,
    lastScanAt: r.lastScanAt == null ? null : r.lastScanAt,
    pending: r.pending == null ? 0 : (Number(r.pending) || 0)
  }))
}

const watchDebounceText = computed(() => {
  const seconds = Number(watchInfo.value.debounceSeconds) || 0
  return seconds > 0 ? seconds + ' 秒' : '若干秒'
})

/** 状态徽标：未启用 / 有任务排队 / 已暂停 / 监听中（顺序即优先级） */
const watchBadge = computed(() => {
  if (!watchInfo.value.enabled) return { text: '未启用', type: 'info' }
  const pending = watchRoots.value.reduce((sum, r) => sum + (Number(r.pending) || 0), 0)
  if (pending > 0) return { text: '有任务排队 ' + pending, type: 'warning' }
  if (!watchInfo.value.running) return { text: '已暂停', type: 'warning' }
  return { text: '监听中', type: 'success' }
})

const watchEmptyText = computed(() => {
  if (watchLoading.value) return '正在读取监听状态…'
  return watchError.value ? NOT_READY_TEXT : '没有登记中的库根（先在下方「库根」里新增，再跑一次重建索引）'
})

/** 时间戳兼容秒 / 毫秒 / ISO 字符串；缺失显示破折号，绝不抛错 */
function formatWatchTime(value) {
  if (value == null || value === '' || value === 0) return '—'
  let ms = NaN
  if (typeof value === 'number') {
    ms = value > 100000000000 ? value : value * 1000
  } else if (typeof value === 'string') {
    const text = value.trim()
    const num = Number(text)
    if (text !== '' && isFinite(num)) {
      ms = num > 100000000000 ? num : num * 1000
    } else {
      ms = Date.parse(text)
    }
  }
  if (!isFinite(ms)) return String(value)
  const date = new Date(ms)
  if (isNaN(date.getTime())) return String(value)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' '
    + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
}

function loadWatch() {
  watchLoading.value = true
  watchError.value = ''
  getWatchStatus(true).then(res => {
    applyWatch(res)
    // 「未启用」不是错误，但要给一次配置指引（否则看不懂为什么一行都没有）
    if (!watchInfo.value.enabled) {
      watchError.value = NOT_READY_TEXT
    }
  }).catch(err => {
    watchInfo.value = { enabled: false, running: false, debounceSeconds: 0 }
    watchRoots.value = []
    const status = err && err.response && err.response.status
    const extra = (status === 404 || status === 501) ? '' : ('（' + (errText(err) || '读取失败') + '）')
    watchError.value = NOT_READY_TEXT + extra
  }).finally(() => {
    watchLoading.value = false
  })
}

function toggleWatch(nextEnabled) {
  if (watchBusy.value) return
  watchBusy.value = true
  watchError.value = ''
  const pending = nextEnabled ? resumeWatch() : pauseWatch()
  pending.then(() => {
    proxy.$modal.msgSuccess(nextEnabled ? '已继续自动扫描' : '已暂停自动扫描')
    loadWatch()
  }).catch(err => {
    watchError.value = (nextEnabled ? '继续监听失败：' : '暂停监听失败：') + (errText(err) || '请求失败，请查看后端日志')
  }).finally(() => {
    watchBusy.value = false
  })
}

function doScanNow() {
  if (scanNowLoading.value) return
  scanNowLoading.value = true
  watchError.value = ''
  scanNow().then(() => {
    proxy.$modal.msgSuccess('已触发一次扫描')
    loadWatch()
  }).catch(err => {
    watchError.value = '立即扫描失败：' + (errText(err) || '请求失败，请查看后端日志')
  }).finally(() => {
    scanNowLoading.value = false
  })
}

/* ---------------------------------------------------------------- 扫描 / 元数据 / 派生 选项 */
const albumMode = ref('dir')
const exclude = ref('')
const thumbForce = ref(false)
const thumbNoFresh = ref(false)

const limitProxy = computed({
  get: () => props.scanLimit,
  set: (val) => emit('update:scanLimit', Number(val) || 0)
})

/** 排除规则：原样透传给后端（逗号分隔），留空则不发该字段 */
function scanOptions() {
  const options = { albumMode: albumMode.value }
  const excludeText = (exclude.value || '').trim()
  if (excludeText) {
    options.exclude = excludeText
  }
  return options
}

/** 统一出口：真正的执行（确认框 / 起任务 / 轮询）在父级复用既有 runScanTask */
function emitRun(payload) {
  if (props.scanRunning) {
    proxy.$modal.msgWarning('已有任务在运行，请等待结束后再触发')
    return
  }
  emit('run', payload || {})
}

/* ---------------------------------------------------------------- 导出包 */
const exportRows = ref([])
const exportLoading = ref(false)
const exportError = ref('')
const downloadingKey = ref('')

function fileKey(row) {
  return (row.dir || '') + '|' + (row.name || '')
}

function formatFileSize(bytes) {
  const num = Number(bytes) || 0
  if (num < 1024) return num + ' B'
  if (num < 1048576) return (num / 1024).toFixed(1) + ' KB'
  if (num < 1073741824) return (num / 1048576).toFixed(1) + ' MB'
  return (num / 1073741824).toFixed(1) + ' GB'
}

/** 导出列表接口未就绪（后端还是旧构建）时：就地提示，不弹全局错误、不阻塞面板 */
function loadExports() {
  exportLoading.value = true
  exportError.value = ''
  listExports(true).then(res => {
    const list = Array.isArray(res) ? res : (res && (res.list || res.items)) || []
    const rows = []
    list.forEach(item => {
      const dir = (item && (item.dir || item.directory)) || ''
      const files = (item && item.files) || []
      files.forEach(file => {
        rows.push({ dir: dir, name: (file && (file.name || file.file)) || '', size: (file && file.size) || 0 })
      })
    })
    exportRows.value = rows
  }).catch(err => {
    exportRows.value = []
    exportError.value = notReadyText(err, '导出列表')
  }).finally(() => {
    exportLoading.value = false
  })
}

function downloadFile(row) {
  if (!row || !row.dir || !row.name || downloadingKey.value) {
    return
  }
  downloadingKey.value = fileKey(row)
  downloadExport(row.dir, row.name).then(data => {
    // 后端出错时会返回 JSON 而不是文件流：先判断再保存，避免存下一个错误页
    if (blobValidate(data)) {
      fileSaver.saveAs(new Blob([data]), row.name)
    } else {
      return data.text().then(text => {
        let message = text
        try {
          const parsed = JSON.parse(text)
          message = parsed.error || parsed.msg || text
        } catch (e) { /* 非 JSON 就原样展示 */ }
        proxy.$modal.notifyError({ title: '下载失败', message: message || '后端未返回文件', duration: 8000 })
      })
    }
  }).catch(err => {
    proxy.$modal.notifyError({ title: '下载失败', message: errText(err) || '请求失败，请查看后端日志', duration: 8000 })
  }).finally(() => {
    downloadingKey.value = ''
  })
}

/* ---------------------------------------------------------------- 库根 */
const roots = ref([])
const rootsLoading = ref(false)
const rootsError = ref('')
const rootActionError = ref('')
const rootVisible = ref(false)
const rootSaving = ref(false)
const rootDeletingId = ref(null)
const rootForm = ref({ id: null, name: '', path: '', kind: 'video', note: '' })

function loadRoots() {
  rootsLoading.value = true
  rootsError.value = ''
  listRoots(true).then(res => {
    const list = Array.isArray(res) ? res : (res && (res.list || res.roots)) || []
    roots.value = list
  }).catch(err => {
    roots.value = []
    rootsError.value = notReadyText(err, '库根接口')
  }).finally(() => {
    rootsLoading.value = false
  })
}

function openRootDialog(row) {
  rootForm.value = row
    ? { id: row.id, name: row.name || '', path: row.path || '', kind: row.kind || 'video', note: row.note || '' }
    : { id: null, name: '', path: '', kind: 'video', note: '' }
  rootActionError.value = ''
  rootVisible.value = true
}

function submitRoot() {
  const form = rootForm.value
  const name = (form.name || '').trim()
  const path = (form.path || '').trim()
  if (!name) {
    proxy.$modal.msgWarning('请填写名称')
    return
  }
  if (!path) {
    proxy.$modal.msgWarning('请填写路径')
    return
  }
  if (rootSaving.value) {
    return
  }
  const data = { name: name, path: path, note: (form.note || '').trim() }
  // 后端 PUT /roots/{id} 只接受 name / path / note：kind 只在新增时传，避免「改了没反应」
  if (!form.id) {
    data.kind = (form.kind || '').trim()
  }
  rootSaving.value = true
  const pending = form.id ? updateRoot(form.id, data) : createRoot(data)
  pending.then(res => {
    const hint = (res && (res.hint || '')) || ''
    proxy.$modal.msgSuccess((form.id ? '库根已更新' : '库根已新增') + (hint ? '：' + hint : ''))
    rootVisible.value = false
    loadRoots()
  }).catch(err => {
    rootActionError.value = (form.id ? '更新库根失败：' : '新增库根失败：') + (errText(err) || '请求失败，请查看后端日志')
  }).finally(() => {
    rootSaving.value = false
  })
}

/** 删库根：二次确认 + 影响说明；后端 400 时把引用数原样展示出来 */
function confirmDeleteRoot(row) {
  if (!row || row.id == null) {
    return
  }
  rootActionError.value = ''
  proxy.$modal.confirm(
    '删除库根「' + (row.name || row.path) + '」只会把它从扫描清单里移除：不删除磁盘上的任何文件，也不清理已入库的记录。'
      + '若仍被引用，后端会拒绝并返回引用数量。确认删除？',
    '删除库根',
    { confirmButtonText: '确认删除', type: 'error' }
  ).then(() => {
    rootDeletingId.value = row.id
    deleteRoot(row.id).then(res => {
      const warning = (res && res.warning) || ''
      proxy.$modal.msgSuccess('库根已删除' + (warning ? '：' + warning : ''))
      loadRoots()
    }).catch(err => {
      rootActionError.value = '删除库根失败：' + (errText(err) || '请求失败，请查看后端日志')
    }).finally(() => {
      rootDeletingId.value = null
    })
  }).catch(() => {})
}

onMounted(() => {
  loadWatch()
  loadExports()
  loadRoots()
})

// 父级的任务刚结束（scanRunning 由 true 变 false 会让 refreshKey 自增）：把导出列表重读一遍
watch(() => props.refreshKey, () => {
  loadWatch()
  loadExports()
  loadRoots()
})
</script>

<style scoped>
.maint-panel {
  padding-bottom: 12px;
}
.maint-lead {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
}
.maint-group {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.maint-group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
}
.maint-group-title {
  font-size: 14px;
  font-weight: 600;
}
.maint-group-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.maint-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.maint-label {
  width: 76px;
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
.maint-row :deep(.el-input),
.maint-row :deep(.el-select) {
  flex: 1;
  min-width: 220px;
}
.maint-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.maint-inline-label {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
.maint-inline-note {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.maint-limit {
  width: 110px;
}
.maint-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}
.maint-hint strong {
  color: var(--el-color-warning);
}
.maint-hint code {
  background: var(--el-fill-color-light);
  padding: 0 3px;
  border-radius: 3px;
}
.maint-sub-title {
  margin: 10px 0 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}
.maint-alert {
  margin-top: 8px;
}
.watch-badge {
  margin-left: auto;
}
.maint-table {
  margin-top: 8px;
}
</style>
