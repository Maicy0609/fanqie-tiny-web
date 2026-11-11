# 前端开发指南

## 1. 技术栈

- HTML5 + 原生 ES Modules，无框架、无打包、无构建步骤。
- Beer CSS **5.0.3**（vendored）：只使用基础 reset、字体、按钮/表单的少量行为，主要视觉由 `app.css` 控制。
- 图标：Material Symbols Outlined，字体文件在 `vendor/beercss/material-symbols-outlined.woff2`。
- 浏览器目标：现代 Chromium / Safari / Firefox（使用 `color-mix()`、`aspect-ratio`、`:has` 不强制）。

## 2. 文件结构

```text
index.html        壳与固定节点
app.css           全部样式（约 600 行，按区块注释）
js/main.js        import views + start()
js/core.js        API/适配器/路由/组件/存储
js/views-*.js     页面 mount 函数
```

不要新增打包器。新增页面时优先在现有 view 文件里加 `route()`；只有职责明显独立时才新建文件。

## 3. 设计令牌

`body.light` / `body.dark` 定义 M3 角色：

```css
--primary / --on-primary / --primary-container / --on-primary-container
--secondary / --secondary-container
--surface / --on-surface / --on-surface-variant
--surface-container-lowest…highest
--outline / --outline-variant
--error / --good
--tint   /* 当前书籍/短剧取色，只用于低饱和背景 */
```

**规则**

- 只有 `--primary` 是有彩色；不要引入第二个强调色。
- 绿色 / 蓝色只允许出现在内容图片里，不允许作为 UI 状态色。
- 状态标签用中性 `--surface-container`，不要用主色填充，避免和主按钮混淆。
- 取色 hero 只使用 `color-mix(--tint 7%, surface)` 这类低比例，不做黑卡或大面积渐变。

### 字号 / 形状

| 用途 | 值 |
|---|---|
| Hero 标题 | `clamp(22px, 3.2vw, 38px)` / 680 |
| 页面标题 | 22–30px / 650 |
| 卡片标题 | 12–13px / 600 |
| 正文 | 14px / 1.5 |
| 次级文字 | 10.5–12.5px / `--on-surface-variant` |
| 主按钮 | 38px 高，999 圆角 |
| 次级按钮 | 38px 高，12px 圆角 |
| Tag | 22px 高，6px 圆角 |
| 卡片 | 10–20px 圆角 |

## 4. 应用壳

`index.html` 固定节点：

- `#view`：路由挂载点。
- `#back`：子页返回。
- `#brand`：首页品牌（子页隐藏）。
- `#page-title`：子页标题（首页隐藏）。
- `#search-form` / `#global-search`：只在首页显示。
- `#theme-btn`：亮/暗切换。
- `.rail`：桌面左侧导航。
- `.tabbar`：移动底部导航。
- `#snackbar`：toast。
- `#dialog-host`：模态对话框与 sheet 的容器。

`render()` 负责根据路由切换这些节点的 `hidden`，view 不需要操作壳。

### 顶栏规则

- 首页：品牌 + 搜索 + 主题。
- 子页：返回 + 页面标题 + 主题。
- 阅读器 / 漫画：隐藏全局顶栏，使用页面自己的 sticky bar。
- 搜索页不使用顶栏搜索框，页面内有大搜索框。

## 5. 通用组件（`core.js`）

| 函数 | 用途 |
|---|---|
| `h(tag, props, ...kids)` | 创建 DOM；支持 `class/style/dataset/on*`；**不支持 innerHTML** |
| `el(id)` / `qs` / `qsa` | 取节点 |
| `clear(node)` | 清空并返回 node |
| `image(src, alt)` | 统一媒体 URL、lazy、淡入、失败隐藏 |
| `bookCard` / `seriesCard` / `seriesRow` | 书籍卡、短剧横卡、短剧列表行 |
| `shelf(title, items)` | 横向书架 section |
| `commentView` / `commentList` | 评论/剧评 |
| `emptyState` / `errorState` / `loadingShelf` | 空/错/骨架 |
| `toast` / `openDialog` / `confirmDialog` / `openSheet` | 反馈与弹层 |
| `copy` | 剪贴板（含旧 HTTP 降级） |
| `num` / `words` / `dur` / `when` / `trim` | 格式化 |

### 弹层选择

- 需要用户确认、阻断操作：`openDialog`（移动端自动底部 Sheet）。
- 阅读设置、非阻断调整：`openSheet`（不遮正文、不锁滚动）。
- 目录/章评：`openDialog`，内部 `.dialog-scroll`。

## 6. 页面配方

### 首页
1. `api('/recommend/homepage')` 取 `tab_item`。
2. 只展示 6 个文字 Tab：推荐/小说/听书/看剧/漫画/短篇；`#/?tab=经典` 可从发现页进入隐藏频道。
3. 第一个 cell 的第一本书做 hero；榜单用两列 rank；其余 cell 用横向书架。
4. hero 只保留一个主操作 + 一个文字链接。

### 搜索
- 无 q：热搜 + 最近搜索。
- 有 q：`/search`，结果 tab 用下划线；短剧用 `.series-list` 横向行，书籍用 grid。
- 备用源：`/search/fanqie`。

### 书籍详情
- `.detail-page` 最大 880px 居中。
- `.detail-panel` 112px 封面 + 标题/作者/单行 meta/操作。
- Tabs：简介/目录/书评/点评/相关。
- 简介只出现一次摘要、一次 tags、一次最近更新；不要恢复重复信息卡。

### 阅读器
- body class：`reader-page` + `reader-paper|green|night`。
- `.reader-bar` 52px；标题、百分比、目录/章评/设置。
- 正文最大 40rem，宋体优先，行高由 `--reader-line` 控制。
- 设置使用 `openSheet`；滑块必须显示数值；纸面必须有 Three color dots。
- 章节导航用 `go(hash, true)`，避免历史堆栈重复。
- 返回按钮用 `leaveReader()`，优先 `history.back()`，失败才回书籍页。

### 播放
- 视频走 `/src/*.mp4`，不用 CENC stream。
- 弹幕层是绝对定位 DOM 池，单个 rAF 更新 transform；暂停时修正 start 时间。
- 弹幕开关存 `fq.danmaku`。

### 漫画 / 听书
- 漫画所有页 `<img loading=lazy>`，宽度 720px。
- 听书只做文稿 + 时间轴 + 播放诊断，不伪造音频播放。

## 7. 动画

- `.view-enter > *`：260ms 淡入上移，直接子元素 stagger 30/60ms。
- 图片：`.loaded` 后 250ms 淡入；失败隐藏并显示 fallback。
- Tab：颜色/下划线 180ms；底栏指示器背景 180ms。
- Sheet：220ms 上滑；对话框移动端 `sheet-in`。
- 卡片 hover：封面 translateY/scale 轻微。
- 所有动画必须在 `prefers-reduced-motion: reduce` 下被压到 0.001ms（已全局处理）。

新增动画时不要用 JS 定时器做循环动画；优先 CSS transition/animation。弹幕是唯一例外（rAF）。

## 8. 响应式

断点：

- `≤1024px`：设置单列，hero 封面 104。
- `≤820px`：隐藏 rail，显示 tabbar；顶栏 54；搜索 42；主区内边距 14；对话框变底部 Sheet。
- `≤560px`：hero 84px 封面、标题 22、摘要 2 行；详情封面 84；书架卡 104。

移动端底部必须留 `calc(100px + env(safe-area-inset-bottom))`，避免最后一行被 tabbar 压住。

## 9. 可访问性

- 所有 icon-only 按钮必须有 `aria-label` 或 `title`。
- `main` 有 `tabindex="-1"`，skip link 可跳转。
- Tab 使用 `role="tablist"` / `role="tab"` / `aria-selected`。
- 导航 active 设置 `aria-current="page"`。
- 对话框原生 `<dialog>` 提供焦点陷阱与 Esc。
- 正文只用 `textContent`，不渲染上游 HTML（`paragraphsOf` 只取文本）。

## 10. Beer CSS 注意事项

1. **`form` 有默认上边距**：搜索框必须显式 `margin: 0`，否则会顶出 topbar。
2. **`dialog[open]` 自带 `translate(-50%)`**：移动端底部 Sheet 需要 `dialog[open] { left:0; right:0; transform:none; }`。
3. **`input[type=search]` 原生外观**会叠出双层边框，必须 `appearance:none`。
4. Beer 的 `.field` 与本项目的浮动标签冲突，因此本项目字段统一用 `.field` 自定义实现，并配 `placeholder=" "`。
5. Beer 的 `a` 可能带 `justify-content:center`；自定义列表链接要显式 `justify-content:flex-start`。

## 11. 代码约定

- 不使用第三方 UI 框架、状态机或模板字符串拼 HTML。
- 所有上游数据先过适配器，不在 view 里直接读 `book_data[0].xxx`。
- 每个 `mount` 的异步请求都传 `ctx.signal`。
- 定时器/rAF/滚动监听必须在 cleanup 中释放。
- 新增 API 路径时同步更新 `docs/API-COVERAGE.md` 与 `#/dev` 端点表。
