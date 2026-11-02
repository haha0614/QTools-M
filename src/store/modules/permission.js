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
            const sidebarRoutes = filterAsyncRouter(sdata)
            const rewriteRoutes = filterAsyncRouter(rdata, false, true)
            uniquifyRouteNames(rewriteRoutes)
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

/**
 * P6.109：给动态路由去重名字。
 *
 * <p>后端 getRouters 用 {@code capitalize(path)} 生成路由名，于是不同父菜单下**同名叶子**
 * 会撞车。实例：系统管理 → 用户管理（/system/user）与 用户端 → 用户管理（/appuser/user）
 * 路径都叫 user，两个路由的 name 都是 User；Vue Router 4 的 addRoute 遇到同名会**替换**，
 * 后注册的 /appuser/user 顶掉了 /system/user —— 结果点"系统管理 → 用户管理"直接 404，
 * 而 /appuser/user 正常。</p>
 *
 * <p>这里只改名字、不动路径：撞名时用父级路径拼一个新名字，并打一条 warn，
 * 方便以后发现菜单配置撞车。</p>
 */
function uniquifyRouteNames(routes, parentPath = '') {
  const seen = new Set()
  const walk = (list, parent) => {
    list.forEach(r => {
      if (r.name) {
        let name = r.name
        if (seen.has(name)) {
          const suffix = (parent ? parent + '-' : '') + r.path
          name = 'R' + String(suffix).replace(/[^A-Za-z0-9]+/g, '')
          console.warn('[router] 路由名重复：' + r.name + ' → ' + name + '（路径 ' + suffix + '）')
          r.name = name
        }
        seen.add(name)
      }
      if (r.children && r.children.length) {
        walk(r.children, parent ? parent + '-' + r.path : r.path)
      }
    })
  }
  walk(routes, parentPath)
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
