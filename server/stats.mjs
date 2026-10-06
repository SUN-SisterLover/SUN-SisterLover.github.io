/**
 * Public visit counter for the homepage hero.
 *
 * Two numbers only: all-time page views and today's page views (Asia/Shanghai).
 * Counted client-side (`POST /api/stats/hit`) rather than per inbound request, so
 * crawlers and link prefetchers — which do not run JS — never inflate the count.
 *
 * For a full description see `docs/superpowers/specs/2026-10-05-visit-stats-design.md`.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CN_OFFSET_MS = 8 * 60 * 60 * 1000

/** How long hits are coalesced before the counters are written out. */
const FLUSH_DELAY_MS = 1500

/**
 * The calendar date in Asia/Shanghai as 'YYYY-MM-DD'.
 *
 * China has had no DST since 1991, so a fixed +08:00 offset is always correct
 * and avoids pulling in Intl/ICU. Do NOT use `new Date(ts).toISOString()` here —
 * that yields the UTC date, which is a day behind between 00:00 and 08:00 Beijing.
 */
export function cnDateKey(ts = Date.now()) {
  return new Date(ts + CN_OFFSET_MS).toISOString().slice(0, 10)
}

/** Coerce a value read back from disk into a sane non-negative integer. */
function toCount(value) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

/**
 * Read the persisted counters. A missing or unreadable file is not an error —
 * the site keeps working and the count simply starts over.
 *
 * Counters written on an earlier Beijing day are carried forward, but `today`
 * is dropped: it belongs to the day it was recorded on.
 */
function loadState(file, now) {
  const date = cnDateKey(now)
  if (!file) return { total: 0, today: 0, date }

  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[stats] ignoring unreadable stats file:', err.message)
    }
    return { total: 0, today: 0, date }
  }

  const total = toCount(raw?.total)
  return raw?.date === date ? { total, today: toCount(raw.today), date } : { total, today: 0, date }
}

/**
 * In-memory page-view counters, coalesced to disk.
 *
 * `now` is injectable so the day-rollover logic can be tested without waiting for
 * midnight. `file` may be null to keep the counters purely in memory;
 * `flushDelayMs <= 0` writes only when `flush()` is called explicitly.
 *
 * A failed write is never fatal: the in-memory count stays correct and the error
 * goes to `onError`, so the site keeps serving even if the data file is not writable.
 */
export function createStore({
  file = null,
  now = Date.now,
  flushDelayMs = FLUSH_DELAY_MS,
  onError = (err) => console.error('[stats] failed to persist counters:', err.message),
} = {}) {
  const state = loadState(file, now())

  let timer = null
  let dirty = false

  function summary() {
    const date = cnDateKey(now())
    return {
      total: state.total,
      // The process may have been running since before midnight, in which case the
      // stored day is stale and today's count is really zero.
      today: date === state.date ? state.today : 0,
      date,
    }
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
      writeFileSync(temp, `${JSON.stringify({ ...state, updatedAt: new Date(now()).toISOString() })}\n`)
      renameSync(temp, file)
      dirty = false
    } catch (err) {
      // Leave `dirty` set so a later flush retries once the cause is cleared.
      onError(err)
    }
  }

  function hit() {
    const date = cnDateKey(now())
    if (date !== state.date) {
      state.date = date
      state.today = 0
    }
    state.total += 1
    state.today += 1
    dirty = true

    if (file && flushDelayMs > 0 && !timer) {
      timer = setTimeout(() => {
        timer = null
        flush()
      }, flushDelayMs)
      // Never hold the process open just to write counters.
      timer.unref?.()
    }

    return summary()
  }

  return { hit, summary, flush }
}

/**
 * Runtime counters live outside `dist/` so a rebuild cannot wipe them, and are
 * resolved from this file rather than `process.cwd()` — PM2 does not guarantee cwd.
 */
const DEFAULT_FILE = fileURLToPath(new URL('../data/stats.json', import.meta.url))

/**
 * Connect/Express compatible middleware exposing the public visit counter.
 *
 * Mounted both by the Vite dev server (`vite.config.ts`) and by the production
 * Express server (`server.js`) so the same routes exist in every environment.
 *
 *   GET  /api/stats/health
 *   GET  /api/stats/summary
 *   POST /api/stats/hit
 *
 * Counting happens on `hit`, which the browser calls once per page load. Crawlers
 * and link prefetchers issue GETs (and do not run the SPA), so they never count.
 *
 * @param {{
 *   basePath?: string,
 *   file?: string | null,
 *   flushDelayMs?: number,
 *   persistOnExit?: boolean,
 * }} [options]
 */
export function statsApi(options = {}) {
  const basePath = options.basePath ?? '/api/stats'
  const store = createStore({
    file: options.file === undefined ? DEFAULT_FILE : options.file,
    flushDelayMs: options.flushDelayMs,
  })

  if (options.persistOnExit !== false) {
    // Counters normally sit in memory for up to `flushDelayMs`; make sure the last
    // window survives a shutdown. PM2 sends SIGINT for both `restart` and `stop`.
    const flush = () => store.flush()
    process.once('exit', flush)
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => {
        flush()
        process.exit(0)
      })
    }
  }

  return async function statsApiMiddleware(req, res, next) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(basePath)) return next()

    const route = url.pathname.slice(basePath.length).replace(/\/+$/, '') || '/'
    const isRead = req.method === 'GET' || req.method === 'HEAD'

    try {
      if (route === '/health' && isRead) {
        return send(res, 200, { ok: true, configured: true })
      }
      if (route === '/summary' && isRead) {
        return send(res, 200, { ok: true, ...store.summary() })
      }
      if (route === '/hit' && req.method === 'POST') {
        // The client sends no body; drain anything a proxy may have buffered.
        req.resume()
        return send(res, 200, { ok: true, ...store.hit() })
      }
      if (route === '/health' || route === '/summary' || route === '/hit') {
        return send(res, 405, { ok: false, code: 'method_not_allowed' })
      }
      return send(res, 404, { ok: false, code: 'unknown_route', error: 'Unknown route' })
    } catch (err) {
      console.error('[stats-api]', err)
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
