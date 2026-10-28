<template>
  <div class="maint-panel">
    <p class="maint-lead">
      把命令行维护操作变成按钮。<strong>任一时刻只允许一个任务</strong>（与工具栏「扫描 / 导入」共用同一把锁：任务运行中所有按钮都会禁用）。
      日常只需要第一段；诊断段平时不用点；危险段默认收起，必须输入「确认」才会执行。
    </p>
    <p class="maint-lead">
      权限：查看本面板需要 <code>media:admin:list</code>；执行扫描类任务由后端校验 <code>media:admin:scan</code>（按钮同时接受
      <code>media:admin:edit</code>）；清空回收站需要 <code>media:admin:remove</code>。缺权限时后端返回 403，面板会就地给出错误。
    </p>

    <!-- ============================== 1 日常生成 ============================== -->
    <section class="maint-group" data-testid="maint-section-generate">
      <div class="maint-group-head">
        <span class="maint-group-title">日常生成</span>
        <span class="maint-group-desc">生成可随时重建的派生资源；先选范围再开始，选中项只处理视频列表里勾选的行</span>
      </div>
      <div class="maint-row maint-options-row">
        <span class="maint-label">派生选项</span>
        <el-checkbox v-model="deriveForce" :disabled="scanRunning">强制重建（忽略新鲜度、全部重生成）</el-checkbox>
        <el-checkbox v-model="deriveNoFresh" :disabled="scanRunning">关闭新鲜度（不比较源文件时间）</el-checkbox>
        <span class="maint-inline-label">试跑条数</span>
        <el-input v-model="limitProxy" type="number" min="0" max="10000" :disabled="scanRunning"
          class="maint-limit" data-testid="maint-scan-limit"
          title="只对逐条处理的模式生效（补元数据 / 缩略图 / 精灵图 / 预览），0 = 不限" />
        <span class="maint-inline-note">0 = 不限</span>
      </div>
      <el-alert v-if="deriveForce" type="warning" :closable="false" show-icon class="maint-alert"
        title="强制重建会覆盖已有产物：全库精灵图 / 预览是【全片解码】，176 个视频约需 9–11 小时（缩略图快得多）。"
        description="先在工具栏把试跑条数设成 3 之类的小数字验证，再去掉条数全量跑。" />

      <div class="maint-task" data-testid="maint-task-thumb">
        <div class="maint-task-line">
          <span class="maint-task-title">生成缩略图</span>
          <maint-scope v-model="scopes.thumb" supported :filter-active="filterActive" :filter-count="filteredCount"
            :selected-count="selectedIdCount" :disabled="scanRunning" testid="thumb" />
          <el-button type="primary" plain icon="Picture" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-start-thumb"
            @click="runGenerate('thumb', 'thumb', '生成缩略图')">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-thumb">上次：{{ lastText('thumb') }}</div>
      </div>

      <div class="maint-task" data-testid="maint-task-sprite">
        <div class="maint-task-line">
          <span class="maint-task-title">生成精灵图</span>
          <maint-scope v-model="scopes.sprite" supported :filter-active="filterActive" :filter-count="filteredCount"
            :selected-count="selectedIdCount" :disabled="scanRunning" testid="sprite" />
          <el-button type="primary" plain icon="Film" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-start-sprite"
            @click="runGenerate('sprite', 'sprite', '生成精灵图')">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-sprite">上次：{{ lastText('sprite') }}</div>
      </div>

      <div class="maint-task" data-testid="maint-task-preview">
        <div class="maint-task-line">
          <span class="maint-task-title">生成预览片段</span>
          <maint-scope v-model="scopes.preview" supported :filter-active="filterActive" :filter-count="filteredCount"
            :selected-count="selectedIdCount" :disabled="scanRunning" testid="preview" />
          <el-button type="primary" plain icon="VideoCamera" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-start-preview"
            @click="runGenerate('preview', 'preview', '生成预览片段')">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-preview">上次：{{ lastText('preview') }}</div>
      </div>

      <!-- 原「生成精灵图/预览」一键任务的等价入口：保留合并模式，避免 P6.04 精简把这个能力弄丢 -->
      <div class="maint-task" data-testid="maint-task-sprite-preview">
        <div class="maint-task-line">
          <span class="maint-task-title">生成精灵图 + 预览片段</span>
          <maint-scope v-model="scopes.spritePreview" supported :filter-active="filterActive" :filter-count="filteredCount"
            :selected-count="selectedIdCount" :disabled="scanRunning" testid="sprite-preview" />
          <el-button type="primary" plain icon="Film" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-start-sprite-preview"
            @click="runGenerate('spritePreview', 'sprite,preview', '生成精灵图 + 预览片段')">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-sprite-preview">上次：{{ lastText('sprite,preview') }}</div>
      </div>

      <p class="maint-hint">
        <strong>范围</strong>：「当前筛选结果」按视频页当前的筛选条件从后端重新取 id（最多 200 条，与后端 videoIds 上限一致）；
        「选中项」只带视频列表里勾选的 id。精灵图 / 预览是全片解码，先用工具栏「试跑条数」小批量验证。
      </p>
    </section>

    <!-- ============================== 2 清理 ============================== -->
    <section class="maint-group" data-testid="maint-section-clean">
      <div class="maint-group-head">
        <span class="maint-group-title">清理</span>
        <span class="maint-group-desc">删除可重建的产物或已经删掉的内容；删除动作不可撤销</span>
      </div>

      <div class="maint-task" data-testid="maint-task-gc">
        <div class="maint-task-line">
          <span class="maint-task-title">清理派生资源（GC）</span>
          <maint-scope v-model="allScope" :disabled="scanRunning" testid="gc" note="GC 只支持整库：后端没有 ids 参数" />
          <span class="maint-inline-note" data-testid="maint-gc-used">已用 {{ gcUsedText }}</span>
          <el-tooltip content="thumbs 下可安全删除的派生文件总量（缩略图 / 精灵图 / 预览），随时可重建" placement="top">
            <el-icon class="maint-info-icon"><InfoFilled /></el-icon>
          </el-tooltip>
          <el-button type="danger" plain icon="Delete" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-start-gc"
            @click="startGc">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-gc">上次：{{ lastText('gc') }}</div>
      </div>

      <div class="maint-task" data-testid="maint-task-trash">
        <div class="maint-task-line">
          <span class="maint-task-title">清空回收站</span>
          <maint-scope v-model="allScope" disabled testid="trash" note="回收站按整仓清空：后端只能逐条 purge" />
          <span class="maint-inline-note" data-testid="maint-trash-count">{{ trashCountText }}</span>
          <el-button type="danger" plain icon="DeleteFilled" :loading="clearingTrash" :disabled="clearingTrash || !trash.count"
            v-hasPermi="['media:admin:remove']" data-testid="maint-clear-trash"
            @click="clearTrash">清空</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-trash">上次：{{ lastText('trash') }}</div>
      </div>

      <div class="maint-task" data-testid="maint-task-duplicates">
        <div class="maint-task-line">
          <span class="maint-task-title">查找重复文件</span>
          <maint-scope v-model="allScope" disabled testid="duplicates" note="重复文件按整库扫描：后端只支持 kind 分页" />
          <el-button icon="CopyDocument" :loading="checkingDuplicates" :disabled="checkingDuplicates" data-testid="maint-check-duplicates"
            v-hasPermi="['media:admin:list']" @click="checkDuplicates">检查</el-button>
          <el-button link type="primary" icon="TopRight" data-testid="maint-open-duplicates" @click="openDuplicates">打开重复文件</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-duplicates">上次：{{ lastText('duplicates') }}</div>
      </div>

      <p class="maint-hint">
        <strong>GC</strong> 只删 thumbs/v、thumbs/s、thumbs/pv2 下「既不在索引中、也没有同名源文件」的孤儿派生文件，媒体源与索引不受影响。
        <strong>清空回收站</strong>会把回收站条目逐条彻底删除（不进备份），删完不可恢复；只想恢复某一条请到「回收站」标签页。
      </p>
    </section>

    <!-- ============================== 3 诊断 ============================== -->
    <section class="maint-group" data-testid="maint-section-diagnose">
      <div class="maint-group-head">
        <span class="maint-group-title">诊断</span>
        <span class="maint-group-desc">平时不用点：只在怀疑数据不对时逐项排查</span>
      </div>

      <div class="maint-task" data-testid="maint-task-rescan">
        <div class="maint-task-line">
          <span class="maint-task-title">重建索引（诊断）</span>
          <maint-scope v-model="allScope" disabled testid="rescan" note="重扫全部库根：后端没有 ids 参数" />
          <el-button type="primary" plain icon="RefreshRight" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-rescan"
            @click="runRescan">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-rescan">上次：{{ lastText('rescan') }}</div>
        <div class="maint-row maint-subrow">
          <span class="maint-label">分册方式</span>
          <el-radio-group v-model="albumMode" :disabled="scanRunning" size="small">
            <el-radio-button value="dir">按目录 (dir)</el-radio-button>
            <el-radio-button value="prefix">按文件名前缀 (prefix)</el-radio-button>
          </el-radio-group>
        </div>
        <div class="maint-row maint-subrow">
          <span class="maint-label">排除规则</span>
          <el-input v-model="exclude" :disabled="scanRunning" clearable placeholder="如 *.tmp,sample/**（留空 = 不排除任何路径）" />
        </div>
      </div>

      <div class="maint-task" data-testid="maint-task-consistency">
        <div class="maint-task-line">
          <span class="maint-task-title">数据一致性检查</span>
          <maint-scope v-model="allScope" disabled testid="consistency" note="只读检查，不改任何数据" />
          <el-button icon="CircleCheck" :loading="checkingConsistency" :disabled="checkingConsistency"
            v-hasPermi="['media:admin:list']" data-testid="maint-check-consistency" @click="checkConsistency">检查</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-consistency">上次：{{ lastText('consistency') }}</div>
      </div>

      <div class="maint-task" data-testid="maint-task-hash">
        <div class="maint-task-line">
          <span class="maint-task-title">补内容哈希</span>
          <maint-scope v-model="allScope" disabled testid="hash" note="只补空值：后端没有 ids 参数" />
          <el-button icon="Stamp" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-backfill-hash"
            @click="runBackfillHash">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-backfill-hash">上次：{{ lastText('backfill-hash') }}</div>
      </div>

      <div class="maint-task" data-testid="maint-task-fixposter">
        <div class="maint-task-line">
          <span class="maint-task-title">修复封面路径</span>
          <maint-scope v-model="allScope" disabled testid="fixposter" note="按磁盘实况纠正：后端没有 ids 参数" />
          <el-button icon="SetUp" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-fix-poster"
            @click="runFixPoster">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-fix-poster">上次：{{ lastText('fix-poster') }}</div>
      </div>

      <div class="maint-task" data-testid="maint-task-enrich">
        <div class="maint-task-line">
          <span class="maint-task-title">补元数据(ffprobe)</span>
          <maint-scope v-model="allScope" disabled testid="enrich" note="逐条 ffprobe：后端没有 ids 参数，可配合试跑条数" />
          <el-button type="primary" plain icon="Cpu" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-enrich"
            @click="runEnrich">开始</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-enrich">上次：{{ lastText('enrich') }}</div>
      </div>

      <div class="maint-task" data-testid="maint-task-export">
        <div class="maint-task-line">
          <span class="maint-task-title">导出便携包</span>
          <maint-scope v-model="allScope" disabled testid="export" note="导出整库：后端没有 ids 参数" />
          <el-button type="primary" plain icon="Box" :loading="scanRunning" :disabled="scanRunning"
            v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-export"
            @click="runExport">开始</el-button>
          <el-button icon="Refresh" :loading="exportLoading" v-hasPermi="['media:admin:list']" @click="loadExports">刷新导出列表</el-button>
        </div>
        <div class="maint-task-last" data-testid="maint-last-export">上次：{{ lastText('export') }}</div>
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
        <el-empty :description="exportLoading ? '正在读取导出列表…' : '还没有导出记录（点「开始」生成一个）'" :image-size="60"
          v-if="!exportLoading && !exportError && !exportRows.length" />
        <p class="maint-hint">导入恢复<strong>只能走命令行</strong>，并且需要显式加 <code>--force</code>（会覆盖目标库的索引，所以不在界面上开放）。</p>
      </div>

      <!-- 自动扫描（文件监听）：不是「扫描 / 导入」入口，这里只保留运行期开关与状态 -->
      <div class="maint-subgroup" data-testid="maint-subgroup-watch">
        <div class="maint-group-head">
          <span class="maint-subgroup-title">文件监听（自动入库）</span>
          <span class="maint-group-desc">库根里出现新文件（防抖 {{ watchDebounceText }}，夜间静默 {{ watchQuietText }}）后自动重建索引</span>
          <el-tag :type="watchBadge.type" size="small" class="watch-badge">{{ watchBadge.text }}</el-tag>
        </div>
        <el-alert v-if="watchError" :title="watchError" type="warning" :closable="false" show-icon class="maint-alert" />
        <div class="maint-actions watch-toggle-row">
          <span class="maint-inline-label">监听开关</span>
          <el-switch v-model="watchEnabled" :disabled="!watchAllowed || watchEnabledBusy" :loading="watchEnabledBusy"
            active-text="开启" inactive-text="关闭" v-hasPermi="['media:admin:edit']" @change="onEnabledChange" />
          <span class="maint-inline-note">切换即保存（PUT /api/media/admin/watch/config），不必重启后端</span>
        </div>
        <el-alert v-if="!watchAllowed" type="info" :closable="false" show-icon class="maint-alert"
          title="部署层已禁止运行期开关（qtools.media.watch.allowRuntimeToggle=false）" />
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
          <span class="maint-inline-note">扫描 / 导入请用工具栏「扫描 / 导入」抽屉，或库根管理页行内「扫描」</span>
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
          开关与参数走 <code>PUT /api/media/admin/watch/config</code> 在运行期生效（不重启后端）。
        </p>
      </div>

      <!-- 内容分级 / 标签体系：弹窗式维护入口，保留原能力，不在本抽屉里重复表单 -->
      <div class="maint-subgroup" data-testid="maint-subgroup-dialogs">
        <div class="maint-group-head">
          <span class="maint-subgroup-title">其它维护入口</span>
          <span class="maint-group-desc">自动分级与标签规范化都在弹窗里预览 / 执行，这里只负责打开</span>
        </div>
        <div class="maint-actions">
          <el-button type="primary" plain icon="MagicStick" v-hasPermi="['media:admin:list']" data-testid="maint-rating-classify"
            @click="ratingVisible = true">自动分级</el-button>
          <el-button type="primary" plain icon="PriceTag" v-hasPermi="['media:admin:list']" data-testid="maint-tag-normalize"
            @click="tagNormalizeVisible = true">标签规范化</el-button>
        </div>
        <p class="maint-hint">
          自动分级规则在后端 <code>rating-rules.json</code>，标签规则在 <code>doc/media-import/tag-map.json</code>；
          两个弹窗都先预览、确认后才写库，执行前自动备份标签表。
        </p>
      </div>
    </section>

    <!-- ============================== 4 危险（默认折叠） ============================== -->
    <section class="maint-group maint-danger" data-testid="maint-section-danger">
      <div class="maint-group-head">
        <span class="maint-group-title">危险</span>
        <span class="maint-group-desc">会重扫 / 重写大量数据；默认收起，展开后还要输入「确认」</span>
        <el-button link type="danger" class="maint-danger-toggle" data-testid="maint-danger-toggle"
          @click="toggleDanger">{{ dangerOpen ? '收起' : '展开危险操作' }}</el-button>
      </div>
      <div v-show="dangerOpen" class="maint-danger-body" data-testid="maint-danger-body">
        <div class="maint-task" data-testid="maint-task-danger-rescan">
          <div class="maint-task-line">
            <span class="maint-task-title">强制重扫全部内容</span>
            <maint-scope v-model="allScope" disabled testid="danger-rescan" note="全部库根：范围不可缩小" />
            <el-input v-model="dangerWord" class="maint-danger-input" placeholder="输入「确认」" clearable
              data-testid="maint-danger-confirm-input" />
            <el-button type="danger" icon="WarningFilled" :disabled="dangerWord !== '确认' || scanRunning"
              v-hasPermi="['media:admin:scan', 'media:admin:edit']" data-testid="maint-danger-rescan"
              @click="runDangerRescan">开始</el-button>
          </div>
          <div class="maint-task-last" data-testid="maint-last-danger-rescan">上次：{{ lastText('danger-rescan') }}</div>
          <p class="maint-hint">
            重走全部库根并重建索引（后端 mode=scan，与诊断里的「重建索引」同一个任务，这里用更重的确认防止误点）。
            不会删除媒体文件，但耗时与库大小成正比；期间所有维护 / 扫描按钮都被任务锁挡住。
          </p>
        </div>
      </div>
    </section>

    <!-- 自动分级弹窗：预览 / 执行 / 报告展示都在子组件里，面板只负责打开它 -->
    <rating-classify-dialog v-model="ratingVisible" @applied="onRatingApplied" />
    <!-- 标签规范化弹窗（P6.03）：预览 / 备份提示 / 执行 / 报告都在子组件里 -->
    <tag-normalize-dialog v-model="tagNormalizeVisible" @applied="onTagNormalizeApplied" />
  </div>
</template>

<script setup name="MaintPanel">
import { ref, reactive, computed, onMounted, watch, getCurrentInstance } from 'vue'
import fileSaver from 'file-saver'
import { blobValidate } from '@/utils/ruoyi'
import {
  listExports, downloadExport,
  getWatchStatus, pauseWatch, resumeWatch, updateWatchConfig,
  trashStats, listTrash, purgeTrash,
  listDuplicates, getDeriveStatus, listMissing, listScanJobs,
  listRoots, getRootArtifacts
} from '@/api/media'
import { errText, errStatus, notReadyText } from './maint-error'
import RatingClassifyDialog from './RatingClassifyDialog'
import TagNormalizeDialog from './TagNormalizeDialog'
import MaintScope from './MaintScope.vue'
import {
  loadHistory, saveHistory, recordEntry, formatHistoryEntry,
  entryFromJob, entryFromLocal, mergeBackendJobs
} from './maint-history'

const props = defineProps({
  /** 维护任务的试跑条数（0=不限；父级在发起任务时按 mode 附加到 limit） */
  scanLimit: { type: Number, default: 0 },
  /** 与工具栏共用的运行锁：为 true 时所有按钮禁用 */
  scanRunning: { type: Boolean, default: false },
  /** 任务结束后父级自增，用它触发「最近导出 / 回收站 / 派生用量 / 后端历史」重读 */
  refreshKey: { type: Number, default: 0 },
  /** 视频列表当前勾选的 videoId（「选中项」范围据此带 videoIds） */
  selectedVideoIds: { type: Array, default: () => [] },
  /** 视频页当前是否真的设置了筛选条件（「当前筛选结果」范围据此启用） */
  filterActive: { type: Boolean, default: false },
  /** 当前筛选结果条数（下拉文案与禁用判断） */
  filteredCount: { type: Number, default: 0 },
  /** 父级刚结束的后端任务（用于写「上次执行」；没有就不写） */
  lastJob: { type: Object, default: null }
})

const emit = defineEmits(['update:scanLimit', 'run', 'gc', 'rating-applied', 'trash-cleared', 'open-duplicates'])

const { proxy } = getCurrentInstance()

/* ---------------------------------------------------------------- 上次执行（本地 + 后端回填） */
const history = ref(loadHistory())
const pendingAction = ref('')
/** 正在进行的前端内部动作（清空回收站 / 重复检查 / 一致性检查） */
const clearingTrash = ref(false)
const checkingDuplicates = ref(false)
const checkingConsistency = ref(false)

function lastText(key) {
  return formatHistoryEntry(history.value[key])
}

function record(key, entry) {
  if (!key || !entry) return
  history.value = recordEntry(history.value, key, entry)
}

function seedFromBackend() {
  listScanJobs(30).then(jobs => {
    const merged = mergeBackendJobs(history.value, jobs)
    history.value = merged
    saveHistory(merged)
  }).catch(() => {
    /* 403/404：后端历史不可用，继续只用本地记录 */
  })
}

/** 父级任务结束 → 归到触发它的按钮上 */
watch(() => props.lastJob, (job) => {
  if (!job || !job.id) return
  const key = pendingAction.value
  const entry = entryFromJob(job)
  if (key && entry) {
    record(key, entry)
    pendingAction.value = ''
  }
})

/* ---------------------------------------------------------------- 范围 / 派生选项 */
const allScope = ref('all')
const scopes = reactive({ thumb: 'all', sprite: 'all', preview: 'all', spritePreview: 'all' })
const selectedIdCount = computed(() => (Array.isArray(props.selectedVideoIds) ? props.selectedVideoIds : [])
  .map(id => (id == null ? '' : String(id)))
  .filter(id => id !== '').length)

const deriveForce = ref(false)
const deriveNoFresh = ref(false)
const albumMode = ref('dir')
const exclude = ref('')

const limitProxy = computed({
  get: () => props.scanLimit,
  set: (val) => emit('update:scanLimit', Number(val) || 0)
})

function deriveOptions() {
  const options = {}
  if (deriveForce.value) options.force = true
  if (deriveNoFresh.value) options.noFresh = true
  return options
}

function scanOptions() {
  const options = { albumMode: albumMode.value }
  const text = (exclude.value || '').trim()
  if (text) options.exclude = text
  return options
}

const SPRITE_PREVIEW_FORCE_CONFIRM = '强制重建会把全库精灵图 / 预览重新解码一遍：176 个视频约需 9–11 小时，'
  + '期间同一时刻只能跑这一个任务。建议先把工具栏「试跑条数」设成 3 之类的数字，确认取帧效果符合预期后再去掉条数全量重建。'

const FIX_POSTER_CONFIRM = '修复封面路径会把索引里失效的封面指向按磁盘实况纠正：不改媒体源、不重新解码。'
  + '前提是缩略图已经生成——若还没跑过「生成缩略图」，先跑缩略图再修，否则修不到东西。确认执行？'

const DANGER_RESCAN_CONFIRM = '强制重扫全部内容会重走全部库根并重建索引：不删除媒体文件，但会长时间占用任务锁。'
  + '确认现在开始？'

function scopeText(scope) {
  if (scope === 'filter') return '当前筛选结果（' + props.filteredCount + ' 项）'
  if (scope === 'selected') return '选中项（' + selectedIdCount.value + ' 项）'
  return '全部'
}

/** 统一出口：父级负责二次确认 / 起任务 / 轮询；这里只记「这次是哪个按钮发起的」 */
function emitRun(payload) {
  if (props.scanRunning) {
    proxy.$modal.msgWarning('已有任务在运行，请等待结束后再触发')
    return
  }
  const item = payload || {}
  pendingAction.value = item.actionKey || item.mode || ''
  emit('run', item)
}

function runGenerate(key, mode, title) {
  const scope = scopes[key] || 'all'
  let confirm = title + '：范围 ' + scopeText(scope) + '。'
  if (deriveForce.value) {
    confirm += SPRITE_PREVIEW_FORCE_CONFIRM
  }
  confirm += '确认执行？'
  emitRun({
    mode: mode,
    title: title,
    scope: scope,
    // 合并模式的内部 key 是 spritePreview（对应 scopes），历史记录按后端 mode 存 "sprite,preview"
    actionKey: mode === 'sprite,preview' ? 'sprite,preview' : key,
    options: deriveOptions(),
    confirm: confirm
  })
}

function runRescan() {
  emitRun({
    mode: 'scan',
    title: '重建索引（诊断）',
    scope: 'all',
    actionKey: 'rescan',
    options: scanOptions(),
    confirm: '重建索引会重新扫描媒体根并刷新索引数据库：不会删除任何文件，会保留隐藏状态与人物归属。确认执行？'
  })
}

function runBackfillHash() {
  emitRun({
    mode: 'backfill-hash',
    title: '补内容哈希',
    scope: 'all',
    actionKey: 'backfill-hash',
    options: {},
    confirm: '补内容哈希会按文件内容计算哈希写回索引：幂等（已算过的不重算，只补空值），但视频多时耗时较久。确认执行？'
  })
}

function runFixPoster() {
  emitRun({
    mode: 'fix-poster',
    title: '修复封面路径',
    scope: 'all',
    actionKey: 'fix-poster',
    options: {},
    confirm: FIX_POSTER_CONFIRM
  })
}

function runEnrich() {
  emitRun({
    mode: 'enrich',
    title: '补元数据(ffprobe)',
    scope: 'all',
    actionKey: 'enrich',
    options: {},
    confirm: '补元数据会用 ffprobe 逐个读视频，补齐时长 / 分辨率 / 编码等字段：只补空值，不覆盖已有值，不改媒体源。'
      + '想先试跑就把工具栏「试跑条数」设成 3 之类的小数字。确认执行？'
  })
}

function runExport() {
  emitRun({
    mode: 'export',
    title: '导出便携包',
    scope: 'all',
    actionKey: 'export',
    options: {},
    confirm: '导出便携包会在服务器上生成一个可搬迁的导出目录（含清单与索引快照），耗时取决于库大小。'
      + '完成后在「最近导出」里按文件下载。确认执行？'
  })
}

/** GC：确认框与执行在父级（那里有任务锁与轮询），这里只记按钮归属 */
function startGc() {
  if (props.scanRunning) {
    proxy.$modal.msgWarning('已有任务在运行，请等待结束后再触发')
    return
  }
  pendingAction.value = 'gc'
  emit('gc')
}

/* ---------------------------------------------------------------- 危险段 */
const dangerOpen = ref(false)
const dangerWord = ref('')

function toggleDanger() {
  dangerOpen.value = !dangerOpen.value
  if (!dangerOpen.value) dangerWord.value = ''
}

function runDangerRescan() {
  if (dangerWord.value !== '确认') {
    proxy.$modal.msgWarning('危险操作需要先输入「确认」')
    return
  }
  if (props.scanRunning) {
    proxy.$modal.msgWarning('已有任务在运行，请等待结束后再触发')
    return
  }
  const payload = {
    mode: 'scan',
    title: '强制重扫全部内容',
    scope: 'all',
    actionKey: 'danger-rescan',
    options: scanOptions(),
    confirm: DANGER_RESCAN_CONFIRM
  }
  pendingAction.value = 'danger-rescan'
  emit('run', payload)
  dangerWord.value = ''
}

/* ---------------------------------------------------------------- 清理：回收站 / 重复文件 */
const trash = ref({ count: 0, bytes: 0 })
const trashCountText = computed(() => trash.value.count + ' 项 · ' + formatFileSize(trash.value.bytes))

function loadTrash() {
  trashStats().then(res => {
    trash.value = { count: Number(res && res.count) || 0, bytes: Number(res && res.bytes) || 0 }
  }).catch(() => {
    trash.value = { count: 0, bytes: 0 }
  })
}

function clearTrash() {
  if (clearingTrash.value || !trash.value.count) return
  const count = trash.value.count
  proxy.$modal.confirm('确认清空回收站里的 ' + count + ' 项？会逐条彻底删除，删完不可恢复（不进备份）。',
    '清空回收站', { confirmButtonText: '确认清空', type: 'error' }).then(async () => {
    clearingTrash.value = true
    let removed = 0
    let failed = 0
    try {
      // 回收站对象数量级很小（上限 200/页）；按页循环，避免一次只清前 200 条
      for (let guard = 0; guard < 50; guard++) {
        const res = await listTrash({ pageNum: 1, pageSize: 200, kind: 'all' })
        const rows = (res && res.rows) || []
        if (!rows.length) break
        for (const row of rows) {
          try {
            await purgeTrash(row.kind, row.id, row.trashRel)
            removed += 1
          } catch (err) {
            failed += 1
            if (errStatus(err) === 403) {
              throw err
            }
          }
        }
        if (rows.length < 200) break
      }
      const entry = entryFromLocal('已清空 ' + removed + ' 项' + (failed ? ' · 失败 ' + failed + ' 项' : ''),
        failed ? 'failed' : 'done')
      record('trash', entry)
      loadTrash()
      emit('trash-cleared')
      if (failed) {
        proxy.$modal.msgWarning('清空回收站完成：成功 ' + removed + ' 项，失败 ' + failed + ' 项')
      } else {
        proxy.$modal.msgSuccess('回收站已清空：共 ' + removed + ' 项')
      }
    } catch (err) {
      record('trash', entryFromLocal('清空失败：' + (errText(err) || '请求失败'), 'failed'))
      proxy.$modal.notifyError({ title: '清空回收站失败', message: errText(err) || '请求失败，请查看后端日志', duration: 8000 })
    } finally {
      clearingTrash.value = false
    }
  }).catch(() => {})
}

function checkDuplicates() {
  if (checkingDuplicates.value) return
  checkingDuplicates.value = true
  Promise.all([
    listDuplicates({ kind: 'video', page: 1, size: 1 }),
    listDuplicates({ kind: 'photo', page: 1, size: 1 })
  ]).then(([video, photo]) => {
    const videoTotal = Number(video && video.total) || 0
    const photoTotal = Number(photo && photo.total) || 0
    const total = videoTotal + photoTotal
    record('duplicates', entryFromLocal('共 ' + total + ' 组（视频 ' + videoTotal + ' / 图片 ' + photoTotal + '）'))
    proxy.$modal.msgSuccess(total ? '发现 ' + total + ' 组重复文件' : '没有发现重复文件')
  }).catch(err => {
    record('duplicates', entryFromLocal('检查失败：' + (errText(err) || '请求失败'), 'failed'))
    proxy.$modal.notifyError({ title: '查找重复文件失败', message: errText(err) || '请求失败，请查看后端日志', duration: 8000 })
  }).finally(() => {
    checkingDuplicates.value = false
  })
}

function openDuplicates() {
  emit('open-duplicates')
}

/* ---------------------------------------------------------------- 清理：派生资源用量 */
const gcUsedBytes = ref(null)
const gcUsedText = computed(() => (gcUsedBytes.value == null ? '—' : formatFileSize(gcUsedBytes.value)))

function loadGcUsage() {
  listRoots(true).then(res => {
    const list = Array.isArray(res) ? res : (res && (res.list || res.roots)) || []
    const thumbs = list.find(row => row && row.kind === 'thumbs')
    if (!thumbs) {
      gcUsedBytes.value = null
      return
    }
    getRootArtifacts(thumbs.id, false, true).then(art => {
      const total = art && art.total
      gcUsedBytes.value = total && total.bytes != null ? Number(total.bytes) : null
    }).catch(() => {
      gcUsedBytes.value = null
    })
  }).catch(() => {
    gcUsedBytes.value = null
  })
}

/* ---------------------------------------------------------------- 诊断：数据一致性检查 */
function checkConsistency() {
  if (checkingConsistency.value) return
  checkingConsistency.value = true
  const checks = []
  Promise.all([
    listMissing({ kind: 'photo', pageNum: 1, pageSize: 1 }),
    listMissing({ kind: 'video', pageNum: 1, pageSize: 1 }),
    getDeriveStatus({ page: 1, size: 10, kind: 'all' }),
    listRoots(true)
  ]).then(([photoMissing, videoMissing, derive, roots]) => {
    const photoTotal = Number(photoMissing && photoMissing.total) || 0
    const videoTotal = Number(videoMissing && videoMissing.total) || 0
    checks.push({ label: '图片缺失', ok: photoTotal === 0, detail: photoTotal + ' 条' })
    checks.push({ label: '视频缺失', ok: videoTotal === 0, detail: videoTotal + ' 条' })

    const counts = (derive && derive.counts) || null
    if (counts) {
      const totalRows = Number(counts.totalRows) || 0
      ;['thumb', 'sprite', 'preview'].forEach(kind => {
        const bucket = counts[kind]
        if (!bucket) return
        const sum = ['ok', 'oldAlgo', 'stale', 'missing'].reduce((acc, k) => acc + (Number(bucket[k]) || 0), 0)
        checks.push({ label: kind + ' 计数', ok: sum === totalRows, detail: sum + ' / ' + totalRows })
      })
    } else {
      checks.push({ label: '派生资源计数', ok: false, detail: '接口未返回 counts' })
    }

    const list = Array.isArray(roots) ? roots : (roots && (roots.list || roots.roots)) || []
    const missingRoots = list.filter(row => row && row.exists === false)
    const unreadableRoots = list.filter(row => row && row.readable === false)
    checks.push({ label: '库根存在', ok: missingRoots.length === 0, detail: list.length + ' 个 / 缺失 ' + missingRoots.length })
    checks.push({ label: '库根可读', ok: unreadableRoots.length === 0, detail: list.length + ' 个 / 不可读 ' + unreadableRoots.length })

    const failed = checks.filter(item => !item.ok)
    if (failed.length) {
      const text = '发现 ' + failed.length + ' 项：' + failed.map(item => item.label + '=' + item.detail).join('；')
      record('consistency', entryFromLocal(text, 'failed'))
      proxy.$modal.msgWarning(text)
    } else {
      const text = checks.length + ' 项检查通过'
      record('consistency', entryFromLocal(text, 'done'))
      proxy.$modal.msgSuccess(text)
    }
  }).catch(err => {
    record('consistency', entryFromLocal('检查失败：' + (errText(err) || '请求失败'), 'failed'))
    proxy.$modal.notifyError({ title: '数据一致性检查失败', message: errText(err) || '请求失败，请查看后端日志', duration: 8000 })
  }).finally(() => {
    checkingConsistency.value = false
  })
}

/* ---------------------------------------------------------------- 文件监听（自动扫描） */
const NOT_READY_TEXT = '自动扫描接口未就绪：后端部署后刷新页面即可'
const DISABLED_TEXT = '自动扫描未开启：用上方开关在运行期打开即可（无需改配置或重启）'
const QUIET_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/

const watchInfo = ref({ enabled: false, running: false, paused: false, allowed: true, debounceSeconds: 0, quietMinutes: '' })
const watchRoots = ref([])
const watchLoading = ref(false)
const watchError = ref('')
const watchBusy = ref(false)
const watchEnabled = ref(false)
const watchEnabledBusy = ref(false)
const watchDebounce = ref(0)
const watchQuiet = ref('')
const watchCfgSaving = ref(false)

function unwrapWatch(res) {
  if (res && typeof res === 'object' && !Array.isArray(res) && typeof res.code === 'number') {
    return res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : {}
  }
  return res && typeof res === 'object' && !Array.isArray(res) ? res : {}
}

function hasWatchRoots(res) {
  return Array.isArray(unwrapWatch(res).roots)
}

function applyWatch(res) {
  const body = unwrapWatch(res)
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

const watchAllowed = computed(() => watchInfo.value.allowed !== false)

const watchCfgDirty = computed(() => {
  const savedDebounce = Number(watchInfo.value.debounceSeconds) || 0
  const savedQuiet = String(watchInfo.value.quietMinutes == null ? '' : watchInfo.value.quietMinutes).trim()
  return Number(watchDebounce.value) !== savedDebounce || String(watchQuiet.value || '').trim() !== savedQuiet
})

const watchPauseResumeDisabled = computed(() => watchBusy.value || !watchInfo.value.enabled)
const watchActionTip = computed(() => {
  if (!watchInfo.value.enabled) {
    return '监听未开启：暂停/继续会被后端拒绝（409），先用上方开关打开监听'
  }
  return watchBusy.value ? '正在与后端同步监听状态…' : ''
})

const watchBadge = computed(() => {
  if (!watchInfo.value.enabled) return { text: '未启用', type: 'info' }
  const pending = watchRoots.value.reduce((sum, r) => sum + (Number(r.pending) || 0), 0)
  if (pending > 0) return { text: '有任务排队 ' + pending, type: 'warning' }
  if (watchInfo.value.paused || !watchInfo.value.running) return { text: '已暂停', type: 'warning' }
  return { text: '监听中', type: 'success' }
})

const watchEmptyText = computed(() => {
  if (watchLoading.value) return '正在读取监听状态…'
  return watchError.value ? NOT_READY_TEXT : '没有登记中的库根（先在「库根管理」页登记库根，再跑一次重建索引）'
})

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
    if (!hasWatchRoots(res)) loadWatch()
  }).catch(err => {
    watchEnabled.value = previous
    const text = errText(err) || '请求失败，请查看后端日志'
    proxy.$modal.msgError(text)
    watchError.value = (next ? '开启监听失败：' : '关闭监听失败：') + text
    if (errStatus(err) === 403) loadWatch()
  }).finally(() => {
    watchEnabledBusy.value = false
  })
}

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
    if (!hasWatchRoots(res)) loadWatch()
  }).catch(err => {
    const text = errText(err) || '请求失败，请查看后端日志'
    proxy.$modal.msgError(text)
    watchError.value = '保存扫描参数失败：' + text
    if (errStatus(err) === 403) loadWatch()
  }).finally(() => {
    watchCfgSaving.value = false
  })
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
  if (!row || !row.dir || !row.name || downloadingKey.value) return
  downloadingKey.value = fileKey(row)
  downloadExport(row.dir, row.name).then(data => {
    if (blobValidate(data)) {
      fileSaver.saveAs(new Blob([data]), row.name)
    } else {
      return data.text().then(text => {
        let message = text
        try {
          const parsed = JSON.parse(text)
          message = parsed.error || parsed.msg || text
        } catch (e) { /* 非 JSON 原样展示 */ }
        proxy.$modal.notifyError({ title: '下载失败', message: message || '后端未返回文件', duration: 8000 })
      })
    }
  }).catch(err => {
    proxy.$modal.notifyError({ title: '下载失败', message: errText(err) || '请求失败，请查看后端日志', duration: 8000 })
  }).finally(() => {
    downloadingKey.value = ''
  })
}

/* ---------------------------------------------------------------- 弹窗（自动分级 / 标签规范化） */
const tagNormalizeVisible = ref(false)

function onTagNormalizeApplied() {
  proxy.$modal.msgSuccess('标签已原子化重建，正在刷新维护状态')
  loadExports()
}

const ratingVisible = ref(false)

function onRatingApplied(report) {
  emit('rating-applied', report || null)
}

/* ---------------------------------------------------------------- 生命周期 */
function loadAll() {
  loadWatch()
  loadExports()
  loadTrash()
  loadGcUsage()
  seedFromBackend()
}

onMounted(loadAll)

watch(() => props.refreshKey, () => {
  loadAll()
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
.maint-subgroup {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
}
.maint-subgroup-title {
  font-size: 13px;
  font-weight: 600;
}
.maint-task {
  padding: 8px 0;
  border-bottom: 1px solid var(--el-fill-color-lighter);
}
.maint-task:last-child {
  border-bottom: none;
}
.maint-task-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.maint-task-title {
  min-width: 132px;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.maint-task-last {
  margin-top: 4px;
  padding-left: 140px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.maint-options-row {
  margin-bottom: 8px;
}
.maint-subrow {
  margin-top: 8px;
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
.maint-row :deep(.el-input) {
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
.maint-row :deep(.el-input.maint-limit) {
  flex: 0 0 110px;
  min-width: 0;
  width: 110px;
}
.maint-info-icon {
  color: var(--el-text-color-secondary);
  cursor: help;
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
.watch-tip-wrap,
.maint-tip-wrap {
  display: inline-flex;
}
.maint-table {
  margin-top: 8px;
}
.maint-danger {
  border-color: var(--el-color-danger-light-5);
}
.maint-danger-toggle {
  margin-left: auto;
}
.maint-danger-body {
  margin-top: 8px;
}
.maint-danger-input {
  width: 130px;
}
@media (max-width: 480px) {
  .maint-task-title {
    min-width: 100%;
  }
  .maint-task-last {
    padding-left: 0;
  }
  .maint-label {
    width: 100%;
  }
  .maint-danger-input {
    width: 100%;
  }
}
</style>
