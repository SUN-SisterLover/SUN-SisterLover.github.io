/**
 * AniList user profile client.
 *
 * AniList's GraphQL endpoint does send CORS headers, but proxying it
 * server-side keeps all data-wall sources behind the same `/api/*` boundary,
 * moves the username out of the frontend bundle into `.env`, and lets us cache
 * the (slow-moving) statistics. Docs: https://anilist.github.io/ApiDocs-GraphQL/
 */

const ANILIST_HOST = 'https://graphql.anilist.co'
const REQUEST_TIMEOUT = 10_000
/** Statistics change slowly; keep them warm for 5 minutes. */
const PROFILE_TTL = 300_000

export class AniListError extends Error {
  /**
   * @param {string} message
   * @param {number} [status] HTTP status to surface to the browser
   * @param {string} [code] stable machine-readable code
   */
  constructor(message, status = 502, code = 'anilist_error') {
    super(message)
    this.name = 'AniListError'
    this.status = status
    this.code = code
  }
}

/** Username from `.env`; the fallback for requests without an explicit one. */
function identity() {
  return process.env.ANILIST_USERNAME?.trim() || ''
}

const QUERY = /* GraphQL */ `
  query ($name: String) {
    User(name: $name) {
      id
      name
      avatar { large }
      statistics {
        anime {
          count
          meanScore
          minutesWatched
          episodesWatched
          statuses { status count }
        }
      }
      favourites {
        anime { nodes { id title { romaji } coverImage { large } } }
      }
    }
  }
`

/**
 * @param {string} query
 * @param {Record<string, unknown>} variables
 */
async function graphql(query, variables) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const res = await fetch(ANILIST_HOST, {
      method: 'POST',
      signal: controller.signal,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 429) {
      throw new AniListError('Rate limited by AniList', 429, 'rate_limited')
    }
    if (!res.ok) {
      throw new AniListError(`AniList responded with ${res.status}`, 502, 'upstream_error')
    }
    const json = await res.json()
    if (json?.errors?.length) {
      throw new AniListError(json.errors[0].message || 'AniList error', 502, 'api_error')
    }
    return json.data
  } catch (err) {
    if (err instanceof AniListError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AniListError('AniList API request timed out', 504, 'timeout')
    }
    throw new AniListError(
      err instanceof Error ? err.message : 'AniList API request failed',
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

/**
 * @param {string} username
 */
async function fetchProfile(username) {
  const data = await graphql(QUERY, { name: username })
  const user = data?.User
  if (!user) {
    throw new AniListError(`No AniList user "${username}"`, 404, 'not_found')
  }

  const anime = user.statistics?.anime
  const nodes = user.favourites?.anime?.nodes ?? []

  return {
    user: {
      id: user.id,
      name: user.name,
      avatar: user.avatar?.large ?? null,
    },
    stats: {
      count: anime?.count ?? 0,
      meanScore: anime?.meanScore ?? 0,
      minutesWatched: anime?.minutesWatched ?? 0,
      episodesWatched: anime?.episodesWatched ?? 0,
      statuses: anime?.statuses ?? [],
    },
    favourites: nodes.slice(0, 9).map((n) => ({
      id: n.id,
      title: n.title?.romaji ?? `#${n.id}`,
      cover: n.coverImage?.large ?? null,
    })),
  }
}

/**
 * Cached entry point used by the HTTP layer. An explicit `username` overrides
 * the `.env` identity; with neither configured the response reports
 * `configured: false` so the frontend can show a placeholder.
 *
 * @param {string} [username]
 */
export async function getAniListProfile(username) {
  const name = String(username ?? '').trim() || identity()
  if (!name) {
    return { ok: true, configured: false, username: '' }
  }
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

/** Whether an AniList identity is available at all. */
export function isConfigured() {
  return Boolean(identity())
}

/**
 * Connect/Express compatible middleware exposing the AniList proxy.
 *
 *   GET /api/anilist/health
 *   GET /api/anilist/profile[?username=<name>]
 *
 * @param {{ basePath?: string }} [options]
 */
export function anilistApi(options = {}) {
  const basePath = options.basePath ?? '/api/anilist'

  return async function anilistApiMiddleware(req, res, next) {
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
        const username = url.searchParams.get('username') ?? undefined
        const payload = await getAniListProfile(username)
        return send(res, 200, payload, 30)
      }

      return send(res, 404, { ok: false, code: 'unknown_route', error: 'Unknown route' })
    } catch (err) {
      const status = err instanceof AniListError ? err.status : 500
      const code = err instanceof AniListError ? err.code : 'internal_error'
      if (status >= 500 && status !== 503) {
        console.error('[anilist-api]', err)
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
