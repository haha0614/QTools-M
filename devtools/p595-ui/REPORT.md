# P5.95 管理端警告 —— 实测报告（QTools-M）

真浏览器实测（Chrome headless + CDP，零第三方依赖）。跑法：

```bash
node QTools-M/devtools/p595-ui/run.mjs      # 默认被测实例 http://127.0.0.1:18091
```

结果：**PASS 18/18**（`out/report.json`）。截图在 `out/*.png`。

## 1. 被测环境

- 被测页面：`http://127.0.0.1:18091/admin-ui/media-roots`（临时实例托管 QTools-M 构建产物）；
- 库：克隆库 `qtools_p595_tmp`，库根状态由本脚本用 `mysql` 直接改（**只改克隆库**）；
- 登录：真表单 + 真验证码（答案从 Redis `captcha_codes:<uuid>` 读，与 P5.78 的实测脚本同一套做法，不改任何配置）；
- 场景切换后重新 `Page.navigate` 让列表重新取数（`GET /api/media/admin/roots` 直读库，没有缓存）。

## 2. 断言与截图

| # | 场景 | 断言 | 截图 |
|---|---|---|---|
| A | 单内容根（`主库`）+ `guest_visible=0` | 顶部红色警告条存在，文案 = 「当前唯一的内容根已设为「未登录不可见」，未登录访客将看到空站点。若非本意，请打开「未登录可见」。」；边框色实测 `rgb(245, 108, 108)`；该行开关旁 1 个红色小警示图标；页面底部写着「何时才警告」的规则 | `out/admin-single-root-gv0-warning.png` |
| B | 点行内开关 → `guest_visible=1` | `PUT` 真落库（`select guest_visible` = 1）；警告条消失；行内图标消失 | `out/admin-single-root-gv1.png` |
| C | 两个内容根、只有其一 `guest_visible=0` | **不**显示警告、也**不**挂行内图标（访客仍看得到东西）；规则说明仍显示 | `out/admin-multi-root-one-hidden.png` |
| D | 两个内容根**全部** `guest_visible=0` | 警告文案变「全部 2 个内容根都已设为…」；两行各一个警示图标 | `out/admin-multi-root-all-hidden.png` |

## 3. 规则（只在这三行里）

```js
const contentRoots = rows.filter(r => kind === 'root')          // 产物根 / 回收站根不参与
const hiddenWarning = contentRoots.length > 0 &&
                      contentRoots.every(r => r.guestVisible === false)
```

- 单内容根时，它就是「唯一内容根被关掉」→ 必警告；
- 多内容根时，只要还有一个可见的根就不警告（访客仍看得到内容，提示只会变成噪音），全都关掉才警告；
- 顶部警告与行内图标用**同一个**判定（`warnOnRow` 依赖 `hiddenWarning`），不会出现「有图标没警告」这种自相矛盾。

## 4. 已知限制

1. `kind` 的判定是大小写不敏感的字符串比较（与后端 `guestVisibleOf` / 扫描器口径一致）；
2. `guest_visible` 缺省值按「可见」处理（历史行 / 未迁移库为 `null`）——不误报；
3. 警告只看库根登记行，不看内容是否真的非空：一个**空**内容根关掉可见也不会造成空站点，但仍会警告
   （宁可多喊一声；要精确到「这个根有没有内容」需要额外计数请求，未做）。
