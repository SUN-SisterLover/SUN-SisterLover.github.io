import { useCallback, useEffect, useRef, useState } from 'react'

/** `personastate` values returned by ISteamUser/GetPlayerSummaries. */
export type SteamPersonaState =
  | 'offline'
  | 'online'
  | 'busy'
  | 'away'
  | 'snooze'
  | 'trade'
  | 'play'

export type SteamGame = {
  appId: number
  name: string
  totalMinutes: number
  twoWeeksMinutes: number
  lastPlayed: number | null
  icon: string | null
  capsule: string
}

export type SteamProfile = {
  steamId: string
  name: string
  realName: string | null
  avatar: string | null
  profileUrl: string
  state: number
  stateText: SteamPersonaState
  visibility: number
  isPrivate: boolean
  createdAt: number | null
  lastLogoff: number | null
  country: string | null
  level: number | null
  playing: { appId: number; name: string; icon: string | null; capsule: string } | null
}

export type SteamStats = {
  gameCount: number
  totalMinutes: number
  twoWeekMinutes: number
  recentCount: number
}

export type SteamPayload = {
  ok: true
  steamId: string
  cached: boolean
  age: number
  fetchedAt: number
  ttl: number
  profile: SteamProfile
  stats: SteamStats
  recent: SteamGame[]
  top: SteamGame[]
}

export type SteamFailure = {
  ok: false
  code: string
  error: string
}

/** Fetch the aggregated profile through the server-side proxy. */
export async function fetchSteamProfile(
  id: string,
  { apiBase = '/api/steam', refresh = false, signal }: {
    apiBase?: string
    refresh?: boolean
    signal?: AbortSignal
  } = {},
): Promise<SteamPayload> {
  const url = new URL(`${apiBase.replace(/\/+$/, '')}/profile`, window.location.origin)
  url.searchParams.set('id', id)
  if (refresh) url.searchParams.set('refresh', '1')

  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })

  let body: SteamPayload | SteamFailure | null = null
  try {
    body = (await res.json()) as SteamPayload | SteamFailure
  } catch {
    throw new SteamRequestError(`Bad response from the Steam proxy (${res.status})`, 'bad_response')
  }

  if (!res.ok || !body || body.ok !== true) {
    const failure = body as SteamFailure | null
    throw new SteamRequestError(
      failure?.error ?? `Steam proxy responded with ${res.status}`,
      failure?.code ?? 'request_failed',
    )
  }

  return body
}

export class SteamRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'SteamRequestError'
    this.code = code
  }
}

type UseSteamProfileOptions = {
  enabled?: boolean
  /** Poll interval in ms. The proxy caches upstream calls for 60s regardless. */
  intervalMs?: number
  apiBase?: string
}

export type UseSteamProfileResult = {
  data: SteamPayload | null
  error: SteamRequestError | null
  /** true only for the very first load, so the card can render a skeleton */
  loading: boolean
  /** true while a background poll or manual refresh is in flight */
  refreshing: boolean
  refresh: () => void
}

/**
 * Poll the Steam proxy for live profile + playtime data.
 *
 * Polling pauses while the tab is hidden and resumes (with an immediate fetch)
 * when it becomes visible again, so a backgrounded tab never burns API quota.
 */
export function useSteamProfile(
  id: string,
  { enabled = true, intervalMs = 60_000, apiBase }: UseSteamProfileOptions = {},
): UseSteamProfileResult {
  const [data, setData] = useState<SteamPayload | null>(null)
  const [error, setError] = useState<SteamRequestError | null>(null)
  const [loading, setLoading] = useState(enabled && Boolean(id))
  const [refreshing, setRefreshing] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const loadedRef = useRef(false)

  const load = useCallback(
    async (force: boolean) => {
      if (!enabled || !id) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setRefreshing(true)
      try {
        const payload = await fetchSteamProfile(id, {
          apiBase,
          refresh: force,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setData(payload)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === 'AbortError') return
        setError(
          err instanceof SteamRequestError
            ? err
            : new SteamRequestError(
                err instanceof Error ? err.message : 'Steam request failed',
                'network_error',
              ),
        )
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false)
          loadedRef.current = true
          setLoading(false)
        }
      }
    },
    [apiBase, enabled, id],
  )

  useEffect(() => {
    if (!enabled || !id) {
      setLoading(false)
      return
    }

    loadedRef.current = false
    setLoading(true)
    void load(false)

    const tick = () => {
      if (document.visibilityState === 'hidden') return
      void load(false)
    }
    const timer = window.setInterval(tick, Math.max(15_000, intervalMs))

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(false)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      abortRef.current?.abort()
    }
  }, [enabled, id, intervalMs, load])

  const refresh = useCallback(() => {
    void load(true)
  }, [load])

  return { data, error, loading, refreshing, refresh }
}

/** `1234` -> `20.6 h`, keeping short sessions readable in minutes. */
export function formatPlaytime(minutes: number, lang: 'zh' | 'en'): string {
  if (!minutes) return lang === 'zh' ? '未游玩' : 'never'
  if (minutes < 60) return `${minutes}${lang === 'zh' ? ' 分钟' : ' min'}`
  const hours = minutes / 60
  const value = hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10
  return `${value}${lang === 'zh' ? ' 小时' : ' h'}`
}

/** Relative "x minutes ago" label for the last-updated footer. */
export function formatAgo(timestampMs: number, lang: 'zh' | 'en'): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000))
  if (seconds < 10) return lang === 'zh' ? '刚刚' : 'just now'
  if (seconds < 60) return lang === 'zh' ? `${seconds} 秒前` : `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return lang === 'zh' ? `${minutes} 分钟前` : `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return lang === 'zh' ? `${hours} 小时前` : `${hours}h ago`
}
