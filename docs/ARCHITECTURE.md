# 架构说明

## 1. 全貌

```text
┌──────────────────────────────┐
│ 浏览器                        │
│  index.html + app.css + js/* │
└──────────────┬───────────────┘
               │ 同源 fetch / <img> / <video>
┌──────────────▼───────────────┐
│ fanqie-tiny-server (Rust)    │  :8080
│  ├─ 静态文件白名单             │
│  ├─ /api/*  ───────────────┐ │
│  ├─ /src/*  ───────────────┤ │
│  ├─ /healthz, /readyz ─────┤ │
└──────────────┬─────────────┼─┘
               │ HTTP/1.1    │
┌──────────────▼─────────────▼─┐
│ fqapi-server (Rust, 后端)     │  :18921
│  ├─ 设备池 / 解密 / 缓存       │
│  └─ 上游番茄接口               │
└──────────────┬───────────────┘
               │
        番茄上游 API / CDN
```

前端没有构建步骤，也没有 Node 运行时依赖。Node 只用于 TypeScript 类型检查（`npm run check`）。

## 2. 为什么需要 Rust 前端服务器

1. **同源**：浏览器直接访问 `127.0.0.1:18921` 会遇到 CORS；同源反代后前端只请求 `/api/*`。
2. **媒体 token**：`/src/*` 需要 `?token=`，同源代理让 `<img>`、`<video>` 也能正常带 token。
3. **公网访问**：只需暴露前端端口，后端继续监听回环地址。
4. **静态白名单**：只放行页面、JS、CSS、字体、图片，源码和文档不会被当成静态资源发出去。

## 3. 目录职责

```text
index.html               应用壳：rail / topbar / main / tabbar / dialog host
app.css                  设计令牌、壳、组件、阅读器、响应式
js/main.js               仅导入三个 views 并启动
js/core.js               API、适配器、路由、壳、通用组件、存储
js/views-content.js      首页、搜索、分类、书籍详情、阅读器
js/views-media.js        短剧、播放、弹幕、漫画、听书
js/views-misc.js         榜单、作者、书旗、书架、足迹、设置、账号、实验室
server/src/main.rs       静态服务器 + 同源反代（单文件）
tests/smoke.py           Playwright 冒烟（内嵌假 API）
tests/fixtures/*.json    冒烟固定数据
docs/                    本目录
```

### 3.1 前端模块边界

- `core.js` 不导入任何 view，避免循环依赖。
- 每个 view 文件只做“路由 → 数据 → DOM”，共享逻辑回收到 `core.js`。
- 所有页面通过 `route(name, mount)` 注册，`main.js` 负责加载。
- `mount(root, ctx)` 可以返回 cleanup 函数；路由切换时自动调用，用来释放定时器、rAF、滚动监听和 body class。

## 4. 路由

Hash 路由，格式 `#/name/:p0/:p1?query`。

| Hash | 路由名 | 页面 |
|---|---|---|
| `#/` | `home` | 首页推荐流 |
| `#/search?q=` | `search` | 搜索/热搜/历史 |
| `#/category` | `category` | 分类与更多频道 |
| `#/book/:bookId` | `book` | 书籍详情（简介/目录/书评/点评/相关） |
| `#/read/:bookId/:itemId` | `read` | 阅读器 |
| `#/series/:seriesId` | `series` | 短剧详情 |
| `#/watch/:seriesId/:vid` | `watch` | 播放与弹幕 |
| `#/manga/:bookId/:itemId` | `manga` | 漫画纵向阅读 |
| `#/audio/:bookId` | `audio` | 听书文稿 |
| `#/rank/:rankId` | `rank` | 榜单 |
| `#/author/:authorId` | `author` | 作者 |
| `#/shuqi`、`#/shuqi?q=` | `shuqi` | 书旗搜索 |
| `#/shuqi/:bookId` | `shuqi` | 书旗详情 |
| `#/shuqi-read/:bookId/:chapterId` | `shuqi-read` | 书旗阅读 |
| `#/shelf` | `shelf` | 本地书架 |
| `#/history` | `history` | 本地足迹 |
| `#/settings` | `settings` | 服务器/令牌/外观/本地数据 |
| `#/account` | `account` | 账号采集（Cookie） |
| `#/dev` | `dev` | 接口实验室 |
| `#/post/:postId` | `post` | 长评页（入口在实验室） |

`render()` 在每次 hash 变化时：

1. `AbortController.abort()` 取消上一页请求；
2. 调用上一页 cleanup；
3. 清空 `#view`，滚动到顶部；
4. 更新 rail/tabbar 选中态和顶栏（首页显示品牌+搜索，子页显示返回+标题）；
5. `await mount()`，失败时渲染统一 `errorState`。

`go(hash, true)` 使用 `replaceState` 并立即 `render()`，用于“阅读器返回书籍”“清空书架”等不希望增加历史记录的场景。

## 5. 数据层

### 5.1 `api(path, params, opts)`

- 自动拼 `cfg.base`（空 = 同源）；
- 自动加 `Authorization: Bearer <token>`；
- 过滤 `null/undefined/''` 参数；
- 默认 60 秒超时，可传 `timeout`；
- 支持外部 `AbortSignal`；
- 非 2xx 抛 `ApiError(status, code, message, payload)`；
- 200 但 `code !== 0` 也抛 `ApiError`；
- 网络错误/超时转成中文 `ApiError`。

`apiPost` 是 `api` 的 POST 包装。本后端大多数 POST 也把参数放 query，账号接口才用 JSON body。

### 5.2 媒体 URL

`mediaUrl(path)`：

- `https://` 原样，`http://` 升级为 HTTPS；
- `/src/*` 拼当前 API base 与 `?token=`；
- 其他相对路径原样。

### 5.3 适配器

上游 JSON 字段非常不稳定，所有页面都通过适配器读取：

| 函数 | 输入 | 输出 |
|---|---|---|
| `bookOf(raw)` | `book_data[0]` 或 book 对象 | `Book` |
| `seriesOf(raw)` | `video_data` 或 series 对象 | `Series` |
| `commentOf(raw)` | `data_list[]` / `comment` | `Comment` |
| `paragraphsOf(xhtml)` | XHTML 正文 | `{idx,text}[]` |
| `itemsContent(items)` | 首页/搜索条目 | 去嵌套后的 `{books,series}` |

`bookOf` 会兼容 `book_id/id/bookId`、`book_name/name`、`thumb_url/coverUrl` 等字段；`seriesOf` 会从 `video_list[0]` 回退读取单集信息。

### 5.4 本地存储

| key | 类型 | 内容 |
|---|---|---|
| `fq.config` | localStorage | base/token/theme/scale/line/paper |
| `fq.shelf` | localStorage | 书架条目（最多 300） |
| `fq.history` | localStorage | 足迹（最多 200） |
| `fq.progress.<bookId>` | localStorage | 章节、标题、百分比 |
| `fq.searches` | localStorage | 最近 12 条搜索 |
| `fq.toc.<bookId>` | localStorage | 目录降级缓存 |
| `fq.danmaku` | localStorage | 弹幕开关 |
| `fq.home.tab` / `fq.search.tab` / `fq.category.tab` | sessionStorage | 上次频道/tab |
| `fq.home.sid` | sessionStorage | 首页推荐 session |

Cookie 不写入任何存储，只存在账号页输入框的内存中。

## 6. 设计系统

- 单一强调色（番茄红），其余全部是中性色阶；亮/暗两套 token 在 `body.light` / `body.dark`。
- 形状语义：主按钮胶囊；次级按钮 12px；Tag 6px；卡片 10–20px；不再所有东西都全圆。
- 顶栏 54/56px 实色；移动底栏实色 + 仅图标指示器。
- 频道用文字 Tab + 主色下划线；筛选才用 chip。
- 阅读器是非模态 sheet，正文始终可见。
- 图片加载 250ms 淡入；路由 260ms 淡入上移；Sheet 220ms 上滑；`prefers-reduced-motion` 全部关闭。

更细的组件与页面规范见 `FRONTEND.md`。

## 7. Rust 服务器

### 7.1 参数

```text
fanqie-tiny-server [--listen 127.0.0.1:8080] [--api http://127.0.0.1:18921] [--root .]
```

### 7.2 路由

- `/api/*`、`/src/*`、`/healthz`、`/readyz` → 反代；
- 其他 → 静态文件。

### 7.3 反代细节

- 读取完整请求体，上限 **64 KiB**，超过返回 413；
- 使用 HTTP/1.1 + hyper client；
- 去掉 hop-by-hop 头和 `Host`，写入上游 `Host`；
- 响应流式回传，不整体缓冲；
- 不修改 status/headers，除 hop-by-hop；
- 后端不可达返回 502。

### 7.4 静态文件

- 仅 GET/HEAD；
- 仅允许 `index.html`、`app.css`、`favicon.ico`、`js/`、`vendor/`、`assets/`；
- 百分号解码，拒绝 NUL、反斜杠、任何非 `Normal` 路径组件；
- `canonicalize` 后必须仍在 root 内且是文件；
- `Cache-Control: no-cache` + `X-Content-Type-Options: nosniff`；
- 提供常见 MIME（html/css/js/json/svg/png/jpg/webp/avif/ico/woff2/mp4/m4a/txt）。

## 8. 安全边界

- 前端不包含任何上游密钥；只持有用户填写的 Bearer token。
- token 存在 localStorage，属于浏览器持久化，不是秘密存储；公开部署必须使用 HTTPS 和可信设备。
- 静态白名单避免源码、测试、文档泄露。
- 账号采集明确提示 Cookie 会离开设备，且只存在内存。
- 反代不是开放代理：只转发固定四个前缀。
- 后端应只监听回环地址；公网只暴露前端。
