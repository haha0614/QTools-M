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
        <span class="maint-group-desc">后端文件监听：库根里出现新文件（防抖 {{ watchDebounceText }}，夜间静默 {{ watchQuietText }}）后自动重建索引</span>
        <el-tag :type="watchBadge.type" size="small" class="watch-badge">{{ watchBadge.text }}</el-tag>
      </div>
      <el-alert v-if="watchError" :title="watchError" type="warning" :closable="false" show-icon class="maint-alert" />

      <!-- 运行期开关：切一下就是 PUT /watch/config，失败回滚到后端真值 -->
      <div class="maint-actions watch-toggle-row">
        <span class="maint-inline-label">监听开关</span>
        <el-switch v-model="watchEnabled" :disabled="!watchAllowed || watchEnabledBusy" :loading="watchEnabledBusy"
          active-text="开启" inactive-text="关闭" v-hasPermi="['media:admin:edit']" @change="onEnabledChange" />
        <span class="maint-inline-note">切换即保存（PUT /api/media/admin/watch/config），不必重启后端</span>
      </div>
      <el-alert v-if="!watchAllowed" type="info" :closable="false" show-icon class="maint-alert"
        title="部署层已禁止运行期开关（qtools.media.watch.allowRuntimeToggle=false）" />

      <!-- 去抖 / 夜间静默：点「保存」才提交（数字框连续点击时不会每一下都发一次 PUT） -->
      <div class="maint-actions watch-cfg-row">
        <span class="maint-inline-label">去抖</span>
        <el-input-number v-model="watchDebounce" :min="1" :max="60" :step="1" step-strictly controls-position="right"
          :disabled="!watchAllowed || watchCfgSaving" class="watch-cfg-number" />
        <span class="maint-inline-note">秒</span>
        <span class="maint-inline-label">夜间静默</span>
        <el-input v-model="watchQuiet" clearable placeholder="HH:mm-HH:mm，留空=全天监听" class="watch-cfg-quiet"
          :disabled="!watchAllowed || watchCfgSaving" />
        <el-button type="primary" plain icon="Check" :loading="watchCfgSaving"
          :disabled="!watchAllowed || !watchCfgDirty || watchCfgSaving"
          v-hasPermi="['media:admin:edit']" @click="saveWatchConfig">保存</el-button>
        <span class="maint-inline-note">{{ watchCfgDirty ? '有未保存的改动' : '与后端一致' }}</span>
      </div>

      <div class="maint-actions">
        <el-button icon="Refresh" :loading="watchLoading" v-hasPermi="['media:admin:list']" @click="loadWatch">刷新状态</el-button>
        <el-tooltip :disabled="!watchActionTip" :content="watchActionTip" placement="top">
          <span class="watch-tip-wrap">
            <el-button v-if="watchInfo.running" icon="VideoPause" :loading="watchBusy" :disabled="watchPauseResumeDisabled"
              v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="toggleWatch(false)">暂停</el-button>
            <el-button v-else type="primary" plain icon="VideoPlay" :loading="watchBusy" :disabled="watchPauseResumeDisabled"
              v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="toggleWatch(true)">继续</el-button>
          </span>
        </el-tooltip>
        <el-button type="primary" plain icon="RefreshRight" :loading="scanNowLoading" :disabled="scanNowLoading || scanRunning"
          v-hasPermi="['media:admin:scan', 'media:admin:edit']" @click="doScanNow">立即扫描</el-button>
        <span class="maint-inline-note">暂停只停监听，不打断已在跑的任务；监听未开时「立即扫描」仍可用（后端回落到直接扫描）</span>
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
        上方的开关与两个参数走 <code>PUT /api/media/admin/watch/config</code> 在运行期生效（不重启后端）；
        部署层可设 <code>qtools.media.watch.allowRuntimeToggle=false</code> 关掉这个能力，此时开关与参数输入全部置灰，改动仍只能改配置文件后重启。
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
      <!-- P5.10-B：只处理「视频」列表里勾选的行；没勾选时下面两个「生成选中项」按钮禁用 -->
      <div class="maint-row">
        <span class="maint-label">勾选视频</span>
        <span class="maint-inline-note" data-testid="maint-selected" :data-count="selectedIdCount">
          <template v-if="selectedIdCount">已选 {{ selectedIdCount }} 项：下面两个「生成选中项」只对这些 id 生效</template>
          <template v-else>未勾选任何视频：先到「视频」列表勾选，再用「生成选中项」（否则只能整库跑）</template>
        </span>
      </div>
      <div class="maint-row">
        <span class="maint-label">派生资源选项</span>
        <el-checkbox v-model="deriveForce" :disabled="scanRunning">强制重建（忽略新鲜度、全部重生成）</el-checkbox>
        <el-checkbox v-model="deriveNoFresh" :disabled="scanRunning">关闭新鲜度（不比较源文件时间）</el-checkbox>
        <span class="maint-inline-note">影响：重建缩略图 / 生成精灵图·预览</span>
      </div>
      <el-alert v-if="deriveForce" type="warning" :closable="false" show-icon class="maint-alert"
        title="强制重建会覆盖已有产物：全库精灵图 / 预览是【全片解码】，176 个视频约需 9–11 小时（缩略图快得多）。"
        description="先用上面的「试跑条数」小规模验证再全量跑：条数按「封面 / 精灵图 / 预览」三件产物计数，限 3 条 ≈ 1 个视频的精灵图 + 预览片段。" />
      <div class="maint-actions">
        <el-button type="primary" plain icon="Picture" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'thumb', options: deriveOptions() })">
          重建缩略图
        </el-button>
        <el-button type="primary" plain icon="Film" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="emitRun({ mode: 'sprite,preview', options: deriveOptions(), confirm: deriveForce ? SPRITE_PREVIEW_FORCE_CONFIRM : '' })">
          生成精灵图/预览
        </el-button>
        <el-button type="danger" plain icon="Delete" :loading="scanRunning" :disabled="scanRunning" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
          @click="$emit('gc')">
          清理孤儿(GC)
        </el-button>
      </div>
      <!-- P5.10-B：只生成勾选的视频（请求体带 videoIds，后端只对 thumb / sprite / preview 生效） -->
      <div class="maint-actions">
        <el-tooltip :disabled="selectedIdCount > 0" content="先在「视频」列表勾选要处理的视频" placement="top">
          <span class="maint-tip-wrap">
            <el-button type="success" plain icon="PictureFilled" :loading="scanRunning"
              :disabled="scanRunning || !selectedIdCount" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
              @click="emitSelected('thumb', '重建缩略图')">
              生成选中项（缩略图）
            </el-button>
          </span>
        </el-tooltip>
        <el-tooltip :disabled="selectedIdCount > 0" content="先在「视频」列表勾选要处理的视频" placement="top">
          <span class="maint-tip-wrap">
            <el-button type="success" plain icon="Film" :loading="scanRunning"
              :disabled="scanRunning || !selectedIdCount" v-hasPermi="['media:admin:scan', 'media:admin:edit']"
              @click="emitSelected('sprite,preview', '生成精灵图/预览')">
              生成选中项（精灵图/预览）
            </el-button>
          </span>
        </el-tooltip>
        <span class="maint-inline-note">勾选 {{ selectedIdCount }} 项；与上面两个整库按钮共用同一把任务锁</span>
      </div>
      <p class="maint-hint">
        <strong>清理孤儿(GC)</strong> 会真删 thumbs/v、thumbs/s、thumbs/pv2 下「既不在索引中、也没有同名源文件」的派生文件：媒体源与索引不受影响，但删除不可撤销。
        精灵图 / 预览是<strong>全片解码</strong>，先用上面的试跑条数跑一小批更稳。
        上面的「强制重建 / 关闭新鲜度」<strong>对两个按钮同时生效</strong>：换上新的取帧算法后要重生成旧片段，
        必须勾「强制重建」（否则产物 mtime 比源文件新，脚本判定「已是最新」直接跳过）。
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
  getWatchStatus, pauseWatch, resumeWatch, scanNow, updateWatchConfig
} from '@/api/media'
import { errText, errStatus, notReadyText } from './maint-error'

const props = defineProps({
  /** 与工具栏共用的试跑条数 */
  scanLimit: { type: Number, default: 0 },
  /** 与工具栏共用的运行锁：为 true 时所有按钮禁用 */
  scanRunning: { type: Boolean, default: false },
  /** 任务结束后父级自增，用它触发「最近导出 / 库根」重新读一次 */
  refreshKey: { type: Number, default: 0 },
  /** 视频列表当前勾选的 videoId（P5.10-B：「生成选中项」据此带 videoIds；空数组时按钮禁用） */
  selectedVideoIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:scanLimit', 'run', 'gc'])

const { proxy } = getCurrentInstance()

// 只在「先跑缩略图」之后才有意义，所以把前置条件也写进确认文案
const FIX_POSTER_CONFIRM = '修复封面路径会把索引里失效的封面指向按磁盘实况纠正：不改媒体源、不重新解码。'
  + '前提是缩略图已经生成——若还没跑过「重建缩略图」，先跑缩略图再修，否则修不到东西。确认执行？'

/* ---------------------------------------------------------------- 自动扫描（监听） */
/* 契约（P2-A）：GET /watch → { enabled, running, roots:[{id,path,registered,lastEventAt,lastScanAt,pending}], debounceSeconds }
   未部署时给 NOT_READY_TEXT、只是没开启时给 DISABLED_TEXT：面板其余分组照常可用，不弹全局错误。
   契约（P2-C）：GET 多出 { allowed, paused, quietMinutes, hint }；PUT /watch/config
   body { enabled?, debounceSeconds?, quietMinutes? } 回同一结构，allowRuntimeToggle=false 时 403。 */

const NOT_READY_TEXT = '自动扫描接口未就绪：后端部署后刷新页面即可'
const DISABLED_TEXT = '自动扫描未开启：用上方开关在运行期打开即可（无需改配置或重启）'
/** 夜间静默时段：HH:mm-HH:mm，空串 = 全天监听（与后端一致，后端只认这个形状） */
const QUIET_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/

const watchInfo = ref({ enabled: false, running: false, paused: false, allowed: true, debounceSeconds: 0, quietMinutes: '' })
const watchRoots = ref([])
const watchLoading = ref(false)
const watchError = ref('')
const watchBusy = ref(false)
const scanNowLoading = ref(false)
/* P2-C 运行期开关：watchEnabled 是开关显示的本地态（PUT 期间先跟随点击，失败回滚），
   watchDebounce / watchQuiet 是输入框编辑态（点「保存」才提交，不等同于已存值）。 */
const watchEnabled = ref(false)
const watchEnabledBusy = ref(false)
const watchDebounce = ref(0)
const watchQuiet = ref('')
const watchCfgSaving = ref(false)

/** 兼容两种返回形态：裸对象，或 AjaxResult{ code, msg, data } */
function unwrapWatch(res) {
  if (res && typeof res === 'object' && !Array.isArray(res) && typeof res.code === 'number') {
    return res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : {}
  }
  return res && typeof res === 'object' && !Array.isArray(res) ? res : {}
}

/** 返回体里带 roots 才算「可整体刷新」；没带就用一次 GET 补齐（旧后端 / 精简返回） */
function hasWatchRoots(res) {
  return Array.isArray(unwrapWatch(res).roots)
}

function applyWatch(res) {
  const body = unwrapWatch(res)
  // 先按旧基线判一次「输入框有未保存改动」：刷新状态不该把正在编辑的值冲掉
  const dirty = watchCfgDirty.value
  watchInfo.value = {
    enabled: !!body.enabled,
    running: !!body.running,
    paused: body.paused == null ? (!!body.enabled && !body.running) : !!body.paused,
    allowed: body.allowed == null ? true : !!body.allowed,
    debounceSeconds: Number(body.debounceSeconds) || 0,
    quietMinutes: body.quietMinutes == null ? '' : String(body.quietMinutes)
  }
  watchEnabled.value = watchInfo.value.enabled
  if (!dirty) {
    watchDebounce.value = watchInfo.value.debounceSeconds
    watchQuiet.value = watchInfo.value.quietMinutes
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

const watchQuietText = computed(() => {
  const text = String(watchInfo.value.quietMinutes == null ? '' : watchInfo.value.quietMinutes).trim()
  return text || '不静默'
})

/** allowed=false 只跟部署层开关走（403 之后也当成部署层禁止） */
const watchAllowed = computed(() => watchInfo.value.allowed !== false)

/** 输入框与已存值的差异，决定「保存」能不能点 */
const watchCfgDirty = computed(() => {
  const savedDebounce = Number(watchInfo.value.debounceSeconds) || 0
  const savedQuiet = String(watchInfo.value.quietMinutes == null ? '' : watchInfo.value.quietMinutes).trim()
  return Number(watchDebounce.value) !== savedDebounce || String(watchQuiet.value || '').trim() !== savedQuiet
})

/** 监听没开时后端 pause/resume 直接 409，按钮就先置灰 */
const watchPauseResumeDisabled = computed(() => watchBusy.value || !watchInfo.value.enabled)
const watchActionTip = computed(() => {
  if (!watchInfo.value.enabled) {
    return '监听未开启：暂停/继续会被后端拒绝（409），先用上方开关打开监听'
  }
  return watchBusy.value ? '正在与后端同步监听状态…' : ''
})

/** 状态徽标：未启用 / 有任务排队 / 已暂停 / 监听中（顺序即优先级） */
const watchBadge = computed(() => {
  if (!watchInfo.value.enabled) return { text: '未启用', type: 'info' }
  const pending = watchRoots.value.reduce((sum, r) => sum + (Number(r.pending) || 0), 0)
  if (pending > 0) return { text: '有任务排队 ' + pending, type: 'warning' }
  if (watchInfo.value.paused || !watchInfo.value.running) return { text: '已暂停', type: 'warning' }
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
      watchError.value = DISABLED_TEXT
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

/** 开关：点下去先跟随手指，PUT 成功后按返回体刷新，失败回滚到点击前的值并把后端原文 toast 出来 */
function onEnabledChange(next) {
  if (!watchAllowed.value || watchEnabledBusy.value) {
    watchEnabled.value = !next
    return
  }
  const previous = !next
  watchEnabledBusy.value = true
  watchError.value = ''
  updateWatchConfig({ enabled: next }).then(res => {
    applyWatch(res)
    proxy.$modal.msgSuccess(next ? '已开启自动扫描' : '已关闭自动扫描')
    if (!hasWatchRoots(res)) {
      loadWatch()
    }
  }).catch(err => {
    watchEnabled.value = previous
    const text = errText(err) || '请求失败，请查看后端日志'
    proxy.$modal.msgError(text)
    watchError.value = (next ? '开启监听失败：' : '关闭监听失败：') + text
    // 403 可能是部署层禁止运行期开关、也可能只是缺 media:admin:edit：重读一次，allowed 由后端说了算
    if (errStatus(err) === 403) {
      loadWatch()
    }
  }).finally(() => {
    watchEnabledBusy.value = false
  })
}

/** 去抖 / 夜间静默：只在点「保存」时提交；校验不过就地提示，不发请求 */
function saveWatchConfig() {
  if (watchCfgSaving.value || !watchAllowed.value) return
  const debounce = Number(watchDebounce.value)
  if (!(debounce >= 1 && debounce <= 60)) {
    proxy.$modal.msgError('去抖秒数需在 1-60 之间')
    return
  }
  const quiet = String(watchQuiet.value == null ? '' : watchQuiet.value).trim()
  if (quiet && !QUIET_RE.test(quiet)) {
    proxy.$modal.msgError('夜间静默格式应为 HH:mm-HH:mm（留空=全天监听）')
    return
  }
  watchCfgSaving.value = true
  watchError.value = ''
  updateWatchConfig({ debounceSeconds: debounce, quietMinutes: quiet }).then(res => {
    applyWatch(res)
    proxy.$modal.msgSuccess('已保存扫描参数')
    if (!hasWatchRoots(res)) {
      loadWatch()
    }
  }).catch(err => {
    const text = errText(err) || '请求失败，请查看后端日志'
    proxy.$modal.msgError(text)
    watchError.value = '保存扫描参数失败：' + text
    if (errStatus(err) === 403) {
      loadWatch()
    }
  }).finally(() => {
    watchCfgSaving.value = false
  })
}

/* ---------------------------------------------------------------- 扫描 / 元数据 / 派生 选项 */
const albumMode = ref('dir')
const exclude = ref('')
/** 派生资源的两个共用开关：缩略图与精灵图/预览同源同义，按钮各自按勾选值发 force / noFresh */
const deriveForce = ref(false)
const deriveNoFresh = ref(false)

/** 勾了强制重建时精灵图/预览的确认文案：全库重跑是小时级，先小批量验证 */
const SPRITE_PREVIEW_FORCE_CONFIRM = '强制重建会把全库精灵图 / 预览重新解码一遍：176 个视频约需 9–11 小时，'
  + '期间同一时刻只能跑这一个任务。建议先把「试跑条数」设成 3 之类的数字，确认取帧效果符合预期后再去掉条数限制全量重建。'
  + '确认现在就开始强制重建？'

/** 派生资源按钮的公共请求参数：force / noFresh 只在勾选时才发（后端两种 mode 都认） */
function deriveOptions() {
  const options = {}
  if (deriveForce.value) {
    options.force = true
  }
  if (deriveNoFresh.value) {
    options.noFresh = true
  }
  return options
}

/** 勾选的 videoId（全部归一成字符串，避免 id 类型不一致漏传） */
const selectedIds = computed(() => (Array.isArray(props.selectedVideoIds) ? props.selectedVideoIds : [])
  .map(id => (id == null ? '' : String(id)))
  .filter(id => id !== ''))
const selectedIdCount = computed(() => selectedIds.value.length)

/** 只处理勾选项：沿用同一套派生资源选项，再补 videoIds；确认文案写清「只动这几个 id」 */
function emitSelected(mode, title) {
  if (!selectedIdCount.value) {
    proxy.$modal.msgWarning('先在「视频」列表勾选要处理的视频')
    return
  }
  const options = deriveOptions()
  options.videoIds = selectedIds.value.slice()
  const base = '只处理列表里勾选的 ' + selectedIdCount.value + ' 个视频（请求体带 videoIds，后端只对这些 id 生效）。'
  const confirm = deriveForce.value ? base + SPRITE_PREVIEW_FORCE_CONFIRM : base + '确认执行「' + title + '」？'
  emitRun({ mode: mode, options: options, confirm: confirm, title: title + '（选中项）' })
}

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
.watch-toggle-row,
.watch-cfg-row {
  margin-top: 8px;
}
.watch-cfg-number {
  width: 120px;
}
.watch-cfg-quiet {
  width: 220px;
}
/* 禁用的 el-button 不派发事件，包一层 span 才能让 tooltip 有东西可挂 */
.watch-tip-wrap,
.maint-tip-wrap {
  display: inline-flex;
}
.maint-table {
  margin-top: 8px;
}
</style>
