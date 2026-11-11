# 交接文档

## 1. 项目概览

- 仓库：https://github.com/Maicy0609/fanqie-tiny-web
- 定位：`fanqie-lite-api` 的 Web 客户端。
- 目标：在“尽可能小”的前提下覆盖小说、短剧、漫画、听书、书旗与接口调试。
- 形态：纯静态前端 + Rust 同源反代，无前端构建步骤。

## 2. 当前状态

已完成并经过验证：

- 首页推荐流、6 个频道 Tab、榜单、短剧书架。
- 搜索：热搜、最近搜索、历史、多 tab、备用源。
- 书籍详情：简介/目录/书评/点评/相关/分享/圈子。
- 阅读器：章节、段评、章评、字号/行距/纸面、进度、下一章预取。
- 短剧：详情、`/src` 解密播放、弹幕、剧评（最新/热门）、点赞/回复/查看回复。
- 漫画：纵向阅读、章节切换。
- 听书：文稿、时间轴、音色、播放诊断。
- 书旗：搜索、详情、目录、阅读。
- 作者、榜单。
- 本地书架、足迹、进度。
- 账号采集（Cookie 仅内存）。
- 接口实验室：67 条路径。
- 亮/暗主题、390–1440 响应式、轻量动画、可访问性基础。

**验证结果**

- `tsc` strict + `checkJs` + `noUnused`：通过。
- `python3 tests/smoke.py`：30 项全部通过，无 console error。
- Rust `cargo fmt --check` / `clippy -D warnings` / `release build`：通过。
- 真实接口抽查：首页、搜索、书籍、正文、短剧、听书、榜单、作者、书旗。

## 3. 关键决策

1. **不读后端源码**：只依据 `fanqie-lite-api` 的公开文档、可运行二进制和真实响应开发。
2. **同源反代**：Rust 服务器托管静态文件并反代 `/api`、`/src`、健康检查，避免 CORS 和媒体 token 问题。
3. **单强调色**：番茄红是唯一 UI 强调色，不再提供多套主题色。
4. **Tabs vs chips**：内容切换用文字 Tab + 下划线；筛选才用 chip。
5. **阅读器非模态**：设置用底部 sheet，正文保持可见。
6. **诚实的降级**：加密音频、CENC 流、HEIC、无正文段评都不伪装成可用。
7. **无构建链**：Vanilla ES Modules + vendored Beer CSS；Node/TypeScript 只做类型检查。

## 4. 已知限制（不要当 bug 修）

1. **听书音频**：上游 AAC 加密，浏览器不能播放。页面只展示文稿、时间轴与 `audio/play` 诊断。
2. **短剧 CENC**：`mode=stream` 是密文，浏览器解不了；播放统一走服务端解密后的 `/src`。
3. **HEIC 封面**：Chromium 不支持；详情会改用分享海报 JPEG，再失败用取色占位。
4. **段评正文缺失**：上游常只返回 `count` 不下发 `infos`；UI 会明确说明“只有热度，没有正文”。
5. **死路由**：`search/suggest`、`articles` 上游就是 404，只在实验室展示。
6. **写接口**：评论/回复/点赞/弹幕/账号已实现，但冒烟只打桩，避免污染真实账号。
7. **账号 Cookie**：会发送到服务器；入口有二次确认，不写 localStorage。
8. **封面/视频是第三方 CDN**：网络、防盗链、时效签名都可能导致加载失败，需 fallback。

## 5. 技术债 / 下一步

优先级从高到低：

1. **CI**：把 `npm run check`、`cargo clippy`、`tests/smoke.py` 接 GitHub Actions（见 `TESTING.md`）。
2. **章节预取缓存上限**：`chapterCache` 目前在内存里无上限，长会话可加 LRU（6–10 章）。
3. **服务端分页/流式**：当前前端一次性拉目录/漫画列表；大书目录可做虚拟列表。
4. **图片代理**：若 HEIC 封面比例高，可在 Rust 侧加 HEIC→JPEG 转换（会增加依赖与体积，需评估）。
5. **更完整的 E2E**：给写接口加可切换的 mock 模式，覆盖“发布剧评/回复/点赞”的完整交互。
6. **离线/缓存**：Service Worker 可缓存静态资源与最近章节；当前刻意不做。
7. **可访问性审计**：用 axe 跑一遍，补 aria-live / 焦点顺序。
8. **主题色**：如果产品坚持多主题，应恢复“从单一 seed 推导”而不是硬编码多套色板。

## 6. 代码地图

| 想改什么 | 去哪里 |
|---|---|
| 顶栏/底栏/rail | `index.html` + `app.css` 壳区块 + `core.js render()` |
| API 请求/错误/适配 | `js/core.js` |
| 首页/搜索/书籍/阅读器 | `js/views-content.js` |
| 短剧/播放/漫画/听书 | `js/views-media.js` |
| 榜单/作者/书旗/书架/设置/账号/实验室 | `js/views-misc.js` |
| 反代/静态白名单 | `server/src/main.rs` |
| 冒烟数据/断言 | `tests/smoke.py` + `tests/fixtures/` |
| 设计规范 | `docs/FRONTEND.md` |
| 端点覆盖 | `docs/API-COVERAGE.md` |

## 7. 交接清单

- [ ] 后端 `fqapi-server` 二进制与 `--data-dir` 已移交/备份。
- [ ] 后端 token 通过密码管理器或环境变量移交，不写在仓库。
- [ ] 确认生产域名、TLS、Nginx 配置。
- [ ] 确认谁有 GitHub 仓库写权限。
- [ ] 确认 `data/` 备份策略与磁盘配额。
- [ ] 在目标环境跑一遍 `docs/DEVELOPMENT.md` 的启动流程。
- [ ] 跑一遍 `docs/TESTING.md` 的发布前检查。
- [ ] 真实设备（iOS/Android）检查一次安全区、键盘弹起、视频全屏。
- [ ] 记录上游接口变更的监控方式（后端日志/健康检查）。

## 8. 运行现状（交接时）

- 前端：`http://127.0.0.1:8080`
- 后端：`127.0.0.1:18921`
- 健康：`/healthz` → `{"devices":5,"status":"ok"}`
- 本地 token：由交接方单独提供，不进入 Git。

## 9. 许可证

当前仓库尚未选择开源许可证（License 未定）。在接收外部贡献或公开分发前，请由项目所有者决定并添加 `LICENSE`；在那之前默认保留所有权利。

## 10. 文档索引

- `README.md`：快速开始与功能概览
- `docs/ARCHITECTURE.md`：整体架构、数据流、路由、服务器
- `docs/FRONTEND.md`：设计系统、组件、页面配方、Beer 注意事项
- `docs/DEVELOPMENT.md`：环境、命令、常见任务
- `docs/TESTING.md`：冒烟架构、fixtures、发布检查
- `docs/DEPLOYMENT.md`：systemd/Nginx/安全
- `docs/API-COVERAGE.md`：端点 → 页面 → 状态
- `docs/PLAN.md`：早期探索与设计计划（历史文档）
- `docs/JSCODING.md`：Vanilla JS 编码约束
