# 网易云音乐集成 · 实现计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务执行。步骤使用 checkbox (`- [ ]`) 语法追踪。

**目标:** 将网易云音乐 API 接入 NAGI BLOG，实现音乐动态卡片 + 在线播放器。

**架构:** 沿用 Steam 代理模式：服务端 `NeteaseCloudMusicApi` → 缓存层 → Express 中间件 → 前端 hooks → React 组件。

**技术栈:** React 19, TypeScript, Vite 6, TailwindCSS 4, Express 4, NeteaseCloudMusicApi

## 全局约束

- 所有网易云 API 调用必须走服务端代理，不从前端直接调用
- `NETEASE_COOKIE` 只在 `.env` 中，不泄漏到前端 bundle
- 缓存策略与 `server/steam.mjs` 保持一致（TTL + 并发去重）
- 组件动画与 `FloatingSteam.tsx` 保持一致（EASE / DURATION / grid-rows 模式）
- 未配置 cookie 时基础 API 仍可用（降级音质）
- 网易云 API 不可用时优雅降级（不报错，卡片隐藏）

---

### Task 1: 安装依赖

**文件:**
- 修改: `package.json`

**接口:**
- 产出: `NeteaseCloudMusicApi` 在 `node_modules` 中可用

- [ ] **Step 1: 安装 NeteaseCloudMusicApi**

```bash
npm install NeteaseCloudMusicApi
```

- [ ] **Step 2: 验证安装**

```bash
node -e "const m = require('NeteaseCloudMusicApi'); console.log(typeof m.search, typeof m.song_url, typeof m.playlist_detail, typeof m.user_record, typeof m.lyric);"
```

预期输出: `function function function function function`

---

### Task 2: 创建服务端网易云 API 客户端

**文件:**
- 创建: `server/netease.mjs`

**接口:**
- 产出:
  - `export class NeteaseError extends Error { status, code }`
  - `export function isNeteaseConfigured(): boolean`
  - `export async function searchSong(kw, limit?): Promise<SearchResult[]>`
  - `export async function getSongUrl(id, br?): Promise<string | null>`
  - `export async function getPlaylistDetail(id): Promise<PlaylistDetail>`
  - `export async function getUserRecord(uid, type?): Promise<UserRecord>`
  - `export async function getLyric(id): Promise<string | null>`

```js
// server/netease.mjs
import {
  search,
  song_url,
  playlist_detail,
  user_record,
  lyric,
} from 'NeteaseCloudMusicApi'

const REQUEST_TIMEOUT = 8_000

export class NeteaseError extends Error {
  constructor(message, status = 502, code = 'netease_error') {
    super(message)
    this.name = 'NeteaseError'
    this.status = status
    this.code = code
  }
}

// ── cookie ────────────────────────────────────────────────

function cookie() {
  return process.env.NETEASE_COOKIE?.trim() ?? ''
}

export function isNeteaseConfigured() {
  return Boolean(cookie())
}

// ── request helper ────────────────────────────────────────

async function request(fn, ...args) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const result = await fn({
      cookie: cookie(),
      realIP: '',
      ...args,
    }, (key, value) => {
      if (key === 'cancelToken' && typeof value?.cancel === 'function') {
        controller.signal.addEventListener('abort', () => value.cancel('timeout'))
      }
    })
    // NeteaseCloudMusicApi rejects with { body: { code, message } } on error
    if (result.body?.code !== 200 && result.body?.code !== undefined) {
      throw new NeteaseError(
        result.body.message ?? `NetEase API returned code ${result.body.code}`,
        502,
        `netease_code_${result.body.code}`,
      )
    }
    return result.body
  } catch (err) {
    if (err instanceof NeteaseError) throw err
    if (err.name === 'AbortError' || err?.message === 'timeout') {
      throw new NeteaseError('NetEase API request timed out', 504, 'timeout')
    }
    throw new NeteaseError(
      err instanceof Error ? err.message : 'NetEase API request failed',
      502,
      'network_error',
    )
  } finally {
    clearTimeout(timer)
  }
}

// ── TTL cache ─────────────────────────────────────────────

function createCache(ttl) {
  const entries = new Map()
  const inflight = new Map()

  return {
    async get(key, produce, minAge) {
      const now = Date.now()
      const hit = entries.get(key)
      if (hit) {
        const age = ttl - (hit.expires - now)
        const stale = minAge === undefined ? hit.expires <= now : age >= minAge
        if (!stale) return { value: hit.value, cached: true, age }
      }

      const pending = inflight.get(key)
      if (pending) return { value: await pending, cached: true, age: 0 }

      const task = produce()
        .then((value) => {
          entries.set(key, { value, expires: Date.now() + ttl })
          return value
        })
        .finally(() => inflight.delete(key))

      inflight.set(key, task)
      return { value: await task, cached: false, age: 0 }
    },
  }
}

const searchCache = createCache(60_000)
const songUrlCache = createCache(15_000)       // 播放 URL 短期缓存
const playlistCache = createCache(300_000)      // 歌单内容变更少
const recordCache = createCache(60_000)
const lyricCache = createCache(600_000)

// ── public helpers ────────────────────────────────────────

function normaliseSong(raw) {
  return {
    id: raw.id,
    name: raw.name ?? 'Unknown',
    artists: raw.ar
      ? raw.ar.map((a) => ({ id: a.id, name: a.name }))
      : raw.artists
        ? raw.artists.map((a) => ({ id: a.id, name: a.name }))
        : [],
    album: raw.al ? raw.al.name : raw.album?.name ?? '',
    cover: raw.al?.picUrl ?? raw.album?.picUrl ?? raw.cover ?? '',
    duration: raw.dt ?? raw.duration ?? 0,
    url: raw.url ?? null,
  }
}

// ── exported API ──────────────────────────────────────────

export async function searchSong(kw, limit = 20) {
  const { value } = await searchCache.get(`search:${kw}:${limit}`, async () => {
    const data = await request(search, { keywords: kw, limit })
    const songs = data?.result?.songs ?? []
    return songs.map(normaliseSong)
  })
  return value
}

export async function getSongUrl(id, br = 320000) {
  const { value } = await songUrlCache.get(`url:${id}:${br}`, async () => {
    const data = await request(song_url, { id, br })
    return data?.data?.[0]?.url ?? null
  })
  return value
}

export async function getPlaylistDetail(id) {
  const { value } = await playlistCache.get(`playlist:${id}`, async () => {
    const data = await request(playlist_detail, { id })
    const pl = data?.playlist
    return {
      id: pl?.id,
      name: pl?.name ?? '',
      cover: pl?.coverImgUrl ?? '',
      trackCount: pl?.trackCount ?? 0,
      tracks: (pl?.tracks ?? []).map(normaliseSong),
    }
  })
  return value
}

export async function getUserRecord(uid, type = 1) {
  // type=1 最近一周, type=0 所有时间
  const { value } = await recordCache.get(`record:${uid}:${type}`, async () => {
    const data = await request(user_record, { uid, type })
    const allData = data?.allData ?? data?.weekData ?? []
    return allData.map((item) => ({
      playCount: item.playCount ?? 0,
      song: normaliseSong(item.song),
    }))
  })
  return value
}

export async function getLyric(id) {
  const { value } = await lyricCache.get(`lyric:${id}`, async () => {
    const data = await request(lyric, { id })
    // 返回原始 lrc 文本，前端自行解析
    return data?.lrc?.lyric ?? null
  })
  return value
}
```

---

### Task 3: 新增 neteaseApi Express 中间件

**文件:**
- 修改: `server/api.mjs`

**接口:**
- 消费: `server/netease.mjs` 中所有导出
- 产出: `export function neteaseApi(options?)` — Connect/Express 中间件工厂

在现有 `steamApi` 导出旁边新增 `neteaseApi` 导出：

```js
// 在 server/api.mjs 顶部新增 import
import {
  searchSong,
  getSongUrl,
  getPlaylistDetail,
  getUserRecord,
  getLyric,
  isNeteaseConfigured,
  NeteaseError,
} from './netease.mjs'

// 在 steamApi 之后新增 neteaseApi
export function neteaseApi(options = {}) {
  const basePath = options.basePath ?? '/api/netease'

  return async function neteaseApiMiddleware(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(basePath)) return next()

    const route = url.pathname.slice(basePath.length).replace(/\/+$/, '') || '/'

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { ok: false, code: 'method_not_allowed' })
    }

    try {
      if (route === '/health') {
        return send(res, 200, { ok: true, configured: isNeteaseConfigured() }, 0)
      }

      if (route === '/search') {
        const kw = url.searchParams.get('kw')
        if (!kw) {
          return send(res, 400, { ok: false, code: 'bad_request', error: 'Query parameter "kw" is required' })
        }
        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))
        const songs = await searchSong(kw, limit)
        return send(res, 200, { ok: true, songs }, 30)
      }

      if (route === '/song/url') {
        const id = url.searchParams.get('id')
        if (!id) {
          return send(res, 400, { ok: false, code: 'bad_request', error: 'Query parameter "id" is required' })
        }
        const br = Number(url.searchParams.get('br')) || 320000
        const songUrl = await getSongUrl(Number(id), br)
        return send(res, 200, { ok: true, url: songUrl }, 10)
      }

      if (route === '/playlist/detail') {
        const id = url.searchParams.get('id')
        if (!id) {
          return send(res, 400, { ok: false, code: 'bad_request', error: 'Query parameter "id" is required' })
        }
        const detail = await getPlaylistDetail(Number(id))
        return send(res, 200, { ok: true, ...detail }, 120)
      }

      if (route === '/user/record') {
        const uid = url.searchParams.get('uid')
        if (!uid) {
          return send(res, 400, { ok: false, code: 'bad_request', error: 'Query parameter "uid" is required' })
        }
        const type = url.searchParams.get('type') === '0' ? 0 : 1
        const record = await getUserRecord(Number(uid), type)
        return send(res, 200, { ok: true, record, uid: Number(uid) }, 30)
      }

      if (route === '/lyric') {
        const id = url.searchParams.get('id')
        if (!id) {
          return send(res, 400, { ok: false, code: 'bad_request', error: 'Query parameter "id" is required' })
        }
        const lrc = await getLyric(Number(id))
        return send(res, 200, { ok: true, lyric: lrc }, 300)
      }

      return send(res, 404, { ok: false, code: 'unknown_route', error: 'Unknown route' })
    } catch (err) {
      const status = err instanceof NeteaseError ? err.status : 500
      const code = err instanceof NeteaseError ? err.code : 'internal_error'
      if (status >= 500 && status !== 503) {
        console.error('[netease-api]', err)
      }
      return send(res, status, {
        ok: false,
        code,
        error: err instanceof Error ? err.message : 'Unexpected error',
      })
    }
  }
}
```

**注意:** `send()` 辅助函数已在 `server/api.mjs` 中定义，直接复用，不需要新增。

---

### Task 4: 在 server.js 中挂载 neteaseApi

**文件:**
- 修改: `server.js`

**接口:**
- 消费: `neteaseApi` from `./server/api.mjs`
- 消费: `isNeteaseConfigured` from `./server/netease.mjs`

完整修改内容：

```js
// server.js — 在现有 import 后追加
import { steamApi, neteaseApi } from './server/api.mjs'
import { isConfigured } from './server/steam.mjs'
import { isNeteaseConfigured } from './server/netease.mjs'

// ... 现有 loadEnv ...

// 在 app.use(steamApi()) 之后新增：
app.use(neteaseApi())

// 在启动日志中新增：
if (!isNeteaseConfigured()) {
  console.warn('[netease-api] NETEASE_COOKIE missing — search/play still works but quality may be lower.')
}
```

- [ ] **Step 1: 修改 `server.js` 的 import 行**

将 `import { steamApi } from './server/api.mjs'` 改为 `import { steamApi, neteaseApi } from './server/api.mjs'`

- [ ] **Step 2: 新增 netease 的 import**

将 `import { isConfigured } from './server/steam.mjs'` 之后新增 `import { isNeteaseConfigured } from './server/netease.mjs'`

- [ ] **Step 3: 新增 neteaseApi 中间件**

在 `app.use(steamApi())` 之后新增 `app.use(neteaseApi())`

- [ ] **Step 4: 新增启动警告日志**

在现有的 `if (!isConfigured())` 块之后新增 netease 警告

---

### Task 5: 在 Vite dev server 中挂载 neteaseApi

**文件:**
- 修改: `vite.config.ts`

在现有 `steamApiPlugin` 旁边新增 `neteaseApiPlugin`：

```ts
// vite.config.ts — 在 steamApiPlugin() 之后新增

/**
 * Mount the NetEase Cloud Music API proxy on the dev server.
 */
function neteaseApiPlugin(): Plugin {
  return {
    name: 'netease-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(neteaseApi())
    },
  }
}

// 在 plugins 数组中新增：
plugins: [react(), tailwindcss(), steamApiPlugin(), neteaseApiPlugin()],
```

- [ ] **Step 1: 新增 import**

将 `import { steamApi } from './server/api.mjs'` 改为 `import { steamApi, neteaseApi } from './server/api.mjs'`

- [ ] **Step 2: 新增 `neteaseApiPlugin` 函数**

复制上面的完整函数，放在 `steamApiPlugin` 之后

- [ ] **Step 3: 在 `plugins` 数组中注册**

---

### Task 6: 新增站点配置

**文件:**
- 修改: `src/site.config.ts`

在现有 `steam` 配置下方新增 `netease` 配置。类型新增在 `SiteConfig` 接口中，值新增在 `SITE_CONFIG` 对象中，同时在中英文字符串中新增 netease 相关 key。

```ts
// 在 SiteConfig 类型中新增（steam 之后）:
netease: {
  /** master switch for the NetEase card + player */
  enabled: boolean
  /** your NetEase Cloud Music user ID */
  uid: number
  /** playlist IDs to show as recommended tabs */
  playlistIds: number[]
  /** polling interval in seconds */
  refreshSeconds: number
  /** override when the proxy is hosted on another origin */
  apiBase: string
}

// 在 SITE_CONFIG 中新增（steam 之后）:
netease: {
  enabled: true,
  uid: 0,  // 用户填入自己的 UID
  playlistIds: [],  // 用户填入推荐歌单 ID
  refreshSeconds: 60,
  apiBase: '/api/netease',
},

// 在 SITE_CONFIG.strings.zh 中新增:
'netease.title': '网易云音乐',
'netease.loading': '正在连接…',
'netease.error': '暂时拿不到数据',
'netease.playing': '正在听',
'netease.recent': '最近在听',
'netease.noRecent': '最近没有听歌记录',
'netease.refresh': '立即刷新',
'netease.profileLink': '打开网易云主页',
'netease.updated': '更新于',
'netease.search': '搜索歌曲或歌手…',
'netease.noResults': '没有找到相关歌曲',
'netease.playlists': '推荐歌单',
'netease.lyrics': '歌词',
'netease.noLyrics': '暂无歌词',

// 在 SITE_CONFIG.strings.en 中新增:
'netease.title': 'NetEase Music',
'netease.loading': 'Connecting…',
'netease.error': 'Data unavailable',
'netease.playing': 'Now playing',
'netease.recent': 'Recently played',
'netease.noRecent': 'No recent plays',
'netease.refresh': 'Refresh now',
'netease.profileLink': 'Open NetEase profile',
'netease.updated': 'updated',
'netease.search': 'Search songs or artists…',
'netease.noResults': 'No songs found',
'netease.playlists': 'Playlists',
'netease.lyrics': 'Lyrics',
'netease.noLyrics': 'No lyrics available',
```

---

### Task 7: 创建前端 API 客户端和 hooks

**文件:**
- 创建: `src/lib/netease.ts`

**接口:**
- 消费: `SITE_CONFIG.netease` from `../site.config`
- 产出:
  - `export type NeteaseSong { id, name, artists, album, cover, duration, url }`
  - `export type NeteasePlaylist { id, name, cover, trackCount, tracks }`
  - `export type NeteaseRecordItem { playCount, song }`
  - `export class NeteaseRequestError extends Error { code }`
  - `export async function fetchNeteaseSearch(kw, limit?, signal?): Promise<NeteaseSong[]>`
  - `export async function fetchNeteaseSongUrl(id, br?, signal?): Promise<string | null>`
  - `export async function fetchNeteasePlaylist(id, signal?): Promise<NeteasePlaylist>`
  - `export async function fetchNeteaseUserRecord(uid, type?, signal?): Promise<NeteaseRecordItem[]>`
  - `export async function fetchNeteaseLyric(id, signal?): Promise<string | null>`
  - `export function useNeteaseRecord(uid, options?): UseNeteaseRecordResult`

```ts
// src/lib/netease.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { SITE_CONFIG } from '../site.config'

export type NeteaseArtist = { id: number; name: string }

export type NeteaseSong = {
  id: number
  name: string
  artists: NeteaseArtist[]
  album: string
  cover: string
  duration: number
  url: string | null
}

export type NeteasePlaylist = {
  id: number
  name: string
  cover: string
  trackCount: number
  tracks: NeteaseSong[]
}

export type NeteaseRecordItem = {
  playCount: number
  song: NeteaseSong
}

// ── fetch helpers ─────────────────────────────────────────

const cfg = () => SITE_CONFIG.netease

async function apiGet<T>(
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const base = cfg().apiBase.replace(/\/+$/, '')
  const url = new URL(`${base}${path}`, window.location.origin)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })
  let body: any = null
  try { body = await res.json() } catch {
    throw new NeteaseRequestError(`Bad response (${res.status})`, 'bad_response')
  }
  if (!res.ok || !body?.ok) {
    throw new NeteaseRequestError(
      body?.error ?? `Request failed with ${res.status}`,
      body?.code ?? 'request_failed',
    )
  }
  return body as T
}

export class NeteaseRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'NeteaseRequestError'
    this.code = code
  }
}

// ── API functions ─────────────────────────────────────────

export async function fetchNeteaseSearch(
  kw: string,
  limit = 20,
  signal?: AbortSignal,
): Promise<NeteaseSong[]> {
  const data = await apiGet<{ ok: true; songs: NeteaseSong[] }>(
    '/search', { kw, limit }, signal,
  )
  return data.songs
}

export async function fetchNeteaseSongUrl(
  id: number,
  br = 320000,
  signal?: AbortSignal,
): Promise<string | null> {
  const data = await apiGet<{ ok: true; url: string | null }>(
    '/song/url', { id, br }, signal,
  )
  return data.url
}

export async function fetchNeteasePlaylist(
  id: number,
  signal?: AbortSignal,
): Promise<NeteasePlaylist> {
  const data = await apiGet<NeteasePlaylist & { ok: true }>(
    '/playlist/detail', { id }, signal,
  )
  const { ok, ...playlist } = data as any
  return playlist as NeteasePlaylist
}

export async function fetchNeteaseUserRecord(
  uid: number,
  type: 0 | 1 = 1,
  signal?: AbortSignal,
): Promise<NeteaseRecordItem[]> {
  const data = await apiGet<{ ok: true; record: NeteaseRecordItem[] }>(
    '/user/record', { uid, type }, signal,
  )
  return data.record
}

export async function fetchNeteaseLyric(
  id: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const data = await apiGet<{ ok: true; lyric: string | null }>(
    '/lyric', { id }, signal,
  )
  return data.lyric
}

// ── hook: useNeteaseRecord ────────────────────────────────

type UseNeteaseRecordOptions = {
  enabled?: boolean
  intervalMs?: number
}

export type UseNeteaseRecordResult = {
  data: NeteaseRecordItem[] | null
  loading: boolean
  error: NeteaseRequestError | null
  refresh: () => void
}

export function useNeteaseRecord(
  uid: number,
  { enabled = true, intervalMs = 60_000 }: UseNeteaseRecordOptions = {},
): UseNeteaseRecordResult {
  const [data, setData] = useState<NeteaseRecordItem[] | null>(null)
  const [loading, setLoading] = useState(enabled && Boolean(uid))
  const [error, setError] = useState<NeteaseRequestError | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!enabled || !uid) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const record = await fetchNeteaseUserRecord(uid, 1, controller.signal)
      if (controller.signal.aborted) return
      setData(record)
      setError(null)
    } catch (err) {
      if (controller.signal.aborted) return
      if (err instanceof Error && err.name === 'AbortError') return
      setError(
        err instanceof NeteaseRequestError
          ? err
          : new NeteaseRequestError(
              err instanceof Error ? err.message : 'Request failed',
              'network_error',
            ),
      )
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [enabled, uid])

  useEffect(() => {
    if (!enabled || !uid) { setLoading(false); return }
    setLoading(true)
    void load()

    const tick = () => {
      if (document.visibilityState === 'hidden') return
      void load()
    }
    const timer = window.setInterval(tick, Math.max(15_000, intervalMs))

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      abortRef.current?.abort()
    }
  }, [enabled, uid, intervalMs, load])

  const refresh = useCallback(() => { void load() }, [load])

  return { data, loading, error, refresh }
}

export function formatPlaytime(seconds: number, lang: 'zh' | 'en'): string {
  if (!seconds) return lang === 'zh' ? '未听' : 'never'
  if (seconds < 60) return `${seconds}${lang === 'zh' ? ' 秒' : 's'}`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}${lang === 'zh' ? ' 分钟' : ' min'}`
  const hours = minutes / 60
  const value = hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10
  return `${value}${lang === 'zh' ? ' 小时' : ' h'}`
}

export function formatAgo(timestampMs: number, lang: 'zh' | 'en'): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000))
  if (seconds < 10) return lang === 'zh' ? '刚刚' : 'just now'
  if (seconds < 60) return lang === 'zh' ? `${seconds} 秒前` : `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return lang === 'zh' ? `${minutes} 分钟前` : `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return lang === 'zh' ? `${hours} 小时前` : `${hours}h ago`
}
```

---

### Task 8: 创建 FloatingNetease 音乐动态卡片

**文件:**
- 创建: `src/components/FloatingNetease.tsx`

**接口:**
- 消费: `useNeteaseRecord`, `NeteaseSong`, `NeteaseRecordItem`, `formatAgo`, `NeteaseRequestError` from `../lib/netease`
- 消费: `useLang`, `StringKey` from `../i18n`
- 消费: `SITE_CONFIG` from `../site.config`
- 产出: `export default function FloatingNetease()`

完整组件代码，完全复制 FloatingSteam 的动画和布局模式：

```tsx
// src/components/FloatingNetease.tsx
import { useState } from 'react'
import { ExternalLink, Music, RefreshCw } from 'lucide-react'
import { useLang, type StringKey } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { useNeteaseRecord, formatAgo, type NeteaseRecordItem } from '../lib/netease'

const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '270ms'

const SILENT_CODES = new Set(['bad_response', 'unknown_route'])

function artistNames(item: NeteaseRecordItem) {
  return item.song.artists.map((a) => a.name).join(' / ')
}

export default function FloatingNetease() {
  const cfg = SITE_CONFIG.netease
  const { t, lang } = useLang()
  const [collapsed, setCollapsed] = useState(true)

  const enabled = cfg.enabled && Boolean(cfg.uid)
  const { data, error, loading, refresh } = useNeteaseRecord(cfg.uid, {
    enabled,
    intervalMs: Math.max(15, cfg.refreshSeconds) * 1000,
  })

  if (!enabled) return null
  if (!data && error && SILENT_CODES.has(error.code)) return null

  const topSong = data?.[0] ?? null
  const hasData = Boolean(data?.length)
  const profileUrl = `https://music.163.com/#/user/home?id=${cfg.uid}`

  const dot = hasData ? 'bg-accent dot-breathe' : error ? 'bg-amber' : 'bg-dim'

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`relative z-50 origin-bottom-right scale-[1.2] overflow-hidden rounded-2xl border bg-ink/80 shadow-xl backdrop-blur-md ${
        collapsed ? 'w-16 border-transparent' : 'w-[340px] border-ink-2/20'
      }`}
      style={{
        transitionProperty: 'width, border-color',
        transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
        transitionTimingFunction: EASE,
      }}
    >
      {/* header: cover + identity */}
      <div
        className="flex items-stretch"
        style={{
          gap: collapsed ? '0px' : '12px',
          padding: collapsed ? '0px' : '12px',
          transitionProperty: 'gap, padding',
          transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
          transitionTimingFunction: EASE,
        }}
      >
        <a
          href={profileUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={t('netease.profileLink')}
          className={`relative size-16 shrink-0 overflow-hidden bg-ink-2 ${
            collapsed ? '-m-px rounded-2xl' : 'rounded-xl border border-ink-2/20'
          }`}
          style={{
            transitionProperty: 'border-radius, border-color',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
          }}
        >
          {topSong?.song.cover ? (
            <img src={topSong.song.cover} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-accent">
              <Music className="size-6" />
            </span>
          )}

          <span
            className={`absolute bottom-[5px] right-[5px] block size-2.5 rounded-full ring-2 ring-ink ${dot}`}
          />
        </a>

        <div
          className="flex min-w-0 flex-col justify-center overflow-hidden"
          style={{
            width: collapsed ? '0px' : '244px',
            opacity: collapsed ? 0 : 1,
            transform: collapsed ? 'translateX(-10px)' : 'translateX(0px)',
            transitionProperty: 'width, opacity, transform',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
            transitionDelay: collapsed ? '0ms' : '90ms',
          }}
        >
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            {t('netease.title')}
          </p>
          <p className="truncate text-sm font-semibold text-paper">
            {loading ? t('netease.loading') : hasData ? topSong!.song.name : t('netease.error')}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-dim">
            {hasData ? artistNames(topSong!) : error ? t('netease.error') : '—'}
          </p>
        </div>
      </div>

      {/* body: record list */}
      <div
        className="grid"
        style={{
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          opacity: collapsed ? 0 : 1,
          transitionProperty: 'grid-template-rows, opacity',
          transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
          transitionTimingFunction: EASE,
          transitionDelay: collapsed ? '0ms' : '120ms',
        }}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 px-3 pb-3">
            {error && !data && (
              <p className="rounded-xl border border-line bg-ink-2/40 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-amber">
                {error.message}
              </p>
            )}

            {data && (
              <>
                {/* 最近在听 */}
                <div>
                  <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
                    {t('netease.recent')}
                  </p>
                  {data.length === 0 ? (
                    <p className="font-mono text-[10px] text-dim">{t('netease.noRecent')}</p>
                  ) : (
                    <ul className="space-y-1 max-h-[180px] overflow-y-auto no-scrollbar">
                      {data.slice(0, 8).map((item) => (
                        <li key={item.song.id}>
                          <a
                            href={`https://music.163.com/#/song?id=${item.song.id}`}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="flex items-center gap-2 rounded-lg p-1 transition-colors duration-200 ease-[var(--ease-out)] hover:bg-ink-2/10"
                          >
                            <img
                              src={item.song.cover}
                              alt=""
                              loading="lazy"
                              className="h-7 w-7 shrink-0 rounded-sm object-cover"
                            />
                            <span className="min-w-0 flex-1 truncate text-[11px] text-paper">
                              {item.song.name}
                            </span>
                            <span className="shrink-0 truncate max-w-[80px] font-mono text-[10px] text-dim">
                              {artistNames(item)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              </>
            )}

            {/* footer */}
            <div className="flex items-center justify-between border-t border-ink-2/20 pt-2">
              <span className="truncate font-mono text-[9px] text-dim">
                {data ? `${t('netease.updated')} ${formatAgo(Date.now(), lang)}` : ''}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={refresh}
                  aria-label={t('netease.refresh')}
                  title={t('netease.refresh')}
                  className="grid size-6 place-items-center rounded text-dim transition-colors hover:text-accent disabled:opacity-40 press-sm"
                >
                  <RefreshCw className="size-3" />
                </button>
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={t('netease.profileLink')}
                  title={t('netease.profileLink')}
                  className="grid size-6 place-items-center rounded text-dim transition-colors hover:text-accent press-sm"
                >
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

### Task 9: 改造 FloatingPlayer 为网易云搜索+歌单播放器

**文件:**
- 修改: `src/components/FloatingPlayer.tsx`

**接口:**
- 消费: `useBgm` from `./AudioProvider`
- 消费: `SITE_CONFIG` from `../site.config`
- 消费: `fetchNeteaseSearch`, `fetchNeteaseSongUrl`, `fetchNeteasePlaylist`, `NeteaseSong`, `NeteasePlaylist` from `../lib/netease`
- 消费: `useLang` from `../i18n`

这是最大的改动。完整重写该组件，新增搜索框、歌单标签、歌曲列表，保留现有播放控制和进度条。

```tsx
// src/components/FloatingPlayer.tsx — 完整替换
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Music, Volume2, VolumeX, Search, ListMusic } from 'lucide-react'
import { useBgm } from './AudioProvider'
import { SITE_CONFIG } from '../site.config'
import { useLang } from '../i18n'
import {
  fetchNeteaseSearch,
  fetchNeteaseSongUrl,
  fetchNeteasePlaylist,
  type NeteaseSong,
  type NeteasePlaylist,
} from '../lib/netease'

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '350ms'
const DEBOUNCE_MS = 400

export default function FloatingPlayer() {
  const { t, lang } = useLang()
  const {
    available,
    playing,
    toggle,
    currentTime,
    duration,
    seek,
    volume,
    setVolume,
    muted,
    toggleMute,
    meta,
    setTrack,
  } = useBgm()

  const cfg = SITE_CONFIG.netease
  const neteaseEnabled = cfg.enabled

  const [collapsed, setCollapsed] = useState(true)
  const [searchKw, setSearchKw] = useState('')
  const [searchResults, setSearchResults] = useState<NeteaseSong[]>([])
  const [searching, setSearching] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // playlist state
  const [playlists, setPlaylists] = useState<NeteasePlaylist[]>([])
  const [activePlaylistIdx, setActivePlaylistIdx] = useState(0)
  const [playlistSongs, setPlaylistSongs] = useState<NeteaseSong[]>([])
  const [loadingPlaylist, setLoadingPlaylist] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // load initial playlists
  useEffect(() => {
    if (!neteaseEnabled || cfg.playlistIds.length === 0) return
    const loadPlaylists = async () => {
      setLoadingPlaylist(true)
      const results = await Promise.allSettled(
        cfg.playlistIds.map((id) => fetchNeteasePlaylist(id)),
      )
      const loaded = results
        .filter((r): r is PromiseFulfilledResult<NeteasePlaylist> => r.status === 'fulfilled')
        .map((r) => r.value)
      setPlaylists(loaded)
      setLoadingPlaylist(false)
    }
    void loadPlaylists()
  }, [neteaseEnabled, cfg.playlistIds])

  // when active playlist changes, show its tracks
  useEffect(() => {
    if (playlists.length > 0 && activePlaylistIdx < playlists.length) {
      setPlaylistSongs(playlists[activePlaylistIdx].tracks)
    }
  }, [playlists, activePlaylistIdx])

  // debounced search
  const doSearch = useCallback(
    (kw: string) => {
      if (!kw.trim()) {
        setSearchResults([])
        return
      }
      setSearching(true)
      fetchNeteaseSearch(kw, 20)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    },
    [],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(searchKw), DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchKw, doSearch])

  const playSong = useCallback(
    async (song: NeteaseSong) => {
      // try to get URL & play
      try {
        const url = await fetchNeteaseSongUrl(song.id)
        if (url) {
          setTrack({
            title: song.name,
            artist: song.artists.map((a) => a.name).join(' / '),
            cover: song.cover,
            url,
          })
        } else {
          // fallback: try with lower bitrate
          const urlLow = await fetchNeteaseSongUrl(song.id, 128000)
          if (urlLow) {
            setTrack({
              title: song.name,
              artist: song.artists.map((a) => a.name).join(' / '),
              cover: song.cover,
              url: urlLow,
            })
          }
        }
      } catch {
        // ignore - song won't play
      }
    },
    [setTrack],
  )

  // song list to display
  const displaySongs: NeteaseSong[] = searchKw.trim() ? searchResults : playlistSongs
  const showList = neteaseEnabled && !collapsed

  if (!available && !neteaseEnabled) return null

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`relative z-50 origin-bottom-right scale-[1.2] overflow-hidden rounded-2xl border bg-ink/80 shadow-xl backdrop-blur-md ${
        collapsed ? 'w-16 border-transparent' : 'w-[316px] border-ink-2/20'
      }`}
      style={{
        transitionProperty: 'width, border-color',
        transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
        transitionTimingFunction: EASE,
        borderWidth: collapsed ? '0px' : '1px',
      }}
    >
      <div
        className="flex flex-col"
        style={{
          gap: collapsed ? '0px' : '8px',
          padding: collapsed ? '0px' : '10px',
          transitionProperty: 'gap, padding',
          transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
          transitionTimingFunction: EASE,
        }}
      >
        {/* top row: cover + info (always visible) */}
        <div className="flex items-stretch" style={{ gap: collapsed ? '0px' : '12px' }}>
          <button
            onClick={toggle}
            aria-label={playing ? '暂停' : '播放'}
            className={`relative size-16 shrink-0 overflow-hidden bg-ink-2 press-md ${
              collapsed ? 'rounded-2xl' : 'rounded-xl border border-ink-2/20'
            }`}
            style={{
              transitionProperty: 'border-radius, border-color',
              transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
              transitionTimingFunction: EASE,
            }}
          >
            {meta.cover ? (
              <img src={meta.cover} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-accent">
                <Music className="size-6" />
              </span>
            )}
            {collapsed && (
              <span className="absolute inset-x-[5px] bottom-[5px] block h-[3px] rounded-full bg-black/40">
                <span
                  className="bg-gradient-accent block h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </span>
            )}
          </button>

          <div
            className="flex min-w-0 flex-col overflow-hidden"
            style={{
              width: collapsed ? '0px' : '212px',
              height: collapsed ? '0px' : 'auto',
              opacity: collapsed ? 0 : 1,
              transform: collapsed ? 'translateX(-10px)' : 'translateX(0px)',
              transitionProperty: 'width, height, opacity, transform',
              transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
              transitionTimingFunction: EASE,
              transitionDelay: collapsed ? '0ms' : '60ms',
            }}
          >
            <p className="truncate font-mono text-xs tracking-wide text-paper">
              {meta.title}
            </p>
            {meta.artist && (
              <p className="truncate font-mono text-[10px] text-dim">{meta.artist}</p>
            )}
            {/* progress bar */}
            <div className="mt-1.5 flex items-center gap-2">
              <span className="w-8 text-right font-mono text-[10px] text-dim">
                {fmt(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="h-1 flex-1"
                aria-label="播放进度"
              />
              <span className="w-8 font-mono text-[10px] text-dim">
                {fmt(duration)}
              </span>
            </div>
            {/* play + volume */}
            <div className="mt-1.5 flex items-center justify-center gap-3">
              <button
                onClick={toggle}
                aria-label={playing ? '暂停' : '播放'}
                className="bg-gradient-accent grid size-8 shrink-0 place-items-center rounded-full text-ink shadow-lg transition-transform duration-150 ease-[var(--ease-out)] hover:scale-105 active:scale-95"
              >
                {playing ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="size-3.5 translate-x-[1px]" />
                )}
              </button>
              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  onClick={toggleMute}
                  aria-label={muted ? '取消静音' : '静音'}
                  className={`shrink-0 transition-colors press-sm ${
                    muted ? 'text-amber' : 'text-dim hover:text-paper'
                  }`}
                >
                  {muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-1 w-14"
                  aria-label="音量"
                />
                <span className="w-6 shrink-0 font-mono text-[10px] text-dim">
                  {Math.round(volume * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* expanded section: search + song list */}
        {showList && (
          <div className="flex flex-col gap-2 overflow-hidden">
            {/* search bar */}
            <div className="flex items-center gap-2 rounded-lg border border-ink-2/20 bg-ink-2/40 px-2.5 py-1.5">
              <Search className="size-3.5 shrink-0 text-dim" />
              <input
                type="text"
                value={searchKw}
                onChange={(e) => setSearchKw(e.target.value)}
                placeholder={t('netease.search')}
                className="flex-1 bg-transparent font-mono text-[11px] text-paper placeholder:text-dim/60 outline-none"
              />
              {searching && (
                <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              )}
            </div>

            {/* playlist tabs (only when not searching) */}
            {!searchKw.trim() && playlists.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {playlists.map((pl, idx) => (
                  <button
                    key={pl.id}
                    onClick={() => setActivePlaylistIdx(idx)}
                    className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors press-sm ${
                      idx === activePlaylistIdx
                        ? 'bg-accent/20 text-accent'
                        : 'bg-ink-2/40 text-dim hover:text-paper'
                    }`}
                  >
                    {loadingPlaylist ? '…' : pl.name}
                  </button>
                ))}
              </div>
            )}

            {/* song list */}
            <div className="max-h-[200px] overflow-y-auto no-scrollbar -mx-1">
              {displaySongs.length === 0 ? (
                <p className="px-1 py-4 text-center font-mono text-[10px] text-dim">
                  {searchKw.trim()
                    ? t('netease.noResults')
                    : loadingPlaylist
                      ? t('netease.loading')
                      : t('netease.noResults')}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {displaySongs.map((song) => (
                    <li key={song.id}>
                      <button
                        onClick={() => { void playSong(song) }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-200 ease-[var(--ease-out)] hover:bg-ink-2/10 press-sm"
                      >
                        <img
                          src={song.cover}
                          alt=""
                          loading="lazy"
                          className="size-8 shrink-0 rounded object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-paper">
                          {song.name}
                        </span>
                        <span className="shrink-0 truncate max-w-[90px] font-mono text-[10px] text-dim">
                          {song.artists.map((a) => a.name).join('/')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### Task 10: 更新 AudioProvider 支持远程 URL 队列

**文件:**
- 修改: `src/components/AudioProvider.tsx`

**接口:**
- 消费: `SITE_CONFIG.audio` 和 `SITE_CONFIG.netease` from `../site.config`
- 产出 (增): `setTrack` 已存在，需增加支持网络 URL 自动播放
- 产出 (增): `showLocalBgm` — 当无网易云功能启用时是否显示本地 BGM

核心改动很小 — AudioProvider 的 `setTrack` 已经接受任意 URL。我们只需要保证网络 URL 在没有 Proxy 限制的情况下能正常播放。

```tsx
// 在 AudioProvider 中修改 current 的计算逻辑

// 原来: const current = track ?? homeTrack
// 改为: 先检查 track override，再检查 home BGM

// 在 return 的 context value 中新增:
showLocalBgm: !SITE_CONFIG.netease.enabled && available,
```

完整修改：在 `AudioCtx` 类型中新增 `showLocalBgm: boolean`，在 context value 中新增。

实际上改动量很小，主要变更点：

1. `AudioCtx` 类型新增 `showLocalBgm: boolean`
2. context value 新增 `showLocalBgm: Boolean(!SITE_CONFIG.netease.enabled && available)`
3. 确保 Audio 元素的 CORS 设置（网络 URL 可能需要）: `el.crossOrigin = 'anonymous'`

- [ ] **Step 1: 在 AudioCtx 类型中新增 `showLocalBgm`**

```ts
type AudioCtx = {
  // ... existing fields ...
  showLocalBgm: boolean  // 新增
}
```

- [ ] **Step 2: 在 context value 中设置 `showLocalBgm`**

```ts
// 在 return <Ctx.Provider value={{ ... }}> 中新增:
showLocalBgm: Boolean(!SITE_CONFIG.netease.enabled && available),
```

- [ ] **Step 3: 在 Audio 元素创建时设置 CORS**

在 `useEffect` 创建 Audio 元素处新增一行：

```ts
el.crossOrigin = 'anonymous'  // 允许播放跨域音频 URL（网易云 CDN）
```

放在 `el.preload = 'auto'` 之后。

---

### Task 11: 在 App.tsx 中注册 FloatingNetease

**文件:**
- 修改: `src/App.tsx`

**接口:**
- 消费: `FloatingNetease` from `./components/FloatingNetease`

- [ ] **Step 1: 新增 import**

在现有 `import FloatingSteam from './components/FloatingSteam'` 之后新增：

```tsx
import FloatingNetease from './components/FloatingNetease'
```

- [ ] **Step 2: 在 FloatingLayer 中注册**

在 FloatingLayer 的 children 中新增 `<FloatingNetease />`，放在 FloatingPlayer 和 FloatingSteam 之间：

```tsx
<FloatingLayer>
  <FloatingPlayer />
  <FloatingNetease />
  <FloatingSteam />
</FloatingLayer>
```

注意：由于 FloatingLayer 使用 `flex-col-reverse`，中间插入的 FloatingNetease 会在视觉上位于 FloatingPlayer 上方、FloatingSteam 下方。

---

### Task 12: 更新 .env.example

**文件:**
- 修改: `.env.example`

```bash
# 在现有 STEAM_API_KEY 之后新增：

# 网易云音乐 Cookie（可选）
# 登录 music.163.com 后，从浏览器 DevTools → Application → Cookies 获取 MUSIC_U
# 不配置也可使用，但音质会降级。此值只存在于服务端，不会泄漏到前端。
NETEASE_COOKIE=
```

---

### Task 13: 端到端验证

- [ ] **Step 1: 启动 dev 服务器**

```bash
npm run dev
```

- [ ] **Step 2: 验证健康检查**

```
curl http://localhost:5173/api/netease/health
```

预期: `{"ok":true,"configured":false}`

- [ ] **Step 3: 验证搜索 API**

```
curl "http://localhost:5173/api/netease/search?kw=hello&limit=3"
```

预期: 返回带 `ok:true` 和 `songs` 数组的 JSON

- [ ] **Step 4: 验证歌单 API**

```
curl "http://localhost:5173/api/netease/playlist/detail?id=3778678"
```

预期: 返回歌单数据

- [ ] **Step 5: 浏览器验证**

打开 http://localhost:5173，确认：
- 右下角三个卡片垂直排列（FloatingPlayer、FloatingNetease、FloatingSteam）
- FloatingPlayer hover 展开显示搜索框和歌单歌曲
- FloatingNetease hover 展开显示听歌记录
- 点击歌曲可以播放
- 播放进度条工作正常
