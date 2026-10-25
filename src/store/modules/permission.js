import auth from '@/plugins/auth'
import router, { constantRoutes, dynamicRoutes } from '@/router'
import { getRouters } from '@/api/menu'
import Layout from '@/layout/index'
import ParentView from '@/components/ParentView'
import InnerLink from '@/layout/components/InnerLink'

// 匹配views里面所有的.vue文件
const modules = import.meta.glob('./../../views/**/*.vue')

const usePermissionStore = defineStore(
  'permission',
  {
    state: () => ({
      routes: [],
      addRoutes: [],
      defaultRoutes: [],
      topbarRouters: [],
      sidebarRouters: []
    }),
    actions: {
      setRoutes(routes) {
        this.addRoutes = routes
        this.routes = constantRoutes.concat(routes)
      },
      setDefaultRoutes(routes) {
        this.defaultRoutes = constantRoutes.concat(routes)
      },
      setTopbarRoutes(routes) {
        this.topbarRouters = routes
      },
      setSidebarRouters(routes) {
        this.sidebarRouters = routes
      },
      generateRoutes(roles) {
        return new Promise(resolve => {
          // 向后端请求路由数据
          getRouters().then(res => {
            const sdata = JSON.parse(JSON.stringify(res.data))
            const rdata = JSON.parse(JSON.stringify(res.data))
            const defaultData = JSON.parse(JSON.stringify(res.data))
            // 人物管理（P3-B）：菜单表里没有这一页，前端在「媒体库」的同一父级下补一条同级菜单。
            // 三份副本都补，侧栏 / 可访问路由 / 顶栏三处保持同源；不写库、不改后端菜单。
            injectPersonMenu(sdata)
            injectPersonMenu(rdata)
            injectPersonMenu(defaultData)
            const sidebarRoutes = filterAsyncRouter(sdata)
            const rewriteRoutes = filterAsyncRouter(rdata, false, true)
            const defaultRoutes = filterAsyncRouter(defaultData)
            const asyncRoutes = filterDynamicRoutes(dynamicRoutes)
            asyncRoutes.forEach(route => { router.addRoute(route) })
            this.setRoutes(rewriteRoutes)
            this.setSidebarRouters(constantRoutes.concat(sidebarRoutes))
            this.setDefaultRoutes(sidebarRoutes)
            this.setTopbarRoutes(defaultRoutes)
            resolve(rewriteRoutes)
          })
        })
      }
    }
  })

// 遍历后台传来的路由字符串，转换为组件对象
function filterAsyncRouter(asyncRouterMap, lastRouter = false, type = false) {
  return asyncRouterMap.filter(route => {
    if (type && route.children) {
      route.children = filterChildren(route.children)
    }
    if (route.component) {
      // Layout ParentView 组件特殊处理
      if (route.component === 'Layout') {
        route.component = Layout
      } else if (route.component === 'ParentView') {
        route.component = ParentView
      } else if (route.component === 'InnerLink') {
        route.component = InnerLink
      } else {
        route.component = loadView(route.component)
      }
    }
    if (route.children != null && route.children && route.children.length) {
      route.children = filterAsyncRouter(route.children, route, type)
    } else {
      delete route['children']
      delete route['redirect']
    }
    return true
  })
}

function filterChildren(childrenMap, lastRouter = false) {
  var children = []
  childrenMap.forEach(el => {
    el.path = lastRouter ? lastRouter.path + '/' + el.path : el.path
    if (el.children && el.children.length && el.component === 'ParentView') {
      children = children.concat(filterChildren(el.children, el))
    } else {
      children.push(el)
    }
  })
  return children
}

// 动态路由遍历，验证是否具备权限
export function filterDynamicRoutes(routes) {
  const res = []
  routes.forEach(route => {
    if (route.permissions) {
      if (auth.hasPermiOr(route.permissions)) {
        res.push(route)
      }
    } else if (route.roles) {
      if (auth.hasRoleOr(route.roles)) {
        res.push(route)
      }
    }
  })
  return res
}

/* ---------------------------------------------------------------- 人物管理菜单（P3-B） */
/* 后端 sys_menu 未收录「人物管理」，又要求它出现在媒体库旁边（同一侧栏分组），因此在这里
   往原始路由树补一条同级子路由：找到 component 为 media/index 的那一层，追加 person 兄弟节点。
   组件路径 media/person/index 对应 views/media/person/index.vue（loadView 按 views 目录匹配）。
   找不到媒体库（菜单被裁掉 / 改名）时退化成顶层独立分组，保证页面仍可达。 */
const PERSON_MENU_NODE = () => ({
  path: 'media-person',
  component: 'media/person/index',
  meta: { title: '人物管理', icon: 'peoples', noCache: false },
  alwaysShow: false
})

function injectPersonMenu(routes) {
  if (!Array.isArray(routes)) return
  let injected = false
  const walk = (list) => {
    if (injected || !Array.isArray(list)) return
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      if (Array.isArray(item.children) && item.children.length) {
        if (item.children.some(child => child && (child.component === 'media/index' || child.path === 'media'))) {
          item.children.push(PERSON_MENU_NODE())
          injected = true
          return
        }
        walk(item.children)
        if (injected) return
      }
    }
  }
  walk(routes)
  if (!injected) {
    routes.push({
      path: 'media-person',
      component: 'Layout',
      hidden: false,
      children: [{ path: 'index', component: 'media/person/index', meta: { title: '人物管理', icon: 'peoples' } }]
    })
  }
}

export const loadView = (view) => {
  let res
  for (const path in modules) {
    const dir = path.split('views/')[1].split('.vue')[0]
    if (dir === view) {
      res = () => modules[path]()
    }
  }
  return res
}

export default usePermissionStore
