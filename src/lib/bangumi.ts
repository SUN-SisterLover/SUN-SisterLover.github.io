import { useCallback, useEffect, useRef, useState } from 'react'

/** Collection type: 1 想看, 2 看过, 3 在看, 4 搁置, 5 抛弃 */
export type BangumiCollectionType = 1 | 2 | 3 | 4 | 5

export type BangumiSubject = {
  id: number
  name: string
  nameCn: string
  image: string | null
  score: number
  date: string | null
}

export type BangumiCollection = {
  subject: BangumiSubject
  type: BangumiCollectionType
  rate: number
  epStatus: number
}

export type BangumiUser = {
  id: number
  username: string
  nickname: string
  avatar: string | null
}

export type BangumiStats = {
  doing: number
  collect: number
  wish: number
  meanScore: number
}

export type BangumiProfile = {
  user: BangumiUser | null
  collections: BangumiCollection[]
  stats: BangumiStats
}

type BangumiProxyPayload = BangumiProfile & {
  ok: true
  configured: true
  cached: boolean
  age: number
  fetchedAt: number
  ttl: number
}

type BangumiFailure = {
  ok: false
  code: string
  error: string
}

/**
 * Fetch the aggregated profile through the server-side proxy. The username
 * comes from the server's `.env` (BANGUMI_USERNAME); when none is configured
 * the proxy reports `configured: false` and we surface it as a
 * `not_configured` error.
 */
export async function fetchBangumiProfile(
  { apiBase = '/api/bangumi', signal }: {
    apiBase?: string
    signal?: AbortSignal
  } = {},
): Promise<BangumiProfile> {
  const url = new URL(`${apiBase.replace(/\/+$/, '')}/profile`, window.location.origin)

  const res = await fetch(url, { signal, headers: { accept: 'application/json' } })

  let body: BangumiProxyPayload | BangumiFailure | { ok: true; configured: false } | null = null
  try {
    body = (await res.json()) as BangumiProxyPayload | BangumiFailure | { ok: true; configured: false }
  } catch {
    throw new BangumiRequestError(`Bad response from the Bangumi proxy (${res.status})`, 'bad_response')
  }

  if (!res.ok || !body || body.ok !== true) {
    const failure = body as BangumiFailure | null
    throw new BangumiRequestError(
      failure?.error ?? `Bangumi proxy responded with ${res.status}`,
      failure?.code ?? 'request_failed',
    )
  }

  if (body.configured === false) {
    throw new BangumiRequestError('Bangumi identity is not configured on the server', 'not_configured')
  }

  return { user: body.user, collections: body.collections, stats: body.stats }
}

export class BangumiRequestError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'BangumiRequestError'
    this.code = code
  }
}

/** Failures that mean "there is no Bangumi proxy here" (static hosting). */
export const BANGUMI_SILENT_CODES = new Set(['bad_response', 'unknown_route'])

type UseBangumiOptions = {
  enabled?: boolean
  apiBase?: string
}

export type UseBangumiResult = {
  data: BangumiProfile | null
  error: BangumiRequestError | null
  /** true when the server has no identity configured (`.env` missing BANGUMI_USERNAME) */
  notConfigured: boolean
  loading: boolean
  refreshing: boolean
  refresh: () => void
}

/** Load a Bangumi profile and refresh on demand (data changes slowly). */
export function useBangumi(
  { enabled = true, apiBase }: UseBangumiOptions = {},
): UseBangumiResult {
  const [data, setData] = useState<BangumiProfile | null>(null)
  const [error, setError] = useState<BangumiRequestError | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(
    async () => {
      if (!enabled) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setRefreshing(true)
      try {
        const profile = await fetchBangumiProfile({
          apiBase,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setData(profile)
        setNotConfigured(false)
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof Error && err.name === 'AbortError') return
        if (err instanceof BangumiRequestError && err.code === 'not_configured') {
          setNotConfigured(true)
          setData(null)
          setError(null)
        } else {
          setNotConfigured(false)
          setError(
            err instanceof BangumiRequestError
              ? err
              : new BangumiRequestError(
                  err instanceof Error ? err.message : 'Bangumi request failed',
                  'network_error',
                ),
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setRefreshing(false)
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
    setLoading(true)
    void load()
    return () => abortRef.current?.abort()
  }, [enabled, load])

  const refresh = useCallback(() => void load(), [load])

  return { data, error, notConfigured, loading, refreshing, refresh }
}
