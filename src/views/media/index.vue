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
        </span>
        <el-button icon="Refresh" :loading="statsLoading" @click="refreshAll">刷新</el-button>
        <el-button icon="PriceTag" @click="openTagManager" v-hasPermi="['media:admin:list']">标签管理</el-button>
        <el-button icon="Setting" @click="openEditPolicy" v-hasPermi="['media:admin:edit']">编辑策略</el-button>
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
        <!-- 维护面板：把命令行维护操作收进抽屉，与上面 4 个扫描按钮并列（不替换它们） -->
        <el-button icon="Tools" @click="maintVisible = true" v-hasPermi="['media:admin:list']">维护</el-button>
        <!-- P4-B 重复文件：工具栏入口 → 抽屉（与维护面板并列，不替换任何既有按钮） -->
        <el-button icon="CopyDocument" @click="openDuplicates" v-hasPermi="['media:admin:list']">重复文件</el-button>
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

        <!-- P5.10-B：派生资源汇总（绿 / 橙 / 灰）+「只看旧算法」筛选：勾选后可直接批量重建 -->
        <div v-if="deriveReady" class="derive-bar">
          <span class="derive-bar-text" data-testid="derive-summary">{{ derivePreviewText }}</span>
          <el-switch v-model="deriveOnlyOldAlgo" size="small" :disabled="!deriveOldAlgoCount"
            active-text="只看旧算法" />
          <span v-if="deriveMeta.algoSince" class="derive-bar-note" :title="deriveMeta.algoSinceSource || ''">
            算法更新于 {{ deriveMeta.algoSince }}
          </span>
          <el-button link type="primary" icon="Refresh" :loading="deriveLoading" @click="loadDeriveStatus()">刷新派生资源</el-button>
        </div>
        <el-table ref="videoTableRef" v-loading="videoLoading" :data="videoDisplayList" class="media-table" row-key="id"
          @selection-change="handleVideoSelection">
          <el-table-column type="selection" width="44" align="center" />
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
          <el-table-column label="派生资源" width="126" align="center" class-name="derive-col">
            <template #default="scope">
              <derive-badges :row="deriveRowOf(scope.row)" :ready="deriveReady" :loading="deriveLoading"
                :algo-since="deriveMeta.algoSince" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="190" align="center" fixed="right" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-tooltip content="预览" placement="top">
                <el-button link type="primary" icon="View" @click="previewVideo(scope.row)" v-hasPermi="['media:admin:list']" />
              </el-tooltip>
              <el-tooltip content="人物（多选 + 角色）" placement="top">
                <el-button link type="primary" icon="UserFilled" @click="openVideoPersons(scope.row)" v-hasPermi="['media:admin:edit']" />
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
          <el-table-column label="操作" width="230" align="center" fixed="right" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-tooltip content="查看图片" placement="top">
                <el-button link type="primary" icon="Picture" @click="openPhotos(scope.row)" v-hasPermi="['media:admin:list']" />
              </el-tooltip>
              <el-tooltip content="人物（多选）" placement="top">
                <el-button link type="primary" icon="Avatar" @click="openAlbumPersons(scope.row)" v-hasPermi="['media:admin:edit']" />
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

    <!-- 图片浏览：用库数据（GET /album/{id}/photos）渲染，每格 = 缩略图 + seq + 文件名（relPath 末段），
         按 seq 升序；接口 404 时回退到旧的磁盘列举（photoSource='disk'），这时会在顶部提示一行 -->
    <el-dialog v-model="photosVisible" :title="photosTitle" width="min(680px, 92vw)" append-to-body>
      <p class="photo-notice" v-if="photoNotice">{{ photoNotice }}</p>
      <div class="photo-grid" v-loading="photosLoading">
        <div class="photo-item" v-for="photo in photoList" :key="photoKey(photo)" @click="openPhotoPreview(photo)">
          <div class="photo-thumb">
            <img :src="mediaSrc(photo.thumbUrl)" loading="lazy" :alt="'第 ' + photo.seq + ' 张'" />
            <span class="photo-seq">{{ photo.seq }}</span>
          </div>
          <span class="photo-name" :title="photo.relPath || photoFileName(photo.relPath)">{{ photoFileName(photo.relPath) }}</span>
        </div>
      </div>
      <el-empty description="暂无图片" v-if="!photosLoading && !photoList.length" />
      <pagination v-show="photoTotal > 0" :page-sizes="[24, 48, 96]" :total="photoTotal" v-model:page="photoQuery.pageNum"
        v-model:limit="photoQuery.pageSize" @pagination="handlePhotoPage" />
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

    <!-- 维护面板：扫描 / 元数据 / 派生资源 / 备份 / 库根；执行仍复用页面上既有的任务锁与轮询 -->
    <el-drawer v-model="maintVisible" title="维护" size="min(860px, 96vw)" append-to-body destroy-on-close>
      <maint-panel v-model:scanLimit="scanLimit" :scan-running="scanRunning" :refresh-key="maintRefreshKey"
        :selected-video-ids="selectedVideoIds" @run="handleMaintRun" @gc="handleGc" />
    </el-drawer>

    <!-- P5.10-B 生成结果清单：任务完成后按 job 日志的 ITEM / RESULT 行弹出「本次生成了哪些」 -->
    <derive-result-dialog v-model="deriveResultVisible" :model="deriveResultModel" :refreshing="deriveRefreshing"
      @refresh="refreshDeriveColumn" />

    <!-- P4-B 重复文件抽屉：kind 切换 / 列表 / 展开副本 / 分页 / 两处二次确认都在子组件里 -->
    <el-drawer v-model="duplicatesVisible" title="重复文件" size="min(1180px, 96vw)" append-to-body destroy-on-close>
      <duplicates-panel />
    </el-drawer>
  </div>
</template>

<script setup name="Media">
import { listVideos, listAlbums, listPhotos, getAlbumPhotos, setHidden, removeMedia, restoreMedia, setAlbumPerson, listPeople, getStats, startScan, getScanJob, getScanLatest, listTrash, trashStats, purgeTrash, listTags, createTag, deleteTag, updateTag, getEditPolicy, setEditPolicy } from '@/api/media'
// 人物管理（P3-B）：独立 import 行，不改动上面那行既有导入
import { listPersons, setVideoPersons, setAlbumPersons } from '@/api/media'
// 维护面板（扫描 / 元数据 / 派生资源 / 备份 / 库根）：放在同目录子组件，主页面只做挂载与执行
import MaintPanel from './MaintPanel'
// 重复文件抽屉（P4-B）：独立子组件 + 独立 api 导出，不改动上面两行既有导入
import DuplicatesPanel from './DuplicatesPanel'
// 派生资源状态（P5.10-B）：徽标单元格 / 结果对话框 / 日志解析纯函数，三者都独立成文件，主页面只接线
import DeriveBadges from './DeriveBadges.vue'
import DeriveResultDialog from './DeriveResultDialog.vue'
import { deriveMapOf, buildResultModel, summarizeDerive, previewSummaryText, isOldAlgoPreview } from './deriveModel'
import { getDeriveStatus } from '@/api/media'

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
/* 图片预览弹窗的数据源（P2-D）：
   db   = GET /api/media/admin/album/{id}/photos（只读库，库里有几行就画几格）——一次取全册，前端分页；
   disk = 旧的 GET /photos（后端按物理目录列举）——接口未就绪时的回退，会把 _说明.txt 之类也画成一格。 */
const photoSource = ref('db')
const photoRowsAll = ref([])
const photoNotice = ref('')

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

/** 维护面板：抽屉开关；maintRefreshKey 在任务结束后自增，让面板重读导出列表 / 库根 */
const maintVisible = ref(false)
const maintRefreshKey = ref(0)

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
    // P5.10-B：派生资源列与主列表同步刷新（ids 用当前页的 videoId，两次查询条件因此完全一致）
    loadDeriveStatus(videoList.value)
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
  photoRowsAll.value = []
  photoList.value = []
  photoTotal.value = 0
  photoNotice.value = ''
  photoSource.value = 'db'
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
  const size = Number(photoQuery.pageSize) || 24
  const pages = Math.max(1, Math.ceil(photoRowsAll.value.length / size))
  if (photoQuery.pageNum > pages) photoQuery.pageNum = pages
  const start = (photoQuery.pageNum - 1) * size
  photoList.value = photoRowsAll.value.slice(start, start + size)
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
    thumbUrl: (row && row.thumbUrl) || photoThumbUrl(photoQuery.albumId, seq)
  }
}

function photoKey(photo) {
  return photo.id
}

/** 文件名 = relPath 的最后一段（库里的 relPath 可能用 / 也可能用 \） */
function photoFileName(relPath) {
  const parts = String(relPath || '').split(/[\\/]/)
  return parts[parts.length - 1] || ''
}

function openPhotoPreview(photo) {
  // 与用户端 photo.js 同一规则：只有 is_big 的照片才生成了 pv 预览图（thumbs/pv 仅 555/9628），
  // 其余直接用原图接口，否则点开必然 404；库数据没有 relPath 时退到缩略图
  const url = photo.isBig
    ? '/api/media/preview/p/' + photoQuery.albumId + '/' + photo.seq
    : (photo.relPath ? '/api/media/file?p=' + encodeURIComponent(photo.relPath) : photo.thumbUrl)
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
  // P5.10-B：记下本次请求的 videoIds —— 后端日志只给 RESULT 汇总时，用它把结果清单退化成「已处理列表」
  const requestIds = options && Array.isArray(options.videoIds) ? options.videoIds : []
  scanRequestIds = requestIds.map(id => String(id))
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

/** limit 只对这些逐条处理的 mode 生效（scan / gc 传了后端会 400，与 handleScan 的既有规则一致） */
const MAINT_LIMIT_MODES = ['thumb', 'sprite', 'preview', 'sprite,preview', 'enrich']

/**
 * 维护面板的统一执行入口：确认文案由面板给出（它知道勾选项与前置条件），
 * 执行仍复用既有 runScanTask —— 所以任务锁、409 冲突处理、轮询与完成提示都和工具栏那 4 个按钮完全一致。
 */
function handleMaintRun(payload) {
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

// 任务结束后（scanRunning 由 true 变 false）让面板重读导出列表与库根：导出包只有在任务结束后才落盘
watch(scanRunning, (val, old) => {
  if (old && !val) {
    maintRefreshKey.value += 1
  }
})

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
const selectedVideos = ref([])
const selectedVideoTotal = computed(() => selectedVideos.value.length)
const selectedVideoIds = computed(() => selectedVideos.value
  .map(row => (row && row.id != null ? row.id : ''))
  .filter(id => id !== ''))

const deriveMap = ref({})
const deriveReady = ref(true)
/** derive-status 顶层：算法分界时间（「旧算法」徽标的 tooltip 与顶部汇总都用它） */
const deriveMeta = ref({ algoSince: '', algoSinceSource: '' })
/** 「只看旧算法」：勾上后列表只保留预览片段是旧算法产物的行，方便直接圈选重建 */
const deriveOnlyOldAlgo = ref(false)
const deriveLoading = ref(false)
const deriveRefreshing = ref(false)
const deriveResultVisible = ref(false)
const deriveResultModel = ref({ rows: [], summary: { ok: 0, skip: 0, fail: 0 }, total: 0, degraded: false })

/** 本次任务请求的 videoIds：后端日志只给 RESULT 汇总时，用它把清单退化成「已处理列表」 */
let scanRequestIds = []
/** 「接口未就绪」只提示一次（翻页/刷新不再重复打扰） */
let deriveNoticeShown = false

function handleVideoSelection(rows) {
  selectedVideos.value = Array.isArray(rows) ? rows : []
}

function clearVideoSelection() {
  selectedVideos.value = []
  const table = videoTableRef.value
  if (table && typeof table.clearSelection === 'function') {
    table.clearSelection()
  }
}

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
function loadDeriveStatus(rows) {
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

/** 当前页的预览片段分布：新 / 旧算法 / 缺失（顶部汇总那一行） */
const derivePreviewCounts = computed(() => summarizeDerive(
  Object.keys(deriveMap.value).map(id => deriveMap.value[id]),
  'preview'
))
const deriveOldAlgoCount = computed(() => derivePreviewCounts.value.oldAlgo)
const derivePreviewText = computed(() => {
  if (!deriveReady.value) return ''
  const counts = derivePreviewCounts.value
  return previewSummaryText(counts) + '（当前页 ' + counts.total + ' 条）'
})

/** 表格实际渲染的行：「只看旧算法」打开时按 previewStatus 过滤（只影响前端显示，不动请求） */
const videoDisplayList = computed(() => {
  if (!deriveOnlyOldAlgo.value) {
    return videoList.value
  }
  const since = deriveMeta.value.algoSince
  return videoList.value.filter(row => isOldAlgoPreview(deriveRowOf(row), { algoSince: since }))
})

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

function handleTabChange(name) {
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
  align-items: center;
}
/* P5.10-B：派生资源汇总条 */
.derive-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0 0 8px;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}
.derive-bar-text {
  color: var(--el-text-color-regular);
}
.derive-bar-note {
  color: var(--el-text-color-secondary);
}
/* P5.10-B：工具栏「已选 N 项」 */
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
.photo-item img {
  width: 100%;
  height: 84px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--el-fill-color-light);
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
.photo-notice {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-color-warning);
  word-break: break-all;
}
.person-album {
  word-break: break-all;
}
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
</style>
