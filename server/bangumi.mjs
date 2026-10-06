/**
 * Bangumi (bgm.tv) user profile client.
 *
 * The v0 API does send CORS headers, but it is slow and flaky from some
 * networks, so we proxy it server-side to keep the browser path single-origin,
 * add a longer timeout and a descriptive User-Agent, and cache aggressively.
 * Docs: https://bangumi.github.io/api/
 */

const BGMI_HOST = 'https://api.bgm.tv'
const REQUEST_TIMEOUT = 15_000
/** Collection data changes slowly; keep it warm for 5 minutes. */
const PROFILE_TTL = 300_000

const UA = 'mikudayo-blog/1.0 (personal site data wall)'

export class BangumiError extends Error {
  /**
   * @param {string} message
   * @param {number} [status] HTTP status to surface to the browser
   * @param {string} [code] stable machine-readable code
   */
  constructor(message, status = 502, code = 'bangumi_error') {
    super(message)
    this.name = 'BangumiError'
    this.status = status
    this.code = code
  }
}

/** Collection type: 1 想看, 2 看过, 3 在看, 4 搁置, 5 抛弃 */
const COLLECTION_TYPES = [1, 2, 3, 4, 5]

/**
 * @param {string} path e.g. `/v0/users/sai`
 */
async function bgmJson(path) {
  const url = new URL(`${BGMI_HOST}${path}`)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': UA },
    })
    if (res.status === 429) {
      throw new BangumiError('Rate limited by Bangumi', 429, 'rate_limited')
    }
    if (res.status === 404) {
      throw new BangumiError('No such Bangumi user', 404, 'not_found')
    }
    if (!res.ok) {
      throw new BangumiError(`Bangumi responded with ${res.status}`, 502, 'upstream_error')
    }
    return await res.json()
  } catch (err) {
    if (err instanceof BangumiError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new BangumiError('Bangumi API request timed out', 504, 'timeout')
    }
    throw new BangumiError(
      err instanceof Error ? err.message : 'Bangumi API request failed',
      502,
      'network_error',
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * TTL cache that also de-duplicates concurrent misses for the same key.
 *
 * @template T
 * @param {number} ttl
 */
function createCache(ttl) {
  /** @type {Map<string, { value: T, expires: number }>} */
  const entries = new Map()
  /** @type {Map<string, Promise<T>>} */
  const inflight = new Map()

  return {
    /**
     * @param {string} key
     * @param {() => Promise<T>} produce
     * @returns {Promise<{ value: T, cached: boolean, age: number }>}
     */
    async get(key, produce) {
      const now = Date.now()
      const hit = entries.get(key)
      if (hit) {
        const age = ttl - (hit.expires - now)
        if (hit.expires > now) return { value: hit.value, cached: true, age }
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

const profileCache = createCache(PROFILE_TTL)

/** @param {string} username */
async function fetchUser(username) {
  const data = await bgmJson(`/v0/users/${encodeURIComponent(username)}`)
  if (!data?.id) {
    throw new BangumiError(`No Bangumi user "${username}"`, 404, 'not_found')
  }
  return {
    id: Number(data.id),
    username: String(data.username ?? username),
    nickname: String(data.nickname ?? username),
    avatar: data.avatar?.large ?? data.avatar?.medium ?? null,
  }
}

/**
 * Fetch the user's full collection list (all five types, capped at 100 each).
 *
 * @param {string} username
 */
async function fetchCollections(username) {
  const settled = await Promise.allSettled(
    COLLECTION_TYPES.map((type) =>
      bgmJson(
        `/v0/users/${encodeURIComponent(username)}/collections?type=${type}&limit=100`,
      ),
    ),
  )

  /** @type {Map<number, any>} */
  const seen = new Map()
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    for (const entry of result.value?.data ?? []) {
      if (!entry?.subject) continue
      seen.set(entry.subject.id, {
        subject: {
          id: entry.subject.id,
          name: String(entry.subject.name ?? ''),
          nameCn: String(entry.subject.name_cn ?? ''),
          image:
            entry.subject.images?.large ??
            entry.subject.images?.medium ??
            null,
          score: Number(entry.subject.score ?? 0),
          date: entry.subject.date ?? null,
        },
        type: Number(entry.type ?? 0),
        rate: Number(entry.rate ?? 0),
        epStatus: Number(entry.ep_status ?? 0),
      })
    }
  }
  return [...seen.values()]
}

/**
 * Fetch and aggregate a Bangumi profile. The user is the only hard requirement;
 * the collection list is best-effort.
 *
 * @param {string} username
 */
async function fetchProfile(username) {
  const [userRes, collectionsRes] = await Promise.allSettled([
    fetchUser(username),
    fetchCollections(username),
  ])

  if (userRes.status === 'rejected') throw userRes.reason

  const collections = collectionsRes.status === 'fulfilled' ? collectionsRes.value : []
  const rated = collections.filter((c) => c.rate > 0)
  const meanScore = rated.length
    ? Math.round((rated.reduce((sum, c) => sum + c.rate, 0) / rated.length) * 10) / 10
    : 0

  return {
    user: userRes.value,
    collections,
    stats: {
      doing: collections.filter((c) => c.type === 3).length,
      collect: collections.filter((c) => c.type === 2).length,
      wish: collections.filter((c) => c.type === 1).length,
      meanScore,
    },
  }
}

/** Username from `.env`; the fallback for requests without an explicit one. */
function identity() {
  return process.env.BANGUMI_USERNAME?.trim() || ''
}

/**
 * Cached entry point used by the HTTP layer. An explicit username overrides
 * the `.env` identity; with neither configured the response reports
 * `configured: false` so the frontend can show a placeholder.
 *
 * @param {string} [username]
 */
export async function getBangumiProfile(username) {
  const name = String(username ?? '').trim() || identity()
  if (!name) return { ok: true, configured: false, username: '' }

  const { value, cached, age } = await profileCache.get(name, () => fetchProfile(name))

  return {
    ok: true,
    configured: true,
    username: name,
    cached,
    /** seconds since the upstream data was fetched */
    age: Math.round(age / 1000),
    fetchedAt: Date.now() - age,
    ttl: Math.round(PROFILE_TTL / 1000),
    ...value,
  }
}

/** Whether a Bangumi identity is available at all. */
export function isConfigured() {
  return Boolean(identity())
}

/**
 * Connect/Express compatible middleware exposing the Bangumi proxy.
 *
 *   GET /api/bangumi/health
 *   GET /api/bangumi/profile?username=<name>
 *
 * @param {{ basePath?: string }} [options]
 */
export function bangumiApi(options = {}) {
  const basePath = options.basePath ?? '/api/bangumi'

  return async function bangumiApiMiddleware(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(basePath)) return next()

    const route = url.pathname.slice(basePath.length).replace(/\/+$/, '') || '/'

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, { ok: false, code: 'method_not_allowed' })
    }

    try {
      if (route === '/health') {
        return send(res, 200, { ok: true, configured: isConfigured() }, 0)
      }

      if (route === '/profile') {
        const payload = await getBangumiProfile(
          url.searchParams.get('username') ?? undefined,
        )
        return send(res, 200, payload, 30)
      }

      return send(res, 404, { ok: false, code: 'unknown_route', error: 'Unknown route' })
    } catch (err) {
      const status = err instanceof BangumiError ? err.status : 500
      const code = err instanceof BangumiError ? err.code : 'internal_error'
      if (status >= 500 && status !== 503) {
        console.error('[bangumi-api]', err)
      }
      return send(res, status, {
        ok: false,
        code,
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
  res.setHeader(
    'cache-control',
    maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
  )
  res.end(json)
}
