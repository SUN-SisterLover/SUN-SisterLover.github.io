Style From: https://github.com/nagi-studio/nagi-bench
Build WITH AI

## 右下角数据卡（B站 · 追番 · Steam）

右下角浮动栏展示个人数字足迹：**B站**（粉丝/视频/最近投稿）、**追番**（Bangumi + AniList 合并）、
**Steam**（在线状态/时长），与 Player / Lofi 同款交互（hover 展开）。

依赖服务端代理（B站 / Bangumi / AniList / Steam），**需部署到自有服务器** —— GitHub Pages 纯静态
托管下代理不可用（卡自动隐藏）。账号身份放服务端 `.env`（`BILI_UID` / `BANGUMI_USERNAME` /
`ANILIST_USERNAME`），`src/site.config.ts` 只控制各卡开关；B站最近投稿可选配置 `BILI_COOKIE`
（见 `.env.example`）。完整部署步骤见 [`docs/deployment.md`](docs/deployment.md)。

## Steam 实时状态卡片

右下角浮动菜单会实时展示指定 Steam 账号的个人资料与游玩数据（在线状态、Steam 等级、
拥有游戏数、总时长、近两周时长、正在游玩的游戏、最近/最多游玩列表）。

### 1. 申请 API Key

前往 https://steamcommunity.com/dev/apikey 申请，然后复制 `.env.example` 为 `.env`：

```
STEAM_API_KEY=你的key
```

`.env` 已被 gitignore。Key 只在服务端使用，不会打进前端 bundle
（`api.steampowered.com` 也不返回 CORS 头，浏览器无法直连）。

### 2. 配置要监控的账号

编辑 `src/site.config.ts`：

```ts
steam: {
  enabled: true,
  steamId: '76561197960435530', // SteamID64 / 自定义 URL 名 / 完整主页链接均可
  refreshSeconds: 60,           // 前端轮询间隔（最小 15s）
  apiBase: '/api/steam',        // 代理挂载路径
}
```

> 被查询账号的「游戏详情」隐私需设为**公开**，否则时长与游戏列表为空，
> 卡片会显示「该资料为私密状态」并仅展示基础信息。

### 3. 运行

`npm run dev` 与 `npm start` 都会挂载同一套代理中间件：

| 路由 | 说明 |
| --- | --- |
| `GET /api/steam/health` | 探活，返回是否已配置 key |
| `GET /api/steam/profile?id=<id>` | 聚合后的资料 + 游玩数据 |
| `GET /api/steam/profile?id=<id>&refresh=1` | 跳过缓存强制刷新（最短 15s 一次） |

服务端对每个 SteamID 做 60s TTL 缓存并合并并发请求，自定义 URL 解析结果缓存 24h，
因此轮询不会消耗 Steam 的调用配额。未配置 key 或部署在纯静态托管（如 GitHub Pages）时，
卡片会自动隐藏而不是报错。

### 涉及的 Steam Web API 接口

- `ISteamUser/ResolveVanityURL/v0001` — 自定义 URL → SteamID64
- `ISteamUser/GetPlayerSummaries/v0002` — 昵称、头像、在线状态、正在玩的游戏
- `IPlayerService/GetSteamLevel/v0001` — Steam 等级
- `IPlayerService/GetOwnedGames/v0001` — 拥有的游戏与总时长
- `IPlayerService/GetRecentlyPlayedGames/v0001` — 近两周游玩记录
