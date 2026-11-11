# 部署

## 1. 组成

```text
公网 → Nginx/Caddy (TLS, 可选)
     → fanqie-tiny-server :8080  静态 + /api /src 反代
     → fqapi-server :18921       设备池、解密、缓存 → 番茄上游
```

前端服务器只监听 8080；后端只监听 127.0.0.1。不要把 18921 暴露到公网。

## 2. 构建

```bash
git clone https://github.com/Maicy0609/fanqie-tiny-web.git
cd fanqie-tiny-web

cargo build --release --manifest-path server/Cargo.toml
npm install                 # 仅类型检查需要，运行时不需要
npm run check
```

产物：

```text
server/target/release/fanqie-tiny-server
```

前端是纯静态文件，不需要构建。

## 3. 启动后端

```bash
/path/to/fqapi-server \
  --token "$FQ_TOKEN" \
  --data-dir /var/lib/fanqie/data \
  --listen 127.0.0.1:18921
```

`$FQ_TOKEN` 必须是高强度随机值，不要用示例 `change-me`。

### systemd 示例

`/etc/systemd/system/fqapi.service`

```ini
[Unit]
Description=fanqie-lite-api
After=network.target

[Service]
User=fanqie
EnvironmentFile=/etc/fanqie/fqapi.env
ExecStart=/opt/fanqie/bin/fqapi-server --token ${FQ_TOKEN} --data-dir /var/lib/fanqie/data --listen 127.0.0.1:18921
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/fanqie/data

[Install]
WantedBy=multi-user.target
```

`/etc/fanqie/fqapi.env` 权限 600：

```text
FQ_TOKEN=替换为随机值
```

## 4. 启动前端

```bash
/opt/fanqie/fanqie-tiny-server \
  --listen 127.0.0.1:8080 \
  --api http://127.0.0.1:18921 \
  --root /opt/fanqie/web
```

`/etc/systemd/system/fanqie-web.service`

```ini
[Unit]
Description=fanqie-tiny-web
After=fqapi.service

[Service]
User=fanqie
ExecStart=/opt/fanqie/fanqie-tiny-server --listen 127.0.0.1:8080 --api http://127.0.0.1:18921 --root /opt/fanqie/web
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadOnlyPaths=/opt/fanqie/web

[Install]
WantedBy=multi-user.target
```

## 5. Nginx 反向代理（推荐）

```nginx
server {
    listen 443 ssl http2;
    server_name fanqie.example.com;

    ssl_certificate     /etc/letsencrypt/live/fanqie.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fanqie.example.com/privkey.pem;

    client_max_body_size 128k;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
```

`proxy_buffering off` 对视频/漫画流更友好；`proxy_read_timeout` 覆盖首次解密的长请求。

## 6. 直接模式（不推荐）

如果前端设置里填绝对 API 地址 `http://host:18921`：

- 后端需要 `--cors-origin https://fanqie.example.com`；
- 媒体 `<img>` 不受 CORS 影响，但 `fetch` 会；
- token 会出现在浏览器到 18921 的请求头中；
- 需要自己保证 18921 的 TLS/访问控制。

同源反代是默认且推荐方式。

## 7. 数据与备份

| 数据 | 位置 | 备份 |
|---|---|---|
| 设备池、密钥、解密缓存 | 后端 `--data-dir` | 必须 |
| 书架/足迹/进度 | 浏览器 localStorage | 用户自行承担 |
| token | 浏览器 localStorage + 后端环境变量 | 环境变量备份 |
| 静态资源 | 仓库 | Git |

后端 `data/` 含设备凭据，备份文件应加密。

## 8. 升级

```bash
git pull
cargo build --release --manifest-path server/Cargo.toml
sudo systemctl restart fanqie-web
```

只有前端变更时无需重启后端；静态文件每次请求读取，`Cache-Control: no-cache` 会让浏览器重新验证。

## 9. 安全清单

- [ ] 后端只监听 127.0.0.1
- [ ] 前端使用 HTTPS
- [ ] token 为随机值，不写入仓库/日志/截图
- [ ] 账号采集入口有明确提示，Cookie 不落盘
- [ ] 静态白名单仍然只放行 `index.html/app.css/js/vendor/assets`
- [ ] 反代只转发 `/api /src /healthz /readyz`
- [ ] Nginx 限制请求体（64 KiB 代理层 + 128k Nginx 上限）
- [ ] 定期轮换 token 并重启前后端
- [ ] 不把 `data/`、`.env`、token 提交到 Git

## 10. 故障排查

| 现象 | 排查 |
|---|---|
| 页面 502 | 后端未启动/端口不对；看前端日志 |
| API 401 | token 不一致；后端 `--token` 与设置 |
| `/readyz` 503 | 设备池仍在注册，等 20 秒 |
| 视频一直转 | 首次解密慢；看后端日志与磁盘空间 |
| 漫画空白 | `/src` 代理或 token 问题；看 Network |
| 刷新后 404 | 直接访问的是 hash 路由，应由 `/` 返回 index.html |
| 设置改了不生效 | `saveConfig` 后是否触发 `applyTheme`；硬刷新 |
