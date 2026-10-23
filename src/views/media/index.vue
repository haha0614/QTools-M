<template>
  <div class="app-container media-page">
    <!-- 统计卡片 -->
    <el-row :gutter="12" class="media-stats">
      <el-col v-for="card in statCards" :key="card.key" :xs="12" :sm="8" :md="4">
        <div class="stat-card">
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-value" :data-stat="card.key">{{ card.value }}</div>
          <div class="stat-sub">{{ card.sub }}</div>
        </div>
      </el-col>
    </el-row>

    <!-- 工具栏 -->
    <div class="media-toolbar">
      <div class="media-toolbar-left">
        <span class="media-page-title">媒体库</span>
        <span class="media-page-sub" v-if="statsUpdatedAt">统计更新于 {{ statsUpdatedAt }}</span>
      </div>
      <div class="media-toolbar-right">
        <el-button icon="Refresh" :loading="statsLoading" @click="refreshAll">刷新</el-button>
        <el-input-number v-model="scanLimit" :min="0" :max="10000" :step="1" :disabled="scanRunning"
          controls-position="right" class="scan-limit" title="试跑条数：只对重建缩略图 / 生成精灵图预览生效，0 = 不限" />
        <el-button type="primary" plain icon="RefreshRight" :loading="scanRunning" :disabled="scanRunning" @click="handleScan('scan')"
          v-hasPermi="['media:admin:scan']">重建索引</el-button>
        <el-button type="primary" plain icon="Picture" :loading="scanRunning" :disabled="scanRunning" @click="handleScan('thumb')"
          v-hasPermi="['media:admin:scan']">重建缩略图</el-button>
        <el-button type="primary" plain icon="Film" :loading="scanRunning" :disabled="scanRunning" @click="handleScan('sprite,preview')"
          v-hasPermi="['media:admin:scan']">生成精灵图/预览</el-button>
        <el-button type="danger" plain icon="Delete" :loading="scanRunning" :disabled="scanRunning" @click="handleGc"
          v-hasPermi="['media:admin:scan']">清理派生文件(GC)</el-button>
      </div>
    </div>

    <!-- 生成类任务的成本提示：全片解码，别一上来就全量跑 -->
    <div class="scan-tip">
      精灵图 / 预览视频是<strong>全片解码</strong>：176 个视频约需 5 小时，建议先在工具栏填「试跑条数」（如 3）跑一小批再全量。
      「清理派生文件(GC)」只删 thumbs/v、thumbs/s、thumbs/pv2 下的孤儿派生文件（媒体源与索引不受影响），但删除不可撤销。
    </div>

    <!-- 扫描进度 -->
    <div class="scan-panel" v-if="scanJob && scanJob.id">
      <div class="scan-head">
        <el-tag :type="scanTagType" size="small">{{ scanStatusText }}</el-tag>
        <span class="scan-text">任务 #{{ scanJob.id }} · {{ scanTypeText(scanJob.type) }} · 开始 {{ scanJob.startedAt || '-' }}</span>
        <span class="scan-count">{{ scanJob.done || 0 }} / {{ scanJob.total || 0 }}</span>
      </div>
      <el-progress :percentage="scanPercent" :status="scanProgressStatus" :stroke-width="10" />
    </div>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- ============================== 视频 ============================== -->
      <el-tab-pane label="视频" name="video">
        <el-form :model="videoQuery" ref="videoQueryRef" :inline="true" class="media-search" label-width="68px">
          <el-form-item label="关键词" prop="keyword">
            <el-input v-model="videoQuery.keyword" placeholder="标题 / 路径" clearable style="width: 180px" @keyup.enter="handleVideoQuery" />
          </el-form-item>
          <el-form-item label="分类" prop="folder">
            <el-select v-model="videoQuery.folder" placeholder="全部分类" clearable style="width: 170px">
              <el-option v-for="item in folderOptions" :key="item.name" :label="item.name + ' (' + item.count + ')'" :value="item.name" />
            </el-select>
          </el-form-item>
          <el-form-item label="编码" prop="vcodec">
            <el-select v-model="videoQuery.vcodec" placeholder="全部编码" clearable style="width: 150px">
              <el-option v-for="item in vcodecOptions" :key="item.codec" :label="item.codec + ' (' + item.count + ')'"
                :value="item.codec" />
            </el-select>
          </el-form-item>
          <el-form-item label="隐藏" prop="hidden">
            <el-select v-model="videoQuery.hidden" style="width: 120px">
              <el-option label="显示全部" value="all" />
              <el-option label="仅显示" value="0" />
              <el-option label="仅隐藏" value="1" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序" prop="sort">
            <el-select v-model="videoQuery.sort" style="width: 150px">
              <el-option v-for="item in videoSorts" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleVideoQuery">搜索</el-button>
            <el-button icon="Refresh" @click="resetVideoQuery">重置筛选</el-button>
          </el-form-item>
        </el-form>

        <el-table v-loading="videoLoading" :data="videoList" class="media-table">
          <el-table-column label="封面" width="66" align="center">
            <template #default="scope">
              <img class="media-cover media-cover-click" :src="mediaSrc('/api/media/thumb/v/' + scope.row.id)" loading="lazy"
                alt="封面" title="点击放大" @click="openVideoPreview(scope.row)" />
            </template>
          </el-table-column>
          <el-table-column label="标题" prop="title" min-width="200" :show-overflow-tooltip="true" />
          <el-table-column label="路径" prop="relPath" min-width="220" :show-overflow-tooltip="true" />
          <el-table-column label="分类" prop="folder" width="110" align="center" />
          <el-table-column label="清晰度" width="110" align="center">
            <template #default="scope">{{ resolution(scope.row) }}</template>
          </el-table-column>
          <el-table-column label="时长" width="90" align="center">
            <template #default="scope">{{ formatDuration(scope.row.dur) }}</template>
          </el-table-column>
          <el-table-column label="体积" width="110" align="right">
            <template #default="scope">{{ formatVolume(scope.row.size) }}</template>
          </el-table-column>
          <el-table-column label="编码" prop="vcodec" width="86" align="center" />
          <el-table-column label="状态" width="86" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.hidden ? 'info' : 'success'" size="small">{{ scope.row.hidden ? '隐藏' : '正常' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" align="center" fixed="right" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-tooltip content="预览" placement="top">
                <el-button link type="primary" icon="View" @click="previewVideo(scope.row)" v-hasPermi="['media:admin:list']" />
              </el-tooltip>
              <el-tooltip :content="scope.row.hidden ? '取消隐藏' : '隐藏'" placement="top">
                <el-button link type="primary" icon="Hide" @click="toggleHidden(scope.row, 'video')" v-hasPermi="['media:admin:edit']" />
              </el-tooltip>
              <el-tooltip content="软删" placement="top">
                <el-button link type="danger" icon="Delete" @click="handleRemove(scope.row, 'video')" v-hasPermi="['media:admin:remove']" />
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
        <pagination v-show="videoTotal > 0" :total="videoTotal" v-model:page="videoQuery.pageNum" v-model:limit="videoQuery.pageSize" @pagination="loadVideos" />
      </el-tab-pane>

      <!-- ============================== 相册 ============================== -->
      <el-tab-pane label="相册" name="album">
        <el-form :model="albumQuery" ref="albumQueryRef" :inline="true" class="media-search" label-width="68px">
          <el-form-item label="关键词" prop="keyword">
            <el-input v-model="albumQuery.keyword" placeholder="标题 / 物理目录" clearable style="width: 180px" @keyup.enter="handleAlbumQuery" />
          </el-form-item>
          <el-form-item label="人物" prop="personId">
            <el-select v-model="albumQuery.personId" placeholder="全部人物" clearable style="width: 180px">
              <el-option v-for="item in peopleOptions" :key="item.id" :label="item.name + ' (' + item.albumCount + ')'" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="隐藏" prop="hidden">
            <el-select v-model="albumQuery.hidden" style="width: 120px">
              <el-option label="显示全部" value="all" />
              <el-option label="仅显示" value="0" />
              <el-option label="仅隐藏" value="1" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序" prop="sort">
            <el-select v-model="albumQuery.sort" style="width: 150px">
              <el-option v-for="item in albumSorts" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleAlbumQuery">搜索</el-button>
            <el-button icon="Refresh" @click="resetAlbumQuery">重置筛选</el-button>
          </el-form-item>
        </el-form>

        <el-table v-loading="albumLoading" :data="albumList" class="media-table">
          <el-table-column label="封面" width="66" align="center">
            <template #default="scope">
              <img class="media-cover media-cover-square media-cover-click" :src="mediaSrc(albumThumb(scope.row))" loading="lazy"
                alt="封面" title="点击放大" @click="openAlbumPreview(scope.row)" />
            </template>
          </el-table-column>
          <el-table-column label="标题" prop="title" min-width="200" :show-overflow-tooltip="true" />
          <el-table-column label="物理目录" prop="dir" min-width="180" :show-overflow-tooltip="true" />
          <el-table-column label="人物" width="120" align="center">
            <template #default="scope">{{ scope.row.person || '未归类' }}</template>
          </el-table-column>
          <el-table-column label="图片数" prop="photoCount" width="90" align="right" />
          <el-table-column label="体积" width="110" align="right">
            <template #default="scope">{{ formatVolume(scope.row.bytes) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="86" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.hidden ? 'info' : 'success'" size="small">{{ scope.row.hidden ? '隐藏' : '正常' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="170" align="center" fixed="right" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-tooltip content="查看图片" placement="top">
                <el-button link type="primary" icon="Picture" @click="openPhotos(scope.row)" v-hasPermi="['media:admin:list']" />
              </el-tooltip>
              <el-tooltip content="改人物" placement="top">
                <el-button link type="primary" icon="User" @click="openPerson(scope.row)" v-hasPermi="['media:admin:edit']" />
              </el-tooltip>
              <el-tooltip :content="scope.row.hidden ? '取消隐藏' : '隐藏'" placement="top">
                <el-button link type="primary" icon="Hide" @click="toggleHidden(scope.row, 'album')" v-hasPermi="['media:admin:edit']" />
              </el-tooltip>
              <el-tooltip content="软删" placement="top">
                <el-button link type="danger" icon="Delete" @click="handleRemove(scope.row, 'album')" v-hasPermi="['media:admin:remove']" />
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
        <pagination v-show="albumTotal > 0" :total="albumTotal" v-model:page="albumQuery.pageNum" v-model:limit="albumQuery.pageSize" @pagination="loadAlbums" />
      </el-tab-pane>

      <!-- ============================== 回收站 ============================== -->
      <el-tab-pane label="回收站" name="trash">
        <el-form :model="trashQuery" :inline="true" class="media-search" label-width="68px">
          <el-form-item label="类型" prop="kind">
            <el-select v-model="trashQuery.kind" style="width: 130px">
              <el-option label="全部类型" value="all" />
              <el-option label="视频" value="video" />
              <el-option label="相册" value="album" />
              <el-option label="图片" value="photo" />
            </el-select>
          </el-form-item>
          <el-form-item label="关键词" prop="keyword">
            <el-input v-model="trashQuery.keyword" placeholder="名称 / 原路径" clearable style="width: 200px" @keyup.enter="handleTrashQuery" />
          </el-form-item>
          <el-form-item label="排序" prop="sort">
            <el-select v-model="trashQuery.sort" style="width: 160px" @change="handleTrashSort">
              <el-option label="删除时间 新→旧" value="deletedAt-desc" />
              <el-option label="删除时间 旧→新" value="deletedAt-asc" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleTrashQuery">搜索</el-button>
            <el-button icon="Refresh" @click="resetTrashQuery">重置</el-button>
          </el-form-item>
        </el-form>

        <el-table v-loading="trashLoading" :data="trashList" class="media-table">
          <el-table-column label="类型" width="86" align="center">
            <template #default="scope">
              <el-tag :type="trashTagType(scope.row.kind)" size="small">{{ trashKindText(scope.row.kind) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="名称" prop="name" min-width="160" :show-overflow-tooltip="true" />
          <el-table-column label="原路径" min-width="220" :show-overflow-tooltip="true">
            <template #default="scope">
              <span v-if="scope.row.originalRel">{{ scope.row.originalRel }}</span>
              <span v-else class="trash-orphan">原记录已丢失</span>
            </template>
          </el-table-column>
          <el-table-column label="大小" width="110" align="right">
            <template #default="scope">{{ formatSize(scope.row.bytes) }}</template>
          </el-table-column>
          <el-table-column label="删除时间" prop="deletedAt" width="160" align="center" />
          <el-table-column label="操作" width="150" align="center" fixed="right" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-tooltip :content="scope.row.orphan ? '原记录已丢失，无法恢复' : '恢复'" placement="top">
                <el-button link type="primary" icon="RefreshLeft" :disabled="scope.row.orphan" @click="handleTrashRestore(scope.row)"
                  v-hasPermi="['media:admin:edit']" />
              </el-tooltip>
              <el-tooltip content="彻底删除（不可恢复）" placement="top">
                <el-button link type="danger" icon="Delete" @click="handleTrashPurge(scope.row)" v-hasPermi="['media:admin:remove']" />
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
        <el-empty description="回收站是空的" v-if="!trashLoading && !trashList.length" />
        <pagination v-show="trashTotal > 0" :total="trashTotal" v-model:page="trashQuery.pageNum" v-model:limit="trashQuery.pageSize"
          @pagination="loadTrash" />
      </el-tab-pane>
    </el-tabs>

    <!-- 图片浏览 -->
    <el-dialog v-model="photosVisible" :title="'图片 · ' + (currentAlbum.title || '')" width="min(680px, 92vw)" append-to-body>
      <div class="photo-grid" v-loading="photosLoading">
        <div class="photo-item" v-for="photo in photoList" :key="photo.id" @click="openPhotoPreview(photo)">
          <img :src="mediaSrc(photo.thumbUrl)" loading="lazy" :alt="'第 ' + photo.seq + ' 张'" />
          <span class="photo-seq">{{ photo.seq }}</span>
        </div>
      </div>
      <el-empty description="暂无图片" v-if="!photosLoading && !photoList.length" />
      <pagination v-show="photoTotal > 0" :page-sizes="[24, 48, 96]" :total="photoTotal" v-model:page="photoQuery.pageNum"
        v-model:limit="photoQuery.pageSize" @pagination="loadPhotos" />
    </el-dialog>

    <!-- 改人物归属 -->
    <el-dialog v-model="personVisible" title="修改人物归属" width="min(420px, 92vw)" append-to-body>
      <el-form :model="personForm" label-width="80px">
        <el-form-item label="相册">
          <span class="person-album">{{ personAlbumTitle }}</span>
        </el-form-item>
        <el-form-item label="人物">
          <el-select v-model="personForm.personId" placeholder="请选择人物" style="width: 100%">
            <el-option label="（未归类 / 清空）" value="" />
            <el-option v-for="item in peopleOptions" :key="item.id" :label="item.name + ' (' + item.albumCount + ')'" :value="item.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="personVisible = false">取 消</el-button>
        <el-button type="primary" :loading="personSubmitting" @click="submitPerson">确 定</el-button>
      </template>
    </el-dialog>

    <!-- 封面放大预览：视频用缩略图，相册优先大图预览、缺 preview 时降级缩略图 -->
    <el-dialog v-model="previewVisible" :title="previewTitle" width="min(920px, 94vw)" append-to-body @closed="onPreviewClosed">
      <div class="preview-stage">
        <img v-if="previewSrc" class="preview-img" :src="mediaSrc(previewSrc)" :alt="previewTitle" @error="onPreviewError"
          @load="onPreviewLoaded" />
        <el-empty description="没有可用的预览图" v-else />
      </div>
      <p class="preview-meta">{{ previewMeta }}</p>
    </el-dialog>
  </div>
</template>

<script setup name="Media">
import { listVideos, listAlbums, listPhotos, setHidden, removeMedia, restoreMedia, setAlbumPerson, listPeople, getStats, startScan, getScanJob, getScanLatest, listTrash, trashStats, purgeTrash } from '@/api/media'

const { proxy } = getCurrentInstance()

const STAT_POLL_INTERVAL = 1500
// 非 axios 资源（图片/视频流）也要走后端的代理前缀，否则 dev server 会把它当 SPA 路由
const MEDIA_BASE = import.meta.env.VITE_APP_BASE_API || ''

const videoSorts = [
  { label: '体积从大到小', value: 'size-desc' },
  { label: '时长从长到短', value: 'dur-desc' },
  { label: '时间从新到旧', value: 'mtime-desc' },
  { label: '标题升序', value: 'title' }
]
const albumSorts = [
  { label: '图片数从多到少', value: 'photoCount-desc' },
  { label: '体积从大到小', value: 'bytes-desc' },
  { label: '标题升序', value: 'title' }
]

const stats = ref({})
const statsLoading = ref(false)
const statsUpdatedAt = ref('')
const folderOptions = ref([])
const peopleOptions = ref([])
const activeTab = ref('video')

// 筛选记忆：只持久化「用户选择」的字段，页码与总数不入库（刷新回到第 1 页更符合预期）
const FILTER_STORAGE = { video: 'media.filter.video', album: 'media.filter.album' }
const FILTER_KEYS = {
  video: ['keyword', 'folder', 'vcodec', 'hidden', 'sort', 'pageSize'],
  album: ['keyword', 'personId', 'hidden', 'sort', 'pageSize']
}
const TRASH_PAGE_MAX = 200 // 与后端 /trash 的 pageSize 上限一致

const videoQuery = reactive({ pageNum: 1, pageSize: 10, keyword: '', folder: '', vcodec: '', hidden: 'all', sort: 'mtime-desc' })
const videoList = ref([])
const videoTotal = ref(0)
const videoLoading = ref(false)
const vcodecOptions = ref([])

const albumQuery = reactive({ pageNum: 1, pageSize: 10, keyword: '', personId: null, hidden: 'all', sort: 'photoCount-desc' })
const albumList = ref([])
const albumTotal = ref(0)
const albumLoading = ref(false)

const trashQuery = reactive({ pageNum: 1, pageSize: 10, kind: 'all', keyword: '', sort: 'deletedAt-desc' })
const trashList = ref([])
const trashTotal = ref(0)
const trashLoading = ref(false)

const photosVisible = ref(false)
const photosLoading = ref(false)
const photoList = ref([])
const photoTotal = ref(0)
const photoQuery = reactive({ pageNum: 1, pageSize: 24, albumId: '' })
const currentAlbum = ref({})

const personVisible = ref(false)
const personSubmitting = ref(false)
const personAlbumTitle = ref('')
const personForm = reactive({ albumId: '', personId: '' })

const previewVisible = ref(false)
const previewTitle = ref('')
const previewSrc = ref('')
const previewFallback = ref('')
const previewMeta = ref('')
const previewNatural = ref('')

const scanJob = ref(null)
const scanRunning = ref(false)
/** 试跑条数：0 = 不限；只对 thumb / sprite,preview 生效（后端对 scan / gc 会 400） */
const scanLimit = ref(0)
let scanTimer = null

/** 统计卡片：6 张（视频/相册/图片/人物/总占用/回收站） */
const statCards = computed(() => {
  const data = stats.value || {}
  return [
    { key: 'videos', label: '视频', value: formatNumber(data.videos), sub: '隐藏 ' + formatNumber(data.hiddenVideos) },
    { key: 'albums', label: '相册', value: formatNumber(data.albums), sub: '隐藏 ' + formatNumber(data.hiddenAlbums) },
    { key: 'photos', label: '图片', value: formatNumber(data.photos), sub: '隐藏 ' + formatNumber(data.hiddenPhotos) },
    { key: 'people', label: '人物', value: formatNumber(data.people), sub: '含未归类' },
    { key: 'bytes', label: '总占用', value: formatGb(data.totalBytes), sub: '视频 ' + formatGb(data.videoBytes) + ' / 相册 ' + formatGb(data.albumBytes) },
    { key: 'trash', label: '回收站', value: formatGb(data.trashBytes), sub: formatNumber(data.trashCount) + ' 个对象' }
  ]
})

const scanStatusText = computed(() => {
  const status = scanJob.value && scanJob.value.status
  if (status === 'running') return '扫描中'
  if (status === 'done') return '已完成'
  if (status === 'failed') return '失败'
  return '已结束'
})
const scanTagType = computed(() => {
  const status = scanJob.value && scanJob.value.status
  if (status === 'running') return 'warning'
  if (status === 'done') return 'success'
  if (status === 'failed') return 'danger'
  return 'info'
})
const scanProgressStatus = computed(() => {
  const status = scanJob.value && scanJob.value.status
  if (status === 'done') return 'success'
  if (status === 'failed') return 'exception'
  return ''
})
const scanPercent = computed(() => {
  const job = scanJob.value || {}
  const total = Number(job.total) || 0
  const done = Number(job.done) || 0
  if (!total) return job.status === 'done' ? 100 : 0
  return Math.min(100, Math.round((done * 100) / total))
})

// ------------------------------------------------------------------ 格式化

function formatNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num.toString() : '0'
}

function formatGb(bytes) {
  const num = Number(bytes) || 0
  return (num / 1073741824).toFixed(1) + ' GB'
}

/**
 * 体积自适应：≥1024MB 用 GB、≥1MB 用 MB、更小用 KB（都保留 1 位小数）。
 * 原来列里固定除以 MB，13597 MB 这种大相册读起来没有量级感。
 */
function formatVolume(bytes) {
  const num = Number(bytes) || 0
  const mb = num / 1048576
  if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'
  if (mb >= 1) return mb.toFixed(1) + ' MB'
  return (num / 1024).toFixed(1) + ' KB'
}

/** 回收站行大小：小文件按 KB 展示（回收站里的多为单图/小目录） */
function formatSize(bytes) {
  const num = Number(bytes) || 0
  if (num < 1024) return num + ' B'
  if (num < 1048576) return (num / 1024).toFixed(1) + ' KB'
  if (num < 1073741824) return (num / 1048576).toFixed(1) + ' MB'
  return (num / 1073741824).toFixed(1) + ' GB'
}

function formatDuration(dur) {
  const seconds = Math.floor(Number(dur) || 0)
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes + ':' + (rest < 10 ? '0' + rest : rest)
}

function resolution(row) {
  if (!row || !row.w || !row.h) return '-'
  return row.w + '×' + row.h
}

/** 非 axios 资源统一加后端前缀（dev 走 /dev-api 代理，prod 与 axios baseURL 一致） */
function mediaSrc(path) {
  if (!path) return ''
  return path.startsWith('http') ? path : MEDIA_BASE + path
}

/** 相册封面序号：cover 形如 thumbs/p/a136/0000.jpg，取其中的序号（无封面取 0） */
function albumCoverSeq(row) {
  const matched = /\/p\/[^/]+\/(\d+)\./.exec((row && row.cover) || '')
  return matched ? String(Number(matched[1])) : '0'
}

function albumThumb(row) {
  return '/api/media/thumb/p/' + row.id + '/' + albumCoverSeq(row)
}

// ------------------------------------------------------------------ 筛选记忆

/** 从 localStorage 恢复视频/相册的筛选条件（只恢复用户选过的字段） */
function restoreFilters(kind, query) {
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(FILTER_STORAGE[kind]) || 'null')
  } catch (e) {
    saved = null
  }
  if (!saved || typeof saved !== 'object') return
  FILTER_KEYS[kind].forEach(key => {
    const value = saved[key]
    if (value !== undefined && value !== null) query[key] = value
  })
}

function persistFilters(kind, query) {
  const data = {}
  FILTER_KEYS[kind].forEach(key => { data[key] = query[key] })
  try {
    localStorage.setItem(FILTER_STORAGE[kind], JSON.stringify(data))
  } catch (e) {
    /* 隐私模式下 localStorage 可能抛错，筛选记忆失败不影响主流程 */
  }
}

function clearFilters(kind) {
  try {
    localStorage.removeItem(FILTER_STORAGE[kind])
  } catch (e) {
    /* 同上 */
  }
}

// ------------------------------------------------------------------ 封面放大

function openVideoPreview(row) {
  previewTitle.value = '视频封面 · ' + (row.title || row.id)
  previewSrc.value = '/api/media/thumb/v/' + row.id
  previewFallback.value = ''
  previewMeta.value = '缩略图接口 /api/media/thumb/v/' + row.id + '（原视频见「预览」按钮）'
  previewVisible.value = true
}

function openAlbumPreview(row) {
  const seq = albumCoverSeq(row)
  previewTitle.value = '相册封面 · ' + (row.title || row.id)
  previewSrc.value = '/api/media/preview/p/' + row.id + '/' + seq
  // 只有 is_big 的照片才有 pv 预览图，缺 preview 时降级到缩略图，避免弹窗必然 404
  previewFallback.value = '/api/media/thumb/p/' + row.id + '/' + seq
  previewMeta.value = '优先大图 preview/p/' + row.id + '/' + seq + '，缺失时自动降级为缩略图'
  previewVisible.value = true
}

function onPreviewLoaded(event) {
  const img = event && event.target
  if (img && img.naturalWidth) previewNatural.value = img.naturalWidth + '×' + img.naturalHeight
}

function onPreviewError() {
  if (previewFallback.value && previewSrc.value !== previewFallback.value) {
    previewSrc.value = previewFallback.value
    previewMeta.value = '该相册没有大图预览（仅 is_big 照片才生成），已降级为缩略图'
    return
  }
  previewSrc.value = ''
  previewMeta.value = '预览图加载失败：' + previewTitle.value
}

function onPreviewClosed() {
  previewNatural.value = ''
}

// ------------------------------------------------------------------ 统计 / 人物

function loadStats() {
  statsLoading.value = true
  getStats().then(res => {
    stats.value = res || {}
    folderOptions.value = (res && res.byFolder) || []
    statsUpdatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  }).finally(() => { statsLoading.value = false })
}

function loadPeople() {
  listPeople().then(res => { peopleOptions.value = res || [] })
}

// ------------------------------------------------------------------ 视频

function loadVideos() {
  videoLoading.value = true
  persistFilters('video', videoQuery)
  const params = buildParams(videoQuery)
  listVideos(params).then(res => {
    videoList.value = (res && res.rows) || []
    videoTotal.value = (res && res.total) || 0
  }).finally(() => { videoLoading.value = false })
}

/**
 * 全库编码枚举：原来是从「当前页」去重，默认每页 10 条时只可能看到 h264，等于筛不出 hevc/mpeg4/vp9。
 * /api/media/admin/stats 没有 vcodec 字段（已核对后端），又不改后端，因此按约定用 pageSize=200 拉一次全库去重。
 * 同时给出每个编码的条数，方便判断「这个编码有多少素材」。
 */
function loadVcodecOptions() {
  listVideos({ pageNum: 1, pageSize: 200 }).then(res => {
    const counter = new Map()
    ;((res && res.rows) || []).forEach(row => {
      if (row.vcodec) counter.set(row.vcodec, (counter.get(row.vcodec) || 0) + 1)
    })
    vcodecOptions.value = Array.from(counter.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([codec, count]) => ({ codec, count }))
  }).catch(() => {
    /* 枚举失败不影响主流程，下拉退化为空（可手动清空筛选） */
  })
}

function handleVideoQuery() {
  videoQuery.pageNum = 1
  loadVideos()
}

function resetVideoQuery() {
  videoQuery.pageNum = 1
  videoQuery.keyword = ''
  videoQuery.folder = ''
  videoQuery.vcodec = ''
  videoQuery.hidden = 'all'
  videoQuery.sort = 'mtime-desc'
  videoQuery.pageSize = 10
  clearFilters('video')
  loadVideos()
}

function previewVideo(row) {
  window.open(mediaSrc('/api/media/file?p=' + encodeURIComponent(row.relPath)), '_blank')
}

// ------------------------------------------------------------------ 相册

function loadAlbums() {
  albumLoading.value = true
  persistFilters('album', albumQuery)
  const params = buildParams(albumQuery)
  listAlbums(params).then(res => {
    albumList.value = (res && res.rows) || []
    albumTotal.value = (res && res.total) || 0
  }).finally(() => { albumLoading.value = false })
}

function handleAlbumQuery() {
  albumQuery.pageNum = 1
  loadAlbums()
}

function resetAlbumQuery() {
  albumQuery.pageNum = 1
  albumQuery.keyword = ''
  albumQuery.personId = null
  albumQuery.hidden = 'all'
  albumQuery.sort = 'photoCount-desc'
  albumQuery.pageSize = 10
  clearFilters('album')
  loadAlbums()
}

function openPhotos(row) {
  currentAlbum.value = row
  photosVisible.value = true
  photoQuery.albumId = row.id
  photoQuery.pageNum = 1
  photoList.value = []
  photoTotal.value = 0
  loadPhotos()
}

function loadPhotos() {
  photosLoading.value = true
  listPhotos({ albumId: photoQuery.albumId, pageNum: photoQuery.pageNum, pageSize: photoQuery.pageSize }).then(res => {
    photoList.value = (res && res.rows) || []
    photoTotal.value = (res && res.total) || 0
  }).finally(() => { photosLoading.value = false })
}

function openPhotoPreview(photo) {
  // 与用户端 photo.js 同一规则：只有 is_big 的照片才生成了 pv 预览图（thumbs/pv 仅 555/9628），
  // 其余直接用原图接口，否则点开必然 404
  const url = photo.isBig
    ? '/api/media/preview/p/' + photoQuery.albumId + '/' + photo.seq
    : '/api/media/file?p=' + encodeURIComponent(photo.relPath)
  window.open(mediaSrc(url), '_blank')
}

function openPerson(row) {
  personForm.albumId = row.id
  personForm.personId = row.personId === null || row.personId === undefined ? '' : row.personId
  personAlbumTitle.value = row.title
  personVisible.value = true
}

function submitPerson() {
  const personId = personForm.personId === '' || personForm.personId === null ? null : personForm.personId
  personSubmitting.value = true
  setAlbumPerson(personForm.albumId, personId).then(() => {
    proxy.$modal.msgSuccess('人物归属已更新')
    personVisible.value = false
    loadStats()
    loadAlbums()
  }).finally(() => { personSubmitting.value = false })
}

// ------------------------------------------------------------------ 隐藏 / 软删

function toggleHidden(row, kind) {
  const next = !row.hidden
  setHidden(kind, row.id, next).then(() => {
    row.hidden = next
    proxy.$modal.msgSuccess(next ? '已隐藏' : '已取消隐藏')
    loadStats()
    if (kind === 'video') { loadVideos() } else { loadAlbums() }
  })
}

function handleRemove(row, kind) {
  const label = kind === 'video' ? '视频《' + row.title + '》' : '相册《' + row.title + '》'
  proxy.$modal.confirm('确认把' + label + '移到回收站，可在回收站恢复？').then(() => {
    removeMedia(kind, row.id).then(() => {
      proxy.$modal.msgSuccess('已移到回收站，可在回收站恢复')
      loadStats()
      if (kind === 'video') { loadVideos() } else { loadAlbums() }
    }).catch(err => {
      // 409（共用目录保护）与其它错误：把后端的 error 文案原样提示，不吞掉
      const detail = errorText(err)
      if (detail) {
        proxy.$modal.notifyError({ title: '不能软删', message: detail, duration: 8000 })
      }
    })
  }).catch(() => {})
}

// ------------------------------------------------------------------ 回收站

const TRASH_KIND_TEXT = { video: '视频', album: '相册', photo: '图片' }
const TRASH_KIND_TAG = { video: 'primary', album: 'warning', photo: 'success' }

function trashKindText(kind) {
  return TRASH_KIND_TEXT[kind] || kind || '-'
}

function trashTagType(kind) {
  return TRASH_KIND_TAG[kind] || 'info'
}

/**
 * 回收站列表。
 * GET /api/media/admin/trash 只接受 kind/keyword/pageNum/pageSize（后端固定按删除时间倒序，没有 sort 参数，
 * 且本次不改后端），所以这里按上限 200 一次性取回，在前端排序后再本地分页 —— 回收站对象数量级很小，
 * 这样「旧→新」才是全量真实排序，而不是只反转当前页。
 */
function loadTrash() {
  trashLoading.value = true
  listTrash(buildParams({ ...trashQuery, sort: undefined, pageNum: 1, pageSize: TRASH_PAGE_MAX })).then(res => {
    const rows = ((res && res.rows) || []).slice()
    rows.sort((a, b) => compareDeletedAt(a, b) * (trashQuery.sort === 'deletedAt-asc' ? 1 : -1))
    trashTotal.value = (res && res.total) || rows.length
    const start = (trashQuery.pageNum - 1) * trashQuery.pageSize
    trashList.value = rows.slice(start, start + trashQuery.pageSize)
  }).finally(() => { trashLoading.value = false })
  loadTrashStats()
}

/** deletedAt 是 'yyyy-MM-dd HH:mm:ss' 字符串，同格式可直接字典序比较；缺失的排最后 */
function compareDeletedAt(a, b) {
  const left = (a && a.deletedAt) || ''
  const right = (b && b.deletedAt) || ''
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  return left < right ? -1 : left > right ? 1 : 0
}

function handleTrashSort() {
  trashQuery.pageNum = 1
  loadTrash()
}

/** 回收站统计只刷顶部卡片（与 /stats 的 trashCount/trashBytes 同源） */
function loadTrashStats() {
  trashStats().then(res => {
    if (!res) return
    stats.value = { ...stats.value, trashCount: res.count, trashBytes: res.bytes }
  })
}

function handleTrashQuery() {
  trashQuery.pageNum = 1
  loadTrash()
}

function resetTrashQuery() {
  trashQuery.pageNum = 1
  trashQuery.kind = 'all'
  trashQuery.keyword = ''
  loadTrash()
}

function handleTrashRestore(row) {
  restoreMedia(row.kind, row.id).then(() => {
    proxy.$modal.msgSuccess('已恢复到原路径')
    loadTrash()
    loadStats()
    if (row.kind === 'album') { loadAlbums() } else { loadVideos() }
  }).catch(err => {
    const detail = errorText(err)
    if (detail) {
      proxy.$modal.notifyError({ title: '恢复失败', message: detail, duration: 8000 })
    }
  })
}

function handleTrashPurge(row) {
  const text = '彻底删除「' + (row.name || row.id) + '」？\n\n这会真正删除磁盘上的'
    + (row.isDir ? '整个目录' : '文件') + '，且不可恢复（不进回收站、也没有备份）。'
  proxy.$modal.confirm(text).then(() => {
    purgeTrash(row.kind, row.id, row.trashRel).then(res => {
      // 后端返回 {purged, bytes, freed}：freed 是本次真正腾出的磁盘空间，直接告诉用户释放了多少
      const freed = Number((res && (res.freed !== undefined ? res.freed : res.bytes)) || 0)
      proxy.$modal.msgSuccess(freed > 0 ? '已彻底删除，释放 ' + formatVolume(freed) : '已彻底删除')
      loadTrash()
      loadStats()
    }).catch(err => {
      const detail = errorText(err)
      if (detail) {
        proxy.$modal.notifyError({ title: '彻底删除失败', message: detail, duration: 8000 })
      }
    })
  }).catch(() => {})
}

// ------------------------------------------------------------------ 重建索引

/** mode → 确认文案；scan / thumb 是原先的「重建索引」「重建缩略图」，行为不变 */
const SCAN_CONFIRM = {
  scan: '重建索引会重新扫描媒体根并刷新索引数据库：不会删除任何文件，会保留隐藏状态与人物归属。确认执行？',
  thumb: '重建缩略图会增量补齐缺失的缩略图：不会删除任何已有文件，也不会重新生成已存在的缩略图。确认执行？',
  'sprite,preview': '精灵图 / 预览视频是【全片解码】，176 个视频约需 5 小时：只新增产物，不删除也不重建已存在的文件。'
    + '想先试跑请把工具栏的「试跑条数」设成 3 之类的小数字。确认执行？'
}
/** GC 的确认文案：真删，必须让人看清删什么、不删什么 */
const GC_CONFIRM = '清理派生文件(GC) 会真删 thumbs/v、thumbs/s、thumbs/pv2 里「既不在索引中、也没有同名源文件」的孤儿派生文件。'
  + '媒体源文件与索引数据库不受影响，但删除不可撤销。确认执行？'

/** 任务 type（后端落库值）→ 中文名；后端 scan 落库仍是 full，兼容旧数据 */
const SCAN_TITLE = {
  full: '重建索引',
  scan: '重建索引',
  thumb: '重建缩略图',
  sprite: '生成精灵图',
  preview: '生成预览视频',
  'sprite,preview': '生成精灵图/预览',
  gc: '清理派生文件(GC)'
}

function scanTypeText(type) {
  return SCAN_TITLE[type] || type || 'full'
}

/** 四种触发共用一套「起任务 → 轮询 job 日志 → 完成提示 + 刷新」流程，只是 mode 与确认文案不同 */
function handleScan(mode = 'scan') {
  const jobMode = mode
  // limit 只对逐条生成的 mode 生效；scan / gc 传了后端会 400，这里直接不发
  const limit = jobMode === 'scan' || jobMode === 'gc' ? 0 : Number(scanLimit.value) || 0
  proxy.$modal.confirm(SCAN_CONFIRM[jobMode] || SCAN_CONFIRM.scan).then(() => {
    runScanTask(jobMode, { limit: limit })
  }).catch(() => {})
}

/** GC：二次确认按钮明确写「确认删除」，请求带 confirm=true（后端没有它直接 400） */
function handleGc() {
  proxy.$modal.confirm(GC_CONFIRM, '清理派生文件(GC)', { confirmButtonText: '确认删除', type: 'error' }).then(() => {
    runScanTask('gc', { confirm: true })
  }).catch(() => {})
}

function runScanTask(mode, options) {
  const title = scanTypeText(mode)
  scanRunning.value = true
  startScan(mode, options).then(res => {
    proxy.$modal.msgSuccess('已开始' + title)
    attachScanJob((res && (res.id || res.jobId)) || null, mode)
  }).catch(err => {
    scanRunning.value = false
    const detail = errorText(err)
    if (isConflict(err)) {
      proxy.$modal.msgWarning(detail || '已有扫描在运行，请等待结束后再触发')
      resumeLatestScan()
    } else {
      proxy.$modal.notifyError({ title: title + '失败', message: detail || '请求失败，请查看后端日志', duration: 8000 })
    }
  })
}

function attachScanJob(jobId, type = 'full') {
  if (!jobId) {
    scanRunning.value = false
    return
  }
  scanJob.value = { id: jobId, type: type, status: 'running', total: 0, done: 0 }
  scanRunning.value = true
  stopScanPolling()
  scanTimer = setInterval(() => pollScan(jobId), STAT_POLL_INTERVAL)
  pollScan(jobId)
}

function pollScan(jobId) {
  getScanJob(jobId).then(res => {
    scanJob.value = res
    if (!res || res.status !== 'running') {
      stopScanPolling()
      scanRunning.value = false
      loadStats()
      // 只有重建索引（full）会改索引；thumb / sprite / preview / gc 只动 thumbs/，重拉列表没有意义
      if (res && res.type === 'full') {
        loadVcodecOptions()
        if (activeTab.value === 'trash') { loadTrash() } else if (activeTab.value === 'album') { loadAlbums() } else { loadVideos() }
      }
      notifyScanFinished(res)
    }
  }).catch(() => {
    stopScanPolling()
    scanRunning.value = false
  })
}

/** 任务结束的可见反馈：成功报进度计数，失败带最后一行日志（后端的可读错误就在这里） */
function notifyScanFinished(job) {
  if (!job || !job.id) {
    return
  }
  const title = scanTypeText(job.type)
  if (job.status === 'done') {
    proxy.$modal.msgSuccess(title + '完成：' + (job.done || 0) + ' / ' + (job.total || 0))
  } else if (job.status === 'failed') {
    proxy.$modal.notifyError({ title: title + '失败', message: lastLogLine(job), duration: 8000 })
  }
}

function lastLogLine(job) {
  const lines = (job && job.logTail) || []
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] && lines[i].trim()) {
      return lines[i].trim()
    }
  }
  return '任务失败，请查看任务日志'
}

function resumeLatestScan() {
  getScanLatest().then(res => {
    if (res && res.id && res.status === 'running') {
      attachScanJob(res.id, res.type)
    } else if (res && res.id) {
      scanJob.value = res
    }
  })
}

function stopScanPolling() {
  if (scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }
}

// ------------------------------------------------------------------ 工具

/** 空筛选值不传给后端（hidden=all 由后端归一化，这里直接省略） */
function buildParams(query) {
  const params = { ...query }
  Object.keys(params).forEach(key => {
    const value = params[key]
    if (value === '' || value === null || value === undefined || (key === 'hidden' && value === 'all')) {
      delete params[key]
    }
  })
  return params
}

function isConflict(err) {
  return !!(err && err.response && err.response.status === 409)
}

function errorText(err) {
  const data = err && err.response && err.response.data
  if (data && typeof data === 'object') {
    return data.error || data.msg || ''
  }
  return ''
}

// ------------------------------------------------------------------ 生命周期

function handleTabChange(name) {
  if (name === 'trash') { loadTrash() } else if (name === 'album') { loadAlbums() } else { loadVideos() }
}

function refreshAll() {
  loadStats()
  loadPeople()
  loadVcodecOptions()
  if (activeTab.value === 'trash') { loadTrash() } else if (activeTab.value === 'album') { loadAlbums() } else { loadVideos() }
}

onMounted(() => {
  // 先恢复上次的筛选（视频/相册），再发首屏请求，避免先按默认条件拉一遍
  restoreFilters('video', videoQuery)
  restoreFilters('album', albumQuery)
  loadStats()
  loadPeople()
  loadVcodecOptions()
  loadVideos()
  getScanLatest().then(res => {
    if (res && res.id && res.status === 'running') {
      attachScanJob(res.id, res.type)
    } else if (res && res.id) {
      scanJob.value = res
    }
  })
})

onBeforeUnmount(() => { stopScanPolling() })
</script>

<style scoped>
.media-stats {
  margin-bottom: 4px;
}
.stat-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--el-bg-color);
}
.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.stat-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  margin-top: 2px;
  word-break: break-all;
}
.stat-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
  word-break: break-all;
}
.media-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 8px;
}
.media-toolbar-left {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}
.media-page-title {
  font-size: 16px;
  font-weight: 600;
}
.media-page-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.media-toolbar-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.scan-limit {
  width: 130px;
}
.scan-tip {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.scan-tip strong {
  color: var(--el-color-warning);
}
.scan-panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--el-fill-color-lighter);
}
.scan-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}
.scan-count {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.media-cover {
  width: 40px;
  height: 60px;
  object-fit: cover;
  border-radius: 3px;
  background: var(--el-fill-color-light);
}
.media-cover-square {
  height: 40px;
}
.media-cover-click {
  cursor: zoom-in;
  transition: transform 0.15s ease;
}
.media-cover-click:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.preview-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  background: var(--el-fill-color-lighter);
  border-radius: 4px;
  padding: 8px;
}
.preview-img {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  background: var(--el-fill-color-light);
}
.preview-meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px;
  min-height: 40px;
}
.photo-item {
  position: relative;
  cursor: pointer;
  line-height: 0;
}
.photo-item img {
  width: 100%;
  height: 84px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--el-fill-color-light);
}
.photo-seq {
  position: absolute;
  left: 4px;
  bottom: 4px;
  font-size: 11px;
  line-height: 1;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 3px;
  padding: 2px 4px;
}
.person-album {
  word-break: break-all;
}
.trash-orphan {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
@media (max-width: 560px) {
  .media-page :deep(.el-pagination__sizes),
  .media-page :deep(.el-pagination__jump) {
    display: none;
  }
  .media-page :deep(.el-pagination) {
    flex-wrap: wrap;
  }
}
</style>
