import { createHash } from 'node:crypto'

/**
 * Bilibili user profile client.
 *
 * Bilibili has no official public API. Basic profile info comes from
 * `x/web-interface/card` and the video count from `x/space/navnum`. The recent
 * upload list needs a "WBI" signed request against `x/space/wbi/arc/search`,
 * which Bilibili's risk control refuses without a logged-in cookie — so it is
 * optional: without `BILI_COOKIE` the card simply renders without the recent
 * list. All signing logic is isolated here so an upstream change only touches
 * this module.
 */

const BILI_HOST = 'https://api.bilibili.com'
const ICON_HOST = 'https://i0.hdslb.com'

const REQUEST_TIMEOUT = 8_000
/** How long a resolved profile payload stays warm, in ms. */
const PROFILE_TTL = 120_000

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

/** Optional logged-in cookie (`SESSDATA=...; bili_jct=...`) enabling the recent list. */
function biliCookie() {
  return process.env.BILI_COOKIE?.trim() || ''
}

export class BilibiliError extends Error {
  /**
   * @param {string} message
   * @param {number} [status] HTTP status to surface to the browser
   * @param {string} [code] stable machine-readable code
   */
  constructor(message, status = 502, code = 'bilibili_error') {
    super(message)
    this.name = 'BilibiliError'
    this.status = status
    this.code = code
  }
}

/** ASCII sort order the WBI signature expects, derived from Bilibili's web client. */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
]

function md5(text) {
  return createHash('md5').update(text).digest('hex')
}

function encodeComponent(value) {
  return encodeURIComponent(value)
    .replace(/%7E/g, '~')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

/** Absolute URL for an image, normalising Bilibili's scheme-relative `//i0...` paths. */
function absUrl(url) {
  if (!url) return null
  return url.startsWith('//') ? `${ICON_HOST}${url.slice(1)}` : url
}

/**
 * Perform a GET against api.bilibili.com and return the parsed JSON without a
 * `code` check (used by the `nav` endpoint, which reports `-101` for anonymous
 * visitors but still returns the WBI keys we need).
 *
 * @param {string} path
 * @param {Record<string, string | number>} [params]
 */
async function rawGetJson(path, params = {}) {
  const url = new URL(`${BILI_HOST}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': UA,
        referer: 'https://www.bilibili.com/',
        ...(biliCookie() ? { cookie: biliCookie() } : {}),
      },
    })
    if (res.status === 412) {
      throw new BilibiliError('Bilibili risk control rejected the request', 502, 'risk_control')
    }
    if (res.status === 429) {
      throw new BilibiliError('Rate limited by Bilibili', 429, 'rate_limited')
    }
    if (!res.ok) {
      throw new BilibiliError(`Bilibili responded with ${res.status}`, 502, 'upstream_error')
    }
    return await res.json()
  } catch (err) {
    if (err instanceof BilibiliError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new BilibiliError('Bilibili API request timed out', 504, 'timeout')
    }
    throw new BilibiliError(
      err instanceof Error ? err.message : 'Bilibili API request failed',
      502,
      'network_error',
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Same as `rawGetJson` but enforces the business-level `code` field and applies
 * WBI signing when requested.
 *
 * @param {string} path
 * @param {Record<string, string | number | boolean | undefined>} [params]
 * @param {{ signed?: boolean }} [opts]
 */
async function biliJson(path, params = {}, opts = {}) {
  const final = opts.signed ? await wbiSign(params) : params
  const json = await rawGetJson(path, final)
  if (json && typeof json.code === 'number' && json.code !== 0) {
    if (json.code === -412 || json.code === -352) {
      throw new BilibiliError('Bilibili risk control rejected the request', 502, 'risk_control')
    }
    throw new BilibiliError(json.message || `Bilibili error ${json.code}`, 502, 'api_error')
  }
  return json
}

/** Fetch the current `img_key`/`sub_key` pair. Keys are cached for the process lifetime. */
let wbiKeysCache = null
async function getWbiKeys() {
  if (wbiKeysCache) return wbiKeysCache
  const data = await rawGetJson('/x/web-interface/nav')
  const wbi = data?.data?.wbi_img
  if (!wbi?.img_url || !wbi?.sub_url) {
    throw new BilibiliError('Bilibili did not return WBI keys', 502, 'no_wbi_keys')
  }
  const base = (/** @type {string} */ u) => u.split('/').pop()?.split('.')[0]
  wbiKeysCache = { imgKey: base(wbi.img_url), subKey: base(wbi.sub_url) }
  return wbiKeysCache
}

/** Derive the 32-char mixin key from the two WBI keys. */
function getMixinKey(orig) {
  return MIXIN_KEY_ENC_TAB.map((n) => orig[n]).join('').slice(0, 32)
}

/** Add `wts`/`w_rid` to a parameter object using the current WBI keys. */
async function wbiSign(params) {
  const { imgKey, subKey } = await getWbiKeys()
  const mixinKey = getMixinKey(imgKey + subKey)
  const query = { ...params, wts: Math.floor(Date.now() / 1000) }
  const queryStr = Object.keys(query)
    .sort()
    .map((k) => `${encodeComponent(k)}=${encodeComponent(String(query[k]))}`)
    .join('&')
  return { ...query, w_rid: md5(queryStr + mixinKey) }
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
     * @param {number} [minAge] force a refresh once the entry is older than this
     * @returns {Promise<{ value: T, cached: boolean, age: number }>}
     */
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

const profileCache = createCache(PROFILE_TTL)

const UID = /^\d{1,16}$/

/**
 * Fetch basic profile info. `card` provides name/avatar/fans; the video count
 * comes from `navnum` (the `video_count` field was dropped from `card`).
 *
 * @param {string} uid
 */
async function fetchCard(uid) {
  const [cardRes, navnumRes] = await Promise.allSettled([
    biliJson('/x/web-interface/card', { mid: uid }),
    biliJson('/x/space/navnum', { mid: uid }),
  ])

  if (cardRes.status === 'rejected') throw cardRes.reason

  const card = cardRes.value?.data?.card
  if (!card) {
    throw new BilibiliError(`No Bilibili user ${uid}`, 404, 'not_found')
  }
  const level = card.level_info

  return {
    uid: String(card.mid),
    name: card.name ?? `UID ${uid}`,
    avatar: absUrl(card.face),
    sign: card.sign ?? '',
    followers: Number(card.fans ?? 0),
    following: Number(card.attention ?? 0),
    videoCount:
      navnumRes.status === 'fulfilled'
        ? Number(navnumRes.value?.data?.video ?? 0)
        : 0,
    level: level?.current_level ?? null,
    spaceUrl: `https://space.bilibili.com/${card.mid}`,
  }
}

/** @param {number} seconds */
function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * Fetch the most recent uploads via the WBI-signed space search. Requires a
 * logged-in `BILI_COOKIE` (risk control refuses anonymous requests); without
 * one it reports `available: false` so the card degrades gracefully.
 *
 * @param {string} uid
 */
async function fetchRecentVideos(uid) {
  if (!biliCookie()) return { list: [], available: false }
  const data = await biliJson(
    '/x/space/wbi/arc/search',
    { mid: uid, ps: 8, pn: 1, order: 'pubdate' },
    { signed: true },
  )
  const list = data?.data?.list?.vlist ?? []
  return {
    available: true,
    list: list.slice(0, 8).map((v) => ({
      bvid: String(v.bvid ?? ''),
      title: String(v.title ?? 'Untitled'),
      cover: absUrl(v.pic),
      play: Number(v.play ?? 0),
      duration: formatDuration(v.duration),
      created: v.created ? Number(v.created) : null,
      url: `https://www.bilibili.com/video/${v.bvid}`,
    })),
  }
}

/**
 * Fetch and aggregate everything the Bilibili card needs.
 *
 * The card info is the only hard requirement; the recent-video list is
 * best-effort (needs a cookie, and an upstream change shouldn't kill the card).
 *
 * @param {string} uid
 */
async function fetchProfile(uid) {
  const [cardRes, recentRes] = await Promise.allSettled([
    fetchCard(uid),
    fetchRecentVideos(uid),
  ])

  if (cardRes.status === 'rejected') throw cardRes.reason

  return {
    user: cardRes.value,
    recent: recentRes.status === 'fulfilled' ? recentRes.value.list : [],
    recentAvailable: recentRes.status === 'fulfilled' ? recentRes.value.available : false,
  }
}

/** UID from `.env`; the fallback for requests without an explicit one. */
function identity() {
  return process.env.BILI_UID?.trim() || ''
}

/**
 * Cached entry point used by the HTTP layer. An explicit UID overrides the
 * `.env` identity; with neither configured the response reports
 * `configured: false` so the frontend can show a placeholder.
 *
 * @param {string} [input] UID (or a space.bilibili.com URL)
 */
export async function getBiliProfile(input) {
  const raw = String(input ?? '').trim() || identity()
  if (!raw) return { ok: true, configured: false, uid: '' }

  const urlMatch = raw.match(/space\.bilibili\.com\/(\d+)/)
  const uid = urlMatch ? urlMatch[1] : raw
  if (!UID.test(uid)) {
    throw new BilibiliError('Missing or invalid Bilibili uid', 400, 'bad_request')
  }

  const { value, cached, age } = await profileCache.get(uid, () => fetchProfile(uid))

  return {
    ok: true,
    configured: true,
    uid,
    cached,
    /** seconds since the upstream data was fetched */
    age: Math.round(age / 1000),
    fetchedAt: Date.now() - age,
    ttl: Math.round(PROFILE_TTL / 1000),
    ...value,
  }
}

/** Whether a Bilibili identity is available at all. */
export function isConfigured() {
  return Boolean(identity())
}

/**
 * Connect/Express compatible middleware exposing the Bilibili proxy.
 *
 * Mounted both by the Vite dev server (`vite.config.ts`) and by the production
 * Express server (`server.js`):
 *
 *   GET /api/bilibili/health
 *   GET /api/bilibili/profile?uid=<id>
 *
 * @param {{ basePath?: string }} [options]
 */
export function bilibiliApi(options = {}) {
  const basePath = options.basePath ?? '/api/bilibili'

  return async function bilibiliApiMiddleware(req, res, next) {
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
        const payload = await getBiliProfile(url.searchParams.get('uid') ?? undefined)
        return send(res, 200, payload, 30)
      }

      return send(res, 404, { ok: false, code: 'unknown_route', error: 'Unknown route' })
    } catch (err) {
      const status = err instanceof BilibiliError ? err.status : 500
      const code = err instanceof BilibiliError ? err.code : 'internal_error'
      if (status >= 500 && status !== 503) {
        console.error('[bilibili-api]', err)
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
