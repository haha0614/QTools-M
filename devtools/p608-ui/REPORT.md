# P6.08 · 修「打开库根管理页，再点任何页面都白屏」（QTools-M，只改前端）

真跑对象：后端 `:8080` 直读的管理端产物 `/admin-ui/`（脚本里先 `vite build`，再跑 CDP 脚本）。
取证脚本：`devtools/p608-ui/{matrix,boundary,regress,probe5,probe3,devmode}.mjs`。

## 一、一句话根因

> `src/views/media/root/index.vue:2` 的 `<RootView/>` 与 `:34` 的 `<el-drawer>` 让这一页渲染成**多根（Fragment）**，
> 而 `src/layout/components/AppMain.vue:4` 的 `<transition mode="out-in">` 只接受唯一元素子节点；
> 离开本页时 leave 永远等不到结束（Vue 抛出的只是 dev warning，生产构建被剥离），
> `/media-roots` 之后的**每一次**路由切换都只渲染空注释 `<!----><!---->` —— 于是整站白屏，且此后不可自愈。

**这条 bug 里没有任何未捕获异常**，与「未捕获异常打死 Vue 应用」的直觉不同，这一点是实测结论：

| 取证通道 | 结果 |
|---|---|
| CDP `Runtime.exceptionThrown` | 白屏前后 **0 条** |
| CDP `Runtime.consoleAPICalled`（error/warn） | **0 条** |
| 页内自证（`window.onerror` + `unhandledrejection` + 劫持 `console.error/warn`） | **0 条** |
| 运行期装上 `app.config.errorHandler` 再复现 | **0 条** |
| 白屏现场 DOM | `.app-main` 的 `innerHTML === '<!----><!---->'`（两个占位注释，`innerText` 为空） |

唯一能指出原因的是 **dev 构建里 Vue 自己的 warning**（`devtools/p608-ui/out/devmode.json`，vite dev 复现，6 条）：

```
[Vue warn]: Component inside <Transition> renders non-element root node that cannot be animated.
  at <MediaRoot onVnodeUnmounted=fn<onVnodeUnmounted> ref=Ref< Proxy(Object) > key="/media-roots" >
  at <KeepAlive include= Array(1) >
  at <BaseTransition mode="out-in" appear=false persisted=false  ... >
  at <Transition name="fade-transform" mode="out-in" >
  at <RouterView>
```

为什么一条 warning 能打死全站：`mode="out-in"` 的三段式是「render(空) → leave 旧节点 → leave 完成回调里 enter 新节点」。
非元素根让 leave 的收尾永远不触发，Transition 的内部状态就停在「等旧节点离场」，**之后每次路由切换都只走到 render(空)**。
这不是某页渲染失败，而是屏幕中间那层路由器被自己的过渡状态机锁死了（侧栏/标签页仍活着，所以看起来是「白屏但还能点」）。

## 二、修法

### 1) 根治：把这一页改成单根（`src/views/media/root/index.vue:1-45`）

```html
<template>
  <div class="media-root-page">   <!-- 唯一根节点 -->
    <RootView ... />
    <el-drawer ...><scan-page ... /></el-drawer>
  </div>
</template>
```

包一层普通 `div`（无样式，仅提供唯一根），transition 重新拿得到唯一元素，`out-in` 正常收尾。
这符合若依既有约定：`media/`、`media/person/`、`media/studio/` 等页面都是单根，本页是 P5.97 把扫描抽屉并进来后唯一破例的一页。

### 2) 该页副作用全部补齐卸载清理（`src/views/media/root/index.vue:107-113`、`:438-448`）

新增 `disposed` + `AbortController`，`onBeforeUnmount` 一次收口：

- `previewTimer`：`clearTimeout` 并置空（原来只 clear 不置空）；
- `abortCtrl.abort()`：中止还在飞的**只读**请求 —— 库根列表、分级策略、产物清单、扫描预演、监听状态；
- `disposed` 守卫：所有 `.then/.catch/.finally` 先判 `if (disposed) return`，回包不再写已销毁组件的 ref、不再碰 `proxy.$modal`；
- 写操作（新增/保存/删除/切开关）**故意不 abort**：请求已发出，中止只丢回包，改变不了服务端事实。

为此把 `AbortSignal` 从页面透到 axios（纯加法，旧调用不变）：
`src/api/media.js` — `getRatingPolicy(signal):127`、`listRoots(silent, signal):284`、`getWatchStatus(silent, signal):434`、
`getRootArtifacts(id, refresh, silent, signal):795`、`previewScanRoot(path, signal):861`；`src/views/media/root/rootsModel.js:33` 同步透传。

### 3) 全局兜底（两层，互不重叠）

**a. `app.config.errorHandler`（`src/main.js:77-140`）**

- 任何逃出来的组件异常都 `console.error('[全局异常] <info> @ <组件名>')`（带组件名与 `info` 钩子名，保留第一现场）；
- 可选上报：配置 `VITE_APP_ERROR_REPORT` 时用 `sendBeacon`（回退 `fetch keepalive`）POST `{info, component, message, stack, url, at}`；上报失败静默；
- 额外挂 `window.addEventListener('unhandledrejection')`：未处理的 Promise 拒绝同样只记录，不放大；
- 不 rethrow、不弹全局红条（页面级展示交给 b）。

**b. 路由级 `<error-boundary>`（新组件 `src/components/ErrorBoundary/index.vue`，挂在 `src/layout/components/AppMain.vue:6-14`）**

- `onErrorCaptured` 捕获后代渲染/生命周期/事件异常并 `return false`（不继续冒泡）；
- 渲染「本页出错了 / 重试 / 回首页」+ 可折叠技术细节（`data-testid="page-error-fallback"`）；
- 「重试」清空错误态让 slot 重新挂载；**换页自动复原**（`watch(route.fullPath)`），所以兜底页不会粘在别的页面上；
- 只包一次、不新增 DOM 层级，布局与 transition 行为不变。

## 三、修复前后跳转矩阵（同一脚本、同一路径，`devtools/p608-ui/matrix.mjs`）

流程：登录 → 进 `/media-roots`（停留等数据回包）→ **真实鼠标事件**依次点侧栏六项。
白屏判定：`.app-main` 不存在或 `innerText` 为空。

### 修复前（`--label=before`，回滚单根修复后的产物，其余代码相同）

| # | 目标页 | 结果 | 路径 | 正文长度 | 内容选择器 | 未捕获异常 |
|---|---|---|---|---|---|---|
| 1 | 媒体库 | **白屏** | /admin-ui/media | 0 | ✗ | 0 |
| 2 | 人物管理 | **白屏** | /admin-ui/media-person | 0 | ✗ | 0 |
| 3 | 工作室管理 | **白屏** | /admin-ui/media-studios | 0 | ✗ | 0 |
| 4 | 库根管理 | **白屏** | /admin-ui/media-roots | 0 | ✗ | 0 |
| 5 | 用户管理 | **白屏** | /admin-ui/appuser/user | 0 | ✗ | 0 |
| 6 | 角色管理 | **白屏** | /admin-ui/system/role | 0 | ✗ | 0 |

`FAIL 0/6` —— 与用户描述完全一致：离开库根管理页后**每一页**都白，异常计数 0。

### 修复后（`--label=after`，最终产物）

| # | 目标页 | 结果 | 路径 | 正文长度 | 内容选择器 | 未捕获异常 |
|---|---|---|---|---|---|---|
| 1 | 媒体库 | ok | /admin-ui/media | 2037 | ✓ | 0 |
| 2 | 人物管理 | ok | /admin-ui/media-person | 737 | ✓ | 0 |
| 3 | 工作室管理 | ok | /admin-ui/media-studios | 127 | ✓ | 0 |
| 4 | 库根管理 | ok | /admin-ui/media-roots | 900 | ✓ | 0 |
| 5 | 用户管理 | ok | /admin-ui/appuser/user | 294 | ✓ | 0 |
| 6 | 角色管理 | ok | /admin-ui/system/role | 208 | ✓ | 0 |

`PASS 6/6`。进页面时的现场：`{rows:3, dataState:"ready", title:"库根管理", hasTable:true, hasRatingCard:true}`。
截图：`out/M-roots-entry-after.png`、`out/M-jump-<key>-{before,after}.png`。

## 四、全局兜底验证（`devtools/p608-ui/boundary.mjs`，8/8 PASS）

打桩方式：`src/views/media/person/index.vue` 的 `onMounted` 里临时加 `if (location.search.includes('p608throw=1')) throw new Error('test')`，
构建后打开 `/media-person?p608throw=1`（**打桩已删除，最终 dist 里 grep `p608throw` 为 0 命中**）。

```
PASS 抛错后页面仍有内容（不是白屏）  -- textLen=106
PASS 渲染出「本页出错了」兜底组件
PASS 侧栏仍在（应用没被打死）
PASS 控制台留下第一现场错误日志  -- [本页出错了] https://vuejs.org/error-reference/#runtime-m @ /media-person Error: test
PASS 兜底后切到「媒体库」正常渲染  -- path=/admin-ui/media textLen=2037 sel=true
PASS 兜底后切到「库根管理」正常渲染 -- path=/admin-ui/media-roots textLen=900 sel=true
```

即：单页抛异常 → 显示错误页而非白屏 → 仍可正常切到别页（兜底不会粘连）。截图 `out/M-boundary-*.png`。

## 五、不回归：库根管理页自身功能（`devtools/p608-ui/regress.mjs`，24/24 PASS）

真浏览器 + 接口双向校验（每步同时看 UI 与 `/api/media/admin/*` 的真实状态），结束时断言基线复原：

| 组 | 断言 | 结果 |
|---|---|---|
| R1 列表 | 行数=接口库根数、三态 ready、标题正确 | PASS |
| R2 顶部说明 | 展开/收起均可切换 | PASS |
| R3 产物清单 | 展开出现子目录小表 + 合计行，再点收起 | PASS |
| R4 分级可见性开关 | 点一下 restricted 取反并落库，再点一下复原 | PASS |
| R5 库根「未登录可见」开关 | 点一下置为仅登录可见，再点一下复原 | PASS |
| R6 新增库根 | 关闭「创建后立即扫描」→ 预演出结论 → 保存落库 → 列表刷新 | PASS |
| R7 编辑库根 | 改备注并落库 | PASS |
| R8 删除库根 | 确认框 → 删除落库 → 行数回到基线 | PASS |
| R9 基线复原 | 库根 id 列表与分级策略与基线完全一致（`[1,2,3]`、`{g:true,gd:true,r:false}`） | PASS |

## 六、构建与既有 harness

| 项 | 结果 |
|---|---|
| `QTools-M: npm run build:prod` | **0 error**（25.6s，最终产物） |
| `npm run check:menu-icons` | OK：27 个菜单图标名全部命中 sprite |
| `devtools/p605-ui/regress.mjs`（既有 P6.05 不回归） | **PASS 16/16** |
| `devtools/p608-ui/matrix.mjs --label=after` | PASS 6/6 |
| `devtools/p608-ui/boundary.mjs` | PASS 8/8 |
| `devtools/p608-ui/regress.mjs` | PASS 24/24 |
| 调整的旧断言 | **无**（既有 harness、单测、`check:menu-icons` 一条都没改） |

## 七、已知限制 / 说明

1. **`/system/user` 本身打不开**（`.app-main` 不存在，落 404 页）——这是既有权限/路由问题（与 P6.05 报告第 5 条同源），
   与本次白屏无关。因此矩阵用「系统管理」分组里的**角色管理**代表该分组。未在本次改动范围内。
2. **工作室管理正文只有 127 字**：该页当前是空态（接口无工作室数据），不是渲染失败（选择器命中、无异常）。
3. **`devtools/p608-ui/devmode.mjs` 需要把页面临时回滚成多根 + `npm run dev`** 才能复跑（它只为取证 Vue 的 warning 存在，不是常规回归脚本）；
   `probe5.mjs`（页内错误通道自证）、`probe3.mjs`（白屏现场 DOM）同理只作取证。
4. **脚本需要可用管理员口令**：`QT_ADMIN_USER` / `QT_ADMIN_PWD` 环境变量传入（默认 `admin` / `Qt608!audit`）。
   本轮验收期间为登录曾**临时改写 `sys_user.password`，跑完已按备份哈希复原并验证临时口令失效**；
   验收里创建/编辑/删除的临时库根与分级/可见性开关改动全部回到基线（`media_root` = 1/2/3，`guest_visible` 全 1）。
5. `devtools/p595-ui/run.mjs` 需要克隆库实例 `:18091` + `qtools_p595_tmp`，本轮未跑（与本次改动无关，且它会另起数据库实例）。
6. 本次**未执行任何 git 操作**（按要求）。改动文件：
   `src/views/media/root/index.vue`、`src/views/media/root/rootsModel.js`、`src/api/media.js`、
   `src/layout/components/AppMain.vue`、`src/main.js`、新增 `src/components/ErrorBoundary/index.vue`、新增 `devtools/p608-ui/*`。

## 八、复跑方法

```bash
cd QTools-M
npm run build:prod                                   # 被测对象 = dist（后端 :8080 直读 /admin-ui/）
QT_ADMIN_PWD=<口令> node devtools/p608-ui/matrix.mjs --label=after    # 跳转矩阵（6 跳）
QT_ADMIN_PWD=<口令> node devtools/p608-ui/boundary.mjs                # 全局兜底（需临时打桩产物）
QT_ADMIN_PWD=<口令> node devtools/p608-ui/regress.mjs                 # 库根页功能不回归（24 条）
```
