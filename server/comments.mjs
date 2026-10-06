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
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

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
 * The visitor's address as seen through Nginx, used to key the rate limiters.
 *
 * Behind the proxy `req.socket.remoteAddress` is always 127.0.0.1, so the real
 * address has to come from a header — and which header, and which part of it,
 * decides whether the limiters can be bypassed.
 *
 * `X-Real-IP` is the trustworthy one: our Nginx sets it with
 * `proxy_set_header X-Real-IP $remote_addr`, overwriting whatever the client
 * sent.
 *
 * `X-Forwarded-For` is only trustworthy at its *end*. Nginx sets it with
 * `$proxy_add_x_forwarded_for`, which is the client's own `X-Forwarded-For`
 * followed by `, ` and the real address. Everything before the last segment is
 * therefore attacker-supplied: reading the first segment would let a visitor
 * rotate one header per request and never hit the limit. Taking the last
 * segment instead is only correct while exactly one proxy sits in front of us —
 * hence preferring `X-Real-IP`, which no client can forge.
 */
export function clientIp(req) {
  const realIp = req.headers?.['x-real-ip']
  const real = Array.isArray(realIp) ? realIp[0] : realIp
  if (typeof real === 'string' && real.trim()) return real.trim()

  const forwarded = req.headers?.['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[forwarded.length - 1] : forwarded
  if (typeof raw === 'string' && raw.trim()) {
    const hops = raw.split(',')
    return hops[hops.length - 1].trim()
  }

  return req.socket?.remoteAddress ?? 'unknown'
}

/**
 * Drop stale keys so forged addresses cannot grow the table without bound, then
 * shed the oldest survivors if that was not enough.
 *
 * The overflow is evicted one key at a time rather than cleared wholesale: a
 * full reset would drop every rate limit in force, so a visitor who could flood
 * enough distinct addresses would unlock their own block. Eviction only costs
 * us the least recent records. `Map` iterates in insertion order, so the first
 * key it yields is the oldest.
 */
function prune(map, now, windowMs, maxKeys) {
  if (map.size <= maxKeys) return
  for (const [key, entry] of map) {
    const stamp = typeof entry === 'number' ? entry : entry.start
    if (now - stamp >= windowMs) map.delete(key)
  }
  // `map.size > 0` also bounds a nonsensical negative `maxKeys`, which would
  // otherwise spin here forever: `map.delete(undefined)` on an empty map is a
  // no-op, so the loop condition would never clear.
  while (map.size > maxKeys && map.size > 0) map.delete(map.keys().next().value)
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
        // Stop reading and reject — the caller's error path still has a 413 to
        // write to this socket. Destroying the request here would tear down the
        // connection before that write, so the client would see a reset instead
        // of the documented `payload_too_large`. Memory is still bounded: the
        // `settled` guard above drops every chunk that follows, so `chunks`
        // never grows past the cap, and a paused request stops emitting at all.
        fail(new CommentsError('Request body is too large', 413, 'payload_too_large'))
        req.pause?.()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (settled) return
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) return fail(new CommentsError('Expected a JSON body', 400, 'bad_request'))
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return fail(new CommentsError('Request body is not valid JSON', 400, 'bad_request'))
      }
      settled = true
      resolve(parsed)
    })

    req.on('error', (err) => fail(new CommentsError(err.message, 400, 'bad_request')))
  })
}

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

        // Honeypot: hidden from people, irresistible to naive bots. The status is
        // the same as a real success, which is enough to fool a script that only
        // reads the status code. The body is not the same (`comment: null`, and
        // nothing was stored), so a bot that inspects the body can tell — forging
        // a comment just to hide that would put fake data in the guestbook, which
        // is not worth it.
        if (typeof body?.website === 'string' && body.website.trim()) {
          return send(res, 200, { ok: true, comment: null })
        }

        const validated = validateComment(body)
        if (!validated.ok) {
          return send(res, 400, { ok: false, code: validated.code, error: validated.error })
        }
        return send(res, 200, { ok: true, comment: store.add(validated.value) })
      }

      let id = ''
      if (route.startsWith('/')) {
        try {
          id = decodeURIComponent(route.slice(1))
        } catch {
          // A malformed escape (`/api/comments/%zz`) is the client's mistake, not
          // a server fault. Reporting it here keeps it out of the catch-all below,
          // which would both mislabel it as `internal_error` and hand anyone a
          // free log line for every request they send.
          return send(res, 400, {
            ok: false,
            code: 'bad_request',
            error: 'Malformed percent-encoding in path',
          })
        }
      }
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
