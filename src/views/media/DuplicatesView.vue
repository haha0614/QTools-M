<template>
  <div class="dup-view">
    <p class="dup-lead">
      按<strong>文件内容哈希</strong>分组的重复文件：一组里只有一条主文件，其余都是副本。
      <strong>清理副本</strong>默认只删索引记录（磁盘文件不动），勾选后才会把副本文件移入回收站（可在回收站恢复）。
      <strong>设为主文件</strong>只改索引记录，不移动任何文件。
    </p>

    <!-- 顶部：kind 切换 + 统计（组数取后端 total，可省空间只统计本页并明确标注） -->
    <div class="dup-head">
      <el-radio-group :model-value="kind" size="small" :disabled="!!loading" @update:model-value="(v) => emit('kind-change', v)">
        <el-radio-button v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</el-radio-button>
      </el-radio-group>
      <div class="dup-stats">
        <span class="dup-stat">重复组 <b>{{ totals.groups }}</b></span>
        <span class="dup-stat">可省空间 <b>{{ totals.bytesText }}</b><i class="dup-stat-note">（本页合计）</i></span>
      </div>
      <el-button icon="Refresh" size="small" :loading="!!loading" @click="emit('refresh')">刷新</el-button>
    </div>

    <!-- 接口未就绪 / 读取失败：就地提示，不弹全局错误，也不影响页面其它标签页 -->
    <el-alert
      v-if="view.state === 'error'"
      :title="view.notReady ? '接口未就绪' : '读取失败'"
      type="warning"
      :closable="false"
      show-icon
      class="dup-alert"
    >
      <template #default>
        <div class="dup-alert-body">
          <p class="dup-alert-text">{{ view.message }}</p>
          <el-button size="small" icon="Refresh" @click="emit('refresh')">重试</el-button>
        </div>
      </template>
    </el-alert>

    <!-- 空态：后端正常但没有重复 -->
    <el-empty v-else-if="view.state === 'empty'" :description="emptyText" :image-size="72" class="dup-empty" />

    <!-- 数据态：主文件 / 副本数 / 可省空间，展开看别名副本 -->
    <el-table
      v-else
      v-loading="view.state === 'loading'"
      :data="rows"
      size="small"
      row-key="__key"
      class="dup-table"
      empty-text="没有重复文件"
    >
      <el-table-column type="expand" width="40">
        <template #default="scope">
          <div class="dup-alias-wrap">
            <div v-if="!groupAliases(scope.row).length" class="dup-alias-empty">这组没有副本（只有一条主文件）</div>
            <ul v-else class="dup-alias-list">
              <li v-for="(a, i) in groupAliases(scope.row)" :key="a.id || i" class="dup-alias">
                <span class="dup-alias-path" :title="a.relPath || a.id">{{ a.relPath || a.id }}</span>
                <span class="dup-alias-size">{{ formatBytes(a.size) }}</span>
                <el-button link type="primary" size="small" v-hasPermi="['media:admin:edit']" @click="emit('keep', scope.row, a)">
                  设为主文件
                </el-button>
              </li>
            </ul>
            <p class="dup-alias-hash">内容哈希 {{ scope.row.contentHash || '（后端未返回）' }}</p>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="主文件" min-width="240" :show-overflow-tooltip="true">
        <template #default="scope">
          <span class="dup-primary">{{ primaryPath(scope.row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="副本数" width="90" align="center">
        <template #default="scope">{{ Math.max(0, groupCount(scope.row) - 1) }}</template>
      </el-table-column>
      <el-table-column label="可省空间" width="120" align="center">
        <template #default="scope">{{ formatBytes(groupWasted(scope.row)) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="196" align="center" fixed="right">
        <template #default="scope">
          <el-button
            link
            type="primary"
            size="small"
            :disabled="!groupAliases(scope.row).length"
            v-hasPermi="['media:admin:edit']"
            @click="emit('keep', scope.row, groupAliases(scope.row)[0])"
          >
            设为主文件
          </el-button>
          <el-button
            link
            type="danger"
            size="small"
            :disabled="!groupAliases(scope.row).length"
            v-hasPermi="['media:admin:edit']"
            @click="emit('merge', scope.row)"
          >
            清理副本
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="view.state === 'data'" class="dup-foot">
      <el-pagination
        :current-page="page"
        :page-size="size"
        :page-sizes="PAGE_SIZES"
        :total="total"
        layout="total, sizes, prev, pager, next"
        background
        size="small"
        @current-change="(p) => emit('page-change', p)"
        @size-change="(s) => emit('size-change', s)"
      />
    </div>
  </div>
</template>

<script setup name="DuplicatesView">
import {
  KINDS,
  PAGE_SIZES,
  formatBytes,
  groupAliases,
  groupCount,
  groupWasted,
  primaryPath
} from './duplicatesModel'

defineProps({
  /** video | photo */
  kind: { type: String, default: 'video' },
  /** resolveViewState() 的结果：{ state: loading|error|empty|data, message, notReady } */
  view: { type: Object, required: true },
  rows: { type: Array, default: () => [] },
  totals: { type: Object, default: () => ({ groups: 0, bytesText: '—' }) },
  emptyText: { type: String, default: '没有重复文件' },
  page: { type: Number, default: 1 },
  size: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['refresh', 'kind-change', 'page-change', 'size-change', 'merge', 'keep'])
</script>

<style scoped>
.dup-view {
  padding-bottom: 8px;
}

.dup-lead {
  margin: 0 0 12px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  padding: 8px 10px;
}

.dup-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.dup-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.dup-stat b {
  font-size: 15px;
  color: var(--el-color-primary);
  font-variant-numeric: tabular-nums;
}

.dup-stat-note {
  font-style: normal;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 2px;
}

.dup-alert {
  margin-bottom: 10px;
}

.dup-alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.dup-alert-text {
  margin: 0;
  flex: 1 1 240px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.dup-empty {
  padding: 18px 0;
}

.dup-table {
  width: 100%;
}

.dup-primary {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
}

.dup-alias-wrap {
  padding: 4px 8px 8px 24px;
}

.dup-alias-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.dup-alias {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  font-size: 12.5px;
}

.dup-alias:last-child {
  border-bottom: none;
}

.dup-alias-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.dup-alias-size {
  flex: 0 0 90px;
  text-align: right;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.dup-alias-empty,
.dup-alias-hash {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.dup-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

@media (max-width: 768px) {
  .dup-alias-wrap {
    padding-left: 8px;
  }

  .dup-alias {
    flex-wrap: wrap;
    gap: 6px;
  }

  .dup-alias-path {
    flex: 1 0 100%;
  }

  .dup-foot {
    justify-content: center;
  }
}
</style>
