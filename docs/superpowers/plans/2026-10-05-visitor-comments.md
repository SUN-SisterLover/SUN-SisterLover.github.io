# 访客留言 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让访客能真的提交留言——首页有公开留言板，每篇文章下面有各自的评论区，站长有带密钥的隐藏管理页可以删留言。

**Architecture:** 单存储单接口，用 `postId` 区分归属（`null` = 首页留言板）。服务端新增 `server/comments.mjs`，完全复用 `server/stats.mjs` 已验证的模式（工厂式中间件 + 内存状态 + 原子落盘 + 信号 flush）。前端新增 `src/lib/comments.ts` 作为唯一数据层，三个展示组件共用它；纯静态评论与访客留言的合并在这一层完成。

**Tech Stack:** React 19 · Vite 6 · TypeScript strict · Express 4 · Node 20 `node:crypto` / `node:fs` · `node:test`

**Spec:** `docs/superpowers/specs/2026-10-05-visitor-comments-design.md`

## Global Constraints

- **零新增依赖**。存储用 `node:fs` + JSON 文件，ID 用 `node:crypto` 的 `randomUUID()`，鉴权用 `timingSafeEqual`。不引入 sqlite / lowdb / express-rate-limit / cors。
- **Node 20 兼容**：服务器跑 Node 20（`docs/deployment.md`）。不要用 `node:sqlite`（需 22.5+）。`randomUUID`/`timingSafeEqual`/`fetch` 在 20 上都可用。
- **TS 严格模式**：`strict` + `noUnusedLocals` + `noUnusedParameters`，未使用的变量或 import 会导致 `npm run build` 失败。
- **不新增 POST body 解析中间件**：项目里没有 `express.json()`，且 Vite 开发服务器走 raw connect 中间件。读 body 必须在 `server/comments.mjs` 内手写流式读取，**4 KB 上限**。
- **路径由 `import.meta.url` 推导**，不用 `process.cwd()`（PM2 不保证 cwd）。
- **禁止 `dangerouslySetInnerHTML`**：昵称与正文是用户输入，依赖 React 默认转义。
- **管理页文案不进 i18n**：`/manage` 是站长私用工具，硬编码中文，不占用 `site.config.ts` 的双语文案表（访客可见的文案才需要双语）。
- **测试**：服务端逻辑用 `node:test`（`test/comments.test.mjs`），跑 `npm test`。前端无测试框架，验证 = `npm run build` + 浏览器实测。这是本仓库的既有约定（访问统计同样如此）。
- **git**：逐任务 commit 到 `mikudayo` 分支，**不 push**（网络到 GitHub 当前不通）。
- **不动** `scripts/sync-comments.mjs`（其转义缺陷见 spec "已知缺陷"，与本功能无关）。

---

### Task 1: 留言校验与存储

**Files:**
- Create: `server/comments.mjs`
- Create: `test/comments.test.mjs`

**Interfaces:**
- Consumes: 无（本任务从零建立模块）
- Produces:
  - `validateComment(input: unknown): { ok: true, value: { author: string, text: string, postId: string | null } } | { ok: false, code: string, error: string }`
  - `createCommentStore({ file?: string|null, now?: () => number, flushDelayMs?: number, onError?: (err: Error) => void }): { list(postId?: string|null): VisitorComment[], add(input: { author: string, text: string, postId?: string|null }): VisitorComment, remove(id: string): boolean, flush(): void }`
  - `type VisitorComment = { id: string, author: string, text: string, postId: string | null, createdAt: string }`（JS 里用 JSDoc 描述，TS 侧在 Task 5 重新声明）

- [ ] **Step 1: 写失败的测试**

创建 `test/comments.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateComment, createCommentStore } from '../server/comments.mjs'

const AT = Date.UTC(2026, 9, 5, 4, 0, 0) // fixed clock for every test

function tempCommentsFile(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'nagi-comments-'))
  const file = join(dir, 'comments.json')
  if (contents !== undefined) {
    writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents))
  }
  return { file, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const storeAt = (file) => createCommentStore({ file, now: () => AT, flushDelayMs: 0 })

test('validateComment rejects an empty or missing nickname', () => {
  assert.equal(validateComment({ text: 'hi' }).code, 'bad_request')
  assert.equal(validateComment({ author: '   ', text: 'hi' }).code, 'bad_request')
})

test('validateComment rejects a nickname longer than 24 characters', () => {
  assert.equal(validateComment({ author: 'a'.repeat(24), text: 'hi' }).ok, true)
  assert.equal(validateComment({ author: 'a'.repeat(25), text: 'hi' }).code, 'bad_request')
})

test('validateComment counts characters, not UTF-16 units', () => {
  // Each emoji is two UTF-16 units but one character.
  assert.equal(validateComment({ author: '👍'.repeat(24), text: 'hi' }).ok, true)
})

test('validateComment rejects empty or oversized bodies', () => {
  assert.equal(validateComment({ author: 'a', text: '  ' }).code, 'bad_request')
  assert.equal(validateComment({ author: 'a', text: 'x'.repeat(500) }).ok, true)
  assert.equal(validateComment({ author: 'a', text: 'x'.repeat(501) }).code, 'bad_request')
})

test('validateComment trims and normalises the post id', () => {
  assert.deepEqual(validateComment({ author: ' a ', text: ' b ', postId: null }).value, {
    author: 'a',
    text: 'b',
    postId: null,
  })
  assert.equal(validateComment({ author: 'a', text: 'b', postId: 'test-post' }).value.postId, 'test-post')
  assert.equal(validateComment({ author: 'a', text: 'b', postId: '' }).value.postId, null)
  assert.equal(validateComment({ author: 'a', text: 'b', postId: 'Bad ID!' }).code, 'bad_request')
  assert.equal(validateComment({ author: 'a', text: 'b', postId: 'a'.repeat(65) }).code, 'bad_request')
})

test('list returns newest first and scopes by post id', () => {
  const t = tempCommentsFile()
  try {
    const store = storeAt(t.file)
    store.add({ author: 'a', text: 'first' })
    store.add({ author: 'b', text: 'second' })
    store.add({ author: 'c', text: 'on a post', postId: 'test-post' })

    assert.deepEqual(store.list().map((c) => c.text), ['second', 'first'])
    assert.deepEqual(store.list('test-post').map((c) => c.text), ['on a post'])
    assert.deepEqual(store.list('other-post'), [])
  } finally {
    t.cleanup()
  }
})

test('remove deletes by id and reports whether anything was removed', () => {
  const t = tempCommentsFile()
  try {
    const store = storeAt(t.file)
    const c = store.add({ author: 'a', text: 'bye' })
    assert.equal(store.remove(c.id), true)
    assert.deepEqual(store.list(), [])
    assert.equal(store.remove(c.id), false)
  } finally {
    t.cleanup()
  }
})

test('added comments survive a restart', () => {
  const t = tempCommentsFile()
  try {
    const store = storeAt(t.file)
    store.add({ author: 'a', text: 'persisted' })
    store.flush()
    assert.deepEqual(storeAt(t.file).list().map((c) => c.text), ['persisted'])
  } finally {
    t.cleanup()
  }
})

test('a corrupt comments file is treated as empty rather than thrown', () => {
  const t = tempCommentsFile('{ not json')
  try {
    assert.deepEqual(storeAt(t.file).list(), [])
  } finally {
    t.cleanup()
  }
})

test('a comments file that is valid JSON but not an array is treated as empty', () => {
  const t = tempCommentsFile({ oops: true })
  try {
    assert.deepEqual(storeAt(t.file).list(), [])
  } finally {
    t.cleanup()
  }
})

test('a write failure keeps the in-memory comments usable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nagi-comments-'))
  const blocker = join(dir, 'blocker')
  writeFileSync(blocker, 'x') // a file where a directory is needed
  const errors = []
  try {
    const store = createCommentStore({
      file: join(blocker, 'comments.json'),
      now: () => AT,
      flushDelayMs: 0,
      onError: (err) => errors.push(err),
    })
    store.add({ author: 'a', text: 'still here' })
    store.flush()
    assert.deepEqual(store.list().map((c) => c.text), ['still here'])
    assert.equal(errors.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('list caps at the 200 most recent comments', () => {
  const t = tempCommentsFile()
  try {
    const store = storeAt(t.file)
    for (let i = 0; i < 205; i += 1) store.add({ author: 'a', text: `c${i}` })
    const listed = store.list()
    assert.equal(listed.length, 200)
    assert.equal(listed[0].text, 'c204')
    assert.equal(listed[199].text, 'c5')
  } finally {
    t.cleanup()
  }
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: 失败，原因是 `Cannot find module '../server/comments.mjs'` 或 `does not provide an export named 'validateComment'`。

- [ ] **Step 3: 实现 `server/comments.mjs`**

```js
/**
 * Visitor comments for the homepage guestbook and per-article threads.
 *
 * One store, one file; a comment belongs to the homepage when `postId` is null.
 * Persistence mirrors `server/stats.mjs`: state lives in memory, writes are
 * coalesced and atomic, and a failed write never breaks the running server.
 *
 * Full description: `docs/superpowers/specs/2026-10-05-visitor-comments-design.md`.
 */
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

export const AUTHOR_MAX = 24
export const TEXT_MAX = 500
/** Only the most recent comments are ever returned; there is no pagination. */
export const MAX_LISTED = 200
export const FLUSH_DELAY_MS = 1500
/** Warn (but never delete) once the store grows past this. */
const WARN_FILE_BYTES = 5 * 1024 * 1024
const POST_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * Length in characters rather than UTF-16 units, so an emoji costs one and the
 * published limits mean what a visitor expects.
 */
const charLength = (value) => [...value].length

/**
 * Validate a submitted comment. Returns the trimmed values to store, or a
 * stable error code for the API to report.
 */
export function validateComment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'bad_request', error: 'Expected a JSON object' }
  }

  const author = typeof input.author === 'string' ? input.author.trim() : ''
  if (!author || charLength(author) > AUTHOR_MAX) {
    return { ok: false, code: 'bad_request', error: `author must be 1-${AUTHOR_MAX} characters` }
  }

  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (!text || charLength(text) > TEXT_MAX) {
    return { ok: false, code: 'bad_request', error: `text must be 1-${TEXT_MAX} characters` }
  }

  let postId = null
  if (input.postId !== null && input.postId !== undefined && input.postId !== '') {
    if (typeof input.postId !== 'string' || !POST_ID_RE.test(input.postId)) {
      return { ok: false, code: 'bad_request', error: 'postId is not a valid post id' }
    }
    postId = input.postId
  }

  return { ok: true, value: { author, text, postId } }
}

/** A stored entry is only trusted if it has the shape we wrote. */
function isStoredComment(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.author === 'string' &&
    typeof value.text === 'string' &&
    (value.postId === null || typeof value.postId === 'string') &&
    typeof value.createdAt === 'string'
  )
}

/** A missing or unreadable file is not an error — the guestbook just starts empty. */
function loadComments(file) {
  if (!file) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(raw)) {
      console.warn('[comments] comments file is not an array — starting empty')
      return []
    }
    return raw.filter(isStoredComment)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[comments] ignoring unreadable comments file:', err.message)
    }
    return []
  }
}

/**
 * In-memory comment store, coalesced to disk.
 *
 * `now` is injectable so ids and timestamps are deterministic under test;
 * `file: null` keeps the store purely in memory; `flushDelayMs <= 0` writes only
 * when `flush()` is called explicitly.
 */
export function createCommentStore({
  file = null,
  now = Date.now,
  flushDelayMs = FLUSH_DELAY_MS,
  onError = (err) => console.error('[comments] failed to persist comments:', err.message),
} = {}) {
  const comments = loadComments(file)
  let timer = null
  let dirty = false

  function list(postId = null) {
    return comments
      .filter((c) => c.postId === postId)
      .slice(-MAX_LISTED)
      .reverse()
  }

  function add({ author, text, postId = null }) {
    const comment = {
      id: randomUUID(),
      author,
      text,
      postId,
      createdAt: new Date(now()).toISOString(),
    }
    comments.push(comment)
    markDirty()
    return comment
  }

  function remove(id) {
    const index = comments.findIndex((c) => c.id === id)
    if (index === -1) return false
    comments.splice(index, 1)
    markDirty()
    return true
  }

  function markDirty() {
    dirty = true
    if (!file || flushDelayMs <= 0 || timer) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, flushDelayMs)
    // Never hold the process open just to write comments.
    timer.unref?.()
  }

  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!file || !dirty) return

    try {
      mkdirSync(dirname(file), { recursive: true })
      // Write beside the target and rename, so a crash mid-write cannot leave a
      // half-written file behind.
      const temp = `${file}.tmp`
      writeFileSync(temp, `${JSON.stringify(comments, null, 2)}\n`)
      renameSync(temp, file)
      dirty = false
      warnIfLarge(file)
    } catch (err) {
      // Leave `dirty` set so a later flush retries once the cause is cleared.
      onError(err)
    }
  }

  function warnIfLarge(target) {
    try {
      const { size } = statSync(target)
      if (size > WARN_FILE_BYTES) {
        console.warn(
          `[comments] comments file has grown to ${(size / 1024 / 1024).toFixed(1)} MB — consider archiving old comments`,
        )
      }
    } catch {
      // Sizing is advisory only.
    }
  }

  return { list, add, remove, flush }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: `pass`，全部通过，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add server/comments.mjs test/comments.test.mjs
git commit -m "feat(comments): 留言校验与存储（内存 + 原子落盘）"
```

---

### Task 2: 限速与请求体读取

**Files:**
- Modify: `server/comments.mjs`（追加两个工厂函数与一个 body 读取函数）
- Modify: `test/comments.test.mjs`（追加测试）

**Interfaces:**
- Consumes: Task 1 的 `server/comments.mjs`
- Produces:
  - `createPostLimiter({ windowMs?: number, maxKeys?: number, now?: () => number }): { allow(ip: string): boolean }` —— 同 IP `windowMs` 内只放行一次
  - `createAuthLimiter({ windowMs?: number, maxAttempts?: number, maxKeys?: number, now?: () => number }): { allow(ip: string): boolean, clear(ip: string): void }` —— 统计**失败**次数；`clear(ip)` 在鉴权成功后调用
  - `readJsonBody(req, { maxBytes?: number }): Promise<unknown>` —— 超限 reject `CommentsError(413)`
  - `class CommentsError extends Error { status: number, code: string }`
  - `clientIp(req): string`

- [ ] **Step 1: 写失败的测试**

追加到 `test/comments.test.mjs`：

```js
import { createPostLimiter, createAuthLimiter, readJsonBody, CommentsError } from '../server/comments.mjs'

test('the post limiter allows one comment per IP per window', () => {
  let now = AT
  const limiter = createPostLimiter({ windowMs: 60_000, now: () => now })
  assert.equal(limiter.allow('1.1.1.1'), true)
  assert.equal(limiter.allow('1.1.1.1'), false)
  assert.equal(limiter.allow('2.2.2.2'), true) // a different visitor is unaffected
  now += 60_001
  assert.equal(limiter.allow('1.1.1.1'), true)
})

test('the post limiter recycles its table instead of growing without bound', () => {
  let now = AT
  const limiter = createPostLimiter({ windowMs: 1_000, maxKeys: 10, now: () => now })
  for (let i = 0; i < 50; i += 1) limiter.allow(`10.0.0.${i}`)
  now += 1_001
  // Stale entries are dropped, so a fresh IP is still admitted.
  assert.equal(limiter.allow('10.0.0.99'), true)
})

test('the auth limiter counts failures and forgets them once cleared', () => {
  const limiter = createAuthLimiter({ windowMs: 60_000, maxAttempts: 3, now: () => AT })
  assert.equal(limiter.allow('9.9.9.9'), true)
  assert.equal(limiter.allow('9.9.9.9'), true)
  assert.equal(limiter.allow('9.9.9.9'), true)
  assert.equal(limiter.allow('9.9.9.9'), false) // 4th failed try is refused
  limiter.clear('9.9.9.9')
  assert.equal(limiter.allow('9.9.9.9'), true)
})

/** A request stub that replays `chunks` and then ends. */
function bodyReq(chunks) {
  const handlers = {}
  return {
    on(event, fn) {
      handlers[event] = fn
      return this
    },
    destroy() {},
    /** Drive the fake stream once the caller has attached its listeners. */
    async replay() {
      for (const chunk of chunks) handlers.data?.(Buffer.from(chunk))
      handlers.end?.()
    },
  }
}

test('readJsonBody parses a JSON body', async () => {
  const req = bodyReq(['{"author":"a",'])
  const pending = readJsonBody(req)
  req.on('end', () => {})
  await req.replay()
  assert.deepEqual(await pending, { author: 'a' })
})
```

Hmm — the replay helper above is awkward because `readJsonBody` attaches its listeners synchronously inside the Promise executor, so `replay()` can be called right after. Rewrite that test:

```js
test('readJsonBody parses a JSON body', async () => {
  const req = bodyReq(['{"author":"a",', '"text":"b"}'])
  const pending = readJsonBody(req)
  await req.replay()
  assert.deepEqual(await pending, { author: 'a', text: 'b' })
})

test('readJsonBody rejects a body over the size cap', async () => {
  const req = bodyReq(['x'.repeat(5000)])
  const pending = readJsonBody(req)
  await req.replay()
  await assert.rejects(pending, (err) => err instanceof CommentsError && err.status === 413)
})

test('readJsonBody rejects invalid JSON', async () => {
  const req = bodyReq(['{ not json'])
  const pending = readJsonBody(req)
  await req.replay()
  await assert.rejects(pending, (err) => err instanceof CommentsError && err.status === 400)
})
```

And drop the duplicated `req.on('end', ...)` line.

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'createPostLimiter'`。

- [ ] **Step 3: 实现**

追加到 `server/comments.mjs`：

```js
export const MAX_BODY_BYTES = 4 * 1024

/** An error carrying the HTTP status and stable code the API should report. */
export class CommentsError extends Error {
  constructor(message, status, code) {
    super(message)
    this.name = 'CommentsError'
    this.status = status
    this.code = code
  }
}

/**
 * The visitor's address as seen through Nginx. The proxy passes the real address
 * in `X-Forwarded-For`, so `req.socket.remoteAddress` would always be 127.0.0.1.
 *
 * Take the LAST hop, never the first: our nginx uses
 * `$proxy_add_x_forwarded_for`, which appends the real address to whatever the
 * client sent — so leading segments are attacker-controlled. `x-real-ip` is set
 * by nginx with `$remote_addr` and cannot be spoofed, so it wins when present.
 *
 * NOTE: this trusts `x-real-ip` unconditionally, so the app must stay bound to
 * localhost behind the nginx in `docs/deployment.md`. See Ruling 11/15 in
 * `.superpowers/sdd/2026-10-05-visitor-comments/progress.md`.
 */
export function clientIp(req) {
  // nginx sets `X-Real-IP` from `$remote_addr`, overwriting anything the client
  // sent, so it is the one header a visitor cannot forge.
  const realIp = req.headers?.['x-real-ip']
  const real = Array.isArray(realIp) ? realIp[0] : realIp
  if (typeof real === 'string' && real.trim()) return real.trim()

  const forwarded = req.headers?.['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded
  if (typeof raw === 'string' && raw.trim()) {
    const hops = raw.split(',')
    const last = hops[hops.length - 1].trim()
    if (last) return last
  }
  return req.socket?.remoteAddress ?? 'unknown'
}

/** Drop stale keys so forged addresses cannot grow the table without bound. */
function prune(map, now, windowMs, maxKeys) {
  if (map.size <= maxKeys) return
  for (const [key, entry] of map) {
    const stamp = typeof entry === 'number' ? entry : entry.start
    if (now - stamp >= windowMs) map.delete(key)
  }
  if (map.size > maxKeys) map.clear()
}

/** One comment per address per window. */
export function createPostLimiter({ windowMs = 60_000, maxKeys = 10_000, now = Date.now } = {}) {
  const seen = new Map()
  return {
    allow(ip) {
      const t = now()
      prune(seen, t, windowMs, maxKeys)
      const last = seen.get(ip)
      if (last !== undefined && t - last < windowMs) return false
      seen.set(ip, t)
      return true
    },
  }
}

/**
 * Counts failed admin-key attempts only. Successful deletes must not be limited,
 * or the site owner cannot clear several spam comments in a row.
 */
export function createAuthLimiter({
  windowMs = 60_000,
  maxAttempts = 10,
  maxKeys = 10_000,
  now = Date.now,
} = {}) {
  const attempts = new Map()
  return {
    allow(ip) {
      const t = now()
      prune(attempts, t, windowMs, maxKeys)
      const entry = attempts.get(ip)
      if (!entry || t - entry.start >= windowMs) {
        attempts.set(ip, { start: t, count: 1 })
        return true
      }
      if (entry.count >= maxAttempts) return false
      entry.count += 1
      return true
    },
    clear(ip) {
      attempts.delete(ip)
    },
  }
}

/**
 * Read a JSON request body with a hard size cap.
 *
 * Written by hand because this middleware also runs on the Vite dev server as a
 * raw connect middleware, where `express.json()` does not exist.
 */
export function readJsonBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false

    const fail = (err) => {
      if (settled) return
      settled = true
      reject(err)
    }

    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) {
        fail(new CommentsError('Request body is too large', 413, 'payload_too_large'))
        req.destroy?.()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (settled) return
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return fail(new CommentsError('Expected a JSON body', 400, 'bad_request'))
      try {
        settled = true
        resolve(JSON.parse(raw))
      } catch {
        fail(new CommentsError('Request body is not valid JSON', 400, 'bad_request'))
      }
    })

    req.on('error', (err) => fail(new CommentsError(err.message, 400, 'bad_request')))
  })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add server/comments.mjs test/comments.test.mjs
git commit -m "feat(comments): 限速器与 4KB 上限的请求体读取"
```

---

### Task 3: 中间件路由与管理鉴权

**Files:**
- Modify: `server/comments.mjs`（追加鉴权比较与 `commentsApi`）
- Modify: `test/comments.test.mjs`（追加路由测试）

**Interfaces:**
- Consumes: Task 1 的 `createCommentStore` / `validateComment`；Task 2 的 `createPostLimiter` / `createAuthLimiter` / `readJsonBody` / `clientIp` / `CommentsError`
- Produces: `commentsApi(options?: { basePath?: string, file?: string|null, flushDelayMs?: number, persistOnExit?: boolean }): (req, res, next) => Promise<void>`，路由见 spec 的 API 表

- [ ] **Step 1: 写失败的测试**

追加到 `test/comments.test.mjs`：

```js
import { commentsApi } from '../server/comments.mjs'

/** mockRes/request mirror test/stats.test.mjs. */
function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : undefined
    },
  }
}

async function request(middleware, method, url, { body, headers = {} } = {}) {
  const res = mockRes()
  let nextCalled = false
  const req = {
    method,
    url,
    headers,
    socket: { remoteAddress: '5.5.5.5' },
    destroy() {},
    on(event, fn) {
      if (event === 'data' && body !== undefined) fn(Buffer.from(body))
      if (event === 'end') queueMicrotask(fn)
      return this
    },
  }
  await middleware(req, res, () => {
    nextCalled = true
  })
  return { res, nextCalled }
}

/** Admin deletes are exercised with a key set on process.env. */
function withAdminKey(key, fn) {
  const previous = process.env.COMMENTS_ADMIN_KEY
  process.env.COMMENTS_ADMIN_KEY = key
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.COMMENTS_ADMIN_KEY
    else process.env.COMMENTS_ADMIN_KEY = previous
  }
}

const api = (file) => commentsApi({ file, persistOnExit: false, flushDelayMs: 0 })
const POST_JSON = JSON.stringify({ author: '小明', text: '你好', postId: null })

test('GET returns an empty list initially', async () => {
  const t = tempCommentsFile()
  try {
    const { res } = await request(api(t.file), 'GET', '/api/comments')
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { ok: true, comments: [] })
  } finally {
    t.cleanup()
  }
})

test('POST stores a comment and returns it', async () => {
  const t = tempCommentsFile()
  try {
    const { res } = await request(api(t.file), 'POST', '/api/comments', { body: POST_JSON })
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.comment.author, '小明')
    assert.equal(res.body.comment.postId, null)
  } finally {
    t.cleanup()
  }
})

test('POST rejects an oversized nickname without storing anything', async () => {
  const t = tempCommentsFile()
  try {
    const middleware = api(t.file)
    const bad = JSON.stringify({ author: 'a'.repeat(25), text: 'hi' })
    const { res } = await request(middleware, 'POST', '/api/comments', { body: bad })
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 'bad_request')
    const list = await request(middleware, 'GET', '/api/comments')
    assert.deepEqual(list.res.body.comments, [])
  } finally {
    t.cleanup()
  }
})

test('the honeypot accepts but silently discards bot submissions', async () => {
  const t = tempCommentsFile()
  try {
    const middleware = api(t.file)
    const bot = JSON.stringify({ author: 'bot', text: 'buy now', website: 'http://spam' })
    const { res } = await request(middleware, 'POST', '/api/comments', { body: bot })
    assert.equal(res.statusCode, 200) // deliberately indistinguishable from success
    const list = await request(middleware, 'GET', '/api/comments')
    assert.deepEqual(list.res.body.comments, [])
  } finally {
    t.cleanup()
  }
})

test('a second comment from the same address is rate limited', async () => {
  const t = tempCommentsFile()
  try {
    const middleware = api(t.file)
    const first = await request(middleware, 'POST', '/api/comments', { body: POST_JSON })
    assert.equal(first.res.statusCode, 200)
    const second = await request(middleware, 'POST', '/api/comments', { body: POST_JSON })
    assert.equal(second.res.statusCode, 429)
    assert.equal(second.res.body.code, 'too_many_requests')
  } finally {
    t.cleanup()
  }
})

test('GET filters by post', async () => {
  const t = tempCommentsFile()
  try {
    const middleware = api(t.file)
    await request(middleware, 'POST', '/api/comments', {
      body: JSON.stringify({ author: 'a', text: 'on post', postId: 'test-post' }),
    })
    const onPost = await request(middleware, 'GET', '/api/comments?post=test-post')
    assert.equal(onPost.res.body.comments.length, 1)
    const homepage = await request(middleware, 'GET', '/api/comments')
    assert.deepEqual(homepage.res.body.comments, [])
  } finally {
    t.cleanup()
  }
})

test('DELETE requires the configured admin key', async () => {
  const t = tempCommentsFile()
  try {
    const middleware = api(t.file)
    const created = await request(middleware, 'POST', '/api/comments', { body: POST_JSON })
    const id = created.res.body.comment.id

    const noKey = await request(middleware, 'DELETE', `/api/comments/${id}`)
    assert.equal(noKey.res.statusCode, 503) // fail closed when unconfigured
    assert.equal(noKey.res.body.code, 'not_configured')

    await withAdminKey('secret-key', async () => {
      const wrong = await request(middleware, 'DELETE', `/api/comments/${id}`, {
        headers: { 'x-admin-key': 'nope' },
      })
      assert.equal(wrong.res.statusCode, 401)
    })

    // Still there after the failed attempts.
    assert.equal((await request(middleware, 'GET', '/api/comments')).res.body.comments.length, 1)
  } finally {
    t.cleanup()
  }
})

test('DELETE removes the comment when the key matches', async () => {
  const t = tempCommentsFile()
  try {
    const middleware = api(t.file)
    const created = await request(middleware, 'POST', '/api/comments', { body: POST_JSON })
    const id = created.res.body.comment.id
    await withAdminKey('secret-key', async () => {
      const res = await request(middleware, 'DELETE', `/api/comments/${id}`, {
        headers: { 'x-admin-key': 'secret-key' },
      })
      assert.equal(res.statusCode, 200)
    })
    assert.deepEqual((await request(middleware, 'GET', '/api/comments')).res.body.comments, [])
  } finally {
    t.cleanup()
  }
})

test('repeated wrong keys are rate limited', async () => {
  const t = tempCommentsFile()
  try {
    const middleware = api(t.file)
    let last
    await withAdminKey('secret-key', async () => {
      for (let i = 0; i < 12; i += 1) {
        last = await request(middleware, 'DELETE', '/api/comments/nope', {
          headers: { 'x-admin-key': 'wrong' },
        })
        if (last.res.statusCode === 429) break
      }
    })
    assert.equal(last.res.statusCode, 429)
  } finally {
    t.cleanup()
  }
})

test('an unknown route reports unknown_route and a wrong method reports 405', async () => {
  const t = tempCommentsFile()
  try {
    const middleware = api(t.file)
    const missing = await request(middleware, 'GET', '/api/comments/nope/deeper')
    assert.equal(missing.res.statusCode, 404)
    const wrongMethod = await request(middleware, 'PUT', '/api/comments')
    assert.equal(wrongMethod.res.statusCode, 405)
  } finally {
    t.cleanup()
  }
})

test('a request outside the basePath is passed on', async () => {
  const t = tempCommentsFile()
  try {
    const { nextCalled } = await request(api(t.file), 'GET', '/api/bilibili/profile')
    assert.equal(nextCalled, true)
  } finally {
    t.cleanup()
  }
})

test('an oversized body is rejected with 413', async () => {
  const t = tempCommentsFile()
  try {
    const huge = `{"author":"a","text":"${'x'.repeat(5000)}"}`
    const { res } = await request(api(t.file), 'POST', '/api/comments', { body: huge })
    assert.equal(res.statusCode, 413)
  } finally {
    t.cleanup()
  }
})

test('comments are never cached by the browser or a proxy', async () => {
  const t = tempCommentsFile()
  try {
    const { res } = await request(api(t.file), 'GET', '/api/comments')
    assert.equal(res.headers['cache-control'], 'no-store')
  } finally {
    t.cleanup()
  }
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test`
Expected: FAIL — `does not provide an export named 'commentsApi'`。

- [ ] **Step 3: 实现**

追加到 `server/comments.mjs`：

```js
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

/** Runtime comments live outside `dist/`; resolved from this file, not cwd. */
const DEFAULT_FILE = fileURLToPath(new URL('../data/comments.json', import.meta.url))

/**
 * Constant-time key comparison. Both sides are hashed first so that inputs of
 * different lengths cannot be told apart by how long the comparison takes.
 */
export function checkAdminKey(provided, expected) {
  if (!expected) return { ok: false, status: 503, code: 'not_configured', error: 'Admin key is not configured' }
  if (typeof provided !== 'string' || !provided) {
    return { ok: false, status: 401, code: 'unauthorized', error: 'Missing admin key' }
  }
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, status: 401, code: 'unauthorized', error: 'Invalid admin key' }
}

/**
 * Connect/Express compatible middleware exposing visitor comments.
 *
 * Mounted by both the Vite dev server and the production Express server.
 *
 *   GET    /api/comments/health
 *   GET    /api/comments?post=<id>
 *   POST   /api/comments
 *   DELETE /api/comments/:id      (requires x-admin-key)
 *
 * @param {{ basePath?: string, file?: string | null, flushDelayMs?: number,
 *           persistOnExit?: boolean }} [options]
 */
export function commentsApi(options = {}) {
  const basePath = options.basePath ?? '/api/comments'
  const store = createCommentStore({
    file: options.file === undefined ? DEFAULT_FILE : options.file,
    flushDelayMs: options.flushDelayMs,
  })
  const postLimiter = createPostLimiter()
  const authLimiter = createAuthLimiter()

  if (options.persistOnExit !== false) {
    const flush = () => store.flush()
    process.once('exit', flush)
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        flush()
        process.exit(0)
      })
    }
  }

  return async function commentsApiMiddleware(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(basePath)) return next()

    const route = url.pathname.slice(basePath.length).replace(/\/+$/, '') || '/'
    const isRead = req.method === 'GET' || req.method === 'HEAD'
    const methodNotAllowed = () => send(res, 405, { ok: false, code: 'method_not_allowed' })

    try {
      if (route === '/health') {
        if (!isRead) return methodNotAllowed()
        return send(res, 200, { ok: true })
      }

      if (route === '/') {
        if (isRead) {
          const post = url.searchParams.get('post')
          return send(res, 200, { ok: true, comments: store.list(post || null) })
        }
        if (req.method !== 'POST') return methodNotAllowed()

        const ip = clientIp(req)
        if (!postLimiter.allow(ip)) {
          return send(res, 429, {
            ok: false,
            code: 'too_many_requests',
            error: 'Please wait a minute before posting again',
          })
        }

        const body = await readJsonBody(req)

        // Honeypot: hidden from people, irresistible to naive bots. Answer as if
        // it worked so the bot has nothing to learn from.
        if (typeof body?.website === 'string' && body.website.trim()) {
          return send(res, 200, { ok: true, comment: null })
        }

        const validated = validateComment(body)
        if (!validated.ok) {
          return send(res, 400, { ok: false, code: validated.code, error: validated.error })
        }
        return send(res, 200, { ok: true, comment: store.add(validated.value) })
      }

      const id = route.startsWith('/') ? decodeURIComponent(route.slice(1)) : ''
      if (id && !id.includes('/')) {
        if (req.method !== 'DELETE') return methodNotAllowed()

        const ip = clientIp(req)
        if (!authLimiter.allow(ip)) {
          return send(res, 429, { ok: false, code: 'too_many_requests', error: 'Too many attempts' })
        }
        const key = (process.env.COMMENTS_ADMIN_KEY ?? '').trim()
        const auth = checkAdminKey(req.headers?.['x-admin-key'], key)
        if (!auth.ok) {
          return send(res, auth.status, { ok: false, code: auth.code, error: auth.error })
        }
        // A successful delete must not consume the failure budget.
        authLimiter.clear(ip)
        if (!store.remove(id)) {
          return send(res, 404, { ok: false, code: 'unknown_route', error: 'No such comment' })
        }
        return send(res, 200, { ok: true })
      }

      return send(res, 404, { ok: false, code: 'unknown_route', error: 'Unknown route' })
    } catch (err) {
      if (err instanceof CommentsError) {
        return send(res, err.status, { ok: false, code: err.code, error: err.message })
      }
      console.error('[comments-api]', err)
      return send(res, 500, {
        ok: false,
        code: 'internal_error',
        error: err instanceof Error ? err.message : 'Unexpected error',
      })
    }
  }
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} body
 * @param {number} [maxAge] `Cache-Control: max-age` in seconds
 */
function send(res, status, body, maxAge = 0) {
  const json = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store')
  res.end(json)
}
```

同时把文件顶部已有的 `import { randomUUID } from 'node:crypto'` 合并进这一处 import（避免重复 import 同一模块）——最终顶部应为：

```js
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add server/comments.mjs test/comments.test.mjs
git commit -m "feat(comments): 中间件路由、恒定时间鉴权与蜜罐"
```

---

### Task 4: 挂载到两个服务器 + 部署文档

**Files:**
- Modify: `server/api.mjs`（re-export）
- Modify: `server.js`（挂载）
- Modify: `vite.config.ts`（dev 插件）
- Modify: `.env.example`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes: Task 3 的 `commentsApi`
- Produces: 生产与开发两套服务器上都可用的 `/api/comments*`

- [ ] **Step 1: `server/api.mjs` 加 re-export**

在 `export { statsApi } from './stats.mjs'` 下一行加：

```js
export { commentsApi } from './comments.mjs'
```

- [ ] **Step 2: `server.js` 导入并挂载**

import 块加 `commentsApi`（与 `statsApi` 并列），然后在 `app.use(statsApi())` 之后加：

```js
// Visitor comments (persists to data/comments.json)
app.use(commentsApi())
```

必须在 `express.static` 那一段**之前**。

- [ ] **Step 3: `vite.config.ts` 加 dev 插件**

import 块加 `commentsApi`，并在 `statsApiPlugin` 之后新增：

```ts
/**
 * Mount visitor comments on the dev server so `npm run dev` behaves exactly like
 * production (`npm start`).
 */
function commentsApiPlugin(): Plugin {
  return {
    name: 'comments-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(commentsApi())
    },
  }
}
```

`plugins` 数组加 `commentsApiPlugin()`。

- [ ] **Step 4: 用 curl 验证真实 HTTP 层**

```bash
npm run build && node server.js > /tmp/c.log 2>&1 &
sleep 4
curl -s localhost:3000/api/comments/health
curl -s localhost:3000/api/comments
curl -s -X POST localhost:3000/api/comments \
  -H 'content-type: application/json' \
  -d '{"author":"测试","text":"你好呀","postId":null}'
curl -s localhost:3000/api/comments
curl -s -w ' [%{http_code}]\n' -X POST localhost:3000/api/comments \
  -H 'content-type: application/json' -d '{"author":"a","text":"太快了"}'
curl -s -w ' [%{http_code}]\n' localhost:3000/api/comments/health -X DELETE
```

Expected：health `{"ok":true}`；第一条 POST 返回带 `id` 的 comment；第二条同 IP 立刻发返回 429；DELETE health 返回 404 或 405（不是 200）。

顺手确认 `data/comments.json` 已生成且内容正确，然后 `kill` 掉该进程并 `rm -rf data`。

- [ ] **Step 5: 更新 `.env.example` 与部署文档**

`.env.example` 末尾追加：

```dotenv

# ── 访客留言管理 ─────────────────────────────────
# 管理页 /manage 删除留言所需。不配置则删除接口关闭（留言提交不受影响）。
# 建议用长随机串，例如：openssl rand -hex 32
COMMENTS_ADMIN_KEY=
```

`docs/deployment.md` 在"访问统计数据"一节后新增：

```markdown
## 10. 访客留言

首页留言板与文章评论区由 `server/comments.mjs` 提供，留言写在 `data/comments.json`。

- 与 `data/stats.json` 一样属于运行时数据：不在 `dist/` 内，`npm run build` 不覆盖，已在 `.gitignore` 中，**迁移服务器时需单独备份**。
- 访客留言**立即公开**，无审核。发现垃圾留言用下方管理页删除。
- 管理页：访问 `你的网址/manage`，输入 `.env` 里的 `COMMENTS_ADMIN_KEY`。
- 未配置 `COMMENTS_ADMIN_KEY` 时删除接口关闭（返回 503），留言提交与展示照常。
- 基础防护：同 IP 每分钟 1 条；昵称 1–24 字、正文 1–500 字；蜜罐字段拦截自动脚本。
- 列表最多显示最近 200 条。
```

- [ ] **Step 6: 提交**

```bash
git add server/api.mjs server.js vite.config.ts .env.example docs/deployment.md
git commit -m "feat(comments): 挂载 /api/comments 并补部署文档"
```

---

### Task 5: 前端数据层与配置文案

**Files:**
- Create: `src/lib/comments.ts`
- Modify: `src/site.config.ts`

**Interfaces:**
- Consumes: Task 3 的接口；`src/data/comments.ts` 的 `COMMENTS` / `Comment`
- Produces:
  - `type VisitorComment = { id: string, author: string, text: string, postId: string | null, createdAt: string }`
  - `class CommentsRequestError extends Error { code: string }`
  - `COMMENTS_SILENT_CODES: Set<string>`
  - `fetchComments({ postId?, apiBase?, signal? }): Promise<VisitorComment[]>`
  - `submitComment({ author, text, postId, website, apiBase? }): Promise<VisitorComment | null>`
  - `deleteComment({ id, adminKey, apiBase? }): Promise<void>`
  - `useComments({ postId?, enabled?, apiBase? }): { comments: DisplayComment[], error, silent, loading, submitting, submit(author, text), refresh() }`
  - `type DisplayComment = { id: string, author: string, text: string, createdAt: string | null }`
  - `SITE_CONFIG.comments = { enabled: boolean, apiBase: string }`

**注意：** 纯静态评论（`COMMENTS`）**只在首页作用域**出现；文章作用域只有该文章的访客留言。这个规则集中在 `useComments` 里，不散落到组件。

- [ ] **Step 1: 加配置与文案**

`src/site.config.ts` 的 `SiteConfig` 类型里，`stats` 块之后加：

```ts
  comments: {
    /** master switch for the guestbook and per-article comment threads */
    enabled: boolean
    /** override when the server is hosted on another origin */
    apiBase: string
  }
```

`SITE_CONFIG` 里 `stats` 之后加：

```ts
  comments: {
    enabled: true,
    apiBase: '/api/comments',
  },
```

`strings.zh` 加：

```ts
      'comments.title': '留言板',
      'comments.empty': '还没有留言，来当第一个吧~',
      'comments.name': '昵称',
      'comments.namePlaceholder': '怎么称呼你？',
      'comments.body': '留言',
      'comments.bodyPlaceholder': '说点什么…',
      'comments.submit': '发送',
      'comments.sending': '发送中…',
      'comments.sent': '发送成功，谢谢！',
      'comments.count': '留言',
      'comments.loadFailed': '暂时无法加载留言',
      'comments.sendFailed': '发送失败，请稍后重试',
      'comments.tooFast': '发得太快了，请等一分钟再试',
      'comments.tooLong': '内容太长了',
      'comments.needNameAndBody': '昵称和留言都要填哦',
```

`strings.en` 加：

```ts
      'comments.title': 'guestbook',
      'comments.empty': 'No comments yet — be the first!',
      'comments.name': 'name',
      'comments.namePlaceholder': 'What should we call you?',
      'comments.body': 'comment',
      'comments.bodyPlaceholder': 'Say something…',
      'comments.submit': 'send',
      'comments.sending': 'sending…',
      'comments.sent': 'Sent. Thank you!',
      'comments.count': 'comments',
      'comments.loadFailed': 'Comments are unavailable right now',
      'comments.sendFailed': 'Could not send. Please try again.',
      'comments.tooFast': 'Too fast — please wait a minute',
      'comments.tooLong': 'That is too long',
      'comments.needNameAndBody': 'Both a name and a comment are required',
```

- [ ] **Step 2: 写 `src/lib/comments.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { COMMENTS } from '../data/comments'

export type VisitorComment = {
  id: string
  author: string
  text: string
  postId: string | null
  createdAt: string
}

/** What the UI renders: static seeded comments have no id or timestamp. */
export type DisplayComment = {
  id: string
  author: string
  text: string
  createdAt: string | null
}

export class CommentsRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'CommentsRequestError'
    this.code = code
  }
}

/** Failures that mean "there is no comment service here" (static hosting). */
export const COMMENTS_SILENT_CODES = new Set(['bad_response', 'unknown_route', 'method_not_allowed'])

export const COMMENTS_AUTHOR_MAX = 24
export const COMMENTS_TEXT_MAX = 500

const DEFAULT_API_BASE = '/api/comments'

function base(apiBase?: string) {
  return (apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '')
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    throw new CommentsRequestError(`Bad response from the comment service (${res.status})`, 'bad_response')
  }
  const record = body as Record<string, unknown> | null
  if (!res.ok || !record || record.ok !== true) {
    throw new CommentsRequestError(
      typeof record?.error === 'string' ? record.error : `Comment service responded with ${res.status}`,
      typeof record?.code === 'string' ? record.code : 'request_failed',
    )
  }
  return record
}

/** Comments for one scope: `null` is the homepage guestbook, otherwise a post id. */
export async function fetchComments({
  postId = null,
  apiBase,
  signal,
}: { postId?: string | null; apiBase?: string; signal?: AbortSignal } = {}): Promise<VisitorComment[]> {
  const url = new URL(`${base(apiBase)}`, window.location.origin)
  if (postId) url.searchParams.set('post', postId)
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })
  const body = await readJson(res)
  return Array.isArray(body.comments) ? (body.comments as VisitorComment[]) : []
}

/**
 * Post a comment. `website` is the honeypot — it is never shown to a person, so a
 * non-empty value means a bot; the server then accepts and discards it.
 */
export async function submitComment({
  author,
  text,
  postId = null,
  website = '',
  apiBase,
}: {
  author: string
  text: string
  postId?: string | null
  website?: string
  apiBase?: string
}): Promise<VisitorComment | null> {
  const res = await fetch(new URL(base(apiBase), window.location.origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ author, text, postId, website }),
  })
  const body = await readJson(res)
  return (body.comment as VisitorComment | null) ?? null
}

/** Admin-only. `adminKey` is the value of `COMMENTS_ADMIN_KEY` on the server. */
export async function deleteComment({
  id,
  adminKey,
  apiBase,
}: {
  id: string
  adminKey: string
  apiBase?: string
}): Promise<void> {
  const res = await fetch(`${new URL(base(apiBase), window.location.origin).toString()}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-admin-key': adminKey, accept: 'application/json' },
  })
  await readJson(res)
}

/**
 * The seeded comments in `comments/*.md` belong to the homepage only — they are
 * not attached to any article.
 */
function seededFor(postId: string | null): DisplayComment[] {
  if (postId) return []
  return COMMENTS.map((c) => ({ id: `seed:${c.author}:${c.text}`, author: c.author, text: c.text, createdAt: null }))
}

export type UseCommentsResult = {
  comments: DisplayComment[]
  error: CommentsRequestError | null
  silent: boolean
  loading: boolean
  submitting: boolean
  submit: (author: string, text: string, website?: string) => Promise<boolean>
  refresh: () => void
}

export function useComments({
  postId = null,
  enabled = true,
  apiBase,
}: { postId?: string | null; enabled?: boolean; apiBase?: string } = {}): UseCommentsResult {
  const [fetched, setFetched] = useState<VisitorComment[]>([])
  const [error, setError] = useState<CommentsRequestError | null>(null)
  const [silent, setSilent] = useState(false)
  const [loading, setLoading] = useState(enabled)
  const [submitting, setSubmitting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    if (!enabled) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const list = await fetchComments({ postId, apiBase, signal: controller.signal })
      if (controller.signal.aborted) return
      setFetched(list)
      setError(null)
    } catch (err) {
      if (controller.signal.aborted) return
      if (err instanceof Error && err.name === 'AbortError') return
      const failure =
        err instanceof CommentsRequestError
          ? err
          : new CommentsRequestError(err instanceof Error ? err.message : 'Comment request failed', 'network_error')
      if (COMMENTS_SILENT_CODES.has(failure.code)) setSilent(true)
      else setError(failure)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [apiBase, enabled, postId])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }
    void load()
    return () => abortRef.current?.abort()
  }, [enabled, load])

  const submit = useCallback(
    async (author: string, text: string, website = '') => {
      setSubmitting(true)
      try {
        await submitComment({ author, text, postId, website, apiBase })
        await load() // show the visitor their own comment straight away
        return true
      } catch (err) {
        const failure =
          err instanceof CommentsRequestError
            ? err
            : new CommentsRequestError(err instanceof Error ? err.message : 'Comment request failed', 'network_error')
        setError(failure)
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [apiBase, load, postId],
  )

  return {
    comments: [...seededFor(postId), ...fetched.map((c) => ({
      id: c.id,
      author: c.author,
      text: c.text,
      createdAt: c.createdAt,
    }))],
    error,
    silent,
    loading,
    submitting,
    submit,
    refresh: () => void load(),
  }
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）。若报未使用变量，删掉未用的 import。

- [ ] **Step 4: 提交**

```bash
git add src/lib/comments.ts src/site.config.ts
git commit -m "feat(comments): 前端数据层与双语配置"
```

---

### Task 6: 留言表单与列表组件

**Files:**
- Create: `src/components/CommentForm.tsx`
- Create: `src/components/CommentList.tsx`

**Interfaces:**
- Consumes: Task 5 的 `useComments` 返回值中的 `submit` / `submitting`，`DisplayComment` 类型，`COMMENTS_AUTHOR_MAX` / `COMMENTS_TEXT_MAX`
- Produces:
  - `CommentForm({ onSubmit, submitting, compact? }: { onSubmit: (author: string, text: string, website: string) => Promise<boolean>, submitting: boolean, compact?: boolean })`
  - `CommentList({ comments }: { comments: DisplayComment[] })`

- [ ] **Step 1: 写 `src/components/CommentForm.tsx`**

```tsx
import { useRef, useState, type FormEvent } from 'react'
import { useLang } from '../i18n'
import { COMMENTS_AUTHOR_MAX, COMMENTS_TEXT_MAX, CommentsRequestError } from '../lib/comments'
import { useComments } from '../lib/comments'

/**
 * The one comment form, shared by the homepage guestbook and every article
 * thread — two copies would drift.
 *
 * `website` is a honeypot: it is hidden from people (and from assistive tech),
 * so anything a bot types there marks the submission as automated.
 */
export default function CommentForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (author: string, text: string, website: string) => Promise<boolean>
  submitting: boolean
}) {
  const { t } = useLang()
  const [author, setAuthor] = useState('')
  const [text, setText] = useState('')
  const [website, setWebsite] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!author.trim() || !text.trim()) {
      setNotice({ tone: 'bad', text: t('comments.needNameAndBody') })
      return
    }
    if ([...author.trim()].length > COMMENTS_AUTHOR_MAX || [...text.trim()].length > COMMENTS_TEXT_MAX) {
      setNotice({ tone: 'bad', text: t('comments.tooLong') })
      return
    }

    const ok = await onSubmit(author, text, website)
    if (ok) {
      setText('')
      setNotice({ tone: 'ok', text: t('comments.sent') })
    } else {
      setNotice({ tone: 'bad', text: t('comments.sendFailed') })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-line mt-6 border-t pt-6">
      <div className="flex flex-col gap-4 md:flex-row">
        <label className="md:w-48">
          <span className="text-dim font-mono text-[10px] tracking-[0.25em] uppercase">
            {t('comments.name')}
          </span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            maxLength={COMMENTS_AUTHOR_MAX}
            placeholder={t('comments.namePlaceholder')}
            className="border-line bg-ink/40 text-paper placeholder:text-dim focus:border-accent mt-2 w-full rounded-none border px-3 py-2 text-sm outline-none"
          />
        </label>

        <label className="flex-1">
          <span className="text-dim font-mono text-[10px] tracking-[0.25em] uppercase">
            {t('comments.body')}
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={COMMENTS_TEXT_MAX}
            rows={3}
            placeholder={t('comments.bodyPlaceholder')}
            className="border-line bg-ink/40 text-paper placeholder:text-dim focus:border-accent mt-2 w-full resize-y border px-3 py-2 text-sm outline-none"
          />
        </label>
      </div>

      {/*
        Honeypot. `hidden` keeps it away from both sighted users and screen
        readers; `tabIndex={-1}` stops keyboard users landing in it.
      */}
      <label hidden aria-hidden="true">
        website
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="bg-accent text-night hover:bg-accent-2 disabled:opacity-50 px-5 py-2 font-mono text-xs font-bold tracking-[0.2em] uppercase transition-colors"
        >
          {submitting ? t('comments.sending') : t('comments.submit')}
        </button>
        {notice && (
          <span
            className={notice.tone === 'ok' ? 'text-accent font-mono text-xs' : 'text-dim font-mono text-xs'}
            role="status"
          >
            {notice.text}
          </span>
        )}
        <span className="text-dim ml-auto font-mono text-[10px] tracking-[0.2em]">
          {text.trim().length}/{COMMENTS_TEXT_MAX}
        </span>
      </div>
    </form>
  )
}

export type CommentFormSubmit = ReturnType<typeof useComments>['submit']
export { CommentsRequestError }
```

Hmm — that last export is odd. Let me drop it; `CommentsRequestError` isn't needed here. Let me remove that import and the trailing exports. Let me clean:

Remove `CommentsRequestError` from the import and the final two lines.

- [ ] **Step 2: 写 `src/components/CommentList.tsx`**

```tsx
import { useLang } from '../i18n'
import type { DisplayComment } from '../lib/comments'

/** Renders a scope's comments, newest first. */
export default function CommentList({ comments }: { comments: DisplayComment[] }) {
  const { t } = useLang()

  if (comments.length === 0) {
    return <p className="text-dim py-6 font-mono text-xs">{t('comments.empty')}</p>
  }

  return (
    <ul className="divide-line divide-y">
      {comments.map((comment) => (
        <li key={comment.id} className="py-5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-paper text-sm font-bold">{comment.author}</span>
            {comment.createdAt && (
              <time className="text-dim font-mono text-[10px] tracking-[0.2em]" dateTime={comment.createdAt}>
                {comment.createdAt.slice(0, 10)}
              </time>
            )}
          </div>
          <p className="text-paper/90 mt-2 text-sm leading-relaxed whitespace-pre-wrap">{comment.text}</p>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 通过。若报 `CommentForm` 的 `compact` 等未使用参数，删掉该参数。

- [ ] **Step 4: 提交**

```bash
git add src/components/CommentForm.tsx src/components/CommentList.tsx
git commit -m "feat(comments): 留言表单与列表组件"
```

---

### Task 7: 首页留言板

**Files:**
- Create: `src/components/CommentBoard.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 5 的 `useComments`、Task 6 的 `CommentForm` / `CommentList`
- Produces: `CommentBoard()` —— 无 props，自行取首页作用域数据

- [ ] **Step 1: 写 `src/components/CommentBoard.tsx`**

```tsx
import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { useComments } from '../lib/comments'
import CommentForm from './CommentForm'
import CommentList from './CommentList'

/**
 * The homepage guestbook. It sits below the article list rather than in the hero:
 * the hero's comments terminal is a decorative typewriter, not a list, and kept
 * its own place.
 */
export default function CommentBoard() {
  const { t } = useLang()
  const { enabled, apiBase } = SITE_CONFIG.comments
  const { comments, error, silent, loading, submitting, submit } = useComments({
    postId: null,
    enabled,
    apiBase,
  })

  // No comment service here (static hosting) — hide the whole board.
  if (!enabled || silent) return null

  return (
    <section id="guestbook" className="mx-auto w-full max-w-7xl px-4 pb-16 md:pb-28">
      <div className="border-line border-t pt-10">
        <h2 className="font-mono text-xs tracking-[0.35em] uppercase">
          {t('comments.title')}
          {comments.length > 0 && <span className="text-dim ml-3">({comments.length})</span>}
        </h2>

        {loading && <p className="text-dim py-6 font-mono text-xs">…</p>}
        {!loading && error && <p className="text-dim py-6 font-mono text-xs">{t('comments.loadFailed')}</p>}
        {!loading && !error && <CommentList comments={comments} />}

        <CommentForm onSubmit={submit} submitting={submitting} />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: 在 `src/App.tsx` 接入**

顶部 import 加 `import CommentBoard from './components/CommentBoard'`。

第 145 行 `</div>`（`#posts` 容器的收尾）与第 146 行 `</>` 之间插入：

```tsx
            <CommentBoard />
```

- [ ] **Step 3: 在浏览器验证**

dev 服务器若已停止，运行 `npm run dev`；否则直接刷新 http://localhost:5173

Expected：
- 滚到文章列表下方，看到「留言板」区块、空状态文案、以及昵称/留言输入框
- 填昵称与内容点"发送" → 出现"发送成功，谢谢！"且留言立刻出现在列表最上方
- 立刻再发一条 → 提示"发送失败，请稍后重试"（被限速），这是预期

- [ ] **Step 4: 提交**

```bash
git add src/components/CommentBoard.tsx src/App.tsx
git commit -m "feat(comments): 首页留言板"
```

---

### Task 8: 文章评论区

**Files:**
- Create: `src/components/PostComments.tsx`
- Modify: `src/components/PostView.tsx`

**Interfaces:**
- Consumes: Task 5 的 `useComments`、Task 6 的 `CommentForm` / `CommentList`
- Produces: `PostComments({ postId }: { postId: string })`

- [ ] **Step 1: 写 `src/components/PostComments.tsx`**

```tsx
import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { useComments } from '../lib/comments'
import CommentForm from './CommentForm'
import CommentList from './CommentList'

/** The comment thread belonging to a single article, keyed by `post.id`. */
export default function PostComments({ postId }: { postId: string }) {
  const { t } = useLang()
  const { enabled, apiBase } = SITE_CONFIG.comments
  const { comments, error, silent, loading, submitting, submit } = useComments({
    postId,
    enabled,
    apiBase,
  })

  if (!enabled || silent) return null

  return (
    <section className="border-line mt-12 border-t pt-8">
      <h2 className="font-mono text-xs tracking-[0.35em] uppercase">
        {t('comments.count')}
        {comments.length > 0 && <span className="text-dim ml-3">({comments.length})</span>}
      </h2>

      {loading && <p className="text-dim py-6 font-mono text-xs">…</p>}
      {!loading && error && <p className="text-dim py-6 font-mono text-xs">{t('comments.loadFailed')}</p>}
      {!loading && !error && <CommentList comments={comments} />}

      <CommentForm onSubmit={submit} submitting={submitting} />
    </section>
  )
}
```

- [ ] **Step 2: 在 `src/components/PostView.tsx` 接入**

import 加 `import PostComments from './PostComments'`。

在正文面板收尾的 `</div>`（第 401 行）之后、底部返回按钮 `<button data-post-meta`（第 403 行）之前插入：

```tsx
        <PostComments postId={post.id} />
```

- [ ] **Step 3: 在浏览器验证**

打开 http://localhost:5173 → 点开任意一篇文章（例如 `Test Post`）

Expected：
- 正文下方出现评论区
- 在此留言后，**返回首页**，首页留言板里**不应**出现这条（它属于那篇文章）
- 再次打开那篇文章，留言还在

- [ ] **Step 4: 提交**

```bash
git add src/components/PostComments.tsx src/components/PostView.tsx
git commit -m "feat(comments): 文章评论区"
```

---

### Task 9: 打字机与滚动横条改用合并数据

**Files:**
- Modify: `src/components/CommentTerminal.tsx`
- Modify: `src/components/CommentMarquee.tsx`

**Interfaces:**
- Consumes: Task 5 的 `useComments`
- Produces: 两个组件的数据源由静态 `COMMENTS` 改为首页作用域的合并列表

**注意：** 这两个是**装饰性**组件。它们必须继续在静态托管下正常工作——`useComments` 的 `silent` 会回落到只有静态评论，因此**不要**因为 `silent` 就提前 return。

- [ ] **Step 1: 改 `CommentTerminal.tsx`**

把 `import { COMMENTS } from '../data/comments'` 换成：

```tsx
import { SITE_CONFIG } from '../site.config'
import { useComments } from '../lib/comments'
```

在组件内把 `const entries = COMMENTS.map((c) => ({ id: c.author, text: c.text }))` 改为：

```tsx
  const { comments } = useComments({
    postId: null,
    enabled: SITE_CONFIG.comments.enabled,
    apiBase: SITE_CONFIG.comments.apiBase,
  })
  const entries = comments.map((c) => ({ id: c.author, text: c.text }))
```

其余打字机逻辑不动；`entries.length === 0` 时已有的 `return null` 分支保留。

**注意副作用**：`entries` 现在会在数据到达后变化（数组每次渲染都是新引用）。现有 `useGSAP` 的依赖若为 `[entries]` 会反复重建时间轴。请把依赖改为 `[entries.length]` 并在时间轴创建前读取最新的 `entries`，或把 `entries` 用 `useMemo` 按 `comments` 缓存。**优先用 `useMemo`**：

```tsx
  const entries = useMemo(
    () => comments.map((c) => ({ id: c.author, text: c.text })),
    [comments],
  )
```

- [ ] **Step 2: 改 `CommentMarquee.tsx`**

同样把 `COMMENTS` 换成 `useComments` + `useMemo`，其余不变。

- [ ] **Step 3: 在浏览器验证**

刷新 http://localhost:5173

Expected：
- Hero 里的打字机**照常循环打字**，且过一会儿会打出刚在留言板发的访客留言
- 页面上那条滚动横条**照常滚动**，同样包含访客留言
- 控制台无 JS 报错

- [ ] **Step 4: 提交**

```bash
git add src/components/CommentTerminal.tsx src/components/CommentMarquee.tsx
git commit -m "feat(comments): 打字机与滚动横条展示访客留言"
```

---

### Task 10: 管理页

**Files:**
- Create: `src/components/ManagePage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 5 的 `fetchComments` / `deleteComment` / `CommentsRequestError`
- Produces: `ManagePage({ onExit }: { onExit: () => void })`，路由 `/manage`

**文案**：这个页面是站长私用工具，**硬编码中文**，不进 i18n（见 Global Constraints）。

- [ ] **Step 1: 写 `src/components/ManagePage.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { CommentsRequestError, deleteComment, fetchComments, type VisitorComment } from '../lib/comments'
import { SITE_CONFIG } from '../site.config'

const KEY_STORAGE = 'nagi-blog-admin-key'

type Scope = { label: string; postId: string | null }

/**
 * Owner-only moderation page at /manage. The key lives in localStorage — never in
 * the URL, which would leak it into browser history and server access logs.
 */
export default function ManagePage({ onExit }: { onExit: () => void }) {
  const { apiBase } = SITE_CONFIG.comments
  const [adminKey, setAdminKey] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [all, setAll] = useState<VisitorComment[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(KEY_STORAGE)
    if (saved) setAdminKey(saved)
    // Keep this page out of search results.
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => {
      document.head.removeChild(robots)
    }
  }, [])

  /** The API is scoped per post, so gather the guestbook and every known post. */
  const loadAll = useCallback(async () => {
    setBusy(true)
    setMessage('')
    try {
      const scopes: Scope[] = [
        { label: '首页留言板', postId: null },
        ...KNOWN_POST_IDS.map((id) => ({ label: id, postId: id })),
      ]
      const groups = await Promise.all(
        scopes.map(async (scope) => {
          const list = await fetchComments({ postId: scope.postId, apiBase })
          return list.map((c) => ({ ...c, scope: scope.label }))
        }),
      )
      const flat = groups.flat() as (VisitorComment & { scope: string })[]
      flat.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      setAll(flat as VisitorComment[])
      setUnlocked(true)
    } catch (err) {
      setUnlocked(false)
      setMessage(err instanceof CommentsRequestError ? `加载失败：${err.message}` : '加载失败')
    } finally {
      setBusy(false)
    }
  }, [apiBase])

  const handleDelete = async (id: string) => {
    setBusy(true)
    setMessage('')
    try {
      await deleteComment({ id, adminKey: adminKey.trim(), apiBase })
      setAll((current) => current.filter((c) => c.id !== id))
      setMessage('已删除')
    } catch (err) {
      if (err instanceof CommentsRequestError && err.code === 'not_configured') {
        setMessage('服务器未配置 COMMENTS_ADMIN_KEY，删除接口已关闭。')
      } else if (err instanceof CommentsRequestError && err.code === 'unauthorized') {
        setMessage('密钥不正确。')
      } else {
        setMessage('删除失败，请稍后重试。')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <button onClick={onExit} className="text-dim hover:text-accent font-mono text-xs tracking-[0.2em]">
          ← 返回首页
        </button>

        <h1 className="mt-8 font-mono text-sm tracking-[0.35em] uppercase">留言管理</h1>

        <div className="border-line mt-6 flex flex-wrap items-end gap-4 border-t pt-6">
          <label className="flex-1">
            <span className="text-dim font-mono text-[10px] tracking-[0.25em] uppercase">管理密钥</span>
            <input
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              type="password"
              placeholder="COMMENTS_ADMIN_KEY"
              className="border-line bg-ink/40 text-paper mt-2 w-full border px-3 py-2 text-sm outline-none"
            />
          </label>
          <button
            onClick={() => {
              localStorage.setItem(KEY_STORAGE, adminKey)
              void loadAll()
            }}
            disabled={busy || !adminKey.trim()}
            className="bg-accent text-night disabled:opacity-50 px-5 py-2 font-mono text-xs font-bold tracking-[0.2em] uppercase"
          >
            {busy ? '加载中…' : '载入留言'}
          </button>
        </div>

        {message && <p className="text-dim mt-4 font-mono text-xs">{message}</p>}

        {unlocked && (
          <>
            <p className="text-dim mt-8 font-mono text-xs">共 {all.length} 条</p>
            <ul className="divide-line divide-y">
              {all.map((comment) => (
                <li key={comment.id} className="flex items-start gap-4 py-5">
                  <div className="min-w-0 flex-1">
                    <div className="text-dim font-mono text-[10px] tracking-[0.2em]">
                      {comment.createdAt.slice(0, 16).replace('T', ' ')} ·{' '}
                      {comment.postId ?? '首页留言板'}
                    </div>
                    <div className="text-paper mt-1 text-sm font-bold">{comment.author}</div>
                    <p className="text-paper/90 mt-1 text-sm whitespace-pre-wrap">{comment.text}</p>
                  </div>
                  <button
                    onClick={() => void handleDelete(comment.id)}
                    disabled={busy}
                    className="text-dim hover:text-accent shrink-0 font-mono text-xs tracking-[0.2em] disabled:opacity-50"
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

/** Post ids are known at build time; import lazily to avoid a cycle with App. */
import { POSTS } from '../data/posts'
const KNOWN_POST_IDS = POSTS.map((p) => p.id)
```

把最后的 `import` 提到文件顶部（ES module 的 import 必须在顶部；这里刻意写出位置提醒，实施时请合并到顶部 import 区）。

- [ ] **Step 2: 在 `src/App.tsx` 加路由**

顶部加 `import ManagePage from './components/ManagePage'`，并仿照现有的 `isTestRoute` 增加：

```tsx
function isManageRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/+$/, '') === '/manage'
}
```

在 `Shell` 内加 `const [manageRoute] = useState<boolean>(isManageRoute)`，并在 `testRoute` 分支之前加：

```tsx
  if (manageRoute) {
    return (
      <div className={`${SITE_CONFIG.grid.enabled ? 'bg-blueprint' : ''} min-h-[100dvh]`}>
        <Background />
        <ManagePage onExit={() => (window.location.pathname = '/')} />
      </div>
    )
  }
```

- [ ] **Step 3: 在浏览器验证**

先在 `.env` 里加 `COMMENTS_ADMIN_KEY=testkey123`，重启 dev 服务器。

打开 http://localhost:5173/manage

Expected：
- 输入错误密钥 → 点"载入留言"后不可进入（注意：载入本身不校验密钥，**删除**才校验；因此错误的密钥要到点删除时才会报"密钥不正确"）
- 输入正确密钥 → 列表显示所有留言，标明属于哪篇文章
- 点"删除" → 该条消失
- 删除后回首页 → 该留言已不在留言板上
- 未配置 `COMMENTS_ADMIN_KEY` 时点删除 → 提示"服务器未配置…删除接口已关闭"

- [ ] **Step 4: 提交**

```bash
git add src/components/ManagePage.tsx src/App.tsx
git commit -m "feat(comments): /manage 留言管理页"
```

---

### Task 11: 端到端验证

**Files:** 无（只验证）

- [ ] **Step 1: 全套自动化检查**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected：测试 `fail 0`；tsc 无输出；build 以 `✓ built` 结束。

- [ ] **Step 2: 生产模式 API 全套 curl**

```bash
rm -rf data
COMMENTS_ADMIN_KEY=testkey123 node server.js > /tmp/e2e.log 2>&1 &
sleep 4
echo "health     : $(curl -s localhost:3000/api/comments/health)"
echo "empty      : $(curl -s localhost:3000/api/comments)"
echo "post       : $(curl -s -X POST localhost:3000/api/comments -H 'content-type: application/json' -d '{"author":"小明","text":"你好"}')"
echo "rate limit : $(curl -s -w ' [%{http_code}]' -X POST localhost:3000/api/comments -H 'content-type: application/json' -d '{"author":"a","text":"b"}')"
echo "bad author : $(curl -s -w ' [%{http_code}]' -X POST localhost:3000/api/comments/H 'content-type: application/json' -d '{"author":"","text":"b"}')"
echo "honeypot   : $(curl -s -w ' [%{http_code}]' -X POST localhost:3000/api/comments -H 'content-type: application/json' -d '{"author":"bot","text":"spam","website":"http://x"}')"
echo "no key del : $(curl -s -w ' [%{http_code}]' -X DELETE localhost:3000/api/comments/whatever)"
echo "wrong key  : $(curl -s -w ' [%{http_code}]' -X DELETE localhost:3000/api/comments/whatever -H 'x-admin-key: nope')"
```

Expected：health `{"ok":true}`；empty 是空数组；post 返回带 id 的 comment；第二次 POST 是 429；空昵称是 400；蜜罐是 200；无 key 删除是 401；错 key 是 401。

注意：**蜜罐那次不会占用限速额度之外的东西**，但 429 之后所有同 IP 请求都会被挡——所以上面"bad author"要在限速窗口之外单独跑，或换个思路：把这几条按顺序跑，看到 429 就等 60 秒。实施时**把 429 那条放到最后**，避免它污染后续断言。

- [ ] **Step 3: 浏览器端到端**

`npm run dev`（或复用已运行的实例），在浏览器依次验证：

1. 首页滚到下方 → 留言板出现，空状态文案正确
2. 填昵称+内容 → 发送 → 提示成功，留言出现在列表顶部，作者名与时间正确
3. 刷新页面 → 留言仍在（已落盘）
4. Hero 的打字机循环里出现这条留言（可能要等一轮）
5. 打开 `Test Post` → 在评论区留一条 → 返回首页 → 首页留言板里**没有**这条
6. `/manage` → 输入密钥 → 能列出并删除上面两条
7. 删除后回首页 → 对应留言消失
8. 打开浏览器控制台 → **无 JS 报错**

- [ ] **Step 4: 静态托管降级验证**

```bash
npx vite preview --port 4173
```

打开 http://localhost:4173

Expected：页面正常渲染；**留言板与评论区整体不显示**；控制台**无 JS 异常**（会有浏览器自动记录的 404 网络日志，与现有数据卡一致，属预期）。

- [ ] **Step 5: 清理并提交**

```bash
rm -rf data
git add -A
git commit -m "chore(comments): 端到端验证通过"
```

（若无文件变更，跳过提交。）

---

## Self-Review

**Spec coverage：** 逐条对照 `docs/superpowers/specs/2026-10-05-visitor-comments-design.md`：

| Spec 要求 | 对应任务 |
|---|---|
| 访客提交留言，立即公开 | Task 1（存储）、Task 3（POST） |
| 首页留言板在文章列表之后 | Task 7 |
| 每篇文章下方评论区 | Task 8 |
| Hero 打字机保留并显示访客留言 | Task 9 |
| `/manage` 隐藏管理页 + 密钥 | Task 10 |
| 昵称限长 / 正文限长 / 空白拒绝 | Task 1 |
| 同 IP 每分钟 1 条 | Task 2、Task 3 |
| 蜜罐 | Task 3 |
| 手写 body 读取 + 4KB 上限 | Task 2 |
| 恒定时间密钥比较 | Task 3 |
| 未配密钥时删除接口 503 | Task 3 |
| 鉴权失败限速、成功删除不限速 | Task 2、Task 3 |
| `data/comments.json` + 原子写 + 信号 flush | Task 1 |
| 静态评论保留并与访客留言合并（仅首页） | Task 5 |
| 静态托管静默降级 | Task 5、Task 7、Task 8 |
| 禁用 `dangerouslySetInnerHTML` | Global Constraints（无任务使用它） |
| 管理页 noindex + 密钥不进 URL | Task 10 |
| 5 MB 告警 | Task 1 |
| `.env.example` + 部署文档 | Task 4 |
| 测试策略 | Task 1–3 的测试步骤，Task 11 汇总 |
| 不动 `sync-comments.mjs` | Global Constraints |

**Placeholder scan：** 无 TBD/TODO；每个代码步骤都给了完整代码。

**Type consistency：** `VisitorComment`、`DisplayComment`、`useComments` 返回值键名（`comments`/`error`/`silent`/`loading`/`submitting`/`submit`/`refresh`）在 Task 5 定义，Task 6–10 一致引用；服务端 `createCommentStore` 返回 `{ list, add, remove, flush }` 在 Task 1 定义，Task 3 一致使用；`CommentsError` 在 Task 2 定义、Task 3 捕获。错误码在 spec 与 Task 3 中一致。

**已知的实施注意点（非占位符，是刻意的提醒）：**
- Task 3 的 `send` 与 `DEFAULT_FILE` 会在文件里出现第二次定义风险 —— 实施时把 import 合并到顶部、`send` 只保留一份。
- Task 10 的 `import { POSTS }` 必须放在文件顶部，示例中写在中部仅为提示。
- Task 11 的 curl 顺序需把 429 那条放最后。
