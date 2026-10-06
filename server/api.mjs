export { bilibiliApi } from './bilibili.mjs'
export { bangumiApi } from './bangumi.mjs'
export { anilistApi } from './anilist.mjs'
export { statsApi } from './stats.mjs'
export { commentsApi } from './comments.mjs'
import { getSteamProfile, isConfigured, SteamError } from './steam.mjs'
import {
  searchSong,
  getSongUrl,
  getPlaylistDetail,
  getUserRecord,
  getLyric,
  proxyCover,
  isNeteaseConfigured,
  NeteaseError,
} from './netease.mjs'

/**
 * Connect/Express compatible middleware exposing the Steam proxy.
 *
 * Mounted both by the Vite dev server (`vite.config.ts`) and by the production
 * Express server (`server.js`) so the same routes exist in every environment.
 *
 *   GET /api/steam/health
 *   GET /api/steam/profile?id=<steamid64 | vanity | profile url>[&refresh=1]
 *
 * @param {{ basePath?: string }} [options]
 */
export function steamApi(options = {}) {
  const basePath = options.basePath ?? '/api/steam'

  return async function steamApiMiddleware(req, res, next) {
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
        const id = url.searchParams.get('id')
        if (!id) {
          return send(res, 400, {
            ok: false,
            code: 'bad_request',
            error: 'Query parameter "id" is required',
          })
        }
        const payload = await getSteamProfile(id, {
          refresh: url.searchParams.get('refresh') === '1',
        })
        return send(res, 200, payload, 30)
      }

      return send(res, 404, { ok: false, code: 'unknown_route', error: 'Unknown route' })
    } catch (err) {
      const status = err instanceof SteamError ? err.status : 500
      const code = err instanceof SteamError ? err.code : 'internal_error'
      if (status >= 500 && status !== 503) {
        console.error('[steam-api]', err)
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
 * Connect/Express compatible middleware exposing the NetEase Cloud Music proxy.
 *
 *   GET /api/netease/health
 *   GET /api/netease/search?kw=&limit=
 *   GET /api/netease/song/url?id=&br=
 *   GET /api/netease/playlist/detail?id=
 *   GET /api/netease/user/record?uid=&type=
 *   GET /api/netease/lyric?id=
 *
 * @param {{ basePath?: string }} [options]
 */
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

      if (route === '/cover') {
        const imageUrl = url.searchParams.get('u')
        if (!imageUrl) {
          return send(res, 400, { ok: false, code: 'bad_request', error: 'Query parameter "u" is required' })
        }
        // Only proxy NetEase CDN URLs
        if (!imageUrl.includes('music.126.net')) {
          return send(res, 403, { ok: false, code: 'forbidden', error: 'Only NetEase CDN URLs are allowed' })
        }
        try {
          const { body, contentType, status } = await proxyCover(imageUrl)
          res.statusCode = status
          res.setHeader('content-type', contentType)
          res.setHeader('cache-control', 'public, max-age=3600')
          res.setHeader('content-length', body.length)
          return res.end(body)
        } catch (err) {
          if (err.status) {
            return send(res, err.status, { ok: false, code: 'proxy_error', error: err.message })
          }
          throw err
        }
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
