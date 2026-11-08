# API 覆盖表

图例：**✅ 主流程**（界面直接使用，真实接口验证过）、**🧪 写接口**（实现并在 mock 冒烟中
验证，未向真实上游写数据）、**🔧 实验室**（`#/dev` 可直接调用）、**⚠️ 已知 404**。

路径数按 `docs/API.md` 的 51 个端点 / 65 条路径统计；实验室列出 67 条（含别名与健康检查）。

## 首页与推荐

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/recommend/homepage` | 首页推荐流、频道 | ✅ |
| `GET /api/v1/recommend` | 首页兜底 | 🔧 |
| `GET /api/v1/recommend/channels` | 频道表 | 🔧 |
| `GET /api/v1/recommend/series-feed` | 短剧 feed | 🔧 |
| `GET /api/v1/series/{id}/related` | 短剧详情「相关」 | ✅ |

## 搜索与分类

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/search` | 搜索页多 tab | ✅ |
| `GET /api/v1/search/fanqie` | 「备用搜索源」 | ✅ |
| `GET /api/v1/search/suggest` | 未实现 | ⚠️ 404 |
| `GET /api/v1/search/hot` | 热搜榜 | ✅ |
| `GET /api/v1/search/cue` | 搜索框轮播提示 | ✅ |
| `GET /api/v1/category` | 分类页（男/女频） | ✅ |

## 书籍

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/books/{id}` / `/detail` | 书籍详情 | ✅ |
| `GET /api/v1/books/{id}/directory` | 目录 / 阅读器章节导航 | ✅ |
| `GET /api/v1/books/{id}/directory/novel` | 图文目录 | 🔧 |
| `GET /api/v1/books/{id}/directory/fanqie` | fanqienovel 目录 | 🔧 |
| `GET /api/v1/books/{id}/chapters/summary` | 本章说摘要 | 🔧 |
| `GET /api/v1/books/{id}/reviews` | 书评 tab | ✅ |
| `GET /api/v1/books/{id}/comments` | 点评 tab | ✅ |
| `GET /api/v1/books/{id}/related` | 相关 tab | ✅ |
| `GET /api/v1/books/{id}/tones` | 听书音色 | ✅ |
| `GET /api/v1/books/{id}/share` | 分享弹窗 | ✅ |
| `GET /api/v1/novels/{post_id}` | `#/post/:id` 长评页 | 🔧 |

## 正文

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/chapters/{id}` | 阅读器正文 | ✅ |
| `GET /api/v1/chapters/batch` | 下一章预取 | ✅ |
| `GET /api/v1/chapters/full` | 批量解密降级 | 🔧 |
| `GET /api/v1/chapters/{id}/novel` | 图文源 | 🔧 |
| `GET /api/v1/chapters/{id}/toutiao` | 头条源 | 🔧 |
| `GET /api/v1/chapters/{id}/reviews` | 章评抽屉 / 段评计数 | ✅ |
| `GET /api/v1/chapters/{id}/paragraphs/{n}/reviews` | 段落气泡 | ✅ |
| `GET /api/v1/chapters/{id}/paragraphs/{n}/short-reviews` | 短段评 | 🔧 |
| `GET /api/v1/chapters/{id}/timeline` | 听书字幕 | 🔧 |
| `GET /api/v1/chapters/{id}/timepoints` | 听书同步 / 播放诊断 | ✅ |

## 短剧

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/videos/{id}` | 播放页（服务端解密流） | ✅ |
| `GET /api/v1/videos/{id}/detail` | 剧集详情兜底 | 🔧 |
| `GET /api/v1/videos/{id}/danmaku` | 弹幕层 | ✅ |
| `POST /api/v1/videos/{id}/danmaku/add` | 发弹幕 | 🧪 |
| `GET /api/v1/series/{id}` | 短剧详情 | ✅ |
| `GET /api/v1/series/{id}/comments` | 剧评（最新） | ✅ |
| `POST /api/v1/series/{id}/comments/add` | 发剧评 | 🧪 |
| `GET /api/v1/series/{id}/comments/{cid}/replies` | 查看回复 | ✅ |
| `GET /api/v1/series/{id}/hot-comments` | 剧评（热门） | ✅ |
| `GET /api/v1/series/{id}/share` | 分享 | ✅ |

## 评论

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/comments/{id}/replies` | 通用回复 | ✅ |
| `POST /api/v1/comments/{id}/digg` | 点赞 | 🧪 |
| `POST /api/v1/comments/{id}/reply` | 回复 | 🧪 |
| `GET /api/v1/comments/short-url` | 短链解析 | 🔧 |

## 漫画 / 听书

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/manga/{ids}` | 漫画阅读 | ✅ |
| `GET /api/v1/manga/videos/{pseries_id}` | 漫剧列表 | 🔧 |
| `GET /api/v1/audio/books/{id}` | 听书详情 | ✅ |
| `GET /api/v1/audio/books/{id}/chapters/{cid}` | 播放诊断 | ✅ |
| `GET /api/v1/audio/play` | 播放诊断（如实展示 403） | ✅ |
| `GET /api/v1/audio/wkcontent/{ids}` | 文稿 + 时间轴 | ✅ |

## 作者 / 榜单 / 其它

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/authors/{id}` | 作者页 | ✅ |
| `GET /api/v1/authors/{id}/bookshelf` | 作者作品 | ✅ |
| `GET /api/v1/rank/{id}` | 榜单页 | ✅ |
| `GET /api/v1/items/{ids}` | 章节元信息 | 🔧 |
| `GET /api/v1/articles/{ids}` | 未实现 | ⚠️ 404 |
| `GET /api/v1/forum-id` | 书籍「圈子」 | ✅ |

## 书旗

| 路径 | 落点 | 状态 |
|---|---|---|
| `GET /api/v1/shuqi/search` | 书旗搜索 | ✅ |
| `GET /api/v1/shuqi/book` | 书旗详情 | ✅ |
| `GET /api/v1/shuqi/toc` | 书旗目录 | ✅ |
| `GET /api/v1/shuqi/chapter` | 书旗阅读 | ✅ |

## 账号 / 健康 / 媒体

| 路径 | 落点 | 状态 |
|---|---|---|
| `POST /api/v1/account/fanqie/library` | 账号页（Cookie，仅内存） | 🧪 |
| `POST /api/v1/account/fanqie/history` | 账号页阅读历史 | 🧪 |
| `GET /healthz` / `/readyz` | 设置页连接诊断、顶栏状态 | ✅ |
| `GET /src/{file}` | 所有图片/视频/音频（带 `?token=`） | ✅ |

## 不假装可用的部分

- 听书音频是加密 AAC，浏览器不能播放；页面只提供文稿与播放诊断。
- `mode=stream` 的 CENC 密文浏览器不能解，播放统一走 `/src`；清晰度入口只展示。
- `search/suggest`、`articles` 在 API 文档里就是 404，实验室会原样显示失败。
- 段评接口经常只返回热度、不下发正文，UI 会如实说明。
