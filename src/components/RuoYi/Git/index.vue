<template>
  <div>
    <svg-icon icon-class="github" @click="goto" />
  </div>
</template>

<script setup>
/* P6.193：原来指向若依源码仓库（gitee.com/y_project/RuoYi-Vue），改为本项目仓库。
   QTools-All 是外层仓库，里面挂 QTools（后端）/ QTools-M（管理端）/ QTools-C（站点）。 */
const url = ref('https://github.com/haha0614/QTools-All')

function goto() {
  window.open(url.value)
}
</script>
