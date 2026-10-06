# 首页公开访问统计 · 设计文档

> 2026-10-05 · MIKU DA YO

## 目标

站点目前没有任何访问统计。本次新增一个极小的统计模块，把访问量**公开**展示在首页 Hero 已有的统计数据行里，作为一种"有多少人来看过这里"的表达。

**只做两个数字**：累计访问次数、今日访问次数。

## 范围

### 做

- 累计访问次数 + 今日访问次数，只有这两个数字
- 公开显示在首页 Hero 已有的 `<dl>` 统计行里（不新做 UI 块）
- 口径 = pageview（每次页面**加载**算一次）
- 站长的访问也计入（明确"都算，不用管"）

### 不做（明确排除）

- 图表 / 趋势图 / 排行榜 / "哪篇文章最受欢迎"
- 去重的独立访客数（UV / cookie 去重）
- 任何鉴权、登录、管理界面（数据本来就公开）
- 存储 IP（含脱敏 IP）——合规要求
- 来源、设备、地区分析

## 架构

```
Hero.tsx (<dl> 追加两格)
   └─ AnimatedCount ← useStats() ← src/lib/stats.ts
                                    ├─ POST /api/stats/hit      (计数 + 返回最新值)
                                    └─ GET  /api/stats/summary  (只读，降级路径)
                                          ↓
                        server/stats.mjs (Express / Vite dev 共用)
                                          ↓
                        data/stats.json  (内存计数 + 延迟落盘)
```

沿用项目既有的「客户端逻辑 + 中间件同文件」形态，与 `server/bilibili.mjs` 一致。

## API 路由

| 路由 | 方法 | 返回 | Cache-Control |
|------|------|------|---------------|
| `/api/stats/health` | GET/HEAD | `{ ok:true, configured:true }` | `no-store` |
| `/api/stats/summary` | GET/HEAD | `{ ok:true, total, today, date }` | `no-store` |
| `/api/stats/hit` | POST | `{ ok:true, total, today, date }` | `no-store` |

`/hit` 不读请求体（前端发空 body），因此不需要 `express.json()`。防御性调用 `req.resume()`。

错误码：`unknown_route`（404）、`method_not_allowed`（405）、`internal_error`（500）。方法白名单 `GET`/`HEAD`/`POST`。

## 关键决策

### 存储：内存计数 + 延迟落盘（单文件）

- 进程启动时读一次 `data/stats.json` 进内存，此后 `/summary` 与 `/hit` 都是**纯内存 O(1)** 读写，不读盘。因此不需要复用 `server/steam.mjs` 的 `createCache`（那是给异步 producer 缓存结果用的，这里是常驻内存值）。
- 每次 hit 只改内存；用 1500ms debounce 合并写盘；`SIGINT`/`SIGTERM`/`exit` 时同步 flush。PM2 `restart`/`stop` 默认发 SIGINT，**正常重启不丢数据**。
- 写盘用「临时文件 + `renameSync`」原子替换，避免半截文件。
- 单进程单线程，同步读改写无竞态。前提：PM2 保持 **fork 模式、`instances=1`**。

**可接受的数据丢失边界**：`kill -9` 或断电最多丢一个 debounce 窗口（≤1500ms）的计数。

**为什么不每次写盘**：写放大，且文件无限增长（一年几十 MB），还要轮转逻辑。本量级（日均几十～几百次）用不上。

**为什么不按天分文件**：为两个数字引入多文件体系属于过度设计；跨零点与总量累加反而更复杂。

### 计数时机：客户端 POST，而非服务端对每个请求计数

- 搜索引擎爬虫、链接 prefetch、不执行 JS 的机器人**天然不计入**，数字更干净。
- 不会把静态资源、其它 `/api/*` 请求、健康检查算进去。
- 服务端在 `/hit` 响应里顺手返回最新数字，前端一次请求即可显示，无需额外的 `/summary` 调用。

用 **POST** 而非 GET：GET 会被爬虫/预取器自动发出从而虚增计数。

**口径说明**：SPA 内部翻页不重新加载文档，所以"一次访问" = 一次页面加载；站内翻多少篇文章都只算一次，刷新算新的一次。所有路由（`/`、`/lofi` 等）都计数。

### 时区：固定 +08:00

中国无夏令时，固定偏移永久正确，零依赖：

```js
const CN_OFFSET_MS = 8 * 60 * 60 * 1000
/** 'YYYY-MM-DD' in Asia/Shanghai. */
const cnDateKey = (ts = Date.now()) => new Date(ts + CN_OFFSET_MS).toISOString().slice(0, 10)
```

**禁止**用 `new Date().toISOString().slice(0,10)`——那是 UTC 日期，北京时间 00:00–08:00 会错一天。

跨零点在两处处理：

- `hit` 时 `cnDateKey()` 变化 → 先 `today = 0` 再自增。
- `/summary` 读取时**再算一次**：日期不符则 `today = 0`。这样零点后即使还没有新 hit，也不会把昨天的数字显示成"今日"（只读不改盘）。

### 数据文件

`data/stats.json`，路径由 `import.meta.url` 推导，**不依赖 `process.cwd()`**（PM2 的 cwd 不保证）。

```json
{ "total": 12345, "today": 67, "date": "2026-10-05", "updatedAt": "2026-10-05T08:12:00.000Z" }
```

- 不在 `dist/` 内 → `npm run build` 不覆盖
- 不在 `src/` 内 → 不参与打包
- 加进 `.gitignore` → 不污染 git

启动载入时归一化：若文件里的 `date !== cnDateKey(now)` → 置 `today = 0, date = cnDateKey(now)`，避免把昨天的"今日"当今天显示。文件缺失或损坏 → 视为 `{ total:0, today:0 }` 并 warn，**不抛错、不阻塞 server.js 启动**。

## 前端

### `src/lib/stats.ts`

照 `src/lib/bilibili.ts` 骨架（各自持有 fetch；`src/lib/base.ts` 只是 `withBase` 资源路径工具，不参与）。类型就地定义。

- `StatsPayload = { ok:true; total:number; today:number; date:string }`
- `StatsRequestError extends Error { code: string }`
- `STATS_SILENT_CODES = new Set(['bad_response', 'unknown_route', 'method_not_allowed'])`（对齐 `bilibili.ts` 的 `BILI_SILENT_CODES`）
- `recordVisit()` → POST；`fetchStatsSummary()` → GET；`useStats()` → `{ data, error, silent, loading }`

Hook **只请求一次，不轮询**（两个数字不需要实时）。主路径 `recordVisit()`；失败退回 `fetchStatsSummary()`；两者都失败且 code 属 silent → `silent = true`。

**StrictMode 防双计**：`src/main.tsx` 开着 `<StrictMode>`，React 19 dev 下 effect 会「挂载→卸载→再挂载」。用**模块级单例 Promise** 去重（比 `useRef` 守卫更稳，同时覆盖同页多组件引用）。POST 前检查 `document.visibilityState === 'visible'`。

### Hero 接入

**关键坑**：`Hero.tsx` 的 GSAP 数字滚动在 `useGSAP` 里**同步**遍历 `[data-count]`，而统计值是**异步**到达的——那时 effect 早已跑完，塞进 `[data-count]` 只会静态显示、不滚动。

因此新增自治组件 `AnimatedCount`（自己在 effect 里从 0 滚到 `value`），**不复用**现有的 `[data-count]` 遍历。数字格式化复用 `src/lib/bilibili.ts` 已导出的 `formatInteger`（`12345` → `12,345`），**不沿用** `padStart(2,'0')`（那是给"文章数 08"这种两位小值用的）。

在 Hero 的 `<dl>` 内、`showUpdated` 之后追加两格，由 `heroCfg.showViews && data` 控制。`<dl>` 已是 `flex flex-wrap`，自动换行，无需改样式。

### 配置（`src/site.config.ts`）

注意中英文文案在**本文件**的 `strings.zh` / `strings.en`，不在 `src/i18n.tsx`（后者只是消费者）。

- 新增 `stats: { enabled: true, apiBase: '/api/stats' }`（与 `bilibili`/`anilist` 同构）
- `hero` 新增 `showViews: true`
- `strings.zh` 加 `'meta.views': '访问'`、`'meta.today': '今日'`
- `strings.en` 加 `'meta.views': 'views'`、`'meta.today': 'today'`（`StringKey` 由 `zh` 推导，`en` 必须同步加，否则 `t()` 静默返回 key）

## 失败与降级

| 场景 | 行为 |
|------|------|
| 静态托管 / 无 `/api`（GitHub Pages） | 返回非 JSON → `bad_response` → `silent = true` → Hero 不渲染这两项，**控制台无 error** |
| API 500 / 网络故障 | 同样不渲染。数字容错优先于暴露错误，绝不让 Hero 崩 |
| 数据文件不可写（权限/磁盘满） | `persist()` 只 `console.error`，内存计数继续、接口照常返回；当前进程内数字仍准确，重启后回退到上次成功落盘值 |
| 数据文件损坏/不存在 | 启动时视为 0 并 warn，不阻塞启动 |
| 跨零点 | `hit` 与 `/summary` 双处归一化 |

## 测试策略

项目无测试框架。**不引入** vitest/jest；服务端纯逻辑用 Node 20 内置 `node:test`（零新增依赖），前端沿用手动验证（引入 jsdom + testing-library 与"不引入框架"的决策冲突）。

服务端为可测试性把时钟做成注入：`createStore({ file, now = Date.now, flushDelayMs })`，debounce 定时器与信号注册都在中间件工厂 `statsApi()` 里，不在 `createStore` 里，避免测试污染进程。

覆盖：时区边界（跨零点前后各 1 秒）、hit 递增、hit 跨零点归零、summary 零点后无 hit 返回 0、载入过期 date 归一化、损坏文件视为 0、flush 后重启恢复、写失败不影响计数。

## 风险

1. **StrictMode 双计**（dev 高概率）→ 模块级单例 Promise + `visibilityState` 检查。验证：DevTools 必须只看到 1 个 POST。
2. **PM2 重启/被 kill 丢数据** → SIGINT/SIGTERM/exit 同步 flush；debounce 1500ms；临时文件 + rename。
3. **时区错误** → 固定 +08:00，载入与读取两处归一化，禁用 UTC 日期直取。
4. **爬虫/预取虚增** → 客户端 POST，爬虫不执行 JS 天然不计。
5. **PM2 cluster 多实例并发写** → 必须 fork / `instances=1`；本方案不覆盖 cluster。
6. **异步值不滚动** → 自治 `AnimatedCount`，不复用 `[data-count]` 同步遍历。

## 部署注意

`data/stats.json` 是运行时数据，`npm run build` 不覆盖。**迁移/重装服务器需单独备份**，否则访问量归零。
