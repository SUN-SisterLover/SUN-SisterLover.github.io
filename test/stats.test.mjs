import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { cnDateKey, createStore, statsApi } from '../server/stats.mjs'

/** Noon in Beijing on the given day — far from any boundary, so the test reads clearly. */
const beijingNoon = (day) => Date.UTC(2026, 9, day, 4, 0, 0)

/**
 * A stats file in a throwaway directory. Pass `contents` to simulate a file left
 * behind by an earlier run; omit it to simulate a first-ever boot.
 */
function tempStatsFile(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'nagi-stats-'))
  const file = join(dir, 'stats.json')
  if (contents !== undefined) writeFileSync(file, JSON.stringify(contents))
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** `flushDelayMs: 0` disables the debounce so tests never leave a timer behind. */
const storeAt = (file, ts) => createStore({ file, now: () => ts, flushDelayMs: 0 })

test('cnDateKey reports the Beijing date, not the UTC date', () => {
  // 2026-10-04T16:00:01Z is already 2026-10-05 00:00:01 in Beijing (+08:00).
  assert.equal(cnDateKey(Date.UTC(2026, 9, 4, 16, 0, 1)), '2026-10-05')
  // One second earlier is still 2026-10-04 in Beijing.
  assert.equal(cnDateKey(Date.UTC(2026, 9, 4, 15, 59, 59)), '2026-10-04')
})

test('a first-ever boot starts from zero', () => {
  const t = tempStatsFile()
  try {
    assert.deepEqual(storeAt(t.file, beijingNoon(5)).summary(), {
      total: 0,
      today: 0,
      date: '2026-10-05',
    })
  } finally {
    t.cleanup()
  }
})

test('hit increments both the all-time and today counts', () => {
  const t = tempStatsFile()
  try {
    const store = storeAt(t.file, beijingNoon(5))
    store.hit()
    store.hit()
    assert.deepEqual(store.summary(), { total: 2, today: 2, date: '2026-10-05' })
  } finally {
    t.cleanup()
  }
})

test('hit rolls today over when the Beijing date has advanced', () => {
  const t = tempStatsFile({ total: 10, today: 5, date: '2026-10-04' })
  try {
    assert.deepEqual(storeAt(t.file, beijingNoon(5)).hit(), {
      total: 11,
      today: 1,
      date: '2026-10-05',
    })
  } finally {
    t.cleanup()
  }
})

test('summary reports zero for today once the date has advanced, even with no hit', () => {
  const t = tempStatsFile({ total: 10, today: 5, date: '2026-10-04' })
  try {
    assert.deepEqual(storeAt(t.file, beijingNoon(5)).summary(), {
      total: 10,
      today: 0,
      date: '2026-10-05',
    })
  } finally {
    t.cleanup()
  }
})

test('a long-running process zeroes today when it crosses Beijing midnight', () => {
  const t = tempStatsFile()
  try {
    let ts = Date.UTC(2026, 9, 4, 15, 0, 0) // 2026-10-04 23:00 Beijing
    const store = createStore({ file: t.file, now: () => ts, flushDelayMs: 0 })
    store.hit()
    assert.equal(store.summary().today, 1)
    ts = Date.UTC(2026, 9, 4, 16, 0, 0) // 2026-10-05 00:00 Beijing
    assert.deepEqual(store.summary(), { total: 1, today: 0, date: '2026-10-05' })
  } finally {
    t.cleanup()
  }
})

test('a corrupt stats file is treated as empty rather than thrown', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nagi-stats-'))
  const file = join(dir, 'stats.json')
  writeFileSync(file, '{ not json')
  try {
    assert.deepEqual(storeAt(file, beijingNoon(5)).summary(), {
      total: 0,
      today: 0,
      date: '2026-10-05',
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('flush persists the counters and a later boot recovers them', () => {
  const t = tempStatsFile()
  try {
    const store = storeAt(t.file, beijingNoon(5))
    store.hit()
    store.hit()
    store.flush()
    assert.deepEqual(storeAt(t.file, beijingNoon(5)).summary(), {
      total: 2,
      today: 2,
      date: '2026-10-05',
    })
  } finally {
    t.cleanup()
  }
})

test('a recovered count keeps rolling today over on the next day', () => {
  const t = tempStatsFile()
  try {
    const store = storeAt(t.file, beijingNoon(5))
    store.hit()
    store.flush()
    assert.deepEqual(storeAt(t.file, beijingNoon(6)).summary(), {
      total: 1,
      today: 0,
      date: '2026-10-06',
    })
  } finally {
    t.cleanup()
  }
})

test('hits reach disk on their own once the debounce elapses', async () => {
  const t = tempStatsFile()
  try {
    const store = createStore({
      file: t.file,
      now: () => beijingNoon(5),
      flushDelayMs: 10,
    })
    store.hit()
    await delay(150)
    assert.equal(JSON.parse(readFileSync(t.file, 'utf8')).total, 1)
  } finally {
    t.cleanup()
  }
})

test('flush writes nothing when no hit has been recorded', () => {
  const t = tempStatsFile()
  try {
    storeAt(t.file, beijingNoon(5)).flush()
    assert.equal(existsSync(t.file), false)
  } finally {
    t.cleanup()
  }
})

/** Enough of ServerResponse for the middleware, which only sets headers and ends. */
function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(payload) {
      this.body = JSON.parse(payload)
    },
  }
}

async function request(middleware, method, url) {
  const res = mockRes()
  let nextCalled = false
  await middleware({ method, url, resume() {} }, res, () => {
    nextCalled = true
  })
  return { res, nextCalled }
}

/**
 * `persistOnExit: false` keeps these tests from adding process signal handlers, and
 * `flushDelayMs: 0` keeps a pending write from firing after the temp dir is removed.
 */
const statsMiddleware = (file) => statsApi({ file, persistOnExit: false, flushDelayMs: 0 })

test('GET summary reports the counters', async () => {
  const t = tempStatsFile()
  try {
    const { res } = await request(statsMiddleware(t.file), 'GET', '/api/stats/summary')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.ok, true)
    assert.equal(res.body.total, 0)
    assert.equal(res.body.today, 0)
  } finally {
    t.cleanup()
  }
})

test('POST hit counts a view and returns the updated counters', async () => {
  const t = tempStatsFile()
  try {
    const middleware = statsMiddleware(t.file)
    await request(middleware, 'POST', '/api/stats/hit')
    const { res } = await request(middleware, 'POST', '/api/stats/hit')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.ok, true)
    assert.equal(res.body.total, 2)
    assert.equal(res.body.today, 2)
  } finally {
    t.cleanup()
  }
})

test('GET on the hit route is rejected rather than counted', async () => {
  const t = tempStatsFile()
  try {
    const middleware = statsMiddleware(t.file)
    const { res } = await request(middleware, 'GET', '/api/stats/hit')
    assert.equal(res.statusCode, 405)
    assert.equal(res.body.code, 'method_not_allowed')
    // A prefetch or crawler must not have moved the counter.
    const summary = await request(middleware, 'GET', '/api/stats/summary')
    assert.equal(summary.res.body.total, 0)
  } finally {
    t.cleanup()
  }
})

test('POST on a read-only route is rejected', async () => {
  const t = tempStatsFile()
  try {
    const { res } = await request(statsMiddleware(t.file), 'POST', '/api/stats/summary')
    assert.equal(res.statusCode, 405)
    assert.equal(res.body.code, 'method_not_allowed')
  } finally {
    t.cleanup()
  }
})

test('an unknown route reports unknown_route', async () => {
  const t = tempStatsFile()
  try {
    const { res } = await request(statsMiddleware(t.file), 'GET', '/api/stats/nope')
    assert.equal(res.statusCode, 404)
    assert.equal(res.body.code, 'unknown_route')
  } finally {
    t.cleanup()
  }
})

test('a request outside the basePath is passed on to the next handler', async () => {
  const t = tempStatsFile()
  try {
    const { nextCalled } = await request(statsMiddleware(t.file), 'GET', '/api/bilibili/profile')
    assert.equal(nextCalled, true)
  } finally {
    t.cleanup()
  }
})

test('counters are never cached by the browser or a proxy', async () => {
  const t = tempStatsFile()
  try {
    const { res } = await request(statsMiddleware(t.file), 'GET', '/api/stats/summary')
    assert.equal(res.headers['cache-control'], 'no-store')
  } finally {
    t.cleanup()
  }
})

test('a write failure keeps the in-memory count and reports the error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nagi-stats-'))
  // The parent path is a regular file, so creating the directory must fail.
  const blocker = join(dir, 'blocker')
  writeFileSync(blocker, 'x')
  const errors = []
  try {
    const store = createStore({
      file: join(blocker, 'stats.json'),
      now: () => beijingNoon(5),
      flushDelayMs: 0,
      onError: (err) => errors.push(err),
    })
    store.hit()
    store.flush()
    assert.deepEqual(store.summary(), { total: 1, today: 1, date: '2026-10-05' })
    assert.equal(errors.length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
