# 番茄小站 · 设计与实施计划（tiny 版）

> HTML5 + Vanilla JS + Beer CSS (M3 Expressive) 的 `fanqie-lite-api` Web 客户端。
> 原则：**能力做全，代码做小**。没有框架、没有构建步骤、没有多余抽象。
> 前端服务器用 Rust，静态托管 + 同源反代，顺带解决跨域与公网访问。

---

## 0. 探索结论（真实取样，未读后端源码）

启动 `target/release/fqapi-server`，实际拉了 30+ 个端点（开发期样本已清理，不随交付）。

### 0.1 契约

- 上游 JSON 原样透传；HTTP 200 ≠ 成功，必须看 `code === 0`。
- 分页 `offset` + `passback`；`has_more` / `next_offset` 在 `data` 内。
- 错误信封 `{"success":false,"error":"..."}`；401/404/500/504 语义见 API.md。
- `/src/*` 需 `?token=`；视频不带 `mode` 才是浏览器可播的 `/src/*.mp4`。

### 0.2 真实结构（渲染层依据）

| 场景 | 关键字段 |
|---|---|
| 首页 | `data.tab_item[]` → `cell_data[]` → `cell_data[].cell_data[].book_data[]`；也有直挂 `video_data[]` |
| 搜索 | `search_tabs[]`，条目可能是 `book_data[]`，也可能直挂 `book_id/video_data` |
| 分类 | `data.down_category[]`（194 个）：`id/name/cover/description/book_num` |
| 书籍 | `data` 平铺：`book_id/book_name/author/author_id/thumb_url/score/tags/abstract/word_number/chapter_number/forum_id/author_info` |
| 目录 | `data.item_data_list[]`：`item_id/title/volume_name`；`directory/fanqie` 是 `chapterListWithVolume` |
| 正文 | `data.content` 是 XHTML，`<h1>` + `<p idx="n">` |
| 书评 | `data.data_list[].comment.common.content.text` + `comment.stat` |
| 短剧 | `data.video_data.video_list[]`：`vid/title/duration/cover/vid_index` |
| 弹幕 | `data_list[].comment.expand.offset_time`(ms) + `comment.common.content.text` |
| 漫画 | `{images:["/src/img_*.jpg"]}`（实测 108 张、约 19s） |
| 听书 | 目录 70 章；章节给 `main_url/encryption_key/is_encrypt:true`；`wkcontent` 给带时间戳 `speech_text` |
| 榜单/短剧 feed | `data.cell_view.cell_data[]`，与首页 cell 同构 |
| 书旗 | `{source:"shuqi",data:{...}}`；目录 `chapters[].chapterId/title/isVip/url` |

### 0.3 坑（已吸收进设计）

1. `search/suggest`、`articles` 是死路由 → 只在接口实验室标注 404。
2. `videos/{id}/detail` 可能 `code=101000` → 详情以 `series/{id}` 为准。
3. `chapter/timeline` 可能 `1301008` → 字幕降级到 `wkcontent`。
4. 听书音频是加密 AAC → **浏览器不能播**。听书页以文稿为主，播放按钮如实说明，绝不假装能播。
5. `mode=stream` 是 CENC 密文 → 播放统一走 `/src`；`variants` 只展示不启用。
6. `forum-id` 实际需要 `author_user_id`+`book_id`+`item_id` 三个参数。
7. 书旗目录 2451 章 → 目录分批渲染。
8. 封面 `http://` 升 https，失败用取色占位；不加载非 http(s) 资源。
9. `tab_index` 是首页 `tab_item[]` 的下标，必须与 `tab_type` 配对。

---

## 1. 页面（Hash 路由）

`#/` 首页 · `#/search` · `#/category` · `#/book/:id` · `#/read/:bookId/:itemId`
`#/series/:id` · `#/watch/:seriesId/:vid` · `#/manga/:bookId/:itemId` · `#/audio/:bookId`
`#/rank/:id` · `#/author/:id` · `#/shuqi` · `#/shuqi/:bookId` · `#/shuqi/read/:bookId/:cid`
`#/shelf` · `#/history` · `#/account` · `#/settings` · `#/dev`

全局：桌面左侧 rail（移动底部 4 tab）、顶部搜索、连接状态、主题切换、面包屑返回、迷你播放条。

---

## 2. 视觉

- **番茄小站**，手绘番茄 SVG 标识；seed 番茄红 `#E0402F`，手写 3 套色板（番茄/青梅/海盐），
  亮暗各一套；不引 material-dynamic-colors。
- 卡片 24–28px、hero 36px、按钮全圆；Beer `shape` 做装饰；`color_dominate` 生成详情页渐变。
- 标题紧凑字距；正文系统字体；阅读器宋体优先、行高 1.9。
- 首页：取色 hero + 横向 snap 书架 + 榜单 + 16:9 短剧卡。
- 详情：320px 取色背景、浮起封面、环形评分。
- 阅读器：居中 38em、自动隐藏栏、段落 hover 段评气泡。
- 播放器：黑场、玻璃控制条、DOM 弹幕轨道池（最多 60 条）。
- 漫画：无缝纵向长图 + 页码浮标。听书：文稿逐句高亮。
- 动效 220ms，尊重 `prefers-reduced-motion`；空/错/loading 三态齐全。

---

## 3. 架构（tiny）

```
index.html
app.css                  令牌 + 布局 + 组件 + 阅读器/播放器（约 1200 行）
js/core.js               配置/存储/fetch/适配/路由/壳/通用组件（约 700 行）
js/views-content.js      首页/搜索/分类/书籍/阅读器（约 1000 行）
js/views-media.js        短剧/播放/漫画/听书（约 700 行）
js/views-misc.js         作者/榜单/书旗/书架/历史/账号/设置/实验室（约 800 行）
vendor/beercss/          beer.min.css/js + Material Symbols Outlined（删掉不用的字体）
server/                  Rust 静态服务器 + 同源反代（单文件，约 220 行）
tests/                   smoke.mjs + fixtures/ + screenshots/
docs/{PLAN.md,API-COVERAGE.md,JSCODING.md}
```

没有 `normalize.js`：适配函数和视图放一起，避免”每个字段一个模块”；没有通用状态机，
没有 Web Components，没有构建链。

### 3.1 Rust 前端服务器（必须）

单文件 `server/src/main.rs`，axum + tokio + hyper client，依赖全部取自本机 cargo 缓存：

- `GET /` 与静态文件：`app.css/js/vendor/tests`，防目录穿越，正确 MIME，开发期 `no-cache`。
- 同源反代：`/api/*`、`/src/*`、`/healthz`、`/readyz` → `--api http://127.0.0.1:18921`。
- 透传 method/headers/body/Range，流式回传（视频/漫画不整块读内存）。
- 只反代固定前缀，固定上游，不是开放代理；请求体上限 64 KiB。
- 参数：`--listen 127.0.0.1:8080`、`--api 127.0.0.1:18921`、`--root .`。
- 同源后前端默认 `base=''`；设置页仍可切「直连 API」模式（静态部署用）。

### 3.2 前端核心

- `api(path, params, {signal, timeout})`：query 丢弃空值 → Bearer → HTTP 检查 → JSON →
  `code!==0` 抛错；`mediaUrl()` 处理 `/src` + token；401 全局提示跳设置。
- 路由：`render()` switch + 视图 `mount/cleanup`；所有请求 `AbortController`，销毁后不写 DOM。
- 安全：上游文本只用 `textContent`；章节 XHTML 用 DOMParser 取 `<p>` 文本后重建；
  图片仅 http(s)，升级 https；账号 Cookie 只存内存。
- 性能：目录/评论分批 200/20；封面与漫画图 IntersectionObserver；骨架屏。

---

## 4. API → UI 覆盖

| 端点 | 落点 |
|---|---|
| homepage/recommend/channels/series-feed | 首页、频道、短剧区 |
| search / search/fanqie / hot / cue | 搜索 |
| category | 分类 |
| books/{id} /detail /directory /directory/novel /directory/fanqie | 详情、目录（三源切换） |
| chapters/summary / reviews / comments / related / tones / share / novels/{post} | 详情各 tab、长评页 |
| chapters/{id} / batch / full / novel / toutiao | 阅读器（预取 + 降级 + 换源） |
| chapters/{id}/reviews、paragraphs/{n}/reviews、short-reviews | 章评抽屉、段评气泡 |
| timeline / timepoints | 听书字幕与文稿高亮 |
| videos/{id} / detail、danmaku / add | 播放页、弹幕 |
| series/{id} /comments /comments/add /replies /hot-comments /share | 短剧详情 |
| comments/{id}/replies /digg /reply /short-url | 评论线程、点赞、回复、短链工具 |
| manga/{ids} / manga/videos | 漫画阅读、选集 |
| audio/books /chapters /play /wkcontent | 听书（文稿优先，播放如实提示） |
| authors/{id} / bookshelf | 作者页 |
| rank/{id} | 榜单页 |
| items / forum-id | 阅读器元信息、书籍圈子、实验室 |
| shuqi/search /book /toc /chapter | 书旗三页 |
| account/fanqie/library /history | 账号页（强提示 + 二次确认） |
| healthz / readyz | 设置页诊断、启动状态 |
| /src/* | 所有媒体 |
| search/suggest、articles | 实验室（标注 404 未实现） |

---

## 5. 施工顺序

1. **P0** Rust 服务器（静态+反代）→ index 壳 → 令牌/设置 → 连接诊断。
2. **P1** 首页 + 分类（真实数据、tab、分页）。
3. **P2** 搜索 + 书架/历史（本地）。
4. **P3** 书籍详情 + 目录 + 阅读器 + 章评/段评 + 书评。
5. **P4** 短剧详情 + 播放 + 弹幕 + 剧评写操作。
6. **P5** 漫画 + 听书。
7. **P6** 作者 + 榜单 + 书旗。
8. **P7** 账号采集 + 接口实验室。
9. **P8** 视觉打磨、响应式、无障碍、全量验证、文档。

每阶段都跑真实接口；发现问题先修根因，不用假数据糊过去。

---

## 6. 验证

- `node --check` 全部 JS；`grep innerHTML` 审计（只允许固定模板，不含上游数据）。
- Rust：`cargo build --release`、`cargo clippy -- -D warnings`。
- Playwright 冒烟：静态站由 Rust 服务器托管，`page.route` 用 fixtures 拦截 API，
  走完 首页→搜索→详情→阅读→短剧→播放→弹幕→漫画→听书→书旗→设置→实验室；
  断言 DOM/路由/localStorage/无 console error，三档视口截图。
- `--live` 模式：同上但打真实 API，验证适配层与真实字段。
- 任何一项失败都算未完成；已知不可用能力（加密听书播放）在 UI 和 README 明确标注。

## 7. 交付

- 可运行的 Rust 静态服务器 + 纯静态前端；不需要 npm/构建。
- `docs/API-COVERAGE.md` 端点→页面→验证状态；`README.md` 启动/令牌/限制说明。
