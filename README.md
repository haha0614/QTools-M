# 青兔工具箱 · 管理后台（QTools-M）

> 一句话定位：基于若依 RuoYi-Vue3 的 QTools 后台管理端，产物由后端**单端口托管在 `/admin-ui/`**，内置**媒体库管理页**。

## 简介

本仓库是「青兔工具箱（QTools）」的**后台管理端前端工程**，上游为 [RuoYi-Vue3](https://gitee.com/y_project/RuoYi-Vue) 3.9.2（Vue 3 + Vite 6 + Element Plus），标题「青兔工具箱 · 管理后台」（品牌名 + 职能后缀），`package.json` 的 `name` 为 `qtools-m`。

相对上游，本仓库除了品牌与本地开发安全调整外，**新增了一个完整的媒体库管理页**（`src/views/media/index.vue` + `src/api/media.js`），用于管理后端 `qtools-media` 模块索引的视频 / 相册 / 图片：统计、分类筛选、隐藏、软删与回收站、彻底删除、人物归属、重建索引与缩略图等。

它服务于 QTools 后端，模块构成如下：

| 工程 | 角色 | 与本仓库的关系 |
| --- | --- | --- |
| **QTools** | 后端（Spring Boot 3.5.16 + 若依 3.9.2，端口 `8080`） | 提供登录、菜单权限、`/api/media/admin/**` 接口，并在生产环境**托管本仓库的 `dist` 产物** |
| **QTools-C** | 前台用户站（Vue 3 + Vite，dev 端口 `5173`） | 同域另一套 SPA，与本管理端互不依赖 |
| **QTools-M** | 管理后台（本项目） | — |

菜单与按钮权限**由后端 `sys_menu` 表下发**（若依动态路由），所以新增页面光有 `.vue` 文件不会出现在侧边栏里，必须导入菜单 SQL，详见「与后端的集成」。

> 注意：**C 端用户与管理员是两套完全隔离的身份体系**。`/api/app/**` 面向 C 端用户，`/api/media/admin/**` 等管理接口面向若依登录态的管理员；两边的令牌、权限、登录入口都不通用。

## 相关仓库

| 仓库 | 说明 | 地址 |
| --- | --- | --- |
| **QTools** | 后端服务（Spring Boot 3.5.16 + 若依 3.9.2，端口 8080） | https://github.com/haha0614/QTools |
| **QTools-C** | 前台用户站（Vue 3 + Vite，dev 端口 5173） | https://github.com/haha0614/QTools-C |
| **QTools-M** | 管理后台（本项目，基于 RuoYi-Vue3 3.9.2） | https://github.com/haha0614/QTools-M |

## 功能一览

| 模块 | 说明 |
| --- | --- |
| **媒体库管理** | **本仓库新增**：视频 / 相册 / 图片三视图、占用统计、关键词与分类/编码筛选、隐藏与取消隐藏、软删入回收站、回收站统计与恢复、彻底删除、相册人物归属、重建索引与重建缩略图（带进度轮询）。菜单挂在「系统工具」下，路由 `/tool/media` |
| 系统管理 | 用户、角色、菜单、部门、岗位、字典、参数、通知公告（若依自带） |
| 系统监控 | 在线用户、定时任务、操作日志、登录日志、缓存监控、服务监控、连接池监视（Druid）（若依自带） |
| 系统工具 | 表单构建、代码生成、系统接口（若依自带） |
| 登录 / 首页 / 个人中心 | 若依自带（品牌文案已改为青兔工具箱 · 管理后台） |
| **工具列表（`tool_info`）** | ⚠️ **仍无管理页面**，后台看不到、也改不了工具数据 |
| **访问埋点（`tool_visit`）** | ⚠️ **仍无管理页面**，无访问量统计视图 |

> **关于 `tool_info` / `tool_visit`**：这两张表的数据由后端 `qtools-tool` 模块提供，`src/views` 与 `src/api` 下**没有**对应的页面或接口模块（仅在首页文案里提到表名）。目前只能通过数据库或后端接口直接查看，需要时请自行基于若依开发页面并导入菜单 SQL。

媒体库管理页依赖的后端接口全部在 `/api/media/admin/**`（需认证，按 `media:admin:*` 权限校验）：

| 权限标识 | 覆盖接口 |
| --- | --- |
| `media:admin:list` | `GET /videos`、`/albums`、`/photos`、`/detail/*`、`/people`、`/stats` |
| `media:admin:edit` | `PATCH /hidden/*`、`PATCH /album/*/person`、`POST /restore/*` |
| `media:admin:remove` | `DELETE /{kind}/{id}`（软删） |
| `media:admin:scan` | `POST /scan`、`GET /scan/latest`、`/scan/{jobId}` |

后端为前台工具站提供的两个匿名接口（**由 QTools-C 直连调用，与管理端无关**）：`GET /api/toolInfo/list`（工具列表）、`POST /api/toolVisit/add`（访问埋点上报）。

## 技术栈

版本取自 `package.json`：

| 类别 | 依赖 | 版本 |
| --- | --- | --- |
| 框架 | vue | 3.5.26 |
| 路由 | vue-router | 4.6.4 |
| 构建 | vite | 6.4.1 |
| 构建插件 | @vitejs/plugin-vue | 5.2.4 |
| 压缩插件 | vite-plugin-compression | 0.5.1（生产已关闭，见下） |
| UI 组件库 | element-plus | 2.13.1 |
| 图标 | @element-plus/icons-vue | 2.3.2 |
| 状态管理 | pinia | 3.0.4 |
| 组合式工具 | @vueuse/core | 14.1.0 |
| HTTP | axios | 1.13.2 |
| 图表 | echarts | 5.6.0 |
| 富文本 | @vueup/vue-quill | 1.2.0 |
| 样式 | sass-embedded | 1.97.2 |
| 按需自动导入 | unplugin-auto-import | 0.18.6 |
| 其他 | js-cookie / jsencrypt / nprogress / file-saver / fuse.js / js-beautify / clipboard / vue-cropper / vuedraggable | 见 `package.json` |

## 目录结构

```text
QTools-M
├─ vite/                 # Vite 插件集合（自动导入、SVG 图标、压缩等）
├─ vite.config.js        # base=/admin-ui/、dev 端口 5174、/dev-api 代理、watch 忽略临时目录
├─ index.html            # 入口 HTML，标题取 %VITE_APP_TITLE%，favicon 用 data: 占位
├─ .env.development      # 开发：VITE_APP_BASE_API = '/dev-api'
├─ .env.production       # 生产：VITE_APP_BASE_API = ''（同源）、VITE_BUILD_COMPRESS = ''（关闭预压缩）
├─ .env.staging          # 预发环境变量
├─ bin/                  # Windows 批处理脚本（build / package / run-web）
├─ html/ie.html          # 低版本 IE 提示页
├─ public/               # 静态资源
├─ package-lock.json     # npm 锁文件（本工程提交，保证依赖可复现）
└─ src
   ├─ api/               # 接口封装：login、menu、system/*、monitor/*、tool/gen
   │  └─ media.js        # ★ 媒体库接口（BASE = '/api/media/admin'）
   ├─ assets/            # 图标、图片、logo、全局样式（styles）
   ├─ components/        # 全局通用组件：Pagination、DictTag、Editor、FileUpload、
   │                     #   ImageUpload/ImagePreview、RightToolbar、Crontab、iFrame 等
   ├─ directive/         # 自定义指令：common、permission（v-hasPermi / v-hasRole）
   ├─ layout/            # 后台整体布局（侧边栏、顶栏、标签页、设置抽屉）
   ├─ plugins/           # 全局挂载方法：auth、cache、download、modal、tab
   ├─ router/            # 路由定义（静态路由；业务菜单由后端动态下发）
   ├─ store/             # Pinia 状态：modules（app、user、permission、dict、tagsView…）
   ├─ utils/             # 工具方法：request、auth、permission、dict、ruoyi、generator…
   ├─ views/             # 页面
   │  ├─ index.vue       # 首页（QTools 说明与版本信息）
   │  ├─ media/          # ★ 媒体库管理
   │  │  └─ index.vue    #   单文件页面（约 42 KB，1110 行）：统计/筛选/回收站/扫描进度
   │  ├─ system/         # 系统管理：user、role、menu、dept、post、dict、config、notice
   │  ├─ monitor/        # 系统监控：online、job、operlog、logininfor、cache、server、druid
   │  ├─ tool/           # 系统工具：build（表单构建）、gen（代码生成）、swagger（系统接口）
   │  ├─ error/          # 错误页（401/404）
   │  └─ redirect/       # 路由重定向中转页
   ├─ App.vue            # 根组件
   ├─ main.js            # 应用入口
   ├─ permission.js      # 路由守卫（登录校验、动态路由注入）
   └─ settings.js        # 界面设置（标题、主题、标签页、底部版权文案等）
```

## 快速开始

### 前置条件

- **Node.js 18+**（Vite 6 要求）与 npm
- 后端 **QTools** 已在 `http://localhost:8080` 运行（dev 代理的目标）
- 后端依赖（默认值，见后端 `application*.yml`）：
  - **MySQL 8**，端口 **3307**（便携版），库名 `qtools`
  - **Redis**，端口 **6379**
- 数据库表由后端的 SQL 脚本初始化；媒体库菜单需要额外导入 `doc/media-menu.sql`（见「与后端的集成」）

### 安装与启动

```bash
npm install
npm run dev            # http://localhost:5174
```

- 开发端口是 **5174**，且 `strictPort: true`——端口被占用时**直接启动失败**，不会静默换号。
- `server.open = true`，启动后会自动打开浏览器。
- 默认只监听 `localhost`，同网段的其它机器访问不到（见「常见问题」）。

### 登录

浏览器访问 `http://localhost:5174`，使用若依默认管理员账号登录：

- 账号：`admin`
- 密码：若依默认初始值 `admin123`（**必须修改**，见下方提示）

> ⚠️ **首次登录后请立即修改管理员密码**。仓库是公开的，若依默认口令人人皆知；改成强口令后再对外使用。
>
> 登录页的验证码由后端提供：管理端请求 `/dev-api/captchaImage`，经代理转发到后端的 `/captchaImage`。**后端未启动时验证码是空白的，也登录不了。**

### 构建与预览

```bash
npm run build:prod     # 生产构建（VITE_APP_ENV=production → base=/admin-ui/），产物在 dist/
npm run build:stage    # 预发构建（--mode staging）
npm run preview        # 预览构建产物
```

生产构建通常**不在本仓库单独执行**，而是由后端仓库的 `bin/build-web.bat` 统一调用（它会先构建 QTools-C，再对本仓库执行 `npm run build:prod`，最后校验两个 `dist` 的关键产物）。

## 配置说明

### 部署基路径 `base`（`vite.config.js`）

```js
base: VITE_APP_ENV === 'production' ? '/admin-ui/' : '/'
```

生产环境必须构建到 `/admin-ui/` 子路径，因为产物由后端以 `/admin-ui/` 前缀托管（与后端 `qtools.web.adminPath` 一致）。**改这里就要同步改后端配置，两边不一致会导致静态资源 404、白屏。**

### 开发服务器（`vite.config.js`）

| 配置 | 值 | 说明 |
| --- | --- | --- |
| `server.port` | `5174` | 原为 `80`（需管理员权限且易冲突），改为高位端口 |
| `server.strictPort` | `true` | **端口被占用直接失败**，避免 Vite 静默换端口导致访问地址不明 |
| `server.host` | `'localhost'` | **仅监听本机回环地址**，管理后台不暴露给局域网内其他机器 |
| `server.open` | `true` | 启动后自动打开浏览器 |
| `server.watch.ignored` | `['**/.*.tmpdir/**', '**/*.tmp', '**/node_modules/**', '**/dist/**']` | 忽略编辑器/工具产生的临时目录。**Windows + Node 24 + Vite 6 下，未忽略时临时目录会让 dev server 因 `EBUSY` 崩溃** |

### 后端地址与代理（`vite.config.js`）

后端地址写在文件顶部的常量里：

```js
const baseUrl = 'http://localhost:8080' // 后端接口
```

| 前缀 | 目标 | 处理 |
| --- | --- | --- |
| `/dev-api` | `http://localhost:8080` | `rewrite` 去掉 `/dev-api` 前缀，即 `/dev-api/captchaImage` → `/captchaImage` |
| `^/v3/api-docs/(.*)` | `http://localhost:8080` | 直通，用于 springdoc 接口文档代理 |

> 管理端开发期前缀是 `/dev-api`；前台工具站的接口路径是 `/api/...`（由 QTools-C 直连后端）。两者互不影响，不要混淆。

### 环境变量（`.env.*`）

| 文件 | 变量 | 值 |
| --- | --- | --- |
| `.env.development` | `VITE_APP_ENV` | `development` |
| `.env.development` | `VITE_APP_TITLE` | `青兔工具箱 · 管理后台` |
| `.env.development` | `VITE_APP_BASE_API` | `/dev-api` |
| `.env.production` | `VITE_APP_ENV` | `production` |
| `.env.production` | `VITE_APP_TITLE` | `青兔工具箱 · 管理后台` |
| `.env.production` | `VITE_APP_BASE_API` | `''`（空字符串，**同源**） |
| `.env.production` | `VITE_BUILD_COMPRESS` | `''`（空字符串，**关闭预压缩**） |
| `.env.staging` | `VITE_APP_TITLE` | `青兔工具箱 · 管理后台` |
| `.env.staging` | `VITE_APP_BASE_API` | `/stage-api` |

两个空值是最容易踩坑的地方，单独说明：

- **`VITE_APP_BASE_API = ''`**：生产的静态资源与 API 由**后端 / nginx 同域托管**，页面和接口同源，因此接口前缀留空（axios 直接请求 `/login`、`/api/media/admin/**` 等相对路径）。**不再使用 `/prod-api` 反向代理**；如果从旧配置升级，记得不要把 `/prod-api` 留在 nginx 或环境变量里。
- **`VITE_BUILD_COMPRESS = ''`**：关闭 vite 打包期预压缩（不再产出 `.gz`），改由后端 `server.compression` 按 `Accept-Encoding` **实时 gzip**。原因是 `vite-plugin-compression` 0.5.1 与 Vite 6 的输出路径不兼容，开启后产物路径异常。若改用纯 nginx 托管且需要 `gzip_static`，可自行重新评估，但需同时解决插件兼容问题。
- `VITE_APP_TITLE` 通过 `index.html` 的 `<title>%VITE_APP_TITLE%</title>` 生效，同时被 `src/settings.js` 读取为网页标题。
- 开发环境下 `VITE_APP_BASE_API` 必须与 `vite.config.js` 里的代理前缀 `/dev-api` 一致，否则请求打不到后端。

### favicon

`index.html` 使用 `<link rel="icon" href="data:,">`：一个空 data URI，浏览器不再请求 `/favicon.ico`。这样既避免控制台 404 噪音，也不受 `base=/admin-ui/` 子路径影响（放到 `public/` 下的图标在子路径部署时容易出现路径错位）。

## 与后端的集成

生产形态是**后端单端口托管全部前端**：`8080` 同时提供 QTools-C（用户端 SPA）、QTools-M（管理端 SPA）与已有 API。

### 单端口托管原理（后端 QTools）

后端 `qtools.web` 配置项：

```yaml
qtools:
  web:
    userDist:  '${qtools.home:E:/111}/project/QTools/QTools-C/dist'    # 用户端产物
    adminDist: '${qtools.home:E:/111}/project/QTools/QTools-M/dist'    # 管理端产物（本项目）
    adminPath: /admin-ui                                               # 管理端挂载路径
```

配合三个类完成托管：

| 类 | 作用 |
| --- | --- |
| `WebSpaConfig` | 把 `adminDist` / `userDist` 注册为静态资源位置；带 hash 的 `static/**`、`<adminPath>/static/**` 直接返回文件，`/**` 与 `<adminPath>/**` 找不到文件时回落各自的 `index.html` |
| `SpaEntryController` | 显式 forward `<adminPath>` 与 `<adminPath>/` 到管理端 `index.html`（不显式处理首页会 404） |
| `SpaFallbackResolver` | 解析前端路由深链接的落盘文件，支撑 history 路由刷新不 404 |

**因此本仓库必须用 `base=/admin-ui/` 构建**，否则 `index.html` 里的资源引用是 `/static/...`，而实际文件在 `/admin-ui/static/...`，页面会白屏。`adminPath` 可改，但改了必须同步改 `base` 并重新构建。

### nginx 两种方式

1. **只做反向代理（推荐，与单端口托管一致）**：把整个站点代理到后端 `8080`，前端产物仍由 Spring 托管，`/admin-ui/` 不需要额外规则。

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:8080;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

2. **由 nginx 直接托管管理端静态文件（不用 Spring 托管）**：把 `/admin-ui/` alias 到 `QTools-M/dist`，其余请求照旧代理到后端。

   ```nginx
   location /admin-ui/ {
       alias /path/to/QTools-M/dist/;   # 结尾斜杠必须保留
       try_files $uri $uri/ /admin-ui/index.html;
   }
   location / {
       proxy_pass http://127.0.0.1:8080;
   }
   ```

   两种方式都要求 `base=/admin-ui/` 与 `adminPath`/alias 前缀**三处一致**。

### 菜单与按钮权限注入

媒体库页面**不会**自己出现在侧边栏：菜单和按钮权限都在后端 `sys_menu` 里。导入脚本位于后端仓库 `doc/media-menu.sql`：

```bash
# 必须显式指定 utf8mb4：本机 mysql 客户端默认字符集是 gbk，
# 不带这个参数会把菜单名/备注按 GBK 写入，界面显示乱码
mysql -uroot -p --default-character-set=utf8mb4 qtools -e "source E:/111/project/QTools/QTools/doc/media-menu.sql"
```

脚本要点：

| 项 | 值 |
| --- | --- |
| 父级菜单 | `menu_id = 3`「系统工具」（`path='tool'`），前端路由为 **`/tool/media`**，组件 `media/index` |
| 固定 `menu_id` | `2001`（菜单）+ `2002`~`2006`（按钮权限），不依赖自增，重复执行 id 不变 |
| 幂等性 | 全部 `INSERT ... SELECT ... WHERE NOT EXISTS`（授权部分同样去重），可安全重跑，只补缺失行 |
| 权限标识 | `media:admin:list` / `edit` / `remove` / `scan`（`query` 为预留，当前接口仍按 `list` 校验） |

导入后需重新登录（或让管理员重新拉取菜单缓存）才能看到新菜单。

## 上游改动说明

本仓库基于 [RuoYi-Vue3](https://gitee.com/y_project/RuoYi-Vue) 3.9.2 二次开发（非 Git fork），相对上游的改动：

| 项 | 上游 | 本仓库 |
| --- | --- | --- |
| 品牌文案 | 若依 | 三个 `.env.*` 的 `VITE_APP_TITLE` 改为 `青兔工具箱 · 管理后台`；`package.json` 的 `name` 为 `qtools-m`、`description` 为 `青兔工具箱 · 管理后台（QTools-M，基于若依 RuoYi-Vue3）` |
| 底部版权 | 若依 | `src/settings.js` 的 `footerContent` 改为 `Copyright © 2026 青兔工具箱 · 管理后台 \| Powered by RuoYi` |
| 品牌标识 | 若依 logo | 侧栏 / 登录页 / 注册页统一用 `src/components/BrandMark.vue`（与 QTools-C 同一套 Lucide rabbit 图标，数据源 `src/utils/brandMark.js`）；`public/favicon.svg` 与 QTools-C 同文件 |
| 首页文案 | 若依介绍 | `src/views/index.vue` 的主标题与简介改为青兔工具箱说明 |
| **媒体库管理页** | 无 | **新增** `src/views/media/index.vue`（约 42 KB）与 `src/api/media.js`，对接 `/api/media/admin/**` |
| 开发监听 / 端口 | 监听所有网卡、端口 `80` | `server.host = 'localhost'`（仅本机）、`server.port = 5174`、`strictPort: true` |
| 部署基路径 | `base = '/'` | `base = VITE_APP_ENV === 'production' ? '/admin-ui/' : '/'` |
| 生产接口前缀 | `/prod-api` | `''`（同源，由后端/nginx 同域托管） |
| 打包压缩 | 开启 gzip 预压缩 | `VITE_BUILD_COMPRESS = ''` 关闭，改由后端实时 gzip |
| 开发期 watch | 不过滤临时目录 | 忽略 `**/.*.tmpdir/**`、`**/*.tmp` 等，规避 Windows + Node 24 的 `EBUSY` 崩溃 |
| favicon | 引用静态图标 | `index.html` 使用 `<link rel="icon" href="data:,">` |
| 锁文件 | 忽略所有锁文件 | **提交 `package-lock.json`**（保证依赖可复现），仅忽略 `yarn.lock` |

框架代码本身与上游保持一致，因此若依的官方文档与生态资料基本适用。

## 自定义管理端

品牌相关的改动只有两处，都在本仓库内：

| 改什么 | 位置 | 影响面 |
| :--- | :--- | :--- |
| 浏览器标题 / 侧栏 Logo 文案 / 登录页标题 | `.env.development`、`.env.production`、`.env.staging` 的 `VITE_APP_TITLE` | 经 `index.html:10` 的 `%VITE_APP_TITLE%` 注入，同时被 `src/settings.js:5`、`src/layout/components/Sidebar/Logo.vue:28`、`src/views/login.vue:74`、`src/views/register.vue:84` 读取 |
| 页脚版权 | `src/settings.js:65` 的 `footerContent` | 布局页脚与「界面设置」抽屉里的版权文案 |

- 三个 `.env.*` 要一起改，否则切换环境（`development` / `staging` / `production`）后标题会变回旧值。
- `src/views/index.vue`（首页看板）里没有硬编码的站点名，想在首页加标题就在该文件里加。
- 主题与组件样式集中在 `src/assets/styles/`：`index.scss` 里 `@use` 了 `element-ui.scss`、`sidebar.scss`、`btn.scss`、`ruoyi.scss` 等；`variables.module.scss` 里是侧栏/菜单配色等 SCSS 变量。
- 默认管理员账号 `admin / admin123` 来自若依，**首次登录后请立即改密码**。

完整的端到端改造步骤（含前台品牌、工具表与媒体内容）见 **[自定义与迁移指南](../QTools/doc/自定义与迁移指南.md)**。

## 常见问题

**1. 启动报端口 5174 已被占用**

`strictPort: true` 意味着 Vite **不会**自动换端口，而是直接失败。处理办法：停掉占用 5174 的进程，或把 `vite.config.js` 的 `server.port` 改成其它高位端口（访问地址随之变化，记得同步本文档）。注意另一次 `npm run dev` 忘了关也会占用该端口。

**2. 登录失败 / 验证码是空白**

先确认后端 QTools 是否已在 `http://localhost:8080` 运行（MySQL `3307`、Redis `6379` 也要就绪）。后端没起来时，`/dev-api/captchaImage` 走代理会报错，登录页验证码区域就是空白，此时任何账号都登不上。

**3. 默认密码必须修改**

默认管理员口令是若依公开的默认值，仓库也是公开的。首次登录后请立即在「个人中心 / 用户管理」里改成强口令；对外提供访问前务必确认已改。

**4. 需要从局域网其他机器访问**

出于安全考虑，开发服务器目前只监听本机。确有需要时，把 `vite.config.js` 里 `server.host` 改为 `true`（或 `0.0.0.0`）即可被同网段访问——**这意味着管理后台会暴露给局域网内的任何人，请先修改默认管理员密码，并自行承担相应风险**；长期方案是走反向代理 + HTTPS，而不是长期开放 dev server。

**5. npm 安装时出现 install-scripts 相关警告**

新版 npm（11.19+）会对依赖的安装脚本给出警告，属于提示信息，**不影响依赖安装与 `npm run dev` / `npm run build:prod`**，可以忽略。

**6. 生产部署后白屏、静态资源 404**

九成是 `base` 与托管前缀不一致：本仓库必须以 `base=/admin-ui/` 构建（即 `npm run build:prod`），后端 `qtools.web.adminPath` 或 nginx `alias` 也必须是 `/admin-ui/`。三处必须一致。

**7. 媒体库菜单导入后侧边栏看不到**

先确认 SQL 用 `--default-character-set=utf8mb4` 执行成功（否则菜单名可能是乱码但依然存在），再确认当前账号的角色被授权（脚本会对管理员角色授权）、并**重新登录**让动态路由刷新。

## 许可与致谢

- 本仓库沿用上游许可：**MIT**（见 `LICENSE`，版权归 RuoYi 所有）。
- 上游项目：**RuoYi-Vue3 / RuoYi-Vue** — https://gitee.com/y_project/RuoYi-Vue ，本项目保留其署名与许可声明。
- 感谢若依开源社区提供的后台管理框架。
