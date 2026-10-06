# 访客留言 · 设计文档

> 2026-10-05 · MIKU DA YO

## 目标

现在的"评论"是构建时从 `comments/*.md` 生成的静态数据（`scripts/sync-comments.mjs` → `src/data/comments.ts`），访客只能看、不能写。

本次让访客能**真的提交留言**：首页有一个公开留言板，每篇文章下面有各自的评论区，站长有一个带密钥的隐藏管理页可以删留言。

## 范围

### 做

- 访客提交留言，**立即公开**（无审核队列）
- 首页留言板：位于文章列表之后、页脚之前，含留言列表 + 提交表单
- 每篇文章下方各自的评论区，按 `post.id` 归类
- Hero 里现有的**打字机终端保留**，并让它也显示访客留言
- 隐藏管理页 `/manage`，输入密钥后可列出并删除任意留言
- 基础防刷：同 IP 每分钟 1 条、长度校验、蜜罐字段

### 不做（明确排除）

- 审核队列 / 先审后发
- 访客登录、账号体系
- 收集访客邮箱或其他个人信息（只收昵称）
- 富文本、Markdown、图片上传
- 回复/楼中楼、点赞、通知
- 留言分页与全文搜索。接口固定只返回**最近 200 条**，超出部分既不展示也不提供翻页 —— 这是刻意的上限，不是"还没做分页"
- 修改已有的 `scripts/sync-comments.mjs`（见文末"已知缺陷"）

## 架构

```
首页 / 文章页
 ├─ CommentTerminal (Hero 打字机)  ─┐
 ├─ CommentMarquee (滚动横条)       ├─ useComments(scope) ─┐
 ├─ CommentBoard (首页留言板)       │                      │
 └─ PostComments (文章评论区)      ─┘                      │
                                                          ▼
                          src/lib/comments.ts  ── fetch ──▶ /api/comments
                                                              │
                                                    server/comments.mjs
                                                              │
                                                    data/comments.json
                                                    （内存 + 原子落盘）
ManagementPage (/manage) ── x-admin-key ──▶ /api/comments/:id (DELETE)
```

单个存储、单个接口，用 `postId` 区分归属：`postId === null` 即首页留言板。

### 与静态评论合并

`comments/*.md` 生成的 5 条静态评论**保留不动**，规则是：

- **首页作用域**（`postId` 为空）：静态评论 + 访客留言，合并展示
- **文章作用域**：只有该文章的访客留言（静态评论不属于任何文章）

合并逻辑集中在 `src/lib/comments.ts`，三个展示组件共用，不各自实现。

## 数据模型

```ts
type VisitorComment = {
  id: string          // crypto.randomUUID()
  author: string      // 昵称，1–24 字符
  text: string        // 正文，1–500 字符
  postId: string | null  // null = 首页留言板
  createdAt: string   // ISO 8601
}
```

存储文件 `data/comments.json` 是一个 `VisitorComment[]` 的 JSON 数组。文件路径由 `import.meta.url` 推导，**不依赖 `process.cwd()`**（PM2 不保证 cwd）。

## API

| 路由 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/comments/health` | GET/HEAD | 无 | 探活 |
| `/api/comments?post=<id>` | GET/HEAD | 无 | 返回该作用域的留言，**最多最近 200 条**，按时间倒序 |
| `/api/comments` | POST | 无 | 提交留言，JSON body |
| `/api/comments/:id` | DELETE | `x-admin-key` | 删除一条留言 |

错误码沿用既有约定：`unknown_route`(404)、`method_not_allowed`(405)、`bad_request`(400)、`payload_too_large`(413)、`too_many_requests`(429)、`unauthorized`(401)、`not_configured`(503)、`internal_error`(500)。响应体恒为 `{ ok, ... }`。

### POST 请求体

```json
{ "author": "小明", "text": "这个网站好可爱！", "postId": null, "website": "" }
```

**必须手写 body 读取**：项目里没有 `express.json()`，且 Vite 开发服务器走的是 raw connect 中间件，`express.json()` 也覆盖不到。做法是在中间件内读 `req` 流：

- 累计大小超过 **4 KB** 立即 413 并**停止读取**（`req.pause()`，防止超大 body 吃内存）
  - **不要 `req.destroy()`** —— 销毁 socket 会让 413 响应发不出去，客户端拿到的是连接重置而不是状态码。`settled` 守卫已让后续 chunk 被忽略，内存仍然有界
- JSON 解析失败 → 400
- body 不是对象 → 400

### 校验规则

| 字段 | 规则 | 违反时 |
|---|---|---|
| `author` | trim 后 1–24 字符 | 400 `bad_request` |
| `text` | trim 后 1–500 字符 | 400 `bad_request` |
| `postId` | `null` 或匹配 `/^[a-z0-9][a-z0-9-]{0,63}$/` | 400 `bad_request` |
| `website` | 蜜罐，必须为空 | 非空 → **返回 200 但不存储** |

蜜罐返回 200 是刻意的：让自动脚本以为成功了，不告诉它被识别。

**注意二者与限速的先后**：限速排在读 body 之前，因此一个**已在本分钟内发过留言**的 IP 去填蜜罐，会先撞上限速拿到 429 而不是 200。这是刻意的取舍 —— 在解析任何请求体之前就挡掉高频来源更安全，而蜜罐的 200 是尽力而为的"礼貌"，不是保证；429 也不泄露超出「你被限速了」之外的任何信息。

### 管理鉴权

- 密钥来自服务端 `.env` 的 `COMMENTS_ADMIN_KEY`，**不写进代码、不进前端 bundle**
- 请求头 `x-admin-key` 与密钥用 `crypto.timingSafeEqual` 做**恒定时间比较**（长度不等时先 hash 再比较，避免长度侧信道）
- **未配置 `COMMENTS_ADMIN_KEY` 时，删除接口返回 503 `not_configured`**（fail closed，不能因为漏配就变成任何人都能删）
- **限速只针对鉴权失败**：同一 IP 每分钟最多 10 次密钥试错，超出 429。**成功删除不被限速** —— 否则站长连续清理几条垃圾留言时会被自己的限速挡住，那是不可接受的体验

## 防刷

| 措施 | 实现 |
|---|---|
| 发帖限速 | 内存 `Map<ip, lastPostMs>`，同 IP 60 秒内只能发 1 条，超限 429 |
| 鉴权限速 | 另一张 `Map<ip, {count, windowStart}>`，同 IP 每分钟最多 10 次**密钥试错**，超限 429；删除成功不计入 |
| 真实 IP | 依次取：`X-Real-IP` → `X-Forwarded-For` 的**最后一段** → `req.socket.remoteAddress` → `'unknown'`。**绝不能取 XFF 的第一段**（见下方说明） |
| 内存上限 | 限速表按窗口清理，并设条目上限，防止伪造 IP 撑爆内存 |
| 长度 | 见上表 |
| 蜜罐 | 见上表 |

限速表是**进程内**状态，PM2 重启即清空 —— 对本场景可接受（重启不会让攻击者获益多少），且避免了引入外部存储。

## 存储

沿用 `server/stats.mjs` 已验证的模式：

- 启动时读一次 `data/comments.json` 进内存；文件缺失或损坏 → 视为空数组并 warn，**不抛错、不阻塞启动**
- 增删只改内存，随后 1500ms debounce 合并写盘
- `process.once('exit')` 与 `SIGINT`/`SIGTERM` 时同步 flush（PM2 `restart`/`stop` 发 SIGINT）
- 原子写：`mkdirSync(dirname, {recursive})` → 写 `comments.json.tmp` → `renameSync`
- 写失败只 `onError`，**内存数据照常可读可写**，接口不因此 500
- 文件超过 5 MB 时 `console.warn` 提示（**不自动删除**任何留言）

`data/` 已在 `.gitignore` 中，`data/comments.json` 自动被忽略。

## 前端

### `src/lib/comments.ts`（新建）

照 `src/lib/bilibili.ts` 与 `src/lib/stats.ts` 的骨架：

- `type VisitorComment`、`type CommentPayload`
- `class CommentsRequestError extends Error { code }`
- `COMMENTS_SILENT_CODES = new Set(['bad_response', 'unknown_route', 'method_not_allowed'])` —— 仅表示"这里没有留言服务"（静态托管）。`not_configured` **不属于**静默码：它只出现在删除接口，由管理页单独提示
- `fetchComments({ postId })` → GET
- `submitComment({ author, text, postId, website })` → POST
- `deleteComment({ id, adminKey })` → DELETE
- `useComments({ postId, enabled })` → `{ comments, error, silent, loading, refresh, submit }`

**合并规则在此实现**：首页作用域返回 `[...STATIC_COMMENTS, ...fetched]`，文章作用域只返回 `fetched`。

降级：静态托管（无 `/api`）时 `silent = true`，留言区整体不显示、控制台无 JS 报错 —— 与 `useStats` / `FloatingBili` 的做法一致。

### 组件

| 组件 | 位置 | 职责 |
|---|---|---|
| `CommentBoard.tsx`（新建） | 首页 `App.tsx` 第 145–148 行之间 | 留言列表 + 表单 |
| `CommentForm.tsx`（新建） | 被上面两者复用 | 表单：昵称 + 内容 + 隐藏蜜罐字段；提交态、错误提示、长度计数 |
| `PostComments.tsx`（新建） | `PostView.tsx` 第 401–403 行之间 | 文章的留言列表 + 表单 |
| `ManagePage.tsx`（新建） | 新路由 `/manage` | 密钥输入 → 列表 → 删除 |

`CommentForm` 抽出来单独一个组件，是因为首页和文章页的提交逻辑完全相同 —— 两处各写一遍必然会漂移。

### 修改现有文件

| 文件 | 改动 |
|---|---|
| `src/components/CommentTerminal.tsx` | 数据源从 `COMMENTS` 改为 `useComments()`，让打字机也循环访客留言 |
| `src/components/CommentMarquee.tsx` | 同上 |
| `src/App.tsx` | 新增 `isManageRoute()`；主页布局在 `#posts` 之后插入 `<CommentBoard />`；`/manage` 返回 `<ManagePage />` |
| `src/components/PostView.tsx` | 正文面板之后插入 `<PostComments postId={post.id} />` |
| `src/site.config.ts` | 新增 `comments: { enabled, apiBase }`；`strings.zh`/`strings.en` 补文案 |
| `server/api.mjs` | 加 `export { commentsApi } from './comments.mjs'` |
| `server.js` | 在静态托管之前 `app.use(commentsApi())` |
| `vite.config.ts` | 新增 `commentsApiPlugin()` |
| `.env.example` | 加 `COMMENTS_ADMIN_KEY=` 及说明 |
| `docs/deployment.md` | 加"访客留言"一节 |

### 安全

- 昵称与正文是**用户输入**，React 默认转义，**禁止使用 `dangerouslySetInnerHTML`**
- 管理页加载时设 `<meta name="robots" content="noindex">`，且页面本身不链接自任何地方
- 密钥只存浏览器 `localStorage`，**不写进 URL**（避免出现在浏览器历史和服务器访问日志里）

## 失败与降级

| 场景 | 行为 |
|---|---|
| 无 `/api`（静态托管） | `silent = true`，留言区不显示，页面与其余数据卡照常，控制台无 JS 报错 |
| 接口 500 / 网络故障 | 留言区显示"暂时无法加载留言"；表单提交失败提示"发送失败，请稍后重试"，**不影响页面其他部分** |
| `COMMENTS_ADMIN_KEY` 未配置 | 删除接口 503；留言区与提交照常工作 |
| 数据文件损坏/缺失 | 启动视为空数组并 warn，不阻塞启动 |
| 写盘失败（权限/磁盘满） | 内存数据照常可读写，重启后回退到上次成功落盘内容 |

## 测试

沿用 `node:test`，零新增依赖，`test/comments.test.mjs`。复用 `test/stats.test.mjs` 的 `mockRes()` / `request()` 辅助函数风格；新功能的 mock `req` 还要支持 `on('data')` / `on('end')`，以便喂入请求体。

覆盖：

- 校验：昵称/正文的长度边界、纯空白、超长、非法 `postId`
- 蜜罐：填了 `website` → 200 但**不落盘**
- 限速：同 IP 第二次在 60 秒内 → 429；换 IP → 放行
- 存储：新增后可读回；删除后消失；落盘后新建 store 能恢复
- 损坏文件视为空；写失败不影响内存读写
- 鉴权：无密钥 401、错密钥 401、未配置 503、正确密钥可删
- 路由：405 / 404 / 413（超大 body）
- 合并逻辑：首页作用域含静态评论，文章作用域不含

## 风险

1. **未加 CSRF 防护** —— 提交接口是无鉴权的公开写接口，CSRF 对它没有意义（攻击者本来就能直接调）。真正的风险是垃圾留言，由限速 + 蜜罐覆盖。
2. **限速可被绕** —— 换 IP 即可绕过。个人站的合理预期，不引入外部依赖。
3. **单文件全量重写** —— 留言量极大时写盘变慢。5 MB 时告警，未自动处理。
4. **无审核** —— 选定的方案。站长靠 `/manage` 事后删除，删除前的内容是公开可见的。
5. **`/manage` 的密钥若泄漏** —— 攻击者可删除全部留言（但无法读取访客隐私，因为不收集）。建议用长随机串。

## 已知缺陷（本次不修）

`scripts/sync-comments.mjs:45-47` 的 `escapeTpl()` 只处理了反引号/反斜杠/`${`，没有处理单引号；而 author 是以单引号字符串字面量输出的（第 86 行）。所以 `author: O'Brien` 会导致生成的 `src/data/comments.ts` **语法错误、构建失败**。

访客留言**不走这个脚本**（走新接口），所以本功能不会触发它。修它需要同时修转义与回归测试，与本次目标无关，**留作独立的一件小事**。
