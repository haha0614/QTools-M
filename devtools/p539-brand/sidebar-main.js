import 'element-plus/dist/index.css'
import '@/assets/styles/index.scss'
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import Logo from '@/layout/components/Sidebar/Logo.vue'

for (const [id, collapse] of [['expanded', false], ['collapsed', true]]) {
  createApp({ render: () => h(Logo, { collapse }) }).use(createPinia()).mount('#' + id)
}
