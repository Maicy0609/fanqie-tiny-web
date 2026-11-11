# 开发环境

## 1. 前置依赖

| 工具 | 版本/说明 |
|---|---|
| Node.js | 22.x，仅用于 TypeScript 类型检查 |
| npm | 随 Node |
| Rust | 1.98+，`cargo` / `rustc` |
| Python | 3.12+，跑 Playwright 冒烟 |
| Playwright | Python 包 + Chromium |
| ffmpeg | 仅在重新生成 `tests/fixtures/tiny.mp4` 时需要 |
| 后端二进制 | `fqapi-server`（不在本仓库） |

Playwright 安装：

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

无头容器如果 Chromium 起不来，可加：

```bash
# tests/smoke.py 已内置
--no-sandbox --disable-dev-shm-usage --disable-gpu-sandbox --use-gl=swiftshader
```

## 2. 启动后端

`fqapi-server` 来自另一个项目：

```bash
cd /path/to/fanqie-lite-api
cargo build --release
./target/release/fqapi-server \
  --token change-me \
  --data-dir ./data \
  --listen 127.0.0.1:18921
```

首次启动会注册设备，`/readyz` 从 503 变 200 通常需要约 20 秒：

```bash
curl http://127.0.0.1:18921/healthz
curl http://127.0.0.1:18921/readyz
```

## 3. 启动前端

```bash
cd fanqie-tiny-web
cargo build --release --manifest-path server/Cargo.toml
./server/target/release/fanqie-tiny-server \
  --listen 127.0.0.1:8080 \
  --api http://127.0.0.1:18921 \
  --root .
```

仓库不提交二进制；`cargo build` 之后才会有这个文件。

打开 `http://127.0.0.1:8080`，在「设置」里填后端 token。

## 4. 常用命令

```bash
# 严格类型检查（需要先 npm install）
npm install
npm run check

# 语法检查
for f in js/*.js; do node --check "$f" || exit 1; done

# Rust 格式 / lint / 构建
cd server
cargo fmt --check
cargo clippy --offline -- -D warnings
cargo build --release --offline

# 全量冒烟（自动起 8099 静态服务器，拦截 API）
cd ..
python3 tests/smoke.py

# 有头调试
python3 tests/smoke.py --headed
```

## 5. 开发时的请求路径

浏览器只发同源请求：

```text
GET /api/v1/books/xxx?...
GET /src/xxxx.jpg?token=...
```

Rust 服务器转发到 `--api` 指定的后端。调试代理：

```bash
curl -i http://127.0.0.1:8080/healthz
curl -i -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:8080/api/v1/search/cue"
```

## 6. 常见任务

### 新增一个页面

1. 在对应 `js/views-*.js` 里 `route('name', async (root, ctx) => { ... })`。
2. 用 `ctx.signal` 发请求。
3. 用 `h()` 构建 DOM；需要时在 `app.css` 加组件样式。
4. 如果页面需要释放资源，`return () => { ... }`。
5. 在 `docs/ARCHITECTURE.md` 路由表与 `docs/API-COVERAGE.md` 补一行。
6. 在 `tests/smoke.py` 加选择器断言，必要时加 fixture。

### 新增一个 API 适配

1. 用真实 curl 取样，确认真实字段（不要猜）。
2. 在 `bookOf/seriesOf/commentOf` 或新适配器里做兼容读取。
3. 页面只消费适配后的类型。
4. 上游可能返回空 `data`、`code != 0`、200 但业务错误；都交给 `api()` 抛 `ApiError`。

### 新增一个实验端点

在 `js/views-misc.js` 的 `ENDPOINTS` 数组里加：

```js
{ s: '分组', m: 'GET', p: '/api/v1/xxx/{id}', q: ['count'] }
```

`#/dev` 会自动生成表单、发送、展示 JSON。已知 404 的端点加 `note`。

## 7. 代码规范

- Vanilla JS，ES Modules，使用 `h()` 而不是模板字符串/`innerHTML`。
- 不使用自造状态机；页面状态用局部变量。
- 所有 fetch 带 `ctx.signal` 或超时。
- 所有定时器在 cleanup 中清理。
- 文本一律 `textContent`，不把上游 HTML 注入 DOM。
- CSS 优先复用 token；不要新增第二个强调色。
- 修改 Beer 组件行为前先看 `docs/FRONTEND.md` 的“Beer 注意事项”。

## 8. 调试技巧

- 顶栏连接状态已移除；服务端健康看「设置 → 测试连接」或 `/healthz`。
- 播放器加载慢是正常的：首次播放要服务端下载/解密整集，之后走缓存。
- 漫画 100+ 张图首次解密可能 20–30 秒；页面有明确加载态。
- 若 API 401：设置里的 token 与后端 `--token` 不一致，或 localStorage 里是旧配置。
- 直接模式（设置里填绝对 API 地址）需要后端 `--cors-origin`；同源模式不需要。

## 9. 发布前检查

```text
[ ] npm run check
[ ] node --check js/*.js
[ ] cargo fmt --check
[ ] cargo clippy --offline -- -D warnings
[ ] cargo build --release
[ ] python3 tests/smoke.py
[ ] 真实接口抽查：首页/搜索/书籍/正文/短剧/听书/书旗
[ ] 390px 与 1440px 各看一遍亮/暗主题
```
