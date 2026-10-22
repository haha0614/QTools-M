<template>
  <div class="app-container">
    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
      <el-form-item label="工具名称" prop="toolName">
        <el-input
          v-model="queryParams.toolName"
          placeholder="请输入工具名称"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="工具描述" prop="toolDesc">
        <el-input
          v-model="queryParams.toolDesc"
          placeholder="请输入工具描述"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="前端访问路由" prop="toolRoute">
        <el-input
          v-model="queryParams.toolRoute"
          placeholder="请输入前端访问路由"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="图标名称" prop="icon">
        <el-input
          v-model="queryParams.icon"
          placeholder="请输入图标名称"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="显示顺序" prop="sort">
        <el-input
          v-model="queryParams.sort"
          placeholder="请输入显示顺序"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
        <el-button icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button
          type="primary"
          plain
          icon="Plus"
          @click="handleAdd"
          v-hasPermi="['qtool:admin:add']"
        >新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['qtool:admin:edit']"
        >修改</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['qtool:admin:remove']"
        >删除</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Download"
          @click="handleExport"
          v-hasPermi="['qtool:admin:export']"
        >导出</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table v-loading="loading" :data="infoList" @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column label="工具ID" align="center" prop="id" />
      <el-table-column label="工具名称" align="center" prop="toolName" />
      <el-table-column label="工具描述" align="center" prop="toolDesc" min-width="180" show-overflow-tooltip />
      <el-table-column label="前端访问路由" align="center" prop="toolRoute" min-width="170">
        <template #default="scope">
          <!-- 前台与后台同源（nginx / 8080 统一入口），拼上站点源即可直接在新标签页打开 -->
          <el-link
            v-if="scope.row.toolRoute"
            type="primary"
            :underline="false"
            :href="resolveToolUrl(scope.row.toolRoute)"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ scope.row.toolRoute }}
          </el-link>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="图标" align="center" prop="icon" min-width="140">
        <template #default="scope">
          <span class="tool-icon-cell">
            <!-- 一、Element Plus 图标：若依在 main.js 里把所有 EP 图标注册为全局组件，
                 因此存 'Document' / 'EditPen' / 'Key' 这类名字时可直接用 <component :is> -->
            <el-icon v-if="isGlobalIcon(scope.row.icon)" :size="16">
              <component :is="scope.row.icon" />
            </el-icon>
            <!-- 二、若依 SVG 图标（src/assets/icons/svg），如 list / build / image -->
            <svg-icon v-else-if="scope.row.icon" :icon-class="scope.row.icon" />
            <!-- 三、都匹配不上时只显示名称，避免出现空白单元格 -->
            <span class="tool-icon-name">{{ scope.row.icon || '-' }}</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="显示顺序" align="center" prop="sort" />
      <el-table-column label="状态" align="center" prop="status">
        <template #default="scope">
          <el-tag :type="scope.row.status === '0' ? 'success' : 'info'" size="small">
            {{ scope.row.status === '0' ? '正常' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <!-- 打开：直接在新标签页打开该工具的前端页面（未配置路由时禁用） -->
          <el-button
            link
            type="primary"
            icon="TopRight"
            :disabled="!scope.row.toolRoute"
            @click="handleOpenPage(scope.row)"
            v-hasPermi="['qtool:admin:list']"
          >打开</el-button>
          <el-button link type="primary" icon="View" @click="handleViewData(scope.row)" v-hasPermi="['qtool:admin:query']">详情</el-button>
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['qtool:admin:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['qtool:admin:remove']">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    
    <pagination
      v-show="total>0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 工具信息详情抽屉 -->
    <info-view-drawer ref="infoViewRef" />
    <!-- 添加或修改工具信息对话框 -->
    <el-dialog :title="title" v-model="open" width="500px" append-to-body>
      <el-form ref="infoRef" :model="form" :rules="rules" label-width="100px">
        <el-row>
          <el-col :span="24">
            <el-form-item label="工具名称" prop="toolName">
              <el-input v-model="form.toolName" placeholder="请输入工具名称" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="工具描述" prop="toolDesc">
              <el-input v-model="form.toolDesc" placeholder="请输入工具描述" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="前端访问路由" prop="toolRoute">
              <el-input v-model="form.toolRoute" placeholder="请输入前端访问路由" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="图标" prop="icon">
              <!-- Element Plus 图标选择器：下拉项带图标预览，支持输入关键字过滤 -->
              <el-select
                v-model="form.icon"
                filterable
                clearable
                placeholder="请选择 Element Plus 图标"
                style="width: 100%"
              >
                <template #prefix>
                  <el-icon v-if="isGlobalIcon(form.icon)"><component :is="form.icon" /></el-icon>
                </template>
                <el-option v-for="name in epIconNames" :key="name" :label="name" :value="name">
                  <span class="icon-option">
                    <el-icon :size="16"><component :is="name" /></el-icon>
                    <span>{{ name }}</span>
                  </span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="显示顺序" prop="sort">
              <el-input v-model="form.sort" placeholder="请输入显示顺序" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="状态" prop="status">
              <!-- 0 正常（前台可见）/ 1 停用（前台列表接口不再返回） -->
              <el-radio-group v-model="form.status">
                <el-radio value="0">正常</el-radio>
                <el-radio value="1">停用</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup name="Info">
import { listInfo, getInfo, delInfo, addInfo, updateInfo } from "@/api/qtool/info"
import InfoViewDrawer from "./view"
import * as ElementPlusIcons from "@element-plus/icons-vue"

/**
 * 图标选择器的候选值：Element Plus 全部图标名。
 * 若依在 main.js 里已用 app.use(elementIcons) 把同一批图标注册为全局组件，
 * 这里直接取包的命名集合（过滤掉非组件导出），按字母序排列便于搜索。
 */
const epIconNames = Object.keys(ElementPlusIcons)
  .filter(name => /^[A-Z]/.test(name))
  .sort()

const instance = getCurrentInstance()
const { proxy } = instance

/**
 * 图标名是否为已注册的全局组件。
 * 若依在 main.js 里执行 app.use(elementIcons)，把 @element-plus/icons-vue 里的全部图标
 * 以组件名（如 Document / EditPen / Key）注册到全局，所以可直接判断注册表里有没有同名组件。
 */
function isGlobalIcon(name) {
  if (!name) return false
  const components = instance?.appContext?.components || {}
  return Object.prototype.hasOwnProperty.call(components, name)
}

/**
 * 把后台配置的前端路由解析成可点击地址：
 *  - 已是完整地址（http/https）时原样返回；
 *  - 以 / 开头的站内路由拼当前站点源（前台与后台同源，均为 nginx / 8080 统一入口）；
 *  - 前后台分开部署时，可用 VITE_APP_USER_SITE_URL 覆盖站点源。
 */
function resolveToolUrl(route) {
  if (!route) return ''
  if (/^https?:\/\//i.test(route)) return route
  const origin = import.meta.env.VITE_APP_USER_SITE_URL || window.location.origin
  return origin.replace(/\/+$/, '') + (route.startsWith('/') ? route : '/' + route)
}

const infoList = ref([])
const open = ref(false)
const loading = ref(true)
const showSearch = ref(true)
const ids = ref([])
const single = ref(true)
const multiple = ref(true)
const total = ref(0)
const title = ref("")

const data = reactive({
  form: {},
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    toolName: undefined,
    toolDesc: undefined,
    toolRoute: undefined,
    icon: undefined,
    sort: undefined,
    status: undefined,
  },
  rules: {
    toolName: [
      { required: true, message: "工具名称不能为空", trigger: "blur" }
    ],
    toolRoute: [
      { required: true, message: "前端访问路由不能为空", trigger: "blur" }
    ],
  }
})

const { queryParams, form, rules } = toRefs(data)

/** 查询工具信息列表 */
function getList() {
  loading.value = true
  listInfo(queryParams.value).then(response => {
    infoList.value = response.rows
    total.value = response.total
    loading.value = false
  })
}

/** 取消按钮 */
function cancel() {
  open.value = false
  reset()
}

/** 表单重置 */
function reset() {
  form.value = {
    id: null,
    toolName: null,
    toolDesc: null,
    toolRoute: null,
    icon: null,
    sort: null,
    // 新建默认「正常」，否则 status 为 null 时前台列表接口（where status='0'）查不到新工具
    status: '0',
    createTime: null,
    updateTime: null
  }
  proxy.resetForm("infoRef")
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  proxy.resetForm("queryRef")
  handleQuery()
}

/** 多选框选中数据 */
function handleSelectionChange(selection) {
  ids.value = selection.map(item => item.id)
  single.value = selection.length != 1
  multiple.value = !selection.length
}

/** 新增按钮操作 */
function handleAdd() {
  reset()
  open.value = true
  title.value = "添加工具信息"
}

/** 修改按钮操作 */
function handleUpdate(row) {
  reset()
  const _id = row.id || ids.value
  getInfo(_id).then(response => {
    form.value = response.data
    open.value = true
    title.value = "修改工具信息"
  })
}

/** 提交按钮 */
function submitForm() {
  proxy.$refs["infoRef"].validate(valid => {
    if (valid) {
      if (form.value.id != null) {
        updateInfo(form.value).then(() => {
          proxy.$modal.msgSuccess("修改成功")
          open.value = false
          getList()
        })
      } else {
        addInfo(form.value).then(() => {
          proxy.$modal.msgSuccess("新增成功")
          open.value = false
          getList()
        })
      }
    }
  })
}

/** 删除按钮操作 */
function handleDelete(row) {
  const _ids = row.id || ids.value
  proxy.$modal.confirm('是否确认删除工具信息编号为"' + _ids + '"的数据项？').then(function() {
    return delInfo(_ids)
  }).then(() => {
    getList()
    proxy.$modal.msgSuccess("删除成功")
  }).catch(() => {})
}

/** 详情按钮操作 */
function handleViewData(row) {
  proxy.$refs["infoViewRef"].open(row.id)
}

/**
 * 打开按钮操作：直接在新标签页打开该工具的前台页面。
 * 与「详情」抽屉的分工：抽屉看后台元数据，打开看用户实际看到的页面。
 */
function handleOpenPage(row) {
  const url = resolveToolUrl(row.toolRoute)
  if (!url) {
    proxy.$modal.msgWarning("该工具未配置前端访问路由")
    return
  }
  window.open(url, "_blank", "noopener,noreferrer")
}

/** 导出按钮操作 */
function handleExport() {
  proxy.download('api/qtool/info/export', {
    ...queryParams.value
  }, `info_${new Date().getTime()}.xlsx`)
}

getList()
</script>

<style scoped>
/* 图标列：图标与名称同一行展示，名称过长时省略 */
.tool-icon-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}
.tool-icon-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 图标选择器的下拉项：图标 + 名称 */
.icon-option {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
