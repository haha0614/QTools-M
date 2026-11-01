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
        <span v-if="selectedVideoTotal" class="media-selected" data-testid="selected-count">
          已选 {{ selectedVideoTotal }} 项
          <el-button link type="primary" @click="clearVideoSelection">清空</el-button>
          <!-- P5.99：勾选后批量设置内容分级 -->
          <el-button type="primary" size="small" icon="PriceTag" v-hasPermi="['media:admin:edit']"
            data-testid="video-batch-rating" @click="openBatchRating('video')">批量设置分级</el-button>
          <el-button type="primary" size="small" icon="User" v-hasPermi="['media:admin:edit']"
            data-testid="video-batch-person" @click="openVideoBatchPerson">设置人物</el-button>
          <el-button type="primary" size="small" icon="OfficeBuilding" v-hasPermi="['media:admin:edit']"
            data-testid="video-batch-studio" @click="openVideoBatchStudio">设置工作室</el-button>
        </span>
        <!-- P6.81：没勾选时也要让人知道这里能批量操作（相册页一直有这行提示，视频页之前什么都没有） -->
        <span v-else class="media-selected-hint">勾选视频后可批量设置分级 / 人物 / 工作室</span>
        <!-- P6.82：「分类」列下线后，打标签是唯一的语义维度，未打标签数要能一眼看到并可一键筛出来 -->
        <el-button v-if="tagStats.untagged > 0" size="small" text type="warning" icon="WarningFilled"
          data-testid="video-untagged" @click="filterUntagged">
          未打标签 {{ tagStats.untagged }} / {{ tagStats.total }}
        </el-button>
        <el-button icon="Refresh" :loading="statsLoading" @click="refreshAll">刷新</el-button>
        <el-button icon="PriceTag" @click="openTagManager" v-hasPermi="['media:admin:list']">标签管理</el-button>
        <el-button icon="Setting" @click="openEditPolicy" v-hasPermi="['media:admin:edit']">编辑策略</el-button>
        <!-- P5.97：扫盘入库的唯一入口（原来这里 4 个按钮 = 维护面板里那 4 个的重复入口）。
             一次点击跑完整条流水线：扫盘 → 补哈希 → 补元数据 → 封面缩略图 → 重建索引。 -->
        <el-button type="primary" icon="Upload" @click="openScanDrawer" v-hasPermi="['media:admin:scan', 'media:admin:edit']">
          扫描 / 导入
        </el-button>
        <!-- 维护面板：派生资源重建 / GC / 备份 / 自动扫描 / 重建索引（诊断）都在这里，不再另开按钮 -->
        <el-button icon="Tools" @click="maintVisible = true" v-hasPermi="['media:admin:list']">维护</el-button>
        <!-- P4-B 重复文件：工具栏入口 → 抽屉（与维护面板并列，不替换任何既有按钮） -->
        <el-button icon="CopyDocument" @click="openDuplicates" v-hasPermi="['media:admin:list']">重复文件</el-button>
      </div>
    </div>

    <!-- 一句话说清入口分工（P5.97 合并后只剩两组） -->
    <div class="scan-tip">
      「扫描 / 导入」= 扫盘入库，点一次就把后续步骤串起来（补哈希 → 补元数据 → 封面缩略图 → 重建索引），可中途停止；
      「维护」= 派生资源重建（缩略图 / 精灵图 · 预览）、清理孤儿(GC)、备份、自动扫描开关，以及<strong>诊断用</strong>的「重建索引」。
      精灵图 / 预览是<strong>全片解码</strong>（176 个视频约需 5 小时），先在维护里的「试跑条数」填 3 跑一小批再全量。
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
          <el-form-item label="标签" prop="tagFilter">
            <el-select v-model="videoQuery.tagFilter" multiple collapse-tags placeholder="全部（可多选）"
              clearable style="width: 220px" data-testid="video-tag-filter">
              <el-option label="无标签" value="__none__" />
              <el-option v-for="t in tagOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
            </el-select>
          </el-form-item>
          <el-form-item label="分类" prop="folder" v-if="false">
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
          <el-form-item label="分级" prop="rating">
            <!-- P6.07：管理端此前只能逐行看分级，不能筛（用户反馈） -->
            <el-select v-model="videoQuery.rating" placeholder="全部分级" clearable style="width: 140px">
              <el-option v-for="opt in RATING_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
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

        <!-- P5.12：派生资源汇总（随资源类型变化）+「资源类型 × 状态」两个下拉（只过滤当前页显示，不动请求与分页） -->
        <derive-filter-bar :ready="deriveReady" :rows="deriveRows" :legacy="deriveLegacy" v-model:filter="deriveFilter"
          :algo-since="deriveMeta.algoSince" :algo-since-source="deriveMeta.algoSinceSource" :loading="deriveLoading"
          @refresh="loadDeriveStatus()" />
        <el-table ref="videoTableRef" v-loading="videoLoading" :data="videoDisplayList" class="media-table" row-key="id"
          @selection-change="handleVideoSelection">
          <!-- P5.12：筛选结果为空时的友好空态（不过滤时仍是原来的「暂无数据」） -->
          <template #empty>
            <derive-empty-state :filter="deriveFilter" :has-rows="videoList.length" />
          </template>
          <el-table-column type="selection" width="44" align="center" />
          <el-table-column label="封面" width="66" align="center">
            <template #default="scope">
              <span class="media-cover-wrap">
                <img class="media-cover media-cover-click" :src="mediaSrc('/api/media/thumb/v/' + scope.row.id)" loading="lazy"
                  alt="封面" title="点击放大" @click="openVideoPreview(scope.row)" />
                <!-- P6.00：posterSource=file = 同目录「视频名-封面」自带封面（不是 ffmpeg 截帧） -->
                <el-tooltip v-if="scope.row.posterSource === 'file'"
                  :content="'自带封面：' + (scope.row.posterFile || '同目录「视频名-封面」文件')" placement="top">
                  <span class="cover-badge">封</span>
                </el-tooltip>
              </span>
            </template>
          </el-table-column>
          <el-table-column label="标题" prop="title" min-width="200" :show-overflow-tooltip="true" />
          <el-table-column label="路径" prop="relPath" min-width="220" :show-overflow-tooltip="true" />
          <!-- P6.82：「分类」列下线——它只是路径第一段（scan-media.js:763），路径列已经写着，
               和标签重复；语义维度统一交给标签 -->
          <!-- P6.07：列表补上「人物 / 工作室」两列（后端子查询聚合，无 N+1） -->
          <el-table-column label="人物" min-width="150" :show-overflow-tooltip="true">
            <template #default="scope">{{ scope.row.personText || '—' }}</template>
          </el-table-column>
          <el-table-column label="工作室" min-width="130" :show-overflow-tooltip="true">
            <template #default="scope">{{ scope.row.studioText || '—' }}</template>
          </el-table-column>
          <!-- P6.83：标签列——没有标签就显示灰色「无」，提醒去补 -->
          <el-table-column label="标签" min-width="200">
            <template #default="scope">
              <span class="video-tags" @click.stop>
                <el-tag v-for="t in (scope.row.tags || [])" :key="t.id" size="small"
                  :color="t.color || undefined" :style="t.color ? 'border-color:transparent;color:#fff' : ''"
                  class="video-tag">{{ t.name }}</el-tag>
                <el-tag v-if="!(scope.row.tags || []).length" size="small" type="info"
                  class="video-tag" data-testid="video-tag-none">无</el-tag>
                <el-button link type="primary" size="small" class="video-tag-edit"
                  v-hasPermi="['media:admin:edit']" data-testid="video-tag-edit"
                  @click.stop="openVideoTagEdit(scope.row)">编辑</el-button>
              </span>
            </template>
          </el-table-column>
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
          <el-table-column label="分级" width="132" align="center" class-name="rating-col">
            <template #default="scope">
              <!-- P5.99：行内下拉直接写库（PUT /video/{id}/rating），保存成功即反映到行对象；
                   失败保留原值并弹错误（不做乐观更新，避免「看着改了其实没改」） -->
              <!-- P6.21：行内分级 = 标签 + 全表共用一个下拉（见页面底部 ratingMenuRef）。
                   以前每行一个 el-select：一页 200 行 = 200 个下拉实例 / 200 个弹层，光是挂载就要 1 秒。 -->
              <span class="rating-cell" :class="'rc-' + ratingOf(scope.row)" role="button" tabindex="0"
                :title="'点击修改分级（当前：' + ratingLabelOf(ratingOf(scope.row)) + '）'"
                data-testid="video-rating-select" v-hasPermi="['media:admin:edit']"
                @click.stop="openRatingMenu($event, scope.row, 'video')"
                @keydown.enter.prevent="openRatingMenu($event, scope.row, 'video')">{{ ratingLabelOf(ratingOf(scope.row)) }}</span>
              <div v-if="ratingError[scope.row.id]" class="rating-error">{{ ratingError[scope.row.id] }}</div>
            </template>
          </el-table-column>
          <el-table-column label="审核" width="94" align="center">
            <template #default="scope">
              <span class="review-cell" :class="'rs-' + (scope.row.reviewState || 'pending')" role="button" tabindex="0"
                :title="'点击修改审核状态（当前：' + reviewLabelOf(scope.row.reviewState) + '）'"
                v-hasPermi="['media:admin:edit']"
                @click.stop="openReviewMenu($event, scope.row)"
                @keydown.enter.prevent="openReviewMenu($event, scope.row)">{{ reviewLabelOf(scope.row.reviewState) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="86" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.hidden ? 'info' : 'success'" size="small">{{ scope.row.hidden ? '隐藏' : '正常' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="派生资源" width="126" align="center" class-name="derive-col">
            <template #default="scope">
              <derive-badges :row="deriveRowOf(scope.row)" :ready="deriveReady" :loading="deriveLoading"
                :algo-since="deriveMeta.algoSince" />
            </template>
          </el-table-column>
          <!-- P6.11：低频操作收进「更多」，行上只留预览 + 删除 -->
          <el-table-column label="操作" width="120" align="center" fixed="right" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-button link type="primary" icon="View" title="预览" @click="previewVideo(scope.row)" v-hasPermi="['media:admin:list']" />
              <el-dropdown trigger="click" class="row-more">
                <el-button link type="primary" icon="MoreFilled" data-testid="video-row-more" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item icon="UserFilled" @click="openVideoPersons(scope.row)"
                      v-hasPermi="['media:admin:edit']">人物（多选 + 角色）</el-dropdown-item>
                    <el-dropdown-item icon="Hide" @click="toggleHidden(scope.row, 'video')"
                      v-hasPermi="['media:admin:edit']">{{ scope.row.hidden ? '取消隐藏' : '隐藏' }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button link type="danger" icon="Delete" title="软删" @click="handleRemove(scope.row, 'video')" v-hasPermi="['media:admin:remove']" />
            </template>
          </el-table-column>
        </el-table>
        <pagination v-show="videoTotal > 0" :page-sizes="DERIVE_PAGE_SIZES" :total="videoTotal" v-model:page="videoQuery.pageNum" v-model:limit="videoQuery.pageSize" @pagination="loadVideos" />
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
          <el-form-item label="分级" prop="rating">
            <el-select v-model="albumQuery.rating" placeholder="全部分级" clearable style="width: 140px">
              <el-option v-for="opt in RATING_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
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
            <!-- P6.52：允许无册 —— 不在任何册里的照片在这里处理 -->
            <el-button icon="FolderRemove" data-testid="open-uncategorized"
              v-hasPermi="['media:admin:list']" @click="openUncategorized">未归类…</el-button>
            <el-button icon="Connection" data-testid="open-album-rules"
              v-hasPermi="['media:admin:list']" @click="openAlbumRules">归属规则…</el-button>
          </el-form-item>
        </el-form>

        <!-- P5.99：相册也支持多选批量设置分级 -->
        <div class="album-batch-bar">
          <span v-if="selectedAlbumTotal" class="media-selected" data-testid="album-selected-count">
            已选 {{ selectedAlbumTotal }} 本相册
            <el-button link type="primary" @click="clearAlbumSelection">清空</el-button>
            <el-button type="primary" size="small" icon="PriceTag" v-hasPermi="['media:admin:edit']"
              data-testid="album-batch-rating" @click="openBatchRating('album')">批量设置分级</el-button>
          <el-button type="primary" size="small" icon="User" v-hasPermi="['media:admin:edit']"
            data-testid="album-batch-person" @click="openAlbumBatchPerson">设置人物</el-button>
          <!-- P6.54：选中「建议册」后一键采纳（站端才可见） -->
          <el-button type="success" size="small" icon="Select" v-hasPermi="['media:admin:edit']"
            data-testid="album-batch-confirm" @click="confirmSelectedAlbums">采纳（可上站）</el-button>
          </span>
          <span v-else class="album-batch-hint">勾选多本相册可批量设置分级</span>
        </div>
        <el-table ref="albumTableRef" v-loading="albumLoading" :data="albumList" class="media-table" row-key="id"
          @selection-change="handleAlbumSelection">
          <el-table-column type="selection" width="44" align="center" />
          <el-table-column label="封面" width="66" align="center">
            <template #default="scope">
              <img class="media-cover media-cover-square media-cover-click" :src="mediaSrc(albumThumb(scope.row))" loading="lazy"
                alt="封面" title="点击放大" @click="openPhotos(scope.row)" />
            </template>
          </el-table-column>
          <el-table-column label="标题" min-width="220">
            <template #default="scope">
              <span :title="scope.row.title">{{ scope.row.title }}</span>
              <!-- P6.54：扫描按目录给的建议册，站端不可见，等人采纳或并入 -->
              <el-tag v-if="scope.row.confirmed === 0" size="small" type="warning" class="album-suggest-tag"
                data-testid="album-suggest-tag">建议册</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="物理目录" prop="dir" min-width="180" :show-overflow-tooltip="true" />
          <el-table-column label="人物" width="120" align="center">
            <template #default="scope">{{ scope.row.person || '未归类' }}</template>
          </el-table-column>
          <el-table-column label="图片数" prop="photoCount" width="90" align="right" />
          <el-table-column label="体积" width="110" align="right">
            <template #default="scope">{{ formatVolume(scope.row.bytes) }}</template>
          </el-table-column>
          <el-table-column label="分级" width="132" align="center" class-name="rating-col">
            <template #default="scope">
              <span class="rating-cell" :class="'rc-' + ratingOf(scope.row)" role="button" tabindex="0"
                :title="'点击修改分级（当前：' + ratingLabelOf(ratingOf(scope.row)) + '）'"
                data-testid="album-rating-select" v-hasPermi="['media:admin:edit']"
                @click.stop="openRatingMenu($event, scope.row, 'album')"
                @keydown.enter.prevent="openRatingMenu($event, scope.row, 'album')">{{ ratingLabelOf(ratingOf(scope.row)) }}</span>
              <div v-if="ratingError[scope.row.id]" class="rating-error">{{ ratingError[scope.row.id] }}</div>
            </template>
          </el-table-column>
          <el-table-column label="审核" width="94" align="center">
            <template #default="scope">
              <span class="review-cell" :class="'rs-' + (scope.row.reviewState || 'pending')" role="button" tabindex="0"
                :title="'点击修改审核状态（当前：' + reviewLabelOf(scope.row.reviewState) + '）'"
                v-hasPermi="['media:admin:edit']"
                @click.stop="openReviewMenu($event, scope.row)"
                @keydown.enter.prevent="openReviewMenu($event, scope.row)">{{ reviewLabelOf(scope.row.reviewState) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="86" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.hidden ? 'info' : 'success'" size="small">{{ scope.row.hidden ? '隐藏' : '正常' }}</el-tag>
            </template>
          </el-table-column>
          <!-- P6.11：低频操作收进「更多」；「改人物」与「人物（多选）」重复，只留多选那个 -->
          <el-table-column label="操作" width="120" align="center" fixed="right" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-button link type="primary" icon="Picture" title="查看图片" @click="openPhotos(scope.row)" v-hasPermi="['media:admin:list']" />
              <el-dropdown trigger="click" class="row-more">
                <el-button link type="primary" icon="MoreFilled" data-testid="album-row-more" />
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item icon="Avatar" @click="openAlbumPersons(scope.row)"
                      v-hasPermi="['media:admin:edit']">人物（多选）</el-dropdown-item>
                    <el-dropdown-item icon="Hide" @click="toggleHidden(scope.row, 'album')"
                      v-hasPermi="['media:admin:edit']">{{ scope.row.hidden ? '取消隐藏' : '隐藏' }}</el-dropdown-item>
                    <el-dropdown-item icon="Select" @click="confirmOneAlbum(scope.row)" :disabled="scope.row.confirmed !== 0"
                      v-hasPermi="['media:admin:edit']">采纳为正式册</el-dropdown-item>
                    <el-dropdown-item icon="Share" @click="openAlbumMerge(scope.row)"
                      v-hasPermi="['media:admin:edit']">并入另一册…</el-dropdown-item>
                    <el-dropdown-item icon="Edit" divided data-testid="album-rename"
                      v-hasPermi="['media:admin:edit']" @click="renameAlbumRow(scope.row)">重命名…</el-dropdown-item>
                    <el-dropdown-item icon="Delete" data-testid="album-delete"
                      v-hasPermi="['media:admin:remove']" @click="deleteAlbumRow(scope.row)">删除这本册…</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-button link type="danger" icon="Delete" title="软删" @click="handleRemove(scope.row, 'album')" v-hasPermi="['media:admin:remove']" />
            </template>
          </el-table-column>
        </el-table>
        <pagination v-show="albumTotal > 0" :page-sizes="DERIVE_PAGE_SIZES" :total="albumTotal" v-model:page="albumQuery.pageNum" v-model:limit="albumQuery.pageSize" @pagination="loadAlbums" />
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
          <el-table-column label="封面" width="76" align="center">
            <template #default="scope">
              <!-- 封面走内容寻址：文件已经进了回收站，缩略图/预览图仍在（按内容哈希落盘） -->
              <el-image v-if="scope.row.thumbUrl" class="media-cover media-cover-square media-cover-click"
                :src="mediaSrc(scope.row.thumbUrl)" fit="cover" loading="lazy"
                :preview-src-list="[mediaSrc(scope.row.previewUrl || scope.row.thumbUrl)]"
                :initial-index="0" preview-teleported hide-on-click-modal />
              <span v-else class="trash-cover-ph" title="没有可用封面">—</span>
            </template>
          </el-table-column>
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
              <el-tooltip :content="scope.row.originalRel ? '恢复到原路径（重名自动加后缀）' : '原记录已丢失，无法恢复'" placement="top">
                <el-button link type="primary" icon="RefreshLeft" :disabled="!scope.row.originalRel"
                  @click="handleTrashRestore(scope.row)" v-hasPermi="['media:admin:edit']" />
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

    <!-- P6.21：行内分级 = 标签 + 全表共用一个下拉。
         以前每行一个 el-select（每行 1 个弹层 + 4 个 option），一页 200 行 = 200 个下拉实例；
         共用后整个页面只有 1 个 dropdown，虚拟触发对准刚点的那一格。 -->
    <el-dropdown ref="ratingMenuRef" trigger="click" virtual-triggering :virtual-ref="ratingMenuAnchor"
      @command="onRatingMenuCommand">
      <span class="rating-menu-anchor" aria-hidden="true"></span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item v-for="opt in RATING_OPTIONS" :key="opt.value" :command="opt.value">{{ opt.label }}</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>


    <!-- P6.38：审核状态也是「一格一点」——复用同一个共用下拉思路，全页只 1 个实例 -->
    <el-dropdown ref="reviewMenuRef" trigger="click" virtual-triggering :virtual-ref="reviewMenuAnchor"
      @command="onReviewMenuCommand">
      <span class="rating-menu-anchor" aria-hidden="true"></span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="pending">待审核</el-dropdown-item>
          <el-dropdown-item command="approved">已通过</el-dropdown-item>
          <el-dropdown-item command="rejected">已驳回</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- P6.48：册并入 —— 把子目录/重复册并回目标册 -->
    <el-dialog v-model="albumMergeVisible" title="并入另一册" width="min(560px, 92vw)" append-to-body>
      <p class="album-merge-tip">
        把「{{ albumMergeSource && albumMergeSource.title }}」整本并到目标册：照片改挂目标册，
        目录会登记别名，<b>以后扫描不会再单独建册</b>。
      </p>
      <el-select v-model="albumMergeTarget" filterable remote clearable placeholder="搜索目标相册（标题/目录）"
        :remote-method="searchMergeTargets" :loading="albumMergeLoading" style="width: 100%"
        @change="onMergeTargetChange">
        <el-option v-for="a in albumMergeOptions" :key="a.id" :label="(a.title || a.id) + '（' + (a.photoCount || 0) + ' 张）'"
          :value="a.id">
          <div class="album-opt">
            <img class="album-opt-cover" :src="mediaSrc(albumThumb(a))" loading="lazy" alt=""
              @error="hideBrokenCover" />
            <span class="album-opt-title">{{ a.title || a.id }}</span>
            <span class="album-opt-count">{{ a.photoCount || 0 }} 张</span>
          </div>
        </el-option>
      </el-select>
      <!-- P6.91：默认直接把源册整段追加到末尾；勾上则按指纹把每张插到最像的那张后面 -->
      <el-checkbox v-model="albumMergeSimilar" class="album-merge-similar" data-testid="merge-similar">
        按相似度插入（不追加到末尾，同姿势/同场景的排在一起）
      </el-checkbox>
      <p class="album-merge-preview" v-if="albumMergeTarget && albumMergePreview.moving">
        将并入 <b>{{ albumMergePreview.moving }}</b> 张
        <span v-if="albumMergePreview.duplicates" class="album-merge-dup">
          ，其中 <b>{{ albumMergePreview.duplicates }}</b> 张与目标册内容重复（不会自动删，去「重复文件」处理）
        </span>
      </p>
      <template #footer>
        <el-button @click="albumMergeVisible = false">取消</el-button>
        <el-button type="primary" :loading="albumMergeBusy" :disabled="!albumMergeTarget" @click="doAlbumMerge">确认并入</el-button>
      </template>
    </el-dialog>
    <!-- P6.51：按图改归属 —— 移到另一本册 / 从当前册拆出一本新册；文件不动，只改归属并打 album_pinned -->
    <el-dialog v-model="photoRelocateVisible" :title="photoRelocateMode === 'split' ? '拆出新册' : '移到另一册'"
      width="min(560px, 92vw)" append-to-body>
      <p class="album-merge-tip">
        把选中的 {{ photoSelected.length }} 张改成<b>人工归属</b>：只改库里的归属，
        不动磁盘文件，<b>以后扫描不会再按目录把它们拽回去</b>。
      </p>
      <el-input v-if="photoRelocateMode === 'split'" v-model="photoRelocateTitle" maxlength="300" show-word-limit
        placeholder="新册标题（例如：马吉 · 精选）" data-testid="photo-split-title" />
      <el-select v-else v-model="photoRelocateTarget" filterable remote clearable placeholder="搜索目标相册（标题/目录）"
        :remote-method="searchRelocateTargets" :loading="photoRelocateLoading" style="width: 100%"
        data-testid="photo-move-target" @change="onRelocateTargetChange">
        <el-option v-for="a in photoRelocateOptions" :key="a.id"
          :label="(a.title || a.id) + '（' + (a.photoCount || 0) + ' 张）'" :value="a.id">
          <!-- P6.51：下拉项带封面，光看标题选不出册 -->
          <div class="album-opt">
            <img class="album-opt-cover" :src="mediaSrc(albumThumb(a))" loading="lazy" alt=""
              @error="hideBrokenCover" />
            <span class="album-opt-title">{{ a.title || a.id }}</span>
            <span class="album-opt-count">{{ a.photoCount || 0 }} 张</span>
          </div>
        </el-option>
      </el-select>
      <!-- P6.51：目标册已有同内容时先报数，再让用户选「跳过 / 同时存在 / 只保留一份」 -->
      <div v-if="photoRelocateMode === 'move' && relocatePreview.duplicates" class="relocate-dup">
        <el-alert type="warning" :closable="false" show-icon
          :title="'目标册已有同内容：选中的 ' + relocatePreview.moving + ' 张里有 '
            + relocatePreview.duplicates + ' 张重复'">
          <template #default>
            <p>
              全库共 {{ relocatePreview.globalCopies }} 处同内容。一张照片只属于一个系列，
              所以同一本册里出现两份相同的图就是重复文件。
            </p>
          </template>
        </el-alert>
        <el-radio-group v-model="relocateDupPolicy" class="relocate-dup-group">
          <el-radio value="skip">跳过重复（重复的那几张不搬）</el-radio>
          <el-radio value="keep">同时存在（都留着，之后在重复文件页处理）</el-radio>
          <el-radio value="replace">只保留一份（目标册里旧的那份文件移入回收站）</el-radio>
        </el-radio-group>
      </div>
      <p class="album-merge-preview" v-if="photoRelocateMode === 'split'">
        新册没有目录（不进目录册体系），扫描不会认领也不会当空壳清理；
        封面留空，审核状态默认「待审核」，要上站请先在审核页通过。
      </p>
      <template #footer>
        <el-button @click="photoRelocateVisible = false">取消</el-button>
        <el-button type="primary" :loading="photoRelocateBusy"
          :disabled="photoRelocateMode === 'split' ? !photoRelocateTitle.trim() : !photoRelocateTarget"
          data-testid="photo-relocate-submit" @click="doPhotoRelocate">
          {{ photoRelocateMode === 'split' ? '确认拆出' : '确认移动' }}
        </el-button>
      </template>
    </el-dialog>
    <!-- P6.90：相册归属规则（扫描按它决定归属；命中不了 = 未归类） -->
    <el-dialog v-model="ruleVisible" title="相册归属规则" width="min(1100px, 96vw)" append-to-body>
      <el-alert type="info" :closable="false" show-icon class="rule-tip"
        title="扫描只认领文件，不再按目录建册；一张照片归哪本册由这里的规则决定，命中不了就是「未归类」。">
        <template #default>
          <p>规则 = 目录（+ 可选文件名前缀）→ 某本册。优先级数字小的先匹配；停用等于临时关掉。</p>
        </template>
      </el-alert>
      <div class="rule-bar">
        <el-input v-model="ruleKeyword" placeholder="搜索目录 / 册名" clearable style="width: 220px"
          @keyup.enter="loadRules" />
        <el-button size="small" :loading="ruleLoading" data-testid="rule-refresh" @click="loadRules">搜索</el-button>
        <span class="uncat-spacer"></span>
        <span class="rule-count">共 {{ ruleRows.length }} 条</span>
        <el-button size="small" type="primary" plain v-hasPermi="['media:admin:edit']"
          data-testid="rule-create" @click="openRuleCreate">新增规则…</el-button>
      </div>
      <el-table :data="ruleRows" v-loading="ruleLoading" size="small" class="rule-table">
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
              @click="toggleRule(scope.row)">{{ scope.row.enabled ? '停用' : '启用' }}</el-button>
            <el-button link type="danger" size="small" v-hasPermi="['media:admin:edit']"
              :data-testid="'rule-delete-' + scope.row.id" @click="removeRule(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!ruleLoading && !ruleRows.length" description="还没有规则" />
      <template #footer>
        <el-button @click="ruleVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 新增规则：选册 + 目录 + 可选前缀 -->
    <el-dialog v-model="ruleFormVisible" title="新增归属规则" width="min(520px, 92vw)" append-to-body>
      <el-form label-width="92px">
        <el-form-item label="目标册">
          <el-select v-model="ruleForm.albumId" filterable placeholder="选择一本册" style="width: 100%">
            <el-option v-for="a in ruleAlbumOptions" :key="a.id" :label="a.title + '（' + a.photoCount + ' 张）'"
              :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目录">
          <el-select v-model="ruleForm.dirPattern" filterable allow-create default-first-option
            placeholder="相对目录（可从「未归类」的目录里挑）" style="width: 100%">
            <el-option v-for="d in ruleDirOptions" :key="d.dir" :label="(d.dir || '（媒体根）') + ' · ' + d.photos + ' 张'"
              :value="d.dir" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件名前缀">
          <el-input v-model="ruleForm.filePrefix" placeholder="留空 = 该目录全部文件；给了就只认以它开头的文件名" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="ruleForm.priority" :min="1" :max="9999" controls-position="right" />
          <span class="rule-sub">数字小的先匹配（带前缀的规则一般给 10）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleFormVisible = false">取 消</el-button>
        <el-button type="primary" :loading="ruleSaving" data-testid="rule-save" @click="saveRule">保 存</el-button>
      </template>
    </el-dialog>

    <!-- P6.52：未归类照片（album_id 为空）—— 站端不展示，可逐张移进某本册 -->
    <el-dialog v-model="uncatVisible" title="未归类照片" width="min(1120px, 96vw)" append-to-body>
      <div class="uncat-bar">
        <span class="uncat-count">共 {{ uncatTotal }} 张 · 站端不展示 · 以后可以再移进别的册</span>
        <el-button size="small" :loading="uncatLoading" data-testid="uncat-refresh" @click="loadUncat">刷新</el-button>
        <span v-if="uncatSelected.length" class="uncat-picked">已选 {{ uncatSelected.length }} 张</span>
        <el-button v-if="uncatSelected.length" size="small" type="primary" v-hasPermi="['media:admin:edit']"
          data-testid="uncat-claim-picked" @click="claimPickedPhotos">建册并入（勾选的 {{ uncatSelected.length }} 张）</el-button>
        <el-button v-if="uncatSelected.length" size="small" text @click="clearUncatPick">清空选择</el-button>
      </div>

      <!-- P6.88：规则模式下扫描不再按目录建册，新目录的照片都停在这里。
           这里给出"按目录一键建册并入"：同时落一条归属规则，之后同目录新文件扫描时自动认领。 -->
      <div v-if="uncatDirs.length" class="uncat-dirs">
        <div class="uncat-dirs-head">
          按目录归册（会同时建一条规则，之后同目录新文件自动归属）
        </div>
        <div v-for="d in uncatDirs" :key="d.dir" class="uncat-dir-row">
          <span class="uncat-dir-name" :title="d.dir || '（媒体根）'">{{ d.dir || '（媒体根）' }}</span>
          <span class="uncat-dir-count">{{ d.photos }} 张 · {{ formatVolume(d.bytes) }}</span>
          <el-tag v-if="d.ruleCount" size="small" type="info">已有 {{ d.ruleCount }} 条规则</el-tag>
          <span class="uncat-spacer"></span>
          <el-button size="small" type="primary" plain :loading="uncatClaiming === d.dir"
            v-hasPermi="['media:admin:edit']" data-testid="uncat-claim"
            @click="claimDir(d)">建册并入</el-button>
        </div>
      </div>
      <div v-loading="uncatLoading" class="uncat-grid">
        <div v-for="p in uncatRows" :key="p.id" class="uncat-card" :class="{ 'is-picked': isUncatPicked(p.id) }">
          <span class="uncat-check" :title="isUncatPicked(p.id) ? '取消勾选' : '勾选这一张'"
            data-testid="uncat-check" @click.stop="toggleUncatPick(p.id)">{{ isUncatPicked(p.id) ? '✓' : '' }}</span>
          <el-image class="uncat-thumb" fit="cover" :src="mediaSrc(p.thumbUrl)"
            :preview-src-list="[mediaSrc(p.previewUrl || p.thumbUrl)]" :initial-index="0"
            preview-teleported hide-on-click-modal>
            <template #error><span class="uncat-ph">{{ photoFileName(p.relPath).slice(0, 1) }}</span></template>
          </el-image>
          <div class="uncat-name" :title="p.relPath">{{ photoFileName(p.relPath) }}</div>
          <div class="uncat-actions">
            <el-button link type="primary" size="small" v-hasPermi="['media:admin:edit']"
              data-testid="uncat-move" @click="moveUncat(p)">移入另一册…</el-button>
          </div>
        </div>
      </div>
      <el-empty v-if="!uncatLoading && !uncatRows.length" description="没有未归类照片" />
      <pagination v-show="uncatTotal > 0" :page-sizes="[24, 48, 96]" :total="uncatTotal"
        v-model:page="uncatPage" v-model:limit="uncatPageSize" @pagination="loadUncat" />
      <template #footer>
        <el-button @click="uncatVisible = false">关闭</el-button>
      </template>
    </el-dialog>
    <!-- P6.46：视频页内播放（以前是新开标签） -->
    <el-dialog v-model="videoPlayVisible" :title="videoPlayTitle" width="min(1100px, 94vw)" append-to-body
      destroy-on-close class="video-dialog">
      <video v-if="videoPlaySrc" :src="videoPlaySrc" controls autoplay class="video-player"></video>
    </el-dialog>
    <!-- 图片浏览：用库数据（GET /album/{id}/photos）渲染，每格 = 缩略图 + seq + 文件名（relPath 末段），
         按 seq 升序；接口 404 时回退到旧的磁盘列举（photoSource='disk'），这时会在顶部提示一行 -->
    <el-dialog v-model="photosVisible" :title="photosTitle" width="min(1120px, 94vw)" class="photos-dialog" append-to-body>
      <template #header>
        <div class="photos-head">
          <span class="photos-head-title">{{ photosTitle }}</span>
          <span class="photos-head-picked" v-if="photoSelected.length">已选 {{ photoSelected.length }} 张</span>
          <span class="photos-head-tip">Shift+点击 / 触屏长按拖动 可连选</span>
          <!-- P6.57：人工排序（拖拽重排当前页，退出时保存） -->
          <el-button v-if="photoList.length && photoSource !== 'disk'" link
            :type="photoSortMode ? 'success' : 'primary'" size="small" data-testid="photo-sort-toggle"
            v-hasPermi="['media:admin:edit']" @click="toggleSortMode">
            {{ photoSortMode ? '完成排序' : '排序' }}
          </el-button>
          <el-button v-if="photoList.length" link type="primary" size="small" class="photos-head-all"
            data-testid="photo-select-all" @click="toggleSelectAll">
            {{ allPicked ? '取消全选本页' : '全选本页（' + photoList.length + '）' }}
          </el-button>
        </div>
      </template>
      <p class="photo-notice" v-if="photoNotice">{{ photoNotice }}</p>
      <!-- P6.22：按分级筛选（用筛选条而不是 tab）：
           ① 不叠第二层导航，和「已选 N 张 / 批量设分级」在同一张网格里；
           ② 每个档位带数量，「还剩多少张是继承」一眼可见；
           ③ 只在已加载的全册数据上做前端切片，点一下不发请求。 -->
      <div class="photo-filter" v-if="photoSource !== 'disk' && photoRowsAll.length" data-testid="photo-rating-filter">
        <span class="photo-filter-label">本册分级
          <b class="photo-album-rating" :class="'ar-' + albumPhotoRating">{{ albumPhotoRatingLabel }}</b>
        </span>
        <span class="photo-filter-divider"></span>
        <span class="photo-filter-label">筛选</span>
        <button v-for="opt in PHOTO_RATING_FILTERS" :key="opt.value" type="button"
          class="photo-filter-chip" :class="{ on: photoRatingFilter === opt.value, empty: !photoRatingCounts[opt.value] }"
          :title="photoFilterTitle(opt)"
          @click="setPhotoRatingFilter(opt.value)">
          <i class="photo-filter-dot" :class="'dot-' + opt.value"></i>{{ opt.label }}<b>{{ photoRatingCounts[opt.value] }}</b>
        </button>
        <!-- P6.24：本册图片的内容自动分级（服务端 NSFW 模型逐张判露点，先预览后写库） -->
        <el-button size="small" type="primary" plain icon="MagicStick" class="photo-auto-rate"
          v-hasPermi="['media:admin:edit']" @click="autoRateVisible = true">自动分级</el-button>
      </div>
      <div
        class="photo-grid"
        :class="{ 'range-on': multiMode }"
        v-loading="photosLoading"
        @pointermove="onGridPointerMove($event)"
        @pointerup="onGridPointerUp($event)"
        @pointercancel="onGridPointerUp($event)"
      >
        <div
          class="photo-item"
          :class="{ picked: photoSelected.includes(String(photo.id)), 'sorting': photoSortMode }"
          :data-id="String(photo.id)"
          v-for="(photo, photoIndex) in photoList"
          :key="photoKey(photo)"
          :draggable="photoSortMode"
          @dragstart="onSortDragStart(photoIndex)"
          @dragover.prevent
          @drop.prevent="onSortDrop(photoIndex)"
          @click="photoSortMode || onPhotoClick(photo)"
          @pointerdown="onCardPointerDown(photo, $event)"
        >
          <!-- P6.17：自绘勾选框（el-checkbox 的 change 拿不到 shiftKey），支持 Shift 连选 -->
          <span
            class="photo-pick"
            :class="{ on: photoSelected.includes(String(photo.id)) }"
            role="checkbox"
            :aria-checked="photoSelected.includes(String(photo.id))"
            title="勾选；按住 Shift 点击可连选一段"
            @click.stop="onPickClick(photo, $event)"
          ></span>
          <div class="photo-thumb">
            <img :src="mediaSrc(photo.thumbUrl)" loading="lazy" :alt="'第 ' + photo.seq + ' 张'" />
            <span class="photo-seq">{{ photo.seq }}</span>
            <!-- P6.20：悬停出现「选到此」——从上一张点过的图连选到这里（触屏上直接点这个按钮也可以） -->
            <span class="photo-range" title="从上次点选的那张，连选到这里" @click.stop="selectToHere(photo)">选到此</span>
            <!-- P6.09 原子级分级：点角标展开 4 个选项（继承/大众/家长指导/限制），一次点到位 -->
            <el-dropdown
              trigger="click"
              class="photo-rating-dd"
              placement="bottom-end"
              @command="(v) => setPhotoRating(photo, v)"
              @click.stop
            >
              <span
                class="photo-rating"
                :class="['pr-' + (photo.contentRating || 'inherit'), { wider: photoIsWider(photo) }]"
                :title="'这张图的分级：' + photoRatingLabel(photo) + (photoIsWider(photo) ? '（比本册更宽，访客能单独看到这张）' : '')"
                @click.stop
              >{{ photoRatingShort(photo) }}</span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="inherit">继承相册（{{ albumPhotoRatingLabel }}）</el-dropdown-item>
                  <el-dropdown-item command="general">大众级</el-dropdown-item>
                  <el-dropdown-item command="guidance">家长指导级</el-dropdown-item>
                  <el-dropdown-item command="restricted">限制级</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <span class="photo-name" :title="photo.relPath || photoFileName(photo.relPath)">{{ photoFileName(photo.relPath) }}</span>
        </div>
      </div>
      <el-empty :description="photoRatingFilter === 'all' ? '暂无图片' : '该分级下没有图片'" v-if="!photosLoading && !photoList.length" />
      <pagination v-show="photoFilteredTotal > 0" :page-sizes="[48, 96, 192]" :total="photoFilteredTotal" v-model:page="photoQuery.pageNum"
        v-model:limit="photoQuery.pageSize" @pagination="handlePhotoPage" />
      <!-- P6.14：批量条放 footer（固定可见），勾选后立刻能操作；之前它跟在长网格后面，滚到看不见 -->
      <template #footer>
        <div class="photo-batch" data-testid="photo-batch-bar">
          <!-- P6.15：批量条只在真的勾选之后出现；没事时底部只有一个关闭 -->
          <template v-if="photoSelected.length">
            <span class="photo-batch-count">已选 {{ photoSelected.length }} 张</span>
            <el-button size="small" :title="'设为继承相册（实际生效：' + albumPhotoRatingLabel + '）'"
              @click="applyPhotoRating(null)">继承相册</el-button>
            <el-button size="small" type="primary" plain @click="applyPhotoRating('general')">大众</el-button>
            <el-button size="small" type="warning" plain @click="applyPhotoRating('guidance')">家长指导</el-button>
            <el-button size="small" type="danger" plain @click="applyPhotoRating('restricted')">限制</el-button>
            <!-- P6.51：按图改归属（人工归属，重扫不再按目录拽回） -->
            <el-button size="small" plain data-testid="photo-move" @click="openPhotoRelocate('move')">移到另一册…</el-button>
            <el-button size="small" plain data-testid="photo-split" @click="openPhotoRelocate('split')">拆出新册…</el-button>
            <!-- P6.52：移出本册，变成「未归类」（站端不展示，以后可以再移进别的册） -->
            <el-button size="small" plain data-testid="photo-detach" @click="detachSelectedPhotos">移出相册（未归类）</el-button>
            <el-button size="small" link @click="photoSelected = []">清空</el-button>
            <el-button size="small" v-if="multiMode" @click="exitMultiMode">完成</el-button>
          </template>
          <el-button size="small" @click="photosVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- P6.24：图片内容自动分级（服务端 NSFW 模型逐张判露点，先预览、确认后写库） -->
    <PhotoAutoRateDialog v-model="autoRateVisible"
      :album-id="String((currentAlbum && currentAlbum.id) || photoQuery.albumId || '')"
      :album-title="(currentAlbum && currentAlbum.title) || ''" :items="autoRateItems"
      @applied="onAutoRateApplied" />

    <!-- P6.10 批量设置人物 / 工作室 -->
    <el-dialog v-model="videoBatchPersonVisible" title="批量设置人物" width="min(460px, 92vw)" append-to-body>
      <p class="batch-lead">将替换选中 {{ selectedVideos.length }} 个视频的人物归属；留空 = 清空（回到「素人」兜底）。</p>
      <el-select v-model="videoBatchPersonIds" multiple filterable placeholder="选择人物（可多选）" style="width: 100%">
        <el-option v-for="item in peopleOptions" :key="item.id" :label="item.name + ' (' + item.videoCount + ')'" :value="item.id" />
      </el-select>
      <template #footer>
        <el-button @click="videoBatchPersonVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" data-testid="video-batch-person-submit" @click="submitVideoBatchPerson">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="videoBatchStudioVisible" title="批量设置工作室" width="min(460px, 92vw)" append-to-body>
      <p class="batch-lead">将替换选中 {{ selectedVideos.length }} 个视频的工作室；留空 = 清空。</p>
      <el-select v-model="videoBatchStudioIds" multiple filterable placeholder="选择工作室（可多选）" style="width: 100%">
        <el-option v-for="item in studioOptions" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <template #footer>
        <el-button @click="videoBatchStudioVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" data-testid="video-batch-studio-submit" @click="submitVideoBatchStudio">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="albumBatchPersonVisible" title="批量设置相册人物" width="min(460px, 92vw)" append-to-body>
      <p class="batch-lead">将把选中 {{ selectedAlbums.length }} 本相册归到同一人物（相册是单人物字段）；留空 = 未归类。</p>
      <el-select v-model="albumBatchPersonId" filterable clearable placeholder="选择人物" style="width: 100%">
        <el-option v-for="item in peopleOptions" :key="item.id" :label="item.name + ' (' + item.albumCount + ')'" :value="item.id" />
      </el-select>
      <template #footer>
        <el-button @click="albumBatchPersonVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" data-testid="album-batch-person-submit" @click="submitAlbumBatchPerson">保存</el-button>
      </template>
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

    <!-- 视频人物：多选人物 + 为每个选中人物填角色，PUT /api/media/admin/videos/{id}/persons -->
    <el-dialog v-model="videoPersonVisible" title="视频人物" width="min(560px, 94vw)" append-to-body>
      <p class="vp-target">{{ videoPersonTitle }}</p>
      <el-alert v-if="personPickError" :title="personPickError" type="warning" :closable="false" show-icon class="vp-alert" />
      <el-select v-model="videoPersonIds" multiple filterable clearable placeholder="选择人物（可多选）"
        :loading="personPickLoading" :disabled="!!personPickError" style="width: 100%">
        <el-option v-for="item in personPickOptions" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <div v-if="videoPersonIds.length" class="vp-role-list">
        <div v-for="pid in videoPersonIds" :key="'role-' + pid" class="vp-role-row">
          <span class="vp-role-name">{{ personNameOf(pid) }}</span>
          <el-input v-model="videoPersonRoles[pid]" maxlength="40" clearable placeholder="角色（选填，如 主角 / 配角）" />
        </div>
      </div>
      <p class="vp-tip">保存会整条覆盖该视频的人物集合与角色（不是增量追加）。</p>
      <template #footer>
        <el-button @click="videoPersonVisible = false">取 消</el-button>
        <el-button type="primary" :loading="videoPersonSaving" :disabled="!!personPickError" @click="submitVideoPersons"
          v-hasPermi="['media:admin:edit']">保 存</el-button>
      </template>
    </el-dialog>

    <!-- 相册人物：多选人物，PUT /api/media/admin/albums/{id}/persons -->
    <el-dialog v-model="albumPersonVisible" title="相册人物" width="min(520px, 94vw)" append-to-body>
      <p class="vp-target">{{ albumPersonTitle }}</p>
      <el-alert v-if="personPickError" :title="personPickError" type="warning" :closable="false" show-icon class="vp-alert" />
      <el-select v-model="albumPersonIds" multiple filterable clearable placeholder="选择人物（可多选）"
        :loading="personPickLoading" :disabled="!!personPickError" style="width: 100%">
        <el-option v-for="item in personPickOptions" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <p class="vp-tip">保存会整本覆盖该相册的人物集合；「改人物」按钮仍保留单本单人的旧写法。</p>
      <template #footer>
        <el-button @click="albumPersonVisible = false">取 消</el-button>
        <el-button type="primary" :loading="albumPersonSaving" :disabled="!!personPickError" @click="submitAlbumPersons"
          v-hasPermi="['media:admin:edit']">保 存</el-button>
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

    <!-- P6.83：给单条视频编辑标签（多选 + 可直接输新名字新建） -->
    <el-dialog v-model="videoTagEditVisible" title="设置本视频的标签" width="min(520px, 92vw)" append-to-body>
      <div class="tag-edit-tip">{{ videoTagEditTitle }}</div>
      <el-select v-model="videoTagEditValue" multiple filterable allow-create default-first-option
        placeholder="选择或输入新标签名" style="width: 100%">
        <el-option v-for="t in tagOptions" :key="t.id" :label="t.name" :value="String(t.id)" />
      </el-select>
      <div class="tag-edit-hint">
        输入不存在的名字回车 = 现场新建并挂上。标签是跨条目的语义维度，与「册（归属）」「人物」互不影响。
      </div>
      <template #footer>
        <el-button @click="videoTagEditVisible = false">取 消</el-button>
        <el-button type="primary" :loading="videoTagEditSaving" data-testid="video-tag-save"
          @click="saveVideoTagEdit">保 存</el-button>
      </template>
    </el-dialog>

    <!-- 标签管理：字典维护（新建 / 搜索 / 删除），列表前端过滤 + 前端分页 -->
    <el-dialog v-model="tagVisible" title="标签管理" width="min(760px, 94vw)" append-to-body>
      <div class="tag-create">
        <el-input v-model="tagForm.name" placeholder="标签名称（1-32 字符）" clearable maxlength="32" show-word-limit class="tag-create-name"
          @keyup.enter="submitCreateTag" />
        <el-color-picker v-model="tagForm.color" title="标签颜色（可留空）" />
        <span class="tag-create-color">{{ tagForm.color || '不设颜色' }}</span>
        <el-button type="primary" icon="Plus" :loading="tagCreating" @click="submitCreateTag" v-hasPermi="['media:admin:edit']">新建</el-button>
      </div>

      <div class="tag-filter">
        <el-input v-model="tagQuery.keyword" placeholder="搜索名称 / 颜色" clearable prefix-icon="Search" class="tag-filter-input"
          @input="handleTagFilter" @clear="handleTagFilter" />
        <span class="tag-filter-count">共 {{ filteredTags.length }} 个标签 / 未过滤 {{ tagList.length }} 个</span>
        <el-button icon="Refresh" :loading="tagLoading" @click="loadTags">刷新</el-button>
      </div>

      <el-alert v-if="tagError" :title="tagError" type="error" :closable="false" show-icon class="tag-error" />
      <el-table v-if="tagLoading || tagPageList.length" v-loading="tagLoading" :data="tagPageList" class="media-table">
        <el-table-column label="名称" prop="name" min-width="180" :show-overflow-tooltip="true" />
        <el-table-column label="父标签" width="150" :show-overflow-tooltip="true">
          <template #default="scope">{{ tagParentLabel(scope.row) }}</template>
        </el-table-column>
        <el-table-column label="颜色" width="170" align="center">
          <template #default="scope">
            <span class="tag-swatch" :class="{ 'tag-swatch-empty': !scope.row.color }"
              :style="{ background: scope.row.color || 'transparent' }"></span>
            <span class="tag-color-text">{{ scope.row.color || '未设置' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="使用数" width="110" align="center">
          <template #default="scope">
            <el-tag :type="(scope.row.useCount || 0) > 0 ? 'primary' : 'info'" size="small">{{ scope.row.useCount || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center" fixed="right">
          <template #default="scope">
            <el-button link type="primary" icon="Edit" @click="openTagEdit(scope.row)"
              v-hasPermi="['media:admin:edit']">改名/改色</el-button>
            <el-button link type="danger" icon="Delete" :loading="tagDeletingId === scope.row.id" @click="handleDeleteTag(scope.row)"
              v-hasPermi="['media:admin:edit']">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty :description="tagList.length ? '没有匹配的标签，换个关键词试试' : '还没有标签，先在上方新建一个'"
        v-if="!tagLoading && !tagError && !tagPageList.length" />
      <pagination v-show="filteredTags.length > tagQuery.pageSize" :total="filteredTags.length" :page-sizes="[20, 50, 100]"
        v-model:page="tagQuery.pageNum" v-model:limit="tagQuery.pageSize" />
      <template #footer>
        <el-button @click="tagVisible = false">关 闭</el-button>
      </template>
    </el-dialog>

    <!-- 标签改名 / 改色：PATCH /api/media/admin/tags/{id} -->
    <el-dialog v-model="tagEditVisible" title="编辑标签" width="min(420px, 92vw)" append-to-body>
      <el-form :model="tagEditForm" label-width="72px">
        <el-form-item label="名称">
          <el-input v-model="tagEditForm.name" maxlength="32" show-word-limit placeholder="标签名称（1-32 字符）"
            @keyup.enter="submitTagEdit" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="tagEditForm.color" />
          <span class="tag-create-color">{{ tagEditForm.color || '不设颜色' }}</span>
        </el-form-item>
        <el-form-item label="父标签">
          <el-select v-model="tagEditForm.parentId" clearable filterable placeholder="顶级标签（无父级）" style="width: 100%">
            <el-option label="（顶级标签）" :value="null" />
            <el-option v-for="opt in tagParentOptions" :key="'p-' + opt.id" :label="opt.label" :value="opt.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <p class="tag-edit-tip">改名会同步到所有已关联该标签的视频；改成已存在的名称会被拒绝。</p>
      <template #footer>
        <el-button @click="tagEditVisible = false">取 消</el-button>
        <el-button type="primary" :loading="tagEditSaving" @click="submitTagEdit" v-hasPermi="['media:admin:edit']">保 存</el-button>
      </template>
    </el-dialog>

    <!-- 站端编辑策略：三档（禁止编辑 / 本地编辑 / 完全编辑） -->
    <el-dialog v-model="policyVisible" title="编辑策略" width="min(600px, 94vw)" append-to-body>
      <div v-loading="policyLoading" class="policy-box">
        <p class="policy-lead">决定站端访客能对媒体库做什么。保存后访客刷新页面即生效。</p>
        <el-radio-group v-model="policyForm.level" class="policy-group">
          <div v-for="opt in POLICY_OPTIONS" :key="opt.value" class="policy-item" :class="{ 'is-on': policyForm.level === opt.value }"
            @click="policyForm.level = opt.value">
            <el-radio :value="opt.value">{{ opt.label }}</el-radio>
            <span class="policy-desc">{{ opt.desc }}</span>
          </div>
        </el-radio-group>
        <p class="policy-warn">若把本实例挂在公网做演示，请选「本地编辑」或「禁止编辑」，否则陌生人可修改你的媒体库</p>
      </div>
      <template #footer>
        <el-button @click="policyVisible = false">取 消</el-button>
        <el-button type="primary" :loading="policySaving" @click="submitEditPolicy" v-hasPermi="['media:admin:edit']">保 存</el-button>
      </template>
    </el-dialog>

    <!-- 内容分级批量设置（P5.99）：POST /api/media/admin/rating/batch -->
    <el-dialog v-model="ratingBatchVisible" :title="ratingBatchTitle" width="min(460px, 92vw)" append-to-body>
      <p class="rating-batch-lead">
        将给选中的 {{ ratingBatchCount }} 个{{ ratingBatchKindText }}统一设置分级。分级决定未登录访客能不能看到它。
      </p>
      <el-radio-group v-model="ratingBatchValue" class="rating-batch-group">
        <el-radio v-for="opt in RATING_OPTIONS" :key="opt.value" :value="opt.value" :data-testid="'batch-rating-' + opt.value">
          {{ opt.label }}
        </el-radio>
      </el-radio-group>
      <p class="rating-batch-tip">
        分级本身不影响已登录用户；「未登录可见」的开关在<strong>库根管理</strong>页的「分级与可见性」里。
      </p>
      <template #footer>
        <el-button @click="ratingBatchVisible = false">取 消</el-button>
        <el-button type="primary" :loading="ratingBatchSaving" data-testid="batch-rating-submit"
          @click="submitBatchRating">保 存</el-button>
      </template>
    </el-dialog>

    <!-- P5.97：扫描入库抽屉（与库根管理页共用同一个执行器组件） -->
    <el-drawer v-model="scanVisible" title="扫描 / 导入媒体库" size="min(920px, 96vw)" append-to-body destroy-on-close>
      <scan-page :auto-start="false" embedded @finished="handleScanFinished" />
    </el-drawer>

    <!-- 维护面板（P6.04 四段式）：日常生成 / 清理 / 诊断 / 危险；执行仍复用页面上既有的任务锁与轮询 -->
    <el-drawer v-model="maintVisible" title="维护" size="min(860px, 96vw)" append-to-body destroy-on-close class="maint-drawer">
      <maint-panel v-model:scanLimit="scanLimit" :scan-running="scanRunning" :refresh-key="maintRefreshKey"
        :selected-video-ids="selectedVideoIds" :filter-active="videoFilterActive" :filtered-count="videoTotal"
        :last-job="maintLastJob" @run="handleMaintRun" @gc="handleGc"
        @rating-applied="handleRatingApplied" @trash-cleared="handleTrashCleared" @open-duplicates="openDuplicates" />
    </el-drawer>

    <!-- P5.10-B 生成结果清单：任务完成后按 job 日志的 ITEM / RESULT 行弹出「本次生成了哪些」 -->
    <derive-result-dialog v-model="deriveResultVisible" :model="deriveResultModel" :refreshing="deriveRefreshing"
      @refresh="refreshDeriveColumn" />

    <!-- P4-B 重复文件抽屉：kind 切换 / 列表 / 展开副本 / 分页 / 两处二次确认都在子组件里 -->
    <el-drawer v-model="duplicatesVisible" title="重复文件" size="min(1180px, 96vw)" append-to-body destroy-on-close>
      <!-- P6.51：两个口径分 tab —— 主行同内容（新口径，默认）与副本路径（原有别名表） -->
      <el-tabs v-model="dupTab" class="dup-tabs">
        <el-tab-pane label="同内容多份（按内容哈希）" name="main">
          <duplicate-main-panel v-if="dupTab === 'main'" />
        </el-tab-pane>
        <el-tab-pane label="副本路径（同目录第二份）" name="alias">
          <duplicates-panel v-if="dupTab === 'alias'" />
        </el-tab-pane>
        <!-- P6.77：相似图片（感知指纹）—— 字节不同但视觉相同的那些 -->
        <el-tab-pane label="相似图片（重新压缩的同一张）" name="near">
          <near-duplicate-panel v-if="dupTab === 'near'" />
        </el-tab-pane>
        <!-- P6.80：册级重复——两本册其实装的是同一套图，逐张点不现实 -->
        <el-tab-pane label="册级重复（两本册是同一套图）" name="album">
          <album-duplicate-panel v-if="dupTab === 'album'" />
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
  </div>
</template>

<script setup name="Media">
import { useRoute } from 'vue-router'
import { listVideos, listAlbums, listPhotos, getAlbumPhotos, setHidden, removeMedia, restoreMedia, restoreTrash, setAlbumPerson, listPeople, getStats, startScan, getScanJob, getScanLatest, listTrash, trashStats, purgeTrash, listTags, createTag, deleteTag, updateTag, getEditPolicy, setEditPolicy } from '@/api/media'
// 人物管理（P3-B）：独立 import 行，不改动上面那行既有导入
import { listPersons, setVideoPersons, setAlbumPersons } from '@/api/media'
// P6.10：批量人物 / 工作室归属
import { batchPerson, batchStudio, listStudios } from '@/api/media'
// 维护面板（P6.04 四段式：日常生成 / 清理 / 诊断 / 危险）：放在同目录子组件，主页面只做挂载与执行
import MaintPanel from './MaintPanel'
// P6.04：原「扫描入库」独立页目录已删除；可复用的执行器迁到 media/ingest/，只给抽屉与库根页嵌入
import ScanPage from './ingest/index.vue'
// 重复文件抽屉（P4-B）：独立子组件 + 独立 api 导出，不改动上面两行既有导入
import DuplicatesPanel from './DuplicatesPanel'
// P6.51：同内容多份（主行维度）—— 一张照片只属于一个系列，跨册同 hash 也是重复
import DuplicateMainPanel from './DuplicateMainPanel'
import NearDuplicatePanel from './NearDuplicatePanel'
import AlbumDuplicatePanel from './AlbumDuplicatePanel'
// 派生资源状态（P5.10-B）：徽标单元格 / 结果对话框 / 日志解析纯函数，三者都独立成文件，主页面只接线
import DeriveBadges from './DeriveBadges.vue'
import DeriveResultDialog from './DeriveResultDialog.vue'
// P6.24：图片内容自动分级（服务端 NSFW 模型，先预览后写库）
import PhotoAutoRateDialog from './PhotoAutoRateDialog.vue'
// P5.12：顶部「资源类型 × 状态」筛选条独立成子组件（样式与选项都在子组件里），页面只接线
import DeriveFilterBar from './DeriveFilterBar.vue'
import DeriveEmptyState from './DeriveEmptyState.vue'
import { deriveMapOf, buildResultModel, DERIVE_FILTER_DEFAULT, filterVideoRows } from './deriveModel'
import { getDeriveStatus } from '@/api/media'
// 内容分级（P5.99）：行内下拉 / 批量设置用到的接口与值域常量
import {
  videoTagStats, listTags as listTagsApi, updateVideoMeta, renameAlbum, deleteAlbum,
  listUncategorizedDirs, claimUncategorizedDir,
  listAlbumRules, createAlbumRule, updateAlbumRule, deleteAlbumRule, listAlbumRuleDirs
} from '@/api/media'
import { mergeAlbumsSimilar } from '@/api/media'
import { setVideoRating, setAlbumRating, setRatingBatch, setReviewState, mergeAlbums, previewAlbumMerge, moveAlbumPhotos, splitAlbumPhotos, previewPhotoMove, detachAlbumPhotos, listUncategorizedPhotos, confirmAlbums as confirmAlbumsApi, reorderAlbumPhotos } from '@/api/media'
import { RATING_OPTIONS, ratingOf } from './ratingOptions'

const route = useRoute()

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
  // P6.21：pageSize 不进筛选记忆——它一旦被记住（比如选过 1000 条/页）就会让表格一次渲染上百行，
  // 首屏和切 tab 都要重排这些行（实测 169 行的相册表 = 1.9 万个 DOM 节点 / 414 个弹层 / 切一次 500ms+）。
  // 每页条数属于「临时查看姿势」，刷新回默认 10 行。
  video: ['keyword', 'folder', 'vcodec', 'hidden', 'sort', 'ids'],
  album: ['keyword', 'personId', 'hidden', 'sort']
}
const TRASH_PAGE_MAX = 200 // 与后端 /trash 的 pageSize 上限一致

const videoQuery = reactive({ pageNum: 1, pageSize: 10, keyword: '', folder: '', vcodec: '', hidden: 'all', sort: 'mtime-desc', ids: '', rating: '', tagFilter: [] })
const videoList = ref([])
const videoTotal = ref(0)
const videoLoading = ref(false)
const vcodecOptions = ref([])

const albumQuery = reactive({ pageNum: 1, pageSize: 10, keyword: '', personId: null, hidden: 'all', sort: 'photoCount-desc', rating: '' })
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
const photoQuery = reactive({ pageNum: 1, pageSize: 96, albumId: '' })
const currentAlbum = ref({})
/* 图片预览弹窗的数据源（P2-D）：
   db   = GET /api/media/admin/album/{id}/photos（只读库，库里有几行就画几格）——一次取全册，前端分页；
   disk = 旧的 GET /photos（后端按物理目录列举）——接口未就绪时的回退，会把 _说明.txt 之类也画成一格。 */
const photoSource = ref('db')
const photoRowsAll = ref([])
const photoNotice = ref('')
// P6.24：图片内容自动分级弹窗
const autoRateVisible = ref(false)

const personVisible = ref(false)
const personSubmitting = ref(false)
const personAlbumTitle = ref('')
const personForm = reactive({ albumId: '', personId: '' })

// 标签管理（字典维护）：列表一次取全，前端过滤 + 前端分页
const TAG_NAME_MAX = 32
const tagVisible = ref(false)
const tagLoading = ref(false)
const tagError = ref('')
const tagList = ref([])
const tagCreating = ref(false)
const tagDeletingId = ref(null)
const tagQuery = reactive({ keyword: '', pageNum: 1, pageSize: 20 })
const tagForm = reactive({ name: '', color: null })

/* 标签改名 / 改色 */
const tagEditVisible = ref(false)
const tagEditSaving = ref(false)
const tagEditForm = reactive({ id: null, name: '', color: null, parentId: null })

/* 站端编辑策略（三档）：与后端 GET/PUT /api/media/admin/edit-policy 对齐 */
const POLICY_OPTIONS = [
  { value: 'off', label: '禁止编辑', desc: '站端所有编辑入口禁用：只能浏览，不能评分 / 打标签 / 加标记' },
  { value: 'local', label: '本地编辑', desc: '允许编辑，但只写访客自己的浏览器（localStorage），服务端数据不变' },
  { value: 'full', label: '完全编辑', desc: '允许编辑并写入服务端（匿名访客也能修改媒体库）' }
]
const policyVisible = ref(false)
const policyLoading = ref(false)
const policySaving = ref(false)
const policyForm = reactive({ level: 'full' })

// 前端过滤：名称或颜色包含关键词（颜色支持输 #abc 之类）
const filteredTags = computed(() => {
  const kw = (tagQuery.keyword || '').trim().toLowerCase()
  if (!kw) {
    return tagList.value
  }
  return tagList.value.filter(item => {
    const name = (item.name || '').toLowerCase()
    const color = (item.color || '').toLowerCase()
    return name.indexOf(kw) > -1 || color.indexOf(kw) > -1
  })
})

// 前端分页：只切当前页，总数用过滤后的长度
const tagPageList = computed(() => {
  const start = (tagQuery.pageNum - 1) * tagQuery.pageSize
  return filteredTags.value.slice(start, start + tagQuery.pageSize)
})

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

/** 维护面板：抽屉开关；maintRefreshKey 在任务结束后自增，让面板重读导出 / 回收站 / 派生用量 / 后端历史 */
const maintVisible = ref(false)

/** P5.97：扫描入库抽屉（工具栏「扫描 / 导入」） */
const scanVisible = ref(false)

function openScanDrawer() {
  scanVisible.value = true
}

/** 扫描任务结束：条目数变了，刷新统计与列表（与其它任务结束时同一套刷新） */
function handleScanFinished() {
  refreshAll()
}
const maintRefreshKey = ref(0)

/** P6.04：最近一次结束的维护任务（原样传给面板写「上次执行」；只认面板自己发起的那个 actionKey） */
const maintLastJob = ref(null)

/** P6.04：视频页当前是否真的设置了筛选条件（维护抽屉的「当前筛选结果」范围据此启用） */
const videoFilterActive = computed(() => {
  if (activeTab.value !== 'video') return false
  return !!((videoQuery.keyword || '').trim() || videoQuery.vcodec
    || (videoQuery.hidden && videoQuery.hidden !== 'all') || videoQuery.ids
    || (Array.isArray(videoQuery.tagFilter) && videoQuery.tagFilter.length))
})

/** P6.04：清空回收站后刷新统计卡片与回收站页（面板只负责删，页面负责刷新） */
function handleTrashCleared() {
  loadStats()
  if (activeTab.value === 'trash') {
    loadTrash()
  }
}

/** P6.51：重复文件抽屉的两个口径 tab，默认落在「同内容多份」 */
const dupTab = ref('main')
/** P4-B 重复文件抽屉：内容全在 DuplicatesPanel 里（自己拉数据、自己分页），页面只存开关 */
const duplicatesVisible = ref(false)

function openDuplicates() {
  duplicatesVisible.value = true
}

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

/** 册下拉项的封面 404 时别显示破图：把图藏掉，标题与张数照常显示 */
function hideBrokenCover(e) {
  if (e && e.target) e.target.style.visibility = 'hidden'
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
  tabLoaded.video = true
  videoLoading.value = true
  persistFilters('video', videoQuery)
  const params = buildParams(videoQuery)
  // P6.82：标签筛选（多选）。取第一个真标签走既有 tagId 层级筛选；勾了「无标签」就走 noTag。
  const tagSel = Array.isArray(videoQuery.tagFilter) ? videoQuery.tagFilter.map(String) : []
  const realTags = tagSel.filter((v) => v !== '__none__')
  if (realTags.length) {
    params.tagId = realTags[0]
  }
  if (tagSel.indexOf('__none__') > -1) {
    params.noTag = true
  }
  delete params.tagFilter
  listVideos(params).then(res => {
    videoList.value = (res && res.rows) || []
    videoTotal.value = (res && res.total) || 0
    // P5.10-B：派生资源列与主列表同步刷新（ids 用当前页的 videoId，两次查询条件因此完全一致）
    loadDeriveStatus(videoList.value)
  }).finally(() => { videoLoading.value = false })
}

/**
 * 全库编码枚举：原来是从「当前页」去重，默认每页 10 条时只可能看到 h264，等于筛不出 hevc/mpeg4/vp9。
 * /api/media/admin/stats 没有 vcodec 字段（已核对后端），又不改后端，因此按约定用 pageSize=200 拉一次全库去重。
 * 同时给出每个编码的条数，方便判断「这个编码有多少素材」。
 */
/** 标签选项（P6.82：视频列表的语义筛选改由标签承担） */
const tagOptions = ref([])
const tagStats = reactive({ total: 0, tagged: 0, untagged: 0 })

function loadTagOptions() {
  listTagsApi().then(res => {
    const rows = Array.isArray(res) ? res : (res && (res.rows || res.data)) || []
    tagOptions.value = rows.map(t => ({ id: t.id, name: t.name }))
  }).catch(() => { tagOptions.value = [] })
  videoTagStats().then(res => {
    tagStats.total = (res && res.total) || 0
    tagStats.tagged = (res && res.tagged) || 0
    tagStats.untagged = (res && res.untagged) || 0
  }).catch(() => { /* 统计失败不影响列表 */ })
}

/** 一键筛出「还没打标签」的视频（提醒补标签用） */
function filterUntagged() {
  videoQuery.tagFilter = ['__none__']
  videoQuery.pageNum = 1
  loadVideos()
}

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
  videoQuery.rating = ''
  videoQuery.sort = 'mtime-desc'
  // P6.21：每页条数是显示偏好，不跟筛选一起重置（用户选了 50/页，清条件后应该还是 50/页）
  clearFilters('video')
  loadVideos()
}

const videoPlayVisible = ref(false)
const videoPlaySrc = ref('')
const videoPlayTitle = ref('')

/** P6.46：视频预览改成页内播放（之前是新开标签，来回切很烦） */
function previewVideo(row) {
  if (!row || !row.relPath) {
    proxy.$modal.msgWarning('这条视频没有文件路径')
    return
  }
  videoPlayTitle.value = row.title || row.id
  videoPlaySrc.value = mediaSrc('/api/media/file?p=' + encodeURIComponent(row.relPath))
  videoPlayVisible.value = true
}

// ------------------------------------------------------------------ 相册

function loadAlbums() {
  tabLoaded.album = true
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
  albumQuery.rating = ''
  albumQuery.sort = 'photoCount-desc'
  // P6.21：每页条数是显示偏好，不跟筛选一起重置
  clearFilters('album')
  loadAlbums()
}

function openPhotos(row) {
  currentAlbum.value = row
  photosVisible.value = true
  photoQuery.albumId = row.id
  photoQuery.pageNum = 1
  photoRowsAll.value = []
  photoList.value = []
  photoTotal.value = 0
  photoNotice.value = ''
  photoSource.value = 'db'
  // P6.17：换一本册就清空勾选与锚点，避免把上一本的选中带过来
  photoSelected.value = []
  photoRatingFilter.value = 'all'
  pickAnchor = null
  loadPhotos()
}

/** 弹窗标题：「共 N 条」取库里的记录数，与格子数一致（磁盘回退态不写条数，免得又数成目录文件） */
const photosTitle = computed(() => {
  const title = (currentAlbum.value && currentAlbum.value.title) || ''
  if (photoSource.value !== 'db') return '图片 · ' + title
  return '图片 · ' + title + '（共 ' + photoTotal.value + ' 条）'
})

/** 后端还没部署 P2-D-A 时的回退提示：说清「不是页面坏了，且当前列的东西可能不是图片」 */
const PHOTO_NOT_READY = '相册照片接口未就绪，当前展示的是磁盘目录（可能包含非媒体文件）'

function loadPhotos() {
  if (photoSource.value === 'disk') {
    loadPhotosFromDisk()
    return
  }
  photosLoading.value = true
  getAlbumPhotos(photoQuery.albumId).then(res => {
    const rows = Array.isArray(res) ? res : ((res && res.rows) || [])
    // 库里按 seq 升序渲染：磁盘顺序（mtime / 字母序）不代表相册里的真实顺序
    photoRowsAll.value = rows.map(normalizePhotoRow).sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0))
    photoTotal.value = Array.isArray(res) ? photoRowsAll.value.length : Number((res && res.total) || photoRowsAll.value.length)
    applyPhotoPage()
  }).catch(() => {
    // 接口未就绪（404）也不能让弹窗空着：退回旧的磁盘列举，并在弹窗顶部说明当前数据源
    photoSource.value = 'disk'
    photoRowsAll.value = []
    photoNotice.value = PHOTO_NOT_READY
    photoQuery.pageNum = 1
    loadPhotosFromDisk()
  }).finally(() => { if (photoSource.value === 'db') photosLoading.value = false })
}

/** 旧实现（仅回退用）：GET /photos，后端按物理目录列举，会把 _说明.txt 之类也画成一格 */
function loadPhotosFromDisk() {
  photosLoading.value = true
  listPhotos({ albumId: photoQuery.albumId, pageNum: photoQuery.pageNum, pageSize: photoQuery.pageSize }).then(res => {
    photoList.value = (res && res.rows) || []
    photoTotal.value = (res && res.total) || 0
  }).finally(() => { photosLoading.value = false })
}

/** 库数据一次取全册，翻页在前端切（页码越界时夹回最后一页） */
function applyPhotoPage() {
  // P6.17：换页就把锚点清掉，避免跨页的「看不见的范围选择」
  pickAnchor = null
  const size = Number(photoQuery.pageSize) || 24
  const rows = photoSource.value === 'disk' ? photoRowsAll.value : photoFilteredRows.value
  const pages = Math.max(1, Math.ceil(rows.length / size))
  if (photoQuery.pageNum > pages) photoQuery.pageNum = pages
  const start = (photoQuery.pageNum - 1) * size
  photoList.value = rows.slice(start, start + size)
}

/** P6.24：自动分级弹窗的输入——只带 id/seq/缩略图，用于把模型命中的 id 映射回预览图 */
const autoRateItems = computed(() => photoRowsAll.value.map(p => ({
  id: p.id,
  seq: p.seq,
  thumb: mediaSrc(p.thumbUrl),
  // P6.46：大图用原图（预览产物不一定生成过，缩略图只有 400px）
  big: p.relPath ? mediaSrc('/api/media/file?p=' + encodeURIComponent(p.relPath)) : mediaSrc(p.previewUrl || p.thumbUrl)
})))

/** P6.24：自动分级写完库 → 就地更新内存里的分级、切到「限制」筛选让用户复核 */
function onAutoRateApplied({ byRating }) {
  // P6.31：后端只回「收紧」的判定，按 分级 → id 列表 回写
  const map = new Map()
  for (const [rating, list] of Object.entries(byRating || {})) {
    for (const id of list || []) map.set(String(id), rating)
  }
  for (const p of photoRowsAll.value) {
    const rating = map.get(String(p.id))
    if (rating) p.contentRating = rating
  }
  photoRatingFilter.value = 'restricted'
  photoQuery.pageNum = 1
  applyPhotoPage()
  proxy.$modal.msgSuccess('自动分级完成：已收紧 ' + map.size + ' 张')
}

/* P6.22：图片弹窗的分级筛选条。
   为什么用筛选条而不是 tab：
   - tab 会再叠一层导航，还会把「已选 N 张 + 批量设分级」和网格割裂开；
   - 筛选条可以带计数，「这册还剩多少张是继承」一眼就有数；
   - 数据本来就已经全册加载了，筛选只是前端切片，点一下零请求。 */
const PHOTO_RATING_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'inherit', label: '继承' },
  { value: 'general', label: '大众' },
  { value: 'guidance', label: '家长指导' },
  { value: 'restricted', label: '限制' }
]
const photoRatingFilter = ref('all')
const photoRatingCounts = computed(() => {
  const counts = { all: 0, inherit: 0, general: 0, guidance: 0, restricted: 0 }
  for (const p of photoRowsAll.value) {
    counts.all += 1
    const key = (p && p.contentRating) || 'inherit'
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
})
const photoFilteredRows = computed(() => {
  if (photoRatingFilter.value === 'all') return photoRowsAll.value
  return photoRowsAll.value.filter(p => ((p && p.contentRating) || 'inherit') === photoRatingFilter.value)
})
const photoFilteredTotal = computed(() => (photoSource.value === 'disk' ? photoTotal.value : photoFilteredRows.value.length))

function setPhotoRatingFilter(value) {
  if (photoRatingFilter.value === value) return
  photoRatingFilter.value = value
  photoQuery.pageNum = 1
  applyPhotoPage()
}

/** 筛选条的 tooltip：继承那档要说清「继承的是哪一档」 */
function photoFilterTitle(opt) {
  const n = photoRatingCounts.value[opt.value] || 0
  const name = opt.value === 'inherit' ? '继承相册（' + albumPhotoRatingLabel.value + '）' : opt.label
  return name + '：' + n + ' 张'
}

/** 分页回调：库里是前端切片，磁盘态才需要重新请求 */
function handlePhotoPage() {
  if (photoSource.value === 'disk') { loadPhotos() } else { applyPhotoPage() }
}

/** 缩略图地址兜底：后端没给 thumbUrl 时按 albumId + 4 位 seq 拼（与后端 thumbUrl 规则一致） */
function photoThumbUrl(albumId, seq) {
  if (albumId === undefined || albumId === null || seq === undefined || seq === null) return ''
  return '/api/media/thumb/p/' + albumId + '/' + String(seq).padStart(4, '0')
}

/** 归一化库返回的行：thumbUrl 优先用后端给的，缺省才本地拼 */
function normalizePhotoRow(row) {
  const seq = row && row.seq
  return {
    id: (row && row.id) || (photoQuery.albumId + '-' + seq),
    seq: seq,
    relPath: (row && row.relPath) || '',
    bytes: (row && row.bytes) || 0,
    isBig: !!(row && row.isBig),
    thumbUrl: (row && row.thumbUrl) || photoThumbUrl(photoQuery.albumId, seq),
    // P6.22：这三个字段后端 albumPhotos 都返回了，之前这里没带 —— 后果是弹窗里每张图都读到
    // contentRating === undefined → 角标永远显示「继承相册」，单独设过的分级关掉再打开就"变回继承"。
    contentRating: (row && row.contentRating) || null,
    missing: !!(row && row.missing),
    hidden: !!(row && row.hidden)
  }
}

function photoKey(photo) {
  return photo.id
}

/** P6.23：图片自身分级（null = 继承相册）→ 角标短标签 / 全称
 *  只显示「继」是没有信息量的：图片的实际可见档 = max(相册档, 图自身档)，
 *  所以继承态直接把相册那一档带出来（继大 / 继指 / 继限），一眼能看出这张实际是什么档。 */
const PHOTO_RATING_SHORT = { general: '大', guidance: '指', restricted: '限' }
const albumPhotoRating = computed(() => ratingOf(currentAlbum.value))
const albumPhotoRatingLabel = computed(() => {
  const hit = RATING_OPTIONS.find((o) => o.value === albumPhotoRating.value)
  return hit ? hit.label : '大众级'
})

function photoRatingShort(photo) {
  const v = photo && photo.contentRating
  if (v) return PHOTO_RATING_SHORT[v] || '大'
  return '继' + (PHOTO_RATING_SHORT[albumPhotoRating.value] || '大')
}

const RATING_RANK = { general: 0, guidance: 1, restricted: 2 }
/** P6.25：这张图自己设的档比册级更宽（图级优先后，访客能单独看到它） */
function photoIsWider(photo) {
  const own = photo && photo.contentRating
  if (!own) return false
  return (RATING_RANK[own] || 0) < (RATING_RANK[albumPhotoRating.value] || 0)
}

function photoRatingLabel(photo) {
  const v = photo && photo.contentRating
  const hit = RATING_OPTIONS.find((o) => o.value === v)
  if (hit) return hit.label
  return '继承相册（' + albumPhotoRatingLabel.value + '）'
}

/** P6.09：图片弹窗里勾选多张 → 批量设分级（ids 是 media_photo.id） */
const photoSelected = ref([])

/**
 * 勾选一张（P6.17）
 *
 * <p>普通点击 = 切换这一张，并把它记成「锚点」；
 * 按住 Shift 点击 = 从锚点到这张之间的**本页所有图片**一起选中/取消（和资源管理器一致）。
 * 锚点跨页失效（翻页时清空），避免「从第 3 页选到第 1 页」这种看不见的范围。</p>
 */
let pickAnchor = null

/* ---------------------------------------------------------------- 触屏：长按进入多选 → 滑动连选 */
/** 多选态（长按触发）：此时点卡片=勾选/取消，而不是打开大图 */
const multiMode = ref(false)
let longPressTimer = null
let dragAnchorId = null
let dragSelecting = false
let suppressClick = false

function onCardPointerDown(photo, event) {
  // 排序模式下：不启用连选/长按手势，把指针让给原生拖拽
  if (photoSortMode.value) return
  if (!photo || photo.id == null) return
  suppressClick = false
  // 鼠标沿用 Shift + 勾选框，不做长按（长按鼠标很反直觉）
  if (event && event.pointerType === 'mouse') return
  dragAnchorId = String(photo.id)
  clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    multiMode.value = true
    dragSelecting = true
    suppressClick = true
    const set = new Set(photoSelected.value)
    set.add(dragAnchorId)
    photoSelected.value = Array.from(set)
    if (navigator.vibrate) {
      try { navigator.vibrate(12) } catch { /* 忽略 */ }
    }
  }, 420)
}

/** 手指滑动：把「锚点 → 当前手指下的卡片」整段设为选中（覆盖式，符合大多数相册 App 的手感） */
function onGridPointerMove(event) {
  if (!dragSelecting) return
  const el = document.elementFromPoint(event.clientX, event.clientY)
  const card = el && el.closest ? el.closest('.photo-item') : null
  if (!card) return
  const id = card.getAttribute('data-id')
  if (!id) return
  const rows = photoList.value || []
  const a = rows.findIndex((p) => p && String(p.id) === dragAnchorId)
  const b = rows.findIndex((p) => p && String(p.id) === id)
  if (a < 0 || b < 0) return
  const from = Math.min(a, b)
  const to = Math.max(a, b)
  photoSelected.value = rows.slice(from, to + 1).map((p) => String(p.id))
  if (event.cancelable) event.preventDefault()
  suppressClick = true
}

function onGridPointerUp() {
  clearTimeout(longPressTimer)
  if (dragSelecting) {
    dragSelecting = false
    suppressClick = true
    // 滑动结束后吞掉紧随其后的 click，避免顺手打开大图
    setTimeout(() => { suppressClick = false }, 60)
  }
}

/** 点卡片：多选态下 = 切换勾选；否则 = 打开预览 */
function onPhotoClick(photo) {
  if (suppressClick) return
  if (multiMode.value) {
    const id = String(photo.id)
    const set = new Set(photoSelected.value)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    photoSelected.value = Array.from(set)
    pickAnchor = id
    return
  }
  // P6.30：预览不算「选中」，不更新锚点 —— 否则「选了 1 → 预览 3 → 点 7 的选到此」
  // 会从 3 开始连选，得到 1,3,4,5,6,7（缺 2）这种断档结果。
  openPhotoPreview(photo)
}

/** 「选到此」：从锚点（上次点过的那张）连选到这张；没有锚点就先把它设为锚点并选中 */
function selectToHere(photo) {
  if (!photo || photo.id == null) return
  const rows = photoList.value || []
  const id = String(photo.id)
  const toIdx = rows.findIndex((p) => p && String(p.id) === id)
  const fromIdx = pickAnchor == null ? -1 : rows.findIndex((p) => p && String(p.id) === pickAnchor)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) {
    const set = new Set(photoSelected.value)
    set.add(id)
    photoSelected.value = Array.from(set)
    pickAnchor = id
    return
  }
  const from = Math.min(fromIdx, toIdx)
  const to = Math.max(fromIdx, toIdx)
  const set = new Set(photoSelected.value)
  rows.slice(from, to + 1).forEach((p) => set.add(String(p.id)))
  photoSelected.value = Array.from(set)
}

function exitMultiMode() {
  multiMode.value = false
  photoSelected.value = []
  pickAnchor = null
}

function onPickClick(photo, event) {
  if (!photo || photo.id == null) return
  const rows = photoList.value || []
  const id = String(photo.id)
  const idx = rows.findIndex((p) => p && String(p.id) === id)
  const anchorIdx = pickAnchor == null ? -1 : rows.findIndex((p) => p && String(p.id) === pickAnchor)
  if (event && event.shiftKey && anchorIdx >= 0 && idx >= 0) {
    const from = Math.min(anchorIdx, idx)
    const to = Math.max(anchorIdx, idx)
    const rangeIds = rows.slice(from, to + 1).map((p) => String(p.id))
    const set = new Set(photoSelected.value)
    const allOn = rangeIds.every((x) => set.has(x))
    rangeIds.forEach((x) => (allOn ? set.delete(x) : set.add(x)))
    photoSelected.value = Array.from(set)
    return   // 锚点保持不动，方便接着往另一个方向扩选
  }
  const set = new Set(photoSelected.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  photoSelected.value = Array.from(set)
  pickAnchor = id
}

function applyPhotoRating(rating) {
  if (!photoSelected.value.length) return
  const ids = photoSelected.value.slice()
  setRatingBatch({ type: 'photo', ids, rating: rating || 'inherit' }).then(() => {
    for (const p of photoList.value) {
      if (ids.includes(String(p.id))) p.contentRating = rating
    }
    // P6.22：当前正在按分级筛选时，改完的图会进出筛选结果，重新切一次页
    applyPhotoPage()
    proxy.$modal.msgSuccess('已把 ' + ids.length + ' 张设为' + (rating ? photoRatingLabel({ contentRating: rating }) : '继承相册'))
    photoSelected.value = []
  }).catch((err) => {
    proxy.$modal.notifyError({ title: '批量设置图片分级失败', message: (err && err.message) || '请求失败', duration: 6000 })
  })
}

/* ---------------------------------------------------------------- P6.10 批量人物 / 工作室 */
const videoBatchPersonVisible = ref(false)
const videoBatchPersonIds = ref([])
const videoBatchStudioVisible = ref(false)
const videoBatchStudioIds = ref([])
const studioOptions = ref([])
let studioLoaded = false
const albumBatchPersonVisible = ref(false)
const albumBatchPersonId = ref(null)
const batchSaving = ref(false)

function openVideoBatchPerson() {
  videoBatchPersonIds.value = []
  videoBatchPersonVisible.value = true
}

function openVideoBatchStudio() {
  if (!studioLoaded) {
    studioLoaded = true
    listStudios({ pageNum: 1, pageSize: 200 }).then((res) => {
      studioOptions.value = (res && (res.rows || res)) || []
    }).catch(() => { studioLoaded = false })
  }
  videoBatchStudioIds.value = []
  videoBatchStudioVisible.value = true
}

function openAlbumBatchPerson() {
  albumBatchPersonId.value = null
  albumBatchPersonVisible.value = true
}

function submitVideoBatchPerson() {
  const ids = selectedVideos.value.map((v) => String(v.id))
  if (!ids.length) return
  batchSaving.value = true
  batchPerson({ type: 'video', ids, personIds: videoBatchPersonIds.value }).then(() => {
    proxy.$modal.msgSuccess('已更新 ' + ids.length + ' 个视频的人物归属')
    videoBatchPersonVisible.value = false
    loadVideos()
  }).catch((err) => {
    proxy.$modal.notifyError({ title: '批量设置人物失败', message: (err && err.message) || '请求失败', duration: 6000 })
  }).finally(() => { batchSaving.value = false })
}

function submitVideoBatchStudio() {
  const ids = selectedVideos.value.map((v) => String(v.id))
  if (!ids.length) return
  batchSaving.value = true
  batchStudio({ ids, studioIds: videoBatchStudioIds.value }).then(() => {
    proxy.$modal.msgSuccess('已更新 ' + ids.length + ' 个视频的工作室')
    videoBatchStudioVisible.value = false
    loadVideos()
  }).catch((err) => {
    proxy.$modal.notifyError({ title: '批量设置工作室失败', message: (err && err.message) || '请求失败', duration: 6000 })
  }).finally(() => { batchSaving.value = false })
}

function submitAlbumBatchPerson() {
  const ids = selectedAlbums.value.map((a) => String(a.id))
  if (!ids.length) return
  batchSaving.value = true
  const personIds = albumBatchPersonId.value == null ? [] : [albumBatchPersonId.value]
  batchPerson({ type: 'album', ids, personIds }).then(() => {
    proxy.$modal.msgSuccess('已更新 ' + ids.length + ' 本相册的人物')
    albumBatchPersonVisible.value = false
    loadAlbums()
  }).catch((err) => {
    proxy.$modal.notifyError({ title: '批量设置相册人物失败', message: (err && err.message) || '请求失败', duration: 6000 })
  }).finally(() => { batchSaving.value = false })
}

/** 本页是否已经全选（全选按钮的文案与行为都看它） */
const allPicked = computed(() => {
  const rows = photoList.value || []
  if (!rows.length) return false
  return rows.every((p) => p && p.id != null && photoSelected.value.includes(String(p.id)))
})

/** 全选/取消全选：只作用于当前页（1166 张一次性选中会让批量操作失去意义，也超出后端 2000 上限的余量） */
function toggleSelectAll() {
  const rows = photoList.value || []
  if (!rows.length) return
  const ids = rows.map((p) => String(p.id))
  if (allPicked.value) {
    photoSelected.value = photoSelected.value.filter((id) => !ids.includes(id))
  } else {
    const set = new Set(photoSelected.value)
    ids.forEach((id) => set.add(id))
    photoSelected.value = Array.from(set)
  }
}

/** 角标下拉选了某一档：只改这一张（inherit = 回到跟随相册） */
function setPhotoRating(photo, value) {
  if (!photo || photo.id == null) return
  const next = value && value !== 'inherit' ? value : null
  setRatingBatch({ type: 'photo', ids: [String(photo.id)], rating: next || 'inherit' }).then(() => {
    photo.contentRating = next
    // P6.22：筛选态下这张可能不再属于当前档位，重新切页让网格与计数同步
    applyPhotoPage()
    proxy.$modal.msgSuccess('第 ' + (Number(photo.seq) + 1) + ' 张 → ' + (next ? photoRatingLabel(photo) : '继承相册'))
  }).catch((err) => {
    proxy.$modal.notifyError({ title: '设置图片分级失败', message: (err && err.message) || '请求失败', duration: 6000 })
  })
}

/** 文件名 = relPath 的最后一段（库里的 relPath 可能用 / 也可能用 \） */
function photoFileName(relPath) {
  const parts = String(relPath || '').split(/[\\/]/)
  return parts[parts.length - 1] || ''
}

/**
 * 点相册里的一张图 → 用站内预览弹窗（P6.13）
 *
 * <p>以前这里是 window.open 新开标签页，用户明确要求复用已有的预览框组件。
 * 取图口径不变：is_big 才有 pv 大图，其余走原图接口，库数据没 relPath 时退缩略图；
 * 大图 404 时 onPreviewError 会自动降级到缩略图。</p>
 */
function openPhotoPreview(photo) {
  if (!photo) return
  const url = photo.isBig
    ? '/api/media/preview/p/' + photoQuery.albumId + '/' + photo.seq
    : (photo.relPath ? '/api/media/file?p=' + encodeURIComponent(photo.relPath) : photo.thumbUrl)
  previewTitle.value = '第 ' + (Number(photo.seq) + 1) + ' 张 · ' + photoFileName(photo.relPath)
  previewFallback.value = photo.thumbUrl ? mediaSrc(photo.thumbUrl) : ''
  previewSrc.value = mediaSrc(url)
  previewMeta.value = [photo.relPath, photo.bytes ? formatSize(photo.bytes) : '',
    photo.w && photo.h ? photo.w + '×' + photo.h : ''].filter(Boolean).join(' · ')
  previewNatural.value = ''
  previewVisible.value = true
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

// ------------------------------------------------------------------ 内容分级（P5.99）

/** 正在保存的行（键 = "v:<id>" / "a:<id>"）：保存期间禁用该行下拉，避免连点发出互相覆盖的请求 */
const ratingBusy = reactive({})
/** 行级错误文案（保存失败时贴在下拉下方；成功即清除） */
const ratingError = reactive({})

/**
 * 行内改分级：不做乐观更新 —— 只有后端确认了才改 row.contentRating。
 * 理由：分级直接决定未登录可见性，界面显示「已改」而库没改是最危险的一种假象。
 */
function changeRating(row, kind, value) {
  if (!row || row.id == null || !value) return
  const key = (kind === 'video' ? 'v:' : 'a:') + row.id
  if (ratingBusy[key]) return
  const prev = ratingOf(row)
  if (prev === value) return
  ratingBusy[key] = true
  delete ratingError[row.id]
  const call = kind === 'video' ? setVideoRating(row.id, value) : setAlbumRating(row.id, value)
  call.then(res => {
    const body = res && res.data && typeof res.data === 'object' ? res.data : res
    row.contentRating = (body && body.rating) || value
    proxy.$modal.msgSuccess('已设为' + ratingLabelOf(value))
  }).catch(err => {
    row.contentRating = prev
    const detail = errorText(err)
    ratingError[row.id] = detail || '保存失败'
    proxy.$modal.msgError('分级保存失败：' + (detail || '未知错误'))
  }).finally(() => {
    ratingBusy[key] = false
  })
}

/* P6.38：审核状态 —— 单元格 + 全页共用一个下拉（与分级同一套做法） */
const reviewMenuRef = ref(null)
const reviewMenuAnchor = ref(null)
const reviewMenuTarget = ref(null)

function reviewLabelOf(state) {
  return state === 'approved' ? '已通过' : state === 'rejected' ? '已驳回' : '待审核'
}

function openReviewMenu(event, row) {
  if (!row || row.id == null) return
  reviewMenuTarget.value = { row: row }
  reviewMenuAnchor.value = event && event.currentTarget ? event.currentTarget : null
  nextTick(() => {
    const menu = reviewMenuRef.value
    if (menu && typeof menu.handleOpen === 'function') menu.handleOpen()
  })
}

async function onReviewMenuCommand(state) {
  const target = reviewMenuTarget.value
  reviewMenuTarget.value = null
  if (!target || !state) return
  const row = target.row
  const kind = activeTab.value === 'video' ? 'video' : 'album'
  try {
    await setReviewState({ type: kind, ids: [row.id], state: state })
    row.reviewState = state
    proxy.$modal.msgSuccess('审核状态已改为「' + reviewLabelOf(state) + '」')
  } catch (e) {
    proxy.$modal.msgError('修改失败：' + ((e && e.message) || '请求失败'))
  }
}
function ratingLabelOf(value) {
  const hit = RATING_OPTIONS.find(o => o.value === value)
  return hit ? hit.label : value
}

/* P6.21：分级单元格的共用下拉。
   全页面只有 1 个 el-dropdown 实例，点哪一格就把虚拟触发点挪到哪一格再 handleOpen()——
   替代原来「每行一个 el-select」（200 行 = 200 个下拉实例 + 200 个弹层）。 */
const ratingMenuRef = ref(null)
const ratingMenuAnchor = ref(null)
const ratingMenuTarget = ref(null)

function openRatingMenu(event, row, kind) {
  if (!row || row.id == null) return
  const busyKey = (kind === 'video' ? 'v:' : 'a:') + row.id
  if (ratingBusy[busyKey]) return
  ratingMenuTarget.value = { row: row, kind: kind }
  ratingMenuAnchor.value = event && event.currentTarget ? event.currentTarget : null
  nextTick(() => {
    const menu = ratingMenuRef.value
    if (menu && typeof menu.handleOpen === 'function') menu.handleOpen()
  })
}

function onRatingMenuCommand(value) {
  const target = ratingMenuTarget.value
  ratingMenuTarget.value = null
  if (!target) return
  changeRating(target.row, target.kind, value)
}

// ---- 批量设置分级：视频用顶部工具栏，相册用相册页签里的勾选条 ----

const albumTableRef = ref(null)
const pickedAlbumMap = ref({})
const selectedAlbums = computed(() => Object.keys(pickedAlbumMap.value).map(id => pickedAlbumMap.value[id]).filter(Boolean))
const selectedAlbumTotal = computed(() => selectedAlbums.value.length)

function handleAlbumSelection(rows) {
  const map = {}
  ;(Array.isArray(rows) ? rows : []).forEach(row => { if (row && row.id != null) map[String(row.id)] = row })
  pickedAlbumMap.value = map
}

function clearAlbumSelection() {
  pickedAlbumMap.value = {}
  const table = albumTableRef.value
  if (table && typeof table.clearSelection === 'function') table.clearSelection()
}

const ratingBatchVisible = ref(false)
const ratingBatchType = ref('video')
const ratingBatchValue = ref('general')
const ratingBatchSaving = ref(false)
const ratingBatchTitle = computed(() => (ratingBatchType.value === 'album' ? '批量设置相册分级' : '批量设置视频分级'))
const ratingBatchKindText = computed(() => (ratingBatchType.value === 'album' ? '相册' : '视频'))
const ratingBatchCount = computed(() => (ratingBatchType.value === 'album' ? selectedAlbumTotal.value : selectedVideoTotal.value))

function openBatchRating(type) {
  ratingBatchType.value = type === 'album' ? 'album' : 'video'
  ratingBatchValue.value = 'general'
  ratingBatchVisible.value = true
}

function submitBatchRating() {
  const ids = (ratingBatchType.value === 'album' ? selectedAlbums.value : selectedVideos.value)
    .map(row => (row && row.id != null ? String(row.id) : ''))
    .filter(Boolean)
  if (!ids.length) {
    proxy.$modal.msgWarning('先勾选要设置的' + ratingBatchKindText.value)
    return
  }
  const value = ratingBatchValue.value
  ratingBatchSaving.value = true
  setRatingBatch({ type: ratingBatchType.value, ids: ids, rating: value }).then(res => {
    const body = res && res.data && typeof res.data === 'object' ? res.data : res
    const updated = body && body.updated != null ? body.updated : ids.length
    // 本地同步：列表里这几行的分级直接改掉（后端已落库，不需要整页重拉）
    const rows = ratingBatchType.value === 'album' ? selectedAlbums.value : selectedVideos.value
    rows.forEach(row => { row.contentRating = value })
    proxy.$modal.msgSuccess('已把 ' + updated + ' 个' + ratingBatchKindText.value + '设为' + ratingLabelOf(value))
    ratingBatchVisible.value = false
    if (ratingBatchType.value === 'album') clearAlbumSelection()
    else clearVideoSelection()
  }).catch(err => {
    proxy.$modal.msgError('批量设置失败：' + (errorText(err) || '未知错误'))
  }).finally(() => {
    ratingBatchSaving.value = false
  })
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
  tabLoaded.trash = true
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
  // trashRel 一起带上：同 id 多份时能精确指定，行已被删除时后端按条目旁注恢复
  restoreTrash(row.kind, row.id, row.trashRel).then((res) => {
    proxy.$modal.msgSuccess((res && res.orphan)
      ? '已搬回原路径（记录已不存在，下次扫描会重新入库）'
      : '已恢复到原路径')
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
  gc: '清理派生文件(GC)',
  // 维护面板新增的 mode（后端 P1-A）
  enrich: '补元数据(ffprobe)',
  'backfill-hash': '补内容哈希',
  'fix-poster': '修复封面路径',
  export: '导出便携包'
}

function scanTypeText(type) {
  return SCAN_TITLE[type] || type || 'full'
}

/** GC：二次确认按钮明确写「确认删除」，请求带 confirm=true（后端没有它直接 400） */
function handleGc() {
  proxy.$modal.confirm(GC_CONFIRM, '清理派生文件(GC)', { confirmButtonText: '确认删除', type: 'error' }).then(() => {
    runScanTask('gc', { confirm: true })
  }).catch(() => {})
}

/**
 * 自动分级写库之后（P6.02）：分级是列表里的列、也是索引 ratings[] 的数据源，
 * 所以三处一起重读 —— 当前分页的列表、统计里的分级计数、以及别的筛选维度（分级筛选条）。
 * 不整页刷新：用户可能已经设好筛选条件，刷新会把它清掉。
 */
function handleRatingApplied(report) {
  const updated = report && report.applied ? report.applied.updated : 0
  if (updated > 0) {
    loadVideos()
    loadAlbums()
    loadStats()
  }
}

function runScanTask(mode, options) {
  const title = scanTypeText(mode)
  // P5.10-B：记下本次请求的 videoIds —— 后端日志只给 RESULT 汇总时，用它把结果清单退化成「已处理列表」
  const requestIds = options && Array.isArray(options.videoIds) ? options.videoIds : []
  scanRequestIds = requestIds.map(id => String(id))
  // P6.04：先清空上一次的结果，面板才能把「新的结束事件」准确归到本次按钮上
  maintLastJob.value = null
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
      // P6.04：把结束的任务原样交给维护面板写「上次执行」（面板只在自己发起时消费）
      maintLastJob.value = res ? { ...res } : null
      notifyScanFinished(res)
      maybeOpenDeriveResult(res)
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

// ------------------------------------------------------------------ 维护面板

/** 新增 mode 的二次确认文案；原来 4 个 mode（scan / thumb / sprite,preview / gc）继续用上面的 SCAN_CONFIRM */
const MAINT_CONFIRM = {
  enrich: '补元数据会用 ffprobe 逐个读视频，补齐时长 / 分辨率 / 编码等字段：只补空值，不覆盖已有值，不改媒体源。'
    + '想先试跑就把「试跑条数」设成 3 之类的小数字。确认执行？',
  'backfill-hash': '补内容哈希会按文件内容计算哈希写回索引：幂等（已算过的不重算，只补空值），但视频多时耗时较久。确认执行？',
  export: '导出便携包会在服务器上生成一个可搬迁的导出目录（含清单与索引快照），耗时取决于库大小。'
    + '完成后在「最近导出」里按文件下载。确认执行？'
}

/** limit 只对这些逐条处理的 mode 生效（scan / gc 传了后端会 400：这些 mode 没有「只跑前 n 条」的语义） */
const MAINT_LIMIT_MODES = ['thumb', 'photo-preview', 'sprite', 'preview', 'sprite,preview', 'enrich']

/**
 * P6.04：「当前筛选结果」范围 → 真实 videoId 列表。
 * 复用主列表当前的筛选条件逐页取 id（pageSize=200），最多 200 条 —— 与后端 videoIds 上限一致。
 * 不拿「当前页」冒充「筛选结果」：筛选跨页时也只会处理筛选命中的行。
 */
function collectFilteredVideoIds() {
  const pageSize = 200
  const ids = []
  let pageNum = 1
  let total = 0
  const step = () => listVideos(buildParams({ ...videoQuery, pageNum: pageNum, pageSize: pageSize })).then(res => {
    const rows = (res && res.rows) || []
    total = Number(res && res.total) || rows.length
    rows.forEach(row => {
      if (row && row.id != null && ids.length < 200) {
        ids.push(String(row.id))
      }
    })
    if (rows.length && ids.length < Math.min(total, 200)) {
      pageNum += 1
      return step()
    }
    return ids
  })
  return step()
}

/**
 * 维护任务的唯一执行入口（P5.97 起工具栏不再有重复的扫描按钮）：确认文案由面板给出（它知道勾选项与
 * 前置条件），执行复用 runScanTask —— 任务锁、409 冲突处理、轮询与完成提示只此一套。
 * P6.04：范围在确认前解析成 videoIds（只有 thumb / sprite / preview 会带）。
 */
async function handleMaintRun(payload) {
  const item = payload || {}
  if (!item.mode) {
    return
  }
  if (scanRunning.value) {
    proxy.$modal.msgWarning('已有任务在运行，请等待结束后再触发')
    return
  }
  const title = item.title || scanTypeText(item.mode)
  const options = { ...(item.options || {}) }
  delete options.confirm
  const scope = item.scope || 'all'
  if (scope !== 'all') {
    let ids = []
    try {
      ids = scope === 'selected' ? selectedVideoIds.value.map(id => String(id)) : await collectFilteredVideoIds()
    } catch (err) {
      proxy.$modal.notifyError({
        title: '解析处理范围失败',
        message: errorText(err) || '请求视频列表失败，请稍后重试或改用「全部」',
        duration: 8000
      })
      return
    }
    if (!ids.length) {
      proxy.$modal.msgWarning(scope === 'selected' ? '当前没有勾选任何视频' : '当前筛选结果为空')
      return
    }
    options.videoIds = ids
  }
  const limit = Number(scanLimit.value) || 0
  if (limit > 0 && MAINT_LIMIT_MODES.indexOf(item.mode) > -1) {
    options.limit = limit
  }
  const confirmText = item.confirm || MAINT_CONFIRM[item.mode] || SCAN_CONFIRM[item.mode] || ('确认执行「' + title + '」？')
  const confirmOptions = item.mode === 'fix-poster' ? { confirmButtonText: '确认修复', type: 'warning' } : {}
  proxy.$modal.confirm(confirmText, title, confirmOptions).then(() => {
    runScanTask(item.mode, options)
  }).catch(() => {})
}

// 任务结束后（scanRunning 由 true 变 false）让面板重读导出 / 回收站 / 派生用量 / 后端历史
watch(scanRunning, (val, old) => {
  if (old && !val) {
    maintRefreshKey.value += 1
  }
})

// ------------------------------------------------------------------ 归属规则（P6.90）
const ruleVisible = ref(false)
const ruleLoading = ref(false)
const ruleRows = ref([])
const ruleKeyword = ref('')
const ruleFormVisible = ref(false)
const ruleSaving = ref(false)
const ruleAlbumOptions = ref([])
const ruleDirOptions = ref([])
const ruleForm = reactive({ albumId: '', dirPattern: '', filePrefix: '', priority: 100 })

function openAlbumRules() {
  ruleVisible.value = true
  loadRules()
}

async function loadRules() {
  ruleLoading.value = true
  try {
    const res = await listAlbumRules({ keyword: ruleKeyword.value })
    ruleRows.value = Array.isArray(res) ? res : ((res && res.rows) || [])
  } catch (e) {
    ruleRows.value = []
    proxy.$modal.msgError('读取规则失败：' + errorText(e))
  } finally {
    ruleLoading.value = false
  }
}

async function toggleRule(row) {
  try {
    await updateAlbumRule(row.id, { enabled: !row.enabled })
    proxy.$modal.msgSuccess(row.enabled ? '已停用' : '已启用')
    loadRules()
  } catch (e) {
    proxy.$modal.msgError('操作失败：' + errorText(e))
  }
}

async function removeRule(row) {
  try {
    await proxy.$modal.confirm('删除这条规则？\n只影响以后扫描的自动归属，已经归好的照片不动。')
  } catch (e) {
    return
  }
  try {
    await deleteAlbumRule(row.id)
    proxy.$modal.msgSuccess('已删除')
    loadRules()
  } catch (e) {
    proxy.$modal.msgError('删除失败：' + errorText(e))
  }
}

async function openRuleCreate() {
  ruleForm.albumId = ''
  ruleForm.dirPattern = ''
  ruleForm.filePrefix = ''
  ruleForm.priority = 100
  ruleFormVisible.value = true
  // 册下拉：取相册列表（大页一次拿全，这里只用于选目标册）
  try {
    const res = await listAlbums({ pageNum: 1, pageSize: 200 })
    ruleAlbumOptions.value = ((res && res.rows) || []).map(a => ({
      id: a.id, title: a.title, photoCount: a.photoCount
    }))
  } catch (e) {
    ruleAlbumOptions.value = []
  }
  try {
    const dirs = await listAlbumRuleDirs()
    ruleDirOptions.value = Array.isArray(dirs) ? dirs : ((dirs && dirs.rows) || [])
  } catch (e) {
    ruleDirOptions.value = []
  }
}

async function saveRule() {
  if (!ruleForm.albumId) {
    proxy.$modal.msgWarning('先选一本目标册')
    return
  }
  ruleSaving.value = true
  try {
    await createAlbumRule({
      albumId: ruleForm.albumId,
      dirPattern: ruleForm.dirPattern,
      filePrefix: ruleForm.filePrefix,
      priority: Number(ruleForm.priority) || 100
    })
    proxy.$modal.msgSuccess('规则已保存')
    ruleFormVisible.value = false
    loadRules()
  } catch (e) {
    proxy.$modal.msgError('保存失败：' + errorText(e))
  } finally {
    ruleSaving.value = false
  }
}

// ------------------------------------------------------------------ 相册改名 / 删除（P6.86）

async function renameAlbumRow(row) {
  if (!row || !row.id) return
  let next
  try {
    const r = await proxy.$prompt('新的册名（人工设定后，重扫不会再用目录名覆盖它）', '重命名相册', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: row.title || '',
      inputValidator: v => (v && v.trim() ? true : '册名不能为空')
    })
    next = (r && r.value ? r.value : '').trim()
  } catch (e) {
    return
  }
  if (!next) return
  try {
    await renameAlbum(row.id, next)
    proxy.$modal.msgSuccess('已改名为「' + next + '」')
    loadAlbums()
  } catch (e) {
    proxy.$modal.msgError('改名失败：' + errorText(e))
  }
}

async function deleteAlbumRow(row) {
  if (!row || !row.id) return
  const count = Number(row.photoCount) || 0
  const dirWarn = row.dirKey
    ? '\n\n注意：这本册来自磁盘目录「' + row.dirKey + '」，下一次扫描还会按目录把它重新建出来；'
      + '要彻底不出现，得把那个目录改名/移走，或改用「并入另一册」。'
    : ''
  try {
    await proxy.$modal.confirm(
      '删除册「' + (row.title || row.id) + '」？\n'
      + '册里的 ' + count + ' 张照片不会删，会变成「未归类」（可随时再移进别的册）。' + dirWarn
    )
  } catch (e) {
    return
  }
  try {
    const res = await deleteAlbum(row.id)
    proxy.$modal.msgSuccess('已删除，移出照片 ' + ((res && res.detached) || 0) + ' 张到「未归类」')
    loadAlbums()
    loadStats()
  } catch (e) {
    proxy.$modal.msgError('删除失败：' + errorText(e))
  }
}

// ------------------------------------------------------------------ 单条视频标签编辑（P6.83）
/* 注意：与既有"编辑标签字典项"（tagEditVisible / openTagEdit）是两件事——
   那是改标签本身的名字/颜色，这里是给这条视频挂哪些标签。命名刻意分开，避免再撞。 */
const videoTagEditVisible = ref(false)
const videoTagEditSaving = ref(false)
const videoTagEditRow = ref(null)
const videoTagEditValue = ref([])
const videoTagEditTitle = computed(() => (videoTagEditRow.value
  ? (videoTagEditRow.value.title || videoTagEditRow.value.relPath || '')
  : ''))

function openVideoTagEdit(row) {
  videoTagEditRow.value = row
  videoTagEditValue.value = (row.tags || []).map(t => String(t.id))
  videoTagEditVisible.value = true
  if (!tagOptions.value.length) loadTagOptions()
}

async function saveVideoTagEdit() {
  const row = videoTagEditRow.value
  if (!row || !row.id) return
  tagEditSaving.value = true
  try {
    // allow-create：值里可能混着"新名字"，先逐个新建成标签，再统一提交 tagIds（全量替换）
    const ids = []
    for (const raw of videoTagEditValue.value || []) {
      const v = String(raw)
      if (/^\d+$/.test(v)) {
        ids.push(v)
        continue
      }
      const res = await createTag({ name: v })
      const id = res && (res.id || (res.data && res.data.id))
      if (id) ids.push(String(id))
    }
    await updateVideoMeta(row.id, { tagIds: ids })
    proxy.$modal.msgSuccess('标签已更新')
    videoTagEditVisible.value = false
    loadTagOptions()
    loadVideos()
  } catch (e) {
    proxy.$modal.msgError('保存标签失败：' + errorText(e))
  } finally {
    videoTagEditSaving.value = false
  }
}

// ------------------------------------------------------------------ 标签管理

function openTagManager() {
  tagVisible.value = true
  loadTags()
}

/** 拉全量标签字典（后端已按 useCount 降序），失败时把错误留在弹窗里而不是只弹一下 */
function loadTags() {
  tagLoading.value = true
  tagError.value = ''
  listTags().then(res => {
    tagList.value = Array.isArray(res) ? res : []
    // 列表缩短后（删除 / 过滤）把页码拉回有效范围
    const maxPage = Math.max(1, Math.ceil(filteredTags.value.length / tagQuery.pageSize))
    if (tagQuery.pageNum > maxPage) {
      tagQuery.pageNum = maxPage
    }
  }).catch(err => {
    tagList.value = []
    tagError.value = '标签加载失败：' + (errorText(err) || '请求失败，请确认后端已启动')
  }).finally(() => {
    tagLoading.value = false
  })
}

/** 搜索框变化：回第一页，避免停留在已越界的页码上 */
function handleTagFilter() {
  tagQuery.pageNum = 1
}

function submitCreateTag() {
  const name = (tagForm.name || '').trim()
  if (!name) {
    proxy.$modal.msgWarning('请填写标签名称')
    return
  }
  if (name.length > TAG_NAME_MAX) {
    proxy.$modal.msgWarning('标签名最长 ' + TAG_NAME_MAX + ' 个字符')
    return
  }
  const color = tagForm.color ? String(tagForm.color).trim() : ''
  tagCreating.value = true
  createTag({ name: name, color: color }).then(res => {
    if (res && res.created === false) {
      proxy.$modal.msgWarning('标签「' + (res.name || name) + '」已存在，已复用（颜色未改动）')
    } else {
      proxy.$modal.msgSuccess('标签「' + ((res && res.name) || name) + '」已创建')
    }
    tagForm.name = ''
    tagForm.color = null
    tagQuery.pageNum = 1
    loadTags()
  }).catch(err => {
    proxy.$modal.notifyError({ title: '新建标签失败', message: errorText(err) || '请求失败，请查看后端日志', duration: 8000 })
  }).finally(() => {
    tagCreating.value = false
  })
}

function handleDeleteTag(row) {
  const used = row.useCount || 0
  const tip = used > 0
    ? '删除标签「' + row.name + '」会同时解除 ' + used + ' 个视频的关联，且不可撤销。确认删除？'
    : '删除标签「' + row.name + '」？当前没有视频使用它。'
  proxy.$modal.confirm(tip, '删除标签', { confirmButtonText: '确认删除', type: 'error' }).then(() => {
    tagDeletingId.value = row.id
    return deleteTag(row.id).then(res => {
      const unlinked = res && typeof res.unlinked === 'number' ? res.unlinked : 0
      proxy.$modal.msgSuccess(unlinked > 0 ? '已删除标签，同时解除 ' + unlinked + ' 个视频的关联' : '已删除标签')
      loadTags()
    }).catch(err => {
      proxy.$modal.notifyError({ title: '删除标签失败', message: errorText(err) || '请求失败，请查看后端日志', duration: 8000 })
    }).finally(() => {
      tagDeletingId.value = null
    })
  }).catch(() => {
    // 用户点了取消 / 关闭：不做任何事
  })
}

/* ------------------------------------------------------- 标签改名 / 改色 + 编辑策略 */

function openTagEdit(row) {
  if (!row || row.id == null) return
  tagEditForm.id = row.id
  tagEditForm.name = row.name || ''
  tagEditForm.color = row.color || null
  // 父标签：索引里没这一列时按顶级处理（P3-A 之前 /tags 不返回 parentId）
  tagEditForm.parentId = row.parentId === undefined ? null : row.parentId
  tagEditVisible.value = true
}

function submitTagEdit() {
  const name = (tagEditForm.name || '').trim()
  if (!name) {
    proxy.$modal.msgWarning('请填写标签名称')
    return
  }
  if (name.length > TAG_NAME_MAX) {
    proxy.$modal.msgWarning('标签名最长 ' + TAG_NAME_MAX + ' 个字符')
    return
  }
  if (tagEditSaving.value) return
  const color = tagEditForm.color ? String(tagEditForm.color).trim() : ''
  const parentId = tagEditForm.parentId === undefined ? null : tagEditForm.parentId
  tagEditSaving.value = true
  updateTag(tagEditForm.id, { name: name, color: color, parentId: parentId }).then(() => {
    proxy.$modal.msgSuccess('标签已更新')
    tagEditVisible.value = false
    loadTags()
  }).catch(err => {
    proxy.$modal.notifyError({
      title: isConflict(err) ? '标签名称已存在' : '更新标签失败',
      message: isConflict(err) ? '换一个名称再试，或先删除同名标签' : (errorText(err) || '请求失败，请查看后端日志'),
      duration: 8000
    })
  }).finally(() => {
    tagEditSaving.value = false
  })
}

function policyLabel(level) {
  const hit = POLICY_OPTIONS.find(opt => opt.value === level)
  return hit ? hit.label : level
}

/** 打开弹窗时读一次当前策略：读到之前按要求显示「完全编辑」（与后端缺省一致） */
function openEditPolicy() {
  policyVisible.value = true
  policyLoading.value = true
  getEditPolicy().then(res => {
    const level = res && res.level ? res.level : ''
    policyForm.level = POLICY_OPTIONS.some(opt => opt.value === level) ? level : 'full'
  }).catch(err => {
    policyForm.level = 'full'
    proxy.$modal.notifyWarning({ title: '编辑策略读取失败', message: (errorText(err) || '接口未就绪') + '，当前按「完全编辑」显示', duration: 8000 })
  }).finally(() => {
    policyLoading.value = false
  })
}

function submitEditPolicy() {
  if (policySaving.value) return
  policySaving.value = true
  setEditPolicy(policyForm.level).then(() => {
    proxy.$modal.msgSuccess('编辑策略已保存：' + policyLabel(policyForm.level) + '（访客刷新页面后生效）')
    policyVisible.value = false
  }).catch(err => {
    proxy.$modal.notifyError({ title: '保存编辑策略失败', message: errorText(err) || '请求失败，请查看后端日志', duration: 8000 })
  }).finally(() => {
    policySaving.value = false
  })
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

/* ------------------------------------------------------------ 派生资源（P5.10-B） */
/* 契约（P5.10-A，后端并行实现中）：
     GET  /api/media/admin/derive-status?page=&size=&ids=&q=&kind= → { rows:[…], total }
     POST /api/media/admin/scan  body 增加 videoIds（只对 thumb / sprite / preview 生效）
     job 日志：ITEM video=<id> task=<video|sprite|pvclip> result=<ok|skip|fail> / RESULT ok= skip= fail= ids=…
   接口未就绪（404/405/501）时：列显示「—」+ 首次提示一次，列表与其它功能全部照常，不抛异常。 */

const DERIVE_TASK_TYPES = ['thumb', 'sprite', 'preview', 'sprite,preview']

const videoTableRef = ref(null)
/**
 * P5.12：勾选状态由页面自己存（id → 行），表格只回传「当前可见行」的勾选结果。
 * 这样切「资源类型 / 状态」把行筛掉时，已勾选不会被静默清空（要求：筛选后保留勾选）。
 */
const pickedVideoMap = ref({})
const selectedVideos = computed(() => Object.keys(pickedVideoMap.value)
  .map(id => pickedVideoMap.value[id])
  .filter(Boolean))
const selectedVideoTotal = computed(() => selectedVideos.value.length)
const selectedVideoIds = computed(() => selectedVideos.value
  .map(row => (row && row.id != null ? row.id : ''))
  .filter(id => id !== ''))
/** 恢复勾选（toggleRowSelection）期间屏蔽 selection-change，避免自己把自己清空 */
let restoringVideoSelection = false

const deriveMap = ref({})
const deriveReady = ref(true)
/** derive-status 顶层：算法分界时间（「旧算法」徽标的 tooltip 与顶部汇总都用它） */
const deriveMeta = ref({ algoSince: '', algoSinceSource: '' })
/**
 * P5.12：「资源类型 × 状态」筛选（默认 预览片段 / 全部 = 不过滤）。
 * 旧版只有一个「只看旧算法」开关，用户反馈「只想看新算法怎么办」→ 改成双向/多状态。
 */
const deriveFilter = ref({ kind: DERIVE_FILTER_DEFAULT.kind, state: DERIVE_FILTER_DEFAULT.state })
const deriveLoading = ref(false)
const deriveRefreshing = ref(false)
const deriveResultVisible = ref(false)
const deriveResultModel = ref({ rows: [], summary: { ok: 0, skip: 0, fail: 0 }, total: 0, degraded: false })

/** 本次任务请求的 videoIds：后端日志只给 RESULT 汇总时，用它把清单退化成「已处理列表」 */
let scanRequestIds = []
/** 「接口未就绪」只提示一次（翻页/刷新不再重复打扰） */
let deriveNoticeShown = false

function handleVideoSelection(rows) {
  if (restoringVideoSelection) return
  const map = {}
  Object.keys(pickedVideoMap.value).forEach(id => { map[id] = pickedVideoMap.value[id] })
  // 当前可见行的勾选状态以表格为准；被筛选掉（看不见）的行保留原有勾选
  videoDisplayList.value.forEach(row => { if (row && row.id != null) delete map[String(row.id)] })
  ;(Array.isArray(rows) ? rows : []).forEach(row => { if (row && row.id != null) map[String(row.id)] = row })
  pickedVideoMap.value = map
}

function clearVideoSelection() {
  pickedVideoMap.value = {}
  const table = videoTableRef.value
  if (table && typeof table.clearSelection === 'function') {
    table.clearSelection()
  }
}

/** 换页 / 重新拉列表后清空勾选（与改动前一致；只有「筛选」不清空勾选） */
watch(videoList, () => { pickedVideoMap.value = {} })
watch(albumList, () => { pickedAlbumMap.value = {} })

/** 当前行的派生资源状态（derive-status 没返回这一行时给 null → 徽标显示「状态未知」的灰点） */
function deriveRowOf(row) {
  if (!row || row.id == null) return null
  return deriveMap.value[String(row.id)] || null
}

/**
 * derive-status 的分页参数：
 * - 传了 ids（当前页的 videoId）时窗口固定为第 1 页、长度 = max(ids, pageSize)：
 *   ids 本身就是主列表当前页，再叠 (page-1)*size 的 offset 会把窗口挪空；
 * - 没有 ids（空页）时完全跟随主列表的 page/size。
 */
function buildDeriveParams(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(id => String(id)).filter(Boolean)
  const pageSize = Number(videoQuery.pageSize) || 10
  if (list.length) {
    return { page: 1, size: Math.min(200, Math.max(list.length, pageSize)), ids: list.join(','), kind: 'video' }
  }
  return { page: videoQuery.pageNum, size: pageSize, kind: 'video' }
}

function isDeriveMissingErr(err) {
  const status = err && err.response && err.response.status ? err.response.status : 0
  return status === 404 || status === 405 || status === 501
}

function noticeDeriveNotReady() {
  if (deriveNoticeShown) {
    return
  }
  deriveNoticeShown = true
  proxy.$modal.msgWarning('派生资源接口未就绪：该列暂时显示「—」，列表与其它功能不受影响')
}

/** 拉一次派生资源状态；rows 省略时用当前 videoList */
/** 服务端全局筛选是否生效（state 非 all 时由后端过滤，跨页有效） */
function isServerDeriveFilter() {
  const f = deriveFilter.value || {}
  return !!(f.state && f.state !== 'all')
}
let deriveFilterSeq = 0
const DERIVE_PAGE_SIZES = [10, 20, 50, 100, 200]
/** 服务端全局筛选：先取全量过滤后的 ids，再让主列表按 ids 分页 */
function applyDeriveFilter() {
  const f = deriveFilter.value || {}
  const seq = ++deriveFilterSeq
  if (!isServerDeriveFilter()) {
    if (videoQuery.ids) {
      videoQuery.ids = ''
      videoQuery.pageNum = 1
      loadVideos()
    }
    return
  }
  deriveLoading.value = true
  getDeriveStatus({ page: 1, size: 1000, kind: f.kind || 'all', state: f.state || 'all' }).then(res => {
    if (seq !== deriveFilterSeq) return
    deriveReady.value = true
    const rows = (res && res.rows) || []
    deriveMap.value = deriveMapOf(rows)
    deriveMeta.value = {
      algoSince: res && res.algoSince != null ? String(res.algoSince) : '',
      algoSinceSource: res && res.algoSinceSource != null ? String(res.algoSinceSource) : '',
      counts: (res && res.counts) || null
    }
    const ids = rows.map(r => (r && r.videoId != null ? String(r.videoId) : '')).filter(Boolean)
    videoQuery.ids = ids.join(',')
    videoQuery.pageNum = 1
    loadVideos()
  }).catch(err => {
    if (seq !== deriveFilterSeq) return
    if (isDeriveMissingErr(err)) { deriveReady.value = false; noticeDeriveNotReady() }
    return null
  }).finally(() => { deriveLoading.value = false })
}
watch(deriveFilter, () => { applyDeriveFilter() }, { deep: true })
function loadDeriveStatus(rows) {
  // 服务端全局筛选生效时，deriveMap 由 applyDeriveFilter 一次性拉全（含过滤后的 ids），
  // 这里若再按当前页覆盖会丢掉被筛掉的行的状态，故直接跳过。
  if (isServerDeriveFilter()) { return }
  const list = Array.isArray(rows) ? rows : videoList.value
  const ids = list.map(row => (row && row.id != null ? row.id : '')).filter(id => id !== '')
  deriveLoading.value = true
  const pending = getDeriveStatus(buildDeriveParams(ids)).then(res => {
    deriveReady.value = true
    deriveMap.value = deriveMapOf((res && res.rows) || [])
    deriveMeta.value = {
      algoSince: res && res.algoSince != null ? String(res.algoSince) : '',
      algoSinceSource: res && res.algoSinceSource != null ? String(res.algoSinceSource) : ''
    }
  }).catch(err => {
    deriveMap.value = {}
    // 只有「接口未就绪」才整列降级；其它错误保留列，只是这一轮没有徽标
    if (isDeriveMissingErr(err)) {
      deriveReady.value = false
      noticeDeriveNotReady()
    }
    return null
  }).finally(() => { deriveLoading.value = false })
  return pending
}

/** 结果对话框里的「刷新列表派生资源列」 */
function refreshDeriveColumn() {
  if (deriveRefreshing.value) {
    return
  }
  deriveRefreshing.value = true
  loadDeriveStatus().then(() => { deriveRefreshing.value = false }).catch(() => { deriveRefreshing.value = false })
}

/** 当前页的 derive-status 行（汇总条与过滤都用它） */
const deriveRows = computed(() => Object.keys(deriveMap.value).map(id => deriveMap.value[id]))

/**
 * 旧后端（P5.10-A 之前的契约）：接口 200，但三类产物都没有 status 字段，只有 exists / stale。
 * 此时只有「正常 / 缺失 / 过期」三态可筛，「旧算法」恒 0 —— 筛选条上直接说明，不假装能筛。
 */
const deriveLegacy = computed(() => {
  const rows = deriveRows.value
  if (!rows.length) return false
  return rows.every(row => !row.thumb.status && !row.sprite.status && !row.preview.status)
})

/** 表格实际渲染的行：筛选生效时只保留命中行（只影响前端显示，不动请求与分页总数） */
const videoDisplayList = computed(() => filterVideoRows(videoList.value, deriveMap.value, deriveFilter.value))

/**
 * 过滤会把看不见的行从 el-table 的选择里剔除；数据一变就把已勾选状态重新打回去，
 * 这样「清空筛选」后原来的勾选还在。
 */
watch(videoDisplayList, (list) => {
  const table = videoTableRef.value
  if (!table || typeof table.toggleRowSelection !== 'function') return
  restoringVideoSelection = true
  try {
    ;(list || []).forEach(row => {
      if (!row || row.id == null) return
      table.toggleRowSelection(row, !!pickedVideoMap.value[String(row.id)])
    })
  } finally {
    nextTick(() => { restoringVideoSelection = false })
  }
}, { flush: 'post' })

/** 标题表：当前列表页 + derive-status 的 title（能覆盖不在当前页的 videoId） */
function deriveTitleMap() {
  const map = {}
  Object.keys(deriveMap.value).forEach(id => {
    const row = deriveMap.value[id]
    if (row && row.title) map[id] = row.title
  })
  videoList.value.forEach(row => {
    if (row && row.id != null && row.title) map[String(row.id)] = row.title
  })
  return map
}

/** 生成类任务结束 → 解析日志 → 弹「本次生成了哪些」；同时刷新派生资源列（产物刚变） */
function maybeOpenDeriveResult(job) {
  if (!job || !job.id) return
  const type = String(job.type || '')
  if (DERIVE_TASK_TYPES.indexOf(type) === -1) return
  const model = buildResultModel({
    logTail: job.logTail,
    requestedIds: scanRequestIds,
    titles: deriveTitleMap(),
    mode: type
  })
  loadDeriveStatus()
  if (model.empty) {
    return
  }
  deriveResultModel.value = model
  deriveResultVisible.value = true
}

// ------------------------------------------------------------------ 生命周期

/** 每个 tab 是否已经取过数据：切来切去不再重复请求，也不再闪 loading */
const tabLoaded = reactive({ video: false, album: false, trash: false })

function handleTabChange(name) {
  // P6.19：切换 tab 只做「第一次进这个 tab 才拉数据」，其余情况直接显示已有结果；
  // 要刷新有「刷新」按钮 / 搜索 / 重置，不必每次切换都打一次后端。
  if (tabLoaded[name]) return
  if (name === 'trash') { loadTrash() } else if (name === 'album') { loadAlbums() } else { loadVideos() }
}

function refreshAll() {
  loadStats()
  loadPeople()
  loadVcodecOptions()
  if (activeTab.value === 'trash') { loadTrash() } else if (activeTab.value === 'album') { loadAlbums() } else { loadVideos() }
}

/* ------------------------------------------------------------ 人物（P3-B） */
/* 管理端多选弹窗用的人物下拉：独立于相册筛选的 /people（那是「一本相册一个人物」的老接口，
   返回里带 albumCount），这里取 /admin/persons 的 id/name，用于视频与相册的多选写入。
   接口未就绪时只在弹窗内给出可读提示（personPickError），不弹全局错误、不抛异常。 */

const PERSON_PICK_NOT_READY = '人物列表暂不可用：/admin/persons 接口未就绪，稍后重试或联系管理员升级后端'

const personPickOptions = ref([])
const personPickLoading = ref(false)
const personPickError = ref('')

const videoPersonVisible = ref(false)
const videoPersonSaving = ref(false)
const videoPersonTitle = ref('')
const videoPersonIds = ref([])
const videoPersonRoles = reactive({})
const videoPersonRow = ref(null)

const albumPersonVisible = ref(false)
const albumPersonSaving = ref(false)
const albumPersonTitle = ref('')
const albumPersonIds = ref([])
const albumPersonRow = ref(null)

function isNotFoundErr(err) {
  const status = err && err.response && err.response.status ? err.response.status : 0
  return status === 404 || status === 501 || status === 0
}

/** 人物下拉数据：{rows|list|items} / 裸数组 / AjaxResult 三种形态都收 */
function unwrapPersonList(res) {
  const body = res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res
  if (Array.isArray(body)) return body
  return (body && (body.rows || body.list || body.items || body.records)) || []
}

function loadPersonPickOptions(force) {
  if (personPickLoading.value) return
  if (!force && personPickOptions.value.length) return
  personPickLoading.value = true
  personPickError.value = ''
  listPersons({ page: 1, size: 200 }).then(res => {
    personPickOptions.value = unwrapPersonList(res).filter(item => item && item.id != null)
    if (!personPickOptions.value.length) {
      personPickError.value = '还没有人物：先到「人物管理」新建，再回来关联'
    }
  }).catch(err => {
    personPickOptions.value = []
    personPickError.value = isNotFoundErr(err)
      ? PERSON_PICK_NOT_READY
      : ('人物列表加载失败：' + (errorText(err) || '请求失败，请确认后端已启动'))
  }).finally(() => { personPickLoading.value = false })
}

function personNameOf(id) {
  const hit = personPickOptions.value.find(item => String(item.id) === String(id))
  return hit ? hit.name : String(id)
}

function openVideoPersons(row) {
  if (!row || row.id == null) return
  videoPersonRow.value = row
  videoPersonTitle.value = row.title || row.relPath || String(row.id)
  videoPersonIds.value = []
  Object.keys(videoPersonRoles).forEach(key => { delete videoPersonRoles[key] })
  // 行里已带 persons（P3-A 索引 / 详情）时回填人物与角色，避免每次从零重选
  ;(row.persons || []).forEach(item => {
    const pid = item && item.id !== undefined ? item.id : null
    if (pid === null) return
    videoPersonIds.value.push(pid)
    if (item.role) videoPersonRoles[pid] = item.role
  })
  videoPersonVisible.value = true
  loadPersonPickOptions(false)
}

function submitVideoPersons() {
  if (videoPersonSaving.value) return
  const row = videoPersonRow.value
  if (!row || row.id == null) return
  // roles 用 { 人物id: 角色名 } 形态：契约里 {personIds, roles} 未指明 roles 的类型，
  // 这里按「以人物 id 为键的映射」发送，空角色不下发；后端若用数组形态需同步调整这一处。
  const roles = {}
  videoPersonIds.value.forEach(id => {
    const role = (videoPersonRoles[id] || '').trim()
    if (role) roles[id] = role
  })
  videoPersonSaving.value = true
  setVideoPersons(row.id, { personIds: videoPersonIds.value.slice(), roles: roles }).then(() => {
    proxy.$modal.msgSuccess('视频人物已更新')
    videoPersonVisible.value = false
    loadVideos()
    loadStats()
  }).catch(err => {
    proxy.$modal.notifyError({
      title: '更新视频人物失败',
      message: errorText(err) || '请求失败：/admin/videos/{id}/persons 可能尚未就绪，请查看后端日志',
      duration: 8000
    })
  }).finally(() => { videoPersonSaving.value = false })
}

/* P6.48：册并入 */
const albumMergeVisible = ref(false)
/* P6.91：并入时是否按相似度插入 */
const albumMergeSimilar = ref(false)
const albumMergeSource = ref(null)
const albumMergeTarget = ref('')
const albumMergeOptions = ref([])
const albumMergeLoading = ref(false)
const albumMergeBusy = ref(false)
const albumMergePreview = ref({ moving: 0, duplicates: 0 })

/* P6.54：采纳建议册 */
async function confirmAlbumsByIds(ids) {
  if (!ids || !ids.length) return
  try {
    const res = await confirmAlbumsApi(ids)
    proxy.$modal.msgSuccess('已采纳 ' + ((res && res.confirmed) || ids.length) + ' 本册（站端可见）')
    loadAlbums()
    loadStats()
  } catch (e) {
    proxy.$modal.msgError('采纳失败：' + (errorText(e) || (e && e.message) || '请求失败'))
  }
}

function confirmSelectedAlbums() {
  const ids = selectedAlbums.value.map((a) => String(a.id))
  if (!ids.length) return
  confirmAlbumsByIds(ids)
}

function confirmOneAlbum(row) {
  if (!row || row.id == null || row.confirmed !== 0) return
  confirmAlbumsByIds([String(row.id)])
}

function openAlbumMerge(row) {
  albumMergeSource.value = row
  albumMergeTarget.value = ''
  albumMergeSimilar.value = false
  albumMergeOptions.value = []
  albumMergeVisible.value = true
  albumMergePreview.value = { moving: 0, duplicates: 0 }
  searchMergeTargets('')
}

/**
 * 目标册候选（P6.91.1）
 *
 * <p>原来固定 pageSize=30：全库 167 本册时下拉只出现前 30 条，用户想找的
 * 「2023写真合集」（标题以数字开头、排序靠后）根本不在列表里，看着像"列表不全"。
 * 现在一次拉 200 条（覆盖当前规模）+ 按图片数降序（大册优先出现），
 * 并保留远程搜索：输入关键词时按关键词查，不受这 200 条限制。</p>
 */
async function searchMergeTargets(keyword) {
  albumMergeLoading.value = true
  try {
    const kw = (keyword || '').trim()
    const res = await listAlbums({
      keyword: kw,
      pageNum: 1,
      pageSize: 200,
      hidden: 'all',
      sort: kw ? undefined : 'photoCount-desc'
    })
    const selfId = albumMergeSource.value && albumMergeSource.value.id
    albumMergeOptions.value = ((res && res.rows) || []).filter((a) => a.id !== selfId)
  } catch (e) {
    albumMergeOptions.value = []
  } finally {
    albumMergeLoading.value = false
  }
}

async function onMergeTargetChange(target) {
  albumMergePreview.value = { moving: 0, duplicates: 0 }
  if (!target || !albumMergeSource.value) return
  try {
    const res = await previewAlbumMerge(albumMergeSource.value.id, target)
    albumMergePreview.value = {
      moving: (res && res.moving) || 0,
      duplicates: (res && res.duplicates) || 0
    }
  } catch (e) {
    albumMergePreview.value = { moving: 0, duplicates: 0 }
  }
}

async function doAlbumMerge() {
  if (!albumMergeSource.value || !albumMergeTarget.value) return
  if (albumMergePreview.value.duplicates > 0) {
    try {
      await proxy.$modal.confirm('有 ' + albumMergePreview.value.duplicates
        + ' 张图与目标册内容重复，并入后会并排保留（不会自动删）。继续？')
    } catch (e) {
      return
    }
  }
  albumMergeBusy.value = true
  try {
    const res = albumMergeSimilar.value
      ? await mergeAlbumsSimilar(albumMergeSource.value.id, albumMergeTarget.value)
      : await mergeAlbums(albumMergeSource.value.id, albumMergeTarget.value)
    let msg = '已并入：移动 ' + ((res && res.moved) || 0) + ' 张'
    if (albumMergeSimilar.value && res && res.insertedBySimilarity != null) {
      msg += '（按相似插入 ' + res.insertedBySimilarity + ' 张，追加 ' + (res.appended || 0)
        + ' 张，平均距离 ' + (res.avgDistance || 0) + '）'
    }
    proxy.$modal.msgSuccess(msg)
    albumMergeVisible.value = false
    loadAlbums()
    loadStats()
  } catch (e) {
    proxy.$modal.msgError('并入失败：' + ((e && e.message) || '请求失败'))
  } finally {
    albumMergeBusy.value = false
  }
}

/* P6.57：册内人工排序（拖拽重排当前页，退出时一次性保存） */
const photoSortMode = ref(false)
const sortDragIndex = ref(-1)

function toggleSortMode() {
  if (photoSortMode.value) {
    photoSortMode.value = false
    saveSort()
  } else {
    photoSortMode.value = true
  }
}

function onSortDragStart(index) {
  if (!photoSortMode.value) return
  sortDragIndex.value = index
}

function onSortDrop(index) {
  const from = sortDragIndex.value
  sortDragIndex.value = -1
  if (!photoSortMode.value || from < 0 || from === index) return
  const list = photoList.value.slice()
  const moved = list.splice(from, 1)[0]
  if (!moved) return
  list.splice(index, 0, moved)
  photoList.value = list
}

async function saveSort() {
  const ids = photoList.value.map((p) => String(p.id)).filter((v) => v && v !== 'undefined')
  const albumId = photoQuery.albumId
  if (!ids.length || !albumId) return
  // 当前页第一张的 seq 作为起点：翻页排序也不会把别页的顺序搅乱
  const startSeq = Number((photoList.value[0] && photoList.value[0].seq) || 0)
  try {
    const res = await reorderAlbumPhotos(albumId, ids, startSeq)
    proxy.$modal.msgSuccess('顺序已保存（' + ((res && res.updated) || ids.length) + ' 张）')
    applyPhotoPage()
  } catch (e) {
    proxy.$modal.msgError('保存顺序失败：' + (errorText(e) || (e && e.message) || '请求失败'))
  }
}

/* P6.52：未归类（album_id 为空）—— 列表 + 逐张移入某册 + 批量移出 */
const uncatVisible = ref(false)
const uncatLoading = ref(false)
const uncatRows = ref([])
const uncatTotal = ref(0)
const uncatPage = ref(1)
const uncatPageSize = ref(48)
/* P6.88：未归类按目录汇总 + 一键建册并入 */
const uncatDirs = ref([])
const uncatClaiming = ref('')
/* P6.89：未归类里勾选若干张 → 建册并入（无规则，纯人工归属） */
const uncatSelected = ref([])

function openUncategorized() {
  uncatVisible.value = true
  uncatPage.value = 1
  loadUncat()
  loadUncatDirs()
}

function isUncatPicked(id) {
  return uncatSelected.value.indexOf(String(id)) > -1
}

function toggleUncatPick(id) {
  const key = String(id)
  uncatSelected.value = isUncatPicked(key)
    ? uncatSelected.value.filter(x => x !== key)
    : uncatSelected.value.concat([key])
}

function clearUncatPick() {
  uncatSelected.value = []
}

/** 勾选的几张 → 建一本新册并入（不落规则：这是人工挑的，不代表整个目录） */
async function claimPickedPhotos() {
  const ids = uncatSelected.value.slice()
  if (!ids.length) return
  let title
  try {
    const r = await proxy.$prompt('把这 ' + ids.length + ' 张放进一本新册，标题：', '建册并入', {
      confirmButtonText: '建册并入',
      cancelButtonText: '取消',
      inputValue: '未命名册',
      inputValidator: v => (v && v.trim() ? true : '标题不能为空')
    })
    title = (r && r.value ? r.value : '').trim()
  } catch (e) {
    return
  }
  if (!title) return
  try {
    const res = await splitAlbumPhotos(ids, title)
    const moved = (res && (res.moved != null ? res.moved : res.count)) || ids.length
    proxy.$modal.msgSuccess('已建册「' + title + '」并入 ' + moved + ' 张')
    uncatSelected.value = []
    loadAlbums()
    loadStats()
    await loadUncat()
    await loadUncatDirs()
  } catch (e) {
    proxy.$modal.msgError('建册失败：' + errorText(e))
  }
}

async function loadUncatDirs() {
  try {
    const res = await listUncategorizedDirs()
    uncatDirs.value = Array.isArray(res) ? res : ((res && res.rows) || [])
  } catch (e) {
    uncatDirs.value = []
  }
}

/** 一键：按目录建册 + 建规则 + 把该目录未归类照片移进去（一次输入标题，一次确认） */
async function claimDir(d) {
  const dir = d && d.dir ? String(d.dir) : ''
  const parts = dir.split('/')
  const guess = parts.length ? parts[parts.length - 1] : '未命名册'
  let title
  try {
    const r = await proxy.$prompt('新册标题（该目录下 ' + d.photos + ' 张会移进去，并自动建一条归属规则）',
      '按目录建册', {
        confirmButtonText: '建册并入',
        cancelButtonText: '取消',
        inputValue: guess,
        inputValidator: v => (v && v.trim() ? true : '标题不能为空')
      })
    title = (r && r.value ? r.value : '').trim()
  } catch (e) {
    return
  }
  if (!title) return
  uncatClaiming.value = dir
  try {
    const res = await claimUncategorizedDir({ dir, title })
    proxy.$modal.msgSuccess('已建册「' + ((res && res.title) || title) + '」，移入 '
      + ((res && res.moved) || 0) + ' 张；同目录以后的扫描会自动归到这里')
    loadAlbums()
    loadStats()
    await loadUncat()
    await loadUncatDirs()
  } catch (e) {
    proxy.$modal.msgError('建册失败：' + errorText(e))
  } finally {
    uncatClaiming.value = ''
  }
}

async function loadUncat() {
  uncatLoading.value = true
  uncatSelected.value = []
  try {
    const res = await listUncategorizedPhotos({ page: uncatPage.value, size: uncatPageSize.value })
    uncatRows.value = (res && res.rows) || []
    uncatTotal.value = (res && res.total) || 0
  } catch (e) {
    uncatRows.value = []
    uncatTotal.value = 0
    proxy.$modal.msgError('读取未归类照片失败：' + (errorText(e) || (e && e.message) || '请求失败'))
  } finally {
    uncatLoading.value = false
  }
}

/** 未归类卡片 → 复用「移到另一册」弹层（它读的也是 photoSelected） */
function moveUncat(p) {
  if (!p || p.id == null) return
  uncatVisible.value = false
  photoSelected.value = [String(p.id)]
  openPhotoRelocate('move')
}

/** 把相册里选中的几张移出本册，变成未归类 */
async function detachSelectedPhotos() {
  const ids = photoSelected.value.slice()
  if (!ids.length) return
  try {
    await proxy.$modal.confirm('把选中的 ' + ids.length + ' 张移出本册、变成「未归类」？\n\n'
      + '它们会从本册移走，站端不再展示；以后可以在「未归类…」里再移进别的册。\n'
      + '（标记为人工归属，重扫不会按目录把它们拽回来）')
  } catch (e) {
    return
  }
  try {
    const res = await detachAlbumPhotos(ids)
    proxy.$modal.msgSuccess('已移出 ' + ((res && res.detached) || ids.length) + ' 张 → 未归类')
    photoSelected.value = []
    applyPhotoPage()
    loadAlbums()
    loadStats()
  } catch (e) {
    proxy.$modal.msgError('移出失败：' + (errorText(e) || (e && e.message) || '请求失败'))
  }
}

/* P6.51：按图改归属 —— 移到另一册 / 拆出新册 */
const photoRelocateVisible = ref(false)
const photoRelocateMode = ref('move')
const photoRelocateTarget = ref('')
const photoRelocateTitle = ref('')
const photoRelocateOptions = ref([])
const photoRelocateLoading = ref(false)
const photoRelocateBusy = ref(false)
/** P6.51：搬入前的重复预检结果 + 冲突策略（keep 同时存在 / skip 跳过重复 / replace 只保留一份） */
const relocatePreview = ref({ moving: 0, duplicates: 0, globalCopies: 0, targetCopies: 0 })
const relocateDupPolicy = ref('keep')

function openPhotoRelocate(mode) {
  if (!photoSelected.value.length) return
  photoRelocateMode.value = mode
  photoRelocateTarget.value = ''
  photoRelocateTitle.value = ''
  photoRelocateOptions.value = []
  relocatePreview.value = { moving: 0, duplicates: 0, globalCopies: 0, targetCopies: 0 }
  relocateDupPolicy.value = 'keep'
  photoRelocateVisible.value = true
  if (mode === 'move') searchRelocateTargets('')
}

/** 选中目标册后立刻预检：目标册里有几张同内容（决定要不要弹三选一） */
async function onRelocateTargetChange(target) {
  relocatePreview.value = { moving: 0, duplicates: 0, globalCopies: 0, targetCopies: 0 }
  if (!target || !photoSelected.value.length) return
  try {
    const res = await previewPhotoMove(photoSelected.value.slice(), target)
    relocatePreview.value = {
      moving: (res && res.moving) || 0,
      duplicates: (res && res.duplicates) || 0,
      globalCopies: (res && res.globalCopies) || 0,
      targetCopies: (res && res.targetCopies) || 0
    }
  } catch (e) {
    relocatePreview.value = { moving: 0, duplicates: 0, globalCopies: 0, targetCopies: 0 }
  }
}

async function searchRelocateTargets(keyword) {
  photoRelocateLoading.value = true
  try {
    const res = await listAlbums({ keyword: keyword || '', pageNum: 1, pageSize: 30, hidden: 'all' })
    const selfId = (currentAlbum.value && currentAlbum.value.id) || photoQuery.albumId
    photoRelocateOptions.value = ((res && res.rows) || []).filter((a) => a.id !== selfId)
  } catch (e) {
    photoRelocateOptions.value = []
  } finally {
    photoRelocateLoading.value = false
  }
}

async function doPhotoRelocate() {
  const ids = photoSelected.value.slice()
  if (!ids.length) return
  photoRelocateBusy.value = true
  try {
    const res = photoRelocateMode.value === 'split'
      ? await splitAlbumPhotos(ids, photoRelocateTitle.value.trim())
      : await moveAlbumPhotos(ids, photoRelocateTarget.value, relocateDupPolicy.value)
    const moved = (res && res.moved) || 0
    const skipped = (res && res.skipped) || 0
    const replaced = (res && res.replaced) || 0
    const total = ids.length
    // 数字必须自洽：选中 N 张 = 搬移 moved + 跳过 skipped，用户一眼能对上
    let msg
    if (photoRelocateMode.value === 'split') {
      msg = '已拆出新册：搬入 ' + moved + ' 张（人工归属，重扫不会再拽回）'
    } else if (moved === 0 && skipped > 0) {
      // 「跳过重复」把选中的全跳过了：策略生效，不是失败
      msg = '没有搬动：选中 ' + total + ' 张，' + skipped + ' 张在目标册里都有同内容，已按「跳过重复」跳过'
    } else if (skipped > 0) {
      msg = '选中 ' + total + ' 张：搬移 ' + moved + ' 张、跳过重复 ' + skipped + ' 张'
        + '（跳过的是目标册里已有同内容的）'
    } else {
      msg = '已移动：' + moved + ' 张（人工归属，重扫不会再拽回）'
    }
    if (replaced > 0) msg += '；目标册里旧的那份已进回收站 ' + replaced + ' 份'
    proxy.$modal.msgSuccess(msg)
    photoRelocateVisible.value = false
    photoSelected.value = []
    applyPhotoPage()
    loadAlbums()
    loadStats()
  } catch (e) {
    proxy.$modal.msgError('改归属失败：' + (errorText(e) || (e && e.message) || '请求失败'))
  } finally {
    photoRelocateBusy.value = false
  }
}

function openAlbumPersons(row) {
  if (!row || row.id == null) return
  albumPersonRow.value = row
  albumPersonTitle.value = row.title || row.dir || String(row.id)
  albumPersonIds.value = []
  // 索引里的 albums[].persons 只有名字没有 id，无法直接回填多选；
  // 优先用后端可能给的 personIds，其次用老的单值 personId。
  if (Array.isArray(row.personIds)) {
    albumPersonIds.value = row.personIds.slice()
  } else if (row.personId !== null && row.personId !== undefined && row.personId !== '') {
    albumPersonIds.value = [row.personId]
  }
  albumPersonVisible.value = true
  loadPersonPickOptions(false)
}

function submitAlbumPersons() {
  if (albumPersonSaving.value) return
  const row = albumPersonRow.value
  if (!row || row.id == null) return
  albumPersonSaving.value = true
  setAlbumPersons(row.id, albumPersonIds.value.slice()).then(() => {
    proxy.$modal.msgSuccess('相册人物已更新')
    albumPersonVisible.value = false
    loadAlbums()
    loadPeople()
    loadStats()
  }).catch(err => {
    proxy.$modal.notifyError({
      title: '更新相册人物失败',
      message: errorText(err) || '请求失败：/admin/albums/{id}/persons 可能尚未就绪，请查看后端日志',
      duration: 8000
    })
  }).finally(() => { albumPersonSaving.value = false })
}

/* ------------------------------------------------------ 标签父级（P3-B） */
/* 父标签下拉必须排除「自身」与「自身的全部后代」，否则会造出环（A 的父是 B、B 的父是 A）。
   后端 /tags 增了 parentId（以及可选的 path），这里 name/depth 都在前端按 parentId 链推导，
   有 path 时优先用 path 展示。 */

function tagChildrenMap(list) {
  const map = new Map()
  ;(list || []).forEach(item => {
    if (!item || item.id == null) return
    const key = item.parentId === null || item.parentId === undefined ? '' : String(item.parentId)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  })
  return map
}

/** 某标签的全部后代 id（广度展开，防脏数据成环时用 visited 兜底） */
function collectDescendantIds(list, rootId) {
  const childrenOf = tagChildrenMap(list)
  const out = new Set()
  const stack = [String(rootId)]
  while (stack.length) {
    const current = stack.pop()
    ;(childrenOf.get(current) || []).forEach(child => {
      const cid = String(child.id)
      if (out.has(cid)) return
      out.add(cid)
      stack.push(cid)
    })
  }
  return out
}

/** 层级深度（顶级 = 0）：按 parentId 链向上走，超过 32 层视为脏数据直接停 */
function tagDepthOf(id, list) {
  let depth = 0
  let current = (list || []).find(item => String(item.id) === String(id))
  let guard = 0
  while (current && current.parentId !== null && current.parentId !== undefined && guard < 32) {
    current = (list || []).find(item => String(item.id) === String(current.parentId))
    depth += 1
    guard += 1
  }
  return depth
}

/** 父标签候选：排除自身 + 后代，带层级缩进标签 */
const tagParentOptions = computed(() => {
  const list = tagList.value.filter(item => item && item.id != null)
  const banned = new Set()
  if (tagEditForm.id !== null && tagEditForm.id !== undefined) {
    banned.add(String(tagEditForm.id))
    collectDescendantIds(list, tagEditForm.id).forEach(id => banned.add(id))
  }
  return list
    .filter(item => !banned.has(String(item.id)))
    .map(item => ({
      id: item.id,
      label: (item.path ? String(item.path) : '— '.repeat(tagDepthOf(item.id, list)) + (item.name || String(item.id)))
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-Hans-CN'))
})

/** 列表里的「父标签」列：有 path 用 path，否则递归找父名，找不到就是顶级 */
function tagParentLabel(row) {
  if (!row) return '顶级'
  if (row.path) return String(row.path)
  if (row.parentId === null || row.parentId === undefined) return '顶级'
  const parent = tagList.value.find(item => String(item.id) === String(row.parentId))
  return parent ? (parent.name || String(parent.id)) : ('#' + row.parentId + '（已删除）')
}

onMounted(() => {
  // 先恢复上次的筛选（视频/相册），再发首屏请求，避免先按默认条件拉一遍
  restoreFilters('video', videoQuery)
  restoreFilters('album', albumQuery)
  loadStats()
  loadPeople()
  loadVideos()
  loadTagOptions()
  // P6.19：vcodec 下拉的选项要拉 200 行视频来统计，没必要挡住首屏，空闲时再补
  setTimeout(() => loadVcodecOptions(), 400)

  // P6.40：从「内容审核」点预览跳过来时，直接打开这本册的图片弹窗
  // （复用的就是媒体库自己的弹窗：预览大图 / 改单张分级 / 批量设分级 / 自动分级都在）
  const openAlbumId = route.query.openAlbum
  if (openAlbumId) {
    openPhotos({ id: String(openAlbumId), title: String(route.query.openAlbumTitle || '') })
  }
  // P6.20：相册 / 回收站后台预取。之前「刷新后第一次点相册」要等首个查询走完冷缓存，
  // 现在首屏就把这两张表拉好，点 tab 直接出数据（tabLoaded 已置位，不会再重复请求）
  setTimeout(() => { if (!tabLoaded.album) loadAlbums() }, 600)
  setTimeout(() => { if (!tabLoaded.trash) loadTrash() }, 1200)
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
.album-merge-similar { margin: 10px 0 4px; }
.album-merge-preview { margin: 10px 0 0; font-size: 13px; color: var(--el-text-color-regular); }
.album-merge-dup { color: var(--el-color-warning); }
.album-merge-tip { margin: 0 0 12px; font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); }
/* P6.57：排序模式：可拖 + 抓手光标 */
.photo-item.sorting { cursor: grab; }
.photo-item.sorting:active { cursor: grabbing; }

/* P6.54：建议册徽标 */
.album-suggest-tag { margin-left: 8px; transform: scale(0.9); }

/* P6.52：未归类网格 */
.uncat-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.uncat-count { font-size: 13px; color: var(--el-text-color-secondary); }
.uncat-grid { display: flex; flex-wrap: wrap; gap: 12px; min-height: 160px; }
.rule-tip { margin-bottom: 10px; }
.rule-tip p { margin: 4px 0; line-height: 1.6; }
.rule-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.rule-count { font-size: 12px; color: var(--el-text-color-secondary); }
.rule-album { font-weight: 600; }
.rule-sub { font-size: 12px; color: var(--el-text-color-secondary); margin-left: 4px; }
.uncat-picked { font-size: 12px; color: var(--el-color-primary); }
.uncat-card { position: relative; }
.uncat-card.is-picked { outline: 2px solid var(--el-color-primary); border-radius: 6px; }
.uncat-check {
  position: absolute; left: 6px; top: 6px; z-index: 2; width: 22px; height: 22px; border-radius: 50%;
  background: rgba(0,0,0,.45); color: #fff; font-size: 13px; line-height: 22px; text-align: center;
  cursor: pointer; user-select: none;
}
.uncat-card.is-picked .uncat-check { background: var(--el-color-primary); }
.uncat-dirs { margin-bottom: 10px; padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-fill-color-lighter); }
.uncat-dirs-head { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.uncat-dir-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-top: 1px dashed var(--el-border-color-lighter); }
.uncat-dir-name { font-size: 13px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uncat-dir-count { font-size: 12px; color: var(--el-text-color-secondary); }
.uncat-spacer { flex: 1; }
.uncat-card {
  width: 150px; border: 1px solid var(--el-border-color-light); border-radius: 6px;
  overflow: hidden; background: var(--el-bg-color);
}
.uncat-thumb { width: 100%; height: 110px; background: var(--el-fill-color-light); }
.uncat-ph { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--el-text-color-secondary); }
.uncat-name { padding: 4px 6px 0; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.uncat-actions { padding: 2px 6px 6px; text-align: right; }

/* P6.51：册下拉项 = 封面 + 标题 + 张数 */
.album-opt { display: flex; align-items: center; gap: 8px; height: 34px; }
.album-opt-cover {
  width: 26px; height: 26px; object-fit: cover; border-radius: 3px; flex: none;
  background: var(--el-fill-color-light);
}
.album-opt-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-opt-count { flex: none; font-size: 12px; color: var(--el-text-color-secondary); }

/* P6.51：搬入前的重复冲突三选一 */
.relocate-dup { margin: 12px 0 0; }
.relocate-dup p { margin: 6px 0 0; line-height: 1.7; font-size: 13px; }
.relocate-dup-group { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.dup-tabs :deep(.el-tabs__content) { overflow: visible; }
.video-player { width: 100%; max-height: 70vh; background: #000; }
/* P6.04：维护抽屉内容变长后整体滚动（375 窄屏时抽屉 = 96vw，近似全宽） */
.maint-drawer :deep(.el-drawer__body) {
  overflow-y: auto;
  overflow-x: hidden;
}
@media (max-width: 480px) {
  .maint-drawer :deep(.el-drawer__body) {
    padding: 10px;
  }
}
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
  align-items: center;
}
/* P5.12：派生资源汇总条 / 两个下拉 / 空态文案的样式都在子组件里（scoped），页面不再持有 */
/* P5.10-B：工具栏「已选 N 项」 */
/* P6.83：标签列 */
.video-tags { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.video-tag { max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
.video-tag-edit { margin-left: 2px; }
.tag-edit-tip { font-size: 13px; color: var(--el-text-color-regular); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-edit-hint { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 8px; line-height: 1.6; }
.media-selected-hint { font-size: 12px; color: var(--el-text-color-placeholder); margin-right: 8px; }
.media-selected {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 22px;
  padding: 0 6px;
  border-radius: 4px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
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
/* P6.00：自带封面标记（叠在封面右上角，不改变列宽，也不影响点击放大） */
.media-cover-wrap {
  position: relative;
  display: inline-block;
  line-height: 0;
}
.cover-badge {
  position: absolute;
  top: 0;
  right: 0;
  padding: 0 2px;
  font-size: 10px;
  line-height: 14px;
  color: #fff;
  background: var(--el-color-success);
  border-radius: 2px;
  cursor: help;
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
/* P6.22：图片弹窗顶部的分级筛选条——sticky，滚 96 格时一直在 */.photo-filter {
  position: sticky;
  top: -12px;
  z-index: 4;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  padding: 8px 0 6px;
  background: var(--el-bg-color);
}
.photo-filter-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-right: 2px;
}
.photo-filter-divider {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: var(--el-border-color-lighter);
}
/* P6.24：自动分级按钮贴右，和筛选 chip 分开 */
.photo-auto-rate {
  margin-left: auto;
  flex: 0 0 auto;
}
.photo-album-rating {
  font-weight: 600;
}
.photo-album-rating.ar-general {
  color: var(--el-color-success);
}
.photo-album-rating.ar-guidance {
  color: var(--el-color-warning);
}
.photo-album-rating.ar-restricted {
  color: var(--el-color-danger);
}
.photo-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px 2px 8px;
  font-size: 12px;
  line-height: 20px;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.photo-filter-chip:hover {
  background: var(--el-fill-color);
}
.photo-filter-chip b {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.photo-filter-chip.on {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.photo-filter-chip.on b {
  color: var(--el-color-primary);
}
.photo-filter-chip.empty {
  opacity: 0.45;
}
.photo-filter-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder);
}
.photo-filter-dot.dot-general {
  background: var(--el-color-success);
}
.photo-filter-dot.dot-guidance {
  background: var(--el-color-warning);
}
.photo-filter-dot.dot-restricted {
  background: var(--el-color-danger);
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  align-items: stretch;
  gap: 8px;
  min-height: 40px;
}
.photo-item {
  position: relative;   /* P6.15：勾选框/角标都相对卡片定位；缺这行会让它们全叠到弹窗左上角 */
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
  line-height: 0;
}
.photo-thumb {
  position: relative;
  line-height: 0;
}
/* P6.14：固定卡片大小——所有格子同一个高度，图片按原比例居中放进去（不裁剪、不撑高） */
.photo-item img {
  display: block;
  width: 100%;
  height: 150px;
  object-fit: contain;
  object-position: center center;
  border-radius: 4px;
  background: var(--el-fill-color-light);
}
/* P6.15：自定义标题头——完全不依赖 el-dialog 默认标题（它会被裁） */
:deep(.photos-dialog .el-dialog__header) {
  padding: 0;
  margin: 0;
}
.photos-head {
  display: flex;
  align-items: center;
  gap: 10px;
  /* P6.16：与下面的缩略图网格左对齐（网格 padding 12px），标题不再往右缩进 */
  padding: 14px 48px 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  box-sizing: border-box;
  width: 100%;
}
.photos-head-all {
  margin-left: auto;
}
.photos-head-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  word-break: break-all;
}
.photos-head-picked {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--el-color-primary);
}
/* P6.14：弹窗顶部留白 + 不裁切（标题已换成自定义 header，见上） */
:deep(.photos-dialog) {
  margin-top: 4vh !important;
  overflow: visible;
}
/* 勾选后的卡片高亮：光有一个左上角小勾太不明显 */
/* P6.19：Shift 连选时禁止浏览器选中文字（之前整片变蓝，看着像全选了）。
   弹窗被 append-to-body 挪到 body 下，必须用 :deep 才能命中 Element Plus 内部节点 */
:deep(.photos-dialog),
:deep(.photos-dialog *) {
  -webkit-user-select: none;
  user-select: none;
}
/* P6.18：触屏长按拖动选图——禁止长按选中文字/弹出系统菜单，滑动时不要滚动页面 */
.photo-grid {
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
/* P6.20：悬停出现的「选到此」按钮（触屏没有 hover，所以它本身是个可点的按钮） */
.photo-range {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  z-index: 3;
  padding: 3px 8px;
  font-size: 11px;
  line-height: 1.2;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
  border-radius: 10px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
  white-space: nowrap;
}
.photo-item:hover .photo-range,
/* 触屏没有 hover：进入多选或已勾选时全部显形，否则手机上根本点不到 */
.photo-grid.range-on .photo-range {
  opacity: 1;
  pointer-events: auto;
}
.photo-range:hover {
  background: var(--el-color-primary);
}
/* P6.20：选中态只框住缩略图（之前整格 outline 会和相邻格挤在一起） */
.photo-item.picked .photo-thumb {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
  border-radius: 5px;
}
/* P6.30：旧选中态已删除——之前和 .photo-thumb 的描边同时生效，选中时是双层蓝框 */
/* 批量条固定在弹窗底部 */
.photo-batch {
  justify-content: flex-end;
}
/* P6.13：图片多时弹窗不要撑出屏幕，主体限高内部滚动 */
:deep(.photos-dialog .el-dialog__body) {
  padding: 12px;
  max-height: 62vh;
  overflow: auto;
}
/* P6.13：分页的「N 条/页」下拉在窄容器里会被截成「4 条/页」，给足宽度。
   目标在子组件 Pagination 内部，必须用 :deep() 才能命中。 */
:deep(.el-pagination__sizes .el-select) {
  width: 118px;
}
.photo-name {
  font-size: 11px;
  line-height: 1.2;
  text-align: center;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.row-more {
  margin: 0 2px;
  vertical-align: middle;
}
/* P6.17：自绘勾选框：16px 方块，勾上后主色填充 + 白勾 */
.photo-pick {
  position: absolute;
  left: 6px;
  top: 6px;
  z-index: 2;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.35);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  box-sizing: border-box;
}
.photo-pick.on {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
}
.photo-pick.on::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.photos-head-tip {
  font-size: 11.5px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}
.photo-batch {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 4px;
  padding: 8px 10px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
}
.photo-batch-count {
  font-size: 12.5px;
  color: var(--el-text-color-regular);
}
/* P6.09 图片级分级角标：点一下循环切换；颜色沿用三档语义 */
.photo-rating-dd {
  position: absolute;
  right: 4px;
  top: 4px;
  z-index: 2;
}
.photo-rating {
  min-width: 18px;
  text-align: center;
  font-size: 11px;
  line-height: 1;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 3px;
  padding: 2px 4px;
  cursor: pointer;
  user-select: none;
}
.photo-rating.pr-general { background: rgba(64, 158, 255, 0.85); }
.photo-rating.pr-guidance { background: rgba(230, 162, 60, 0.9); }
.photo-rating.pr-restricted { background: rgba(245, 108, 108, 0.9); }
/* P6.25：比册级更宽的图（图级优先后会单独可见）——白虚线描一圈，和「继承」区分开 */
.photo-rating.wider { outline: 1px dashed #fff; outline-offset: -2px; box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.9); }
.photo-notice {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-color-warning);
  word-break: break-all;
}
.person-album {
  word-break: break-all;
}
.trash-cover-ph { color: var(--el-text-color-placeholder); }
.trash-orphan {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tag-create {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.tag-create-name {
  width: 240px;
}
.tag-create-color {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  min-width: 60px;
}
.tag-filter {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.tag-filter-input {
  width: 240px;
}
.tag-filter-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tag-error {
  margin-bottom: 10px;
}
.tag-swatch {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--el-border-color);
  vertical-align: -3px;
  margin-right: 6px;
}
.tag-swatch-empty {
  background-image: linear-gradient(45deg, var(--el-border-color-lighter) 25%, transparent 25%, transparent 75%, var(--el-border-color-lighter) 75%);
  background-size: 8px 8px;
}
.tag-color-text {
  font-size: 12px;
  color: var(--el-text-color-regular);
  font-family: var(--el-font-family-monospace, monospace);
}
.tag-edit-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

/* 编辑策略弹窗：三档单选 + 每档一行说明 + 红字公网提示 */
.policy-box {
  min-height: 150px;
}
.policy-lead {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.policy-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.policy-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  transition: border-color 0.12s, background 0.12s;
}
.policy-item.is-on {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.policy-desc {
  padding-left: 24px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
.policy-warn {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 12.5px;
  line-height: 1.6;
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
/* 人物弹窗（P3-B）：目标名 / 每个选中人物的角色行 / 未就绪提示 */
.vp-target {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}
.vp-alert {
  margin-bottom: 10px;
}
.vp-role-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}
.vp-role-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.vp-role-name {
  flex: 0 0 96px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vp-tip {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
@media (max-width: 560px) {
  .vp-role-name {
    flex-basis: 72px;
  }
}

/* ---------- 内容分级（P5.99）：行内下拉 + 批量条 ---------- */
.rating-col :deep(.el-select) {
  width: 100%;
}
.rating-select :deep(.el-input__wrapper) {
  padding-left: 6px;
  padding-right: 6px;
}
/* P6.21：分级单元格的标签（替代行内 el-select）——纯 span，无弹层、无子组件 */
.review-cell {
  display: inline-block;
  padding: 0 8px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 10px;
  cursor: pointer;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-regular);
}
.review-cell.rs-pending { color: var(--el-color-warning); }
.review-cell.rs-approved { color: var(--el-color-success); }
.review-cell.rs-rejected { color: var(--el-color-danger); }
.rating-cell {
  display: inline-block;
  min-width: 62px;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 20px;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  user-select: none;
  transition: filter 0.12s;
}
.rating-cell:hover {
  filter: brightness(0.95);
}
.rating-cell.rc-general {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-7);
}
.rating-cell.rc-guidance {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-7);
}
.rating-cell.rc-restricted {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-7);
}
/* 虚拟触发用的锚点：virtual-triggering 下不会真的渲染，留个空节点给插槽即可 */
.rating-menu-anchor {
  display: inline-block;
  width: 0;
  height: 0;
  overflow: hidden;
}
.rating-error {
  margin-top: 2px;
  font-size: 11px;
  color: var(--el-color-danger);
  line-height: 1.2;
}
.album-batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 24px;
  margin-bottom: 6px;
}
.album-batch-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rating-batch-lead,
.rating-batch-tip {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
}
.rating-batch-tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.rating-batch-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
</style>


















