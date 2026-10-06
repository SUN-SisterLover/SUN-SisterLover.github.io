# 网易云音乐集成 · 设计文档

> 2026-08-09 · NAGI BLOG

## 目标

将网易云音乐 API 接入 NAGI BLOG，实现两项功能：

1. **音乐动态卡片** (`FloatingNetease`)：右下角浮动展示当前播放 / 最近听歌记录
2. **在线播放器**（改造 `FloatingPlayer`）：支持搜索歌曲、浏览推荐歌单、在线播放

## 架构

完全沿用现有 Steam API 的代理模式：

```
浏览器 ←fetch→ /api/netease/* ← Express Proxy → server/netease.mjs → NeteaseCloudMusicApi → 网易服务器
```

- 服务端使用 `NeteaseCloudMusicApi` npm 包调用网易云 API
- 服务端做 TTL 缓存（播放 URL 短 TTL，歌单/记录长 TTL），与 Steam 代理一致
- `NETEASE_COOKIE` 存在 `.env`，只在服务端使用，绝不泄漏到前端
- 未配置 Cookie 时大部分 API 仍可用（仅高音质播放受限）

## API 路由

| 路由 | 方法 | 说明 | TTL |
|------|------|------|-----|
| `/api/netease/health` | GET | 探活 | 0 |
| `/api/netease/search?kw=&limit=` | GET | 搜索歌曲 | 60s |
| `/api/netease/song/url?id=&br=` | GET | 获取播放 URL | 15s |
| `/api/netease/playlist/detail?id=` | GET | 歌单详情 | 300s |
| `/api/netease/user/record?uid=&type=` | GET | 听歌记录 | 60s |
| `/api/netease/lyric?id=` | GET | 歌词 | 600s |

## 配置

### `.env`
```
NETEASE_COOKIE=你的网易云音乐 cookie（可选，登录后获取高清音质）
```

### `site.config.ts` 新增字段
```ts
netease: {
  enabled: boolean           // 总开关
  uid: string                // 网易云用户 ID
  playlistIds: string[]      // 推荐歌单 ID 列表
  refreshSeconds: number     // 轮询间隔
  apiBase: '/api/netease'
}
```

## 前端组件

### FloatingPlayer（改造）

- **搜索框**：顶部搜索栏，输入关键词 → `/api/netease/search`
- **歌单标签**：横向滚动标签，默认展示配置的推荐歌单
- **歌曲列表**：搜索结果或歌单歌曲，点击 → `/api/netease/song/url` → AudioProvider 播放
- **播放控制**：保留现有的播放/暂停、进度条、音量控制
- **歌词面板**：可展开，调用 `/api/netease/lyric`
- 无可用音频源时恢复为现有本地文件播放模式

### FloatingNetease（新增）

- 完全复制 FloatingSteam 的动画和交互模式：
  - `z-50 origin-bottom-right scale-[1.2]` 定位
  - mouseEnter/mouseLeave collapse/expand
  - grid-rows 展开动画
  - EASE / DURATION 一致
- 折叠态：用户头像 + 在线状态指示点 + 播放进度条
- 展开态：用户信息 + 当前正在听的歌 + 最近听歌列表 + 刷新/主页链接
- 无法连接时静默隐藏（参考 Steam SILENT_CODES）

## 数据类型

```ts
type NeteaseSong = {
  id: number
  name: string
  artist: string
  album: string
  cover: string
  duration: number
  url: string | null  // 可播放的音频 URL
}

type NeteaseRecord = {
  playCount: number
  songs: NeteaseSong[]
  weekPlayCount: number
}

type NeteasePayload = {
  ok: true
  uid: string
  name: string
  avatar: string
  record: NeteaseRecord
  playing: NeteaseSong | null
  fetchedAt: number
}
```

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/netease.mjs` | 新增 | 网易云 API 客户端（含 cache、request timeout） |
| `server/api.mjs` | 修改 | 新增 `neteaseApi()` connect 中间件 |
| `server/env.mjs` | 不修改 | 已有 `loadEnv`，复用即可 |
| `server.js` | 修改 | `app.use(neteaseApi())` |
| `vite.config.ts` | 修改 | 新增 `neteaseApiPlugin` dev 代理 |
| `src/site.config.ts` | 修改 | 新增 `NeteaseConfig` 类型和配置值 |
| `src/types.ts` | 修改 | 新增 `NeteaseSong`, `NeteaseRecord` 等类型 |
| `src/lib/netease.ts` | 新增 | `fetchNetease*` 函数 + `useNeteaseRecord` hook |
| `src/components/FloatingNetease.tsx` | 新增 | 音乐动态卡片组件 |
| `src/components/FloatingPlayer.tsx` | 修改 | 新增搜索框、歌单选择器、在线歌单视图 |
| `src/components/AudioProvider.tsx` | 修改 | 支持播放远程 URL / 歌单队列 |
| `src/App.tsx` | 修改 | FloatingLayer 中加入 FloatingNetease |
| `.env.example` | 修改 | 新增 NETEASE_COOKIE 说明 |
| `package.json` | 修改 | 新增 `NeteaseCloudMusicApi` 依赖 |

## 测试要点

- [ ] 服务端所有路由返回正确 JSON
- [ ] TTL 缓存行为正确（短 TTL 过期重取，长 TTL 复用）
- [ ] 未配置 Cookie 时基础 API 仍可用
- [ ] 搜索功能正常返回结果
- [ ] 播放 URL 可以在浏览器中正常播放
- [ ] 卡片 hover 展开/折叠动画流畅
- [ ] 卡片在 API 不可用时静默隐藏
- [ ] 搜索 + 播放全流程可用
