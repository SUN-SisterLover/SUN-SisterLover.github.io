/**
 * Performance monitoring helpers.
 *
 * All hooks degrade gracefully: unsupported browsers get `null` / empty data
 * instead of throwing, and every observer is wrapped in try/catch because
 * entry types like `layout-shift` / `longtask` are Chromium-only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* ------------------------------------------------------------------ */
/* formatters                                                          */
/* ------------------------------------------------------------------ */

export function fmtMs(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`
  return `${v.toFixed(digits)} ms`
}

export function fmtBytes(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / 1024 / 1024).toFixed(2)} MB`
}

/* ------------------------------------------------------------------ */
/* frame stats (FPS / frame time / jank)                               */
/* ------------------------------------------------------------------ */

export type FrameStats = {
  /** fps of the most recent sampling window */
  fps: number
  /** mean fps across the kept history */
  avgFps: number
  /** worst sampled fps since reset */
  minFps: number
  /** duration of the latest frame */
  lastFrameMs: number
  /** longest frame since reset */
  maxFrameMs: number
  /** frames slower than 50ms (a visible stutter) */
  jankFrames: number
  totalFrames: number
  /** rolling fps samples, oldest first */
  history: number[]
}

const EMPTY_FRAME_STATS: FrameStats = {
  fps: 0,
  avgFps: 0,
  minFps: 0,
  lastFrameMs: 0,
  maxFrameMs: 0,
  jankFrames: 0,
  totalFrames: 0,
  history: [],
}

const SAMPLE_WINDOW_MS = 250
const JANK_FRAME_MS = 50

/**
 * Samples requestAnimationFrame every 250ms and derives fps / frame-time
 * statistics. The rAF loop only runs while `enabled` is true.
 */
export function useFrameStats(enabled: boolean, historySize = 96) {
  const [stats, setStats] = useState<FrameStats>(EMPTY_FRAME_STATS)
  const agg = useRef({ minFps: Infinity, maxFrameMs: 0, jank: 0, total: 0, history: [] as number[] })

  const reset = useCallback(() => {
    agg.current = { minFps: Infinity, maxFrameMs: 0, jank: 0, total: 0, history: [] }
    setStats(EMPTY_FRAME_STATS)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let alive = true
    let windowStart = performance.now()
    let windowFrames = 0
    let last = windowStart

    const tick = (now: number) => {
      const dt = now - last
      last = now

      const g = agg.current
      g.total += 1
      if (dt > g.maxFrameMs) g.maxFrameMs = dt
      if (dt > JANK_FRAME_MS) g.jank += 1
      windowFrames += 1

      const elapsed = now - windowStart
      if (elapsed >= SAMPLE_WINDOW_MS) {
        const fps = Math.round((windowFrames * 1000) / elapsed)
        if (fps < g.minFps) g.minFps = fps
        g.history = [...g.history, fps].slice(-historySize)
        const avg = g.history.reduce((a, b) => a + b, 0) / g.history.length

        if (alive) {
          setStats({
            fps,
            avgFps: Math.round(avg),
            minFps: g.minFps === Infinity ? 0 : g.minFps,
            lastFrameMs: dt,
            maxFrameMs: g.maxFrameMs,
            jankFrames: g.jank,
            totalFrames: g.total,
            history: g.history,
          })
        }
        windowFrames = 0
        windowStart = now
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [enabled, historySize])

  return { stats, reset }
}

/* ------------------------------------------------------------------ */
/* JS heap                                                             */
/* ------------------------------------------------------------------ */

export type MemoryStats = { used: number; total: number; limit: number }

type PerfWithMemory = Performance & {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
}

/** Chromium-only `performance.memory`; `supported` is false elsewhere. */
export function useMemoryStats(enabled: boolean, intervalMs = 1000) {
  const supported = typeof performance !== 'undefined' && 'memory' in performance
  const [memory, setMemory] = useState<MemoryStats | null>(null)

  useEffect(() => {
    if (!enabled || !supported) return
    const read = () => {
      const m = (performance as PerfWithMemory).memory
      if (!m) return
      setMemory({ used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit })
    }
    read()
    const id = window.setInterval(read, intervalMs)
    return () => window.clearInterval(id)
  }, [enabled, supported, intervalMs])

  return { memory, supported }
}

/* ------------------------------------------------------------------ */
/* navigation timing                                                   */
/* ------------------------------------------------------------------ */

export type NavPhase = { key: string; label: { zh: string; en: string }; start: number; ms: number }
export type NavTiming = {
  phases: NavPhase[]
  total: number
  navType: string
  transferSize: number
}

const PHASE_LABELS: Record<string, { zh: string; en: string }> = {
  redirect: { zh: '重定向', en: 'Redirect' },
  dns: { zh: 'DNS 查询', en: 'DNS' },
  tcp: { zh: 'TCP 握手', en: 'TCP' },
  tls: { zh: 'TLS 协商', en: 'TLS' },
  ttfb: { zh: '首字节 (TTFB)', en: 'TTFB' },
  download: { zh: '文档下载', en: 'Download' },
  parse: { zh: 'DOM 解析', en: 'DOM Parse' },
  dcl: { zh: 'DOMContentLoaded', en: 'DOMContentLoaded' },
  load: { zh: 'Load 事件', en: 'Load Event' },
}

function readNavigation(): NavTiming | null {
  if (typeof performance === 'undefined') return null
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (!nav) return null

  const span = (key: string, from: number, to: number, start: number): NavPhase => ({
    key,
    label: PHASE_LABELS[key],
    start,
    ms: Math.max(0, to - from),
  })

  const phases: NavPhase[] = [
    span('redirect', nav.redirectStart, nav.redirectEnd, nav.redirectStart),
    span('dns', nav.domainLookupStart, nav.domainLookupEnd, nav.domainLookupStart),
    span('tcp', nav.connectStart, nav.connectEnd, nav.connectStart),
    span(
      'tls',
      nav.secureConnectionStart || nav.connectEnd,
      nav.connectEnd,
      nav.secureConnectionStart || nav.connectEnd,
    ),
    span('ttfb', nav.requestStart, nav.responseStart, nav.requestStart),
    span('download', nav.responseStart, nav.responseEnd, nav.responseStart),
    span('parse', nav.responseEnd, nav.domInteractive, nav.responseEnd),
    span('dcl', nav.domContentLoadedEventStart, nav.domContentLoadedEventEnd, nav.domContentLoadedEventStart),
    span('load', nav.loadEventStart, nav.loadEventEnd, nav.loadEventStart),
  ]

  const total = nav.loadEventEnd > 0 ? nav.loadEventEnd : nav.domContentLoadedEventEnd || nav.duration

  return {
    phases,
    total,
    navType: nav.type,
    transferSize: nav.transferSize,
  }
}

/** Navigation Timing L2 breakdown; re-read once `load` fires. */
export function useNavigationTiming(): NavTiming | null {
  const [nav, setNav] = useState<NavTiming | null>(() => readNavigation())

  useEffect(() => {
    if (document.readyState === 'complete') {
      setNav(readNavigation())
      return
    }
    const onLoad = () => window.setTimeout(() => setNav(readNavigation()), 0)
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return nav
}

/* ------------------------------------------------------------------ */
/* web vitals                                                          */
/* ------------------------------------------------------------------ */

export type Vitals = {
  fcp: number | null
  lcp: number | null
  cls: number | null
  inp: number | null
  ttfb: number | null
  longTasks: number
  blockingMs: number
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
}

interface EventTimingEntry extends PerformanceEntry {
  duration: number
  interactionId?: number
}

function safeObserve(
  type: string,
  cb: (entries: PerformanceEntryList) => void,
  extra: PerformanceObserverInit = {},
): PerformanceObserver | null {
  if (typeof PerformanceObserver === 'undefined') return null
  try {
    const po = new PerformanceObserver((list) => cb(list.getEntries()))
    po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
    return po
  } catch {
    return null
  }
}

/**
 * Live Core Web Vitals (FCP / LCP / CLS / INP / TTFB) plus long-task
 * accounting. Values keep updating as the page is used.
 */
export function useWebVitals(): Vitals {
  const [vitals, setVitals] = useState<Vitals>({
    fcp: null,
    lcp: null,
    cls: null,
    inp: null,
    ttfb: null,
    longTasks: 0,
    blockingMs: 0,
  })

  useEffect(() => {
    const observers: (PerformanceObserver | null)[] = []
    let cls = 0
    let inp = 0
    let longTasks = 0
    let blocking = 0

    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav) {
      setVitals((v) => ({ ...v, ttfb: Math.max(0, nav.responseStart - nav.startTime) }))
    }

    observers.push(
      safeObserve('paint', (entries) => {
        const fcp = entries.find((e) => e.name === 'first-contentful-paint')
        if (fcp) setVitals((v) => ({ ...v, fcp: fcp.startTime }))
      }),
    )

    observers.push(
      safeObserve('largest-contentful-paint', (entries) => {
        const last = entries[entries.length - 1]
        if (last) setVitals((v) => ({ ...v, lcp: last.startTime }))
      }),
    )

    observers.push(
      safeObserve('layout-shift', (entries) => {
        for (const e of entries as LayoutShiftEntry[]) {
          if (!e.hadRecentInput) cls += e.value
        }
        setVitals((v) => ({ ...v, cls }))
      }),
    )

    observers.push(
      safeObserve(
        'event',
        (entries) => {
          for (const e of entries as EventTimingEntry[]) {
            if (e.duration > inp) inp = e.duration
          }
          setVitals((v) => ({ ...v, inp }))
        },
        { durationThreshold: 16 } as PerformanceObserverInit,
      ),
    )

    observers.push(
      safeObserve('longtask', (entries) => {
        for (const e of entries) {
          longTasks += 1
          blocking += Math.max(0, e.duration - 50)
        }
        setVitals((v) => ({ ...v, longTasks, blockingMs: blocking }))
      }),
    )

    return () => observers.forEach((o) => o?.disconnect())
  }, [])

  return vitals
}

export type VitalRating = 'good' | 'ni' | 'poor' | 'na'

const VITAL_THRESHOLDS: Record<string, [number, number]> = {
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  inp: [200, 500],
  ttfb: [800, 1800],
}

export function rateVital(key: string, value: number | null): VitalRating {
  if (value == null || !Number.isFinite(value)) return 'na'
  const t = VITAL_THRESHOLDS[key]
  if (!t) return 'na'
  if (value <= t[0]) return 'good'
  if (value <= t[1]) return 'ni'
  return 'poor'
}

/* ------------------------------------------------------------------ */
/* resource timing                                                     */
/* ------------------------------------------------------------------ */

export type ResourceGroup = {
  type: string
  count: number
  transfer: number
  decoded: number
  slowest: number
}

function readResources(): ResourceGroup[] {
  if (typeof performance === 'undefined') return []
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const map = new Map<string, ResourceGroup>()
  for (const e of entries) {
    const type = e.initiatorType || 'other'
    const g = map.get(type) ?? { type, count: 0, transfer: 0, decoded: 0, slowest: 0 }
    g.count += 1
    g.transfer += e.transferSize || 0
    g.decoded += e.decodedBodySize || 0
    g.slowest = Math.max(g.slowest, e.duration)
    map.set(type, g)
  }
  return [...map.values()].sort((a, b) => b.transfer - a.transfer || b.count - a.count)
}

/** Resource Timing summary grouped by initiator type. */
export function useResourceStats() {
  const [groups, setGroups] = useState<ResourceGroup[]>(() => readResources())
  const refresh = useCallback(() => setGroups(readResources()), [])

  useEffect(() => {
    const po = safeObserve('resource', () => setGroups(readResources()))
    return () => po?.disconnect()
  }, [])

  const total = useMemo<ResourceGroup>(
    () =>
      groups.reduce<ResourceGroup>(
        (acc, g) => ({
          type: 'total',
          count: acc.count + g.count,
          transfer: acc.transfer + g.transfer,
          decoded: acc.decoded + g.decoded,
          slowest: Math.max(acc.slowest, g.slowest),
        }),
        { type: 'total', count: 0, transfer: 0, decoded: 0, slowest: 0 },
      ),
    [groups],
  )

  return { groups, total, refresh }
}

/* ------------------------------------------------------------------ */
/* device info                                                         */
/* ------------------------------------------------------------------ */

export type DeviceInfo = {
  cores: number | null
  deviceMemoryGb: number | null
  dpr: number
  viewport: string
  connection: string | null
}

export function useDeviceInfo(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(() => readDevice())
  useEffect(() => {
    const onResize = () => setInfo(readDevice())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return info
}

type NavWithExtras = Navigator & {
  deviceMemory?: number
  connection?: { effectiveType?: string; downlink?: number }
}

function readDevice(): DeviceInfo {
  const n = navigator as NavWithExtras
  const conn = n.connection
  return {
    cores: n.hardwareConcurrency ?? null,
    deviceMemoryGb: n.deviceMemory ?? null,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    connection: conn?.effectiveType
      ? `${conn.effectiveType}${conn.downlink ? ` · ${conn.downlink}Mbps` : ''}`
      : null,
  }
}

/** Blocks the main thread for `ms` — used by the stress test. */
export function blockMainThread(ms: number): void {
  const end = performance.now() + ms
  // eslint-disable-next-line no-empty
  while (performance.now() < end) {
    /* busy wait */
  }
}
