export default {
  /**
   * 网页标题
   */
  title: import.meta.env.VITE_APP_TITLE,

  /**
   * 侧边栏主题 深色主题theme-dark，浅色主题theme-light
   */
  /* P6.176：主色必须在这里给 —— 运行时 handleThemeStyle() 会用它把 --el-color-primary
     写成行内样式，覆盖 :root 里的 #2563eb。之前默认是 #409EFF（Element 老蓝），
     于是所有 var(--el-color-primary) 渲染出来都是"另一个蓝"。 */
  theme: '#2563eb',
  sideTheme: 'theme-light',

  /**
   * 是否系统布局配置
   */
  showSettings: true,

  /**
   * 菜单导航模式 1、纯左侧 2、混合（左侧+顶部） 3、纯顶部
   */
  navType: 1,

  /**
   * 是否显示 tagsView
   */
  tagsView: true,

  /**
   * 持久化标签页
   */
  tagsViewPersist: false,

  /**
   * 显示页签图标
   */
  tagsIcon: false,

  /**
   * 标签页样式：card 卡片（默认）、chrome 谷歌浏览器风格
   */
  tagsViewStyle: 'card',

  /**
   * 是否固定头部
   */
  fixedHeader: true,

  /**
   * 是否显示logo
   */
  sidebarLogo: true,

  /**
   * 是否显示动态标题
   */
  dynamicTitle: false,

  /**
   * 是否显示底部版权
   */
  footerVisible: false,

  /**
   * 底部版权文本内容
   */
  footerContent: 'Copyright © 2026 青兔工具箱 · 管理后台 | Powered by RuoYi'
}
