# P6.05 · 管理端 / 站端弹窗溢出修复与真浏览器审计

真跑对象：`QTools-M/dist`（Spring 静态直读，`/admin-ui/`）+ `QTools-C/dist`（站点根）+ 真实后端 `:8080`。
审计脚本：`QTools-M/devtools/p605-ui/run.mjs`（管理端）、`QTools-C/devtools/p605-ui/run.mjs`（站端）、
`QTools-M/devtools/p605-ui/regress.mjs`（不回归）。三档视口：1600×900 / 1280×720 / 375×812。

## 一、全局样式改动（改动最小、逐弹窗不改组件）

### QTools-M `src/assets/styles/element-ui.scss`
```scss
.el-dialog:not(.is-fullscreen) {
  margin: 24px auto !important;       // 顶掉 Element 的 15vh 与各页面 top="5vh/6vh"
  max-height: calc(100vh - 48px);
  max-width: calc(100vw - 48px);      // 固定 width 弹窗在 375 下不再横向越界
  display: flex; flex-direction: column; overflow: hidden;
  > .el-dialog__header, > .el-dialog__footer { flex: 0 0 auto; }
  > .el-dialog__body { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; }
}
@media (max-width: 768px) { .el-dialog:not(.is-fullscreen) { margin: 12px auto !important;
  max-height: calc(100vh - 24px); max-width: calc(100vw - 24px); } }

.el-drawer { max-height: 100vh;
  > .el-drawer__header, > .el-drawer__footer { flex: 0 0 auto; }
  > .el-drawer__body { min-height: 0; overflow: auto; overscroll-behavior: contain; } }
```
### QTools-M `src/assets/styles/ruoyi.scss`
删掉 `.el-dialog:not(.is-fullscreen){margin-top:6vh!important}`（它会在 `@use` 顺序上盖掉上面的 `margin`，
是矮视口把 footer 顶出屏幕的直接原因之一），留注释指向新规则。

### QTools-C `src/styles/index.scss`
同一套 `.el-dialog`（限高 + 限宽 + header/footer 钉住 + body 滚）与 `.el-drawer` 规则。
站端其余弹窗是自绘遮罩面板（`.qt-auth-dialog` / `.pa-panel` / `.pba-panel` / `.md`），
原本就带 `max-height` + 内部滚动，实测已合规（见第三节），未改。

## 二、管理端逐弹窗审计（真浏览器，修前/修后）

「修前」= 在同一次打开状态里回注改动前的 CSS（等价回滚本次改动）后重量；「修后」= 当前产物。
判定：`rect.bottom <= innerHeight`、footer 主按钮 `elementFromPoint` 命中、body 滚到底最后一段可见。

| 弹窗 | 类型 | 修前 (bottom/innerH) | 修后 | 主按钮命中 | 截图 |
|---|---|---|---|---|---|
| 维护 | 抽屉 | 900/900 在视口内 | 900/900 | 无 footer | M-maint-drawer-1600x900-after.png |
| 内容自动分级 | dialog | **1307.2/900 溢出**（1280:1296.4/720，375:1727.2/812） | 876/900（1280:696，375:800） | ✓ | M-rating-classify-1600x900-before/after.png |
| 标签规范化 | dialog | **1108.4/900 溢出**（1280:1097.6，375:2010.7） | 876/900（1280:696，375:800） | ✓ | M-tag-normalize-1600x900-before/after.png |
| 扫描 / 导入媒体库 | 抽屉 | 900/900 | 900/900 | 无 footer | M-scan-drawer-1600x900-after.png |
| 重复文件 | 抽屉 | 900/900 | 900/900 | 无 footer | M-duplicates-drawer-1600x900-after.png |
| 标签管理 | dialog | **1160/900 溢出**（1280:1149.2，375:1238.7） | 876/900（1280:696，375:800） | ✓ | M-tag-manager-1600x900-before/after.png |
| 编辑策略 | dialog | 475/900 | 445/900 | ✓ | M-edit-policy-1600x900-after.png |
| 菜单新增（长表单） | dialog | 476/900，但 **375 下宽 680 > 375，确定按钮在视口外点不到** | 530/812，宽 351 | ✓（修前 MISS） | M-menu-edit-375x812-after.png |
| 新增库根 | dialog | 671.5/900 | 641.5/900 | ✓ | M-root-create-1600x900-after.png |
| 用户端用户详情 | dialog | 674.8/900 | 644.8/900 | ✓ | M-appuser-detail-1600x900-before/after.png |

三档视口全绿：`PASS 73/73`（10 个弹窗 × 3 视口 × 断言组），报告原文 `QTools-M/devtools/p605-ui/out/report.json`。
关键回归点：内容自动分级（用户截图那个）修前 1600 下底部到 1307px、1280 下到 1296px、375 下到 1727px，
footer 的「确认执行」完全在视口外、`elementFromPoint` 打不中；修后三档全部落在视口内、按钮可点、
body 滚到底能看到最后一条样例。

## 三、站端逐弹窗审计

| 弹窗 | 1600×900 | 1280×720 | 375×812 | 主按钮 | 截图 |
|---|---|---|---|---|---|
| 登录 / 注册悬浮窗（`.qt-auth-dialog__panel`） | 900/900 | 720/720 | 812/812 | ✓ hit | C-auth-dialog-*-after.png |
| 换头像（`.pa-panel`） | 810/900 | 648/720 | 730.8/812 | ✓ hit（取消） | C-avatar-dialog-*-after.png |
| 调背景（`.pba-panel`） | 701.1/900 | 609/720 | 643.1/812 | ✓ hit（保存） | C-bg-adjust-dialog-*-after.png |

`PASS 30/30`（3 弹窗 × 3 视口 × 4 断言）。三者修前即合规（原本就 `max-height: min(80~88vh, 720px)` +
flex 列 + 内部滚动，无 `overflow:hidden` 裁切），本次未改其组件样式，只补了全局 `el-dialog` / `el-drawer`。

## 四、构建与测试

| 项 | 结果 |
|---|---|
| `QTools-M: npm run build:prod` | ✓ 0 error（18.3s，产物已落到 `dist/`，即被测对象） |
| `QTools-C: npm run build` | ✓ 0 error（5.5s） |
| `QTools-C: scripts/ctrl-autohide.test.mjs` | PASS 78/78 |
| `QTools-C: scripts/offline-service.test.mjs` | PASS 57 / FAIL 0 |
| `QTools-C: scripts/playlist-count.test.mjs` | PASS 43/43 |
| `QTools-C: scripts/playlist-filter.test.mjs` | PASS 17/17 |
| 旧断言调整 | **无**（既有单测与 harness 断言一条未改） |

不回归（`regress.mjs`，M 16/16 + C 4/4）：
打开 → 关闭 → 再打开可用；`html.dark` 暗色下弹窗仍在视口内且 footer 按钮可点；
弹窗内表格横向滚动仍由 `el-table` 自己负责（未出现双层横向滚动条）；
抽屉/面板内部 `scrollTop` 在重排后保持（M 维护抽屉 160 → 160；C 头像面板 60 → 60）。

## 五、已知限制

1. **5 个管理端弹窗本机打不开**：`用户详情（抽屉）/ 分配角色 / 选择用户（top=5vh）/ 字典数据 / 操作日志详情`
   都在 `/system/*`、`/monitor/*` 页面上。审计用的是临时管理员账号（非 `user_id=1` 的超级管理员），
   后端 `getRouters` 对这些菜单子树没有注册到前端路由表，直接访问 `/admin-ui/system/user` 落到 RuoYi 404
   页（`getInfo`/`getRouters` 都是 200，菜单树也在，但前端路由未注册 —— 属既有权限/路由问题，
   与本次样式改动无关）。这 5 个弹窗都用同一个 `.el-dialog`，与已验证的 10 个走同一条全局规则。
2. **站端「播放列表管理」**（`.md`）与「大图查看」（`.lb`）自动化未能打开：
   前者需要先展开 `PlaylistFilter` 下拉再点「管理播放列表…」，CDP 合成点击（含
   `Input.dispatchMouseEvent` 真鼠标事件）下该下拉始终未展开；后者需要先进入某个相册才有
   `button.cell`。二者已静态核对：`.md{max-height:min(640px,calc(100vh-60px))}`、375 下
   `calc(100vh - 24px)`，`.md-side`/`.md-list` 均 `overflow-y:auto`，与本次策略一致、无裁切风险。
3. 修前数值是「回注旧 CSS」量出来的，不是翻旧产物截图；两者对同一 DOM 等价。
4. 审计用临时账号/角色（`p605audit`）跑完即删，生产库已复原（`users_left=0, roles_left=0`, admin 在位）。
