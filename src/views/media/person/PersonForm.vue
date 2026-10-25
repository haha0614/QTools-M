<!--
  PersonForm.vue —— 人物管理页的表单体（P5-C：基本 / 身体 / 事业 / 社交 四组字段）
  纯展示：v-model 绑定父组件的 form 对象，自身不发请求、不校验、不保存。
  拆出来的理由有两条：
    1) 人物管理页的对话框 + 保存流程留在 index.vue，表单可单独渲染（SSR 证据里直接断言字段）；
    2) 字段分区与移动端滚动规则集中在一处，后续加字段只改这里。
  字段名与后端 persons 接口一致（snake_case）：measurements / career_start / career_end /
  tattoos / piercings / ethnicity / hair_color / eye_color / height_cm / weight_kg /
  fake_boobs / nationality / twitter / instagram。
-->
<template>
  <el-form :model="model" label-width="86px" class="person-form">
    <p class="person-group">基本</p>
    <el-form-item label="名称" required>
      <el-input v-model="model.name" maxlength="120" show-word-limit placeholder="人物名（与目录 / 站内分组一致）"
        @keyup.enter="emit('enter')" />
    </el-form-item>
    <el-form-item label="别名">
      <el-input v-model="model.alias" maxlength="120" placeholder="选填，多个别名用 / 分隔" />
    </el-form-item>
    <el-form-item label="性别">
      <el-select v-model="model.gender" placeholder="未设置" clearable filterable allow-create style="width: 100%">
        <el-option label="女" value="女" />
        <el-option label="男" value="男" />
        <el-option label="其他" value="其他" />
      </el-select>
    </el-form-item>
    <el-form-item label="备注">
      <el-input v-model="model.remark" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="选填" />
    </el-form-item>

    <p class="person-group">身体</p>
    <el-form-item label="身高 / 体重">
      <div class="person-pair">
        <el-input-number v-model="model.height_cm" :min="0" :max="300" :precision="0" controls-position="right"
          class="person-num" />
        <span class="person-unit">cm</span>
        <el-input-number v-model="model.weight_kg" :min="0" :max="500" :precision="1" controls-position="right"
          class="person-num" />
        <span class="person-unit">kg</span>
      </div>
    </el-form-item>
    <el-form-item label="三围">
      <el-input v-model="model.measurements" maxlength="60" placeholder="选填，如 90-60-90" />
    </el-form-item>
    <el-form-item label="族裔">
      <el-input v-model="model.ethnicity" maxlength="60" placeholder="选填，如 亚洲 / 白人" />
    </el-form-item>
    <el-form-item label="发色 / 瞳色">
      <div class="person-pair">
        <el-input v-model="model.hair_color" maxlength="40" placeholder="发色" class="person-num" />
        <el-input v-model="model.eye_color" maxlength="40" placeholder="瞳色" class="person-num" />
      </div>
    </el-form-item>
    <el-form-item label="国籍">
      <el-input v-model="model.nationality" maxlength="60" placeholder="选填，如 日本" />
    </el-form-item>
    <el-form-item label="纹身 / 穿孔">
      <div class="person-pair">
        <el-input v-model="model.tattoos" maxlength="120" placeholder="纹身（有 / 无 / 部位）" class="person-num" />
        <el-input v-model="model.piercings" maxlength="120" placeholder="穿孔（有 / 无 / 部位）" class="person-num" />
      </div>
    </el-form-item>
    <el-form-item label="假胸">
      <el-switch v-model="model.fake_boobs" active-text="是" inactive-text="否（或未填）" />
    </el-form-item>

    <p class="person-group">事业</p>
    <el-form-item label="出道 / 引退">
      <div class="person-pair">
        <el-input-number v-model="model.career_start" :min="1900" :max="2200" :precision="0" controls-position="right"
          class="person-num" />
        <el-input-number v-model="model.career_end" :min="1900" :max="2200" :precision="0" controls-position="right"
          class="person-num" />
      </div>
    </el-form-item>

    <p class="person-group">社交</p>
    <el-form-item label="Twitter">
      <el-input v-model="model.twitter" maxlength="120" placeholder="选填，账号或完整链接" />
    </el-form-item>
    <el-form-item label="Instagram">
      <el-input v-model="model.instagram" maxlength="120" placeholder="选填，账号或完整链接" />
    </el-form-item>
  </el-form>
</template>

<script setup>
const props = defineProps({
  /** 父组件的 form 对象（直接双向绑定，字段名与后端 persons 接口一致） */
  model: { type: Object, required: true }
})
const emit = defineEmits(['enter'])
</script>

<style scoped>
/* 表单分区标题：纯分隔用，与列表里的 el-tag 视觉区分 */
.person-group {
  margin: 4px 0 10px;
  padding: 0 0 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  letter-spacing: 0.04em;
}

.person-pair {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.person-num {
  flex: 1 1 120px;
  min-width: 100px;
}

.person-unit {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* 四组字段较长：高度受限时可滚动，移动端不撑破视口 */
.person-form {
  max-height: min(62vh, 620px);
  overflow-y: auto;
  padding-right: 6px;
}
</style>
