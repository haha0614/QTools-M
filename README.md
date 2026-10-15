# QTools 管理后台（QTools-M）

> 一句话定位：基于若依 RuoYi-Vue3（Vue 3 + Vite + Element Plus）的 QTools 后台管理端。

## 简介

本仓库是「青兔在线工具箱（QTools）」的**后台管理端**前端工程，上游为 [RuoYi-Vue3](https://gitee.com/y_project/RuoYi-Vue) 3.9.2，对接本项目自研的后端 **QTools**（Spring Boot 3.5.16 + 若依，默认端口 `8080`）。

它服务于 QTools 后端，**当前实际可用的能力主要是若依框架自带的系统管理、系统监控与系统工具**；QTools 业务数据（工具列表 `tool_info`、访问埋点 `tool_visit`）目前**没有**对应的管理端页面，详见下文「功能一览」。

前台用户站点「青兔在线工具箱」是独立工程 **QTools-C**，它与本管理端互不依赖，共用同一个后端。

## 相关仓库

| 仓库 | 说明 | 地址 |
| --- | --- | --- |
| **QTools** | 后端服务（Spring Boot 3.5.16 + 若依 3.9.2，端口 8080） | https://github.com/haha0614/QTools |
| **QTools-C** | 前台用户站（Vue 3 + Vite 5，dev 端口 5173） | https://github.com/haha0614/QTools-C |
| **QTools-M** | 管理后台（本项目，基于 RuoYi-Vue3 3.9.2） | https://github.com/haha0614/QTools-M |

## 功能一览

| 模块 | 说明 |
| --- | --- |
| 系统管理 | 用户、角色、菜单、部门、岗位、字典、参数、通知公告（若依自带） |
| 系统监控 | 在线用户、定时任务、操作日志、登录日志、缓存监控、服务监控、连接池监视（Druid）（若依自带） |
| 系统工具 | 表单构建、代码生成、系统接口（若依自带） |
| 登录 / 首页 / 个人中心 | 若依自带 |
| **工具列表（`tool_info`）** | ⚠️ **暂无管理页面**，后台看不到、也改不了工具数据 |
| **访问埋点（`tool_visit`）** | ⚠️ **暂无管理页面**，无访问量统计视图 |

> **重要说明**：本仓库 `src/views` 与 `src/api` 下**没有**任何针对 `tool_info` / `tool_visit` 的页面或接口模块（仅在首页文案里提到了这两个表名）。目前这两张表的数据**只能通过数据库或后端接口直接查看**。
>
> 如果需要在后台维护工具列表、查看访问埋点，需要自行基于若依开发页面，并在**后端菜单表里配置菜单与权限**——本管理端的菜单与路由由后端按登录用户的权限动态下发（若依动态路由），新增页面光有 `.vue` 文件是不会出现在侧边栏里的。

后端为前台工具站提供的两个匿名接口（**前台 QTools-C 直连调用，与管理端无关**）：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/toolInfo/list` | GET | 工具列表，匿名可访问 |
| `/api/toolVisit/add` | POST | 访问埋点上报，匿名可访问 |

## 技术栈

版本取自 `package.json`：

| 类别 | 依赖 | 版本 |
| --- | --- | --- |
| 框架 | vue | 3.5.26 |
| 路由 | vue-router | 4.6.4 |
| 构建 | vite | 6.4.1 |
| 构建插件 | @vitejs/plugin-vue | 5.2.4 |
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
├─ vite.config.js        # Vite 配置：dev 端口 80、仅监听本机、/dev-api 代理、后端地址
├─ index.html            # 入口 HTML，标题取 %VITE_APP_TITLE%
├─ .env.development      # 开发环境变量（VITE_APP_TITLE / VITE_APP_BASE_API）
├─ .env.production       # 生产环境变量
├─ .env.staging          # 预发环境变量
├─ bin/                  # Windows 批处理脚本（package / build / run-web）
├─ html/ie.html          # 低版本 IE 提示页
├─ public/               # 静态资源
├─ package-lock.json     # npm 锁文件（本工程提交，保证依赖可复现）
└─ src
   ├─ api/               # 接口封装：login、menu、system/*、monitor/*、tool/gen
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
- 后端 **QTools** 已在 `http://localhost:8080` 运行
- 后端依赖的 **MySQL 8** 与 **Redis** 已就绪（后端启动所需，数据表由后端的 SQL 脚本初始化）

### 安装与启动

```bash
npm install
npm run dev           # http://localhost（端口 80）
```

`server.open = true`，启动后会自动打开浏览器。

### 登录

浏览器访问 `http://localhost`，使用若依默认管理员账号登录：

- 账号：`admin`
- 密码：若依默认初始密码 `admin123`

> ⚠️ **首次登录后请立即修改管理员密码**。仓库是公开的，默认口令人人皆知；改成强口令再对外使用。
>
> 登录页的验证码由后端提供：管理端请求 `/dev-api/captchaImage`，经代理转发到后端的 `/captchaImage`。**后端未启动时验证码是空白的，也登录不了。**

### 构建与预览

```bash
npm run build:prod    # 生产构建，产物在 dist/
npm run build:stage   # 预发构建（--mode staging）
npm run preview       # 预览构建产物
```

## 配置说明

### 开发服务器（`vite.config.js`）

| 配置 | 值 | 说明 |
| --- | --- | --- |
| `server.port` | `80` | 开发地址即 `http://localhost` |
| `server.host` | `'localhost'` | **仅监听本机回环地址**，出于安全考虑，管理后台不暴露给局域网内其他机器 |
| `server.open` | `true` | 启动后自动打开浏览器 |

### 后端地址与代理（`vite.config.js`）

后端地址写在文件顶部的常量里：

```js
const baseUrl = 'http://localhost:8080' // 后端接口
```

代理规则：

| 前缀 | 目标 | 处理 |
| --- | --- | --- |
| `/dev-api` | `http://localhost:8080` | `rewrite` 去掉 `/dev-api` 前缀，即 `/dev-api/captchaImage` → `/captchaImage` |
| `^/v3/api-docs/(.*)` | `http://localhost:8080` | 直通，用于 springdoc 接口文档代理 |

> 管理端的接口前缀是 `/dev-api`；前台工具站的接口路径是 `/api/...`（由 QTools-C 直连后端）。两者互不影响，不要混淆。

### 环境变量（`.env.*`）

| 文件 | 变量 | 值 |
| --- | --- | --- |
| `.env.development` | `VITE_APP_TITLE` | `QTools 管理后台` |
| `.env.development` | `VITE_APP_BASE_API` | `/dev-api` |
| `.env.production` | `VITE_APP_TITLE` | `QTools 管理后台` |
| `.env.production` | `VITE_APP_BASE_API` | `/prod-api` |
| `.env.staging` | `VITE_APP_TITLE` | `QTools 管理后台` |
| `.env.staging` | `VITE_APP_BASE_API` | `/stage-api` |

- `VITE_APP_TITLE` 通过 `index.html` 中的 `<title>%VITE_APP_TITLE%</title>` 生效，同时被 `src/settings.js` 读取为网页标题。
- `VITE_APP_BASE_API` 是 axios 的请求前缀（`src/utils/request.js`）。**开发环境下它必须与 `vite.config.js` 里的代理前缀 `/dev-api` 一致**，否则请求打不到后端。
- 部署到生产/预发时，需要由 Nginx 等把 `/prod-api`、`/stage-api` 反向代理到后端。

## 上游改动说明

本仓库基于 [RuoYi-Vue3](https://gitee.com/y_project/RuoYi-Vue) 3.9.2 二次开发（非 Git fork），相对上游的改动集中在品牌文案与本地开发安全：

| 项 | 上游 | 本仓库 |
| --- | --- | --- |
| 品牌文案 | 若依 | 三个 `.env.*` 的 `VITE_APP_TITLE` 改为 `QTools 管理后台`；`package.json` 的 `name` 为 `qtools-m`、`description` 为 `QTools 管理后台（基于若依 RuoYi-Vue3）` |
| 底部版权 | 若依 | `src/settings.js` 的 `footerContent` 改为 QTools 版权 |
| 首页文案 | 若依介绍 | `src/views/index.vue` 的主标题与简介改为 QTools 说明 |
| 开发监听 | 默认监听所有网卡 | `server.host = 'localhost'`，仅监听本机 |
| 锁文件 | 忽略所有锁文件 | **提交 `package-lock.json`**（保证依赖可复现），仅忽略 `yarn.lock` |

框架代码本身与上游保持一致，因此若依的官方文档与生态资料基本适用。

## 常见问题

**1. 启动时报 80 端口被占用或权限不足**

`80` 是特权/常用端口。若被 IIS、其他 Web 服务或已被系统保留的端口占用，Vite 会启动失败。处理办法：停掉占用端口的进程，或把 `vite.config.js` 里的 `server.port` 改成一个高位端口（如 `8081`），访问地址随之变化。

**2. 登录失败 / 验证码是空白**

先确认后端 QTools 是否已在 `http://localhost:8080` 运行（数据库 MySQL、Redis 也要就绪）。后端没起来时，`/dev-api/captchaImage` 走代理会报错，登录页验证码区域就是空白，此时任何账号都登不上。

**3. 默认密码必须修改**

默认管理员口令是若依公开的默认值，仓库也是公开的。首次登录后请立即在「个人中心 / 用户管理」里修改为强口令；对外提供访问前务必确认已改。

**4. 需要从局域网其他机器访问**

出于安全考虑，开发服务器目前只监听本机。确有需要时，把 `vite.config.js` 里 `server.host` 改为 `true`（或 `0.0.0.0`）即可被同网段访问——**这意味着管理后台会暴露给局域网内的任何人，请先修改默认管理员密码，并自行承担相应风险**；长期方案是走反向代理 + HTTPS，而不是长期开放 dev server。

**5. npm 安装时出现 install-scripts 相关警告**

新版 npm（11.19+）会对依赖的安装脚本给出警告，属于提示信息，**不影响依赖安装与 `npm run dev` / `npm run build:prod`**，可以忽略。

## 许可与致谢

- 本仓库沿用上游许可：**MIT**（见 `LICENSE`，版权归 RuoYi 所有）。
- 上游项目：**RuoYi-Vue3 / RuoYi-Vue** — https://gitee.com/y_project/RuoYi-Vue ，本项目保留其署名与许可声明。
- 感谢若依开源社区提供的后台管理框架。
