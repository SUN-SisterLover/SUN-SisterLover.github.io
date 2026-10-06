# 个人数据卡（右下角浮动）· 设计文档

> 2026-08-12 · MIKU DA YO

## 目标

在右下角浮动栏新增数据卡（与现有 Player / Steam / Lofi 同款交互），聚合展示个人数字足迹：

1. **B站卡**（`FloatingBili`）：昵称、头像、粉丝数、视频数、最近投稿
2. **追番卡**（`FloatingAnime`）：Bangumi + AniList 合并（统计并排 + 在看列表）
3. **Steam 卡**：复用现有 `FloatingSteam`

同时解决现状痛点：依赖服务端代理的功能（Steam / 网易云）在 GitHub Pages 纯静态托管上不可用。用户自有服务器，本次顺带把站点部署到服务器，使这些功能线上可用。

## 架构

```
右下角浮动栏 (FloatingLayer)
 ├─ FloatingBili  ← fetch /api/bilibili/profile  ← Express 代理(server/bilibili.mjs) → B站 API
 ├─ FloatingAnime ← fetch /api/bangumi/profile + /api/anilist/profile
 │                  ← Express 代理(server/bangumi.mjs + anilist.mjs) → bgm.tv + graphql.anilist.co
 └─ FloatingSteam ← 复用现有 /api/steam + lib/steam.ts
```

## API 路由

### B站代理（新增，`server/bilibili.mjs`）
| 路由 | 方法 | 说明 | TTL |
|------|------|------|-----|
| `/api/bilibili/health` | GET | 探活 | 0 |
| `/api/bilibili/profile?uid=<id>` | GET | 卡片信息 + 最近投稿（WBI 签名） | 120s |

- B站无官方公开 API。基础信息用 `api.bilibili.com/x/web-interface/card?mid=`；最近投稿用 WBI 签名请求 `x/space/wbi/arc/search`。
- WBI 签名逻辑独立成小函数（获取 img_key/sub_key → 计算 mixin_key → 对参数签名），接口变动只改这一处。
- 完全沿用 `server/steam.mjs` 的缓存模式（TTL 缓存 + 并发去重 + 错误归一化 + 超时）。

### Bangumi 代理（新增，`server/bangumi.mjs`）
| 路由 | 方法 | 说明 | TTL |
|------|------|------|-----|
| `/api/bangumi/health` | GET | 探活 | 0 |
| `/api/bangumi/profile?username=` | GET | 用户 + 收藏统计（5 种类型各 100 条聚合） | 300s |

> bgm.tv 在部分网络下慢/不稳定，因此也走服务端代理（与 B站一致）：
> 服务端统一加 UA、长超时（15s）、TTL 缓存，前端保持同源请求。

### AniList 代理（新增，`server/anilist.mjs`）
| 路由 | 方法 | 说明 | TTL |
|------|------|------|-----|
| `/api/anilist/health` | GET | 探活 | 0 |
| `/api/anilist/profile[?username=]` | GET | GraphQL 查询用户统计 + 最近收藏 | 300s |

> 三个数据源身份全部放服务端 `.env`，前端请求不带身份参数，代理无参时从
> env 读取；身份均未配置时返回 `{ ok: true, configured: false }`，前端据此显示占位卡。

## 配置

### `site.config.ts` 新增
```ts
bilibili: { enabled, apiBase: '/api/bilibili' }
bangumi:  { enabled, apiBase: '/api/bangumi' }
anilist:  { enabled, apiBase: '/api/anilist' }
```
并补充 `strings.zh/en` 各卡 loading/error/刷新/更新于文案，参照现有 `steam.*` 命名。

### `.env`
数据墙身份（不打包进前端 bundle，改账号只需改 env + 重启服务）：

```
BILI_UID=你的B站UID
BANGUMI_USERNAME=你的Bangumi用户名
ANILIST_USERNAME=你的AniList用户名
BILI_COOKIE=...  # 可选，B站最近投稿
```

Steam / 网易云沿用现有 `STEAM_API_KEY` / `NETEASE_COOKIE`。

## 前端组件

- **`FloatingBili.tsx`**：右下角 B站浮动卡 —— 折叠 64px 方块，hover 展开显示头像/昵称 + 粉丝·视频·关注统计 + 最近投稿列表。完全复用 `FloatingSteam` 的动画与样式（EASE/DURATION、grid-rows 展开）。
- **`FloatingAnime.tsx`**：右下角追番浮动卡 —— Bangumi + AniList 统计并排 + Bangumi 在看列表，两源独立加载、失败/未配置各自隐藏对应一半。
- 身份未配置或代理缺失时，浮动卡**静默隐藏**（与 FloatingSteam 一致），不显示占位。

## 数据类型

```ts
type BiliProfile = {
  ok: true
  cached: boolean
  age: number
  fetchedAt: number
  ttl: number
  user: { uid, name, avatar, sign, followers, following, videoCount }
  recent: { bvid, title, cover, play, duration, created }[]
}

type BangumiCollection = { id, name, image, type, score, status, episodesWatched }
type AniListEntry = { id, title, cover, progress, status, score }
```

## 健壮性

- 每张卡独立 loading / error / empty 状态，单卡失败不影响其他卡与整页。
- 三个数据源全部走服务端代理：超时 + TTL 缓存 + 错误降级；上游不可达时返回明确错误码而非崩溃。
- 身份未配置时代理返回 `configured: false`，前端浮动卡**静默隐藏**。
- 前端 hook 用 `AbortController` 取消请求。
- 尊重 `prefers-reduced-motion`。

## 部署

- 新增 `docs/deployment.md`：Node 20、`npm ci && npm run build`、`node server.js`（或 PM2 常驻）、nginx 反向代理 + 域名（HTTPS）、`.env` 配置。
- 部署到自有服务器后，Steam / 网易云 / B站代理全部线上可用。

## 明确不做（YAGNI）

- 不做独立数据墙页面（最终实现为右下角浮动卡）
- 不做评论系统、GitHub 活跃度、网易云听歌报告等其他数据源
