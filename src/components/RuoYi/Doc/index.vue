<template>
  <div>
    <svg-icon icon-class="question" @click="goto" />
  </div>
</template>

<script setup>
/* P6.193：原来指向若依官网（doc.ruoyi.vip），改为本项目文档目录。
   文档实际放在内层仓库 QTools 的 doc/ 下（例：后台视觉规范.md）。 */
const url = ref('https://github.com/haha0614/QTools/tree/main/doc')

function goto() {
  window.open(url.value)
}
</script>
