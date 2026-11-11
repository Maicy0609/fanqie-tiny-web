# 测试与验证

## 1. 验证矩阵

| 层级 | 命令 | 说明 |
|---|---|---|
| JS 语法 | `node --check js/*.js` | 所有模块 |
| 静态类型 | `npm run check` | `tsc` strict + checkJs + noUnused |
| Rust 格式 | `cargo fmt --check` | server |
| Rust lint | `cargo clippy --offline -- -D warnings` | 零警告 |
| Rust 构建 | `cargo build --release --offline` | 发布二进制 |
| 全量冒烟 | `python3 tests/smoke.py` | 30 项断言 + 截图 |
| 真实接口抽查 | 手工/脚本 | 首页、搜索、书、正文、短剧、听书、书旗 |

任何一项失败都不算完成。

## 2. 冒烟测试架构

`tests/smoke.py` 是自包含的：

1. 启动 `server/fanqie-tiny-server` 在 `127.0.0.1:8099`，root 指向仓库；
2. 启动 Playwright Chromium（带容器所需 flags）；
3. 对 `**/*` 注册 `page.route`：
   - `/src/*` → 1×1 PNG 或 2 秒黑 MP4；
   - `https://cdn.test/*` → 1×1 PNG；
   - `/api/*`、`/healthz`、`/readyz` → `tests/fixtures/*.json`；
   - 未匹配的 API → `empty.json`；
   - 其他请求 → `route.continue_()`。
4. 用真实前端代码跑完整路由；
5. 截图写入 `tests/screenshots/`；
6. 退出时结束静态服务器。

**不会向真实上游写任何数据。** 写接口只返回 `{code:0}` 桩。

### 2.1 启动参数

```bash
python3 tests/smoke.py              # 自动起 8099
python3 tests/smoke.py --headed     # 有头
python3 tests/smoke.py --web http://127.0.0.1:8080  # 复用已有静态服务器（仍会 mock API）
```

### 2.2 覆盖的 30 项

- 首页 hero / 书架 / 短剧 / 频道切换
- 热搜、搜索结果、短剧结果 tab
- 书籍详情、目录、书评
- 阅读器段落、段评弹层、字号持久化
- 短剧详情、集数、`/src` 播放地址、弹幕发送
- 漫画页与图片可见
- 听书文稿、播放诊断
- 书旗搜索、详情、正文
- 加入书架
- 设置连接测试
- 接口实验室 67 条路径 + 请求成功
- 移动端底栏/rail 显隐
- 无 console error

## 3. 固定数据

`tests/fixtures/` 下每个文件对应一个响应。主要文件：

| 文件 | 端点 |
|---|---|
| `home.json` | `/recommend/homepage` |
| `search.json` | `/search` |
| `book.json` | `/books/1001` |
| `directory.json` | `/books/1001/directory` |
| `chapter.json` | `/chapters/2001` |
| `chapter_reviews.json` | `/chapters/2001/reviews` |
| `para_reviews.json` | `/chapters/2001/paragraphs/*` |
| `series.json` | `/series/5000` |
| `video.json` | `/videos/5001` |
| `danmaku.json` | `/videos/5001/danmaku` |
| `manga.json` | `/manga/6001|6002` |
| `audio*.json` | 听书详情/章节/文稿/播放 |
| `shuqi_*.json` | 书旗四个端点 |
| `hot.json` / `cue.json` | 搜索落地 |
| `author*.json` / `rank.json` | 作者/榜单 |

固定 ID：

- 书：`1001`，章：`2001/2002/2003`
- 短剧：`5000`，集：`5001/5002`
- 听书：`3001`，章：`3002`
- 书旗：`34078`，章：`807554`
- 评论：`c1`

### 3.1 新增 fixture

1. 用真实接口抓一份响应，删掉无关字段，只留前端读取的字段。
2. 存到 `tests/fixtures/xxx.json`。
3. 在 `fixture_for(path, method)` 里映射路径（注意 query 已剥离）。
4. 如果 URL 带 `{id}`，用 `startswith` 或精确匹配。
5. 在测试里 `wait_for_selector` 等真实渲染节点，不要只等固定时间。

### 3.2 图片与视频

- 任何 `/src/*.png` 返回 `pixel.png`。
- 其他 `/src/*` 返回 `tiny.mp4`（2 秒黑视频）。
- 外部封面域名统一用 `https://cdn.test/` 才会被拦截；真实域名会走网络。

## 4. 真实接口检查

冒烟不覆盖真实上游字段漂移。发布前必须另跑：

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/healthz
curl -s -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8080/api/v1/recommend/homepage?tab_type=2&tab_index=0
```

再在浏览器里人工过：

1. 首页 → 切换频道 → 打开一本书
2. 目录 → 阅读 → 段评 → 下一章
3. 搜索 → 短剧 → 播放 → 发弹幕
4. 漫画 → 章节切换
5. 听书 → 文稿 → 播放诊断
6. 书旗搜索 → 阅读
7. 设置保存 token / 测试连接

## 5. 已知测试限制

- 冒烟不写真实评论/弹幕/账号数据。
- `audio/play` 只验证诊断弹层，不验证音频可播（上游加密）。
- `mode=stream` 不测（CENC，浏览器不可解）。
- HEIC 封面在 Chromium 不显示，真实封面会走 `poster_cover_url` 回退。
- 段评经常只有热度没有正文，测试断言的是“能打开弹层”，不是具体评论数。
- 移动端截图不模拟真实安全区（`env(safe-area-inset-bottom)=0`）。

## 6. 截图

`tests/screenshots/` 由冒烟自动生成，已被 `.gitignore` 忽略。用于本地对比，不作为仓库资产。

## 7. CI 建议

当前仓库没有 CI。要接入 GitHub Actions，可用两步：

```yaml
- run: npm ci && npm run check
- run: cargo fmt --check --manifest-path server/Cargo.toml
- run: cargo clippy --offline -- -D warnings --manifest-path server/Cargo.toml
- run: python3 -m playwright install --with-deps chromium
- run: python3 tests/smoke.py
```

注意：CI 需要先构建 `server/fanqie-tiny-server`；本仓库不提交二进制。
