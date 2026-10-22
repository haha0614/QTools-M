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
          v-hasPermi="['tool:info:add']"
        >新增</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['tool:info:edit']"
        >修改</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['tool:info:remove']"
        >删除</el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Download"
          @click="handleExport"
          v-hasPermi="['tool:info:export']"
        >导出</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table v-loading="loading" :data="infoList" @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column label="工具ID" align="center" prop="id" />
      <el-table-column label="工具名称" align="center" prop="toolName" />
      <el-table-column label="工具描述" align="center" prop="toolDesc" />
      <el-table-column label="前端访问路由" align="center" prop="toolRoute" />
      <el-table-column label="图标名称" align="center" prop="icon" />
      <el-table-column label="显示顺序" align="center" prop="sort" />
      <el-table-column label="状态" align="center" prop="status" />
      <el-table-column label="操作" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="View" @click="handleViewData(scope.row)" v-hasPermi="['tool:info:query']">详情</el-button>
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['tool:info:edit']">修改</el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['tool:info:remove']">删除</el-button>
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
            <el-form-item label="图标名称" prop="icon">
              <el-input v-model="form.icon" placeholder="请输入图标名称" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="显示顺序" prop="sort">
              <el-input v-model="form.sort" placeholder="请输入显示顺序" />
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

const { proxy } = getCurrentInstance()

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
    status: null,
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

/** 导出按钮操作 */
function handleExport() {
  proxy.download('tool/info/export', {
    ...queryParams.value
  }, `info_${new Date().getTime()}.xlsx`)
}

getList()
console.log("111")
</script>
