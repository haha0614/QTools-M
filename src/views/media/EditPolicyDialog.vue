<template>
  <!-- 站端编辑策略：三档单选 + 每档说明 + 公网提示。
       从 index.vue（原 4871 行）拆出来，自身读/写策略，父页面只负责开关。 -->
  <el-dialog
    :model-value="modelValue"
    title="编辑策略"
    width="min(600px, 94vw)"
    append-to-body
    @update:model-value="v => emit('update:modelValue', v)"
    @open="load"
  >
    <div v-loading="loading" class="policy-box">
      <p class="policy-lead">决定站端访客能对媒体库做什么。保存后访客刷新页面即生效。</p>
      <el-radio-group v-model="form.level" class="policy-group">
        <div
          v-for="opt in POLICY_OPTIONS"
          :key="opt.value"
          class="policy-item"
          :class="{ 'is-on': form.level === opt.value }"
          @click="form.level = opt.value"
        >
          <el-radio :value="opt.value">{{ opt.label }}</el-radio>
          <span class="policy-desc">{{ opt.desc }}</span>
        </div>
      </el-radio-group>
      <p class="policy-warn">若把本实例挂在公网做演示，请选「本地编辑」或「禁止编辑」，否则陌生人可修改你的媒体库</p>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取 消</el-button>
      <el-button type="primary" :loading="saving" @click="submit" v-hasPermi="['media:admin:edit']">保 存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { getEditPolicy, setEditPolicy } from '@/api/media'
import { POLICY_OPTIONS, policyLabel } from './policyOptions'
import { errorText } from '@/utils/errorText'

defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue', 'saved'])

const { proxy } = getCurrentInstance()

const loading = ref(false)
const saving = ref(false)
const form = reactive({ level: 'full' })

/** 打开时读一次当前策略；读不到就按「完全编辑」（与后端缺省一致） */
function load() {
  loading.value = true
  getEditPolicy().then(res => {
    const level = res && res.level ? res.level : ''
    form.level = POLICY_OPTIONS.some(opt => opt.value === level) ? level : 'full'
  }).catch(err => {
    form.level = 'full'
    proxy.$modal.notifyWarning({
      title: '编辑策略读取失败',
      message: (errorText(err) || '接口未就绪') + '，当前按「完全编辑」显示',
      duration: 8000
    })
  }).finally(() => {
    loading.value = false
  })
}

function submit() {
  if (saving.value) return
  saving.value = true
  setEditPolicy(form.level).then(() => {
    proxy.$modal.msgSuccess('编辑策略已保存：' + policyLabel(form.level) + '（访客刷新页面后生效）')
    emit('saved', form.level)
    emit('update:modelValue', false)
  }).catch(err => {
    proxy.$modal.notifyError({
      title: '保存编辑策略失败',
      message: errorText(err) || '请求失败，请查看后端日志',
      duration: 8000
    })
  }).finally(() => {
    saving.value = false
  })
}
</script>

<style scoped>
.policy-box { min-height: 150px; }
.policy-lead { margin: 0 0 10px; font-size: 13px; color: var(--el-text-color-regular); }
.policy-group { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.policy-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  transition: border-color 0.12s, background 0.12s;
}
.policy-item.is-on { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.policy-desc { padding-left: 24px; font-size: 12px; line-height: 1.5; color: var(--el-text-color-secondary); }
.policy-warn {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 1.6;
}
</style>
