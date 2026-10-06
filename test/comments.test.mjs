import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  validateComment,
  createCommentStore,
  createPostLimiter,
  createAuthLimiter,
  readJsonBody,
  CommentsError,
  clientIp,
  commentsApi,
} from '../server/comments.mjs'

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
  const now = AT
  const limiter = createPostLimiter({ windowMs: 1_000, maxKeys: 10, now: () => now })
  for (let i = 0; i < 50; i += 1) limiter.allow(`10.0.0.${i}`)

  // Enough addresses passed through to evict the earliest ones, so that first
  // address is forgotten and would be admitted again. Without this the table
  // would still be holding all 50 keys and the assertion would report `false`.
  assert.equal(limiter.allow('10.0.0.0'), true)
  // A recent address is still in force, i.e. the table is bounded but not empty.
  assert.equal(limiter.allow('10.0.0.49'), false)
})

test('an overflow sheds only the oldest address rather than wiping every ban', () => {
  const now = AT
  const limiter = createPostLimiter({ windowMs: 60_000, maxKeys: 10, now: () => now })
  for (let i = 0; i < 12; i += 1) limiter.allow(`10.0.0.${i}`)

  // Twelve addresses against a ten-key table. Only the earliest key should have
  // been shed; a `clear()`-style reset would instead have dropped every ban
  // added before the overflow, letting one flood unlock the limiter.
  assert.equal(limiter.allow('10.0.0.5'), false)
  assert.equal(limiter.allow('10.0.0.0'), true)
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

/** A request stub carrying only what `clientIp` reads. */
const ipReq = (headers = {}, socket = undefined) => ({ headers, socket })

test('clientIp prefers x-real-ip, which our Nginx overwrites with the real address', () => {
  const req = ipReq(
    { 'x-real-ip': '7.7.7.7', 'x-forwarded-for': '1.1.1.1, 7.7.7.7' },
    { remoteAddress: '127.0.0.1' },
  )
  assert.equal(clientIp(req), '7.7.7.7')
})

test('clientIp takes the last X-Forwarded-For hop, not the spoofable first one', () => {
  // `$proxy_add_x_forwarded_for` appends the real address to whatever the client
  // sent, so only the final segment is trustworthy. A visitor can put anything
  // in the leading segments — reading `1.1.1.1` here would let them rotate it
  // per request and bypass the limiter entirely.
  const req = ipReq({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, { remoteAddress: '127.0.0.1' })
  assert.equal(clientIp(req), '2.2.2.2')
})

test('clientIp handles a repeated X-Forwarded-For header', () => {
  const req = ipReq({ 'x-forwarded-for': ['1.1.1.1', '2.2.2.2, 3.3.3.3'] })
  assert.equal(clientIp(req), '3.3.3.3')
})

test('clientIp trims the address it settles on', () => {
  assert.equal(clientIp(ipReq({ 'x-real-ip': ' 8.8.8.8 ' })), '8.8.8.8')
  assert.equal(clientIp(ipReq({ 'x-forwarded-for': ' 1.1.1.1 , 2.2.2.2 ' })), '2.2.2.2')
})

test('clientIp ignores blank proxy headers and falls back to the socket address', () => {
  const req = ipReq({ 'x-real-ip': '   ', 'x-forwarded-for': '' }, { remoteAddress: '5.5.5.5' })
  assert.equal(clientIp(req), '5.5.5.5')
  assert.equal(clientIp(ipReq()), 'unknown')
})

/**
 * A request stub that replays `chunks` and then ends.
 *
 * `destroy` is recorded rather than performed: tearing the socket down is
 * exactly the mistake these tests exist to catch, and a no-op stub cannot see
 * it. `req.destroyed` is what the assertions read.
 */
function bodyReq(chunks) {
  const handlers = {}
  const req = {
    destroyed: false,
    on(event, fn) {
      handlers[event] = fn
      return req
    },
    destroy() {
      req.destroyed = true
    },
    /** Drive the fake stream once the caller has attached its listeners. */
    async replay() {
      for (const chunk of chunks) handlers.data?.(Buffer.from(chunk))
      handlers.end?.()
    },
    /** Fail the fake stream instead of ending it. */
    emitError(err) {
      handlers.error?.(err)
    },
  }
  return req
}

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
  // Rejecting is the reader's whole job — its caller still has a 413 to write to
  // this socket. An earlier version called `req.destroy()` on the way out, which
  // killed the connection before that write, so the client got a reset instead of
  // the documented status. This assertion is what would catch that coming back.
  assert.equal(req.destroyed, false)
})

test('readJsonBody rejects invalid JSON', async () => {
  const req = bodyReq(['{ not json'])
  const pending = readJsonBody(req)
  await req.replay()
  await assert.rejects(pending, (err) => err instanceof CommentsError && err.status === 400)
})

test('readJsonBody rejects an empty body', async () => {
  const req = bodyReq([])
  const pending = readJsonBody(req)
  await req.replay()
  await assert.rejects(
    pending,
    (err) => err instanceof CommentsError && err.status === 400 && err.message === 'Expected a JSON body',
  )
})

test('readJsonBody reports a stream error as a bad request', async () => {
  const req = bodyReq([])
  const pending = readJsonBody(req)
  req.emitError(new Error('socket hang up'))
  await assert.rejects(
    pending,
    (err) => err instanceof CommentsError && err.status === 400 && err.message === 'socket hang up',
  )
})

// --- HTTP middleware ---------------------------------------------------------
// `mockRes`/`request` mirror `test/stats.test.mjs`; the fake `req` additionally
// replays a body so `readJsonBody` sees a normal `data`/`end` pair.

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
    /** Recorded, not performed — see the note on `bodyReq`. */
    destroyed: false,
    destroy() {
      req.destroyed = true
    },
    on(event, fn) {
      if (event === 'data' && body !== undefined) fn(Buffer.from(body))
      if (event === 'end') queueMicrotask(fn)
      return req
    },
  }
  await middleware(req, res, () => {
    nextCalled = true
  })
  return { res, nextCalled, req }
}

/**
 * Admin deletes read the key from `process.env` on every request, so it has to
 * stay set for the whole callback — hence `await fn()` rather than `return fn()`.
 * Returning the promise directly would run the `finally` as soon as the callback
 * suspends, restoring the key before its requests ever reach the middleware.
 */
async function withAdminKey(key, fn) {
  const previous = process.env.COMMENTS_ADMIN_KEY
  process.env.COMMENTS_ADMIN_KEY = key
  try {
    return await fn()
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

test('POST rejects an invalid post id without storing anything', async () => {
  const t = tempCommentsFile()
  try {
    // `store.add()` trusts its caller, so this is the only place the post id is
    // actually checked on the way in.
    const middleware = api(t.file)
    const bad = JSON.stringify({ author: 'a', text: 'hi', postId: 'Bad ID!' })
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
    // The status is indistinguishable from a real success; the body is not
    // (`comment: null`). The honeypot only aims to fool status-code-only scripts.
    assert.equal(res.statusCode, 200)
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
      const { res } = await request(middleware, 'DELETE', `/api/comments/${id}`, {
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

test('a malformed percent-escape in the path is a bad request, not a crash', async () => {
  const t = tempCommentsFile()
  try {
    // `decodeURIComponent` throws on this, which would otherwise reach the catch-all
    // and report a server fault (plus a log line) for a request the client botched.
    const { res } = await request(api(t.file), 'GET', '/api/comments/%zz')
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 'bad_request')
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
    const { res, req } = await request(api(t.file), 'POST', '/api/comments', { body: huge })
    assert.equal(res.statusCode, 413)
    // The code, not just the status: `payload_too_large` is the contract the spec
    // publishes, and status alone would not notice it being renamed away.
    assert.equal(res.body.code, 'payload_too_large')
    // The socket has to survive so the 413 above can actually be written to it.
    assert.equal(req.destroyed, false)
  } finally {
    t.cleanup()
  }
})

/**
 * The middleware behind a real socket. `mockRes` records a body whether or not a
 * client could ever receive it, so the one thing it structurally cannot test is
 * whether a response reaches the wire. This is that test's home.
 */
async function withHttpServer(fn) {
  const middleware = commentsApi({ file: null, persistOnExit: false, flushDelayMs: 0 })
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404
      res.end()
    }),
  )
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve) => {
      server.close(resolve)
      // Keep-alive sockets would otherwise hold `close()` open.
      server.closeAllConnections?.()
    })
  }
}

test('an oversized body reaches a real client as 413, not a dropped connection', async () => {
  // Regression guard for `req.destroy()` in `readJsonBody`. With it, the socket
  // died before the middleware's error path ran and `fetch` rejected with
  // `UND_ERR_SOCKET` — the documented status was unreachable from any client,
  // while the mock-based test above stayed green because its `destroy()` was a
  // no-op. Only a real socket can tell those two apart.
  await withHttpServer(async (origin) => {
    const res = await fetch(`${origin}/api/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ author: 'a', text: 'x'.repeat(5000) }),
    })
    assert.equal(res.status, 413)
    assert.equal((await res.json()).code, 'payload_too_large')

    // And the server is still serving — the cap must not cost it the process.
    const health = await fetch(`${origin}/api/comments/health`)
    assert.equal(health.status, 200)
  })
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
