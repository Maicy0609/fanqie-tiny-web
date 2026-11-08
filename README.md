# 番茄小站 · fanqie-tiny-web

`fanqie-lite-api` 的 Web 客户端：小说、短剧、漫画、听书、书旗，一套 Vanilla JS + Beer CSS
（Material 3 Expressive）界面。没有前端框架、没有构建步骤；Rust 小服务器负责静态托管与
同源反代，所以浏览器不需要 CORS。

## 快速开始

```bash
# 1. 编译前端服务器
cargo build --release --manifest-path server/Cargo.toml

# 2. 启动后端（需要令牌；首次会注册设备，约 20 秒）
./fanqie-lite-api/target/release/fqapi-server \
  --token change-me --data-dir ./fanqie-lite-api/data --listen 127.0.0.1:18921

# 3. 启动前端（默认 http://127.0.0.1:8080）
./server/fanqie-tiny-server \
  --listen 127.0.0.1:8080 --api http://127.0.0.1:18921 --root .

# 4. 打开页面，在「设置」里填访问令牌（与 --token 一致）
```

想从公网访问就把 `--listen` 改成 `0.0.0.0:8080`，并确保后端只监听回环地址。前端服务器
只反代 `/api/`、`/src/`、`/healthz`、`/readyz` 四个前缀，不是开放代理；静态文件也只放行
`index.html`、`app.css`、`js/`、`vendor/`、`assets/`，源码与文档不会被当成静态资源发出去。

如果不用同源反代，而是在设置里填绝对 API 地址（例如 `http://host:18921`），需要给后端加
`--cors-origin http://你的前端地址`，否则浏览器会拦 API 请求；媒体 `<img>` 不受影响。

## 功能

- 首页推荐流、频道切换、榜单、短剧；搜索（热搜/提示/历史/多 tab/备用源）；分类。
- 书籍详情（简介/目录/书评/点评/相关/分享/圈子）、阅读器（字号/行距/纸面、章评、段评、
  进度记忆、预取下一章）。
- 短剧详情、服务端解密播放、弹幕（发送/开关）、剧评/点赞/回复/查看回复。
- 漫画纵向阅读与章节切换；听书文稿（时间轴、音色信息、播放诊断）。
- 作者、榜单、书旗搜索/详情/阅读。
- 本地书架、足迹、阅读进度；账号采集（Cookie 只存内存，强提示）。
- 接口实验室：67 条路径的直达入口，含两条已知 404 死路由。
- 亮/暗双主题、单一番茄红强调色、响应式（桌面 rail / 移动底部导航）、键盘可达。

## 目录（tiny）

```
index.html
app.css                 设计令牌、壳、组件、阅读器、响应式
js/core.js              API、适配、路由、壳、通用组件
js/views-content.js     首页/搜索/分类/书籍/阅读器
js/views-media.js       短剧/播放/漫画/听书
js/views-misc.js        榜单/作者/书旗/书架/足迹/设置/账号/实验室
server/src/main.rs      Rust 静态服务器 + 同源反代（单文件）
tests/smoke.py          Playwright 全流程冒烟（假 API，不写上游）
tests/fixtures/         冒烟固定数据
docs/API-COVERAGE.md    端点 → 页面 → 验证状态
```

## 验证

```bash
npm install            # 只装 TypeScript，用于类型检查；运行时不依赖
npm run check          # tsc --checkJs strict
node --check js/*.js
cargo clippy --manifest-path server/Cargo.toml --offline -- -D warnings
cargo fmt --manifest-path server/Cargo.toml --check
python3 tests/smoke.py # 自动起静态服务器 + 拦截 API，输出截图到 tests/screenshots
```

`tests/smoke.py` 用 `page.route` 提供固定 JSON 与 1×1 图片/2 秒黑视频，覆盖首页、搜索、
书籍、目录、阅读、段评、短剧、播放、弹幕发送、漫画、听书、书旗、书架、设置、实验室与
移动端。写接口只打桩，不会向真实上游发评论或弹幕。

## 已知限制（如实说明）

1. **浏览器不能播放听书音频**：上游音频是加密 AAC（带 `encryption_key`）。本页提供文稿、
   时间轴、播放信息与 `audio/play` 诊断，但不伪装成可播放。
2. **短剧不使用 `mode=stream`**：它是 CENC 密文，浏览器没有解密实现；播放统一走服务端
   解密后的 `/src/*.mp4`。清晰度列表只展示，不提供不可用的切换。
3. **部分封面是 HEIC**：Chromium 不能显示，正文详情会自动改用 `share.poster_cover_url`
   （JPEG）；仍失败时使用取色占位。
4. **段评内容可能为空**：上游段评经常只返回热度计数而不下发正文，界面会说明“只有热度、
   没有评论正文”，不会假装加载失败或显示空列表。
5. `search/suggest` 与 `articles` 是上游就存在的死路由（404），只在实验室标注。
6. 写接口（评论/回复/点赞/弹幕/账号采集）需要令牌；账号采集会把 Cookie 发给服务器，
   入口有二次确认，Cookie 不写 localStorage、不进 URL。
7. 令牌存在 localStorage，这是浏览器端持久化，不是秘密存储；不要把带令牌的页面部署到
   不可信环境。

## 设计

番茄红是唯一强调色：主按钮、下划线、进度、滑块都从它推导，其余用中性色阶。
频道栏收敛为 6 个文字 Tab（推荐/小说/听书/看剧/漫画/短篇），主色下划线标示选中；
卡片 10–20px 圆角，标签 6px，只有主按钮使用胶囊形。阅读器为纸面/护眼/夜读三套纸面；
播放页是黑场 + 原生控制 + DOM 弹幕轨道池。
