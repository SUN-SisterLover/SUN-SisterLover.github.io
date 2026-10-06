import { useCallback, useEffect, useRef, useState } from 'react'

/** A single recent upload, proxied from the WBI-signed space search. */
export type BiliVideo = {
  bvid: string
  title: string
  cover: string | null
  play: number
  duration: string
  created: number | null
  url: string
}

export type BiliUser = {
  uid: string
  name: string
  avatar: string | null
  sign: string
  followers: number
  following: number
  videoCount: number
  level: number | null
  spaceUrl: string
}

export type BiliPayload = {
  ok: true
  configured: true
  uid: string
  cached: boolean
  age: number
  fetchedAt: number
  ttl: number
  user: BiliUser
  recent: BiliVideo[]
  /** false when the server has no BILI_COOKIE, so the card hides the list */
  recentAvailable: boolean
}

export type BiliFailure = {
  ok: false
  code: string
  error: string
}

/**
 * Fetch the aggregated profile through the server-side proxy. The UID comes
 * from the server's `.env` (BILI_UID); when none is configured the proxy
 * reports `configured: false` and we surface it as a `not_configured` error.
 */
export async function fetchBiliProfile(
  { apiBase = '/api/bilibili', signal }: {
    apiBase?: string
    signal?: AbortSignal
  } = {},
): Promise<BiliPayload> {
  const url = new URL(`${apiBase.replace(/\/+$/, '')}/profile`, window.location.origin)

  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })

  let body: BiliPayload | BiliFailure | { ok: true; configured: false } | null = null
  try {
    body = (await res.json()) as BiliPayload | BiliFailure | { ok: true; configured: false }
  } catch {
    throw new BiliRequestError(`Bad response from the Bilibili proxy (${res.status})`, 'bad_response')
  }

  if (!res.ok || !body || body.ok !== true) {
    const failure = body as BiliFailure | null
    throw new BiliRequestError(
      failure?.error ?? `Bilibili proxy responded with ${res.status}`,
      failure?.code ?? 'request_failed',
    )
  }

  if (body.configured === false) {
    throw new BiliRequestError('Bilibili identity is not configured on the server', 'not_configured')
  }

  return body
}

export class BiliRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'BiliRequestError'
    this.code = code
  }
}

/** Failures that mean "there is no Bilibili proxy here" (static hosting). */
export const BILI_SILENT_CODES = new Set(['bad_response', 'unknown_route'])

type UseBiliProfileOptions = {
  enabled?: boolean
  /** Poll interval in ms. The proxy caches upstream for 120s regardless. */
  intervalMs?: number
  apiBase?: string
}

export type UseBiliProfileResult = {
  data: BiliPayload | null
  error: BiliRequestError | null
  /** true when the server has no identity configured (`.env` missing BILI_UID) */
  notConfigured: boolean
  /** true only for the very first load, so the card can render a skeleton */
  loading: boolean
  /** true while a background poll or manual refresh is in flight */
  refreshing: boolean
  refresh: () => void
}

/**
 * Poll the Bilibili proxy for live profile data. Polling pauses while the tab
 * is hidden, so a backgrounded tab never burns quota.
 */
export function useBiliProfile(
  { enabled = true, intervalMs = 120_000, apiBase }: UseBiliProfileOptions = {},
): UseBiliProfileResult {
  const [data, setData] = useState<BiliPayload | null>(null)
  const [error, setError] = useState<BiliRequestError | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const loadedRef = useRef(false)

  const load = useCallback(
    async () => {
      if (!enabled) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setRefreshing(true)
      try {
        const payload = await fetchBiliProfile({
          apiBase,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setData(payload)
        setNotConfigured(false)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === 'AbortError') return
        if (err instanceof BiliRequestError && err.code === 'not_configured') {
          setNotConfigured(true)
          setData(null)
          setError(null)
        } else {
          setNotConfigured(false)
          setError(
            err instanceof BiliRequestError
              ? err
              : new BiliRequestError(
                  err instanceof Error ? err.message : 'Bilibili request failed',
                  'network_error',
                ),
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false)
          loadedRef.current = true
          setLoading(false)
        }
      }
    },
    [apiBase, enabled],
  )

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    loadedRef.current = false
    setLoading(true)
    void load()

    const tick = () => {
      if (document.visibilityState === 'hidden') return
      void load()
    }
    const timer = window.setInterval(tick, Math.max(30_000, intervalMs))

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      abortRef.current?.abort()
    }
  }, [enabled, intervalMs, load])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { data, error, notConfigured, loading, refreshing, refresh }
}

/** Compact number formatting for follower/play counts: 1.4 万 / 1.4K. */
export function formatCount(n: number, lang: 'zh' | 'en'): string {
  if (lang === 'zh') {
    if (n >= 100_000_000) return `${trim(n / 100_000_000)} 亿`
    if (n >= 10_000) return `${trim(n / 10_000)} 万`
    return String(n)
  }
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`
  if (n >= 1_000) return `${trim(n / 1_000)}K`
  return String(n)
}

/** `12345` -> `12,345` */
export function formatInteger(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function trim(v: number): string {
  return v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)
}
