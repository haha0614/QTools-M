<template>
  <el-drawer title="工具信息详情" v-model="visible" direction="rtl" size="60%" append-to-body :before-close="handleClose" class="detail-drawer">
    <div v-loading="loading" class="drawer-content">
      <h4 class="section-header">基本信息</h4>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">工具名称：</label>
            <span class="info-value plaintext">
              {{ info.toolName }}
            </span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">工具描述：</label>
            <span class="info-value plaintext">
              {{ info.toolDesc }}
            </span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">前端访问路由：</label>
            <span class="info-value plaintext">
              {{ info.toolRoute }}
            </span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">图标名称：</label>
            <span class="info-value plaintext">
              {{ info.icon }}
            </span>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="20" class="mb8">
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">显示顺序：</label>
            <span class="info-value plaintext">
              {{ info.sort }}
            </span>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="info-item">
            <label class="info-label">状态：</label>
            <span class="info-value plaintext">
              {{ info.status }}
            </span>
          </div>
        </el-col>
      </el-row>
    </div>
  </el-drawer>
</template>

<script setup name="InfoViewDrawer">
import { getInfo } from '@/api/qtool/info'


const visible = ref(false)
const loading = ref(false)
const info = reactive({})

const open = async (id) => {
  visible.value = true
  loading.value = true
  try {
    const res = await getInfo(id)
    Object.assign(info, res.data || {})
  } catch (error) {
    console.error('获取工具信息信息失败:', error)
  } finally {
    loading.value = false
  }
}

function handleClose() {
  visible.value = false
  Object.keys(info).forEach(key => delete info[key])
}

defineExpose({ open })
</script>
